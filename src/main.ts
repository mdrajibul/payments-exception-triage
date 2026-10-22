import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createJsonLogger } from "./logging";
import { createTriageService } from "./service";
import { createMockSettlementClient } from "./settlement";
import { createInMemoryCaseStore } from "./store";

const HOST = "127.0.0.1";

main().catch(reportStartupError);

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createJsonLogger();
  const service = createTriageService({
    store: createInMemoryCaseStore(),
    settlement: createMockSettlementClient({ fail: config.settlementFail }),
    logger,
  });
  const app = buildApp({ service, logger });

  await app.listen({ host: HOST, port: config.port });
  logger.info("server listening", {
    host: HOST,
    port: config.port,
    settlementFail: config.settlementFail,
  });
}

function reportStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      message: "startup failed",
      timestamp: new Date().toISOString(),
      error: message,
    }),
  );
  process.exit(1);
}
