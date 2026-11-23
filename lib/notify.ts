export type NotifyState = NotificationPermission | "unsupported";

let swRegistration: ServiceWorkerRegistration | null = null;

export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyState(): NotifyState {
  if (!notifySupported()) return "unsupported";
  return Notification.permission;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return swRegistration;
  } catch {
    return null;
  }
}

export function getRegistration() {
  return swRegistration;
}

export async function requestNotify(): Promise<NotifyState> {
  if (!notifySupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export interface Alarm {
  key: string;
  at: number;
  title: string;
  body: string;
  medId: string;
}

export async function syncAlarms(alarms: Alarm[]) {
  const reg = swRegistration ?? (await navigator.serviceWorker?.getRegistration?.().catch(() => null)) ?? null;
  if (!reg) return;
  swRegistration = reg;
  const target = reg.active ?? reg.waiting ?? reg.installing;
  target?.postMessage({ type: "MEDPAL_ALARMS", alarms });
}

export async function showLocalNotification(title: string, body: string, tag: string) {
  if (!notifySupported() || Notification.permission !== "granted") return false;
  const reg = swRegistration;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [180, 90, 180],
    renotify: true,
    data: { url: `/?dose=${encodeURIComponent(tag)}` },
  };
  try {
    if (reg?.active) {
      await reg.showNotification(title, options);
    } else {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
    return true;
  } catch {
    return false;
  }
}

export async function enablePeriodicSync() {
  const reg = swRegistration;
  if (!reg) return false;
  const periodic = (reg as ServiceWorkerRegistration & {
    periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
  }).periodicSync;
  if (!periodic) return false;
  try {
    await periodic.register("medpal-check", { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

export function installPromptEvent(): BeforeInstallPromptEvent | null {
  return pendingPrompt;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pendingPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

export function watchInstallPrompt(fn: () => void) {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

export function captureInstallPrompt(e: Event) {
  e.preventDefault();
  pendingPrompt = e as BeforeInstallPromptEvent;
  installListeners.forEach((l) => l());
}

export function clearInstallPrompt() {
  pendingPrompt = null;
  installListeners.forEach((l) => l());
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}