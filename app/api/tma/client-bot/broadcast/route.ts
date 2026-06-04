import { Bot, InputFile } from "grammy";
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getClientBot() {
  const token = process.env.CLIENT_TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return new Bot(token);
}

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
