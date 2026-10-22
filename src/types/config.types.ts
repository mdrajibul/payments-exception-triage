export type Environment = Record<string, string | undefined>;

export type AppConfig = {
  port: number;
  settlementFail: boolean;
};
