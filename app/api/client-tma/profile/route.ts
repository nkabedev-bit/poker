import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { appendClientBotProfileRow } from "@/lib/google-sheets";
import {
  isValidBirthDate,
  normalizeClientBotText,
  startsLikeSheetFormula,
} from "@/lib/client-bot/registration";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { SHEET_FORMULA_MESSAGE } from "@/lib/players/nickname-change";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  agreementAccepted: z.literal(true, {
    message: "Без принятия пользовательского соглашения записаться нельзя",
  }),
  birthDate: z
    .string()
    .trim()
    .transform(formatBirthDate)
    .refine(isValidBirthDate, "Укажите дату рождения в формате ДД.ММ.ГГГГ"),
  discoverySource: z.string().trim().min(1, "Расскажите, как вы о нас узнали").max(200),
  fullName: z.string().trim().min(2, "Укажите имя и фамилию").max(100),
  // Optional, and missing altogether from a mini-app build cached before the question.
  invitedBy: z.string().trim().max(40, "Ник пригласившего — не длиннее 40 символов").default(""),
  nickname: z
    .string()
    .trim()
    .min(2, "Укажите игровой никнейм")
    .max(40)
    .refine((value) => !startsLikeSheetFormula(value), SHEET_FORMULA_MESSAGE),
  notificationsConsent: z.boolean(),
  phone: z.string().trim().min(5, "Укажите номер телефона").max(30),
  ratingConsent: z.boolean(),
});

/** A member of the club a newcomer names as the one who brought them in. */
type Referrer = { display_name: string; id: string };

// Анкета присылает ДД.ММ.ГГГГ, но кэшированная старая сборка мини-аппа могла отдать
// ISO из <input type="date"> — приводим к одному формату до валидации.
function formatBirthDate(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return isoMatch ? `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}` : value;
}

export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  // The nickname is locked to the player once submitted, so a filled-in profile is
  // never silently overwritten by a second submit.
  if (auth.user.profile_submitted_at) {
    return NextResponse.json(
      { error: "already_submitted", message: "Анкета уже заполнена." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", message: parsed.error.issues[0]?.message ?? "Проверьте поля анкеты." },
      { status: 400 },
    );
  }

  // One nickname, one player. Without this a member who already has an account could
  // fill the questionnaire again from the web — answering "нет, я впервые" out of habit
  // — and end up with two profiles under one name: the passes, medals and sign-ups
  // split between them, and the very flow that would join them back refusing to guess
  // which is which ever after.
  const nicknameKey = buildNicknameKey(parsed.data.nickname);
  const { data: taken } = await auth.supabase
    .from("client_bot_users")
    .select("id")
    .eq("nickname_key", nicknameKey)
    .neq("id", auth.user.id)
    .limit(1);

  if ((taken ?? []).length > 0) {
    return NextResponse.json(
      {
        error: "nickname_taken",
        message:
          "Этот никнейм уже занят. Если это вы — вернитесь назад и выберите «Да, играл», " +
          "чтобы найти свой профиль.",
      },
      { status: 409 },
    );
  }

  // Who brought the player in, when they name somebody. Only a member of the club counts:
  // the referral achievements will be counted off this link, so a name the club does not
  // know is sent back to be picked from the list rather than kept as a dangling guess.
  const invitedBy = normalizeClientBotText(parsed.data.invitedBy);
  let referrer: Referrer | null = null;

  if (invitedBy) {
    const invitedByKey = buildNicknameKey(invitedBy);
    if (invitedByKey) {
      const { data: members, error: memberError } = await auth.supabase
        .from("client_bot_users")
        .select("id, display_name")
        .eq("nickname_key", invitedByKey)
        .not("profile_submitted_at", "is", null)
        .neq("id", auth.user.id)
        .limit(1);

      if (memberError) throw memberError;
      referrer = ((members ?? []) as Referrer[])[0] ?? null;
    }

    if (!referrer) {
      return NextResponse.json(
        {
          error: "referrer_not_found",
          message:
            `Не нашли в клубе игрока «${invitedBy}». Выберите его из подсказок ` +
            "или оставьте поле пустым.",
        },
        { status: 400 },
      );
    }
  }

  const answers = {
    agreementAccepted: true,
    birthDate: parsed.data.birthDate,
    discoverySource: normalizeClientBotText(parsed.data.discoverySource),
    fullName: normalizeClientBotText(parsed.data.fullName),
    // The member's nickname as the club spells it, not as the newcomer typed it.
    invitedBy: referrer?.display_name ?? "",
    nickname: normalizeClientBotText(parsed.data.nickname),
    notificationsConsent: parsed.data.notificationsConsent,
    phone: normalizeClientBotText(parsed.data.phone),
    ratingConsent: parsed.data.ratingConsent,
  };

  const submittedAt = new Date();

  const { error } = await auth.supabase
    .from("client_bot_users")
    .update({
      display_name: answers.nickname,
      pending_display_name: null,
      pending_profile_answers: answers,
      profile_submitted_at: submittedAt.toISOString(),
      state: "idle",
    })
    .eq("id", auth.user.id);

  if (error) throw error;

  // The link has a column of its own, written apart from the questionnaire: until the
  // migration that adds it (202609270001) is applied, this write fails and the player
  // still gets in. The answer above keeps the nickname, and the migration links whoever
  // came in between.
  if (referrer) {
    const { error: referralError } = await auth.supabase
      .from("client_bot_users")
      .update({ referred_by_user_id: referrer.id })
      .eq("id", auth.user.id);

    if (referralError) console.error("Non-critical referral link error:", referralError);
  }

  // The sheet is the club's own copy of the questionnaire; losing it must not fail a
  // registration that is already stored in the database.
  try {
    await appendClientBotProfileRow({
      answers,
      submittedAt,
      telegramId: auth.user.telegram_id,
      username: auth.user.username,
    });
  } catch (sheetError) {
    console.error("Non-critical client profile sheet sync error:", sheetError);
  }

  return NextResponse.json({ nickname: answers.nickname, profileSubmitted: true });
}
