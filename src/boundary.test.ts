import assert from "node:assert/strict";
import { test } from "node:test";
import { getDeletionBoundary } from "./boundary.ts";

test("boundary trails UTC midnight of now's date by 33 hours, at noon UTC", () => {
  const now = new Date("2024-01-15T12:00:00.000Z");
  assert.equal(
    getDeletionBoundary(now).toISOString(),
    "2024-01-13T15:00:00.000Z",
  );
});

test("boundary trails UTC midnight of now's date by 33 hours, at UTC midnight", () => {
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

test("at the scheduled run time (15:00 UTC = 0:00 JST the next day), the boundary is 0:00 JST two days earlier - not one", () => {
  // Cron fires at 2024-01-15T15:00:00Z, which is 2024-01-16T00:00:00+09:00
  // in JST - so the run's JST calendar date is the 16th.
  const now = new Date("2024-01-15T15:00:00.000Z");
  const boundary = getDeletionBoundary(now);
  // 2024-01-13T15:00:00Z UTC == 2024-01-14T00:00:00+09:00 JST: the 14th,
  // two days before the run's JST date (the 16th), not one (which would be
  // the 15th).
  assert.equal(boundary.toISOString(), "2024-01-13T15:00:00.000Z");
});
