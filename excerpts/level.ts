// The only module allowed to reason about the WTN-shaped level scale.
// The scale is INVERTED: 40.0 = beginner, 1.0 = elite. Raw numeric comparisons
// on levels are banned outside this file.
//
// No imports at all, deliberately: client components render levels, so pulling
// @/db in here would drag the postgres driver into the browser bundle. The half
// of the doctrine that has to run in SQL lives in src/lib/levelSql.ts as
// displayLevelSql, the twin of displayLevel below. Change one, change the other.
//
// Writing a level is somebody else's job. src/lib/levelChange.ts is the one door
// for that, and it owns the freezes and the ledger.

export const LEVEL_WEAKEST = 40.0;
export const LEVEL_STRONGEST = 1.0;

/** Maximum level movement per confirmed result. */
export const MAX_DELTA_PER_RESULT = 0.2;

/** Default half-width of a request's level band. */
export const DEFAULT_BAND_HALF_WIDTH = 3.0;

export type Confidence = "provisional" | "developing" | "established" | "verified";

export function clampLevel(level: number): number {
  const clamped = Math.min(LEVEL_WEAKEST, Math.max(LEVEL_STRONGEST, level));
  return Math.round(clamped * 10) / 10;
}

/** a is a stronger player than b. */
export function isStrongerThan(a: number, b: number): boolean {
  return a < b;
}

/**
 * Band around a level: returns { min, max } as stored on match_requests, where
 * min is the STRONGER (numerically lower) bound.
 */
export function bandAround(level: number, halfWidth: number = DEFAULT_BAND_HALF_WIDTH) {
  return {
    min: clampLevel(level - halfWidth),
    max: clampLevel(level + halfWidth),
  };
}

/**
 * Raw movement on the scale, old → new. Negative means the player improved,
 * because the scale is inverted. Use movementDirection for the human reading.
 */
export function levelDelta(oldLevel: number, newLevel: number): number {
  return Math.round((newLevel - oldLevel) * 10) / 10;
}

export type MovementDirection = "improved" | "declined" | "flat";

/** How a level change reads to a player. Lower is better, so down = improved. */
export function movementDirection(oldLevel: number, newLevel: number): MovementDirection {
  const delta = levelDelta(oldLevel, newLevel);
  if (delta < 0) return "improved";
  if (delta > 0) return "declined";
  return "flat";
}

/**
 * Elo-lite movement for a confirmed singles result.
 *
 * Expectation from the level gap: a player 4.0 levels stronger is expected to
 * win ~90% of the time. Movement = K * (actual - expected), with K =
 * MAX_DELTA_PER_RESULT, so a fully surprising result pays the cap. Winner
 * improves (level goes DOWN), loser's level goes up, symmetric.
 *
 * The scale stores one decimal, so the reachable magnitudes are 0.0, 0.1 and
 * 0.2 and nothing finer. K used to be twice the cap, which flattened everything
 * inside a 1.8-level gap onto the same 0.2: a coin-flip and a 20-level upset
 * moved a player identically. On this grid the shape is 0.1 for an ordinary
 * result, 0.2 for an upset of ~3.8 levels or more, 0.0 when the favourite was
 * that far ahead and duly won.
 */
export function resultDeltas(
  winnerLevel: number,
  loserLevel: number,
): { winnerDelta: number; loserDelta: number } {
  const gap = loserLevel - winnerLevel; // positive when the stronger player won
  const expectedWin = 1 / (1 + Math.pow(10, -gap / 8));
  const surprise = 1 - expectedWin; // 0.5 for equal players, → 1 for a big upset
  const magnitude = Math.round(MAX_DELTA_PER_RESULT * surprise * 10) / 10;
  // Belt on the cap: the K above cannot exceed it, and it must stay that way.
  const capped = Math.min(MAX_DELTA_PER_RESULT, magnitude);
  return { winnerDelta: -capped, loserDelta: capped };
}

/** Apply a delta, clamped to the scale. */
export function applyDelta(level: number, delta: number): number {
  return clampLevel(level + delta);
}

/** Confidence from state: WTN verification wins, else confirmed-result count. */
export function deriveConfidence(confirmedResultCount: number, wtnVerified: boolean): Confidence {
  if (wtnVerified) return "verified";
  if (confirmedResultCount >= 5) return "established";
  if (confirmedResultCount >= 1) return "developing";
  return "provisional";
}

/**
 * Display level: WTN when verified, internal level otherwise. The SQL twin of
 * this rule is `displayLevelSql` in levelSql.ts — it lives there because this
 * module is imported by client components and must not reach for the database.
 */
export function displayLevel(user: {
  level: string | number | null;
  wtn: string | number | null;
  levelConfidence: Confidence;
}): number | null {
  if (user.levelConfidence === "verified" && user.wtn != null) return Number(user.wtn);
  return user.level != null ? Number(user.level) : null;
}

/** Format a level for display, always one decimal. */
export function formatLevel(level: number | null | undefined): string {
  if (level == null) return "–";
  return level.toFixed(1);
}

/** Format a delta as shown after a result, e.g. "18.4 → 18.1". */
export function formatLevelChange(oldLevel: number, newLevel: number): string {
  return `${formatLevel(oldLevel)} → ${formatLevel(newLevel)}`;
}

// ---------------------------------------------------------------------------
// Questionnaire scoring (F-10). Versioned; answers stored raw in
// questionnaire_responses so the mapping can be recalibrated later.
// ---------------------------------------------------------------------------

export interface QuestionnaireAnswers {
  version: 1;
  yearsPlayed: "lt1" | "1to3" | "3to10" | "gt10";
  frequency: "rarely" | "monthly" | "weekly" | "several_weekly";
  rallyLength: "lt4" | "4to10" | "10to20" | "gt20";
  serveConsistency: "learning" | "second_in" | "reliable" | "weapon";
  competesClubTeam: boolean;
  playedTournaments: boolean;
}

/**
 * Map answers to a provisional level. Anchors: a brand-new adult beginner
 * lands ~36; a solid club-team player ~18; the scale's elite end is not
 * reachable by questionnaire — results have to earn it.
 */
export function scoreQuestionnaire(a: QuestionnaireAnswers): number {
  let score = 38; // floor: never played

  const yearsPoints = { lt1: 0, "1to3": 3, "3to10": 6, gt10: 8 } as const;
  const freqPoints = { rarely: 0, monthly: 1, weekly: 3, several_weekly: 4 } as const;
  const rallyPoints = { lt4: 0, "4to10": 4, "10to20": 8, gt20: 11 } as const;
  const servePoints = { learning: 0, second_in: 2, reliable: 4, weapon: 6 } as const;

  score -= yearsPoints[a.yearsPlayed];
  score -= freqPoints[a.frequency];
  score -= rallyPoints[a.rallyLength];
  score -= servePoints[a.serveConsistency];
  if (a.competesClubTeam) score -= 4;
  if (a.playedTournaments) score -= 2;

  return clampLevel(Math.max(score, 14)); // questionnaire floor: 14.0
}
