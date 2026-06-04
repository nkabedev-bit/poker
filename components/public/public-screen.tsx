"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getCurrentAndNextLevel,
  getEffectiveTimerState,
  getLevelDuration,
} from "@/lib/timer/calculate";
import {
  getBlindAlertCue,
  getBlindAlertPlayback,
  getBlindAlertVolumeMultiplier,
} from "@/lib/timer/blind-alert";
import type { BlindAlertSound, PublicTournamentState } from "@/lib/timer/types";
import { BlindsTable } from "@/components/public/blinds-table";
import { TimerDisplay } from "@/components/public/timer-display";

type PublicScreenProps = {
  initialState: PublicTournamentState;
  serverNowIso: string;
  token: string;
};

async function fetchPublicState(token: string) {
  const response = await fetch(`/api/public-state/${token}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to refresh public state");
  return (await response.json()) as PublicTournamentState;
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type GeneratedBlindAlertSound = Exclude<BlindAlertSound, "custom" | "off">;

const CURSOR_IDLE_HIDE_MS = 2500;
const PUBLIC_PLAYERS_LIMIT = 28;
const MIN_PUBLIC_PLAYER_NAME_FONT_SIZE = 7;
const MIN_PUBLIC_PLAYER_NAME_SCALE = 0.48;
const PUBLIC_PLAYER_NAME_FIT_SAFETY = 0.985;
const GENERATED_BLIND_ALERT_PATTERNS: Record<GeneratedBlindAlertSound, Array<[number, number, number]>> = {
  chime: [
    [660, 0, 0.16],
    [880, 0.18, 0.22],
    [1320, 0.42, 0.3],
  ],
  double: [
    [900, 0, 0.14],
    [900, 0.24, 0.14],
  ],
  standard: [
    [780, 0, 0.2],
    [1040, 0.24, 0.22],
  ],
};
const generatedAudioUrlCache = new Map<GeneratedBlindAlertSound, string>();

function formatBountyCount(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function getPublicPlayersDensity(count: number) {
  if (count <= 6) return "hero";
  if (count <= 13) return "roomy";
  if (count <= 21) return "cozy";
  return "compact";
}

function PublicPlayerName({ name }: { name: string }) {
  const label = name || "Без имени";
  const nameRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = nameRef.current;
    const frame = element?.parentElement;
    if (!element || !frame) return;

    function fitName() {
      if (!element || !frame) return;

      element.style.fontSize = "";
      element.style.transform = "";

      const frameWidth = frame.clientWidth;
      const naturalWidth = element.scrollWidth;
      const maxFontSize = Number.parseFloat(getComputedStyle(element).fontSize);

      if (!frameWidth || !naturalWidth || !maxFontSize || naturalWidth <= frameWidth) return;

      const fontRatio = frameWidth / naturalWidth;
      const nextFontSize = Math.max(
        MIN_PUBLIC_PLAYER_NAME_FONT_SIZE,
        Math.floor(maxFontSize * fontRatio * PUBLIC_PLAYER_NAME_FIT_SAFETY * 100) / 100,
      );

      element.style.fontSize = `${nextFontSize}px`;

      const fittedWidth = element.scrollWidth;
      if (fittedWidth > frameWidth) {
        const scale = Math.max(
          MIN_PUBLIC_PLAYER_NAME_SCALE,
          Math.min(1, (frameWidth / fittedWidth) * PUBLIC_PLAYER_NAME_FIT_SAFETY),
        );
        element.style.transform = `scaleX(${scale})`;
      }
    }

    fitName();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitName);
    resizeObserver?.observe(frame);
    window.addEventListener("resize", fitName);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", fitName);
    };
  }, [label]);

  return (
    <span className="public-player-name-frame">
      <strong className="public-player-name" ref={nameRef} title={label}>
        {label}
      </strong>
    </span>
  );
}

function playTone(
  context: AudioContext,
  startAt: number,
  frequency: number,
  duration: number,
  volumeMultiplier: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const peak = 0.22 * volumeMultiplier;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.03);
}

function playBlindAlertSound(context: AudioContext, sound: GeneratedBlindAlertSound, volumeMultiplier: number) {
  const startAt = context.currentTime + 0.02;

  for (const [frequency, offset, duration] of GENERATED_BLIND_ALERT_PATTERNS[sound]) {
    playTone(context, startAt + offset, frequency, duration, volumeMultiplier);
  }
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return window.btoa(binary);
}

export function getGeneratedBlindAlertAudioUrl(sound: GeneratedBlindAlertSound) {
  const cached = generatedAudioUrlCache.get(sound);
  if (cached) return cached;

  const sampleRate = 22050;
  const tones = GENERATED_BLIND_ALERT_PATTERNS[sound];
  const totalDuration = Math.max(...tones.map(([, offset, duration]) => offset + duration)) + 0.08;
  const samples = Math.ceil(totalDuration * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples * 2, true);

  for (let sample = 0; sample < samples; sample += 1) {
    const time = sample / sampleRate;
    let value = 0;

    for (const [frequency, offset, duration] of tones) {
      const localTime = time - offset;
      if (localTime < 0 || localTime > duration) continue;

      const attack = Math.min(1, localTime / 0.02);
      const release = Math.min(1, (duration - localTime) / 0.04);
      const envelope = Math.max(0, Math.min(attack, release));
      value += Math.sin(2 * Math.PI * frequency * localTime) * envelope;
    }

    const clamped = Math.max(-1, Math.min(1, value * 0.38));
    view.setInt16(44 + sample * 2, Math.round(clamped * 32767), true);
  }

  const url = `data:audio/wav;base64,${arrayBufferToBase64(buffer)}`;
  generatedAudioUrlCache.set(sound, url);
  return url;
}

export function getPublicSoundIcon({
  sound,
  soundEnabled,
  soundReady,
  volume,
}: {
  sound: BlindAlertSound;
  soundEnabled: boolean;
  soundReady: boolean;
  volume: number;
}) {
  if (sound === "off" || !soundEnabled || !soundReady) return "🔇";
  return volume >= 7 ? "🔊" : volume >= 3 ? "🔉" : "🔈";
}

export function PublicScreen({ initialState, serverNowIso, token }: PublicScreenProps) {
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(() => new Date(serverNowIso));
  const [soundEnabled, setSoundEnabled] = useState(
    initialState.extras.settings.blindAlertSound !== "off",
  );
  const [soundReady, setSoundReady] = useState(false);
  const [volume, setVolume] = useState(7); // 1–10, default 7
  const volumeRef = useRef(7);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCursorHidden, setIsCursorHidden] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const cursorHideTimeoutRef = useRef<number | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastBlindAlertCueRef = useRef<string | null>(null);
  const isDemo = token === "demo";
  const blindAlertSound = state.extras.settings.blindAlertSound;
  const blindAlertCustomSoundUrl = state.extras.settings.blindAlertCustomSoundUrl;
  const blindAlertSeconds = state.extras.settings.blindAlertSeconds;
  const isBounty = state.extras.settings.isBounty;
  const soundIcon = getPublicSoundIcon({
    sound: blindAlertSound,
    soundEnabled,
    soundReady,
    volume,
  });

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
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    function clearCursorHideTimeout() {
      if (cursorHideTimeoutRef.current == null) return;
      window.clearTimeout(cursorHideTimeoutRef.current);
      cursorHideTimeoutRef.current = null;
    }

    function scheduleCursorHide() {
      clearCursorHideTimeout();
      cursorHideTimeoutRef.current = window.setTimeout(() => {
        setIsCursorHidden(true);
      }, CURSOR_IDLE_HIDE_MS);
    }

    function revealCursor() {
      setIsCursorHidden(false);
      scheduleCursorHide();
    }

    scheduleCursorHide();
    board.addEventListener("pointermove", revealCursor);
    board.addEventListener("pointerdown", revealCursor);
    document.addEventListener("keydown", revealCursor);

    return () => {
      clearCursorHideTimeout();
      board.removeEventListener("pointermove", revealCursor);
      board.removeEventListener("pointerdown", revealCursor);
      document.removeEventListener("keydown", revealCursor);
    };
  }, []);

  useEffect(() => {
    // In demo mode, we poll frequently since there's no websocket.
    // In production, we poll every 30 seconds as a fallback.
    const pollInterval = isDemo ? 5000 : 30000;
    const poll = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, pollInterval);

    return () => window.clearInterval(poll);
  }, [refresh, isDemo]);

  useEffect(() => {
    if (isDemo) return;

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
  }, [isDemo, refresh, token]);

  const { currentLevelIndex, remainingSeconds } = useMemo(() => {
    return getEffectiveTimerState(state.timerState, state.blindLevels, now);
  }, [state.timerState, state.blindLevels, now]);

  const { current, next } = useMemo(
    () => getCurrentAndNextLevel(state.blindLevels, currentLevelIndex),
    [state.blindLevels, currentLevelIndex],
  );
  const roundNumber = useMemo(() => {
    return state.blindLevels
      .slice(0, currentLevelIndex + 1)
      .filter((level) => !level.isBreak).length;
  }, [state.blindLevels, currentLevelIndex]);
  const secondsToBreak = useMemo(() => {
    if (!current || current.isBreak) return null;

    let total = remainingSeconds;
    for (
      let index = currentLevelIndex + 1;
      index < state.blindLevels.length;
      index += 1
    ) {
      const level = state.blindLevels[index];
      if (level.isBreak) return total;
      total += getLevelDuration(level);
    }

    return null;
  }, [current, remainingSeconds, state.blindLevels, currentLevelIndex]);
  const activePlayers = state.extras.players.filter((player) => player.status === "active");
  const eliminatedPlayers = state.extras.players.filter((player) => player.status === "eliminated");
  const visibleActivePlayers = activePlayers.slice(0, PUBLIC_PLAYERS_LIMIT);
  const playersDensity = getPublicPlayersDensity(visibleActivePlayers.length);
  const totalReentries = state.extras.players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
  const totalChips =
    state.extras.players.length > 0
      ? (state.extras.players.length + totalReentries) * state.tournament.startingStack
      : state.tournament.startingStack;

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await boardRef.current?.requestFullscreen();
  }

  const unlockSound = useCallback(async () => {
    const AudioContextClass =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

    if (!AudioContextClass) {
      setSoundReady(true);
      return;
    }

    audioContextRef.current ??= new AudioContextClass();
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    setSoundReady(true);
  }, []);

  useEffect(() => {
    function unlock() {
      unlockSound().catch(() => undefined);
    }

    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [unlockSound]);

  useEffect(() => {
    if (!soundEnabled || !soundReady) return;

    const cue = getBlindAlertCue({
      currentLevelIndex,
      lastCueKey: lastBlindAlertCueRef.current,
      nextLevelExists: Boolean(next),
      remainingSeconds,
      sound: blindAlertSound,
      status: state.timerState.status,
      warningSeconds: blindAlertSeconds,
    });

    if (!cue) return;

    const playback = getBlindAlertPlayback(blindAlertSound, blindAlertCustomSoundUrl);

    if (!playback) return;

    if (playback.kind === "custom") {
      htmlAudioRef.current?.pause();
      const audio = new Audio(playback.url);
      audio.volume = 1;
      htmlAudioRef.current = audio;
      audio.play().then(() => {
        lastBlindAlertCueRef.current = cue;
      }).catch(() => undefined);
      return;
    }

    if (audioContextRef.current?.state === "running") {
      playBlindAlertSound(
        audioContextRef.current,
        playback.sound,
        getBlindAlertVolumeMultiplier(volumeRef.current),
      );
      lastBlindAlertCueRef.current = cue;
      return;
    }

    htmlAudioRef.current?.pause();
    const fallbackAudio = new Audio(getGeneratedBlindAlertAudioUrl(playback.sound));
    fallbackAudio.volume = Math.min(1, 0.18 * getBlindAlertVolumeMultiplier(volumeRef.current));
    htmlAudioRef.current = fallbackAudio;
    fallbackAudio.play().then(() => {
      lastBlindAlertCueRef.current = cue;
    }).catch(() => undefined);
  }, [
    blindAlertCustomSoundUrl,
    blindAlertSeconds,
    blindAlertSound,
    currentLevelIndex,
    next,
    remainingSeconds,
    soundEnabled,
    soundReady,
    state.timerState.status,
  ]);

  function handleSoundButtonClick() {
    if (blindAlertSound === "off") return;

    if (!soundEnabled) {
      setSoundEnabled(true);
      unlockSound().catch(() => undefined);
      return;
    }

    if (!soundReady) {
      unlockSound().catch(() => undefined);
      return;
    }

    setSoundEnabled(false);
  }

  const soundButtonLabel = (() => {
    if (blindAlertSound === "off") return "Звук выключен в настройках";
    if (!soundEnabled) return "Включить звук";
    if (!soundReady) return "Разрешить звук";
    return "Выключить звук";
  })();

  return (
    <main
      className={isCursorHidden ? "public-board public-board--cursor-hidden" : "public-board"}
      ref={boardRef}
    >
      <header className="public-header">
        <div className="public-brand">
          {state.tournament.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Логотип турнира" src={state.tournament.logoUrl} />
          ) : null}
          <div>
            <h1>{state.tournament.name}</h1>
            <p>🏆 ПОКЕРНЫЙ ТУРНИР</p>
          </div>
        </div>
        <div className="public-center-title">
          ПОКЕР НЕ НА ДЕНЬГИ
        </div>
        <div className="public-header-tools">
          <div className="chip-bank">
            <span>Банк фишек</span>
            <strong>{totalChips.toLocaleString("ru-RU")}</strong>
          </div>
          <div className="sound-volume-group">
            <button
              aria-label={soundButtonLabel}
              className="public-icon-button"
              type="button"
              title={soundButtonLabel}
              onClick={handleSoundButtonClick}
            >
              {soundIcon}
            </button>
            {blindAlertSound !== "off" && soundEnabled && (
              <input
                aria-label="Громкость звука"
                className="volume-slider"
                max={10}
                min={1}
                step={1}
                style={{ ["--volume-pct" as string]: `${((volume - 1) / 9) * 100}%` }}
                title={`Громкость: ${volume}/10`}
                type="range"
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  volumeRef.current = v;
                }}
              />
            )}
          </div>
          <button
            aria-label={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
            className="public-icon-button"
            type="button"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? "⊞" : "⛶"}
          </button>
        </div>
      </header>
      <div className="public-tv-body">
        <BlindsTable
          activePlayers={activePlayers.length}
          currentLevelIndex={currentLevelIndex}
          eliminatedPlayers={eliminatedPlayers.length}
          levels={state.blindLevels}
        />
        <section className="public-main">
          {state.tournament.logoUrl ? (
            <div className="public-logo-spotlight" aria-label="Логотип турнира" role="img">
              <span className="public-logo-halo" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="public-logo-clear"
                src={state.tournament.logoUrl}
              />
            </div>
          ) : (
            <span className="public-logo-placeholder">здесь будет ваш логотип</span>
          )}
          <TimerDisplay
            current={current}
            next={next}
            registrationStatus={state.tournament.registrationStatus}
            remainingSeconds={remainingSeconds}
            roundNumber={roundNumber}
            secondsToBreak={secondsToBreak}
            timerState={state.timerState}
          />
        </section>
        <aside className="public-players-panel">
          <div className="public-players-counts">
            <span>🎯 Активные <strong>{activePlayers.length}</strong></span>
            <span>💀 Выбыли <strong>{eliminatedPlayers.length}</strong></span>
          </div>
          <div className="public-final-table">🏆 ФИНАЛЬНЫЙ СТОЛ</div>
          <div className={`public-player-mini-list public-player-mini-list--${playersDensity}`}>
            {visibleActivePlayers.map((player) => (
              <div
                className={isBounty ? undefined : "public-player-mini-list-item--name-only"}
                key={player.id}
              >
                {isBounty ? <span>🎯 {formatBountyCount(player.bountyCount)}</span> : null}
                <PublicPlayerName name={player.name} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
