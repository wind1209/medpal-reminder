import { Check, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { cn } from "@/lib/utils";
import { SLOT_META, SLOT_ORDER, type SlotKey } from "@/lib/types";
import type { Dose } from "@/lib/types";
import { PillGlyph } from "./bits";

const SLOT_ICON: Record<SlotKey, typeof Sun> = {
  morning: Sunrise,
  noon: Sun,
  evening: Sunset,
  bedtime: Moon,
};

export function PillBox({
  doses,
  active,
  onSelect,
}: {
  doses: Dose[];
  active: SlotKey | "all";
  onSelect: (slot: SlotKey | "all") => void;
}) {
  return (
    <div className="panel-raised anim-rise overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-[linear-gradient(100deg,var(--pine-700),var(--pine-500)_58%,var(--amber-500))] px-5 py-3">
        <div className="flex items-center gap-2 text-[var(--site-on-accent)]">
          <span className="text-base font-extrabold">今日药盒</span>
          <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-bold">
            共 {doses.length} 次
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelect("all")}
          aria-pressed={active === "all"}
          className={cn(
            "press min-h-[48px] rounded-full px-4 text-sm font-extrabold",
            active === "all"
              ? "bg-[var(--surface)] text-pine-900"
              : "bg-black/20 text-[var(--site-on-accent)] hover:bg-black/30",
          )}
        >
          全部
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {SLOT_ORDER.map((slot) => {
          const meta = SLOT_META[slot];
          const Icon = SLOT_ICON[slot];
          const list = doses.filter((d) => d.slot === slot);
          const taken = list.filter((d) => d.status === "done").length;
          const missed = list.filter((d) => d.status === "missed").length;
          const due = list.some((d) => d.status === "due");
          const isActive = active === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onSelect(isActive ? "all" : slot)}
              aria-pressed={isActive}
              className={cn(
                "press relative flex min-h-[168px] flex-col gap-2 p-4 text-left",
                isActive ? "bg-surface" : "bg-[color-mix(in_srgb,var(--surface)_72%,var(--paper))]",
              )}
              style={isActive ? { boxShadow: `inset 0 0 0 3px ${meta.hue}` } : undefined}
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex size-9 items-center justify-center rounded-xl"
                  style={{ background: meta.soft, color: meta.hue }}
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-extrabold text-ink">{meta.label}</span>
                  <span className="num block text-xs font-semibold text-ink-soft">
                    {String(meta.from).padStart(2, "0")}:00–{String(meta.to % 24).padStart(2, "0")}:00
                  </span>
                </span>
                {due ? (
                  <span className="anim-halo ml-auto size-3 rounded-full bg-amber-500" aria-label="有到点提醒" />
                ) : null}
              </span>

              <span className="flex min-h-[52px] flex-wrap items-center gap-1.5">
                {list.length ? (
                  list.map((d, i) => (
                    <span
                      key={d.key}
                      className={cn("anim-drop relative", d.status === "done" && "opacity-40")}
                      style={{ animationDelay: `${i * 60}ms` }}
                      title={`${d.med.name} ${d.time} ${d.amount}${d.plan.unit}`}
                    >
                      <PillGlyph
                        size={30}
                        color={
                          d.status === "missed"
                            ? "var(--vermil-500)"
                            : d.status === "skipped"
                              ? "var(--ink-soft)"
                              : meta.hue
                        }
                      />
                      {d.status === "done" ? (
                        <Check
                          className="absolute -bottom-1 -right-1 size-4 rounded-full bg-lime-500 p-0.5 text-white"
                          strokeWidth={4}
                        />
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-ink-soft">这个时段没有安排</span>
                )}
              </span>

              <span className="mt-auto flex items-center gap-2 text-xs font-bold">
                <span className="num rounded-full bg-lime-100 px-2 py-0.5 text-lime-600">
                  已服 {taken}/{list.length}
                </span>
                {missed ? (
                  <span className="num rounded-full bg-vermil-100 px-2 py-0.5 text-vermil-600">
                    漏服 {missed}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}