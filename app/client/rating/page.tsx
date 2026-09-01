"use client";

import { Trophy } from "lucide-react";
import { GlassCard, ScreenMessage } from "../_components/ui";

// The live standings come from a separate Google Sheet the club still has to hand over;
// until then the screen says so plainly instead of showing invented numbers.
export default function ClientRatingPage() {
  return (
    <div className="space-y-5 pt-2">
      <h1 className="px-1 text-2xl font-bold">Рейтинг</h1>

      <ScreenMessage
        icon={<Trophy size={30} />}
        title="Таблица скоро будет здесь"
        subtitle="Подключаем рейтинг клуба — топ игроков и ваше место появятся в этом разделе."
      />

      <GlassCard className="!p-4">
        <p className="text-sm text-white/55">
          Пока рейтинг ведётся в клубной таблице. Спросите администратора, если нужна текущая
          позиция.
        </p>
      </GlassCard>
    </div>
  );
}
