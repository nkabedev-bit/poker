"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Pencil, RectangleHorizontal, RotateCcw, Spade } from "lucide-react";
import { getClientTelegramWebApp, showClientAlert, useClientTMA } from "../../layout";
import { LoadingScreen, MenuGroup, MenuRow, PageHeading } from "../../_components/ui";
import { FavoriteHandPicker } from "../../_components/favorite-hand-picker";
import { NicknameEditor } from "../../_components/nickname-editor";
import { PhotoCropper } from "../../_components/photo-cropper";
import { postFavoriteHand } from "../../_components/profile-requests";
import { CROP_SOURCE_MAX_SIDE } from "@/lib/media/photo-crop";
import { shrinkPhoto } from "@/lib/media/shrink-photo";
import { formatRank, parseFavoriteHand, SUIT_SYMBOLS } from "@/lib/players/favorite-hand";
import { getPlateColorName, getPlateForm, readPlateChoice, type PlateChoice } from "@/lib/players/plates";
import { TIER_GAMES, type PlayerTier } from "@/lib/players/tier";
import { countWord } from "@/lib/raffle/raffle-scenes";

type Me = {
  avatarIsCustom?: boolean;
  displayName: string | null;
  favoriteHand?: string | null;
  nicknameChangeAvailableAt?: string | null;
  plate?: PlateChoice | null;
  profileSubmitted: boolean;
  stats?: { games?: number };
  tier?: PlayerTier | null;
};

/**
 * Everything a player changes about themselves, kept off the profile so the profile only
 * shows: the nickname, the plate in the hall, the favourite hand and the photo.
 */
export default function ClientSettingsPage() {
  const { initData } = useClientTMA();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [nicknameEditorOpen, setNicknameEditorOpen] = useState(false);
  const [handPickerOpen, setHandPickerOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  /** The picked photo while the player chooses which part of it goes in the circle. */
  const [cropSource, setCropSource] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", { headers: { "X-Telegram-Init-Data": initData } });
      if (res.ok) setMe(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const saveNickname = async (nickname: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/client-tma/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) return data?.message ?? "Не удалось сменить ник. Попробуйте ещё раз.";

      const saved = String(data?.nickname ?? nickname);
      const availableAt = (data?.availableAt as string | null | undefined) ?? null;
      getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
      setMe((current) =>
        current ? { ...current, displayName: saved, nicknameChangeAvailableAt: availableAt } : current,
      );
      setNicknameEditorOpen(false);
      return null;
    } catch {
      return "Нет связи с сервером. Попробуйте ещё раз.";
    }
  };

  const saveFavoriteHand = async (hand: string | null): Promise<string | null> => {
    const result = await postFavoriteHand(initData, hand);
    if ("error" in result) return result.error;

    getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
    setMe((current) => (current ? { ...current, favoriteHand: result.hand } : current));
    setHandPickerOpen(false);
    return null;
  };

  /** Stores a profile photo; answers whether it was stored. */
  const sendAvatar = async (dataUrl: string) => {
    setAvatarBusy(true);

    try {
      const res = await fetch("/api/client-tma/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // A 413 comes from the proxy rather than from us, so it carries no message of ours.
        showClientAlert(
          data?.error ??
            (res.status === 413 ? "Фото слишком большое — выберите другое" : "Не удалось сохранить фото"),
        );
        return false;
      }

      getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
      setMe((current) => (current ? { ...current, avatarIsCustom: true } : current));
      return true;
    } catch {
      showClientAlert("Не удалось сохранить фото");
      return false;
    } finally {
      setAvatarBusy(false);
    }
  };

  const pickAvatar = async (file: File) => {
    setAvatarBusy(true);

    try {
      // Opened small enough to move about smoothly, and upright: the player then frames
      // the part that goes in the circle. A request over 4.5 MB is turned away before it
      // reaches the club, so a camera photo is never sent whole.
      const preview = await shrinkPhoto(file, { maxSide: CROP_SOURCE_MAX_SIDE, quality: 0.92 });
      if (preview) {
        setCropSource(preview);
        return;
      }

      // One the browser cannot open cannot be framed either: it goes as it is, the server
      // squares it off itself and says what is wrong with it if it can't.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read failed"));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
      });
      await sendAvatar(dataUrl);
    } catch {
      showClientAlert("Не удалось прочитать файл");
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveCroppedAvatar = async (dataUrl: string) => {
    const saved = await sendAvatar(dataUrl);
    if (saved) setCropSource(null);
    return saved;
  };

  const resetAvatar = async () => {
    setAvatarBusy(true);
    try {
      await fetch("/api/client-tma/avatar", {
        method: "DELETE",
        headers: { "X-Telegram-Init-Data": initData },
      });
      setMe((current) => (current ? { ...current, avatarIsCustom: false } : current));
    } finally {
      setAvatarBusy(false);
    }
  };

  if (loading) return <LoadingScreen shape="profile" />;

  const tier = me?.tier ?? null;
  const games = me?.stats?.games ?? 0;
  const plate = readPlateChoice(me?.plate?.form, me?.plate?.color);
  const hand = parseFavoriteHand(me?.favoriteHand);
  const handLock = `Откроется со статуса MEMBER — ещё ${countWord(
    Math.max(1, TIER_GAMES.member - Math.max(0, games)),
    ["игра", "игры", "игр"],
  )}`;

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:max-w-[640px]">
      {nicknameEditorOpen ? (
        <NicknameEditor
          availableAt={me?.nicknameChangeAvailableAt ?? null}
          current={me?.displayName ?? ""}
          onClose={() => setNicknameEditorOpen(false)}
          onSave={saveNickname}
        />
      ) : null}

      {cropSource ? (
        <PhotoCropper
          src={cropSource}
          onCancel={() => setCropSource(null)}
          onSave={saveCroppedAvatar}
        />
      ) : null}

      {handPickerOpen ? (
        <FavoriteHandPicker
          current={me?.favoriteHand ?? null}
          onClose={() => setHandPickerOpen(false)}
          onSave={saveFavoriteHand}
        />
      ) : null}

      <PageHeading subtitle="Ник, плашка в зале, любимая рука и фото" title="Настройки" />

      <MenuGroup>
        <MenuRow
          icon={<Pencil size={20} />}
          subtitle={
            // Only a nickname the club knows can be changed: without the questionnaire the
            // card shows the Telegram name.
            me?.profileSubmitted ? me.displayName : "Сначала заполните анкету игрока"
          }
          title="Ник"
          onClick={() => {
            if (me?.profileSubmitted) setNicknameEditorOpen(true);
            else showClientAlert("Ник появится после анкеты игрока.");
          }}
        />
        <MenuRow
          href="/client/profile/plate"
          icon={<RectangleHorizontal size={20} />}
          subtitle={
            plate
              ? `${getPlateForm(plate.form).name}${plate.color ? ` · ${getPlateColorName(plate.color)}` : ""}`
              : "Статусная"
          }
          title="Плашка в зале"
        />
        <MenuRow
          icon={<Spade size={20} />}
          subtitle={
            !tier
              ? handLock
              : hand
                ? hand.map((card) => `${formatRank(card.rank)}${SUIT_SYMBOLS[card.suit]}`).join(" ")
                : "Не выбрана"
          }
          title="Любимая рука"
          onClick={() => {
            if (tier) setHandPickerOpen(true);
            else showClientAlert(`${handLock}.`);
          }}
        />
      </MenuGroup>

      <MenuGroup>
        <MenuRow
          disabled={avatarBusy}
          icon={<Camera size={20} />}
          subtitle={me?.avatarIsCustom ? "Своё фото" : "Из Telegram"}
          title="Сменить фото"
          value={avatarBusy ? <Loader2 className="animate-spin" size={16} /> : undefined}
          onClick={() => photoInputRef.current?.click()}
        />
        {me?.avatarIsCustom ? (
          <MenuRow
            disabled={avatarBusy}
            icon={<RotateCcw size={20} />}
            title="Вернуть фото из Telegram"
            onClick={() => void resetAvatar()}
          />
        ) : null}
      </MenuGroup>

      <input
        accept="image/*"
        className="hidden"
        ref={photoInputRef}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void pickAvatar(file);
        }}
      />
    </div>
  );
}
