import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { settings } from "./settings.ts";

const ENV_KEYS = [
  "LOOKBACK_DAYS",
  "MAX_DELETES",
  "FULL_SCAN",
  "DRY_RUN",
] as const;
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

test("settings: FULL_SCAN/DRY_RUN default to false when unset or empty", () => {
  assert.equal(settings().fullScan, false);
  assert.equal(settings().dryRun, false);
  process.env.FULL_SCAN = "";
  process.env.DRY_RUN = "";
  assert.equal(settings().fullScan, false);
  assert.equal(settings().dryRun, false);
});

test("settings: FULL_SCAN/DRY_RUN are true for '1' or 'true' (any case)", () => {
  process.env.FULL_SCAN = "1";
  process.env.DRY_RUN = "true";
  assert.equal(settings().fullScan, true);
  assert.equal(settings().dryRun, true);

  process.env.FULL_SCAN = "TRUE";
  assert.equal(settings().fullScan, true);
});

test("settings: FULL_SCAN/DRY_RUN are false for '0' or 'false' (any case) - not truthy like Boolean(str)", () => {
  process.env.FULL_SCAN = "0";
  process.env.DRY_RUN = "false";
  assert.equal(settings().fullScan, false);
  assert.equal(settings().dryRun, false);

  process.env.DRY_RUN = "FALSE";
  assert.equal(settings().dryRun, false);
});

test("settings: FULL_SCAN throws on an unrecognized value", () => {
  process.env.FULL_SCAN = "yes";
  assert.throws(() => settings(), /Invalid FULL_SCAN/);
});

test("settings: DRY_RUN throws on an unrecognized value", () => {
  process.env.DRY_RUN = "yes";
  assert.throws(() => settings(), /Invalid DRY_RUN/);
});
