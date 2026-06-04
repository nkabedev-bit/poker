"use server";

import { writeFile } from "fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { join } from "path";
import { z } from "zod";
import { saveDemoExtras, saveDemoTournamentSettings } from "@/lib/demo-overrides";
import { parseLogoDataUrl, prepareLogoImage, type LogoUploadPayload } from "@/lib/admin/logo-upload";
import { hasPublicEnv } from "@/lib/env";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveTournamentExtras } from "@/lib/tournament-extras";
import { blindAlertSounds } from "@/lib/timer/blind-alert";
import { extname } from "path";

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

const settingsSchema = z.object({
  addonChips: z.coerce.number().int().min(0),
  addonEnabled: z.enum(["yes", "no"]).default("no"),
  addonMinutes: z.coerce.number().int().min(0),
  addonPrice: z.coerce.number().int().min(0),
  buyIn: z.coerce.number().int().min(0),
  bountyMode: z.enum(["off", "standard", "mystery"]).default("off"),
  logoUrl: z.string().trim().url().or(z.literal("")).optional(),
  maxAddons: z.coerce.number().int().min(1).default(1),
  maxPlayersPerTable: z.coerce.number().int().positive(),
  maxReentries: z.coerce.number().int().min(1).default(1),
  name: z.string().trim().min(1).max(80),
  rebuyPrice: z.coerce.number().int().min(0),
  reentryEnabled: z.enum(["yes", "no"]).default("no"),
  startingStack: z.coerce.number().int().positive(),
  tablesCount: z.coerce.number().int().positive(),
  registrationMinutes: z.coerce.number().int().min(0).max(1440),
  blindAlertSeconds: z.coerce.number().int().min(1).max(300).default(10),
  blindAlertSound: z.enum(blindAlertSounds).default("standard"),
});

type SoundUpload = {
  bytes: Buffer;
  name: string;
  size: number;
  type: string;
};

function cleanFileName(name: string) {
  return name.replace(/[^\wа-яА-ЯёЁ .()-]/g, "").trim().slice(0, 80) || "custom-sound";
}

function getSoundExtension(upload: { name: string; type: string }) {
  const extension = extname(upload.name).toLowerCase();
  if (SOUND_EXTENSIONS.has(extension)) return extension;

  if (!SOUND_MIME_TYPES.has(upload.type)) return ".mp3";

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

async function getSoundUpload(formData: FormData): Promise<SoundUpload | null> {
  const file = formData.get("blindAlertFile");
  if (!(file instanceof File) || file.size === 0) return null;

  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    name: cleanFileName(file.name),
    size: file.size,
    type: file.type || "audio/mpeg",
  };
}

async function getLogoUpload(formData: FormData): Promise<LogoUploadPayload | null> {
  const dataUrlUpload = parseLogoDataUrl({
    dataUrl: String(formData.get("logoDataUrl") ?? ""),
    name: String(formData.get("logoFileName") ?? "logo.png"),
    type: String(formData.get("logoFileType") ?? "image/png"),
  });

  if (dataUrlUpload) return dataUrlUpload;

  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) return null;

  return {
    bytes: Buffer.from(await logo.arrayBuffer()),
    name: logo.name,
    type: logo.type || "image/png",
  };
}

export async function updateTournamentSettings(formData: FormData) {
  const parsed = settingsSchema.safeParse({
    addonChips: formData.get("addonChips"),
    addonEnabled: formData.get("addonEnabled") === "yes" ? "yes" : "no",
    addonMinutes: formData.get("addonMinutes"),
    addonPrice: formData.get("addonPrice"),
    buyIn: formData.get("buyIn"),
    bountyMode: formData.get("bountyMode") ?? "off",
    logoUrl: formData.get("logoUrl"),
    maxAddons: formData.get("maxAddons") ?? 1,
    maxPlayersPerTable: formData.get("maxPlayersPerTable"),
    maxReentries: formData.get("maxReentries") ?? 1,
    name: formData.get("name"),
    rebuyPrice: formData.get("rebuyPrice"),
    reentryEnabled: formData.get("reentryEnabled") === "yes" ? "yes" : "no",
    startingStack: formData.get("startingStack"),
    tablesCount: formData.get("tablesCount"),
    registrationMinutes: formData.get("registrationMinutes"),
    blindAlertSeconds: formData.get("blindAlertSeconds"),
    blindAlertSound: formData.get("blindAlertSound"),
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=invalid_settings");
  }

  if (!hasPublicEnv()) {
    let logoUrl = parsed.data.logoUrl || null;
    let customSoundUrl: string | null = null;
    let customSoundName: string | null = null;

    const logo = await getLogoUpload(formData);
    if (logo) {
      const resized = await prepareLogoImage(logo.bytes);
      const destPath = join(process.cwd(), "public", "demo-logo.png");
      await writeFile(destPath, resized);
      logoUrl = "/demo-logo.png";
    }

    const sound = await getSoundUpload(formData);
    if (sound) {
      if (sound.size > MAX_SOUND_FILE_SIZE) {
        redirect("/admin/settings?error=sound_too_large");
      }
      const extension = getSoundExtension(sound);
      const destPath = join(process.cwd(), "public", `demo-alert-sound${extension}`);
      await writeFile(destPath, sound.bytes);
      customSoundUrl = `/demo-alert-sound${extension}`;
      customSoundName = sound.name;
    }

    await saveDemoTournamentSettings({
      logoUrl,
      name: parsed.data.name,
      startingStack: parsed.data.startingStack,
      registrationMinutes: parsed.data.registrationMinutes,
    });

    // We need the old extras to avoid overwriting existing custom sounds if not uploaded new
    const oldExtras = (await import("@/lib/demo-overrides")).loadDemoPublicState().then(res => res.extras);
    const existingExtras = await oldExtras;

    const finalSoundUrl = customSoundUrl || existingExtras.settings.blindAlertCustomSoundUrl;
    const finalSoundName = customSoundName || existingExtras.settings.blindAlertCustomSoundName;

    await saveDemoExtras({
      settings: {
        addonChips: parsed.data.addonChips,
        addonEnabled: parsed.data.addonEnabled === "yes",
        addonMinutes: parsed.data.addonMinutes,
        addonPrice: parsed.data.addonPrice,
        buyIn: parsed.data.buyIn,
        bountyType: parsed.data.bountyMode === "mystery" ? "mystery" : "standard",
        isBounty: parsed.data.bountyMode !== "off",
        maxAddons: parsed.data.maxAddons,
        maxPlayersPerTable: parsed.data.maxPlayersPerTable,
        maxReentries: parsed.data.maxReentries,
        rebuyPrice: parsed.data.rebuyPrice,
        reentryEnabled: parsed.data.reentryEnabled === "yes",
        tablesCount: parsed.data.tablesCount,
        blindAlertSeconds: parsed.data.blindAlertSeconds,
        blindAlertSound: sound ? "custom" : parsed.data.blindAlertSound,
        ...(sound || existingExtras.settings.blindAlertCustomSoundUrl ? {
          blindAlertCustomSoundUrl: finalSoundUrl,
          blindAlertCustomSoundName: finalSoundName,
        } : {}),
      },
    });
    revalidatePath("/admin/settings");
    revalidatePath("/screen/demo");
    redirect("/admin/settings?saved=1");
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token, logo_url")
    .limit(1)
    .single();

  if (!tournament) {
    redirect("/admin/settings?error=no_tournament");
  }

  let logoUrl = parsed.data.logoUrl || null;
  const logo = await getLogoUpload(formData);

  if (logo) {
    const resized = await prepareLogoImage(logo.bytes);
    const path = `${tournament.id}/${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("tournament-logos")
      .upload(path, resized, { upsert: true, contentType: "image/png" });

    if (uploadError) {
      redirect("/admin/settings?error=logo_upload");
    }

    const { data } = supabase.storage.from("tournament-logos").getPublicUrl(path);
    logoUrl = data.publicUrl;
  }

  let customSoundUrl: string | null = null;
  let customSoundName: string | null = null;
  const sound = await getSoundUpload(formData);

  if (sound) {
    if (sound.size > MAX_SOUND_FILE_SIZE) {
      redirect("/admin/settings?error=sound_too_large");
    }
    const extension = getSoundExtension(sound);
    const path = `${tournament.id}/${Date.now()}-${crypto.randomUUID()}${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(SOUND_STORAGE_BUCKET)
      .upload(path, sound.bytes, {
        contentType: sound.type || "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      redirect("/admin/settings?error=sound_upload");
    }

    const { data } = supabase.storage.from(SOUND_STORAGE_BUCKET).getPublicUrl(path);
    customSoundUrl = data.publicUrl;
    customSoundName = sound.name;
  }

  await supabase
    .from("tournaments")
    .update({
      name: parsed.data.name,
      starting_stack: parsed.data.startingStack,
      registration_minutes: parsed.data.registrationMinutes,
      logo_url: logoUrl,
    })
    .eq("id", tournament.id);

  const existingExtras = await import("@/lib/tournament-extras").then(m => m.loadTournamentExtras(tournament.id));
  const finalSoundUrl = customSoundUrl || existingExtras.settings.blindAlertCustomSoundUrl;
  const finalSoundName = customSoundName || existingExtras.settings.blindAlertCustomSoundName;

  await saveTournamentExtras(
    {
      settings: {
        addonChips: parsed.data.addonChips,
        addonEnabled: parsed.data.addonEnabled === "yes",
        addonMinutes: parsed.data.addonMinutes,
        addonPrice: parsed.data.addonPrice,
        buyIn: parsed.data.buyIn,
        bountyType: parsed.data.bountyMode === "mystery" ? "mystery" : "standard",
        isBounty: parsed.data.bountyMode !== "off",
        maxAddons: parsed.data.maxAddons,
        maxPlayersPerTable: parsed.data.maxPlayersPerTable,
        maxReentries: parsed.data.maxReentries,
        rebuyPrice: parsed.data.rebuyPrice,
        reentryEnabled: parsed.data.reentryEnabled === "yes",
        tablesCount: parsed.data.tablesCount,
        blindAlertSeconds: parsed.data.blindAlertSeconds,
        blindAlertSound: sound ? "custom" : parsed.data.blindAlertSound,
        ...(sound || existingExtras.settings.blindAlertCustomSoundUrl ? {
          blindAlertCustomSoundUrl: finalSoundUrl,
          blindAlertCustomSoundName: finalSoundName,
        } : {}),
      },
    },
    "/admin/settings",
  );

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  revalidatePath(`/screen/${tournament.public_token}`);
  redirect("/admin/settings");
}
