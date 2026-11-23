import { logKey } from "./seed";
import { atTime, dateKey, slotOf, todayKey } from "./time";
import type { AppData, Dose, DoseLog, Plan } from "./types";

export function planActiveOn(plan: Plan, date: string): boolean {
  if (!plan.active) return false;
  if (date < plan.startDate) return false;
  if (plan.endDate && date > plan.endDate) return false;
  return true;
}

export function dosesFor(data: AppData, date: string, now: Date = new Date()): Dose[] {
  const today = todayKey();
  const grace = data.settings.graceMinutes * 60000;
  const lead = data.settings.leadMinutes * 60000;
  const byId = new Map(data.meds.map((m) => [m.id, m]));
  const logs = new Map(data.logs.map((l) => [l.id, l]));
  const out: Dose[] = [];

  for (const plan of data.plans) {
    if (!planActiveOn(plan, date)) continue;
    const med = byId.get(plan.medId);
    if (!med) continue;
    for (const time of plan.times) {
      const at = atTime(date, time);
      const log = logs.get(logKey(plan.id, date, time)) ?? null;
      let status: Dose["status"];
      if (log?.status === "taken") status = "done";
      else if (log?.status === "skipped") status = "skipped";
      else if (log?.status === "missed") status = "missed";
      else if (date > today) status = "upcoming";
      else if (at.getTime() > now.getTime())
        status = at.getTime() - now.getTime() <= lead ? "due" : "upcoming";
      else status = now.getTime() - at.getTime() > grace ? "missed" : "due";

      out.push({
        key: logKey(plan.id, date, time),
        med,
        plan,
        date,
        time,
        slot: slotOf(time),
        amount: plan.perDose,
        at,
        status,
        log,
      });
    }
  }

  out.sort((a, b) => a.time.localeCompare(b.time) || a.med.order - b.med.order);
  return out;
}

export function nextDose(doses: Dose[], now: Date = new Date()): Dose | null {
  const pending = doses.filter((d) => d.status === "due" || d.status === "upcoming");
  if (!pending.length) return null;
  const due = pending.filter((d) => d.status === "due");
  const pool = due.length ? due : pending;
  return pool.reduce((best, d) => (d.at.getTime() < best.at.getTime() ? d : best), pool[0]);
}

export function dayStats(doses: Dose[]) {
  const total = doses.length;
  const taken = doses.filter((d) => d.status === "done").length;
  const missed = doses.filter((d) => d.status === "missed").length;
  const skipped = doses.filter((d) => d.status === "skipped").length;
  const pending = total - taken - missed - skipped;
  return { total, taken, missed, skipped, pending, rate: total ? taken / total : 0 };
}

export interface DayPoint {
  date: string;
  label: string;
  taken: number;
  missed: number;
  skipped: number;
  total: number;
  rate: number;
}

export function adherenceSeries(data: AppData, days: number, now: Date = new Date()): DayPoint[] {
  const out: DayPoint[] = [];
  const today = todayKey();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dateKey(d);
    const doses = dosesFor(data, key, now);
    const s = dayStats(doses);
    out.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      taken: s.taken,
      missed: s.missed,
      skipped: s.skipped,
      total: s.total,
      rate: s.total ? Math.round((s.taken / s.total) * 100) : 0,
    });
  }
  return out;
}

export function streak(data: AppData, now: Date = new Date()): number {
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dateKey(d);
    const doses = dosesFor(data, key, now);
    if (!doses.length) break;
    const s = dayStats(doses);
    if (s.missed > 0 || (i > 0 && s.taken < s.total)) break;
    if (i === 0 && s.pending > 0) {
      count++;
      continue;
    }
    count++;
  }
  return count;
}

export function pendingMissed(data: AppData, now: Date = new Date()): DoseLog[] {
  const today = todayKey();
  const grace = data.settings.graceMinutes * 60000;
  const existing = new Set(data.logs.map((l) => l.id));
  const out: DoseLog[] = [];
  for (const plan of data.plans) {
    if (!plan.active) continue;
    for (let back = 0; back < 30; back++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      const date = dateKey(d);
      if (date < plan.startDate) break;
      for (const time of plan.times) {
        const id = logKey(plan.id, date, time);
        if (existing.has(id)) continue;
        const at = atTime(date, time);
        if (now.getTime() - at.getTime() <= grace) continue;
        out.push({
          id,
          medId: plan.medId,
          planId: plan.id,
          date,
          time,
          status: "missed",
          amount: plan.perDose,
          at: null,
          note: "",
        });
      }
    }
  }
  return out;
}

export function upcomingAlarms(data: AppData, now: Date = new Date(), horizonMinutes = 720) {
  const out: { key: string; at: number; title: string; body: string; medId: string }[] = [];
  const today = todayKey();
  for (const date of [today, dateKey(new Date(now.getTime() + 86400000))]) {
    for (const dose of dosesFor(data, date, now)) {
      if (!dose.plan.remind) continue;
      if (dose.log) continue;
      const fire = dose.at.getTime() - data.settings.leadMinutes * 60000;
      if (fire < now.getTime() - 60000) continue;
      if (fire > now.getTime() + horizonMinutes * 60000) continue;
      out.push({
        key: dose.key,
        at: fire,
        title: `${dose.time} 该服药了`,
        body: `${dose.med.name} · 每次 ${dose.amount} ${dose.plan.unit}`,
        medId: dose.med.id,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 24);
}