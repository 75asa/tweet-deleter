import assert from "node:assert/strict";
import { test } from "node:test";
import { getDeletionBoundary } from "./boundary.ts";

test("boundary is yesterday 0:00 JST, at noon UTC", () => {
  const now = new Date("2024-01-15T12:00:00.000Z");
  assert.equal(
    getDeletionBoundary(now).toISOString(),
    "2024-01-13T15:00:00.000Z",
  );
});

test("boundary is yesterday 0:00 JST, at UTC midnight", () => {
  const now = new Date("2024-01-15T00:00:00.000Z");
  assert.equal(
    getDeletionBoundary(now).toISOString(),
    "2024-01-13T15:00:00.000Z",
  );
});

test("boundary crosses a month boundary correctly", () => {
  const now = new Date("2024-03-01T09:30:00.000Z");
  assert.equal(
    getDeletionBoundary(now).toISOString(),
    "2024-02-28T15:00:00.000Z",
  );
});

test("boundary crosses a year boundary correctly", () => {
  const now = new Date("2024-12-31T23:59:59.999Z");
  assert.equal(
    getDeletionBoundary(now).toISOString(),
    "2024-12-29T15:00:00.000Z",
  );
});

test("boundary is always earlier than now", () => {
  const now = new Date();
  assert.ok(getDeletionBoundary(now) < now);
});
