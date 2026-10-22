import { randomUUID } from "node:crypto";
import { maskAccountNumber, maskBsb } from "./masking";
import { triage } from "./rules";
import { validatePaymentException } from "./validation";
import type { Logger } from "./types/logging.types";
import type { CaseAction, CaseStatus, ExceptionCase, PaymentException } from "./types/models";
import type { SettlementClient, SettlementRequest } from "./types/settlement.types";
import type {
  CaseOutcome,
  SubmitResult,
  TriageService,
  TriageServiceDependencies,
} from "./types/service.types";
import type { ValidationError } from "./types/validation.types";

const DEGRADED_OUTCOME = {
  action: "DEGRADED",
  ruleId: "R-DEGRADE-001",
  rationale: "Settlement unavailable; case degraded and held for retry.",
} as const satisfies CaseOutcome;

const STATUS_BY_ACTION = {
  AUTO_CLOSE: "CLOSED",
  QUEUE_REVIEW: "QUEUED",
  NEEDS_HUMAN: "AWAITING_HUMAN",
  DEGRADED: "DEGRADED",
} as const satisfies Record<CaseAction, CaseStatus>;

export function createTriageService({
  store,
  settlement,
  logger,
  newId = randomUUID,
  now = () => new Date(),
}: TriageServiceDependencies): TriageService {
  return {
    async submit(input: unknown): Promise<SubmitResult> {
      const validation = validatePaymentException(input);
      if (!validation.ok) {
        logRejected(logger, validation.errors);
        return { ok: false, errors: validation.errors };
      }

      const exception = validation.value;
      const decision = triage(exception);
      const settled = await trySettle(settlement, {
        reference: exception.reference,
        amountCents: exception.amountCents,
        action: decision.action,
      });
      const outcome = settled ? decision : DEGRADED_OUTCOME;
      const exceptionCase = toExceptionCase(exception, outcome, newId(), now().toISOString());

      store.save(exceptionCase);
      if (settled) {
        logTriaged(logger, exceptionCase);
      } else {
        logDegraded(logger, exceptionCase, decision);
      }
      return { ok: true, case: exceptionCase };
    },
    getCase: (id) => store.findById(id),
    listCases: () => store.list(),
  };
}

async function trySettle(
  settlement: SettlementClient,
  request: SettlementRequest,
): Promise<boolean> {
  try {
    await settlement.submit(request);
    return true;
  } catch {
    return false;
  }
}

function toExceptionCase(
  exception: PaymentException,
  outcome: CaseOutcome,
  id: string,
  createdAt: string,
): ExceptionCase {
  return {
    id,
    reference: exception.reference,
    amountCents: exception.amountCents,
    currency: exception.currency,
    maskedBsb: maskBsb(exception.bsb),
    maskedAccountNumber: maskAccountNumber(exception.accountNumber),
    reasonCode: exception.reasonCode,
    direction: exception.direction,
    action: outcome.action,
    status: STATUS_BY_ACTION[outcome.action],
    ruleId: outcome.ruleId,
    rationale: outcome.rationale,
    createdAt,
  };
}

function logRejected(logger: Logger, errors: ValidationError[]): void {
  logger.warn("exception rejected", { invalidFields: errors.map((error) => error.field) });
}

function logTriaged(logger: Logger, exceptionCase: ExceptionCase): void {
  logger.info("exception triaged", {
    caseId: exceptionCase.id,
    reference: exceptionCase.reference,
    action: exceptionCase.action,
    status: exceptionCase.status,
    ruleId: exceptionCase.ruleId,
  });
}

function logDegraded(logger: Logger, exceptionCase: ExceptionCase, intended: CaseOutcome): void {
  logger.warn("settlement unavailable, case degraded", {
    caseId: exceptionCase.id,
    reference: exceptionCase.reference,
    action: exceptionCase.action,
    status: exceptionCase.status,
    ruleId: exceptionCase.ruleId,
    intendedAction: intended.action,
    intendedRuleId: intended.ruleId,
  });
}
