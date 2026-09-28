# Architecture

Ralio is one Next.js application, one Postgres database and one container. The iOS app talks to the same server over a JSON API. There is no queue, no cache layer and no second service. Everything that would normally be a worker runs inside the Next.js process on a schedule, claimed through a `job_runs` table so a second replica would not double-run it.

## The pipeline

```
request ──▶ match ──▶ result ──▶ level
   │           │          │          │
 posts,     first to   both sides  applyLevelChange,
 band +     accept,    confirm,    capped delta,
 overlap    FOR UPDATE scoreline   ledger row
```

A member posts a request (standing, "Up for a hit", or open court). Matching fans out alerts to members whose level band and availability overlap, through the outbox. The first acceptance turns the request into a match inside a `FOR UPDATE` transaction. After the game, both players submit a score. The scoreline module decides whose games are on side A. When the two submissions agree, the result is confirmed and the one module allowed to write levels moves both ratings by a capped amount and writes a ledger row. Tours, tournaments and americano nights all feed matches into the same pipeline; they do not have their own.

## Who owns what

Most of the bugs in a product like this come from a rule being implemented in two places. The repo is organised so that each rule has one owner, and a handful of tests read the source to make sure it stays that way.

| Module | Owns |
|---|---|
| `requestStateMachine.ts` | Every request, invitation and match transition. All lock the parent row `FOR UPDATE`; `createRequest` has no parent and serialises on `pg_advisory_xact_lock` |
| `visibility.ts` | The four gates, widest to narrowest: `canDiscover`, `canChallenge`, `canViewPlayer`, `canMessage`. Blocks are pairwise and direction-agnostic |
| `matching.ts` | Band and availability-overlap query for fan-out, feed and digest. The only module doing level-band arithmetic in raw SQL |
| `level.ts` | The inverted 40 to 1 scale. Raw comparisons banned elsewhere. Zero imports, so client components can render levels without dragging the DB driver into the bundle |
| `levelChange.ts` | The only writer of a level. Owns the verified-freeze rule and the ledger |
| `scoring.ts` | `judgeScore`, the single winner rule. Pure, so score pickers, mutual submit and the referee console cannot disagree |
| `scoreline.ts` | Score side-A orientation (submitter, bracket A, or team A) |
| `resultsQuery.ts` | `confirmedResultsFor`, the one door to confirmed results, with side A already resolved |
| `headToHead.ts` | Rivalry derived from shared matches. No stored friend graph |
| `tourStateMachine.ts`, `tourRace.ts` | Tour membership and the live standings (win 2, played 1) |
| `americanoStateMachine.ts`, `americanoRotation.ts` | Americano nights: perfect partner rotation, games-per-player leaderboard |
| `clubTime.ts` | The only local-to-instant conversion (Europe/Copenhagen) |
| `email/outbox.ts` | All outbound email and SMS: dedupe, retry, and the consent gate that runs at enqueue and again in front of the transport |
| `gdpr.ts` | `GDPR_LEDGER` classifies every table; `anonymiseUser` is the only erasure path |
| `worker/bootstrap.ts` | Outbox poller, the job schedule, and the `job_runs.run_key` frame that claims a run |

## The structural tests

Four suites guard shape rather than behaviour, and they fail more often than the behavioural ones on unrelated changes, which is the point.

- `serverActions.test.ts` reads every `"use server"` file and pins its export surface, because each export is a public POST endpoint. Every action takes a single `FormData` and authenticates from the session. A `KNOWN_EXCEPTIONS` list may only shrink.
- `apiRoutes.test.ts` pins the `/api/v1` surface: exactly three unauthenticated routes, zod `safeParse` on every body, no session-cookie reads anywhere under v1.
- `envContract.test.ts` fails if code reads an environment variable that `.env.example` does not list.
- `gdpr.integration.test.ts` erases a user and then sweeps every text and jsonb column for their data. A table with no `GDPR_LEDGER` classification fails the suite.

## The API and the app

The native app arrived after the web product, which is the wrong order for architecture and the right order for finding out whether anyone wants the thing. Adding it meant extracting the logic out of every server action into a plain library module, then making both the action and a `/api/v1` route thin mappers over the same function. Routes parse, call, and map the outcome union through a DTO layer. They contain no business logic, and a test fails if one grows any.

The DTO discipline exists because JSON has no server-component boundary: player cards rather than user rows, numbers rather than numeric strings, ISO timestamps, oriented scorelines with a `viewerWon` flag, and no email, phone or unsubscribe token outside the viewer's own `/me` endpoint.

The app is a separate Expo package that shares a `packages/contract` directory with the server: the zod schemas, the DTO types and the error vocabulary, so the two cannot drift. The web side reaches it through a tsconfig path alias and the app through Metro's watch folders, so neither build system needed a workspace.
