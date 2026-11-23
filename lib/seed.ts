import type { AppData, DoseLog, Medication, Plan, Settings } from "./types";
import { addDays, atTime, dateKey, todayKey, uid } from "./time";

export const DEFAULT_SETTINGS: Settings = {
  userName: "阿姨",
  fontScale: "large",
  theme: "auto",
  highContrast: false,
  voice: true,
  voiceRate: 0.92,
  voiceVolume: 1,
  sound: true,
  notify: true,
  leadMinutes: 10,
  graceMinutes: 60,
  snoozeMinutes: 10,
  demoSeeded: true,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_MEDS: Omit<Medication, "id" | "createdAt" | "order">[] = [
  {
    name: "苯磺酸氨氯地平片",
    alias: "络活喜 · 降压",
    spec: "5mg × 7片 / 盒",
    category: "降压",
    form: "片剂",
    usageText: "每日 1 次，每次 1 片，口服，不受进食影响",
    stock: 23,
    lowStock: 7,
    note: "长期服用，不可自行停药。避免大量饮用西柚汁。常见踝部水肿，若明显请复诊。",
    art: "/boxes/amlodipine.svg",
    source: "sample",
  },
  {
    name: "盐酸二甲双胍片",
    alias: "格华止 · 降糖",
    spec: "0.5g × 20片 / 盒",
    category: "降糖",
    form: "片剂",
    usageText: "每日 3 次，每次 1 片，餐中或餐后立即服用",
    stock: 31,
    lowStock: 10,
    note: "餐中服可减少胃肠反应。做增强 CT 造影前后需按医嘱暂停。长期服用注意维生素 B12。",
    art: "/boxes/metformin.svg",
    source: "sample",
  },
  {
    name: "阿托伐他汀钙片",
    alias: "立普妥 · 降脂",
    spec: "20mg × 7片 / 盒",
    category: "降脂",
    form: "片剂",
    usageText: "每日 1 次，每次 1 片，睡前口服",
    stock: 4,
    lowStock: 7,
    note: "出现不明原因肌痛、乏力或尿色加深应及时就医。定期复查肝功能与血脂。",
    art: "/boxes/atorvastatin.svg",
    source: "sample",
  },
];

const SAMPLE_PLANS: { perDose: number; times: string[]; food: Plan["food"] }[] = [
  { perDose: 1, times: ["08:00"], food: "any" },
  { perDose: 1, times: ["08:00", "12:30", "18:30"], food: "with" },
  { perDose: 1, times: ["21:30"], food: "any" },
];

export function buildSamplePlans(meds: Medication[]): Plan[] {
  return meds.map((med, i) => ({
    id: uid("plan"),
    medId: med.id,
    perDose: SAMPLE_PLANS[i].perDose,
    unit: "片" as const,
    times: [...SAMPLE_PLANS[i].times],
    food: SAMPLE_PLANS[i].food,
    startDate: addDays(todayKey(), -21),
    endDate: null,
    remind: true,
    active: true,
  }));
}

function seedHistory(meds: Medication[], plans: Plan[]): DoseLog[] {
  const rnd = mulberry32(20261117);
  const logs: DoseLog[] = [];
  const today = todayKey();
  const now = new Date();

  for (let back = 21; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const plan of plans) {
      if (date < plan.startDate) continue;
      const med = meds.find((m) => m.id === plan.medId);
      if (!med) continue;
      for (const time of plan.times) {
        const scheduled = atTime(date, time);
        if (back === 0 && scheduled.getTime() > now.getTime() - 20 * 60000) continue;
        const roll = rnd();
        let status: DoseLog["status"] = "taken";
        if (back === 0) {
          status = time === "12:30" ? "missed" : "taken";
        } else if (roll > 0.93) {
          status = "missed";
        } else if (roll > 0.9) {
          status = "skipped";
        }
        const jitter = Math.round((rnd() - 0.35) * 26) * 60000;
        logs.push({
          id: `${plan.id}|${date}|${time}`,
          medId: med.id,
          planId: plan.id,
          date,
          time,
          status,
          amount: plan.perDose,
          at: status === "taken" ? new Date(scheduled.getTime() + jitter).toISOString() : null,
          note: status === "missed" && back === 0 ? "中午外出，忘记服药" : "",
        });
      }
    }
  }
  return logs;
}

export function createSeedData(): AppData {
  const created = new Date(Date.now() - 21 * 86400000).toISOString();
  const meds: Medication[] = SAMPLE_MEDS.map((m, i) => ({
    ...m,
    id: uid("med"),
    order: i,
    createdAt: created,
  }));
  const plans = buildSamplePlans(meds);
  return {
    version: 1,
    meds,
    plans,
    logs: seedHistory(meds, plans),
    chat: [],
    settings: { ...DEFAULT_SETTINGS },
    deviceId: uid("dev"),
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyData(deviceId: string, settings: Settings): AppData {
  return {
    version: 1,
    meds: [],
    plans: [],
    logs: [],
    chat: [],
    settings: { ...settings, demoSeeded: false },
    deviceId,
    updatedAt: new Date().toISOString(),
  };
}

export function stamp(d: AppData): AppData {
  return { ...d, updatedAt: new Date().toISOString() };
}

export function logKey(planId: string, date: string, time: string) {
  return `${planId}|${date}|${time}`;
}

export function isToday(key: string) {
  return key === dateKey(new Date());
}