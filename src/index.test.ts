import assert from "node:assert/strict";
import { test } from "node:test";
import { is消したい, type Status } from "./index.ts";
import type { Setting } from "./settings.ts";

const baseStatus: Status = {
  id_str: "",
  full_text: "",
  entities: {},
  created_at: new Date().toDateString(),
};

const baseSetting: Setting = {
  consumerKey: "",
  consumerSecret: "",
  accessToken: "",
  accessTokenSecret: "",
  keepTags: [],
  exceptionIds: [],
  keepTexts: [],
};

test("delete", () => {
  const boundaryDate = new Date();

  assert.equal(is消したい(baseStatus, baseSetting, boundaryDate), true);
});

test("keep_by_id", () => {
  const status: Status = { ...baseStatus, id_str: "12345" };
  const setting: Setting = { ...baseSetting, exceptionIds: ["12345"] };
  const boundaryDate = new Date();

  assert.equal(is消したい(status, setting, boundaryDate), false);
});

test("keep_by_tag", () => {
  const status: Status = {
    ...baseStatus,
    entities: { hashtags: [{ text: "hoge" }] },
  };
  const setting: Setting = { ...baseSetting, keepTags: ["hoge"] };
  const boundaryDate = new Date();

  assert.equal(is消したい(status, setting, boundaryDate), false);
});

test("keep_by_text", () => {
  const status: Status = { ...baseStatus, full_text: "hogehuga" };
  const setting: Setting = { ...baseSetting, keepTexts: [/hoge/] };
  const boundaryDate = new Date();

  assert.equal(is消したい(status, setting, boundaryDate), false);
});

test("keep_by_date", () => {
  const status: Status = { ...baseStatus, created_at: new Date().toString() };
  const boundaryDate = new Date(Date.now() - 1000 * 10); // 10秒ぐらい前

  assert.equal(is消したい(status, baseSetting, boundaryDate), false);
});
