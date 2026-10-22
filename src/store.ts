import type { ExceptionCase } from "./types/models";
import type { CaseStore } from "./types/store.types";

export function createInMemoryCaseStore(): CaseStore {
  const casesById = new Map<string, ExceptionCase>();

  return {
    save(exceptionCase) {
      casesById.set(exceptionCase.id, { ...exceptionCase });
    },
    findById(id) {
      const found = casesById.get(id);
      return found && { ...found };
    },
    list() {
      return [...casesById.values()].map((exceptionCase) => ({ ...exceptionCase }));
    },
  };
}
