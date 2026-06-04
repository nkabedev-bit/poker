import { Bot, webhookCallback } from "grammy";
import { createClient } from "@supabase/supabase-js";

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

export const POST = webhookCallback(bot, "std/http", { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET });
