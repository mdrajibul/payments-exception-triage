# Payments Exception Triage

## What the solution does

A rules-based service that triages failed AU-style payment exceptions. It is a non-AI product built with AI coding agents, and it uses synthetic data only.

An exception goes through one flow: validate, apply deterministic rules, settle, persist and log. Each case gets exactly one action, a `ruleId` and a rationale that explain the decision.

| Outcome | Action | Status | When |
|---------|--------|--------|------|
| Auto-close | `AUTO_CLOSE` | `CLOSED` | Duplicate payment |
| Queue for review | `QUEUE_REVIEW` | `QUEUED` | Insufficient funds, invalid account, bank unavailable |
| Safe abstain | `NEEDS_HUMAN` | `AWAITING_HUMAN` | Unknown reason code, or high-value insufficient funds (1,000,000 cents or more) |
| Degrade | `DEGRADED` | `DEGRADED` | The mock settlement is unavailable; the case is still stored |

An invalid exception is rejected with field-level errors and is not stored. Raw BSB and account numbers never appear in responses, stored cases or logs.

Endpoints:

- `GET /health`
- `POST /exceptions`
- `GET /exceptions/:id`
- `GET /exceptions`

## Prerequisites

- Node.js 20 or later
- npm

## Setup

From the repo root:

```bash
npm install
```

## Run

```bash
npm start
```

`npm start` builds `dist/main.js` with esbuild and then runs it. There is no watch mode, so restart after a change.

Check that it is up:

```bash
curl http://127.0.0.1:3000/health
```

```json
{ "status": "ok" }
```

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | Port to listen on. Must be a whole number from 1 to 65535, otherwise the server exits with an error. |
| `SETTLEMENT_FAIL` | unset | Set to `true` to make the mock settlement fail, so new cases are `DEGRADED`. |

No `.env` file is needed or read, and nothing is required to run. Every variable has a default. Set a variable inline:

```bash
PORT=8080 npm start
```

## Format, test, build and verify

```bash
npm run format        # format src and tests with Prettier
npm test              # unit and acceptance tests
npm run build         # bundle src/main.ts into dist/main.js
./scripts/verify.sh   # every check plus a smoke test of the built server
```

`./scripts/verify.sh` is the single command a CI pipeline would run. It runs `npm ci`, the format check, the type check, the tests and the build, then starts the built server and posts every file in `sample-data/` to it. It also restarts the server with `SETTLEMENT_FAIL=true` to check the degrade path. It ends with `VERIFY PASSED`.

## Example workflows

Start the server with `npm start` first. The responses below are trimmed: `id`, `reference`, `amountCents`, `currency`, `reasonCode`, `direction` and `createdAt` are omitted.

### 1. Happy path

```bash
curl -s -X POST http://127.0.0.1:3000/exceptions \
  -H 'content-type: application/json' \
  --data-binary @sample-data/insufficient-funds.json
```

HTTP 201:

```json
{
  "maskedBsb": "***-001",
  "maskedAccountNumber": "******375",
  "action": "QUEUE_REVIEW",
  "status": "QUEUED",
  "ruleId": "R-NSF-001",
  "rationale": "Insufficient funds requires ops queue review before customer contact."
}
```

### 2. Safe abstain

An unknown reason code is never auto-closed. It goes to a human.

```bash
curl -s -X POST http://127.0.0.1:3000/exceptions \
  -H 'content-type: application/json' \
  --data-binary @sample-data/unknown-reason.json
```

HTTP 201:

```json
{
  "maskedBsb": "***-456",
  "maskedAccountNumber": "******247",
  "action": "NEEDS_HUMAN",
  "status": "AWAITING_HUMAN",
  "ruleId": "R-ABSTAIN-001",
  "rationale": "Unrecognised reason code; abstaining for human review, never auto-closing."
}
```

### 3. Validation reject

```bash
curl -s -X POST http://127.0.0.1:3000/exceptions \
  -H 'content-type: application/json' \
  --data-binary @sample-data/invalid-bsb.json
```

HTTP 422, and nothing is stored:

```json
{
  "errors": [
    {
      "field": "bsb",
      "message": "bsb must be in the format XXX-XXX using digits only"
    }
  ]
}
```

### 4. Degrade

Start the server with the mock settlement failing:

```bash
SETTLEMENT_FAIL=true npm start
```

Then post the same file as the happy path:

```bash
curl -s -X POST http://127.0.0.1:3000/exceptions \
  -H 'content-type: application/json' \
  --data-binary @sample-data/insufficient-funds.json
```

HTTP 201. The case is still created and stored, but marked `DEGRADED`:

```json
{
  "maskedBsb": "***-001",
  "maskedAccountNumber": "******375",
  "action": "DEGRADED",
  "status": "DEGRADED",
  "ruleId": "R-DEGRADE-001",
  "rationale": "Settlement unavailable; case degraded and held for retry."
}
```

## Known limitations

- Settlement is a mock.
- The store is in memory, so data is lost on restart.
- There is no authentication and no paging.
- No Dockerfile or pipeline files are built.
- The server binds to `127.0.0.1` only, so a container would need a configurable host.
- The build is an esbuild bundle with dependencies external, so `npm ci --omit=dev` is needed wherever `dist/main.js` runs.

## Next steps

A short CI/CD path, as text only:

1. A pull request runs `./scripts/verify.sh` (format check, type check, tests, build and smoke test). A real pipeline would add ESLint and dependency and secret scanning.
2. Build the artifact (a container image in a real pipeline).
3. Deploy to staging with a smoke test on `/health`.
4. Manual approval.
5. Deploy to production, with rollback to the previous version.

## Evidence pack

See `evidence/`, and start at `evidence/intent.md`.
