import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { settings } from "./settings.ts";

const ENV_KEYS = ["LOOKBACK_DAYS", "MAX_DELETES"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test("settings: LOOKBACK_DAYS/MAX_DELETES default when unset", () => {
  const setting = settings();
  assert.equal(setting.lookbackDays, 7);
  assert.equal(setting.maxDeletes, 50);
});

test("settings: LOOKBACK_DAYS/MAX_DELETES default when empty string", () => {
  process.env.LOOKBACK_DAYS = "";
  process.env.MAX_DELETES = "";
  const setting = settings();
  assert.equal(setting.lookbackDays, 7);
  assert.equal(setting.maxDeletes, 50);
});

test("settings: LOOKBACK_DAYS/MAX_DELETES honor a valid override", () => {
  process.env.LOOKBACK_DAYS = "14";
  process.env.MAX_DELETES = "10";
  const setting = settings();
  assert.equal(setting.lookbackDays, 14);
  assert.equal(setting.maxDeletes, 10);
});

test("settings: LOOKBACK_DAYS throws on a non-numeric value", () => {
  process.env.LOOKBACK_DAYS = "abc";
  assert.throws(() => settings(), /Invalid LOOKBACK_DAYS/);
});

test("settings: MAX_DELETES throws on zero", () => {
  process.env.MAX_DELETES = "0";
  assert.throws(() => settings(), /Invalid MAX_DELETES/);
});

test("settings: MAX_DELETES throws on a negative value", () => {
  process.env.MAX_DELETES = "-1";
  assert.throws(() => settings(), /Invalid MAX_DELETES/);
});
