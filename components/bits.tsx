import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { CATEGORY_HUE, SLOT_META, type Medication, type SlotKey } from "@/lib/types";

/* ---------------- 大按钮 ---------------- */

export type Tone =
  | "pine"
  | "amber"
  | "azure"
  | "vermil"
  | "lime"
  | "violet"
  | "magenta"
  | "soft"
  | "outline"
  | "ghost"
  | "danger";

const TONE: Record<Tone, string> = {
  pine: "bg-pine-700 text-[var(--site-on-accent)] hover:bg-pine-500 shadow-[var(--shadow-md)] border border-transparent",
  amber: "bg-amber-500 text-[#2a1a02] hover:bg-amber-600 hover:text-white shadow-[var(--shadow-md)] border border-transparent",
  azure: "bg-azure-500 text-white hover:bg-azure-600 shadow-[var(--shadow-md)] border border-transparent",
  vermil: "bg-vermil-500 text-white hover:bg-vermil-600 shadow-[var(--shadow-md)] border border-transparent",
  lime: "bg-lime-500 text-[#12250a] hover:bg-lime-600 hover:text-white shadow-[var(--shadow-md)] border border-transparent",
  violet: "bg-violet-500 text-white hover:bg-violet-600 shadow-[var(--shadow-md)] border border-transparent",
  magenta: "bg-magenta-500 text-white hover:brightness-110 shadow-[var(--shadow-md)] border border-transparent",
  soft: "bg-pine-100 text-pine-900 hover:bg-pine-300/60 border border-line",
  outline: "bg-surface text-ink border-2 border-line hover:border-pine-500 hover:bg-pine-100/60",
  ghost: "bg-transparent text-ink-soft hover:bg-pine-100 hover:text-ink border border-transparent",
  danger: "bg-vermil-100 text-vermil-600 hover:bg-vermil-300/60 border border-vermil-300",
};

const SIZE = {
  sm: "min-h-[46px] px-4 text-sm gap-2",
  md: "min-h-[58px] px-5 text-base gap-2.5",
  lg: "min-h-[68px] px-6 text-lg gap-3",
  xl: "min-h-[82px] px-7 text-xl gap-3",
};

export function BigButton({
  tone = "pine",
  size = "md",
  full,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  size?: keyof typeof SIZE;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "tap press rounded-[var(--radius-lg)] font-bold disabled:opacity-45 disabled:pointer-events-none",
        TONE[tone],
        SIZE[size],
        full && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "press inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border text-ink-soft",
        active
          ? "border-pine-500 bg-pine-100 text-pine-700"
          : "border-line bg-surface hover:border-pine-300 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- 选项胶囊 ---------------- */

export function Chip({
  selected,
  className,
  children,
  hue,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; hue?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "press inline-flex min-h-[48px] items-center gap-2 rounded-full border-2 px-4 text-sm font-bold",
        selected
          ? "border-transparent text-white shadow-[var(--shadow-sm)]"
          : "border-line bg-surface text-ink-soft hover:border-pine-300 hover:text-ink",
        className,
      )}
      style={selected ? { background: hue ?? "var(--pine-700)" } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- 数字步进器 ---------------- */

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  unit,
  label,
  decimals = 0,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label: string;
  decimals?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(decimals))));
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-2">
      <button
        type="button"
        aria-label={`减少${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="press flex size-14 items-center justify-center rounded-2xl bg-pine-100 text-pine-900 disabled:opacity-35"
      >
        <Minus className="size-7" strokeWidth={3} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
        <span className="num text-3xl font-extrabold text-ink">
          {value.toFixed(decimals)}
          {unit ? <span className="ml-1 text-base font-bold text-ink-soft">{unit}</span> : null}
        </span>
        <span className="text-xs font-semibold text-ink-soft">{label}</span>
      </div>
      <button
        type="button"
        aria-label={`增加${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="press flex size-14 items-center justify-center rounded-2xl bg-pine-700 text-[var(--site-on-accent)] disabled:opacity-35"
      >
        <Plus className="size-7" strokeWidth={3} />
      </button>
    </div>
  );
}

/* ---------------- 开关行 / 滑杆行 ---------------- */

export function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  disabled,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4",
        disabled && "opacity-55",
      )}
    >
      {icon ? (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-pine-100 text-pine-700">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-ink">{title}</span>
        {desc ? <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{desc}</span> : null}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
        className="data-[size=default]:h-9 data-[size=default]:w-16 px-[3px] data-[state=checked]:bg-pine-700 data-[state=unchecked]:bg-line [&_[data-slot=switch-thumb]]:size-7 [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-[30px]"
      />
    </label>
  );
}

export function SliderRow({
  title,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  disabled,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("rounded-[var(--radius-lg)] border border-line bg-surface p-4", disabled && "opacity-55")}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-base font-bold text-ink">{title}</span>
        <span className="num rounded-full bg-pine-100 px-3 py-1 text-sm font-extrabold text-pine-900">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        aria-label={title}
        aria-valuetext={format ? format(value) : String(value)}
        className="py-2 [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-range]]:bg-pine-500 [&_[data-slot=slider-thumb]]:size-8 [&_[data-slot=slider-thumb]]:border-4 [&_[data-slot=slider-thumb]]:border-pine-700 [&_[data-slot=slider-thumb]]:bg-[var(--surface)]"
      />
    </div>
  );
}

/* ---------------- 环形进度 ---------------- */

export function Ring({
  value,
  size = 168,
  stroke = 14,
  color = "var(--pine-500)",
  track = "var(--pine-100)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset calc(700ms * var(--site-motion)) cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/* ---------------- 药片图形 ---------------- */

export function PillGlyph({
  color = "var(--pine-500)",
  size = 28,
  className,
  style,
}: {
  color?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden="true">
      <g transform="rotate(-38 16 16)">
        <rect x="3" y="10.5" width="26" height="11" rx="5.5" fill={color} />
        <path d="M16 10.5h7.5a5.5 5.5 0 0 1 0 11H16z" fill="var(--surface)" opacity="0.92" />
        <rect x="3" y="10.5" width="26" height="11" rx="5.5" fill="none" stroke="var(--pine-900)" strokeOpacity="0.22" />
        <rect x="6" y="12.6" width="7" height="2.4" rx="1.2" fill="#fff" opacity="0.5" />
      </g>
    </svg>
  );
}

/* ---------------- 药盒插画 ---------------- */

export function MedArt({ med, className }: { med: Pick<Medication, "name" | "art" | "category" | "spec">; className?: string }) {
  if (med.art) {
    return (
      <img
        src={med.art}
        alt={`${med.name} 药盒`}
        loading="lazy"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  const hue = CATEGORY_HUE[med.category];
  const short = med.name.replace(/[（(].*?[)）]/g, "").slice(0, 8);
  return (
    <svg viewBox="0 0 160 110" className={cn("h-full w-full", className)} role="img" aria-label={`${med.name} 药盒`}>
      <rect width="160" height="110" fill="var(--pine-100)" />
      <rect x="18" y="20" width="124" height="74" rx="8" fill="var(--surface)" stroke="var(--line)" />
      <rect x="18" y="20" width="124" height="18" rx="8" fill={hue} />
      <rect x="18" y="32" width="124" height="6" fill={hue} />
      <text x="30" y="34" fontSize="10" fontWeight="700" fill="#fff">
        {med.category}
      </text>
      <text x="30" y="60" fontSize="13" fontWeight="800" fill="var(--ink)">
        {short.slice(0, 6)}
      </text>
      <text x="30" y="76" fontSize="10" fill="var(--ink-soft)">
        {short.slice(6) || med.spec || "口服"}
      </text>
      <g transform="translate(112 62)">
        <rect x="-14" y="-6" width="28" height="12" rx="6" fill={hue} opacity="0.85" />
        <path d="M0 -6h8a6 6 0 0 1 0 12H0z" fill="var(--surface)" />
      </g>
    </svg>
  );
}

/* ---------------- 时段徽标 ---------------- */

export function SlotBadge({ slot, className }: { slot: SlotKey; className?: string }) {
  const meta = SLOT_META[slot];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold", className)}
      style={{ background: meta.soft, color: meta.hue }}
    >
      <span className="size-2 rounded-full" style={{ background: meta.hue }} />
      {meta.label}
    </span>
  );
}

/* ---------------- 表单字段 ---------------- */

export function Field({
  label,
  hint,
  required,
  group,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  group?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const head = (
    <span className="mb-2 flex items-baseline gap-2">
      <span className="text-base font-bold text-ink">{label}</span>
      {required ? <span className="text-sm font-bold text-vermil-500">必填</span> : null}
      {hint ? <span className="text-xs text-ink-soft">{hint}</span> : null}
    </span>
  );
  if (group) {
    return (
      <div role="group" aria-label={label} className={cn("block", className)}>
        {head}
        {children}
      </div>
    );
  }
  return (
    <label className={cn("block", className)}>
      {head}
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-[58px] w-full rounded-[var(--radius-lg)] border-2 border-line bg-surface px-4 text-lg font-semibold text-ink placeholder:font-normal placeholder:text-ink-soft/70 focus:border-pine-500 focus:outline-none";

/* ---------------- 标题 / 空态 / 统计 ---------------- */

export function SectionTitle({
  icon,
  title,
  desc,
  right,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-xl font-extrabold text-ink">
          {icon ? <span className="text-pine-700">{icon}</span> : null}
          {title}
        </h2>
        {desc ? <p className="mt-1 text-sm text-ink-soft">{desc}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Empty({
  icon,
  title,
  desc,
  action,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="anim-drift flex size-20 items-center justify-center rounded-3xl bg-pine-100 text-pine-700">
        {icon}
      </span>
      <h3 className="text-lg font-extrabold text-ink">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-ink-soft">{desc}</p>
      {action ? <div className="mt-2 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  hue,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hue: string;
  icon?: ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: hue }} />
      <div className="flex items-center gap-2 text-sm font-bold text-ink-soft">
        {icon ? <span style={{ color: hue }}>{icon}</span> : null}
        {label}
      </div>
      <div className="num mt-1 text-3xl font-extrabold text-ink">
        {value}
        {unit ? <span className="ml-1 text-base font-bold text-ink-soft">{unit}</span> : null}
      </div>
    </div>
  );
}