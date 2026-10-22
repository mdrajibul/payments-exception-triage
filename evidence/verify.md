# Verify

Results of the final run on 22 Oct 2026. Commands and the single CI entry point are in the [README](../README.md#format-test-build-and-verify).

## Checks run

| Check | Result |
|-------|--------|
| `npm run format:check` | All matched files use Prettier code style |
| `npm run typecheck` | No errors |
| `npm test` | 10 files, 210 tests, 0 failed |
| `npm run build` | `dist/main.js` built |
| `./scripts/verify.sh` | `VERIFY PASSED`, exit code 0, about 14 seconds |
| Smoke | 17 checks passed |

`./scripts/verify.sh` also passes under macOS's default bash 3.2. A deliberately broken copy of it (one wrong expected action) exited 1 and printed the failing response and the server log; that copy was deleted. `npm ci` reported 0 vulnerabilities during the run.

## Test counts per file

| File | Tests |
|------|-------|
| `tests/validation.test.ts` | 64 |
| `tests/rules.test.ts` | 23 |
| `tests/masking.test.ts` | 9 |
| `tests/store.test.ts` | 8 |
| `tests/settlement.test.ts` | 4 |
| `tests/logging.test.ts` | 7 |
| `tests/service.test.ts` | 33 |
| `tests/app.test.ts` | 27 |
| `tests/config.test.ts` | 26 |
| `tests/sample-data.test.ts` | 9 |
| **Total** | **210** |

## Smoke checks (17)

Smoke test 1, built server with settlement available (14 checks):

- 1 health check
- 4 sample files (`insufficient-funds.json`, `duplicate-payment.json`, `unknown-reason.json` and `invalid-bsb.json`) checked for status and expected text
- 8 lines of `exceptions.jsonl` checked for status, action and `ruleId`
- 1 check that the server log has no raw account number

Smoke test 2, built server with `SETTLEMENT_FAIL=true` (3 checks):

- 1 health check
- 1 post of `insufficient-funds.json`, expecting `DEGRADED` and `R-DEGRADE-001`
- 1 check that the server log has no raw account number

Every response is also checked for the raw account number of the request that produced it.

## Known gaps and next steps

- No lint step. ESLint is left to a PR-stage check in a real pipeline.
- No dependency or secret scanning.
- No code coverage measurement.
- Smoke tests run against the built server on localhost only. There is no container build and no deployed-environment test.
- Settlement is a mock, so its real failure modes are not exercised.
- The expected outcomes for `exceptions.jsonl` are written in both `tests/sample-data.test.ts` and `scripts/verify.sh`. A change to the sample data needs both updated.
- `./scripts/verify.sh` needs network access for `npm ci`.
- Dependency versions are caret ranges resolved at install time, with the lockfile fixing what CI installs.
- The TDD red runs are in the agent output, not in separate commits. See [agentic-workflow.md](agentic-workflow.md).

## Local versus PR or pipeline

| Runs locally today | Would run in a PR or pipeline |
|--------------------|-------------------------------|
| `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build` | The same four checks, through `./scripts/verify.sh` |
| `./scripts/verify.sh` with the smoke tests | `./scripts/verify.sh`, which is the single CI command |
| Nothing for the rest | ESLint, dependency and secret scanning, container build, staging smoke test on `/health`, manual approval, production deploy with rollback |
