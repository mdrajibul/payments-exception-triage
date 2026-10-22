# Intent

## Problem

When an AU-style payment fails, an operations team has to decide what to do with it: close it, queue it for review, or escalate it to a person. Doing this by hand is slow, and inconsistent decisions are hard to explain to an auditor. This product ingests a failed payment exception, validates it, applies deterministic rules, stores the outcome and exposes its status.

## Users

- Payments operations analysts who work the review queue and need to know why a case landed there.
- Compliance and audit reviewers who need every decision to be explainable.
- Engineers who run and operate the service.

## Assumptions

- All data is synthetic. There are no credentials, no confidential data and no real bank connections.
- Payments are AUD only, with BSB in the format XXX-XXX and account numbers of 6 to 12 digits.
- Settlement is a mock that can be forced to fail.
- Cases are held in memory and are lost on restart.
- The service runs as a single local process on Node.js 20 or later.

## Constraints

- Stack is fixed: Node.js, TypeScript (strict), Fastify, Zod, Vitest, Prettier and an esbuild bundle, with npm as the package manager.
- Rules are deterministic and hold no hidden state. There is no machine learning.
- No paid APIs, no secrets and no `.env` file.
- Validation, rules and masking stay pure, and rules never live in HTTP handlers.

## Out of scope

- User interface
- Authentication and authorisation
- Real settlement or bank APIs
- Database or any durable storage
- Docker, container images, CI pipeline files and cloud deployment
- Machine learning
- Linting with ESLint

## Success criteria

- A valid exception gets exactly one action.
- An invalid exception is rejected with field-level errors and is not stored.
- An unknown or ambiguous reason is never auto-closed. It abstains with `NEEDS_HUMAN`.
- Every decision carries a `ruleId` and a rationale that explain it.
- When settlement is unavailable the case is still stored and marked `DEGRADED`.
- Raw BSB and account numbers never appear in responses, stored cases or logs.
- One command, `./scripts/verify.sh`, runs every check and a smoke test of the built server.
