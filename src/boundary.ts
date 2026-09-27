const JST_OFFSET_MS = -9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The deletion boundary: "yesterday 0:00 JST", expressed as a UTC `Date`.
 *
 * Posts created at or before this instant are eligible for deletion (subject
 * to the `keepTags` / `keepTexts` / `exceptionIds` rules in `is消したい`).
 *
 * Pure function of `now` so it can be unit-tested without mocking the clock.
 */
export const getDeletionBoundary = (now: Date): Date => {
  return new Date(
    now.valueOf() - (now.valueOf() % DAY_MS) - DAY_MS + JST_OFFSET_MS,
  );
};
