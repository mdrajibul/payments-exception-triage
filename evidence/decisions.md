# Decisions

Short architecture decision records. The design they support is in [design.md](design.md).

## ADR-1: Deterministic rules, not machine learning

**Context.** The product decides what to do with a failed payment. Operations and audit need to explain each decision, and the exercise has no real data to train on.

**Decision.** Use a small set of exact-match rules from reason code and amount to an action. No machine learning.

**Consequences.** Every outcome is predictable and can be tested with fixed inputs. Coverage is limited to the five reasons the rules know, and anything else goes to a human. A learned model could widen coverage later, but it would need real data and a way to explain its output.

## ADR-2: Abstain over a wrong auto-close

**Context.** Auto-closing the wrong exception is worse than asking a person. Reason codes can arrive in unexpected forms.

**Decision.** Match reason codes exactly and case-sensitively. Anything else, including a lowercase or padded known code, abstains with `NEEDS_HUMAN` and `R-ABSTAIN-001`. High-value insufficient funds (1,000,000 cents or more) also goes to a human. Validation accepts any non-empty `reasonCode` so unknown reasons reach the rules instead of being rejected.

**Consequences.** More cases reach a human, including harmless variants such as `duplicate_payment`. No unknown input can ever be auto-closed, and tests assert that.

## ADR-3: A `ruleId` and rationale on every decision, in a constants-only file

**Context.** The `ruleId` and rationale text is audit-relevant. Compliance or operations may need to review or reword it without reading logic.

**Decision.** Every decision carries a `ruleId` and a fixed rationale, stored on the case and written to the logs. The text lives in `src/rules.decisions.ts`, which holds only `as const satisfies TriageDecision` constants. `rules.ts` holds the logic and never re-exports a decision.

**Consequences.** One extra file for six constants. Wording changes touch one small file, and tests assert the literal strings so a wrong constant is caught. Rationales are never built from input, so they cannot leak data.

## ADR-4: In-memory store and mock settlement, with degrade instead of failure

**Context.** The exercise has a two-hour build and must run from a clean checkout with no credentials, database or paid API.

**Decision.** Use an in-memory store behind a `CaseStore` type and a mock settlement client behind a `SettlementClient` type. When settlement fails, still store the case as `DEGRADED` with `R-DEGRADE-001` and return `201`.

**Consequences.** Nothing external is needed to run or test, and a settlement outage does not lose an exception. Data is lost on restart, and there is no retry for degraded cases yet. A real store and settlement client can replace the mocks without changing the service.

## ADR-5: esbuild bundle, with Prettier and no ESLint

**Context.** Plain `tsc` output cannot run under Node with extensionless imports, which the code uses. The exercise should stay small and avoid unneeded tooling.

**Decision.** Bundle `src/main.ts` into `dist/main.js` with esbuild, with dependencies external. Format with Prettier only. Rely on strict TypeScript and `npm run typecheck`, and leave linting to a PR-stage check in a real pipeline.

**Consequences.** `node dist/main.js` works, and `npm ci --omit=dev` is needed wherever it runs. There is no lint check in `./scripts/verify.sh`, so style problems that a lint config would catch are not caught here. Vite and a watch mode were left out on purpose.

## What I intentionally did not build

- UI
- Authentication
- Real settlement
- Database
- ESLint
- CI pipeline file
- Container image
- Cloud deploy
