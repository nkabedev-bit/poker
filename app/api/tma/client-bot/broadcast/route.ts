import { Bot, InputFile } from "grammy";
import type { Message } from "grammy/types";
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { getClientBot, readBroadcastChats, sendToChats } from "@/lib/client-bot/broadcast";
import { recordClubAnnouncement } from "@/lib/client-bot/announcement-log";

export const dynamic = "force-dynamic";
// The most a Hobby function may run. A broadcast goes out a batch a second, which covers
// thousands of subscribers inside it.
export const maxDuration = 300;

function isUpload(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "size" in value && value.size > 0;
}

/** A file to send, and Telegram's own id for it once it has been uploaded. */
type Attachment = { file: File; fileId: string | null };

function uploadedId(sent: Message) {
  return sent.photo?.at(-1)?.file_id ?? sent.video?.file_id ?? sent.document?.file_id ?? null;
}

/**
 * Sends one file to one chat: by Telegram's id when it already holds the file, uploaded
 * otherwise. Uploading it again for every subscriber took the broadcast past its time.
 */
async function sendAttachment(bot: Bot, chatId: number, attachment: Attachment, caption?: string) {
  const input =
    attachment.fileId ??
    new InputFile(new Uint8Array(await attachment.file.arrayBuffer()), attachment.file.name || "attachment");
  const options = caption ? { caption } : undefined;
  const { type } = attachment.file;

  const sent = type.startsWith("image/")
    ? await bot.api.sendPhoto(chatId, input, options)
    : type.startsWith("video/")
      ? await bot.api.sendVideo(chatId, input, options)
      : await bot.api.sendDocument(chatId, input, options);

  attachment.fileId ??= uploadedId(sent);
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
  const attachments: Attachment[] = files.map((file) => ({ file, fileId: null }));

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

  let chats: number[];
  try {
    chats = await readBroadcastChats(auth.supabase);
  } catch (error) {
    return NextResponse.json(
      { error: (error as { message?: string })?.message ?? "Не удалось прочитать подписчиков" },
      { status: 500 },
    );
  }

  const deliver = async (chatId: number) => {
    if (attachments.length === 0) {
      await bot.api.sendMessage(chatId, message);
      return;
    }

    for (const [index, attachment] of attachments.entries()) {
      await sendAttachment(bot, chatId, attachment, index === 0 ? message : undefined);
    }
  };

  let sent = 0;
  let failed = 0;
  let rest = chats;

  // The files go up once, to the first chat that takes them; everyone after is sent
  // Telegram's own copy by its id, which is what lets the rest go out in parallel.
  if (attachments.length > 0) {
    while (rest.length > 0 && sent === 0) {
      const first = await sendToChats(rest.slice(0, 1), deliver);
      sent += first.sent;
      failed += first.failed;
      rest = rest.slice(1);
    }
  }

  const result = await sendToChats(rest, deliver);
  sent += result.sent;
  failed += result.failed;

  // The copy the app shows, written once the bot has had its turn: everybody reads it,
  // and for a player without Telegram it is the only place this ever appears.
  await recordClubAnnouncement(auth.supabase, message);

  return NextResponse.json({ failed, sent, total: chats.length });
}
