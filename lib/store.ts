import { useSyncExternalStore } from "react";
import { createEmptyData, createSeedData, DEFAULT_SETTINGS, logKey, stamp } from "./seed";
import { pendingMissed } from "./schedule";
import { todayKey, uid } from "./time";
import type { AppData, ChatMessage, DoseLog, Medication, Plan, Settings } from "./types";

const KEY = "medpal.v1";

type SyncHook = (data: AppData) => void;
let syncHook: SyncHook | null = null;
export function registerSyncHook(fn: SyncHook | null) {
  syncHook = fn;
}

function read(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.meds)) {
        return {
          ...parsed,
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          meds: parsed.meds ?? [],
          plans: parsed.plans ?? [],
          logs: parsed.logs ?? [],
          chat: parsed.chat ?? [],
          deviceId: parsed.deviceId || uid("dev"),
        };
      }
    }
  } catch {
    /* 解析失败时重新播种 */
  }
  const seeded = createSeedData();
  try {
    localStorage.setItem(KEY, JSON.stringify(seeded));
  } catch {
    /* 存储不可用时保持内存态可用 */
  }
  return seeded;
}

let state: AppData = read();
let undoInfo: { label: string; snapshot: AppData } | null = null;
const listeners = new Set<() => void>();

let saveTimer: number | undefined;
function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 存储配额不足时保持内存态可用 */
    }
    syncHook?.(state);
  }, 180);
}

function notify() {
  listeners.forEach((l) => l());
}

function commit(next: AppData, undoLabel?: string) {
  undoInfo = undoLabel ? { label: undoLabel, snapshot: state } : null;
  state = stamp(next);
  persist();
  notify();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function getUndo() {
  return undoInfo;
}

export function useApp(): AppData {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useUndo() {
  return useSyncExternalStore(subscribe, getUndo, getUndo);
}

export function undo(): boolean {
  if (!undoInfo) return false;
  const snap = undoInfo.snapshot;
  undoInfo = null;
  state = stamp(snap);
  persist();
  notify();
  return true;
}

export function dismissUndo() {
  undoInfo = null;
  notify();
}

/* ---------------- 设置 ---------------- */

export function setSettings(patch: Partial<Settings>) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

/* ---------------- 药品与计划 ---------------- */

export function addMed(med: Omit<Medication, "id" | "order" | "createdAt">, plan: Omit<Plan, "id" | "medId">) {
  const id = uid("med");
  const full: Medication = { ...med, id, order: state.meds.length, createdAt: new Date().toISOString() };
  const fullPlan: Plan = { ...plan, id: uid("plan"), medId: id };
  commit({ ...state, meds: [...state.meds, full], plans: [...state.plans, fullPlan] });
  return { med: full, plan: fullPlan };
}

export function updateMed(id: string, patch: Partial<Medication>) {
  commit({ ...state, meds: state.meds.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function updatePlan(medId: string, patch: Partial<Plan>) {
  commit({
    ...state,
    plans: state.plans.map((p) => (p.medId === medId ? { ...p, ...patch } : p)),
  });
}

export function deleteMed(id: string) {
  const med = state.meds.find((m) => m.id === id);
  if (!med) return;
  commit(
    {
      ...state,
      meds: state.meds.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i })),
      plans: state.plans.filter((p) => p.medId !== id),
      logs: state.logs.filter((l) => l.medId !== id),
    },
    `已删除「${med.name}」`,
  );
}

export function deleteMeds(ids: string[]) {
  const set = new Set(ids);
  const names = state.meds.filter((m) => set.has(m.id)).map((m) => m.name);
  if (!names.length) return;
  commit(
    {
      ...state,
      meds: state.meds.filter((m) => !set.has(m.id)).map((m, i) => ({ ...m, order: i })),
      plans: state.plans.filter((p) => !set.has(p.medId)),
      logs: state.logs.filter((l) => !set.has(l.medId)),
    },
    `已删除 ${names.length} 个药品（${names.slice(0, 2).join("、")}${names.length > 2 ? " 等" : ""}）`,
  );
}

export function reorderMeds(ids: string[]) {
  const rank = new Map(ids.map((id, i) => [id, i]));
  commit({
    ...state,
    meds: [...state.meds]
      .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
      .map((m, i) => ({ ...m, order: i })),
  });
}

export function moveMed(id: string, dir: -1 | 1) {
  const sorted = [...state.meds].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  reorderMeds(sorted.map((m) => m.id));
}

export function restock(id: string, amount: number) {
  const med = state.meds.find((m) => m.id === id);
  if (!med) return;
  updateMed(id, { stock: Math.max(0, med.stock + amount) });
}

/* ---------------- 服药打卡 ---------------- */

function upsertLog(log: DoseLog, stockDelta = 0) {
  const exists = state.logs.some((l) => l.id === log.id);
  const logs = exists ? state.logs.map((l) => (l.id === log.id ? log : l)) : [...state.logs, log];
  const meds = stockDelta
    ? state.meds.map((m) => (m.id === log.medId ? { ...m, stock: Math.max(0, m.stock + stockDelta) } : m))
    : state.meds;
  commit({ ...state, logs, meds });
}

function findDose(key: string) {
  const [planId, date, time] = key.split("|");
  const plan = state.plans.find((p) => p.id === planId);
  const med = plan ? state.meds.find((m) => m.id === plan.medId) : undefined;
  return plan && med ? { plan, med, date, time } : null;
}

export function takeDose(key: string, note = "") {
  const found = findDose(key);
  if (!found) return;
  const prev = state.logs.find((l) => l.id === key);
  const alreadyTaken = prev?.status === "taken";
  upsertLog(
    {
      id: key,
      medId: found.med.id,
      planId: found.plan.id,
      date: found.date,
      time: found.time,
      status: "taken",
      amount: found.plan.perDose,
      at: new Date().toISOString(),
      note,
    },
    alreadyTaken ? 0 : -found.plan.perDose,
  );
}

export function skipDose(key: string, note = "本次跳过") {
  const found = findDose(key);
  if (!found) return;
  const prev = state.logs.find((l) => l.id === key);
  upsertLog(
    {
      id: key,
      medId: found.med.id,
      planId: found.plan.id,
      date: found.date,
      time: found.time,
      status: "skipped",
      amount: found.plan.perDose,
      at: new Date().toISOString(),
      note,
    },
    prev?.status === "taken" ? found.plan.perDose : 0,
  );
}

export function markMissed(key: string, note = "") {
  const found = findDose(key);
  if (!found) return;
  const prev = state.logs.find((l) => l.id === key);
  upsertLog(
    {
      id: key,
      medId: found.med.id,
      planId: found.plan.id,
      date: found.date,
      time: found.time,
      status: "missed",
      amount: found.plan.perDose,
      at: null,
      note,
    },
    prev?.status === "taken" ? found.plan.perDose : 0,
  );
}

export function clearDose(key: string) {
  const prev = state.logs.find((l) => l.id === key);
  if (!prev) return;
  const found = findDose(key);
  commit(
    {
      ...state,
      logs: state.logs.filter((l) => l.id !== key),
      meds:
        prev.status === "taken" && found
          ? state.meds.map((m) => (m.id === prev.medId ? { ...m, stock: m.stock + prev.amount } : m))
          : state.meds,
    },
    "已撤销这次打卡",
  );
}

export function sweepMissed() {
  const missing = pendingMissed(state);
  if (!missing.length) return 0;
  commit({ ...state, logs: [...state.logs, ...missing] });
  return missing.length;
}

/* ---------------- 问答 ---------------- */

export function pushChat(msg: ChatMessage) {
  commit({ ...state, chat: [...state.chat, msg] });
}

export function patchChat(id: string, patch: Partial<ChatMessage>) {
  commit({ ...state, chat: state.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function clearChat() {
  commit({ ...state, chat: [] }, "已清空对话");
}

/* ---------------- 数据管理 ---------------- */

export function clearSamples() {
  const sampleIds = new Set(state.meds.filter((m) => m.source === "sample").map((m) => m.id));
  commit(
    {
      ...state,
      meds: state.meds.filter((m) => !sampleIds.has(m.id)).map((m, i) => ({ ...m, order: i })),
      plans: state.plans.filter((p) => !sampleIds.has(p.medId)),
      logs: state.logs.filter((l) => !sampleIds.has(l.medId)),
      settings: { ...state.settings, demoSeeded: false },
    },
    "已清除示例药品与示例记录",
  );
}

export function resetAll() {
  commit(createEmptyData(state.deviceId, { ...DEFAULT_SETTINGS, demoSeeded: false }), "已重置全部数据");
}

export function loadSamples() {
  const seed = createSeedData();
  commit({ ...seed, deviceId: state.deviceId, settings: { ...state.settings, demoSeeded: true } }, "已恢复示例数据");
}

export function exportJSON(): string {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(text) as AppData;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.meds) || !Array.isArray(parsed.plans)) {
      return { ok: false, error: "文件格式不正确，需要本应用导出的 JSON。" };
    }
    commit(
      {
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        logs: parsed.logs ?? [],
        chat: parsed.chat ?? [],
        deviceId: state.deviceId,
      },
      "已导入数据",
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "无法解析这个文件，请确认是完整的 JSON。" };
  }
}

export function todayLogCount() {
  const t = todayKey();
  return state.logs.filter((l) => l.date === t && l.status === "taken").length;
}

export { logKey };