"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { saveDemoExtras } from "@/lib/demo-overrides";
import { hasPublicEnv } from "@/lib/env";
import { normalizePlacePoints } from "@/lib/pts-rating";
import { saveTournamentExtras } from "@/lib/tournament-extras";

const playerSchema = z.object({
  addons: z.number().int().min(0),
  addonChipsTotal: z.number().int().min(0).optional(),
  bountyChipsTotal: z.number().min(0).optional(),
  bountyCount: z.number().min(0),
  category: z.enum(["VIP", "Normal"]).optional(),
  finishPlace: z.number().int().positive().nullable(),
  id: z.string(),
  mysteryBountyPoints: z.number().min(0).optional(),
  name: z.string().min(1),
  registrationNumber: z.number().int().positive().nullable().optional(),
  registeredVia: z.enum(["admin", "client_bot"]).optional(),
  rebuys: z.number().int().min(0),
  seat: z.number().int().positive().nullable(),
  stack: z.number().int().min(0),
  status: z.enum(["active", "eliminated"]),
  table: z.number().int().positive().nullable(),
  telegramId: z.number().int().nullable().optional(),
});

const prizeSchema = z.object({
  bonuses: z.array(z.string()),
  place: z.number().int().positive(),
});

function parseJsonArray<T>(value: FormDataEntryValue | null, schema: z.ZodType<T>) {
  return z.array(schema).parse(JSON.parse(String(value ?? "[]")));
}

export async function savePlayers(formData: FormData) {
  const players = parseJsonArray(formData.get("players"), playerSchema);
  await saveExtras({ players }, "/admin/players");
  redirect("/admin/players?saved=1");
}

export async function savePrizes(formData: FormData) {
  const prizes = parseJsonArray(formData.get("prizes"), prizeSchema);
  await saveExtras({ prizes }, "/admin/settings");
  redirect("/admin/settings?prizes=1");
}

export async function savePtsSettings(formData: FormData) {
  const placePoints = parsePlacePoints(formData);
  const bountyPoints = parseNumber(formData.get("bountyPoints"));
  const pts = {
    bountyPoints,
    firstPlace: placePoints[0] ?? 0,
    placePoints,
    secondPlace: placePoints[1] ?? 0,
    thirdPlace: placePoints[2] ?? 0,
  };

  await saveExtras({ pts }, "/admin/pts");
  redirect("/admin/pts?saved=1");
}

export async function savePtsTemplate(formData: FormData) {
  const name = String(formData.get("templateName") ?? "").trim();
  if (!name) {
    redirect("/admin/pts?template=missing_name");
  }

  const placeTemplates = z.array(z.object({
    id: z.string(),
    name: z.string(),
    placePoints: z.array(z.number()),
  })).catch([]).parse(JSON.parse(String(formData.get("placeTemplates") ?? "[]")));
  const bountyTemplates = z.array(z.object({
    bountyPoints: z.number(),
    id: z.string(),
    name: z.string(),
  })).catch([]).parse(JSON.parse(String(formData.get("bountyTemplates") ?? "[]")));

  const placePoints = parsePlacePoints(formData);
  const bountyPoints = parseNumber(formData.get("bountyPoints"));
  const kind = formData.get("templateKind") === "bounty" ? "bounty" : "places";
  const nextPlaceTemplates =
    kind === "places"
      ? [
          ...placeTemplates.filter((item) => item.name !== name),
          { id: crypto.randomUUID(), name, placePoints },
        ]
      : placeTemplates;
  const nextBountyTemplates =
    kind === "bounty"
      ? [
          ...bountyTemplates.filter((item) => item.name !== name),
          { bountyPoints, id: crypto.randomUUID(), name },
        ]
      : bountyTemplates;

  const pts = {
    bountyPoints,
    bountyTemplates: nextBountyTemplates,
    firstPlace: placePoints[0] ?? 0,
    placePoints,
    placeTemplates: nextPlaceTemplates,
    secondPlace: placePoints[1] ?? 0,
    thirdPlace: placePoints[2] ?? 0,
  };

  await saveExtras({ pts }, "/admin/pts");
  redirect("/admin/pts?template=saved");
}

export async function checkTelegramConnection(formData: FormData) {
  const chatId = String(formData.get("chatId") ?? "").trim();
  const suffix = chatId ? "telegram=ready" : "telegram=missing_chat";

  revalidatePath("/admin/pts");
  redirect(`/admin/pts?${suffix}`);
}

export async function awardPtsToRating() {
  revalidatePath("/admin/pts");
  revalidatePath("/admin/leaderboard");
  redirect("/admin/pts?awarded=1");
}

export async function refreshLeaderboard() {
  revalidatePath("/admin/pts");
  revalidatePath("/admin/leaderboard");
  redirect("/admin/leaderboard?refresh=1");
}

async function saveExtras(
  patch: Parameters<typeof saveTournamentExtras>[0],
  path: string,
) {
  if (!hasPublicEnv()) {
    await saveDemoExtras(patch);
    revalidatePath(path);
    revalidatePath("/screen/demo");
    return;
  }

  await saveTournamentExtras(patch, path);
}

function parseNumber(value: FormDataEntryValue | null) {
  const next = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(next) ? next : 0;
}

function parsePlacePoints(formData: FormData) {
  const values = Array.from({ length: 28 }, (_, index) =>
    parseNumber(formData.get(`place_${index + 1}`)),
  );
  return normalizePlacePoints(values);
}
