import { useState } from "react";
import { Check, ChevronRight, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_HUE, FOOD_LABEL, SLOT_META, type Dose } from "@/lib/types";
import { dueLabel, humanGap } from "@/lib/time";
import { performClearDose, performSkip, performTake } from "@/lib/actions";
import { useApp } from "@/lib/store";
import { BigButton, IconButton, MedArt, SlotBadge } from "./bits";

const STATUS_LABEL: Record<Dose["status"], string> = {
  done: "已服用",
  due: "该服药了",
  upcoming: "待服用",
  missed: "漏服",
  skipped: "已跳过",
  taken: "已服用",
};

export function DoseCard({
  dose,
  now,
  onOpenMed,
  index = 0,
}: {
  dose: Dose;
  now: Date;
  onOpenMed?: (medId: string) => void;
  index?: number;
}) {
  const { settings } = useApp();
  const [burst, setBurst] = useState(0);
  const meta = SLOT_META[dose.slot];
  const hue = CATEGORY_HUE[dose.med.category];
  const done = dose.status === "done";
  const missed = dose.status === "missed";
  const skipped = dose.status === "skipped";
  const due = dose.status === "due";
  const delta = dose.at.getTime() - now.getTime();

  const take = () => {
    setBurst((b) => b + 1);
    performTake(dose, settings);
  };

  return (
    <article
      className={cn(
        "anim-rise panel relative overflow-hidden",
        due && "border-amber-500 shadow-[var(--shadow-md)]",
        missed && "border-vermil-500 bg-vermil-100/50",
        done && "border-lime-300 bg-lime-100/40",
        skipped && "opacity-80",
      )}
      style={{ animationDelay: `${Math.min(index, 6) * 55}ms`, borderLeftWidth: 6, borderLeftColor: missed ? "var(--vermil-500)" : done ? "var(--lime-500)" : meta.hue }}
      aria-label={`${dose.time} ${dose.med.name} ${STATUS_LABEL[dose.status]}`}
    >
      {due ? (
        <span className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            className="absolute inset-y-0 w-1/3 opacity-25"
            style={{
              background: "linear-gradient(90deg,transparent,var(--amber-300),transparent)",
              animation: "sweep calc(2600ms * var(--site-motion)) ease-in-out infinite",
            }}
          />
        </span>
      ) : null}

      <div className="relative flex items-start gap-3 p-4">
        <div className="w-[74px] shrink-0 text-center">
          <div className={cn("num text-2xl font-extrabold leading-none", missed ? "text-vermil-600" : "text-ink")}>
            {dose.time}
          </div>
          <div className="mt-2 flex justify-center">
            <SlotBadge slot={dose.slot} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenMed?.(dose.med.id)}
          className="press h-[62px] w-[84px] shrink-0 overflow-hidden rounded-xl border border-line bg-pine-100"
          aria-label={`查看 ${dose.med.name} 详情`}
        >
          <MedArt med={dose.med} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-lg font-extrabold leading-snug text-ink">
              {dose.med.name}
            </h3>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold",
                done && "bg-lime-500 text-white",
                due && "bg-amber-500 text-[#2a1a02]",
                missed && "bg-vermil-500 text-white",
                skipped && "bg-line text-ink-soft",
                dose.status === "upcoming" && "bg-pine-100 text-pine-900",
              )}
            >
              {STATUS_LABEL[dose.status]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            {dose.med.alias ? `${dose.med.alias} · ` : ""}
            {dose.med.spec || dose.med.form}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-0.5 ring-1 ring-line">
              <span className="size-2 rounded-full" style={{ background: hue }} />
              每次 {dose.amount} {dose.plan.unit}
            </span>
            <span className="text-ink-soft">{FOOD_LABEL[dose.plan.food]}</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            {done && dose.log?.at
              ? `打卡时间 ${new Date(dose.log.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
              : missed
                ? "已超过宽限时间，记为漏服"
                : skipped
                  ? dose.log?.note || "本次跳过"
                  : due
                    ? dueLabel(delta)
                    : `还有 ${humanGap(delta)}`}
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-2 border-t border-line px-4 py-3">
        {done || skipped ? (
          <BigButton tone="outline" size="md" full onClick={take}>
            <Check className="size-6" />
            {done ? "已服用 · 再记一次" : "改为已服用"}
          </BigButton>
        ) : (
          <BigButton tone={due ? "amber" : missed ? "vermil" : "pine"} size="lg" full onClick={take} className={cn(due && "anim-halo")}>
            <Check className="size-7" strokeWidth={3} />
            {missed ? "补服打卡" : "我已服用 · 打卡"}
          </BigButton>
        )}

        {!done && !skipped ? (
          <IconButton label="跳过本次" onClick={() => performSkip(dose, settings)}>
            <SkipForward className="size-6" />
          </IconButton>
        ) : null}

        {dose.log ? (
          <IconButton label="撤销这次记录" onClick={() => performClearDose(dose, settings)}>
            <RotateCcw className="size-6" />
          </IconButton>
        ) : null}

        {onOpenMed ? (
          <IconButton label="药品详情" onClick={() => onOpenMed(dose.med.id)}>
            <ChevronRight className="size-6" />
          </IconButton>
        ) : null}
      </div>

      {missed ? (
        <p className="relative flex items-start gap-2 border-t border-vermil-300 bg-vermil-100 px-4 py-2.5 text-xs font-semibold leading-relaxed text-vermil-600">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          漏服后是否补服、要不要调整剂量，请先咨询医生或药师，不要自行加倍。
        </p>
      ) : null}

      {burst ? (
        <span key={burst} className="pointer-events-none absolute inset-0" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            return (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 size-2.5 rounded-full"
                style={
                  {
                    background: i % 2 ? "var(--lime-500)" : "var(--amber-500)",
                    "--dx": `${Math.cos(angle) * 90}px`,
                    "--dy": `${Math.sin(angle) * 60}px`,
                    animation: "sparkOut calc(620ms * var(--site-motion)) ease-out forwards",
                  } as React.CSSProperties
                }
              />
            );
          })}
        </span>
      ) : null}

    </article>
  );
}