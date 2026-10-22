# Design

How to run and call the service is in the [README](../README.md). Problem and success criteria are in [intent.md](intent.md).

## Architecture overview and module map

One Node.js process. Flat behaviour modules in `src/`, plus one `src/types/` folder that holds types only.

| Module | Single responsibility | Pure |
|--------|-----------------------|------|
| `validation.ts` | Zod shape and invariant checks, field-level errors | yes |
| `rules.ts` | Reason code and amount to a decision | yes |
| `rules.decisions.ts` | The six decision constants (action, `ruleId`, rationale); constants only | yes |
| `masking.ts` | Mask BSB and account number | yes |
| `service.ts` | Orchestrate validate, rules, settlement, persist, log | no |
| `store.ts` | In-memory case persistence, copies in and out | no |
| `settlement.ts` | Mock settlement client that can be forced to fail | no |
| `logging.ts` | One JSON line per log call | no |
| `config.ts` | Read `PORT` and `SETTLEMENT_FAIL` from the environment | no |
| `app.ts` | Fastify routes, HTTP to service and back | no |
| `main.ts` | Wire everything and listen on `127.0.0.1` | no |

Types live in `src/types/<name>.types.ts`, with shared vocabulary (`PaymentException`, `ExceptionCase`, `TriageAction`, `CaseAction`, `CaseStatus`, `Direction`) in `src/types/models.ts`. Implementation files export functions only. The one exception is `rules.decisions.ts`, which exports constants.

## Data flow

request, then validate, then rules, then settlement, then persist, then log, then response.

1. `app.ts` hands the parsed body to `service.submit`.
2. `validation.ts` rejects bad input with field-level errors. A rejected request is logged by field name only and is never stored or settled.
3. `rules.ts` returns one decision for a valid exception.
4. The service sends the decision's action to settlement. If settlement fails, the outcome becomes `DEGRADED` with `R-DEGRADE-001`.
5. The service builds the case with masked BSB and account number, stores it, and logs one line.
6. `app.ts` maps the result to `201`, `422`, `404` or a generic `500`.

## Component boundaries

- `validation`, `rules` and `masking` import no Fastify, no `fs` and nothing that does I/O, so each can be tested with plain values.
- `service.ts` imports no Fastify. It takes the store, settlement client, logger, id generator and clock as dependencies, so tests inject fakes.
- `app.ts` only maps HTTP to the service and back.
- Rules stay out of Fastify handlers so a rule change cannot be tangled with routing, status codes or body parsing, and the same rules can serve another entry point later (a queue consumer, for example) without copying logic.
- Flat modules with one types folder, rather than `domain/`, `application/` and `infrastructure/` layers. At this size the layers would add folders without adding separation that the module boundaries above do not already give.

## Why decision text lives in `rules.decisions.ts`

The `ruleId` and rationale text is audit-relevant. Keeping it in one constants-only file lets compliance or operations review and change the wording without reading any logic. Tests assert the literal strings rather than the imported constants, so a wrong constant is caught. The cost is one extra file for six constants (recorded in [decisions.md](decisions.md)).

## How every decision is explained

- Every decision has a `ruleId` and a fixed rationale. Rationales are never built from input.
- Both are stored on the case and returned in the response.
- Both appear in the `exception triaged` log line.
- When settlement fails, the case carries `R-DEGRADE-001`, and the `settlement unavailable, case degraded` warning log also carries `intendedAction` and `intendedRuleId`, so the rule the triage had chosen is not lost.

## Key trade-offs

- **Abstain over guess.** Reason codes match exactly and case-sensitively. A lowercase or padded known code abstains with `NEEDS_HUMAN` instead of being normalised, at the cost of more human review.
- **Validation accepts any non-empty `reasonCode`** so unknown reasons reach the rule engine and abstain. A whitespace-only reason passes validation and then abstains.
- **Degrade rather than fail.** A settlement outage still returns `201` with a stored `DEGRADED` case, so the exception is not lost. There is no retry mechanism yet.
- **In-memory store and mock settlement** keep the exercise self-contained. Data is lost on restart.

## Security and privacy

- Synthetic data only. No credentials, no `.env` file, no paid APIs.
- The raw BSB and account number are masked (`***-001`, `******789`) before the case is stored. They are not in the stored case, the response, the settlement request or any log line.
- Rejection logs carry field names only, never values.
- The 500 response has no message, stack or request body. The failure log has the error name and route pattern only.
- `verify.sh` fails if a response or the server log contains a raw account number from the sample data.
- There is no authentication, so this is not safe to expose beyond localhost.

## Technology choices

- **Node.js 20+ and TypeScript (strict)** with `noUncheckedIndexedAccess`. `npm run typecheck` is a separate step because Vitest does not type check.
- **Fastify** for a small, fast HTTP layer with `app.inject` for tests without a network.
- **Zod** for declarative validation with one message per field.
- **Vitest** for unit and acceptance tests.
- **esbuild bundle** into `dist/main.js`. Plain `tsc` output cannot run under Node with extensionless imports.
- **Prettier** for formatting. Lint is left to a PR-stage check in a real pipeline; strict TypeScript and the typecheck already cover most of what a basic lint config would.

## Likely production and cloud shape

Not built. A likely shape is a container image running `node dist/main.js` behind a load balancer, with a configurable bind host, structured stdout logs shipped to a central collector, and secrets from a managed secret store. The in-memory store would become a database and the mock settlement a real client with retry (for example through a queue), with authentication in front. The CI/CD path is in the [README](../README.md#next-steps) and in [operate.md](operate.md).
