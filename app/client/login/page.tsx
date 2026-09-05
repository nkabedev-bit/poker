"use client";

import { GlassCard, PageTitle, PrimaryButton } from "../_components/ui";

/**
 * The way in for a player who does not use Telegram.
 *
 * Yandex was chosen because it asks nothing of the club — no domain of its own, no VPN —
 * and nearly everyone here already has an account.
 */
export default function ClientLoginPage() {
  return (
    <div className="flex min-h-full flex-col justify-center space-y-5 py-6">
      <div className="space-y-1.5 text-center">
        <PageTitle>Вход в клуб</PageTitle>
        <p className="text-sm text-white/45">
          Афиши, запись на турниры, рейтинг и ваш профиль — после входа.
        </p>
      </div>

      <GlassCard className="space-y-4">
        <PrimaryButton onClick={() => window.location.assign("/api/auth/yandex/start")}>
          Войти с Яндекс ID
        </PrimaryButton>

        <p className="text-[12px] leading-relaxed text-white/35">
          Мы получим только имя, почту и фото профиля — чтобы узнавать вас в следующий
          раз и показывать в рейтинге клуба.
        </p>
      </GlassCard>

      <p className="text-center text-[12px] leading-relaxed text-white/30">
        Играете через Telegram? Откройте клуб в боте — там вход не нужен.
      </p>
    </div>
  );
}
