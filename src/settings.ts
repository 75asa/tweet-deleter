import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Setting {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  keepTags: string[];
  exceptionIds: string[];
  keepTexts: RegExp[];
}

interface KeepRules {
  keepTags: string[];
  exceptionIds: string[];
  keepTexts: RegExp[];
}

const DEFAULT_KEEP_RULES_PATH = fileURLToPath(
  new URL("../keep-rules.json", import.meta.url),
);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const assertStringArray = (
  value: unknown,
  field: string,
  path: string,
): string[] => {
  if (!isStringArray(value)) {
    throw new Error(
      `Invalid keep rules file at "${path}": "${field}" must be an array of strings`,
    );
  }
  return value;
};

export function loadKeepRules(
  path: string = process.env.KEEP_RULES_PATH || DEFAULT_KEEP_RULES_PATH,
): KeepRules {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read keep rules file at "${path}": ${(error as Error).message}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse keep rules file at "${path}" as JSON: ${(error as Error).message}`,
    );
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(
      `Invalid keep rules file at "${path}": expected a JSON object`,
    );
  }

  const { keepTags, exceptionIds, keepTexts } = json as Record<string, unknown>;

  const keepTextPatterns = assertStringArray(keepTexts, "keepTexts", path);

  const compiledKeepTexts = keepTextPatterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new Error(
        `Invalid keep rules file at "${path}": invalid regular expression "${pattern}" in "keepTexts": ${(error as Error).message}`,
      );
    }
  });

  return {
    keepTags: assertStringArray(keepTags, "keepTags", path),
    exceptionIds: assertStringArray(exceptionIds, "exceptionIds", path),
    keepTexts: compiledKeepTexts,
  };
}

export function settings(): Setting {
  const keepRules = loadKeepRules();
  return {
    consumerKey: process.env.CONSUMER_KEY || "",
    consumerSecret: process.env.CONSUMER_SECRET || "",
    accessToken: process.env.ACCESS_TOKEN || "",
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "",
    ...keepRules,
  };
}
