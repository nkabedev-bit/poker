"use client";

/** Chrome's install offer: kept until the player asks for it, since it fires only once. */
export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: DeferredInstallPrompt | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Starts listening for the browser's install offer. Called from the app's layout, so the
 * offer is caught on whatever screen the player lands on — it does not wait for the home
 * screen, where the hint is drawn.
 */
export function listenForInstallPrompt() {
  if (typeof window === "undefined" || listenForInstallPrompt.started) return;
  listenForInstallPrompt.started = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Keeps the browser's own mini-bar away: the club's hint asks instead.
    event.preventDefault();
    deferred = event as DeferredInstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}
listenForInstallPrompt.started = false;

export function getInstallPrompt() {
  return deferred;
}

export function subscribeToInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the browser's dialog; the offer is spent either way. */
export async function askToInstall() {
  const offer = deferred;
  if (!offer) return false;

  deferred = null;
  notify();
  await offer.prompt();
  const { outcome } = await offer.userChoice;
  return outcome === "accepted";
}
