import { AlarmClock, Bell, BellOff, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FOOD_LABEL,
  type DoseUnit,
  type FoodRelation,
  type MedCategory,
  type Medication,
  type Plan,
} from "@/lib/types";
import { defaultTimes } from "@/lib/parse";
import { minutesOf, slotOf, todayKey } from "@/lib/time";
import { SLOT_META } from "@/lib/types";
import { BigButton, Chip, Field, Stepper, ToggleRow, inputClass } from "./bits";

const CATEGORIES: MedCategory[] = ["降压", "降糖", "降脂", "抗凝", "其他"];
const UNITS: DoseUnit[] = ["片", "粒", "袋", "毫升", "滴"];
const FOODS: FoodRelation[] = ["any", "before", "with", "after"];
const FORMS = ["片剂", "胶囊", "颗粒", "口服液", "注射剂", "外用"];

export type MedDraft = Omit<Medication, "id" | "order" | "createdAt">;
export type PlanDraft = Omit<Plan, "id" | "medId">;

export function emptyMedDraft(): MedDraft {
  return {
    name: "",
    alias: "",
    spec: "",
    category: "其他",
    form: "片剂",
    usageText: "",
    stock: 30,
    lowStock: 7,
    note: "",
    art: "",
    source: "manual",
  };
}

export function emptyPlanDraft(): PlanDraft {
  return {
    perDose: 1,
    unit: "片",
    times: ["08:00"],
    food: "any",
    startDate: todayKey(),
    endDate: null,
    remind: true,
    active: true,
  };
}

export function MedFields({
  value,
  onChange,
  compact,
}: {
  value: MedDraft;
  onChange: (patch: Partial<MedDraft>) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="药品名称" required hint="以药盒上的通用名为准">
        <input
          className={inputClass}
          value={value.name}
          maxLength={40}
          placeholder="例如：苯磺酸氨氯地平片"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>

      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <Field label="商品名 / 别名" hint="选填">
          <input
            className={inputClass}
            value={value.alias}
            maxLength={20}
            placeholder="例如：络活喜"
            onChange={(e) => onChange({ alias: e.target.value })}
          />
        </Field>
        <Field label="规格" hint="选填">
          <input
            className={inputClass}
            value={value.spec}
            maxLength={30}
            placeholder="例如：5mg × 7片"
            onChange={(e) => onChange({ spec: e.target.value })}
          />
        </Field>
      </div>

      <Field label="用途分类" group>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={value.category === c} onClick={() => onChange({ category: c })}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="剂型" group>
        <div className="flex flex-wrap gap-2">
          {FORMS.map((f) => (
            <Chip key={f} selected={value.form === f} onClick={() => onChange({ form: f })}>
              {f}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="药盒上的用法用量" hint="识别结果可直接修改">
        <textarea
          className={cn(inputClass, "min-h-[92px] py-3 text-base leading-relaxed")}
          value={value.usageText}
          maxLength={120}
          placeholder="例如：每日 1 次，每次 1 片，口服"
          onChange={(e) => onChange({ usageText: e.target.value })}
        />
      </Field>

      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <Stepper
          label="当前余量"
          unit={value.form === "口服液" ? "毫升" : "片"}
          value={value.stock}
          min={0}
          max={999}
          onChange={(n) => onChange({ stock: n })}
        />
        <Stepper
          label="低于此量提醒配药"
          value={value.lowStock}
          min={0}
          max={99}
          onChange={(n) => onChange({ lowStock: n })}
        />
      </div>

      <Field label="备注" hint="选填，例如医生叮嘱">
        <textarea
          className={cn(inputClass, "min-h-[80px] py-3 text-base")}
          value={value.note}
          maxLength={160}
          placeholder="例如：服药后坐起时慢一点，防止头晕"
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function PlanFields({
  value,
  onChange,
}: {
  value: PlanDraft;
  onChange: (patch: Partial<PlanDraft>) => void;
}) {
  const sorted = [...value.times].sort((a, b) => minutesOf(a) - minutesOf(b));

  const setCount = (n: number) => {
    const count = Math.max(1, Math.min(6, n));
    const bed = /睡前/.test(value.times.join()) || sorted.some((t) => slotOf(t) === "bedtime");
    onChange({ times: defaultTimes(count, bed && count === 1) });
  };

  const setTime = (i: number, t: string) => {
    if (!/^\d{2}:\d{2}$/.test(t)) return;
    const next = [...sorted];
    next[i] = t;
    onChange({ times: Array.from(new Set(next)).sort((a, b) => minutesOf(a) - minutesOf(b)) });
  };

  const removeTime = (i: number) => {
    if (sorted.length <= 1) return;
    onChange({ times: sorted.filter((_, j) => j !== i) });
  };

  const addTime = () => {
    if (sorted.length >= 6) return;
    const last = minutesOf(sorted[sorted.length - 1] ?? "08:00");
    let candidate = last + 240;
    while (candidate < 1440 && sorted.includes(`${String(Math.floor(candidate / 60)).padStart(2, "0")}:${String(candidate % 60).padStart(2, "0")}`)) {
      candidate += 60;
    }
    if (candidate >= 1440) candidate = 1439;
    const t = `${String(Math.floor(candidate / 60)).padStart(2, "0")}:${String(candidate % 60).padStart(2, "0")}`;
    onChange({ times: [...sorted, t].sort((a, b) => minutesOf(a) - minutesOf(b)) });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stepper
          label="每天服用次数"
          unit="次"
          value={sorted.length}
          min={1}
          max={6}
          onChange={setCount}
        />
        <Stepper
          label="每次用量"
          value={value.perDose}
          min={0.5}
          max={20}
          step={0.5}
          decimals={1}
          onChange={(n) => onChange({ perDose: n })}
        />
      </div>

      <Field label="用量单位" group>
        <div className="flex flex-wrap gap-2">
          {UNITS.map((u) => (
            <Chip key={u} selected={value.unit === u} onClick={() => onChange({ unit: u })}>
              {u}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="服药时间" hint="点时间可直接修改，24 小时制" group>
        <div className="space-y-2">
          {sorted.map((t, i) => {
            const meta = SLOT_META[slotOf(t)];
            return (
              <div
                key={`${t}-${i}`}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-line bg-surface p-2 pl-4"
                style={{ borderLeftColor: meta.hue, borderLeftWidth: 6 }}
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
                  style={{ background: meta.soft, color: meta.hue }}
                >
                  {meta.short}
                </span>
                <input
                  type="time"
                  value={t}
                  aria-label={`第 ${i + 1} 次服药时间`}
                  onChange={(e) => setTime(i, e.target.value)}
                  className="num min-h-[52px] flex-1 rounded-xl border-2 border-line bg-[var(--paper)] px-3 text-xl font-extrabold text-ink focus:border-pine-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeTime(i)}
                  disabled={sorted.length <= 1}
                  aria-label={`删除 ${t} 这一次`}
                  className="press flex size-12 items-center justify-center rounded-xl bg-vermil-100 text-vermil-600 disabled:opacity-30"
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            );
          })}
          <BigButton tone="soft" size="md" full onClick={addTime} disabled={sorted.length >= 6}>
            <Plus className="size-5" />
            再加一次（最多 6 次）
          </BigButton>
        </div>
      </Field>

      <Field label="与吃饭的关系" group>
        <div className="flex flex-wrap gap-2">
          {FOODS.map((f) => (
            <Chip key={f} selected={value.food === f} onClick={() => onChange({ food: f })}>
              {FOOD_LABEL[f]}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="开始日期">
          <input
            type="date"
            className={cn(inputClass, "num")}
            value={value.startDate}
            onChange={(e) => onChange({ startDate: e.target.value || todayKey() })}
          />
        </Field>
        <Field label="结束日期" hint="留空表示长期服用">
          <input
            type="date"
            className={cn(inputClass, "num")}
            value={value.endDate ?? ""}
            onChange={(e) => onChange({ endDate: e.target.value || null })}
          />
        </Field>
      </div>

      <ToggleRow
        icon={value.remind ? <Bell className="size-6" /> : <BellOff className="size-6" />}
        title="到点提醒我"
        desc="提前提醒并在应用内弹出服药卡片，可语音播报"
        checked={value.remind}
        onChange={(v) => onChange({ remind: v })}
      />
      <ToggleRow
        icon={<AlarmClock className="size-6" />}
        title="这个计划正在使用"
        desc="关闭后不再生成每日服药任务，历史记录保留"
        checked={value.active}
        onChange={(v) => onChange({ active: v })}
      />
    </div>
  );
}