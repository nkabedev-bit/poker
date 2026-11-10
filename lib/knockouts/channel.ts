import "server-only";

import type { Api } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientBot } from "@/lib/client-bot/broadcast";

/**
 * The club's channel, where the final table is followed knockout by knockout. The client
 * bot does the posting, so it has to be one of the channel's admins with the right to
 * post; that right also lets it take its own posts down.
 */
export const FINAL_TABLE_CHANNEL = "@majesticpokerptz";

/**
 * How many players are left when the channel asks who will win. The knockout that leaves
 * them is the last one posted: from there on the poll speaks for the final table.
 */
export const FINAL_TABLE_POLL_PLAYERS = 4;

export const FINAL_TABLE_POLL_QUESTION = "кто займет топ 1?";

/** Telegram turns away a poll answer longer than this. */
const POLL_OPTION_MAX_LENGTH = 100;

/** Telegram wants at least two answers in a poll and takes no more than this. */
const POLL_OPTIONS_MAX = 10;

export type FinalTablePost =
  | { kind: "message"; text: string }
  | { kind: "poll"; options: string[]; question: string };

/**
 * What the channel is told about one knockout.
 *
 * Only places at the final table are posted, down to the one that leaves
 * `FINAL_TABLE_POLL_PLAYERS` in the game; that knockout also brings the poll, whose
 * answers are the players still in. A re-entry took no place and is never posted.
 */
export function planFinalTablePosts({
  finalTableSize,
  place,
  playerName,
  remaining,
}: {
  finalTableSize: number;
  /** Null for a re-entry. */
  place: number | null;
  playerName: string;
  /** Names of the players still in the game after this knockout. */
  remaining: string[];
}): FinalTablePost[] {
  if (place === null || place > finalTableSize || place <= FINAL_TABLE_POLL_PLAYERS) return [];

  const posts: FinalTablePost[] = [
    { kind: "message", text: `${playerName.trim() || "Игрок"} вылетел — ${place} место` },
  ];

  if (place !== FINAL_TABLE_POLL_PLAYERS + 1) return posts;

  const options = remaining
    .map((name) => name.trim().slice(0, POLL_OPTION_MAX_LENGTH))
    .filter(Boolean);
  if (options.length < 2 || options.length > POLL_OPTIONS_MAX) return posts;

  return [...posts, { kind: "poll", options, question: FINAL_TABLE_POLL_QUESTION }];
}

type ChannelApi = Pick<Api, "deleteMessage" | "sendMessage" | "sendPoll">;

/**
 * Sends the posts in order and answers with the ids of those that went out.
 *
 * Stops at the first failure: a poll that follows a knockout nobody saw would make no
 * sense, and whatever broke the first send — most likely the bot not being an admin of
 * the channel — breaks the next one too.
 */
export async function sendFinalTablePosts(api: ChannelApi, posts: FinalTablePost[]) {
  const messageIds: number[] = [];

  for (const post of posts) {
    try {
      const sent =
        post.kind === "message"
          ? await api.sendMessage(FINAL_TABLE_CHANNEL, post.text)
          : await api.sendPoll(FINAL_TABLE_CHANNEL, post.question, post.options, {
              // A channel only takes anonymous polls.
              is_anonymous: true,
            });
      messageIds.push(sent.message_id);
    } catch (error) {
      console.error(`Failed to post the final table to ${FINAL_TABLE_CHANNEL}`, error);
      break;
    }
  }

  return messageIds;
}

/** The message ids stored with a knockout, as far as anything can tell from a database row. */
export function readChannelMessageIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
}

let channelQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs channel work one task at a time. Two players often go out in the same hand, and
 * the desk records them seconds apart: sent side by side, the 6th place could land under
 * the 5th, or after the poll.
 */
function inChannelQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = channelQueue.then(task, task);
  channelQueue = run.catch(() => undefined);
  return run;
}

/**
 * Tells the channel about a knockout, and remembers what was posted with the knockout's
 * log entry, so that cancelling the knockout can take the posts down again.
 *
 * Never throws: the knockout is recorded whether or not Telegram answers.
 */
export async function announceFinalTableKnockout(
  supabase: SupabaseClient,
  {
    bountyLogId,
    ...knockout
  }: Parameters<typeof planFinalTablePosts>[0] & { bountyLogId: string | null },
) {
  try {
    const posts = planFinalTablePosts(knockout);
    if (posts.length === 0) return;

    const bot = getClientBot();
    if (!bot) {
      console.warn("CLIENT_TELEGRAM_BOT_TOKEN is not set; the final table is not posted");
      return;
    }

    const messageIds = await inChannelQueue(() => sendFinalTablePosts(bot.api, posts));
    if (messageIds.length === 0 || !bountyLogId) return;

    const { error } = await supabase
      .from("bounty_log")
      .update({ channel_message_ids: messageIds })
      .eq("id", bountyLogId);

    // The posts are out either way; without the ids a cancelled knockout stays in the
    // channel until somebody deletes it by hand. Most likely cause is migration
    // 202611100001 not being applied yet.
    if (error) console.error("Failed to remember the final table posts", error);
  } catch (error) {
    console.error("Non-critical final table channel error:", error);
  }
}

/**
 * Takes down what the channel was told about a knockout that has been cancelled — the
 * knockout itself and, for 5th place, the poll that came with it.
 *
 * Never throws: the cancellation stands whether or not Telegram answers.
 */
export async function withdrawFinalTablePosts(storedMessageIds: unknown) {
  try {
    const messageIds = readChannelMessageIds(storedMessageIds);
    if (messageIds.length === 0) return;

    const bot = getClientBot();
    if (!bot) return;

    await inChannelQueue(async () => {
      for (const messageId of messageIds) {
        try {
          await bot.api.deleteMessage(FINAL_TABLE_CHANNEL, messageId);
        } catch (error) {
          console.error(`Failed to delete message ${messageId} from ${FINAL_TABLE_CHANNEL}`, error);
        }
      }
    });
  } catch (error) {
    console.error("Non-critical final table channel error:", error);
  }
}
