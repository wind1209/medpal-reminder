import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  Camera,
  History,
  MessageCircle,
  Package,
  Settings as SettingsIcon,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTE_TITLE, useRouter, type RoutePath } from "@/lib/router";
import { dismissUndo, setSettings, undo, useApp, useUndo } from "@/lib/store";
import { useClock } from "@/lib/clock";
import { clockText, dateFullCN, todayKey } from "@/lib/time";
import { dosesFor, nextDose } from "@/lib/schedule";
import { countdown } from "@/lib/time";
import { sound } from "@/lib/voice";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="16" fill="var(--pine-700)" />
      <rect width="64" height="64" rx="16" fill="url(#lg)" fillOpacity="0.35" />
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5fbfa6" />
          <stop offset="1" stopColor="#062b23" />
        </linearGradient>
      </defs>
      <g transform="rotate(-38 32 30)">
        <rect x="12" y="22" width="40" height="17" rx="8.5" fill="var(--amber-500)" />
        <path d="M32 22h11.5a8.5 8.5 0 0 1 0 17H32z" fill="#fffcf5" />
      </g>
      <path
        d="M22 45.5l6.5 6.5L44 36.5"
        fill="none"
        stroke="#fffcf5"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV: { path: RoutePath; label: string; icon: typeof Bell }[] = [
  { path: "/", label: "今日", icon: Bell },
  { path: "/cabinet", label: "药箱", icon: Package },
  { path: "/add", label: "加药", icon: Camera },
  { path: "/ask", label: "问答", icon: MessageCircle },
  { path: "/history", label: "记录", icon: History },
];

export function Shell({ children }: { children: ReactNode }) {
  const { path, navigate } = useRouter();
  const data = useApp();
  const now = useClock();
  const undoInfo = useUndo();
  const [undoVisible, setUndoVisible] = useState(false);

  const muted = !data.settings.sound && !data.settings.voice;
  const doses = dosesFor(data, todayKey(), now);
  const next = nextDose(doses, now);

  useEffect(() => {
    if (!undoInfo) {
      setUndoVisible(false);
      return;
    }
    setUndoVisible(true);
    const t = window.setTimeout(() => dismissUndo(), 9000);
    return () => window.clearTimeout(t);
  }, [undoInfo]);

  const toggleMute = () => {
    const nextMuted = !muted;
    setSettings({ sound: !nextMuted, voice: !nextMuted });
    if (!nextMuted) sound("tap", true, data.settings.voiceVolume);
  };

  return (
    <div className="app-backdrop app-grain min-h-dvh">
      {/* 顶栏：固定，含唯一的声音总开关 */}
      <header className="no-print fixed inset-x-0 top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-md safe-top">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="press flex min-w-0 items-center gap-3 rounded-2xl py-1 pr-2 text-left"
            aria-label="回到今日用药"
          >
            <Logo />
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold leading-tight text-ink">
                慢病用药提醒助手
              </span>
              <span className="hidden text-xs font-semibold text-ink-soft sm:block">
                {dateFullCN(todayKey())} · {ROUTE_TITLE[path]}
              </span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="num hidden items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink-soft xl:flex">
              <span className={cn("size-2 rounded-full", next?.status === "due" ? "bg-amber-500" : "bg-lime-500")} />
              {clockText(now)}
              {next ? (
                <span className="text-pine-700">
                  · 下次 {next.time}（
                  {next.at.getTime() > now.getTime() ? countdown(next.at.getTime() - now.getTime()) : "已到点"}）
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              className={cn(
                "press tap min-h-[52px] gap-2 rounded-full border-2 px-4 text-sm font-extrabold",
                muted
                  ? "border-vermil-300 bg-vermil-100 text-vermil-600"
                  : "border-pine-300 bg-pine-100 text-pine-900",
              )}
              title={muted ? "点击开启提示音与语音播报" : "点击静音（关闭提示音与语音播报）"}
              aria-label={muted ? "已静音，点击开启提示音与语音播报" : "声音开，点击静音（关闭提示音与语音播报）"}
            >
              {muted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
              <span className="hidden sm:inline">{muted ? "已静音" : "声音开"}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/settings")}
              aria-label="设置"
              aria-current={path === "/settings" ? "page" : undefined}
              className={cn(
                "press flex size-[52px] items-center justify-center rounded-full border-2",
                path === "/settings"
                  ? "border-pine-700 bg-pine-700 text-[var(--site-on-accent)]"
                  : "border-line bg-surface text-ink-soft hover:border-pine-300 hover:text-ink",
              )}
            >
              <SettingsIcon className="size-6" />
            </button>
          </div>
        </div>
      </header>

      {/* 桌面侧栏 */}
      <nav
        aria-label="主导航"
        className="no-print fixed bottom-0 left-0 top-[72px] z-30 hidden w-[248px] flex-col gap-2 border-r border-line bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] p-4 lg:flex"
      >
        {NAV.map((item) => {
          const active = path === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press flex min-h-[62px] items-center gap-3 rounded-[var(--radius-lg)] px-4 text-left text-base font-bold",
                active
                  ? "bg-pine-700 text-[var(--site-on-accent)] shadow-[var(--shadow-md)]"
                  : "text-ink-soft hover:bg-pine-100 hover:text-ink",
              )}
            >
              <Icon className="size-6" />
              {item.label === "今日" ? "今日用药" : item.label === "药箱" ? "我的药箱" : item.label === "加药" ? "拍照加药" : item.label === "问答" ? "用药问答" : "服药记录"}
              {item.path === "/" && doses.some((d) => d.status === "due") ? (
                <span className="ml-auto flex size-7 items-center justify-center rounded-full bg-amber-500 text-xs font-extrabold text-[#2a1a02]">
                  {doses.filter((d) => d.status === "due").length}
                </span>
              ) : null}
            </button>
          );
        })}

        <div className="mt-auto space-y-3">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className={cn(
              "press flex min-h-[58px] w-full items-center gap-3 rounded-[var(--radius-lg)] px-4 text-left text-base font-bold",
              path === "/settings"
                ? "bg-pine-700 text-[var(--site-on-accent)]"
                : "text-ink-soft hover:bg-pine-100 hover:text-ink",
            )}
          >
            <SettingsIcon className="size-6" />
            设置
          </button>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-3">
            <p className="text-xs font-bold text-ink">用药安全提示</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              本应用仅做提醒记录，不能替代医生诊断和药师指导。
            </p>
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="relative mx-auto max-w-[1400px] px-4 pb-[132px] pt-[92px] lg:px-8 lg:pb-16 lg:pl-[280px] lg:pt-[100px]">
        {children}
        <footer className="no-print mt-10 border-t border-line pt-5 text-center">
          <p className="text-xs leading-relaxed text-ink-soft">
            本应用仅做提醒记录，不能替代医生诊断和药师指导。
          </p>
          <p className="mt-1 text-xs text-ink-soft/80">
            慢病用药提醒助手 · 2026 Qoder 高校创造力大赛 · Hack4Good 技术向善
          </p>
        </footer>
      </main>

      {/* 撤销条 */}
      {undoInfo && undoVisible ? (
        <div className="no-print fixed inset-x-0 bottom-[104px] z-40 px-4 lg:bottom-6 lg:left-[280px]">
          <div className="anim-rise mx-auto flex max-w-2xl items-center gap-3 rounded-[var(--radius-lg)] border border-pine-300 bg-pine-900 px-4 py-3 text-[var(--site-on-accent)] shadow-[var(--shadow-lg)] dark:bg-pine-100 dark:text-pine-900">
            <Undo2 className="size-6 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{undoInfo.label}</span>
            <button
              type="button"
              onClick={() => {
                undo();
                sound("undo", data.settings.sound, data.settings.voiceVolume);
              }}
              className="press min-h-[44px] rounded-full bg-amber-500 px-5 text-sm font-extrabold text-[#2a1a02]"
            >
              撤销
            </button>
            <button
              type="button"
              onClick={dismissUndo}
              aria-label="关闭撤销提示"
              className="press flex size-10 items-center justify-center rounded-full opacity-70 hover:opacity-100"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* 移动端底部导航 */}
      <nav
        aria-label="主导航"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] backdrop-blur-md safe-bottom lg:hidden"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5 items-end gap-1 px-2 pb-2 pt-2">
          {NAV.map((item) => {
            const active = path === item.path;
            const Icon = item.icon;
            const center = item.path === "/add";
            const dueCount = item.path === "/" ? doses.filter((d) => d.status === "due").length : 0;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className="press relative flex flex-col items-center justify-end gap-1"
              >
                {center ? (
                  <span
                    className={cn(
                      "-mt-7 flex size-[62px] items-center justify-center rounded-full border-4 border-[var(--paper)] shadow-[var(--shadow-md)]",
                      active ? "bg-amber-500 text-[#2a1a02]" : "bg-pine-700 text-[var(--site-on-accent)]",
                    )}
                  >
                    <Icon className="size-7" strokeWidth={2.4} />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-full px-4",
                      active ? "bg-pine-100 text-pine-700" : "text-ink-soft",
                    )}
                  >
                    <Icon className="size-6" strokeWidth={active ? 2.6 : 2} />
                    {dueCount ? (
                      <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-vermil-500 text-[11px] font-extrabold text-white">
                        {dueCount}
                      </span>
                    ) : null}
                  </span>
                )}
                <span
                  className={cn(
                    "text-xs font-extrabold",
                    active ? "text-pine-700" : "text-ink-soft",
                    center && "text-ink",
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  desc,
  right,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="anim-rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-pine-700">
            <CalendarDays className="size-4" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
        {desc ? <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">{desc}</p> : null}
      </div>
      {right}
    </div>
  );
}