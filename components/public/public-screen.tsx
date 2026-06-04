"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  calculateRemainingSeconds,
  getCurrentAndNextLevel,
} from "@/lib/timer/calculate";
import type { PublicTournamentState } from "@/lib/timer/types";
import { BlindsTable } from "@/components/public/blinds-table";
import { TimerDisplay } from "@/components/public/timer-display";

type PublicScreenProps = {
  initialState: PublicTournamentState;
  token: string;
};

async function fetchPublicState(token: string) {
  const response = await fetch(`/api/public-state/${token}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to refresh public state");
  return (await response.json()) as PublicTournamentState;
}

export function PublicScreen({ initialState, token }: PublicScreenProps) {
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    const nextState = await fetchPublicState(token);
    setState(nextState);
    setNow(new Date());
  }, [token]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`screen:${token}`)
      .on("broadcast", { event: "state-changed" }, () => {
        refresh().catch(() => undefined);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, token]);

  const remainingSeconds = calculateRemainingSeconds(
    state.timerState,
    state.blindLevels,
    now,
  );
  const { current, next } = useMemo(
    () => getCurrentAndNextLevel(state.blindLevels, state.timerState.currentLevelIndex),
    [state.blindLevels, state.timerState.currentLevelIndex],
  );

  return (
    <main className="public-board">
      <header className="public-header">
        <div>
          <p className="eyebrow">Покерный турнир</p>
          <h1>{state.tournament.name}</h1>
        </div>
        <div className="chip-bank">
          Банк фишек <strong>{state.tournament.startingStack.toLocaleString("ru-RU")}</strong>
        </div>
      </header>
      <BlindsTable
        currentLevelIndex={state.timerState.currentLevelIndex}
        levels={state.blindLevels}
      />
      <section className="public-main">
        <div className="public-logo-zone">
          {state.tournament.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Логотип турнира" src={state.tournament.logoUrl} />
          ) : (
            <span>Здесь будет ваш логотип</span>
          )}
        </div>
        <TimerDisplay
          current={current}
          next={next}
          registrationStatus={state.tournament.registrationStatus}
          remainingSeconds={remainingSeconds}
          timerState={state.timerState}
        />
      </section>
    </main>
  );
}
