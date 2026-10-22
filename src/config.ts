import type { AppConfig, Environment } from "./types/config.types";

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const PORT_ERROR_MESSAGE = "PORT must be a whole number between 1 and 65535";
const WHOLE_NUMBER_PATTERN = /^\d+$/;

export function loadConfig(env: Environment = process.env): AppConfig {
  return {
    port: parsePort(env.PORT),
    settlementFail: env.SETTLEMENT_FAIL === "true",
  };
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }
  const port = WHOLE_NUMBER_PATTERN.test(value) ? Number(value) : Number.NaN;
  if (!(port >= 1 && port <= MAX_PORT)) {
    throw new Error(PORT_ERROR_MESSAGE);
  }
  return port;
}
