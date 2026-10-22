import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJsonLogger } from "../src/logging";

describe("createJsonLogger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes one JSON line for an info call", () => {
    const write = vi.fn();
    const logger = createJsonLogger(write);

    logger.info("exception triaged", { caseId: "case-1", reference: "PAY-0001" });

    expect(write).toHaveBeenCalledTimes(1);
    const line = write.mock.calls[0]?.[0] as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      level: "info",
      message: "exception triaged",
      timestamp: "2026-10-22T04:00:00.000Z",
      caseId: "case-1",
      reference: "PAY-0001",
    });
  });

  it("writes level warn for a warn call", () => {
    const write = vi.fn();
    const logger = createJsonLogger(write);

    logger.warn("exception rejected", { invalidFields: ["bsb"] });

    const line = write.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toEqual({
      level: "warn",
      message: "exception rejected",
      timestamp: "2026-10-22T04:00:00.000Z",
      invalidFields: ["bsb"],
    });
  });

  it("writes level, message and timestamp first, then the given fields", () => {
    const write = vi.fn();
    const logger = createJsonLogger(write);

    logger.info("exception triaged", { caseId: "case-1", status: "QUEUED" });

    const line = write.mock.calls[0]?.[0] as string;
    expect(Object.keys(JSON.parse(line))).toEqual([
      "level",
      "message",
      "timestamp",
      "caseId",
      "status",
    ]);
  });

  it("works without fields", () => {
    const write = vi.fn();
    const logger = createJsonLogger(write);

    logger.info("server listening");

    const line = write.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toEqual({
      level: "info",
      message: "server listening",
      timestamp: "2026-10-22T04:00:00.000Z",
    });
  });

  it("writes one line per call", () => {
    const write = vi.fn();
    const logger = createJsonLogger(write);

    logger.info("first");
    logger.warn("second");
    logger.info("third");

    expect(write).toHaveBeenCalledTimes(3);
  });

  it("uses a fresh timestamp for every call", () => {
    const write = vi.fn();
    const logger = createJsonLogger(write);

    logger.info("first");
    vi.setSystemTime(new Date("2026-10-22T04:00:05.000Z"));
    logger.info("second");

    const timestamps = write.mock.calls.map(([line]) => JSON.parse(line as string).timestamp);
    expect(timestamps).toEqual(["2026-10-22T04:00:00.000Z", "2026-10-22T04:00:05.000Z"]);
  });

  it("writes with console.log by default", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createJsonLogger();

    logger.info("server listening", { port: 3000 });

    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleLog.mock.calls[0]?.[0] as string)).toMatchObject({
      level: "info",
      message: "server listening",
      port: 3000,
    });
  });
});
