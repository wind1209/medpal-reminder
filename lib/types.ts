export type MedCategory = "降压" | "降糖" | "降脂" | "抗凝" | "其他";

export type DoseUnit = "片" | "粒" | "袋" | "毫升" | "滴";

export type FoodRelation = "before" | "after" | "with" | "any";

export type DoseStatus = "taken" | "missed" | "skipped";

export type SlotKey = "morning" | "noon" | "evening" | "bedtime";

export type MedSource = "sample" | "ocr" | "manual";

export interface Medication {
  id: string;
  name: string;
  alias: string;
  spec: string;
  category: MedCategory;
  form: string;
  usageText: string;
  stock: number;
  lowStock: number;
  note: string;
  art: string;
  source: MedSource;
  order: number;
  createdAt: string;
}

export interface Plan {
  id: string;
  medId: string;
  perDose: number;
  unit: DoseUnit;
  times: string[];
  food: FoodRelation;
  startDate: string;
  endDate: string | null;
  remind: boolean;
  active: boolean;
}

export interface DoseLog {
  id: string;
  medId: string;
  planId: string;
  date: string;
  time: string;
  status: DoseStatus;
  amount: number;
  at: string | null;
  note: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  engine: "qwen" | "offline" | "safety";
  pending?: boolean;
}

export type FontScale = "standard" | "large" | "xlarge";
export type ThemeMode = "auto" | "light" | "dark";

export interface Settings {
  userName: string;
  fontScale: FontScale;
  theme: ThemeMode;
  highContrast: boolean;
  voice: boolean;
  voiceRate: number;
  voiceVolume: number;
  sound: boolean;
  notify: boolean;
  leadMinutes: number;
  graceMinutes: number;
  snoozeMinutes: number;
  demoSeeded: boolean;
}

export interface AppData {
  version: 1;
  meds: Medication[];
  plans: Plan[];
  logs: DoseLog[];
  chat: ChatMessage[];
  settings: Settings;
  deviceId: string;
  updatedAt: string;
}

export interface Dose {
  key: string;
  med: Medication;
  plan: Plan;
  date: string;
  time: string;
  slot: SlotKey;
  amount: number;
  at: Date;
  status: DoseStatus | "due" | "upcoming" | "done";
  log: DoseLog | null;
}

export const SLOT_META: Record<
  SlotKey,
  { label: string; short: string; hue: string; soft: string; from: number; to: number }
> = {
  morning: { label: "早上", short: "早", hue: "var(--amber-500)", soft: "var(--amber-100)", from: 5, to: 11 },
  noon: { label: "中午", short: "中", hue: "var(--azure-500)", soft: "var(--azure-100)", from: 11, to: 17 },
  evening: { label: "晚上", short: "晚", hue: "var(--vermil-500)", soft: "var(--vermil-100)", from: 17, to: 21 },
  bedtime: { label: "睡前", short: "睡", hue: "var(--violet-500)", soft: "var(--violet-100)", from: 21, to: 29 },
};

export const SLOT_ORDER: SlotKey[] = ["morning", "noon", "evening", "bedtime"];

export const FOOD_LABEL: Record<FoodRelation, string> = {
  before: "餐前 30 分钟",
  after: "餐后服用",
  with: "随餐服用",
  any: "不限进食",
};

export const CATEGORY_HUE: Record<MedCategory, string> = {
  降压: "var(--vermil-500)",
  降糖: "var(--azure-500)",
  降脂: "var(--amber-500)",
  抗凝: "var(--violet-500)",
  其他: "var(--pine-500)",
};