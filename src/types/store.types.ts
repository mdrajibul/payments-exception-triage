import type { ExceptionCase } from "./models";

export type CaseStore = {
  save(exceptionCase: ExceptionCase): void;
  findById(id: string): ExceptionCase | undefined;
  list(): ExceptionCase[];
};
