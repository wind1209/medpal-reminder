import { SLOT_ORDER, type SlotKey } from "./types";

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateKey(dt);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function hhmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${`${Math.floor(wrapped / 60)}`.padStart(2, "0")}:${`${wrapped % 60}`.padStart(2, "0")}`;
}

export function atTime(key: string, time: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function slotOf(time: string): SlotKey {
  const h = Math.floor(minutesOf(time) / 60);
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "noon";
  if (h >= 17 && h < 21) return "evening";
  return "bedtime";
}

export function slotIndex(slot: SlotKey): number {
  return SLOT_ORDER.indexOf(slot);
}

export function clockText(d: Date): string {
  return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

export function dateCN(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}月${d}日 ${WEEK[dt.getDay()]}`;
}

export function dateFullCN(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

export function greeting(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 22) return "晚上好";
  return "夜深了";
}

export function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => `${n}`.padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function humanGap(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "马上";
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  const d = Math.floor(h / 24);
  return `${d} 天`;
}

export function dueLabel(deltaMs: number): string {
  if (deltaMs > 0) return `${humanGap(deltaMs)}后到点`;
  if (-deltaMs < 60000) return "刚到点，请服药";
  return `已到点 · 超时 ${humanGap(-deltaMs)}`;
}

export function relativeDay(key: string): string {
  const t = todayKey();
  if (key === t) return "今天";
  if (key === addDays(t, -1)) return "昨天";
  if (key === addDays(t, 1)) return "明天";
  return dateCN(key);
}

export function amountText(n: number, unit: string): string {
  const v = Number.isInteger(n) ? `${n}` : `${n}`.replace(/0$/, "");
  return `${v} ${unit}`;
}

export function uid(prefix = "id"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}