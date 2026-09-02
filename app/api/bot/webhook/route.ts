import { Bot, webhookCallback, type Context } from "grammy";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { removePersistedPlayerLabel, setPersistedPlayerLabel } from "@/lib/player-labels";
import {
  ADMIN_BOT_COMMANDS_MESSAGE,
  ADMIN_BOT_MENU_COMMANDS,
  buildBirthdayDigestMessage,
} from "@/lib/admin-bot/messages";
import { getUpcomingBirthdays } from "@/lib/google-sheets";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

import {
  describeFreeEntries,
  parseFreeEntryCommand,
} from "@/lib/free-entries/command";
import { findClientBotUserByNickname } from "@/lib/client-bot/nickname-match";

// The club owner asked for one more person to be able to hand out passes.
const FREE_ENTRY_MANAGER_ID = 384428007;

export const dynamic = "force-dynamic";
export const maxDuration = 30; // max 30s timeout

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "mock");

bot.command("start", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  const supabase = getAdminSupabase();
  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id")
    .eq("telegram_id", adminId)
    .maybeSingle();

  if (admin) {
    await ctx.reply("Привет! Вы авторизованы. Нажмите на кнопку ниже, чтобы открыть панель управления.\n\nВсе команды — /info", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Управление турниром",
              web_app: { url: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/tma/players` },
            },
          ],
        ],
      },
    });
  } else {
    await ctx.reply("У вас нет доступа к этой панели.");
  }
});

async function isTournamentAdmin(supabase: ReturnType<typeof getAdminSupabase>, adminId: number) {
  const { data } = await supabase
    .from("tma_admins")
    .select("telegram_id")
    .eq("telegram_id", adminId)
    .maybeSingle();

  return Boolean(data);
}

bot.command("info", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  if (!(await isTournamentAdmin(getAdminSupabase(), adminId))) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  await ctx.reply(ADMIN_BOT_COMMANDS_MESSAGE);
});

// Who has a birthday coming up, read straight from the "анкеты" sheet — the same source
// the nightly notification uses.
bot.command("birthday", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  if (!(await isTournamentAdmin(getAdminSupabase(), adminId))) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  try {
    await ctx.reply(buildBirthdayDigestMessage(await getUpcomingBirthdays()));
  } catch (err: unknown) {
    console.error("Error in /birthday command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Не удалось прочитать лист «анкеты»: ${message}`);
  }
});

// Registers the command list with Telegram so new commands show up in the "/" menu
// without a manual trip to BotFather.
bot.command("setupmenu", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  if (!(await isTournamentAdmin(getAdminSupabase(), adminId))) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  try {
    await ctx.api.setMyCommands(ADMIN_BOT_MENU_COMMANDS);
    await ctx.reply(`Меню команд обновлено (${ADMIN_BOT_MENU_COMMANDS.length}). Нажмите «/» в поле ввода.`);
  } catch (err: unknown) {
    console.error("Error in /setupmenu command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Не удалось обновить меню: ${message}`);
  }
});

bot.command("addadmin", async (ctx) => {
  const telegramId = ctx.from?.id;
  const superAdminId = parseInt(process.env.TMA_SUPER_ADMIN_ID || "0", 10);
  
  if (!telegramId || telegramId !== superAdminId) {
    return ctx.reply("Нет прав.");
  }

  const text = ctx.message?.text || "";
  const parts = text.split(" ");
  if (parts.length !== 3) {
    return ctx.reply("Использование: /addadmin <telegram_id> <Имя>");
  }

  const newAdminId = parseInt(parts[1], 10);
  const name = parts.slice(2).join(" ");
  
  if (isNaN(newAdminId)) {
    return ctx.reply("Неверный ID");
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("tma_admins")
    .insert({ telegram_id: newAdminId, name, added_by: telegramId });

  if (error) {
    return ctx.reply(`Ошибка: ${error.message}`);
  }

  await ctx.reply(`Администратор ${name} (${newAdminId}) добавлен.`);
});

bot.command("admins", async (ctx) => {
  const telegramId = ctx.from?.id;
  const superAdminId = parseInt(process.env.TMA_SUPER_ADMIN_ID || "0", 10);
  
  if (!telegramId || telegramId !== superAdminId) {
    return ctx.reply("Нет прав.");
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from("tma_admins").select("*");

  if (error) return ctx.reply("Ошибка загрузки");

  if (!data || data.length === 0) {
    return ctx.reply("Список пуст.");
  }

  const msg = data.map((d) => `- ${d.name} (${d.telegram_id})`).join("\n");
  await ctx.reply(`Список администраторов:\n${msg}`);
});

bot.command("removeadmin", async (ctx) => {
  const telegramId = ctx.from?.id;
  const superAdminId = parseInt(process.env.TMA_SUPER_ADMIN_ID || "0", 10);
  
  if (!telegramId || telegramId !== superAdminId) {
    return ctx.reply("Нет прав.");
  }

  const parts = ctx.message?.text?.split(" ") || [];
  if (parts.length !== 2) {
    return ctx.reply("Использование: /removeadmin <telegram_id>");
  }

  const rmId = parseInt(parts[1], 10);
  if (isNaN(rmId)) return ctx.reply("Неверный ID");

  const supabase = getAdminSupabase();
  await supabase.from("tma_admins").delete().eq("telegram_id", rmId);
  await ctx.reply(`Админ ${rmId} удален.`);
});

bot.command("clearsheet", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  const supabase = getAdminSupabase();
  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id")
    .eq("telegram_id", adminId)
    .maybeSingle();

  if (!admin) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  try {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("id, public_token")
      .limit(1)
      .single();

    if (!tournament) {
      return ctx.reply("Ошибка: турнир не найден.");
    }

    const { getEliminationSheetName, getMoscowDayRange, clearTournamentSheet } = await import("@/lib/google-sheets");
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const { data: extrasData } = await supabase
      .from("tournament_extras")
      .select("data")
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    const extras = extrasData?.data as { players?: unknown; settings?: { sheetsSessionStartedAt?: unknown } } | null | undefined;
    const sessionStartedAt = typeof extras?.settings?.sheetsSessionStartedAt === "string"
      ? extras.settings.sheetsSessionStartedAt
      : null;
    const { startIso, endIso } = getMoscowDayRange();
    const sheetName = getEliminationSheetName(sessionStartedAt);

    // 1. Delete bounty logs only for the current tournament sheet window
    await supabase
      .from("bounty_log")
      .delete()
      .eq("tournament_id", tournament.id)
      .gte("recorded_at", sessionStartedAt ?? startIso)
      .lt("recorded_at", sessionStartedAt ? new Date().toISOString() : endIso);

    // 2. Clear players in tournament_extras
    if (extras) {
      const currentPlayers = Array.isArray(extras.players)
        ? extras.players as Record<string, unknown>[]
        : [];
      const nextPlayers = currentPlayers.map((player) => ({
        ...player,
        status: "active",
        finishPlace: null,
        rebuys: 0,
        addons: 0,
        bountyCount: 0,
        mysteryBountyPoints: 0,
      }));
      const nextData = {
        ...extras,
        settings: extras.settings ?? {},
        players: nextPlayers,
      };
      await supabase
        .from("tournament_extras")
        .update({ data: nextData })
        .eq("tournament_id", tournament.id);
    }

    // 3. Reset timer state to not_started
    await supabase
      .from("timer_state")
      .update({
        status: "not_started",
        current_level_index: 0,
        level_started_at: null,
        paused_remaining_seconds: null,
        registration_closes_at: null,
        finished_at: null,
      })
      .eq("tournament_id", tournament.id);

    // 4. Clear Google Sheet today's sheet
    if (spreadsheetId) {
      await clearTournamentSheet(spreadsheetId, sheetName);
    }

    const { broadcastPublicState } = await import("@/lib/realtime/broadcast");
    await broadcastPublicState(tournament.public_token);

    revalidatePath("/admin/players");
    revalidatePath("/admin/timer");
    revalidatePath("/admin/settings");
    revalidatePath("/screen/[token]", "page");

    await ctx.reply(`Лист "${sheetName}" в Google Таблице и база данных турнира успешно очищены.`);
  } catch (err: unknown) {
    console.error("Error in /clearsheet command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка при очистке: ${message}`);
  }
});

// Rebuild the current game's sheet from bounty_log. The per-elimination sync runs in the
// background and its failures are swallowed, so a Google Sheets outage (a write-quota burst
// during rapid knockouts, most of all) silently leaves the sheet behind the database. The
// sync is a full rewrite, so a single successful run restores the sheet — this command is
// that run, on demand. Unlike /clearsheet it only READS the database; nothing is deleted.
bot.command("resync", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  const supabase = getAdminSupabase();
  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id")
    .eq("telegram_id", adminId)
    .maybeSingle();

  if (!admin) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  try {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("id")
      .limit(1)
      .single();

    if (!tournament) {
      return ctx.reply("Ошибка: турнир не найден.");
    }

    const { getEffectiveSessionStart, syncTournamentToSheets, syncVipSheet } = await import("@/lib/google-sheets");

    const { data: extrasData } = await supabase
      .from("tournament_extras")
      .select("data")
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    const extras = extrasData?.data as { settings?: { sheetsSessionStartedAt?: unknown } } | null | undefined;
    const rawSessionStart = typeof extras?.settings?.sheetsSessionStartedAt === "string"
      ? extras.settings.sheetsSessionStartedAt
      : null;
    // A stale session start makes the sync fall back to the current Moscow day, which after
    // midnight targets a different sheet than the game being restored. Say so explicitly:
    // the admin can still read the reported sheet name and see it is the wrong one.
    const sessionExpired = Boolean(rawSessionStart) && getEffectiveSessionStart(rawSessionStart) === null;

    const result = await syncTournamentToSheets(supabase, tournament.id);

    if (!result) {
      return ctx.reply("Google Sheets не настроен: нет GOOGLE_SHEET_ID или GOOGLE_SERVICE_ACCOUNT_KEY.");
    }

    // The per-elimination sync no longer touches the VIP tab (a knockout cannot change who
    // is VIP — that is fixed by registration number), so this manual rebuild is the place
    // that repairs a VIP write lost during registration.
    await syncVipSheet(supabase, tournament.id);

    const warning = sessionExpired
      ? "\n\nВнимание: сессия игры устарела (>12 часов), лист выбран по текущей дате."
      : "";

    await ctx.reply(
      `Лист "${result.sheetName}" пересобран из базы.\n`
      + `Вылетов: ${result.eliminationCount}\n`
      + `Игроков в зачёте: ${result.standingsCount}${warning}`,
    );
  } catch (err: unknown) {
    console.error("Error in /resync command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка при пересинхронизации: ${message}`);
  }
});

type ExtrasPlayer = Record<string, unknown> & { name?: unknown; label?: unknown };

async function loadTournamentAndPlayers(supabase: ReturnType<typeof getAdminSupabase>) {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) return null;

  const { data: extrasData } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  const extras = (extrasData?.data ?? {}) as Record<string, unknown> & { players?: unknown };
  const players = Array.isArray(extras.players) ? (extras.players as ExtrasPlayer[]) : [];

  return { tournament, extras, players };
}

function findPlayersByName(players: ExtrasPlayer[], nickname: string) {
  const target = nickname.trim().toLowerCase();
  return players.filter(
    (player) => typeof player.name === "string" && player.name.trim().toLowerCase() === target,
  );
}

function isMissingSetPlayerLabelRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? "");
  return code === "PGRST202" || message.includes("set_player_label");
}

// Set (label is a string) or remove (label is null) a player's display label.
// Goes through the set_player_label RPC, which locks the tournament_extras row and
// patches ONLY the label data — so a registration/elimination/add-on committing at the
// same moment can never be clobbered. If the migration is not deployed yet, falls back
// to the legacy whole-extras rewrite (which carries the old lost-update risk) so the
// commands keep working regardless of deploy order.
// Returns the number of live roster players the label was applied to, or null when
// there is no tournament.
async function applyPlayerLabelChange(
  supabase: ReturnType<typeof getAdminSupabase>,
  nickname: string,
  label: string | null,
): Promise<number | null> {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) return null;

  let matched: number;
  const { data, error } = await supabase.rpc("set_player_label", {
    p_tournament_id: tournament.id,
    p_nickname: nickname,
    p_label: label,
  });

  if (!error) {
    matched = Number((data as { matched?: unknown } | null)?.matched ?? 0);
  } else if (isMissingSetPlayerLabelRpcError(error)) {
    console.warn("set_player_label RPC is unavailable; falling back to legacy label write", error);
    const context = await loadTournamentAndPlayers(supabase);
    if (!context) return null;

    context.extras.playerLabels =
      label === null
        ? removePersistedPlayerLabel(
          context.extras.playerLabels as Record<string, string> | undefined,
          nickname,
        )
        : setPersistedPlayerLabel(
          context.extras.playerLabels as Record<string, string> | undefined,
          nickname,
          label,
        );
    const matches = findPlayersByName(context.players, nickname);
    for (const player of matches) player.label = label;

    const nextData = { ...context.extras, players: context.players };
    await supabase
      .from("tournament_extras")
      .update({ data: nextData })
      .eq("tournament_id", tournament.id);
    matched = matches.length;
  } else {
    throw error;
  }

  const { broadcastPublicState } = await import("@/lib/realtime/broadcast");
  await broadcastPublicState(tournament.public_token);

  return matched;
}

bot.command("givecolor", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  const supabase = getAdminSupabase();
  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id")
    .eq("telegram_id", adminId)
    .maybeSingle();

  if (!admin) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  const text = ctx.message?.text || "";
  const match = text.match(/^\/givecolor(?:@\S+)?\s+(.+?)\s+to\s+(.+)$/i);
  if (!match) {
    return ctx.reply("Использование: /givecolor <метка> to <ник>");
  }

  const label = match[1].trim();
  const nickname = match[2].trim();

  try {
    // Always stores the label by nickname (works even when no game is running) and
    // applies it to any matching player(s) currently in the roster.
    const matched = await applyPlayerLabelChange(supabase, nickname, label);
    if (matched === null) return ctx.reply("Ошибка: турнир не найден.");

    const liveNote =
      matched > 0
        ? `Применено в текущей игре (${matched}).`
        : "Сейчас игрок не в игре — метка применится при регистрации.";
    await ctx.reply(`Метка "${label}" сохранена для "${nickname}". ${liveNote}`);
  } catch (err: unknown) {
    console.error("Error in /givecolor command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${message}`);
  }
});

/**
 * Free entries are money, so only the club's owners hand them out — not every admin
 * with access to this bot.
 */
function canManageFreeEntries(telegramId: number | undefined) {
  if (!telegramId) return false;

  const superAdminId = parseInt(process.env.TMA_SUPER_ADMIN_ID || "0", 10);
  const managers = [superAdminId, FREE_ENTRY_MANAGER_ID].filter(Boolean);

  return managers.includes(telegramId);
}

async function changeFreeEntries(ctx: Context, direction: 1 | -1) {
  if (!canManageFreeEntries(ctx.from?.id)) {
    return ctx.reply("Нет прав.");
  }

  const parsed = parseFreeEntryCommand(ctx.message?.text || "");
  if (!parsed) {
    return ctx.reply(
      direction === 1
        ? "Использование: /free [vip] <ник> [сколько]"
        : "Использование: /delete free [vip] <ник> [сколько]",
    );
  }

  const supabase = getAdminSupabase();
  const match = await findClientBotUserByNickname(supabase, parsed.nickname);

  if (match.ambiguous) {
    return ctx.reply(`Ник «${parsed.nickname}» встречается у нескольких игроков — уточните.`);
  }
  if (!match.user) {
    return ctx.reply(`Игрок «${parsed.nickname}» не найден среди анкет.`);
  }

  const column = parsed.vip ? "vip_free_entries" : "free_entries";
  const { data: current } = await supabase
    .from("client_bot_users")
    .select(column)
    .eq("telegram_id", match.user.telegramId)
    .maybeSingle();

  const held = Number((current as Record<string, number> | null)?.[column] ?? 0);
  // Taking away more than a player holds leaves them at zero rather than in debt.
  const next = Math.max(0, held + direction * parsed.count);

  const { error } = await supabase
    .from("client_bot_users")
    .update({ [column]: next })
    .eq("telegram_id", match.user.telegramId);

  if (error) {
    console.error("Failed to change free entries", error);
    return ctx.reply("Не удалось изменить проходки. Попробуйте ещё раз.");
  }

  const changed = Math.abs(next - held);
  const action = direction === 1 ? "Выдано" : "Снято";
  const kindLeft = parsed.vip ? "VIP-проходок" : "проходок";

  return ctx.reply(
    `${action}: ${describeFreeEntries(changed, parsed.vip)} игроку «${match.user.displayName}».\n` +
      `Теперь у него ${next} ${kindLeft}.`,
  );
}

bot.command("free", async (ctx) => {
  await changeFreeEntries(ctx, 1);
});

// Telegram cannot register "/delete free" as one command, so the text is matched.
bot.hears(/^\/(?:delete\s*free|deletefree)(?:@\S+)?\b/i, async (ctx) => {
  await changeFreeEntries(ctx, -1);
});

bot.command("removecolor", async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId) return;

  const supabase = getAdminSupabase();
  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id")
    .eq("telegram_id", adminId)
    .maybeSingle();

  if (!admin) {
    return ctx.reply("У вас нет прав для выполнения этой команды.");
  }

  const text = ctx.message?.text || "";
  const match = text.match(/^\/removecolor(?:@\S+)?\s+(.+)$/i);
  if (!match) {
    return ctx.reply("Использование: /removecolor <ник>");
  }

  const nickname = match[1].trim();

  try {
    // Always clears the stored label (works even when no game is running) and clears
    // it from any matching player(s) currently in the roster.
    const matched = await applyPlayerLabelChange(supabase, nickname, null);
    if (matched === null) return ctx.reply("Ошибка: турнир не найден.");

    await ctx.reply(`Метка снята с "${nickname}" — и в текущей игре, и на будущих.`);
  } catch (err: unknown) {
    console.error("Error in /removecolor command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${message}`);
  }
});

export const POST = webhookCallback(bot, "std/http", { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET });
