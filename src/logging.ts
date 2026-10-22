import type { LogFields, Logger } from "./types/logging.types";

export function createJsonLogger(write: (line: string) => void = console.log): Logger {
  return {
    info: (message, fields) => writeLine(write, "info", message, fields),
    warn: (message, fields) => writeLine(write, "warn", message, fields),
  };
}

function writeLine(
  write: (line: string) => void,
  level: "info" | "warn",
  message: string,
  fields: LogFields = {},
): void {
  write(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...fields }));
}
