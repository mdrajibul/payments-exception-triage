# Incremental Runbook — Payments Exception Triage

This runbook was written and committed (commit 1) before any code existed. It is the plan the AI coding agent is steered with; any deviation is recorded in `evidence/agentic-workflow.md`.

Use it during the **2-hour** timed build (0–120 min on the build clock). Work **one slice at a time**: give the AI coding agent a single prompt, review the output, run the checks, then **commit yourself**. Do not ask the agent to generate the whole solution in one shot.

## Product choice (fixed)

**Payments Exception Triage** — non-AI product, built *with* AI agents.

- Ingest a failed AU-style payment exception
- Validate → deterministic rules → persist → expose status
- Guarded paths: validation reject, safe abstain (`NEEDS_HUMAN`), degrade (`DEGRADED` when mock settlement is down)
- Synthetic data only; no paid APIs, credentials, or confidential data

## Stack (fixed)

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict) |
| HTTP | Fastify |
| Validation | Zod |
| Tests | Vitest (unit + acceptance) |
| Formatting | Prettier |
| Build tool | esbuild, configured in `esbuild.config.js` (bundles `src/main.ts` into `dist/main.js`) |
| Package manager | npm |

Do **not** switch stacks mid-exercise, and do **not** add Vite, ESLint, a `dev` watch script, Nest, Express, dotenv or any `.env` loader. Every prompt assumes this stack.

## How to run a slice

1. Start a fresh chat, or continue the same one, and send exactly this (change `N`):

   ```text
   Read RUNBOOK.md and execute Prompt N only. Follow the "Architecture & coding style" and "Ground rules" sections in full, as well as the text of the prompt. Do not start Prompt N+1. Do not commit.
   ```

2. Review the diff. Run `npm run format:check`, `npm test` **and** `npm run typecheck` (Prompt 0 has no tests yet, so it runs format check and typecheck only).
3. Ask the agent for a commit message: a Conventional Commits title of at most 72 characters in the form `type(scope): imperative summary`, a blank line, then the description as short prose paragraphs. Do not hard-wrap sentences; one sentence stays on one line.
4. Commit yourself. Move to the next prompt.

## Architecture & coding style (non-negotiable)

These rules apply to **every prompt from Prompt 1 onward**. Prompts below do not repeat them. If the agent violates one, use the "style" steering line at the bottom and redo the slice.

### Principles

| Principle | What it means here |
|-----------|-------------------|
| **TDD** | Red → green → refactor. Write the failing test first, show the failing run, then write the minimal code to pass, then tidy. No new branch without a failing test. |
| **Clean code** | Names say what the code decides (`triage`, `validatePaymentException`, `maskBsb`). Small functions. No dead code. No clever one-liners. No god objects. |
| **Single responsibility** | One reason to change per file: validate, decide, orchestrate, persist, log, or adapt HTTP. Never mix two in one module. |
| **Modular** | Flat behaviour files in `src/`, plus one `src/types/` folder for types only. Narrow exports. `validation`, `rules` and `masking` stay pure (no Fastify, no `fs`, no I/O). `service` stays free of Fastify. `app.ts` only maps HTTP ↔ service. |
| **Light domain language** | Clear names (`TriageAction`, `ExceptionCase`). Rules and validation stay **out of** Fastify handlers. No hexagonal/DDD folder layers (`domain/`, `application/`, `infrastructure/`) and no nested folders under `src/` other than `types/`. |
| **Extend, don't redesign** | Do not change or merge earlier modules unless a test fails. Delete unused code in the same slice; do not leave a second way to do the same thing. |

### Definition of done (every slice)

- Failing-then-passing test commands shown for the new behaviour.
- The agent runs `npm run format`, then `npm test` and `npm run typecheck`, and all are green before it stops (Vitest does not type check). Prompts 4 and 5 add `npm run build` and `./scripts/verify.sh`.
- The agent lists the files it touched and stops. It does not start the next slice.

### Types and file layout

- **Types live in `src/types/`, nowhere else.** A module `src/<name>.ts` keeps its types in `src/types/<name>.types.ts` (for example `src/types/store.types.ts` holds `CaseStore`). Create a `.types.ts` file in the slice that needs it, not as an empty stub, and only when the module exports a type. Implementation files import types with `import type` from `./types/<name>.types` and **export functions only** (the one exception is a `src/<name>.decisions.ts` file, below). Files inside `src/types/` import each other as siblings (`./models`). No barrel `index.ts`.
- **Shared domain vocabulary** used by several modules (`PaymentException`, `ExceptionCase`, `TriageAction`, `CaseAction`, `CaseStatus`, `Direction`) stays in `src/types/models.ts`. A type used by one module does not go there.
- **Runtime values never go in `src/types/`.** An allowed-values list such as `["INBOUND", "OUTBOUND"]` is a private constant in the module that uses it, typed with `satisfies readonly Direction[]`; the `Direction` type itself lives in `src/types/models.ts`.
- **Rule decisions live in `src/rules.decisions.ts`, separate from the rule logic.** The `ruleId` and rationale text are audit-relevant, so compliance or ops can review and change them in one small file without touching the logic. The cost is one extra file for six constants, recorded as a trade-off in `evidence/decisions.md`.
  - **Shape:** it is the only implementation file that exports constants instead of functions, and it contains nothing else: no functions, no logic, and no imports other than `import type { TriageDecision } from "./types/rules.types"`.
  - **Contents:** one exported constant per rule outcome, each written `as const satisfies TriageDecision` so it is read-only and checked against the type: `DUPLICATE_PAYMENT_DECISION`, `INSUFFICIENT_FUNDS_DECISION`, `HIGH_VALUE_INSUFFICIENT_FUNDS_DECISION`, `INVALID_ACCOUNT_DECISION`, `BANK_UNAVAILABLE_DECISION`, `ABSTAIN_DECISION`.
  - **`rules.ts`:** imports the constants and keeps `triage`, `chooseDecision`, `isHighValue` and the private `HIGH_VALUE_THRESHOLD_CENTS` (logic, not decision text). It never re-exports a decision; `triage` returns a copy.
  - **Tests:** assert the literal `ruleId` and rationale strings, not the imported constants, so a wrong constant is caught.
  - **Other modules:** no other `.decisions.ts` file. The message constants in `validation.ts` and the degrade constants in `service.ts` stay private in their own module.
- **Group each implementation file by visibility**, in this order, with one blank line between groups (skip an empty group): imports → private constants → private module-level values (such as a Zod schema) → public API (every `export`, kept together) → private helpers (non-exported functions, below the public API that uses them). Nothing exported among the private groups; nothing private among the exports. Group by order and blank lines only: no marker comments, section banners, or comments that restate the code.
- Import a sibling module by its file name, with no `.js` or `.ts` suffix. This needs `"module": "ESNext"` and `"moduleResolution": "Bundler"` in `tsconfig.json`, so `tsc`, Vitest and esbuild all resolve extensionless imports.

### Target layout (planned; `evidence/design.md` records the final structure)

```text
src/
  validation.ts        # Zod + invariants (pure)
  rules.ts             # triage logic: reason + amount → decision (pure)
  rules.decisions.ts   # the TriageDecision constants (ruleId + rationale text); constants only
  masking.ts           # mask BSB / account number (pure)
  service.ts           # orchestration only
  store.ts             # in-memory case persistence
  settlement.ts        # mock settlement client
  logging.ts           # structured JSON logs
  config.ts            # env config
  app.ts               # Fastify routes (thin adapters)
  main.ts              # wire + listen
  types/               # types only: no functions, no constants
    models.ts            # shared domain vocabulary
    validation.types.ts  # ValidationError, ValidationResult
    rules.types.ts       # TriageInput, TriageDecision
    service.types.ts     # TriageService, TriageServiceDependencies, SubmitResult, CaseOutcome
    store.types.ts       # CaseStore
    settlement.types.ts  # SettlementClient, SettlementRequest, MockSettlementOptions
    logging.types.ts     # Logger, LogFields
    config.types.ts      # AppConfig, Environment
    app.types.ts         # AppDependencies
tests/                 # unit + acceptance
sample-data/
scripts/verify.sh
esbuild.config.js      # build config
README.md
evidence/
```

Reference shape for any implementation file (`src/validation.ts` is the model):

```ts
import { ... } from "...";
import type { Result } from "./types/<name>.types";

const SOME_LIMIT = 10;

const someSchema = ...;

export function doTheThing(input: unknown): Result { ... }

function smallHelper(...) { ... }
```

---

## Ground rules

1. One prompt → one vertical slice → `npm run format:check`, `npm test` and `npm run typecheck` green → one commit as soon as the slice is green (optionally a red commit then a green commit, for TDD evidence).
2. Do **not** squash, rewrite, or collapse history before submission.
3. The agent never commits. It must not run `git commit`, `git commit --amend`, `git reset`, `git rebase`, or `git push`. You review the diff, then commit.
4. If the agent overbuilds, paste a steering line (see bottom) and force a scope cut. No UI, auth, Docker, cloud deploy, ML, Vite, or real bank APIs.
5. `evidence/intent.md` is written in Prompt 0. The rest of the evidence pack comes **last** so `agentic-workflow.md` reflects what you actually did. Jot down your interventions as you go.
6. You remain accountable for all code and design decisions.

## Timebox map

Commit 1 is this file alone (`git add RUNBOOK.md`, title `docs: add incremental build runbook`), made before any code, config or other file exists, so the history shows the plan came first. Do not include any other runbook copy (such as `RUNBOOK.dev.md`) in it or in any later commit. The build clock starts after it and runs for 120 minutes.

| Step | Minutes | Outcome | Suggested commit title |
|------|---------|---------|------------------------|
| 0 | 0–8 | Repo scaffold + build config + `intent.md` + README stub | `chore: scaffold payments exception triage project` |
| 1 | 8–25 | Validation + unit tests (TDD) | `feat(validation): add payment exception input validation` |
| 2 | 25–40 | Rule engine + abstain tests (TDD) | `feat(rules): add deterministic triage rule engine with safe abstain` |
| 3 | 40–70 | Service + store + mock settlement + degrade | `feat(service): add triage service with mock settlement and degrade` |
| 4 | 70–90 | Fastify API + config + acceptance tests | `feat(api): add Fastify HTTP API with env config and acceptance tests` |
| 5 | 90–105 | Sample data + `verify` script + README | `feat(verify): add sample data, verify script and README` |
| 6 | 105–120 | Evidence pack | `docs(evidence): add design, workflow, verify, operate and decisions` |

There is no spare time inside the 120 minutes. If a slice overruns, cut scope inside that slice (steering line) rather than borrowing from later slices.

After the build: review the whole repo, fix only what is broken or misleading (no new features), run `./scripts/verify.sh` once more, and push.

---

## Prompt 0 — Scaffold only (0–8 min)

```text
Create ONLY the scaffold for Payments Exception Triage (non-AI product, rules-based),
a regulated-enterprise-style engineering exercise.

Constraints:
- No business logic. Do NOT create placeholder or stub files for src/ modules:
  each module is created in its own slice, test first. The only file under
  src/ is src/types/models.ts containing just `export {};` as a placeholder
- package.json: "type": "module", engines node >=20, and exactly these scripts:
  start = "npm run build && node dist/main.js",
  build = "node esbuild.config.js",
  test = "vitest run",
  typecheck = "tsc -p tsconfig.json --noEmit",
  format = "prettier --write src tests",
  format:check = "prettier --check src tests".
  Runtime dependencies: fastify, zod. Dev dependencies: typescript, vitest,
  esbuild, @types/node, prettier. No ESLint. The "verify" script is added in
  Prompt 5, once scripts/verify.sh exists. Keep package-lock.json (it is
  committed; CI uses `npm ci`)
- .prettierrc: just { "printWidth": 100 } (defaults otherwise; double quotes,
  semicolons). Do not add a .prettierignore or any plugin
- The build must be an esbuild bundle, NOT plain tsc output: tsc output cannot
  run under node with extensionless imports (ERR_MODULE_NOT_FOUND); the bundle can.
- esbuild.config.js at the repo root (ESM, calls esbuild's `build` API): entry
  src/main.ts, outdir dist, bundle true, platform node, format esm, packages
  "external" (dependencies stay out of the bundle), target node20. Only those
  options: no plugins, minify, sourcemaps or splitting. It cannot build until
  src/main.ts exists (Prompt 4); do not run it now.
- tsconfig.json: target ES2022, lib ES2022, types ["node"], strict,
  noUncheckedIndexedAccess, skipLibCheck, "module": "ESNext",
  "moduleResolution": "Bundler", include ["src/**/*.ts", "tests/**/*.ts"]
  (tests are type checked too, because Vitest does not type check)
- vitest.config.ts: node environment, include ["tests/**/*.test.ts"]
- .gitignore: node_modules/, dist/, coverage/, .env, .env.*, *.log, .DS_Store
- README stub; empty tests/ folder (with a .gitkeep if needed);
  evidence/intent.md with problem/users/assumptions/constraints/out-of-scope/success criteria.
  The success criteria must include: a valid exception gets exactly one action; an invalid
  one is rejected with field-level errors and not stored; an unknown or ambiguous reason is
  never auto-closed (it abstains with NEEDS_HUMAN); every decision carries a ruleId and a
  rationale that explain it; when settlement is unavailable the case is still stored and
  marked DEGRADED; raw BSB and account numbers never appear in responses, stored cases or
  logs; one command, ./scripts/verify.sh, runs every check and a smoke test of the built server
- Synthetic AU payments domain; no credentials; no confidential data
- Do NOT implement validation, rules, API, or tests yet

Check: `npm install`, then `npm run format` and `npm run typecheck` pass, and
`npm run format:check` passes. (`npx vitest run --passWithNoTests` is fine; plain
`npm test` fails until tests exist.)
After you finish, list the exact files created and stop.
```

**You do:** skim files → `npm run format:check` + `npm run typecheck` → commit.

---

## Prompt 1 — Validation, TDD (8–25 min)

```text
Next slice ONLY: inbound payment exception validation.

Files:
- src/validation.ts — public API: validatePaymentException(input: unknown): ValidationResult. One named message constant per field. The allowed directions list is a private constant here
- src/types/validation.types.ts — ValidationError { field, message }, ValidationResult = { ok: true; value: PaymentException } | { ok: false; errors: ValidationError[] }
- src/types/models.ts — add Direction ("INBOUND" | "OUTBOUND") and PaymentException { reference, amountCents, currency: "AUD", bsb, accountNumber, reasonCode, direction }
- tests/validation.test.ts

This module only validates shape and invariants.

Validate:
- reference non-empty (a blank or whitespace-only string is empty)
- amountCents is a positive whole number (cents)
- currency is AUD only
- bsb in the format XXX-XXX using digits only; message exactly "bsb must be in the format XXX-XXX using digits only"
- accountNumber is 6–12 digits
- reasonCode is any non-empty string. Do NOT restrict it to a known list: unknown reasons must reach the rule engine so it can abstain
- direction is INBOUND or OUTBOUND
- the input itself must be a JSON object: null, arrays and primitives give a single error { field: "body", message: "body must be a JSON object" }
- return at most one error per field (the first), each as { field, message }
- the raw input is never changed

Tests also cover: every valid field passes, each field rejected on its own, several bad fields reported together, missing fields, wrong types, boundary values (account number 5/6/12/13 digits).
```

**You do:** `npm run format:check` + `npm test` + `npm run typecheck` → commit.

---

## Prompt 2 — Rules + safe abstain (25–40 min)

```text
Next slice ONLY: deterministic triage rule engine.

Files:
- src/rules.decisions.ts — constants only: one exported `as const satisfies TriageDecision` constant per rule outcome (DUPLICATE_PAYMENT_DECISION, INSUFFICIENT_FUNDS_DECISION, HIGH_VALUE_INSUFFICIENT_FUNDS_DECISION, INVALID_ACCOUNT_DECISION, BANK_UNAVAILABLE_DECISION, ABSTAIN_DECISION) holding the exact action, ruleId and rationale listed below. No functions, no logic
- src/rules.ts — public API: triage({ reasonCode, amountCents }): TriageDecision. Pure. Imports the constants from ./rules.decisions and keeps the private high-value threshold constant (in cents); a private chooseDecision maps reason → constant and triage returns a copy so callers cannot change the shared constants
- src/types/rules.types.ts — TriageInput = Pick<PaymentException, "reasonCode" | "amountCents">; TriageDecision = { action: TriageAction; ruleId: string; rationale: string }
- src/types/models.ts — add TriageAction ("AUTO_CLOSE" | "QUEUE_REVIEW" | "NEEDS_HUMAN")
- tests/rules.test.ts

This module maps reason + amount → TriageDecision only. Every decision says which rule fired (ruleId) and why (rationale), so an analyst or auditor can explain it. Rationales are fixed text: never build one from the input.

Rules (reasonCode is matched exactly and case-sensitively), each giving { action, ruleId, rationale }:
- DUPLICATE_PAYMENT → AUTO_CLOSE, R-DUP-001, "Duplicate payment reported; closing automatically."
- INSUFFICIENT_FUNDS → QUEUE_REVIEW, R-NSF-001, "Insufficient funds requires ops queue review before customer contact."
- INSUFFICIENT_FUNDS and amountCents >= 1000000 → NEEDS_HUMAN, R-NSF-HV-001, "High-value insufficient funds exceeds the queue threshold; a human must review." (threshold is a private constant, in cents)
- INVALID_ACCOUNT → QUEUE_REVIEW, R-ACC-001, "Invalid account details require ops queue review."
- BANK_UNAVAILABLE → QUEUE_REVIEW, R-BKU-001, "Bank unavailable; queued for review and retry."
- any other reason, including a lowercase or padded known code → NEEDS_HUMAN, R-ABSTAIN-001, "Unrecognised reason code; abstaining for human review, never auto-closing." (safe abstain; never AUTO_CLOSE)

Tests cover: each reason's full decision (action, ruleId and rationale), the high-value boundary at 999999 / 1000000 / 1000001 cents, the high-value rule applying only to INSUFFICIENT_FUNDS, unknown / lowercase / padded / empty reasons giving R-ABSTAIN-001 and never AUTO_CLOSE, every ruleId being unique and every rationale non-empty, and a rationale never containing the input reasonCode.
```

**You do:** `npm run format:check` + `npm test` + `npm run typecheck` → commit.

---

## Prompt 3 — Service + degrade (40–70 min)

```text
Next slice ONLY: orchestration service + store + mock settlement + logging + masking. No HTTP API yet.

Files, each with its own tests:
- src/masking.ts — maskBsb("032-001") → "***-001" (last 3 digits kept); maskAccountNumber keeps the last 3 digits and replaces the rest with "*" (same length). Pure
- src/store.ts — createInMemoryCaseStore(): CaseStore { save, findById, list } backed by a Map; returns copies so callers cannot change stored cases
- src/settlement.ts — createMockSettlementClient({ fail = false }): SettlementClient; submit({ reference, amountCents, action }) resolves, or rejects with Error("settlement unavailable") when fail is true
- src/logging.ts — createJsonLogger(write = console.log): Logger { info, warn }; each call writes one JSON line with level, message, ISO timestamp, then the given fields
- src/service.ts — createTriageService({ store, settlement, logger, newId = randomUUID, now = () => new Date() }): TriageService { submit(input: unknown): Promise<SubmitResult>, getCase(id), listCases() }; orchestrates validate → rules → settlement → persist → log
- Types, one file per module under src/types/: service.types.ts (TriageService, TriageServiceDependencies, SubmitResult = { ok: true; case } | { ok: false; errors }, CaseOutcome = Pick<ExceptionCase, "action" | "ruleId" | "rationale">), store.types.ts (CaseStore), settlement.types.ts (SettlementClient, SettlementRequest, MockSettlementOptions), logging.types.ts (Logger, LogFields). Shared ExceptionCase, CaseAction (TriageAction | "DEGRADED") and CaseStatus go in src/types/models.ts

Behaviour:
- Invalid input → { ok: false, errors } with nothing stored or settled; log warn "exception rejected" with invalidFields (field names only, never values)
- Every valid case is sent to settlement, including AUTO_CLOSE
- The case takes its action, ruleId and rationale from the triage decision, and settlement receives the decision's action
- On settlement failure the action is DEGRADED, ruleId "R-DEGRADE-001" and rationale "Settlement unavailable; case degraded and held for retry." (one private CaseOutcome constant, DEGRADED_OUTCOME, in service.ts; a private STATUS_BY_ACTION map from CaseAction to CaseStatus also lives there); the case is still stored (not treated as success); log warn "settlement unavailable, case degraded" with caseId, reference, action, status, ruleId, intendedAction and intendedRuleId (the action and rule the triage chose)
- Status by action: AUTO_CLOSE → CLOSED, QUEUE_REVIEW → QUEUED, NEEDS_HUMAN → AWAITING_HUMAN, DEGRADED → DEGRADED
- ExceptionCase fields: id, reference, amountCents, currency, maskedBsb, maskedAccountNumber, reasonCode, direction, action, status, ruleId, rationale, createdAt (ISO string). The raw BSB and account number are never stored, returned or logged
- Success log: info "exception triaged" with caseId, reference, action, status, ruleId

Service tests cover: happy path, each action → status, degrade, masking before persist, no raw BSB/account number in the case, store or log lines, rejected input not stored, injected id and clock.
```

**You do:** `npm run format:check` + `npm test` + `npm run typecheck` → commit.

---

## Prompt 4 — Fastify HTTP API (70–90 min)

```text
Next slice ONLY: Fastify HTTP API + config + main.

Files:
- src/app.ts — buildApp({ service, logger }): FastifyInstance (Fastify with its own logger: false; the injected JSON logger is the only log output); thin routes, HTTP ↔ service only
- src/config.ts — loadConfig(env = process.env): AppConfig { port, settlementFail }. PORT defaults to 3000; a value that is not a whole number from 1 to 65535 throws Error("PORT must be a whole number between 1 and 65535"). SETTLEMENT_FAIL=true forces the mock settlement to fail (default off). Reads process.env only: no .env file and no dotenv, every variable has a default so nothing needs to be set to run
- src/main.ts — wire store, settlement, service, app; listen on host 127.0.0.1 and log a JSON "server listening" line (host, port, settlementFail); on a startup error print a JSON error line and exit 1
- Types: AppConfig and Environment in src/types/config.types.ts; AppDependencies ({ service, logger }) in src/types/app.types.ts
- Acceptance tests use app.inject (no real network); config tests call loadConfig with plain objects

Endpoints:
- GET /health → 200 { "status": "ok" }
- POST /exceptions → 201 + case; invalid body → 422 { "errors": [{ field, message }] }; malformed or empty JSON body → 422 with errors [{ field: "body", message: "body must be valid JSON" }] (map Fastify's FST_ERR_CTP_* 400 errors)
- GET /exceptions/:id → 200 + case, or 404 { "error": "case not found" }
- GET /exceptions → 200 + array of cases
- A DEGRADED case is still created with 201
- An unexpected error → 500 { "error": "internal error" } with no message, stack or request body in the response; log error details (never the body) with logger.warn "request failed" (error name and route only)
- Other Fastify client errors (for example a non-JSON content type → 415) keep Fastify's default status

Acceptance tests for: create + get + list, validation reject, malformed / empty / array body, unknown reason → NEEDS_HUMAN, settlement fail → DEGRADED, 404, health, unexpected service error → generic 500 with a log line, and the response never containing the raw account number.

Check: `npm run build`, then start `node dist/main.js` in the background, confirm /health responds, and stop it.
```

**You do:** `npm run format:check` + `npm test` + `npm run typecheck` + `npm run build` → commit.

---

## Prompt 5 — Sample data + verify (90–105 min)

```text
Next slice ONLY: sample-data/ + scripts/verify.sh + README. No new product features.

sample-data/:
- insufficient-funds.json (valid, BSB 032-001, expected QUEUE_REVIEW, masked BSB "***-001")
- duplicate-payment.json (valid, AUTO_CLOSE)
- unknown-reason.json (valid, NEEDS_HUMAN; for the safe-abstain example)
- invalid-bsb.json (BSB 032001 with no hyphen; rejected with 422 "bsb must be in the format XXX-XXX using digits only")
- exceptions.jsonl: 8 lines covering queue, auto-close, high-value and unknown outcomes
- tests/sample-data.test.ts (written first): each file gives its expected action or rejection through the real service

scripts/verify.sh (executable, bash 3.2 compatible so it runs on macOS, `set -euo pipefail`):
- steps in order: `npm ci`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`
- smoke test 1: start the BUILT server (`node dist/main.js`) on a free port picked with node, wait for /health, then post every sample file and every exceptions.jsonl line; check HTTP status and expected text; also fail if a response contains a raw account number
- smoke test 2: restart with SETTLEMENT_FAIL=true and check the case is DEGRADED
- trap-based cleanup that kills the server and removes temp files; exit non-zero on the first failed check; print the failing server log; end with "VERIFY PASSED"
- package.json: add "verify": "./scripts/verify.sh"

README required headings:
- what the solution does
- prerequisites (Node.js 20+, npm)
- setup (`npm install` from the repo root)
- run (`npm start`, which builds with esbuild then runs `dist/main.js`; there is no watch mode, so restart after a change) and a health check
- configuration: a table of PORT (default 3000) and SETTLEMENT_FAIL (unset) with meanings; say plainly that no .env file is needed or read, nothing is required, and show setting a variable inline (`PORT=8080 npm start`)
- format, test, build and verify commands (`npm run format`, `npm test`, `npm run build`, `./scripts/verify.sh`); say `./scripts/verify.sh` is the single command a CI pipeline would run
- example workflows, each with a curl command (using sample-data/ files) and the real, trimmed JSON response copied from running the server (omit id, reference, amountCents, currency, reasonCode, direction, createdAt):
  1) happy path: action, status, ruleId, rationale, masked BSB
  2) safe abstain: unknown reason → NEEDS_HUMAN
  3) validation reject: invalid BSB → 422 with error message
  4) degrade: `SETTLEMENT_FAIL=true npm start` → DEGRADED
- known limitations: mock settlement, in-memory store (data lost on restart), no auth, no paging; no Dockerfile or pipeline files are built; the server binds to 127.0.0.1 only, so a container would need a configurable host; the build is an esbuild bundle with dependencies external, so `npm ci --omit=dev` is needed wherever `dist/main.js` runs
- next steps, including a short CI/CD path as text only: PR runs `./scripts/verify.sh` (format check, typecheck, tests, build, smoke; a real pipeline would add ESLint and dependency/secret scanning) → build artifact (container image in a real pipeline) → deploy to staging with a smoke test on `/health` → manual approval → production, with rollback to the previous version
- where to find the evidence pack (`evidence/`, start at `evidence/intent.md`)

Run ./scripts/verify.sh and report the result.
```

**You do:** run `./scripts/verify.sh` → commit.

---

## Prompt 6 — Evidence pack (105–120 min)

```text
Next slice ONLY: concise evidence pack (no code changes unless README links need fixing).
Keep each file short and limited to the sections listed below. Do not duplicate the README: link to it.

- evidence/design.md: architecture overview and module map; data flow
  (request → validate → rules → settlement → persist → log → response);
  component boundaries and why rules stay out of Fastify; why the rule decision
  text (ruleId and rationale) lives in its own `rules.decisions.ts` apart from the
  rule logic; how every decision is explained (ruleId and rationale on the case
  and in the logs); key trade-offs;
  security/privacy (BSB/account masking, synthetic data only, no credentials);
  technology choices (including Prettier for formatting, with lint left to a
  PR-stage check in a real pipeline); likely production/cloud shape. No hexagonal essay.
- evidence/agentic-workflow.md: tool(s) used (Cursor with Claude), how the work was
  decomposed into slices, representative steering prompts, where I intervened, how I
  reviewed generated output, and how TDD can be verified (failing test first in history).
  Sources: `git log`, the one-slice prompts in this runbook, and the author's
  intervention notes. Record only what happened. Representative prompts are the
  real one-slice prompts, never one prompt that asks for the whole solution.
  Note any deviation from this runbook.
- evidence/verify.md: checks run (`npm run format:check`, `npm test`, `npm run typecheck`, `npm run build`,
  `./scripts/verify.sh`, smoke) with the actual results (test counts per file,
  number of smoke checks); known gaps and next steps; which checks run locally
  versus in a PR/pipeline.
- evidence/operate.md: how to run; logs and status (`/health`, JSON logs);
  config env vars with defaults and secrets approach (none required locally;
  no .env file is read); failure modes; rollback and degrade behaviour;
  local → CI/CD → cloud considerations (PR checks, staging with smoke test,
  approval gate, production, rollback; secrets from a managed secret store,
  not the repo). State the build and deploy facts: CI runs `./scripts/verify.sh`
  (which starts with `npm ci`); the artifact is `dist/main.js` from `npm run build`;
  the deployed environment runs `node dist/main.js` (not `npm start`, which
  rebuilds and needs esbuild) after `npm ci --omit=dev`, because dependencies
  are external in the bundle; the server binds to 127.0.0.1, so a container
  needs a configurable host.
- evidence/decisions.md: 3–5 short ADRs (context, decision, consequences), choosing from:
  rules vs ML, abstain over wrong auto-close, a rule id and rationale on every
  decision for explainability, decision text kept in a constants-only
  `rules.decisions.ts` so it can be reviewed apart from the logic, in-memory store
  and mock settlement, flat modules with one types folder vs layered DDD, esbuild bundle instead of
  tsc output or Vite, Prettier only with no ESLint (strict TypeScript and typecheck
  cover most of what a basic lint config would; lint is a PR-stage check in a real
  pipeline). Then "what I intentionally did not build" (UI, auth, real settlement,
  database, ESLint, CI pipeline file, container image, cloud deploy).

Stack named in this repo: Node.js, TypeScript, Fastify, Zod, Vitest, esbuild, Prettier, in-memory store.
```

**You do:** give the agent your intervention notes before sending → final `./scripts/verify.sh` → commit.

---

## Steering lines (paste when the agent drifts)

```text
Do not run git commit, git commit --amend, git reset, git rebase, or git push. Leave changes uncommitted. I will review the diff and commit myself after tests pass.
```

```text
Stop. Do not add UI, auth, Docker, cloud deploy, ML, Vite, or real bank APIs. This step only.
```

```text
Prefer abstain (NEEDS_HUMAN) over incorrect AUTO_CLOSE. Show that in tests.
```

```text
Re-read "Architecture & coding style" in RUNBOOK.md and redo this slice so it complies in full: flat SRP modules, types only in src/types/, functions-only implementation files (except the constants-only src/rules.decisions.ts) grouped by visibility, no unused code, extend rather than redesign. This is a restructure: behaviour must not change and existing tests stay green. Any new behaviour needs a failing test first, shown. Then run `npm run format`, `npm test` and `npm run typecheck`, summarise files touched, and stop.
```
