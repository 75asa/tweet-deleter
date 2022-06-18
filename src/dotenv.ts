import * as dotenv from "dotenv";

const config = dotenv.config().parsed;

export const loadEnv = (): void => {
  if (!config) return;
  for (const key in config) {
    process.env[key] = config[key];
  }
};
