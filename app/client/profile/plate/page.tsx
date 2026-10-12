"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import { getClientTelegramWebApp, tickClientSelection, useClientTMA } from "../../layout";
import { Eyebrow, LoadingScreen, PageHeading } from "../../_components/ui";
import { getPlatePadding, PlateArt, usePlateDrawing } from "@/components/player-plate";
import {
  canUsePlate,
  DEFAULT_PLATE_COLOR,
  describePlateLock,
  getPlateColorName,
  getPlateForm,
  isPlateForm,
  PLATE_COLORS,
  PLATE_FORMS,
  readPlateChoice,
  type PlateChoice,
  type PlateColor,
  type PlateForm,
} from "@/lib/players/plates";
import { getPlateClass, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

type Me = {
  displayName: string | null;
  honorPlates?: string[];
  plate?: PlateChoice | null;
  stats?: { games?: number };
  tier?: PlayerTier | null;
};

/** The tier's own plate: what the board shows when the player picks nothing. */
const TIER_PLATE = "tier";
type Pick = PlateForm | typeof TIER_PLATE;

const TIER_TAG_CLASSES: Record<PlayerTier, string> = {
  champion: "text-[#e8c97a]",
  core: "text-[#ff6b7d]",
  legend: "text-[#c9a6ff]",
  member: "text-[#ff9aa6]",
};

/**
 * «Моя плашка»: the plate the player stands on in the hall. The preview stays at the top
 * while the colours and the shapes scroll under it, and the save sits in the preview, so
 * whatever the player taps, they see it and can keep it without scrolling back.
 */
export default function ClientPlatePage() {
  const { initData } = useClientTMA();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<PlateChoice | null>(null);
  const [form, setForm] = useState<Pick>(TIER_PLATE);
  const [color, setColor] = useState<PlateColor>(DEFAULT_PLATE_COLOR);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", { headers: { "X-Telegram-Init-Data": initData } });
      if (!res.ok) return;

      const data = (await res.json()) as Me;
      const choice = readPlateChoice(data.plate?.form, data.plate?.color);
      setMe(data);
      setSaved(choice);
      setForm(choice?.form ?? TIER_PLATE);
      setColor(choice?.color ?? DEFAULT_PLATE_COLOR);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen shape="profile" />;

  const tier = me?.tier ?? null;
  const games = me?.stats?.games ?? 0;
  const nickname = me?.displayName?.trim() || "Ваш ник";
  const honorPlates = (me?.honorPlates ?? []).filter(isPlateForm);
  // Plates of honour come first, and only to the players they were given to.
  const forms = [
    ...PLATE_FORMS.filter((info) => honorPlates.includes(info.id)),
    ...PLATE_FORMS.filter((info) => info.tier),
  ];
  const isOpen = (id: PlateForm) => canUsePlate(id, { honors: honorPlates, tier });
  const openCount = forms.filter((info) => isOpen(info.id)).length;

  const fixedArt = form !== TIER_PLATE && Boolean(getPlateForm(form).fixedArt);
  const draft: PlateChoice | null =
    form === TIER_PLATE ? null : { color: fixedArt ? null : color, form };
  const clean =
    (draft?.form ?? null) === (saved?.form ?? null) && (draft?.color ?? null) === (saved?.color ?? null);
  const formName = form === TIER_PLATE ? "Статусная" : getPlateForm(form).name;

  const pickForm = (id: Pick) => {
    if (id !== TIER_PLATE && !isOpen(id)) {
      setMessage(`${getPlateForm(id).name}: ${describePlateLock(id, games).replace(/^./, (letter) => letter.toLowerCase())}.`);
      return;
    }
    tickClientSelection();
    setForm(id);
    setMessage("");
  };

  const pickColor = (id: PlateColor) => {
    if (form === TIER_PLATE || fixedArt) return;
    tickClientSelection();
    setColor(id);
    setMessage("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/client-tma/plate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ color: draft?.color ?? null, form: draft?.form ?? null }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(data?.message ?? "Не удалось сохранить плашку. Попробуйте ещё раз.");
        return;
      }

      getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
      setSaved(readPlateChoice(data?.plate?.form, data?.plate?.color));
      setMessage("Сохранено. На экране в зале плашка сменится при следующем обновлении списка игроков.");
    } catch {
      setMessage("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const colorNote =
    form === TIER_PLATE
      ? "Статусная плашка — в цветах вашего статуса"
      : fixedArt
        ? `У плашки «${formName}» свой цвет`
        : null;

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:max-w-[640px]">
      <PageHeading subtitle="Так вас видно в списке игроков на экране в зале" title="Моя плашка" />

      <div className="sticky top-0 z-10 -mx-4 bg-club-ink/95 px-4 pb-3 pt-2 backdrop-blur-xl md:mx-0 md:px-0">
        <div className="flex flex-col gap-3 rounded-[20px] border border-club-line bg-[#070000] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Eyebrow>Так вас увидят в зале</Eyebrow>
              <span className="truncate text-[12px] text-club-muted">
                {formName}
                {draft?.color ? ` · ${getPlateColorName(draft.color)}` : ""}
              </span>
            </div>
            <button
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-club-crimson px-4 text-[14px] font-bold text-white disabled:bg-club-raised disabled:text-club-faint"
              disabled={clean || saving}
              type="button"
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : clean ? <Check size={16} /> : null}
              {clean ? "Сохранено" : "Сохранить"}
            </button>
          </div>
          <PlatePreview height={52} nickname={nickname} plate={draft} tier={tier} />
          <div className="flex items-center gap-2.5">
            <span className="w-[74px] shrink-0 text-[11px] leading-tight text-club-faint">Полный зал</span>
            <div className="min-w-0 flex-1">
              <PlatePreview height={16} nickname={nickname} plate={draft} tier={tier} />
            </div>
          </div>
        </div>
        {message ? (
          <p className="mt-2 rounded-xl border border-club-line bg-club-surface px-3 py-2.5 text-[13px] leading-snug" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-semibold">Цвет</h2>
          <span className="text-[13px] font-bold text-club-muted">
            {colorNote ? "" : getPlateColorName(color)}
          </span>
        </div>
        <div className={`grid grid-cols-5 justify-items-center gap-2.5 ${colorNote ? "opacity-35" : ""}`}>
          {PLATE_COLORS.map((swatch) => {
            const selected = !colorNote && swatch.id === color;
            return (
              <button
                aria-label={`${swatch.name}${selected ? ", выбран" : ""}`}
                aria-pressed={selected}
                className="h-12 w-12 rounded-full transition active:scale-95 disabled:active:scale-100"
                disabled={Boolean(colorNote)}
                key={swatch.id}
                style={{
                  background: swatch.hex,
                  boxShadow: selected
                    ? "0 0 0 3px #0c0606, 0 0 0 5px #e8c97a"
                    : "inset 0 0 0 1px rgba(255,255,255,.12)",
                }}
                type="button"
                onClick={() => pickColor(swatch.id)}
              />
            );
          })}
        </div>
        {colorNote ? (
          <p className="flex items-center gap-2 text-[12.5px] text-club-muted">
            <Lock size={13} /> {colorNote}
          </p>
        ) : (
          <p className="text-[12.5px] text-club-faint">Золото — только у статусной плашки CHAMPION</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-semibold">Форма</h2>
          <span className="text-[13px] text-club-muted">
            доступно {openCount} из {forms.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-3">
          <FormTile
            locked={false}
            name="Статусная"
            nickname={nickname}
            plate={null}
            selected={form === TIER_PLATE}
            tag={tier ? TIER_TITLES[tier] : "по умолчанию"}
            tagClass={tier ? TIER_TAG_CLASSES[tier] : "text-club-faint"}
            tier={tier}
            onPick={() => pickForm(TIER_PLATE)}
          />
          {forms.map((info) => {
            const locked = !isOpen(info.id);
            return (
              <FormTile
                key={info.id}
                lockText={locked ? describePlateLock(info.id, games) : undefined}
                locked={locked}
                name={info.name}
                nickname={nickname}
                plate={{ color: info.fixedArt ? null : color, form: info.id }}
                selected={form === info.id}
                tag={info.tier ? TIER_TITLES[info.tier] : "эксклюзив"}
                tagClass={info.tier ? TIER_TAG_CLASSES[info.tier] : "text-[#b9c6d2]"}
                tier={tier}
                onPick={() => pickForm(info.id)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FormTile({
  lockText,
  locked,
  name,
  nickname,
  onPick,
  plate,
  selected,
  tag,
  tagClass,
  tier,
}: {
  lockText?: string;
  locked: boolean;
  name: string;
  nickname: string;
  onPick: () => void;
  plate: PlateChoice | null;
  selected: boolean;
  tag: string;
  tagClass: string;
  tier: PlayerTier | null;
}) {
  return (
    <button
      aria-label={`${name}${locked ? `, закрыто: ${lockText}` : selected ? ", выбрано" : ""}`}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-2xl border bg-club-surface p-2.5 text-left transition active:scale-[0.98] ${
        selected ? "border-club-gold shadow-[0_0_0_3px_rgba(232,201,122,0.14)]" : "border-club-line"
      }`}
      type="button"
      onClick={onPick}
    >
      <div className={`pointer-events-none w-full ${locked ? "opacity-40 saturate-[.4]" : ""}`}>
        <PlatePreview height={30} nickname={nickname} plate={plate} tier={tier} />
      </div>
      <div className="flex w-full items-center justify-between gap-1.5">
        <span className="truncate text-[14px] font-extrabold">{name}</span>
        <span className={`shrink-0 text-[10px] font-extrabold tracking-[0.08em] ${tagClass}`}>{tag}</span>
      </div>
      {lockText ? (
        <span className="flex items-start gap-1.5 text-[11.5px] leading-snug text-club-muted">
          <Lock className="mt-px shrink-0" size={12} /> {lockText}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The plate as the hall's screen draws it, at one row height: the picked shape, or the
 * tier's own art when nothing is picked.
 */
function PlatePreview({
  height,
  nickname,
  plate,
  tier,
}: {
  height: number;
  nickname: string;
  plate: PlateChoice | null;
  tier: PlayerTier | null;
}) {
  const { drawing, ref } = usePlateDrawing<HTMLDivElement>(plate);
  const fontSize = Math.min(24, Math.max(8, Math.round(height * 0.46)));

  return (
    <div
      className={`flex w-full items-center ${plate ? "player-plate-row" : getPlateClass(tier)}`}
      ref={ref}
      style={{
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
        height,
        paddingLeft: Math.round(Math.max(8, Math.min(18, height * 0.3))),
        paddingRight: 8,
        ...getPlatePadding(drawing),
      }}
    >
      {drawing ? <PlateArt drawing={drawing} /> : null}
      <span
        className="min-w-0 truncate font-bold text-white"
        style={{ fontSize, lineHeight: 1.15, textShadow: "0 1px 2px rgba(0,0,0,.7)" }}
      >
        {nickname}
      </span>
    </div>
  );
}
