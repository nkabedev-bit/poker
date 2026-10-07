"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Camera,
  ChevronRight,
  Loader2,
  Medal,
  Star,
  Ticket,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  getClientTelegramWebApp,
  showClientAlert,
  tickClientSelection,
  useClientTMA,
} from "../layout";
import {
  Eyebrow,
  GhostButton,
  GlassCard,
  LoadingScreen,
  MenuGroup,
  MenuRow,
  PageTitle,
  Pill,
  SectionHeader,
  StatCell,
  StatStrip,
} from "../_components/ui";
import { ClubCard } from "../_components/club-card";
import { PlayedGameRow } from "../_components/played-game-row";
import { countWord } from "@/lib/raffle/raffle-scenes";
import { PlayerAvatar } from "../_components/player-avatar";
import { CountUp } from "../_components/count-up";
import { FavoriteHandCard, FavoriteHandPicker } from "../_components/favorite-hand-picker";
import { AwardCelebration } from "../_components/award-celebration";
import { useAwardNews } from "../_components/use-award-news";
import { pickPlayerPhoto } from "@/lib/players/photo";
import { shrinkPhoto } from "@/lib/media/shrink-photo";
import { type PlayerTier } from "@/lib/players/tier";
import { withOwnPhoto, type RatingPlayer } from "../_components/rating-row";
import { countEarnedMedals, getMedals, MEDALS_TOTAL } from "@/lib/client/medals";
import { listHeldAwards, type AwardShelf } from "@/lib/client/award-news";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievements,
  type PlayerStats,
} from "@/lib/client/achievements";
import {
  formatEventShortDateLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

type HistoryItem = { event: TournamentEvent; status: string };

/** The profile knows every kind of award, so it tells the player about all of them. */
const PROFILE_SHELVES: AwardShelf[] = ["achievements", "medals", "tier"];

type Me = {
  avatarIsCustom?: boolean;
  avatarUrl: string | null;
  displayName: string | null;
  /** The two cards the player picked ("QsTs"); null until they pick them. */
  favoriteHand?: string | null;
  tier?: PlayerTier | null;
  freeEntries: { regular: number; vip: number } | null;
  history: { active: HistoryItem[]; past: HistoryItem[] };
  profileSubmitted: boolean;
  registered: { name: string; registrationNumber: number | null; table: number | null } | null;
  medals: Record<string, number> | null;
  stats: Partial<PlayerStats>;
  username: string | null;
};

type RatingResponse = { me: RatingPlayer; players: RatingPlayer[] };

type PlayedGame = {
  knockouts: number;
  place: number | null;
  playedOn: string;
  points: number;
  startedAt: string;
  title: string;
};

export default function ClientProfilePage() {
  const { initData, telegramUser } = useClientTMA();
  const [me, setMe] = useState<Me | null>(null);
  const [rating, setRating] = useState<RatingResponse | null>(null);
  const [played, setPlayed] = useState<PlayedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyTab, setHistoryTab] = useState<"active" | "past">("active");
  // The history slides only once the player switches it: the screen's own cascade brings
  // it in the first time.
  const [historySwitched, setHistorySwitched] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [handPickerOpen, setHandPickerOpen] = useState(false);
  // Set once a hand is picked here, so the new pair is dealt onto the face.
  const [handDealt, setHandDealt] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [meRes, ratingRes, gamesRes] = await Promise.all([
        fetch("/api/client-tma/me", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/client-tma/rating", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/client-tma/games", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (meRes.ok) setMe(await meRes.json());
      if (ratingRes.ok) setRating(await ratingRes.json());
      if (gamesRes.ok) {
        const data = await gamesRes.json();
        setPlayed(data.games ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const uploadAvatar = async (file: File) => {
    const tg = getClientTelegramWebApp();
    setAvatarBusy(true);

    try {
      // Sent small: a camera photo runs to several megabytes, and a request over 4.5 MB
      // is turned away before it reaches the club. One the browser cannot open goes as
      // it is, and the server says what is wrong with it.
      const dataUrl =
        (await shrinkPhoto(file)) ??
        (await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("read failed"));
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.readAsDataURL(file);
        }));

      const res = await fetch("/api/client-tma/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // A 413 comes from Vercel rather than from us, so it carries no message of ours.
        showClientAlert(
          data?.error ??
            (res.status === 413
              ? "Фото слишком большое — выберите другое"
              : "Не удалось сохранить фото"),
        );
        return;
      }

      tg?.HapticFeedback?.notificationOccurred("success");
      await load();
    } catch {
      showClientAlert("Не удалось прочитать файл");
    } finally {
      setAvatarBusy(false);
    }
  };

  /**
   * Stores the player's favourite hand, or takes it off with null. The profile and its
   * rating rows show the new hand at once, without reading everything again.
   */
  const saveFavoriteHand = async (hand: string | null): Promise<string | null> => {
    try {
      const res = await fetch("/api/client-tma/favorite-hand", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ hand }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) return data?.message ?? "Не удалось сохранить руку. Попробуйте ещё раз.";

      const saved = (data?.hand as string | null | undefined) ?? null;
      getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
      setMe((current) => (current ? { ...current, favoriteHand: saved } : current));
      setRating((current) =>
        current
          ? {
              ...current,
              me: current.me?.isMe ? { ...current.me, hand: saved } : current.me,
              players: current.players.map((player) =>
                player.isMe ? { ...player, hand: saved } : player,
              ),
            }
          : current,
      );
      setHandPickerOpen(false);
      setHandDealt(true);
      return null;
    } catch {
      return "Нет связи с сервером. Попробуйте ещё раз.";
    }
  };

  const chooseHistoryTab = (next: "active" | "past") => {
    if (next === historyTab) return;

    tickClientSelection();
    setHistoryTab(next);
    setHistorySwitched(true);
  };

  const resetAvatar = async () => {
    setAvatarBusy(true);
    try {
      await fetch("/api/client-tma/avatar", {
        method: "DELETE",
        headers: { "X-Telegram-Init-Data": initData },
      });
      await load();
    } finally {
      setAvatarBusy(false);
    }
  };

  // A player who has not played since the counters were added reads zero for the newer
  // ones, so the defaults fill in whatever the API does not send.
  const stats = useMemo(
    () => ({ ...EMPTY_PLAYER_STATS, ...(me?.stats ?? {}) }),
    [me],
  );
  const achievements = useMemo(() => getAchievements(stats), [stats]);

  const medalsEarned = countEarnedMedals(getMedals(me?.medals));

  // What the player holds, checked against what their phone has already shown them.
  const awards = useMemo(
    () =>
      me
        ? listHeldAwards({ achievements, medals: getMedals(me.medals), tier: me.tier ?? null })
        : null,
    [achievements, me],
  );
  const { dismiss: dismissNews, left: newsLeft, news } = useAwardNews(awards, PROFILE_SHELVES);

  if (loading) return <LoadingScreen shape="profile" />;

  const name = me?.displayName?.trim() || telegramUser?.first_name || "Игрок";
  const earned = countEarnedAchievements(achievements);
  const photoUrl = pickPlayerPhoto({
    avatarUrl: me?.avatarUrl,
    telegramPhotoUrl: telegramUser?.photo_url,
  });
  const myRating = rating?.me ? withOwnPhoto([rating.me], photoUrl)[0] : undefined;
  const upcoming = me?.history.active ?? [];
  const passesTotal = (me?.freeEntries?.regular ?? 0) + (me?.freeEntries?.vip ?? 0);

  const tier = me?.tier ?? null;
  const achievementsShare = achievements.length > 0 ? earned / achievements.length : 0;

  return (
    // On a computer the club card and the player's hand stand in a column on the left,
    // the figures, the collections and the history on the right. On a phone the columns
    // melt into one list (`contents`) and `order` keeps the phone's sequence.
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      <PageTitle>Профиль</PageTitle>

      {news ? <AwardCelebration award={news} left={newsLeft} onDone={dismissNews} /> : null}

      {handPickerOpen ? (
        <FavoriteHandPicker
          current={me?.favoriteHand ?? null}
          onClose={() => setHandPickerOpen(false)}
          onSave={saveFavoriteHand}
        />
      ) : null}

      <div className="client-stagger contents desk:grid desk:grid-cols-[360px_minmax(0,1fr)] desk:items-start desk:gap-8">
        <div className="client-stagger contents desk:flex desk:flex-col desk:gap-4">
          <div className="order-1 flex flex-col gap-3">
            <ClubCard
              avatar={
                // The player's own photo wins over the one Telegram hands us.
                <button
                  aria-label="Изменить фото"
                  className="relative shrink-0 rounded-full active:scale-[0.98]"
                  disabled={avatarBusy}
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <PlayerAvatar
                    dealHand={handDealt}
                    hand={me?.favoriteHand}
                    name={name}
                    photoUrl={photoUrl}
                    ring="gold"
                    size={64}
                  />
                </button>
              }
              name={name}
              subtitle={`${me?.username ? `@${me.username} · ` : ""}игрок клуба`}
              tier={tier}
            />

            <input
              accept="image/*"
              className="hidden"
              ref={photoInputRef}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadAvatar(file);
              }}
            />

            <GhostButton disabled={avatarBusy} onClick={() => photoInputRef.current?.click()}>
              {avatarBusy ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
              Сменить фото
            </GhostButton>
            {me?.avatarIsCustom ? (
              <button
                className="h-8 self-start text-[12px] text-club-faint underline underline-offset-2"
                disabled={avatarBusy}
                type="button"
                onClick={() => void resetAvatar()}
              >
                Вернуть фото из Telegram
              </button>
            ) : null}
          </div>

          <div className="order-3">
            <FavoriteHandCard
              games={stats.games}
              hand={me?.favoriteHand ?? null}
              tier={tier}
              onOpen={() => setHandPickerOpen(true)}
            />
          </div>

          {me?.registered ? (
            <div className="order-4 flex flex-col gap-2.5 rounded-[20px] border border-club-gold/30 bg-club-gold/[0.08] p-4">
              <p className="flex items-center gap-2 text-[14px] font-extrabold">
                <span className="h-2 w-2 rounded-full bg-club-rose" />
                Вы в игре прямо сейчас
              </p>
              <div className="flex gap-6">
                <div className="flex flex-col gap-1">
                  <Eyebrow>Номер</Eyebrow>
                  <p className="font-display text-[26px] font-semibold text-club-gold">
                    {me.registered.registrationNumber ?? "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Eyebrow>Стол</Eyebrow>
                  <p className="font-display text-[26px] font-semibold text-club-gold">{me.registered.table ?? "—"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="client-stagger contents desk:flex desk:flex-col desk:gap-7">
          <div className="order-2">
            <StatStrip>
              <StatCell label="Игр" value={<CountUp value={stats.games} />} />
              <StatCell label="Нокаутов" value={<CountUp value={Math.round(stats.eliminations)} />} />
              <StatCell label="Топ-9" value={<CountUp value={stats.top9} />} />
            </StatStrip>
          </div>

          <div className="order-5">
            <MenuGroup>
              <MenuRow
                href="/client/medals"
                icon={<Medal size={20} />}
                subtitle="Кубки за победы в турнирах"
                title="Медали"
                value={`${medalsEarned} / ${MEDALS_TOTAL}`}
              />
              <MenuRow
                href="/client/achievements"
                icon={<Star size={20} />}
                subtitle={earned === achievements.length ? "Собрана вся коллекция клуба" : "Награды клуба и прогресс"}
                title="Достижения"
                value={<CountUp suffix={` / ${achievements.length}`} value={earned} />}
              >
                <div className="mt-1.5 w-[140px]">
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="client-fill-x h-full rounded-full bg-club-gold"
                      style={{ width: `${Math.round(achievementsShare * 100)}%` }}
                    />
                  </div>
                </div>
              </MenuRow>
              <MenuRow
                href="/client/passes"
                icon={<Ticket className="text-club-rose" size={20} />}
                subtitle={passesTotal > 0 ? "Обычные и VIP" : "Пока нет"}
                title="Бесплатные проходки"
                value={<CountUp value={passesTotal} />}
              />
              <MenuRow
                href="/client/rating"
                icon={<Trophy className="text-club-rose" size={20} />}
                subtitle="Место в сезоне"
                title="Рейтинг"
                value={
                  // The place climbs up from the bottom of the table to where the player is.
                  myRating?.place ? (
                    <CountUp from={Math.max(rating?.players.length ?? 0, myRating.place)} value={myRating.place} />
                  ) : (
                    "—"
                  )
                }
              />
            </MenuGroup>
          </div>

          <section className="order-6 flex flex-col gap-2.5">
            <SectionHeader title="История игр" />

            <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-club-line bg-club-surface p-1">
              {/* One thumb slides under the tab picked; the tabs themselves only change colour. */}
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-xl bg-club-text transition-transform duration-[400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                  historyTab === "past" ? "translate-x-[calc(100%+4px)]" : ""
                }`}
              />
              <TabButton active={historyTab === "active"} onClick={() => chooseHistoryTab("active")}>
                Активные
              </TabButton>
              <TabButton active={historyTab === "past"} onClick={() => chooseHistoryTab("past")}>
                Прошедшие
              </TabButton>
            </div>

            {/* Keyed by the tab, so a switch brings the list in from the side of the tab. */}
            <div
              key={historyTab}
              className={
                historySwitched
                  ? historyTab === "past"
                    ? "client-slide-from-right"
                    : "client-slide-from-left"
                  : undefined
              }
            >
              {historyTab === "active" ? (
                upcoming.length > 0 ? (
                  <div className="client-stagger-rows flex flex-col gap-2">
                    {upcoming.map((item) => (
                      <Link
                        key={item.event.id}
                        className="flex items-center gap-3 rounded-[18px] border border-club-line bg-club-surface px-4 py-3.5"
                        href={`/client/events/${item.event.id}`}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="truncate text-[15px] font-extrabold">{item.event.title}</p>
                          <p className="text-[12px] text-club-muted">
                            {formatEventShortDateLabel(item.event.startsAt)}, {formatEventTimeLabel(item.event.startsAt)}
                          </p>
                          {/* A ticket the club is holding is not a sign-up: it is still waiting
                              on the player, and a card that looks like the rest never gets
                              answered. */}
                          {item.status === "reserved" ? (
                            <div className="mt-1">
                              <Pill className="client-breathe relative !border-club-gold/40" tone="gold">
                                Билет отложен · подтвердите
                              </Pill>
                            </div>
                          ) : null}
                        </div>
                        <ChevronRight className="shrink-0 text-club-faint" size={18} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <GlassCard className="flex flex-col items-center gap-3 py-8 text-center">
                    <CalendarDays className="text-club-faint" size={26} />
                    <p className="text-sm text-club-muted">Вы пока никуда не записаны.</p>
                  </GlassCard>
                )
              ) : played.length > 0 ? (
                <div className="client-stagger-rows flex flex-col gap-2">
                  {played.map((game) => (
                    <PlayedGameRow
                      key={game.startedAt}
                      href={`/client/games/${encodeURIComponent(game.startedAt)}`}
                      place={game.place}
                      subtitle={`${formatEventShortDateLabel(game.playedOn)}${
                        game.knockouts > 0 ? ` · ${countWord(game.knockouts, ["нокаут", "нокаута", "нокаутов"])}` : ""
                      }${game.points > 0 ? ` · ${game.points.toLocaleString("ru-RU")} очков` : ""}`}
                      title={game.title}
                    />
                  ))}
                </div>
              ) : (
                <GlassCard className="flex flex-col items-center gap-3 py-8 text-center">
                  <CalendarDays className="text-club-faint" size={26} />
                  <p className="text-sm text-club-muted">Сыгранных турниров пока нет.</p>
                </GlassCard>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`relative h-10 rounded-xl text-[14px] font-bold transition-colors duration-300 ${
        active ? "text-[#15100f]" : "text-club-muted"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
