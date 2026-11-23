import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { RouterProvider, useRouter } from "@/lib/router";
import { registerSyncHook, sweepMissed, useApp } from "@/lib/store";
import { useClock } from "@/lib/clock";
import { dosesFor, upcomingAlarms } from "@/lib/schedule";
import { todayKey } from "@/lib/time";
import { initVoice, sound, speak, unlockAudio } from "@/lib/voice";
import { registerServiceWorker, showLocalNotification, syncAlarms } from "@/lib/notify";
import { initSync, pushAll, syncSnapshot } from "@/lib/supabase";
import { performSkip, performTake, remindSpeech } from "@/lib/actions";
import { Shell } from "@/components/Shell";
import { ReminderOverlay } from "@/components/ReminderOverlay";
import { Today } from "@/pages/Today";

const Cabinet = lazy(() => import("@/pages/Cabinet").then((m) => ({ default: m.Cabinet })));
const AddMed = lazy(() => import("@/pages/AddMed").then((m) => ({ default: m.AddMed })));
const Ask = lazy(() => import("@/pages/Ask").then((m) => ({ default: m.Ask })));
const History = lazy(() => import("@/pages/History").then((m) => ({ default: m.History })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));

function PageFallback() {
  return (
    <div className="panel anim-rise flex min-h-[320px] flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="anim-drift flex size-16 items-center justify-center rounded-3xl bg-pine-100 text-pine-700">
        <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
          <g transform="rotate(-38 16 16)">
            <rect x="3" y="10.5" width="26" height="11" rx="5.5" fill="currentColor" />
            <path d="M16 10.5h7.5a5.5 5.5 0 0 1 0 11H16z" fill="var(--surface)" />
          </g>
        </svg>
      </span>
      <p className="text-base font-extrabold text-ink">正在打开…</p>
      <p className="text-sm text-ink-soft">稍等一下，页面马上就好。</p>
    </div>
  );
}

const SNOOZE_KEY = "medpal.snooze";
const FIRED_KEY = "medpal.fired";

function readMap(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const cutoff = Date.now() - 2 * 86400000;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "number" && v > cutoff));
  } catch {
    return {};
  }
}

function writeMap(key: string, map: Record<string, number>) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* 忽略存储配额问题 */
  }
}

function Root() {
  const data = useApp();
  const now = useClock();
  const { path, query, navigate } = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const pushTimer = useRef<number | undefined>(undefined);
  const settings = data.settings;

  /* 主题 / 字号 / 对比度 */
  useEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "auto" && mq.matches);
      html.dataset.theme = dark ? "dark" : "light";
      html.style.colorScheme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b1a16" : "#0e5a4a");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty(
      "--app-type",
      settings.fontScale === "xlarge" ? "1.3" : settings.fontScale === "large" ? "1.14" : "1",
    );
    html.dataset.contrast = settings.highContrast ? "high" : "normal";
  }, [settings.fontScale, settings.highContrast]);

  /* 启动：Service Worker / 语音 / 云同步 / 音频解锁 */
  useEffect(() => {
    void registerServiceWorker();
    initVoice();
    void initSync();
    sweepMissed();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    const sweep = window.setInterval(() => sweepMissed(), 60000);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.clearInterval(sweep);
    };
  }, []);

  /* 云端镜像：登录后自动上传，节流 3 秒 */
  useEffect(() => {
    registerSyncHook((next) => {
      if (syncSnapshot().status !== "idle") return;
      window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => {
        void pushAll(next);
      }, 3000);
    });
    return () => {
      registerSyncHook(null);
      window.clearTimeout(pushTimer.current);
    };
  }, []);

  /* 把临近的提醒交给 Service Worker，页面关闭后仍有机会触发 */
  const minute = Math.floor(now.getTime() / 60000);
  useEffect(() => {
    if (!settings.notify) return;
    void syncAlarms(upcomingAlarms(data, new Date()));
  }, [data, minute, settings.notify]);

  /* 通知点击跳转：/?dose=<key> */
  useEffect(() => {
    const key = query.get("dose");
    if (!key) return;
    const found = dosesFor(data, todayKey(), new Date()).find((d) => d.key === key);
    if (found && !found.log) setActiveKey(key);
    navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 应用已打开时点通知：Service Worker 只聚焦窗口并发消息，不会重新加载页面 */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const payload = e.data as { type?: string; url?: string } | null;
      if (!payload || payload.type !== "MEDPAL_OPEN_DOSE") return;
      const key = new URL(payload.url ?? "/", window.location.origin).searchParams.get("dose");
      if (!key) return;
      setActiveKey(key);
      navigate("/", { replace: true });
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [navigate]);

  /* 到点提醒调度 */
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (activeKey) return;
    const doses = dosesFor(data, todayKey(), now);
    const fired = readMap(FIRED_KEY);
    const snooze = readMap(SNOOZE_KEY);
    for (const d of doses) {
      if (!d.plan.remind || d.log) continue;
      const fireAt = d.at.getTime() - settings.leadMinutes * 60000;
      const until = d.at.getTime() + settings.graceMinutes * 60000;
      const t = now.getTime();
      if (t < fireAt || t > until) continue;
      if (snooze[d.key] && t < snooze[d.key]) continue;
      if (fired[d.key] >= mountedAt.current && !snooze[d.key]) continue;
      fired[d.key] = t;
      delete snooze[d.key];
      writeMap(FIRED_KEY, fired);
      writeMap(SNOOZE_KEY, snooze);
      setActiveKey(d.key);
      sound("remind", settings.sound, settings.voiceVolume);
      speak(remindSpeech(d), { enabled: settings.voice, rate: settings.voiceRate, volume: settings.voiceVolume });
      if (settings.notify) {
        void showLocalNotification(`${d.time} 该服药了`, `${d.med.name} · 每次 ${d.amount} ${d.plan.unit}`, d.key);
      }
      break;
    }
  }, [now, data, activeKey, settings]);

  const doses = useMemo(() => dosesFor(data, todayKey(), now), [data, now]);
  const activeDose = activeKey ? doses.find((d) => d.key === activeKey) ?? null : null;

  useEffect(() => {
    if (activeKey && (!activeDose || activeDose.log || activeDose.status === "missed")) setActiveKey(null);
  }, [activeKey, activeDose]);

  const snoozeActive = () => {
    if (!activeDose) return;
    const map = readMap(SNOOZE_KEY);
    map[activeDose.key] = Date.now() + settings.snoozeMinutes * 60000;
    writeMap(SNOOZE_KEY, map);
    setActiveKey(null);
    sound("tap", settings.sound, settings.voiceVolume);
    toast(`已推迟 ${settings.snoozeMinutes} 分钟`, {
      description: `${activeDose.med.name} ${activeDose.time} 会再次提醒。`,
    });
  };

  return (
    <>
      <Shell>
        <Suspense fallback={<PageFallback />}>
          {path === "/" ? <Today /> : null}
          {path === "/cabinet" ? <Cabinet /> : null}
          {path === "/add" ? <AddMed /> : null}
          {path === "/ask" ? <Ask /> : null}
          {path === "/history" ? <History /> : null}
          {path === "/settings" ? <Settings /> : null}
        </Suspense>
      </Shell>

      {activeDose ? (
        <ReminderOverlay
          dose={activeDose}
          now={now}
          snoozeMinutes={settings.snoozeMinutes}
          onTake={() => {
            performTake(activeDose, settings);
            setActiveKey(null);
          }}
          onSkip={() => {
            performSkip(activeDose, settings);
            setActiveKey(null);
          }}
          onSnooze={snoozeActive}
          onClose={() => {
            const fired = readMap(FIRED_KEY);
            fired[activeDose.key] = Date.now();
            writeMap(FIRED_KEY, fired);
            setActiveKey(null);
          }}
        />
      ) : null}

      <Toaster position="top-center" offset={88} visibleToasts={3} duration={4200} />
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Root />
    </RouterProvider>
  );
}