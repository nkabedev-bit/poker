import "server-only";

import { cookies } from "next/headers";
import { demoPublicState } from "@/lib/demo-state";
import {
  defaultTournamentExtras,
  mergeTournamentExtras,
  type TournamentExtrasPatch,
} from "@/lib/tournament-extras";
import type {
  BlindLevel,
  PublicTournamentState,
  RegistrationStatus,
  TimerState,
  TournamentExtras,
} from "@/lib/timer/types";

const DEMO_STATE_COOKIE = "poker-demo-state";

type DemoCookieState = {
  tournament?: {
    logoUrl?: string | null;
    name?: string;
    registrationStatus?: RegistrationStatus;
    registrationMinutes?: number;
    startingStack?: number;
  };
  blindLevels?: BlindLevel[];
  timerState?: TimerState;
  extras?: TournamentExtras;
};

export async function loadDemoPublicState(): Promise<PublicTournamentState> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEMO_STATE_COOKIE)?.value;

  if (!raw) return demoPublicState;

  try {
    const parsed = JSON.parse(raw) as DemoCookieState;

    return {
      tournament: {
        ...demoPublicState.tournament,
        ...parsed.tournament,
      },
      timerState: parsed.timerState ?? demoPublicState.timerState,
      blindLevels:
        Array.isArray(parsed.blindLevels) && parsed.blindLevels.length > 0
          ? parsed.blindLevels
          : demoPublicState.blindLevels,
      extras: mergeTournamentExtras(parsed.extras),
    };
  } catch {
    return {
      ...demoPublicState,
      extras: defaultTournamentExtras,
    };
  }
}

export async function saveDemoTournamentSettings(values: {
  logoUrl: string | null;
  name: string;
  registrationStatus?: RegistrationStatus;
  registrationMinutes: number;
  startingStack: number;
}) {
  const current = await loadDemoCookieState();
  await saveDemoCookieState({
    ...current,
    tournament: values,
  });
}

export async function saveDemoBlindLevels(blindLevels: BlindLevel[]) {
  const current = await loadDemoCookieState();
  await saveDemoCookieState({
    ...current,
    blindLevels,
  });
}

export async function saveDemoTimerState(timerState: TimerState) {
  const current = await loadDemoCookieState();
  await saveDemoCookieState({
    ...current,
    timerState,
  });
}

export async function saveDemoExtras(patch: TournamentExtrasPatch) {
  const current = await loadDemoCookieState();
  const extras = mergeTournamentExtras({
    ...current.extras,
    ...patch,
    clientBot: { ...current.extras?.clientBot, ...patch.clientBot },
    settings: { ...current.extras?.settings, ...patch.settings },
    pts: { ...current.extras?.pts, ...patch.pts },
  });

  await saveDemoCookieState({
    ...current,
    extras,
  });
}

async function loadDemoCookieState(): Promise<DemoCookieState> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEMO_STATE_COOKIE)?.value;
  if (!raw) return {};

  try {
    return JSON.parse(raw) as DemoCookieState;
  } catch {
    return {};
  }
}

async function saveDemoCookieState(state: DemoCookieState) {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_STATE_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
}
