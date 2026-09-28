import { describe, it, expect } from "vitest";
import { generateAmericano } from "./americanoRotation";

function partnerKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

describe("generateAmericano", () => {
  it("rejects non-multiples of four", () => {
    expect(() => generateAmericano(6, 3)).toThrow(/multiple of 4/);
    expect(() => generateAmericano(0, 1)).toThrow(/multiple of 4/);
  });

  // 20 and 24 are above MAX_AMERICANO_PLAYERS today. They are here because the
  // module's claim is about the circle method, not about the cap: raising the
  // cap must not need a new special case, and this fails if someone narrows the
  // rotation to the sizes the app currently admits.
  for (const n of [4, 8, 12, 16, 20, 24]) {
    it(`n=${n}: every round is a full partition, ${n - 1} rounds partner everyone exactly once`, () => {
      const rounds = generateAmericano(n, n - 1);
      expect(rounds).toHaveLength(n - 1);
      const partners = new Map<string, number>();
      for (const r of rounds) {
        const seen = new Set<number>();
        for (const c of r.courts) {
          for (const p of [...c.teamA, ...c.teamB]) {
            expect(seen.has(p)).toBe(false);
            seen.add(p);
          }
          partners.set(
            partnerKey(...c.teamA),
            (partners.get(partnerKey(...c.teamA)) ?? 0) + 1,
          );
          partners.set(
            partnerKey(...c.teamB),
            (partners.get(partnerKey(...c.teamB)) ?? 0) + 1,
          );
        }
        expect(seen.size).toBe(n);
        expect(r.courts).toHaveLength(n / 4);
      }
      // Perfect rotation: all n(n-1)/2 pairs used, none twice.
      expect(partners.size).toBe((n * (n - 1)) / 2);
      expect(Math.max(...partners.values())).toBe(1);
    });
  }

  it("rounds beyond n-1 still produce full partitions", () => {
    const rounds = generateAmericano(4, 6);
    expect(rounds).toHaveLength(6);
    for (const r of rounds) {
      const seen = new Set(r.courts.flatMap((c) => [...c.teamA, ...c.teamB]));
      expect(seen.size).toBe(4);
    }
  });

  it("is deterministic", () => {
    expect(generateAmericano(8, 5)).toEqual(generateAmericano(8, 5));
  });
});
