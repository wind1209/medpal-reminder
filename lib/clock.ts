import { useSyncExternalStore } from "react";

let now = new Date();
const listeners = new Set<() => void>();
let timer: number | undefined;

function tick() {
  now = new Date();
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (timer === undefined) timer = window.setInterval(tick, 1000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useClock(): Date {
  return useSyncExternalStore(subscribe, () => now, () => now);
}

export function clockNow(): Date {
  return now;
}