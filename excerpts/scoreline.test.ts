import { describe, it, expect } from "vitest";
import { orientScore, scorelineFor, sideAUserOf } from "./scoreline";

const SETS = [
  { a: 6, b: 4 },
  { a: 3, b: 6 },
  { a: 10, b: 7 },
];

describe("scoreline", () => {
  it("orients toward side A unchanged", () => {
    const line = orientScore(SETS, true);
    expect(line.text).toBe("6-4, 3-6, 10-7");
    expect(line.setsFor).toBe(2);
    expect(line.setsAgainst).toBe(1);
    expect(line.gamesFor).toBe(19);
    expect(line.gamesAgainst).toBe(17);
  });

  it("flips every set for the other side", () => {
    const line = orientScore(SETS, false);
    expect(line.text).toBe("4-6, 6-3, 7-10");
    expect(line.setsFor).toBe(1);
    expect(line.gamesFor).toBe(17);
    expect(line.gamesAgainst).toBe(19);
  });

  it("mutual: side A is the submitter", () => {
    const stored = { score: SETS, submittedBy: "anna", confirmationMode: "mutual" as const };
    expect(sideAUserOf(stored)).toBe("anna");
    expect(scorelineFor(stored, "anna").text).toBe("6-4, 3-6, 10-7");
    expect(scorelineFor(stored, "bo").text).toBe("4-6, 6-3, 7-10");
  });

  it("referee: side A is bracket participant A, not the submitting organizer", () => {
    const stored = {
      score: SETS,
      submittedBy: "organizer",
      confirmationMode: "referee" as const,
      sideAUserId: "anna",
    };
    expect(sideAUserOf(stored)).toBe("anna");
    // The organizer is not a participant; neither player is the submitter.
    expect(scorelineFor(stored, "anna").text).toBe("6-4, 3-6, 10-7");
    expect(scorelineFor(stored, "bo").text).toBe("4-6, 6-3, 7-10");
  });

  it("the two players always read mirrored scorelines", () => {
    for (const mode of ["mutual", "referee"] as const) {
      const stored = {
        score: SETS,
        submittedBy: mode === "mutual" ? "anna" : "organizer",
        confirmationMode: mode,
        sideAUserId: mode === "referee" ? "anna" : null,
      };
      const a = scorelineFor(stored, "anna");
      const b = scorelineFor(stored, "bo");
      expect(a.gamesFor).toBe(b.gamesAgainst);
      expect(a.setsFor).toBe(b.setsAgainst);
      expect(a.sets.map((s) => `${s.b}-${s.a}`).join(", ")).toBe(b.text);
    }
  });

  it("legacy rows with null mode fall back to submitter as side A", () => {
    const stored = { score: SETS, submittedBy: "anna", confirmationMode: null };
    expect(scorelineFor(stored, "anna").text).toBe("6-4, 3-6, 10-7");
  });

  it("a referee row missing side A degrades to submitter rather than guessing", () => {
    const stored = {
      score: SETS,
      submittedBy: "organizer",
      confirmationMode: "referee" as const,
      sideAUserId: null,
    };
    expect(sideAUserOf(stored)).toBe("organizer");
  });

  it("team side A (americano doubles): both A players see it their way, B players flipped", () => {
    const stored = {
      score: [{ a: 8, b: 5 }],
      submittedBy: "organizer",
      confirmationMode: "referee" as const,
      sideAUserIds: ["joe", "babe"],
    };
    expect(scorelineFor(stored, "joe").text).toBe("8-5");
    expect(scorelineFor(stored, "babe").text).toBe("8-5");
    expect(scorelineFor(stored, "bill").text).toBe("5-8");
    expect(scorelineFor(stored, "jane").text).toBe("5-8");
  });
});
