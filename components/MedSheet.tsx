import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  Package,
  Pencil,
  Pill,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CATEGORY_HUE, FOOD_LABEL, SLOT_META, type DoseLog } from "@/lib/types";
import { deleteMed, moveMed, restock, updateMed, updatePlan, useApp } from "@/lib/store";
import { dateCN, slotOf } from "@/lib/time";
import { sound } from "@/lib/voice";
import { BigButton, Chip, MedArt, PillGlyph, SectionTitle, ToggleRow } from "./bits";
import { MedFields, PlanFields, type MedDraft, type PlanDraft } from "./MedForm";

const SOURCE_LABEL = { sample: "示例药品", ocr: "拍照识别", manual: "手动录入" } as const;

export function MedSheet({ medId, onClose }: { medId: string | null; onClose: () => void }) {
  const data = useApp();
  const med = data.meds.find((m) => m.id === medId) ?? null;
  const plan = data.plans.find((p) => p.medId === medId) ?? null;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [medDraft, setMedDraft] = useState<MedDraft | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [addStock, setAddStock] = useState(10);

  useEffect(() => {
    setEditing(false);
    setConfirming(false);
    setMedDraft(null);
    setPlanDraft(null);
  }, [medId]);

  if (!med || !plan) {
    return (
      <Sheet open={!!medId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full gap-0 overflow-y-auto bg-[var(--surface)] p-0 sm:max-w-md">
          <SheetTitle className="sr-only">药品详情</SheetTitle>
          <div className="p-6 text-ink-soft">这个药品已被删除。</div>
        </SheetContent>
      </Sheet>
    );
  }

  const logs = data.logs
    .filter((l) => l.medId === med.id)
    .sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)))
    .slice(0, 10);
  const low = med.stock <= med.lowStock;
  const hue = CATEGORY_HUE[med.category];

  const startEdit = () => {
    const { id: _id, order: _order, createdAt: _createdAt, ...rest } = med;
    const { id: _pid, medId: _mid, ...prest } = plan;
    setMedDraft(rest);
    setPlanDraft(prest);
    setEditing(true);
  };

  const save = () => {
    if (!medDraft || !planDraft) return;
    if (!medDraft.name.trim()) {
      toast.error("请填写药品名称");
      return;
    }
    if (!planDraft.times.length) {
      toast.error("请至少保留一个服药时间");
      return;
    }
    updateMed(med.id, { ...medDraft, name: medDraft.name.trim() });
    updatePlan(med.id, planDraft);
    setEditing(false);
    sound("done", data.settings.sound, data.settings.voiceVolume);
    toast.success(`已保存「${medDraft.name.trim()}」`, { description: "今天的服药任务已按新计划更新。" });
  };

  return (
    <Sheet open={!!medId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto border-line bg-[var(--surface)] p-0 sm:max-w-lg"
      >
        <SheetTitle className="sr-only">{med.name} 详情</SheetTitle>

        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-[var(--surface)] px-5 py-4">
          <span className="flex size-11 items-center justify-center rounded-2xl" style={{ background: `${hue}22`, color: hue }}>
            <Pill className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-ink">{editing ? "编辑药品与计划" : med.name}</p>
            <p className="text-xs font-semibold text-ink-soft">{SOURCE_LABEL[med.source]} · {med.category}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情"
            className="press flex size-11 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink"
          >
            <X className="size-6" />
          </button>
        </div>

        {editing && medDraft && planDraft ? (
          <div className="space-y-6 p-5">
            <MedFields value={medDraft} onChange={(p) => setMedDraft({ ...medDraft, ...p })} compact />
            <div className="border-t border-line pt-5">
              <SectionTitle title="用药计划" desc="修改后今天的任务会立即更新" />
              <PlanFields value={planDraft} onChange={(p) => setPlanDraft({ ...planDraft, ...p })} />
            </div>
            <div className="sticky bottom-0 grid grid-cols-2 gap-3 bg-[var(--surface)] py-3">
              <BigButton tone="outline" size="lg" onClick={() => setEditing(false)}>
                取消
              </BigButton>
              <BigButton tone="pine" size="lg" onClick={save}>
                <Check className="size-6" />
                保存
              </BigButton>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="overflow-hidden rounded-[var(--radius-xl)] border border-line">
              <div className="h-[168px] bg-pine-100">
                <MedArt med={med} />
              </div>
              <div className="space-y-1 bg-surface p-4">
                <p className="text-xl font-extrabold text-ink">{med.name}</p>
                <p className="text-sm text-ink-soft">
                  {[med.alias, med.spec, med.form].filter(Boolean).join(" · ") || "未填写规格"}
                </p>
                {med.usageText ? (
                  <p className="rounded-xl bg-pine-100 px-3 py-2 text-sm font-semibold text-pine-900">
                    药盒用法：{med.usageText}
                  </p>
                ) : null}
                {med.note ? <p className="text-sm leading-relaxed text-ink-soft">备注：{med.note}</p> : null}
              </div>
            </div>

            <div className={cn("panel p-4", low && "border-vermil-500 bg-vermil-100/50")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-ink-soft">
                    <Package className="size-4" />
                    当前余量
                  </p>
                  <p className="num text-3xl font-extrabold text-ink">
                    {med.stock}
                    <span className="ml-1 text-base font-bold text-ink-soft">{plan.unit}</span>
                  </p>
                </div>
                {low ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-vermil-500 px-3 py-1.5 text-xs font-extrabold text-white">
                    <TriangleAlert className="size-4" />
                    需要配药
                  </span>
                ) : (
                  <span className="rounded-full bg-lime-100 px-3 py-1.5 text-xs font-extrabold text-lime-600">
                    余量充足
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[10, 20, 30].map((n) => (
                  <Chip key={n} selected={addStock === n} onClick={() => setAddStock(n)}>
                    +{n}
                  </Chip>
                ))}
                <BigButton
                  tone="soft"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    restock(med.id, addStock);
                    sound("tap", data.settings.sound, data.settings.voiceVolume);
                    toast.success(`已补货 ${addStock} ${plan.unit}`, { description: `${med.name} 现有 ${med.stock + addStock} ${plan.unit}` });
                  }}
                >
                  记一次配药
                </BigButton>
              </div>
            </div>

            <div className="panel p-4">
              <SectionTitle title="用药计划" desc={`每天 ${plan.times.length} 次 · 每次 ${plan.perDose} ${plan.unit}`} />
              <div className="flex flex-wrap gap-2">
                {[...plan.times]
                  .sort((a, b) => a.localeCompare(b))
                  .map((t) => {
                    const meta = SLOT_META[slotOf(t)];
                    return (
                      <span
                        key={t}
                        className="num inline-flex items-center gap-2 rounded-full px-3 py-2 text-base font-extrabold"
                        style={{ background: meta.soft, color: meta.hue }}
                      >
                        <PillGlyph size={20} color={meta.hue} />
                        {t}
                      </span>
                    );
                  })}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink-soft">
                {FOOD_LABEL[plan.food]} · 开始 {dateCN(plan.startDate)}
                {plan.endDate ? ` · 结束 ${dateCN(plan.endDate)}` : " · 长期服用"}
              </p>
              <div className="mt-4 space-y-3">
                <ToggleRow
                  icon={<Bell className="size-6" />}
                  title="到点提醒"
                  checked={plan.remind}
                  onChange={(v) => updatePlan(med.id, { remind: v })}
                />
                <ToggleRow
                  title="计划正在使用"
                  desc="关闭后不再生成每日任务"
                  checked={plan.active}
                  onChange={(v) => updatePlan(med.id, { active: v })}
                />
              </div>
            </div>

            <div className="panel p-4">
              <SectionTitle title="最近服药记录" desc={`共 ${data.logs.filter((l) => l.medId === med.id).length} 条`} />
              {logs.length ? (
                <ul className="divide-y divide-line">
                  {logs.map((l: DoseLog) => (
                    <li key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span
                        className={cn(
                          "size-2.5 shrink-0 rounded-full",
                          l.status === "taken" && "bg-lime-500",
                          l.status === "missed" && "bg-vermil-500",
                          l.status === "skipped" && "bg-line",
                        )}
                      />
                      <span className="num font-bold text-ink">{dateCN(l.date)}</span>
                      <span className="num text-ink-soft">{l.time}</span>
                      <span
                        className={cn(
                          "ml-auto rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                          l.status === "taken" && "bg-lime-100 text-lime-600",
                          l.status === "missed" && "bg-vermil-100 text-vermil-600",
                          l.status === "skipped" && "bg-muted text-ink-soft",
                        )}
                      >
                        {l.status === "taken" ? "已服用" : l.status === "missed" ? "漏服" : "跳过"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">还没有这个药的服药记录。</p>
              )}
            </div>

            {confirming ? (
              <div className="panel border-vermil-500 bg-vermil-100 p-4">
                <p className="flex items-center gap-2 text-base font-extrabold text-vermil-600">
                  <TriangleAlert className="size-5" />
                  确认删除「{med.name}」？
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  会同时删除它的用药计划和服药记录。删除后 9 秒内可以撤销。
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <BigButton tone="outline" size="md" onClick={() => setConfirming(false)}>
                    取消
                  </BigButton>
                  <BigButton
                    tone="vermil"
                    size="md"
                    onClick={() => {
                      deleteMed(med.id);
                      sound("warn", data.settings.sound, data.settings.voiceVolume);
                      onClose();
                    }}
                  >
                    <Trash2 className="size-5" />
                    确认删除
                  </BigButton>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <BigButton tone="pine" size="lg" onClick={startEdit}>
                  <Pencil className="size-5" />
                  编辑
                </BigButton>
                <BigButton tone="danger" size="lg" onClick={() => setConfirming(true)}>
                  <Trash2 className="size-5" />
                  删除
                </BigButton>
                <BigButton tone="outline" size="md" onClick={() => moveMed(med.id, -1)}>
                  <ArrowUp className="size-5" />
                  上移
                </BigButton>
                <BigButton tone="outline" size="md" onClick={() => moveMed(med.id, 1)}>
                  <ArrowDown className="size-5" />
                  下移
                </BigButton>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}