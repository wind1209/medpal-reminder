import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "./seed";
import type { AppData, ChatMessage, DoseLog, Medication, Plan } from "./types";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey && /^https?:\/\//.test(url));
}

export function supabaseProjectHost(): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

let client: SupabaseClient | null = null;
export function db(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export type SyncStatus = "off" | "signed-out" | "idle" | "syncing" | "error";

let status: SyncStatus = supabaseConfigured() ? "signed-out" : "off";
let lastError = "";
let lastSyncAt = "";
let currentSession: Session | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function syncSnapshot() {
  return { status, lastError, lastSyncAt, email: currentSession?.user?.email ?? "" };
}

export async function initSync() {
  const c = db();
  if (!c) return;
  const { data } = await c.auth.getSession();
  currentSession = data.session;
  status = currentSession ? "idle" : "signed-out";
  emit();
  c.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    status = session ? "idle" : "signed-out";
    lastError = "";
    emit();
  });
}

export async function sendCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const c = db();
  if (!c) return { ok: false, error: "尚未配置 Supabase。" };
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function verifyCode(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const c = db();
  if (!c) return { ok: false, error: "尚未配置 Supabase。" };
  const { error } = await c.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: error.message };
  status = "idle";
  emit();
  return { ok: true };
}

export async function signOutCloud() {
  const c = db();
  if (!c) return;
  await c.auth.signOut();
  currentSession = null;
  status = "signed-out";
  emit();
}

function medRow(m: Medication, userId: string) {
  return {
    user_id: userId,
    id: m.id,
    name: m.name,
    alias: m.alias,
    spec: m.spec,
    category: m.category,
    form: m.form,
    usage_text: m.usageText,
    stock: m.stock,
    low_stock: m.lowStock,
    note: m.note,
    art: m.art,
    source: m.source,
    sort_order: m.order,
    created_at: m.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function planRow(p: Plan, userId: string) {
  return {
    user_id: userId,
    id: p.id,
    med_id: p.medId,
    per_dose: p.perDose,
    unit: p.unit,
    times: p.times,
    food: p.food,
    start_date: p.startDate,
    end_date: p.endDate,
    remind: p.remind,
    active: p.active,
    updated_at: new Date().toISOString(),
  };
}

function logRow(l: DoseLog, userId: string) {
  return {
    user_id: userId,
    id: l.id,
    med_id: l.medId,
    plan_id: l.planId,
    dose_date: l.date,
    dose_time: l.time,
    status: l.status,
    amount: l.amount,
    taken_at: l.at,
    note: l.note,
    updated_at: new Date().toISOString(),
  };
}

function chatRow(m: ChatMessage, userId: string) {
  return {
    user_id: userId,
    id: m.id,
    role: m.role,
    content: m.text,
    engine: m.engine,
    created_at: m.at,
  };
}

async function mirror(
  c: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  userId: string,
) {
  if (rows.length) {
    const { error } = await c.from(table).upsert(rows, { onConflict: "user_id,id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const keep = rows.map((r) => r.id as string);
  const query = c.from(table).delete().eq("user_id", userId);
  const { error } = keep.length ? await query.not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`) : await query;
  if (error) throw new Error(`${table} 清理: ${error.message}`);
}

export async function pushAll(data: AppData): Promise<{ ok: boolean; error?: string }> {
  const c = db();
  if (!c || !currentSession) return { ok: false, error: "未登录云端。" };
  const userId = currentSession.user.id;
  status = "syncing";
  emit();
  try {
    await mirror(c, "medications", data.meds.map((m) => medRow(m, userId)), userId);
    await mirror(c, "plans", data.plans.map((p) => planRow(p, userId)), userId);
    await mirror(c, "dose_logs", data.logs.map((l) => logRow(l, userId)), userId);
    await mirror(c, "chat_messages", data.chat.filter((m) => !m.pending).map((m) => chatRow(m, userId)), userId);
    const { error } = await c.from("app_settings").upsert(
      {
        user_id: userId,
        device_id: data.deviceId,
        payload: data.settings,
        updated_at: data.updatedAt,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    status = "idle";
    lastError = "";
    lastSyncAt = new Date().toISOString();
    emit();
    return { ok: true };
  } catch (e) {
    status = "error";
    lastError = e instanceof Error ? e.message : "同步失败";
    emit();
    return { ok: false, error: lastError };
  }
}

export async function pullAll(deviceId: string): Promise<{ data: AppData | null; error?: string }> {
  const c = db();
  if (!c || !currentSession) return { data: null, error: "未登录云端。" };
  const userId = currentSession.user.id;
  status = "syncing";
  emit();
  try {
    const [meds, plans, logs, chat, settings] = await Promise.all([
      c.from("medications").select("*").eq("user_id", userId).order("sort_order"),
      c.from("plans").select("*").eq("user_id", userId),
      c.from("dose_logs").select("*").eq("user_id", userId),
      c.from("chat_messages").select("*").eq("user_id", userId).order("created_at"),
      c.from("app_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    const firstError = meds.error ?? plans.error ?? logs.error ?? chat.error ?? settings.error;
    if (firstError) throw new Error(firstError.message);

    const remoteMeds: Medication[] = (meds.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      alias: r.alias ?? "",
      spec: r.spec ?? "",
      category: r.category ?? "其他",
      form: r.form ?? "片剂",
      usageText: r.usage_text ?? "",
      stock: Number(r.stock ?? 0),
      lowStock: Number(r.low_stock ?? 5),
      note: r.note ?? "",
      art: r.art ?? "",
      source: r.source ?? "manual",
      order: Number(r.sort_order ?? 0),
      createdAt: r.created_at ?? new Date().toISOString(),
    }));

    if (!remoteMeds.length && !(settings.data?.payload)) {
      status = "idle";
      emit();
      return { data: null };
    }

    const data: AppData = {
      version: 1,
      meds: remoteMeds,
      plans: (plans.data ?? []).map((r) => ({
        id: r.id,
        medId: r.med_id,
        perDose: Number(r.per_dose ?? 1),
        unit: r.unit ?? "片",
        times: Array.isArray(r.times) ? r.times : ["08:00"],
        food: r.food ?? "any",
        startDate: r.start_date ?? new Date().toISOString().slice(0, 10),
        endDate: r.end_date ?? null,
        remind: Boolean(r.remind),
        active: Boolean(r.active),
      })),
      logs: (logs.data ?? []).map((r) => ({
        id: r.id,
        medId: r.med_id,
        planId: r.plan_id,
        date: r.dose_date,
        time: r.dose_time,
        status: r.status ?? "taken",
        amount: Number(r.amount ?? 1),
        at: r.taken_at ?? null,
        note: r.note ?? "",
      })),
      chat: (chat.data ?? []).map((r) => ({
        id: r.id,
        role: r.role === "user" ? "user" : "assistant",
        text: r.content ?? "",
        at: r.created_at ?? new Date().toISOString(),
        engine: r.engine ?? "offline",
      })),
      settings: { ...DEFAULT_SETTINGS, ...(settings.data?.payload ?? {}) },
      deviceId,
      updatedAt: settings.data?.updated_at ?? new Date().toISOString(),
    };
    status = "idle";
    lastError = "";
    lastSyncAt = new Date().toISOString();
    emit();
    return { data };
  } catch (e) {
    status = "error";
    lastError = e instanceof Error ? e.message : "拉取失败";
    emit();
    return { data: null, error: lastError };
  }
}