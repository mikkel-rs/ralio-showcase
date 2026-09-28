// Americano pairing generator, pure and deterministic (tournamentDraw.ts
// style): indices in, court assignments out; the caller maps indices to user
// ids. The circle method gives a perfect partner rotation for every even player
// count, so over the first n-1 rounds everyone partners everyone exactly once,
// whatever n is. The familiar 4/8/12/16 is what MAX_AMERICANO_PLAYERS = 16 in
// americanoStateMachine.ts admits, not a limit of this module. Only rounds
// beyond n-1 fall back to a greedy pass that minimizes repeated partners first
// and repeated opponents second; today that is reachable at n=4, where a night
// may run up to 12 rounds.

export interface AmericanoCourt {
  court: number; // 1-based
  teamA: [number, number];
  teamB: [number, number];
}

export interface AmericanoRound {
  round: number; // 1-based
  courts: AmericanoCourt[];
}

/**
 * Perfect partner rotation via the circle method: fixing player 0 and
 * rotating the rest gives n-1 rounds of perfect matchings in which every
 * pair partners exactly once, the same 1-factorization the round-robin draw
 * uses, applied to partnerships instead of opponents. Courts are then
 * formed by pairing the partnerships, greedily spreading opponents.
 */
function circlePartnerRound(n: number, round: number): [number, number][] {
  const rot: number[] = [];
  for (let i = 0; i < n - 1; i++) rot.push(1 + ((i + round) % (n - 1)));
  const pairs: [number, number][] = [[0, rot[0]]];
  for (let i = 1; i <= (n - 2) / 2; i++) {
    pairs.push([rot[i], rot[n - 1 - i]]);
  }
  return pairs;
}

function courtsFromPairs(
  pairs: [number, number][],
  opponentCounts: Map<string, number>,
): AmericanoCourt[] {
  const open = [...pairs];
  const courts: AmericanoCourt[] = [];
  let courtNo = 1;
  while (open.length > 0) {
    const a = open.shift()!;
    let bestIdx = 0;
    let bestCount = Infinity;
    for (let i = 0; i < open.length; i++) {
      const b = open[i];
      const c =
        (opponentCounts.get(partnerKey(a[0], b[0])) ?? 0) +
        (opponentCounts.get(partnerKey(a[0], b[1])) ?? 0) +
        (opponentCounts.get(partnerKey(a[1], b[0])) ?? 0) +
        (opponentCounts.get(partnerKey(a[1], b[1])) ?? 0);
      if (c < bestCount) {
        bestCount = c;
        bestIdx = i;
      }
    }
    const b = open.splice(bestIdx, 1)[0];
    courts.push({ court: courtNo++, teamA: a, teamB: b });
  }
  return courts;
}

function partnerKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Greedy fallback: pick the partition of each round that adds the fewest
 *  repeated partners, then fewest repeated opponents, by local search. */
function greedyRound(
  n: number,
  partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  seed: number,
): AmericanoCourt[] {
  // Deterministic rotation of the player list as the starting order.
  const order = Array.from({ length: n }, (_, i) => (i + seed) % n);
  // Pair players greedily: each player partners the candidate with the lowest
  // partner count, then courts are formed pair-vs-pair minimizing opponent
  // repeats.
  const unpaired = [...order];
  const pairs: [number, number][] = [];
  while (unpaired.length > 0) {
    const p = unpaired.shift()!;
    let bestIdx = 0;
    let bestCount = Infinity;
    for (let i = 0; i < unpaired.length; i++) {
      const c = partnerCounts.get(partnerKey(p, unpaired[i])) ?? 0;
      if (c < bestCount) {
        bestCount = c;
        bestIdx = i;
      }
    }
    const partner = unpaired.splice(bestIdx, 1)[0];
    pairs.push([p, partner]);
  }
  const courts: AmericanoCourt[] = [];
  const openPairs = [...pairs];
  let courtNo = 1;
  while (openPairs.length > 0) {
    const a = openPairs.shift()!;
    let bestIdx = 0;
    let bestCount = Infinity;
    for (let i = 0; i < openPairs.length; i++) {
      const b = openPairs[i];
      const c =
        (opponentCounts.get(partnerKey(a[0], b[0])) ?? 0) +
        (opponentCounts.get(partnerKey(a[0], b[1])) ?? 0) +
        (opponentCounts.get(partnerKey(a[1], b[0])) ?? 0) +
        (opponentCounts.get(partnerKey(a[1], b[1])) ?? 0);
      if (c < bestCount) {
        bestCount = c;
        bestIdx = i;
      }
    }
    const b = openPairs.splice(bestIdx, 1)[0];
    courts.push({ court: courtNo++, teamA: a, teamB: b });
  }
  return courts;
}

export function generateAmericano(n: number, rounds: number): AmericanoRound[] {
  if (n < 4 || n % 4 !== 0) {
    throw new Error(`Americano needs a multiple of 4 players, got ${n}`);
  }
  if (rounds < 1) throw new Error("At least one round");

  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const out: AmericanoRound[] = [];

  for (let r = 0; r < rounds; r++) {
    // Circle-method partnerships are perfect for the first n-1 rounds at any
    // n; extra rounds fall back to the greedy pass.
    const courts =
      r < n - 1
        ? courtsFromPairs(circlePartnerRound(n, r), opponentCounts)
        : greedyRound(n, partnerCounts, opponentCounts, r);

    for (const c of courts) {
      partnerCounts.set(partnerKey(...c.teamA), (partnerCounts.get(partnerKey(...c.teamA)) ?? 0) + 1);
      partnerCounts.set(partnerKey(...c.teamB), (partnerCounts.get(partnerKey(...c.teamB)) ?? 0) + 1);
      for (const x of c.teamA) {
        for (const y of c.teamB) {
          opponentCounts.set(partnerKey(x, y), (opponentCounts.get(partnerKey(x, y)) ?? 0) + 1);
        }
      }
    }
    out.push({ round: r + 1, courts });
  }
  return out;
}
