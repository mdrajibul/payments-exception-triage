# Agentic workflow

This records what happened. Sources are `git log`, the one-slice prompts in [RUNBOOK.md](../RUNBOOK.md), and the build session.

## Tool

Cursor, with Claude as the coding agent.

## How the work was decomposed

The runbook was written and committed first, then the build ran as one prompt per slice. Each slice is one commit, made by the author. The agent never ran `git commit`, `git reset`, `git rebase` or `git push`.

| Commit | Time | Slice |
|--------|------|-------|
| `353df04` | 14:47 | Runbook alone (commit 1) |
| `0fab89b` | 14:55 | Prompt 0: scaffold |
| `eaa7fe8` | 15:15 | Prompt 1: validation |
| `2837684` | 15:36 | Prompt 2: rules and safe abstain |
| `01fb82f` | 16:03 | Prompt 3: service, store, settlement, logging, masking |
| `d0ed7ed` | 16:20 | Prompt 4: Fastify API, config, main |
| `ca9267c` | 16:34 | Prompt 5: sample data, verify script, README |

This file and the rest of the evidence pack are Prompt 6, written last so they describe what was done. The times are commit times on 22 Oct 2026, so they include review time as well as agent time.

## Representative steering prompts

The real prompt sent for each slice, with `N` changed:

```text
Read RUNBOOK.md and execute Prompt N only. Follow the ground rules and the text of the prompt exactly. Do not start Prompt N+1. Do not commit.
```

Prompts 0 to 5 used this form. Prompt 6 left out the "Do not start" sentence, because there is no next prompt. The runbook's own template also names the "Architecture & coding style" section. The agent was told to read `RUNBOOK.md`, so that section was in scope, but the wording sent was shorter than the template. The slice text itself (files, behaviour and checks) is the prompt in `RUNBOOK.md`, unchanged.

None of the steering lines at the bottom of the runbook were needed.

## Where I intervened

- **GitHub account.** I asked the agent to re-authenticate the GitHub CLI as `mdrajibul`, because the CLI was logged in as a different account than the remote.
- **Commit 1 title.** The runbook's timebox map suggests `docs: add incremental build runbook`. The commit is `docs(runbook): add incremental runbook for payments exception triage`.

No other intervention notes were supplied when this file was written, so anything not listed here was not recorded. Add any further interventions before submitting.

## Where the agent's output needed correcting

- **Prompt 4: 415 example.** The runbook says a non-JSON content type gives `415`. In Fastify 5, `text/plain` is parsed as a string by default, so it reaches validation and returns `422` with `body must be a JSON object`. A type Fastify cannot parse, such as `application/xml`, gives `415`. The agent found this from a failing test and a probe of Fastify's error codes, fixed its own test to use `application/xml`, and added a test recording the `text/plain` behaviour.
- **Prompt 4: type error.** Vitest passed but `npm run typecheck` rejected the error handler, because Fastify types the error as `unknown`. The agent gave the handler an explicit error type.
- **Prompt 5: test count.** The commit message for `ca9267c` says 8 sample-data tests. There are 9. Eight failed before the sample files existed, and one (the outcome-coverage test) does not read any file, so it passed. The counts in [verify.md](verify.md) are the correct ones.
- **Stray artefact.** While counting tests for a summary, the agent created a `.vitest/` report folder in the repo and deleted it straight away. It was never committed.

## How generated output was reviewed

Each slice ended with the agent listing the files it touched and the results of `npm run format`, `npm test` and `npm run typecheck` (plus `npm run build` or `./scripts/verify.sh` for Prompts 4 and 5). The author then committed the slice. The agent also ran the built server by hand in Prompt 4 and `./scripts/verify.sh` in Prompt 5, including one deliberately broken run to confirm the script fails with exit code 1 and prints the server log. How closely the author read each diff before committing was not recorded.

## How TDD can be verified

Each slice's tests and code are in the same commit, so `git log` alone does not show a failing test first. No separate red commits were made. The red-then-green evidence is in the agent output for each slice:

| Slice | Red run | Green run |
|-------|---------|-----------|
| Prompt 0 | no tests in this slice | `format:check` and `typecheck` pass |
| Prompt 1 | `Cannot find module '../src/validation'` | 64 passed |
| Prompt 2 | `Cannot find module '../src/rules'` | 87 passed |
| Prompt 3, small modules | four suites failed with `Cannot find module` | 115 passed |
| Prompt 3, service | `Cannot find module '../src/service'` | 148 passed |
| Prompt 4 | `Cannot find module '../src/app'` and `'../src/config'` | 200 of 201, then 201 after the two fixes above |
| Prompt 5 | 8 tests failed with `ENOENT` for the missing sample files | 210 passed |

A reviewer who needs red commits in history would have to ask for them in a rerun; the runbook allows an optional red commit before the green one.
