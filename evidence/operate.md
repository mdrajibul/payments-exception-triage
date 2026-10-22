# Operate

Setup, run and example calls are in the [README](../README.md). This file covers running it as a service.

## How to run

- Local: `npm install`, then `npm start`. This builds `dist/main.js` with esbuild and runs it. There is no watch mode.
- Deployed: `node dist/main.js` after `npm ci --omit=dev`. Do not use `npm start` in a deployed environment, because it rebuilds and needs esbuild.

## Logs and status

- `GET /health` returns `200 {"status":"ok"}` once the server is listening.
- Logs are one JSON line per event on stdout, with `level`, `message` and an ISO `timestamp` followed by the event fields. Fastify's own logger is off, so these lines are the only log output.

| Message | Level | Meaning |
|---------|-------|---------|
| `server listening` | info | Started. Fields: `host`, `port`, `settlementFail`. |
| `exception triaged` | info | A case was created. Fields: `caseId`, `reference`, `action`, `status`, `ruleId`. |
| `exception rejected` | warn | Validation failed. Field: `invalidFields` (names only). |
| `settlement unavailable, case degraded` | warn | Case stored as `DEGRADED`. Adds `intendedAction` and `intendedRuleId`. |
| `request failed` | warn | An unexpected error returned a 500. Fields: `errorName`, `route`. |

A startup failure prints a single JSON error line (`level` `error`, message `startup failed`) to stderr and exits with code 1.

## Config

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | Whole number from 1 to 65535, otherwise startup fails. |
| `SETTLEMENT_FAIL` | unset | Only the exact value `true` forces the mock settlement to fail. |

Nothing is required locally and there are no secrets. No `.env` file is read and there is no `dotenv`. In a real deployment, secrets would come from a managed secret store and be injected as environment variables, never from the repo.

## Failure modes

| Situation | Behaviour |
|-----------|-----------|
| Invalid `PORT` | Startup JSON error line, exit 1. |
| Port already in use | Startup JSON error line, exit 1. |
| Invalid body | `422` with field-level errors. Nothing stored. |
| Malformed or empty JSON | `422` with `body must be valid JSON`. |
| Unrecognised content type | Fastify's default `415`. |
| Unknown or ambiguous reason | `201` with `NEEDS_HUMAN` and `R-ABSTAIN-001`. Never auto-closed. |
| Settlement unavailable | `201` with a stored `DEGRADED` case and `R-DEGRADE-001`. |
| Unexpected error | Generic `500 {"error":"internal error"}`, with a `request failed` warning. |
| Process restart | All cases are lost, because the store is in memory. |

## Rollback and degrade behaviour

- A `DEGRADED` case is kept, not dropped. The warning log records the action and rule the triage had chosen (`intendedAction`, `intendedRuleId`), so an operator can tell what should have happened.
- There is no automatic retry and no endpoint to resubmit a degraded case. The rationale text says the case is held for retry, but retry is not built.
- Rollback is redeploying the previous artifact. The store is in memory, so there is nothing to migrate or restore.

## Local, CI/CD and cloud

1. **Local:** `./scripts/verify.sh` runs every check and a smoke test of the built server.
2. **Pull request:** CI runs `./scripts/verify.sh`, which starts with `npm ci`. A real pipeline would add ESLint and dependency and secret scanning.
3. **Artifact:** `dist/main.js` from `npm run build`. A real pipeline would build a container image from it.
4. **Staging:** deploy and run a smoke test against `/health`.
5. **Approval gate:** manual approval before production.
6. **Production:** deploy, with rollback to the previous version.

Build and deploy facts:

- `./scripts/verify.sh` is the single CI command.
- The deployed environment runs `node dist/main.js` after `npm ci --omit=dev`, because dependencies are external in the bundle.
- The server binds to `127.0.0.1`, so a container would need a configurable host before it can be reached from outside.
