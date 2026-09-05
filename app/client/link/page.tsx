"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GhostButton, GlassCard, PageTitle, PrimaryButton } from "../_components/ui";

const inputClass =
  "w-full rounded-2xl border border-white/[0.07] bg-black/30 px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 outline-none focus:border-[#c8163f]";

/**
 * The fork a web player meets the first time they sign in.
 *
 * Somebody the club already knows keeps their games, their rating and their free
 * entries, so they are asked for the nickname those are stored under — and nothing
 * else, by the club owner's decision.
 */
export default function ClientLinkPage() {
  const router = useRouter();

  const [played, setPlayed] = useState<boolean | null>(null);
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

  if (played === null) {
    return (
      <div className="flex min-h-full flex-col justify-center space-y-5 py-6">
        <div className="space-y-1.5 text-center">
          <PageTitle>Вы у нас уже играли?</PageTitle>
          <p className="text-sm text-white/45">
            Если играли — найдём ваш профиль со всей историей и проходками.
          </p>
        </div>

        <GlassCard className="space-y-3">
          <PrimaryButton onClick={() => setPlayed(true)}>Да, играл</PrimaryButton>
          <GhostButton onClick={() => router.replace("/client/onboarding")}>
            Нет, я впервые
          </GhostButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">
      <div className="space-y-1.5">
        <PageTitle>Найдём ваш профиль</PageTitle>
        <p className="text-sm text-white/45">
          Введите ник, под которым вы играете в клубе — к нему привяжется вся ваша
          история.
        </p>
      </div>

      <GlassCard className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-white/75">Игровой никнейм</span>
          <input
            className={inputClass}
            // No real player's nickname stands here as an example: the nickname is the
            // whole of what claims a profile, and one printed in the field is an
            // invitation to take somebody else's.
            placeholder="Ваш ник в клубе"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
      </GlassCard>

      {error ? (
        <p className="rounded-2xl border border-[#c8163f]/40 bg-[#c8163f]/10 px-4 py-3 text-sm text-white/80">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <PrimaryButton disabled={!nickname.trim()} loading={submitting} onClick={submit}>
          Это мой профиль
        </PrimaryButton>

        <GhostButton onClick={() => setPlayed(null)}>Назад</GhostButton>
      </div>
    </div>
  );
}
