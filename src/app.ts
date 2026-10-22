import Fastify from "fastify";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDependencies } from "./types/app.types";
import type { Logger } from "./types/logging.types";

const INVALID_JSON_ERRORS = [{ field: "body", message: "body must be valid JSON" }];

export function buildApp({ service, logger }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/exceptions", async (request, reply) => {
    const result = await service.submit(request.body);
    if (!result.ok) {
      return reply.code(422).send({ errors: result.errors });
    }
    return reply.code(201).send(result.case);
  });

  app.get<{ Params: { id: string } }>("/exceptions/:id", async (request, reply) => {
    const found = service.getCase(request.params.id);
    if (!found) {
      return reply.code(404).send({ error: "case not found" });
    }
    return found;
  });

  app.get("/exceptions", async () => service.listCases());

  app.setErrorHandler<FastifyError>((error, request, reply) =>
    handleError(logger, error, request, reply),
  );

  return app;
}

function handleError(
  logger: Logger,
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (isUnreadableBody(error)) {
    return reply.code(422).send({ errors: INVALID_JSON_ERRORS });
  }
  if (isClientError(error)) {
    return reply.send(error);
  }
  logger.warn("request failed", { errorName: error.name, route: request.routeOptions.url });
  return reply.code(500).send({ error: "internal error" });
}

function isUnreadableBody(error: FastifyError): boolean {
  return error.code?.startsWith("FST_ERR_CTP_") === true && error.statusCode === 400;
}

function isClientError(error: FastifyError): boolean {
  return error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500;
}
