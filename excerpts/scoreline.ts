// Scoreline: the one owner of "whose games come first" in a stored score.
//
// results.score is [{a, b}] per set. Side A is the submitter for mutual
// results, and bracket participant A for referee results (the organizer
// submitted but did not play side A). That invariant used to be re-derived at
// every read site — five implementations, four mutually inconsistent, two of
// them shipped bugs (standings, result emails). It now lives here and only
// here. If you are about to compare a viewer with submittedBy anywhere else,
// call this module instead.
//
// Reading finished matches out of the database is a different job: use
// confirmedResultsFor in src/lib/resultsQuery.ts, which resolves side A for
// both tournament and americano rows before handing them to this module.

export interface SetScore {
  a: number;
  b: number;
}

export interface StoredScore {
  score: SetScore[];
  submittedBy: string;
  /** null = legacy row, treated as mutual. */
  confirmationMode: "mutual" | "referee" | "auto" | "official" | null;
  /** The user on stored side A when confirmationMode is "referee". Resolved
   *  from tournament_matches.participant_a_id by the caller's query. */
  sideAUserId?: string | null;
  /** Doubles side A as a team (americano: team_a1/a2). When set, a viewer on
   *  this list is side A; takes precedence over sideAUserId. */
  sideAUserIds?: string[] | null;
}

export interface Scoreline {
  /** Sets oriented so the viewer's games come first. */
  sets: SetScore[];
  /** "6-4, 3-6, 10-7", viewer first. */
  text: string;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
}

/** Core orientation: flip the stored sets so "for" belongs to the chosen side. */
export function orientScore(score: SetScore[], viewerIsSideA: boolean): Scoreline {
  const sets = viewerIsSideA ? score.map((s) => ({ ...s })) : score.map((s) => ({ a: s.b, b: s.a }));
  return {
    sets,
    text: sets.map((s) => `${s.a}-${s.b}`).join(", "),
    setsFor: sets.filter((s) => s.a > s.b).length,
    setsAgainst: sets.filter((s) => s.b > s.a).length,
    gamesFor: sets.reduce((n, s) => n + s.a, 0),
    gamesAgainst: sets.reduce((n, s) => n + s.b, 0),
  };
}

/** Which user's games are stored first. */
export function sideAUserOf(result: StoredScore): string {
  if (result.confirmationMode === "referee" && result.sideAUserId) return result.sideAUserId;
  return result.submittedBy;
}

/** Is this viewer on stored side A? Team side A (doubles) wins over the
 *  single-user resolution. */
export function viewerIsSideA(result: StoredScore, viewerUserId: string): boolean {
  if (result.sideAUserIds && result.sideAUserIds.length > 0) {
    return result.sideAUserIds.includes(viewerUserId);
  }
  return sideAUserOf(result) === viewerUserId;
}

/** The score as a specific user experienced it. */
export function scorelineFor(result: StoredScore, viewerUserId: string): Scoreline {
  return orientScore(result.score, viewerIsSideA(result, viewerUserId));
}
