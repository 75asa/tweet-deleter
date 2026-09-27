import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import { loadKeepRules } from "./settings.ts";

const dir = mkdtempSync(join(tmpdir(), "keep-rules-test-"));
let counter = 0;

const writeKeepRulesFile = (content: string): string => {
  const path = join(dir, `keep-rules-${counter++}.json`);
  writeFileSync(path, content);
  return path;
};

afterEach(() => {
  delete process.env.KEEP_RULES_PATH;
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("loads and compiles a valid keep rules file", () => {
  const path = writeKeepRulesFile(
    JSON.stringify({
      keepTags: ["keep"],
      exceptionIds: ["123"],
      keepTexts: ["hoge"],
    }),
  );

  const rules = loadKeepRules(path);

  assert.deepEqual(rules.keepTags, ["keep"]);
  assert.deepEqual(rules.exceptionIds, ["123"]);
  assert.equal(rules.keepTexts.length, 1);
  assert.ok(rules.keepTexts[0] instanceof RegExp);
  assert.ok(rules.keepTexts[0]?.test("hogehoge"));
});

test("uses KEEP_RULES_PATH env var when no path argument is given", () => {
  const path = writeKeepRulesFile(
    JSON.stringify({ keepTags: [], exceptionIds: [], keepTexts: [] }),
  );
  process.env.KEEP_RULES_PATH = path;

  const rules = loadKeepRules();

  assert.deepEqual(rules.keepTags, []);
});

test("throws a clear error when the file does not exist", () => {
  assert.throws(
    () => loadKeepRules(join(dir, "does-not-exist.json")),
    /Failed to read keep rules file/,
  );
});

test("throws a clear error on invalid JSON", () => {
  const path = writeKeepRulesFile("{ not valid json");

  assert.throws(
    () => loadKeepRules(path),
    /Failed to parse keep rules file .* as JSON/,
  );
});

test("throws a clear error when the top-level value is not an object", () => {
  const path = writeKeepRulesFile(JSON.stringify(["a", "b"]));

  assert.throws(() => loadKeepRules(path), /expected a JSON object/);
});

test("throws a clear error when keepTags is not a string array", () => {
  const path = writeKeepRulesFile(
    JSON.stringify({ keepTags: [1, 2], exceptionIds: [], keepTexts: [] }),
  );

  assert.throws(
    () => loadKeepRules(path),
    /"keepTags" must be an array of strings/,
  );
});

test("throws a clear error when exceptionIds is not a string array", () => {
  const path = writeKeepRulesFile(
    JSON.stringify({ keepTags: [], exceptionIds: [1], keepTexts: [] }),
  );

  assert.throws(
    () => loadKeepRules(path),
    /"exceptionIds" must be an array of strings/,
  );
});

test("throws a clear error when keepTexts is not a string array", () => {
  const path = writeKeepRulesFile(
    JSON.stringify({ keepTags: [], exceptionIds: [], keepTexts: [1] }),
  );

  assert.throws(
    () => loadKeepRules(path),
    /"keepTexts" must be an array of strings/,
  );
});

test("throws a clear error when a keepTexts pattern is an invalid regex", () => {
  const path = writeKeepRulesFile(
    JSON.stringify({ keepTags: [], exceptionIds: [], keepTexts: ["("] }),
  );

  assert.throws(() => loadKeepRules(path), /invalid regular expression/);
});
