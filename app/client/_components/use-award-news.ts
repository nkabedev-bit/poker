"use client";

import { useCallback, useEffect, useState } from "react";
import { getClientTelegramWebApp, useClientTMA } from "../layout";
import {
  findAwardNews,
  type AwardNews,
  type AwardShelf,
  type SeenAwards,
} from "@/lib/client/award-news";

/** Telegram's storage keys allow letters, digits, "_" and "-" only. */
const CLOUD_KEYS: Record<AwardShelf, string> = {
  achievements: "seen_achievements",
  medals: "seen_medals",
  tier: "seen_tier",
};

const LOCAL_PREFIX = "club:seen-";

/**
 * Marks a shelf as written. Telegram answers a missing key with an empty string, which
 * would otherwise read the same as a shelf stored empty.
 */
const STORED_PREFIX = "v1:";

/** A store that has not answered by then is skipped for this visit, not waited on. */
const CLOUD_TIMEOUT_MS = 3_000;

type CloudStorage = NonNullable<ReturnType<typeof getClientTelegramWebApp>>["CloudStorage"];

function readShelf(raw: string | null | undefined) {
  if (!raw?.startsWith(STORED_PREFIX)) return null;
  return raw.slice(STORED_PREFIX.length).split(",").filter(Boolean);
}

/** Telegram's own storage inside the mini-app; the web has only this browser's. */
function cloudStorage(inTelegram: boolean): CloudStorage | null {
  if (!inTelegram) return null;

  const tg = getClientTelegramWebApp();
  return tg?.CloudStorage && tg.isVersionAtLeast?.("6.9") ? tg.CloudStorage : null;
}

/** What the shelves read, or null when the store could not be read this time. */
function readSeen(shelves: readonly AwardShelf[], inTelegram: boolean): Promise<SeenAwards | null> {
  const cloud = cloudStorage(inTelegram);

  if (cloud) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(null), CLOUD_TIMEOUT_MS);

      try {
        cloud.getItems(
          shelves.map((shelf) => CLOUD_KEYS[shelf]),
          (error, values) => {
            window.clearTimeout(timer);
            resolve(
              error || !values
                ? null
                : Object.fromEntries(shelves.map((shelf) => [shelf, readShelf(values[CLOUD_KEYS[shelf]])])),
            );
          },
        );
      } catch {
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  }

  try {
    return Promise.resolve(
      Object.fromEntries(
        shelves.map((shelf) => [shelf, readShelf(window.localStorage.getItem(`${LOCAL_PREFIX}${shelf}`))]),
      ),
    );
  } catch {
    return Promise.resolve(null);
  }
}

function writeSeen(next: Partial<Record<AwardShelf, string[]>>, inTelegram: boolean) {
  const cloud = cloudStorage(inTelegram);

  for (const [shelf, ids] of Object.entries(next) as Array<[AwardShelf, string[]]>) {
    const value = `${STORED_PREFIX}${ids.join(",")}`;

    try {
      if (cloud) {
        cloud.setItem(CLOUD_KEYS[shelf], value);
      } else {
        window.localStorage.setItem(`${LOCAL_PREFIX}${shelf}`, value);
      }
    } catch {
      // Not remembered this time: the award may be celebrated once more, and that is all.
    }
  }
}

/**
 * The awards the player has won since they last looked, one at a time.
 *
 * The player's phone remembers what it has shown — Telegram's storage follows them from
 * one device to the next — so the club's server is asked nothing new. Awards are marked
 * as shown the moment they are found: a player who closes the app mid-celebration is not
 * shown the same one again.
 */
export function useAwardNews(held: readonly AwardNews[] | null, shelves: readonly AwardShelf[]) {
  const { initData } = useClientTMA();
  const [news, setNews] = useState<AwardNews[]>([]);
  const shelvesKey = shelves.join(",");

  useEffect(() => {
    if (!held) return;

    let cancelled = false;
    const inTelegram = Boolean(initData);
    const tracked = shelvesKey.split(",") as AwardShelf[];

    void readSeen(tracked, inTelegram).then((seen) => {
      if (cancelled || !seen) return;

      const { fresh, next } = findAwardNews(held, seen);
      const firstVisit = tracked.some((shelf) => !seen[shelf]);
      if (fresh.length > 0 || firstVisit) writeSeen(next, inTelegram);
      if (fresh.length > 0) setNews(fresh);
    });

    return () => {
      cancelled = true;
    };
  }, [held, initData, shelvesKey]);

  const dismiss = useCallback(() => setNews((current) => current.slice(1)), []);

  return { dismiss, left: news.length, news: news[0] ?? null };
}
