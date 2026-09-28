const JST_OFFSET_MS = -9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The deletion boundary, expressed as a UTC `Date`: UTC midnight of `now`'s
 * calendar date, minus 33 hours (24h + 9h).
 *
 * This used to be described as "yesterday 0:00 JST", but that's only true
 * when `now` falls before 15:00 UTC. The scheduled workflow's `now` is
 * *at* 15:00 UTC (cron `"0 15 * * *"`, meant to be 0:00 JST) - right at the
 * JST day rollover - so in production the boundary actually lands on 0:00
 * JST *two* days before the run's JST calendar date, not one: a post has
 * roughly a 2-day grace period after being posted before it becomes
 * eligible for deletion, not 1.
 *
 * Posts created at or before this instant are eligible for deletion (subject
 * to the `keepTags` / `keepTexts` / `exceptionIds` rules in `is消したい`).
 *
 * Pure function of `now` so it can be unit-tested without mocking the clock.
 * The math itself is unchanged from the original "yesterday" implementation.
 */
export const getDeletionBoundary = (now: Date): Date => {
  return new Date(
    now.valueOf() - (now.valueOf() % DAY_MS) - DAY_MS + JST_OFFSET_MS,
  );
};
