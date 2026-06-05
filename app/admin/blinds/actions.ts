"use server";

import { writeFile } from "fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extname, join } from "path";
import { z } from "zod";
import {
  loadDemoPublicState,
  saveDemoBlindLevels,
  saveDemoExtras,
} from "@/lib/demo-overrides";
import { hasPublicEnv } from "@/lib/env";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { makeBlindTemplate, upsertBlindTemplate } from "@/lib/timer/blind-templates";
import { blindAlertSounds } from "@/lib/timer/blind-alert";
import { blindPresets, type BlindPresetName } from "@/lib/timer/presets";
import type { TournamentExtras } from "@/lib/timer/types";

const SOUND_STORAGE_BUCKET = "tournament-sounds";
const MAX_SOUND_FILE_SIZE = 1024 * 1024;
const SOUND_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const SOUND_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

const levelSchema = z.object({
  levelOrder: z.number().int().positive(),
  smallBlind: z.number().int().positive().nullable(),
  bigBlind: z.number().int().positive().nullable(),
  ante: z.number().int().nonnegative().nullable(),
  reentryCloses: z.boolean().default(false),
  doubleReentryAvailable: z.boolean().default(false),
  durationSeconds: z.number().int().positive(),
  isBreak: z.boolean(),
  breakDurationSeconds: z.number().int().positive().nullable(),
});

const blindAlertSchema = z.object({
  blindAlertSeconds: z.coerce.number().int().min(1).max(300),
  blindAlertSound: z.enum(blindAlertSounds),
});

const blindTemplateSchema = z.object({
  levels: z.array(levelSchema).min(1).max(80),
  name: z.string().trim().min(1).max(48),
});

type UploadedSound = {
  name: string;
  url: string;
};

type SoundUpload = {
  bytes: Buffer;
  name: string;
  size: number;
  type: string;
};

type ParsedBlindLevel = z.infer<typeof levelSchema>;

function normalizeBlindLevels(levels: ParsedBlindLevel[]): ParsedBlindLevel[] {
  let cutoffUsed = false;

  return levels.map((level) => {
    const reentryCloses = !level.isBreak && level.reentryCloses && !cutoffUsed;
    if (reentryCloses) cutoffUsed = true;

    return {
      ...level,
      ante: level.isBreak ? null : 0,
      reentryCloses,
      smallBlind: level.isBreak ? null : level.smallBlind,
      bigBlind: level.isBreak ? null : level.bigBlind,
      breakDurationSeconds: level.isBreak ? level.breakDurationSeconds : null,
    };
  });
}

function getReturnPath(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "");
  return returnTo === "/admin/settings" ? "/admin/settings" : "/admin/blinds";
}

function withStatus(path: string, key: string) {
  return `${path}?${key}=1`;
}

function cleanFileName(name: string) {
  return name.replace(/[^\wа-яА-ЯёЁ .()-]/g, "").trim().slice(0, 80) || "custom-sound";
}

function getSoundExtension(upload: { name: string; type: string }) {
  const extension = extname(upload.name).toLowerCase();
  if (SOUND_EXTENSIONS.has(extension)) return extension;

  switch (upload.type) {
    case "audio/ogg":
      return ".ogg";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    default:
      return ".mp3";
  }
}

function getSoundFile(formData: FormData) {
  const value = formData.get("blindAlertFile");
  return value instanceof File && value.size > 0 ? value : null;
}

function validateSoundUpload(upload: { name: string; size: number; type: string }) {
  const extension = extname(upload.name).toLowerCase();
  const hasAllowedType = SOUND_MIME_TYPES.has(upload.type);
  const hasAllowedExtension = SOUND_EXTENSIONS.has(extension);

  if (upload.size > MAX_SOUND_FILE_SIZE) return "sound_too_large";
  if (!hasAllowedType && !hasAllowedExtension) return "invalid_sound_file";

  return null;
}

function getSoundUploadFromDataUrl(formData: FormData): SoundUpload | null {
  const dataUrl = String(formData.get("blindAlertFileDataUrl") ?? "");
  const name = cleanFileName(String(formData.get("blindAlertFileName") ?? ""));
  const type = String(formData.get("blindAlertFileType") ?? "audio/mpeg");
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) return null;

  const bytes = Buffer.from(match[2], "base64");
  return {
    bytes,
    name,
    size: bytes.byteLength,
    type: type || match[1] || "audio/mpeg",
  };
}

async function getSoundUpload(formData: FormData): Promise<SoundUpload | null> {
  const dataUpload = getSoundUploadFromDataUrl(formData);
  if (dataUpload) return dataUpload;

  const file = getSoundFile(formData);
  if (!file) return null;

  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    name: cleanFileName(file.name),
    size: file.size,
    type: file.type || "audio/mpeg",
  };
}

async function saveDemoSoundFile(upload: SoundUpload): Promise<UploadedSound> {
  const extension = getSoundExtension(upload);
  const fileName = `demo-alert-sound${extension}`;

  await writeFile(join(process.cwd(), "public", fileName), upload.bytes);

  return {
    name: upload.name,
    url: `/${fileName}`,
  };
}

async function uploadSoundFile(
  upload: SoundUpload,
  tournamentId: string,
): Promise<UploadedSound | null> {
  const supabase = await createSupabaseServerClient();
  const extension = getSoundExtension(upload);
  const path = `${tournamentId}/${Date.now()}-${crypto.randomUUID()}${extension}`;
  const { error } = await supabase.storage
    .from(SOUND_STORAGE_BUCKET)
    .upload(path, upload.bytes, {
      contentType: upload.type || "audio/mpeg",
      upsert: true,
    });

  if (error) return null;

  const { data } = supabase.storage.from(SOUND_STORAGE_BUCKET).getPublicUrl(path);
  return {
    name: upload.name,
    url: data.publicUrl,
  };
}

export async function applyBlindPreset(formData: FormData) {
  const preset = String(formData.get("preset")) as BlindPresetName;
  const levels = blindPresets[preset];
  const returnPath = getReturnPath(formData);

  if (!levels) redirect(`${returnPath}?error=invalid_preset`);

  if (!hasPublicEnv()) {
    await saveDemoBlindLevels(
      levels.map((level) => ({
        ...level,
        id: `demo-${preset}-${level.levelOrder}`,
      })),
    );
    revalidatePath("/admin/settings");
    revalidatePath("/admin/blinds");
    revalidatePath("/screen/demo");
    redirect(withStatus(returnPath, "preset"));
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) redirect(`${returnPath}?error=no_tournament`);

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    levels.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.smallBlind,
      big_blind: level.bigBlind,
      ante: level.isBreak ? null : 0,
      reentry_closes: level.isBreak ? false : level.reentryCloses,
      double_reentry_available: Boolean(level.doubleReentryAvailable),
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.breakDurationSeconds,
    })),
  );

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  redirect(withStatus(returnPath, "preset"));
}

export async function saveBlindLevels(formData: FormData) {
  const raw = String(formData.get("levels") ?? "[]");
  const returnPath = getReturnPath(formData);
  let levels: unknown;

  try {
    levels = JSON.parse(raw);
  } catch {
    redirect(`${returnPath}?error=invalid_levels`);
  }

  const parsed = z.array(levelSchema).safeParse(levels);

  if (!parsed.success) redirect(`${returnPath}?error=invalid_levels`);

  const normalizedLevels = normalizeBlindLevels(parsed.data);

  if (!hasPublicEnv()) {
    await saveDemoBlindLevels(
      normalizedLevels.map((level) => ({
        ...level,
        id: `demo-custom-${level.levelOrder}`,
      })),
    );
    revalidatePath("/admin/settings");
    revalidatePath("/admin/blinds");
    revalidatePath("/screen/demo");
    redirect(withStatus(returnPath, "levels"));
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) redirect(`${returnPath}?error=no_tournament`);

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    normalizedLevels.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.smallBlind,
      big_blind: level.bigBlind,
      ante: level.ante,
      reentry_closes: level.reentryCloses,
      double_reentry_available: level.doubleReentryAvailable,
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.breakDurationSeconds,
    })),
  );

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  redirect(withStatus(returnPath, "levels"));
}

export async function saveBlindAlertSettings(formData: FormData) {
  const returnPath = getReturnPath(formData);
  const soundUpload = await getSoundUpload(formData);
  const parsed = blindAlertSchema.safeParse({
    blindAlertSeconds: formData.get("blindAlertSeconds"),
    blindAlertSound: formData.get("blindAlertSound"),
  });

  if (!parsed.success) redirect(`${returnPath}?error=invalid_sound`);
  if (soundUpload) {
    const fileError = validateSoundUpload(soundUpload);
    if (fileError) redirect(`${returnPath}?error=${fileError}`);
  }

  if (!hasPublicEnv()) {
    const uploaded = soundUpload ? await saveDemoSoundFile(soundUpload) : null;
    const settings: Partial<TournamentExtras["settings"]> = {
      blindAlertSeconds: parsed.data.blindAlertSeconds,
      blindAlertSound: uploaded ? "custom" : parsed.data.blindAlertSound,
    };

    if (uploaded) {
      settings.blindAlertCustomSoundName = uploaded.name;
      settings.blindAlertCustomSoundUrl = uploaded.url;
    }

    await saveDemoExtras({
      settings,
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/blinds");
    revalidatePath("/screen/demo");
    redirect(withStatus(returnPath, "sound"));
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!tournament) redirect(`${returnPath}?error=no_tournament`);

  const uploaded = soundUpload
    ? await uploadSoundFile(soundUpload, tournament.id as string)
    : null;

  if (soundUpload && !uploaded) redirect(`${returnPath}?error=sound_upload`);

  const settings: Partial<TournamentExtras["settings"]> = {
    blindAlertSeconds: parsed.data.blindAlertSeconds,
    blindAlertSound: uploaded ? "custom" : parsed.data.blindAlertSound,
  };

  if (uploaded) {
    settings.blindAlertCustomSoundName = uploaded.name;
    settings.blindAlertCustomSoundUrl = uploaded.url;
  }

  await saveTournamentExtras(
    {
      settings,
    },
    returnPath,
  );
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  redirect(withStatus(returnPath, "sound"));
}

export async function saveBlindTemplate(formData: FormData) {
  const returnPath = getReturnPath(formData);
  const rawLevels = String(formData.get("levels") ?? "[]");
  let levels: unknown;

  try {
    levels = JSON.parse(rawLevels);
  } catch {
    redirect(`${returnPath}?error=invalid_template`);
  }

  const parsed = blindTemplateSchema.safeParse({
    levels,
    name: formData.get("templateName"),
  });

  if (!parsed.success) redirect(`${returnPath}?error=invalid_template`);

  const template = makeBlindTemplate(
    parsed.data.name,
    normalizeBlindLevels(parsed.data.levels).map((level) => ({
      ...level,
      id: crypto.randomUUID(),
    })),
  );

  if (!hasPublicEnv()) {
    const state = await loadDemoPublicState();
    await saveDemoExtras({
      blindTemplates: upsertBlindTemplate(state.extras.blindTemplates, template),
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/blinds");
    redirect(withStatus(returnPath, "template"));
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!tournament) redirect(`${returnPath}?error=no_tournament`);

  const extras = await loadTournamentExtras(tournament.id as string);
  await saveTournamentExtras(
    {
      blindTemplates: upsertBlindTemplate(extras.blindTemplates, template),
    },
    returnPath,
  );
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  redirect(withStatus(returnPath, "template"));
}
