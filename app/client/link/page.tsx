"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserCheck, UserPlus } from "lucide-react";
import { IconTile, PageHeading, PrimaryButton } from "../_components/ui";

/**
 * The fork a web player meets the first time they sign in.
 *
 * Somebody the club already knows keeps their games, their rating and their free
 * entries, so they are asked for the nickname those are stored under — and nothing
 * else, by the club owner's decision.
 */
export default function ClientLinkPage() {
  const router = useRouter();

  const [played, setPlayed] = useState(false);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });

      if (res.ok) {
        router.replace("/client");
        return;
      }

      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Не удалось привязать профиль.");
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1">
      <PageHeading subtitle="Найдём ваш профиль со всей историей и проходками" title="Вы у нас уже играли?" />

      <div
        className={`flex flex-col gap-3.5 rounded-[22px] border-[1.5px] p-4 transition-colors ${
          played ? "border-club-rose bg-club-crimson/[0.08]" : "border-club-line bg-club-surface"
        }`}
      >
        <button
          aria-pressed={Boolean(played)}
          className="flex items-center gap-3.5 text-left"
          type="button"
          onClick={() => setPlayed(true)}
        >
          <IconTile className="!h-12 !w-12 !rounded-[14px] text-club-rose">
            <UserCheck size={22} />
          </IconTile>
          <span className="flex flex-1 flex-col gap-1">
            <span className="text-[16px] font-extrabold">Да, играл</span>
            <span className="text-[13px] leading-snug text-club-muted">
              Введите ник, под которым вы играете в клубе — к нему привяжется вся история
            </span>
          </span>
        </button>

        {played ? (
          <>
            <label>
              <span className="text-[13px] font-bold text-club-text">Игровой никнейм</span>
              <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border border-club-line bg-club-surface px-4 focus-within:border-club-rose">
                <Search className="shrink-0 text-club-faint" size={18} />
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-club-text outline-none placeholder:font-medium placeholder:text-club-faint"
                  // No real player's nickname stands here as an example: the nickname is the
                  // whole of what claims a profile, and one printed in the field is an
                  // invitation to take somebody else's.
                  placeholder="Ваш ник в клубе"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </div>
            </label>

            {error ? (
              <p className="rounded-[14px] border border-club-rose/40 bg-club-crimson/10 px-4 py-3 text-[13px] text-club-text">
                {error}
              </p>
            ) : null}

            <PrimaryButton disabled={!nickname.trim()} loading={submitting} onClick={submit}>
              Это мой профиль
            </PrimaryButton>
          </>
        ) : null}
      </div>

      <button
        className="flex items-center gap-3.5 rounded-[22px] border-[1.5px] border-club-line bg-club-surface p-4 text-left"
        type="button"
        onClick={() => router.replace("/client/onboarding")}
      >
        <IconTile className="!h-12 !w-12 !rounded-[14px] !text-club-muted">
          <UserPlus size={22} />
        </IconTile>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-[16px] font-extrabold">Нет, я впервые</span>
          <span className="text-[13px] leading-snug text-club-muted">
            Заполните короткую анкету — и запись на турниры откроется
          </span>
        </span>
      </button>
    </div>
  );
}
