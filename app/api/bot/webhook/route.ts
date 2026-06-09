import { Bot, webhookCallback } from "grammy";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { removePersistedPlayerLabel, setPersistedPlayerLabel } from "@/lib/player-labels";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
    await ctx.reply("Привет! Вы авторизованы. Нажмите на кнопку ниже, чтобы открыть панель управления.", {
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

async function persistPlayers(
  supabase: ReturnType<typeof getAdminSupabase>,
  tournament: { id: string; public_token: string },
  extras: Record<string, unknown>,
  players: ExtrasPlayer[],
) {
  const nextData = { ...extras, players };
  await supabase.from("tournament_extras").update({ data: nextData }).eq("tournament_id", tournament.id);

  const { broadcastPublicState } = await import("@/lib/realtime/broadcast");
  await broadcastPublicState(tournament.public_token);
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
    const context = await loadTournamentAndPlayers(supabase);
    if (!context) return ctx.reply("Ошибка: турнир не найден.");

    // Always store the label by nickname (works even when no game is running);
    // also apply it to any matching player(s) currently in the roster.
    context.extras.playerLabels = setPersistedPlayerLabel(
      context.extras.playerLabels as Record<string, string> | undefined,
      nickname,
      label,
    );
    const matches = findPlayersByName(context.players, nickname);
    for (const player of matches) player.label = label;

    await persistPlayers(supabase, context.tournament, context.extras, context.players);

    const liveNote =
      matches.length > 0
        ? `Применено в текущей игре (${matches.length}).`
        : "Сейчас игрок не в игре — метка применится при регистрации.";
    await ctx.reply(`Метка "${label}" сохранена для "${nickname}". ${liveNote}`);
  } catch (err: unknown) {
    console.error("Error in /givecolor command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${message}`);
  }
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
    const context = await loadTournamentAndPlayers(supabase);
    if (!context) return ctx.reply("Ошибка: турнир не найден.");

    // Always clear the stored label (works even when no game is running);
    // also clear it from any matching player(s) currently in the roster.
    context.extras.playerLabels = removePersistedPlayerLabel(
      context.extras.playerLabels as Record<string, string> | undefined,
      nickname,
    );
    const matches = findPlayersByName(context.players, nickname);
    for (const player of matches) player.label = null;

    await persistPlayers(supabase, context.tournament, context.extras, context.players);

    await ctx.reply(`Метка снята с "${nickname}" — и в текущей игре, и на будущих.`);
  } catch (err: unknown) {
    console.error("Error in /removecolor command:", err);
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${message}`);
  }
});

export const POST = webhookCallback(bot, "std/http", { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET });
