import type { Logger } from "./logging.types";
import type { TriageService } from "./service.types";

export type AppDependencies = {
  service: TriageService;
  logger: Logger;
};
