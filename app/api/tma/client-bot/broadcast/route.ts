import { Bot, InputFile } from "grammy";
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { getClientBot } from "@/lib/client-bot/broadcast";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isUpload(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "size" in value && value.size > 0;
}

async function sendFile(bot: Bot, chatId: number, file: File, caption?: string) {
  const input = new InputFile(new Uint8Array(await file.arrayBuffer()), file.name || "attachment");

  if (file.type.startsWith("image/")) {
    await bot.api.sendPhoto(chatId, input, caption ? { caption } : undefined);
    return;
  }

  if (file.type.startsWith("video/")) {
    await bot.api.sendVideo(chatId, input, caption ? { caption } : undefined);
    return;
  }

  await bot.api.sendDocument(chatId, input, caption ? { caption } : undefined);
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const bot = getClientBot();
  if (!bot) {
    return NextResponse.json(
      { error: "CLIENT_TELEGRAM_BOT_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const message = String(formData.get("message") ?? "").trim();
  const files = formData.getAll("attachments").filter(isUpload);

  if (!message && files.length === 0) {
    return NextResponse.json({ error: "Message or attachment is required" }, { status: 400 });
  }

  // Отложка: если задан будущий sendAt — кладём в очередь, не отправляем сейчас.
  const sendAtRaw = String(formData.get("sendAt") ?? "").trim();
  if (sendAtRaw) {
    const sendAt = new Date(sendAtRaw);
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "sendAt must be a future date" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json(
        { error: "Message is required for scheduled broadcast" },
        { status: 400 },
      );
    }
    if (files.length > 0) {
      return NextResponse.json(
        { error: "Attachments are not supported for scheduled broadcasts" },
        { status: 400 },
      );
    }
    const { data, error } = await auth.supabase
      .from("scheduled_broadcasts")
      .insert({ message, send_at: sendAt.toISOString() })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ scheduled: true, id: data.id, sendAt: sendAt.toISOString() });
  }

  const { data: users, error } = await auth.supabase
    .from("client_bot_users")
    .select("chat_id")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const user of users ?? []) {
    const chatId = Number(user.chat_id);
    try {
      if (files.length === 0) {
        await bot.api.sendMessage(chatId, message);
      } else {
        for (const [index, file] of files.entries()) {
          await sendFile(bot, chatId, file, index === 0 ? message : undefined);
        }
      }
      sent += 1;
    } catch (error) {
      console.error("Client bot broadcast failed", { chatId, error });
      failed += 1;
    }
  }

  return NextResponse.json({ failed, sent, total: users?.length ?? 0 });
}
