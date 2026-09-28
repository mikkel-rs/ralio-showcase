import { describe, it, expect } from "vitest";
import {
  clampLevel,
  isStrongerThan,
  bandAround,
  levelDelta,
  movementDirection,
  resultDeltas,
  applyDelta,
  deriveConfidence,
  displayLevel,
  scoreQuestionnaire,
  formatLevelChange,
  MAX_DELTA_PER_RESULT,
} from "./level";

describe("level scale (inverted: 1.0 elite, 40.0 beginner)", () => {
  it("stronger means numerically lower", () => {
    expect(isStrongerThan(12.0, 20.0)).toBe(true);
    expect(isStrongerThan(20.0, 12.0)).toBe(false);
  });

  it("clamps to the scale", () => {
    expect(clampLevel(45)).toBe(40.0);
    expect(clampLevel(0.2)).toBe(1.0);
    expect(clampLevel(18.44)).toBe(18.4);
  });

  it("bands are symmetric and min is the stronger bound", () => {
    const band = bandAround(20.0, 3.0);
    expect(band).toEqual({ min: 17.0, max: 23.0 });
  });

  it("bands clamp at scale edges", () => {
    expect(bandAround(2.0, 3.0)).toEqual({ min: 1.0, max: 5.0 });
    expect(bandAround(39.0, 3.0)).toEqual({ min: 36.0, max: 40.0 });
  });
});

describe("resultDeltas", () => {
  it("equal players: winner improves, loser drops, symmetric", () => {
    const { winnerDelta, loserDelta } = resultDeltas(20.0, 20.0);
    expect(winnerDelta).toBe(-0.1);
    expect(loserDelta).toBe(0.1);
  });

  // The exact magnitudes, not bounds. The level scale stores one decimal, so
  // there are only three of them, and the shape has to be monotone in surprise:
  // it used to pay the full cap for everything inside a 1.8-level gap, which
  // made a coin-flip and a 20-level upset move a player by the same 0.2.
  it("moves further the more surprising the result is", () => {
    const upset = Math.abs(resultDeltas(22.0, 15.0).winnerDelta); // weak player won
    const even = Math.abs(resultDeltas(20.0, 20.0).winnerDelta);
    const favourite = Math.abs(resultDeltas(15.0, 22.0).winnerDelta); // strong player won
    expect(upset).toBe(0.2);
    expect(even).toBe(0.1);
    expect(favourite).toBe(0);
    expect(upset).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(favourite);
  });

  it("a slight favourite still moves like an even match", () => {
    expect(resultDeltas(19.0, 20.0).winnerDelta).toBe(-0.1);
    expect(resultDeltas(21.0, 20.0).winnerDelta).toBe(-0.1);
  });

  it("a heavy favourite winning moves nobody", () => {
    expect(resultDeltas(5.0, 35.0)).toEqual({ winnerDelta: -0, loserDelta: 0 });
  });

  it("never exceeds the per-result cap in either direction", () => {
    for (const [w, l] of [
      [40, 1],
      [1, 40],
      [20, 20],
      [10, 30],
    ] as const) {
      const { winnerDelta, loserDelta } = resultDeltas(w, l);
      expect(Math.abs(winnerDelta)).toBeLessThanOrEqual(MAX_DELTA_PER_RESULT);
      expect(Math.abs(loserDelta)).toBeLessThanOrEqual(MAX_DELTA_PER_RESULT);
    }
  });

  it("applyDelta clamps at the edges", () => {
    expect(applyDelta(1.0, -0.2)).toBe(1.0);
    expect(applyDelta(40.0, 0.2)).toBe(40.0);
  });
});

describe("confidence", () => {
  it("derives states from result count", () => {
    expect(deriveConfidence(0, false)).toBe("provisional");
    expect(deriveConfidence(1, false)).toBe("developing");
    expect(deriveConfidence(4, false)).toBe("developing");
    expect(deriveConfidence(5, false)).toBe("established");
  });

  it("WTN verification wins over any count", () => {
    expect(deriveConfidence(0, true)).toBe("verified");
    expect(deriveConfidence(10, true)).toBe("verified");
  });

  it("displayLevel prefers WTN only when verified", () => {
    expect(displayLevel({ level: "18.4", wtn: "16.2", levelConfidence: "verified" })).toBe(16.2);
    expect(displayLevel({ level: "18.4", wtn: "16.2", levelConfidence: "developing" })).toBe(18.4);
    expect(displayLevel({ level: null, wtn: null, levelConfidence: "provisional" })).toBeNull();
  });
});

describe("questionnaire scoring", () => {
  it("a brand-new player lands near the beginner end", () => {
    const level = scoreQuestionnaire({
      version: 1,
      yearsPlayed: "lt1",
      frequency: "rarely",
      rallyLength: "lt4",
      serveConsistency: "learning",
      competesClubTeam: false,
      playedTournaments: false,
    });
    expect(level).toBeGreaterThanOrEqual(34);
  });

  it("a seasoned club-team player lands mid-strong but never elite", () => {
    const level = scoreQuestionnaire({
      version: 1,
      yearsPlayed: "gt10",
      frequency: "several_weekly",
      rallyLength: "gt20",
      serveConsistency: "weapon",
      competesClubTeam: true,
      playedTournaments: true,
    });
    expect(level).toBe(14); // questionnaire floor
  });

  it("intermediate answers land between the anchors", () => {
    const level = scoreQuestionnaire({
      version: 1,
      yearsPlayed: "3to10",
      frequency: "weekly",
      rallyLength: "4to10",
      serveConsistency: "second_in",
      competesClubTeam: false,
      playedTournaments: false,
    });
    expect(level).toBeGreaterThan(14);
    expect(level).toBeLessThan(34);
  });
});

describe("movement", () => {
  it("delta is raw scale movement, negative when the player improved", () => {
    expect(levelDelta(18.4, 18.1)).toBe(-0.3);
    expect(levelDelta(18.1, 18.4)).toBe(0.3);
    expect(levelDelta(20.0, 20.0)).toBe(0);
  });

  it("reads direction on the inverted scale", () => {
    expect(movementDirection(18.4, 18.1)).toBe("improved");
    expect(movementDirection(18.1, 18.4)).toBe("declined");
    expect(movementDirection(20.0, 20.0)).toBe("flat");
  });

  it("survives float noise", () => {
    expect(levelDelta(20.3, 20.1)).toBe(-0.2);
    expect(movementDirection(20.3, 20.1)).toBe("improved");
  });
});

describe("formatting", () => {
  it("formats level change as a delta arrow", () => {
    expect(formatLevelChange(18.4, 18.1)).toBe("18.4 → 18.1");
  });
});
