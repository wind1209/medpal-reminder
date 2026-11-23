import { useEffect } from "react";
import { AlarmClock, Check, GlassWater, SkipForward, Timer, X } from "lucide-react";
import { FOOD_LABEL, SLOT_META, type Dose } from "@/lib/types";
import { BigButton, MedArt, PillGlyph } from "./bits";
import { clockText } from "@/lib/time";

export function ReminderOverlay({
  dose,
  now,
  snoozeMinutes,
  onTake,
  onSnooze,
  onSkip,
  onClose,
}: {
  dose: Dose;
  now: Date;
  snoozeMinutes: number;
  onTake: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const meta = SLOT_META[dose.slot];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`服药提醒：${dose.med.name}`}
      className="fixed inset-0 z-[70] flex overflow-y-auto p-3 sm:p-4"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}
    >
      <div className="anim-pop panel-raised relative m-auto flex max-h-full w-full max-w-lg flex-col overflow-hidden">
        <div
          className="relative flex shrink-0 items-center gap-3 px-5 py-4 sm:px-6 sm:py-5"
          style={{ background: `linear-gradient(120deg, ${meta.hue}, var(--pine-700))` }}
        >
          <span className="anim-halo flex size-14 items-center justify-center rounded-2xl bg-white/20 text-white">
            <AlarmClock className="size-8" />
          </span>
          <div className="min-w-0 flex-1 text-white">
            <p className="text-sm font-bold opacity-90">{meta.label} · 到点提醒</p>
            <p className="num text-2xl font-extrabold leading-tight">{dose.time} 该服药了</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭提醒"
            className="press flex size-11 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/35"
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex items-center gap-4 px-5 py-4 sm:px-6 sm:py-5">
            <div className="h-[92px] w-[124px] shrink-0 overflow-hidden rounded-2xl border border-line bg-pine-100">
              <MedArt med={dose.med} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold leading-tight text-ink">{dose.med.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {dose.med.alias ? `${dose.med.alias} · ` : ""}
                {dose.med.spec}
              </p>
              <p className="mt-2 flex items-center gap-2 text-lg font-extrabold text-pine-700">
                <PillGlyph size={26} color={meta.hue} />
                一次 {dose.amount} {dose.plan.unit}
              </p>
            </div>
          </div>

          <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] bg-pine-100 px-4 py-3 text-sm font-bold text-pine-900 sm:mx-6 sm:mb-5">
            <GlassWater className="size-5" />
            {FOOD_LABEL[dose.plan.food]}
            <span className="text-ink-soft">· 温开水送服</span>
            <span className="num ml-auto text-ink-soft">现在 {clockText(now)}</span>
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-line px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <BigButton tone="lime" size="xl" full onClick={onTake}>
            <Check className="size-8" strokeWidth={3} />
            我已服用 · 立即打卡
          </BigButton>
          <div className="grid grid-cols-2 gap-3">
            <BigButton tone="outline" size="md" onClick={onSnooze}>
              <Timer className="size-6" />
              推迟 {snoozeMinutes} 分钟
            </BigButton>
            <BigButton tone="ghost" size="md" onClick={onSkip}>
              <SkipForward className="size-6" />
              本次跳过
            </BigButton>
          </div>
          <p className="text-center text-xs leading-relaxed text-ink-soft">
            本应用仅做提醒记录，不能替代医生诊断和药师指导。
          </p>
        </div>
      </div>
    </div>
  );
}