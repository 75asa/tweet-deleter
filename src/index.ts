import { type Setting, settings } from "./settings.ts";
import TwitterUtil from "./twitter-util.ts";

export interface Status {
  id_str: string;
  full_text: string;
  entities: {
    hashtags?: { text: string }[] | null;
  };
  created_at: string;
}

export const is消したい = (
  status: Status,
  setting: Setting,
  boundaryDate: Date,
): boolean => {
  const { exceptionIds, keepTags, keepTexts } = setting;
  const {
    id_str,
    full_text,
    entities: { hashtags },
    created_at,
  } = status;
  if (exceptionIds.includes(id_str)) return false;
  if (keepTexts.some((keepText) => keepText.test(full_text))) return false;
  if (hashtags) {
    for (const tag of hashtags) {
      if (keepTags.includes(tag.text)) return false;
    }
  }
  if (new Date(created_at) > boundaryDate) return false;
  return true;
};

const main = async () => {
  const repoUrl = "https://github.com/75asa/tweet-deleter";
  const dryRun = Boolean(process.env.DRY_RUN);
  const setting = settings();
  const twitter = new TwitterUtil(setting);
  try {
    const statuses = await twitter.getAllTweets();

    const now = new Date();
    const tokyoTimezoneOffset = -9 * 1000 * 60 * 60;
    const yesterday0oclock = new Date(
      now.valueOf() -
        (now.valueOf() % 86400000) -
        86400000 +
        tokyoTimezoneOffset,
    );

    const statusesToDelete = statuses.filter((status) => {
      return is消したい(status, setting, yesterday0oclock);
    });

    if (dryRun) {
      for (const status of statusesToDelete) {
        console.log(`[DRY RUN] ${status.id_str} ${status.full_text}`);
      }
      console.log(
        `[DRY RUN] ${statusesToDelete.length}個のツイートが削除対象です`,
      );
      return;
    }

    for (const status of statusesToDelete) {
      await twitter.destroy(status.id_str);
    }

    if (statusesToDelete.length)
      await twitter.tweet(
        `【BOT】 ${statusesToDelete.length}個のツイートを削除しました\n${repoUrl}`,
      );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    if (!dryRun) await twitter.tweet(`【BOT】 エラーが発生しました: ${error}`);
  } finally {
    process.exit();
  }
};

if (import.meta.main) {
  main();
}
