"use client";

import type { TelegramWebApp } from "./layout";

/**
 * Telegram's mini-app calls, answered by the browser.
 *
 * Every screen of the desk talks to `Telegram.WebApp`: alerts, confirmations, the big
 * button at the bottom, haptics. Outside Telegram those calls throw or do nothing — a
 * confirmation that never calls back is an action that never happens. The desk opened
 * in a phone's browser gets this stand-in instead, so no screen has to know where it
 * runs: the browser's own dialogs, and a bottom button and a QR scanner the layout
 * draws itself.
 */
export type BrowserMainButton = { progress: boolean; text: string; visible: boolean };

/** A screen waiting for a QR code, as Telegram's scanner would hand it over. */
export type BrowserScanRequest = {
  // Telegram's contract: true closes the scanner, anything else keeps it reading.
  onCode: (text: string) => boolean | void;
  text?: string;
};

let mainButton: BrowserMainButton = { progress: false, text: "", visible: false };
let scanRequest: BrowserScanRequest | null = null;
const mainButtonHandlers = new Set<() => void>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function updateMainButton(change: Partial<BrowserMainButton>) {
  mainButton = { ...mainButton, ...change };
  notify();
}

/**
 * For `useSyncExternalStore`: the layout redraws the bottom button and the scanner
 * whenever a screen asks for them.
 */
export function subscribeBrowserDesk(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readBrowserMainButton() {
  return mainButton;
}

export function pressBrowserMainButton() {
  mainButtonHandlers.forEach((handler) => handler());
}

export function readBrowserScanRequest() {
  return scanRequest;
}

export function closeBrowserScan() {
  scanRequest = null;
  notify();
}

export const browserWebApp: TelegramWebApp = {
  initData: "",
  ready: () => {},
  expand: () => {},
  showAlert: (message, callback) => {
    window.alert(message);
    callback?.();
  },
  showConfirm: (message, callback) => {
    callback(window.confirm(message));
  },
  openTelegramLink: (url) => {
    window.open(url, "_blank", "noopener");
  },
  showScanQrPopup: (params, callback) => {
    scanRequest = { onCode: callback, text: params.text };
    notify();
  },
  closeScanQrPopup: closeBrowserScan,
  // A phone's browser has no haptics worth the name; the screens' own feedback stays.
  HapticFeedback: {
    impactOccurred: () => {},
    notificationOccurred: () => {},
  },
  MainButton: {
    setText: (text) => updateMainButton({ text }),
    show: () => updateMainButton({ visible: true }),
    hide: () => updateMainButton({ progress: false, visible: false }),
    onClick: (callback) => {
      mainButtonHandlers.add(callback);
    },
    offClick: (callback) => {
      mainButtonHandlers.delete(callback);
    },
    showProgress: () => updateMainButton({ progress: true }),
    hideProgress: () => updateMainButton({ progress: false }),
  },
};
