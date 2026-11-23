/* 慢病用药提醒助手 · Service Worker
   职责：离线应用壳、到点系统通知、通知点击回到对应服药卡片。
   说明：浏览器不允许 Service Worker 长期持有定时器。本页打开时由页面精确调度；
   页面退到后台或安装到主屏后，由本文件在每次唤醒时重新装载近期提醒。 */

const VERSION = "medpal-shell-v3";
const ALARM_CACHE = "medpal-alarms-v1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/boxes/amlodipine.svg",
  "/boxes/metformin.svg",
  "/boxes/atorvastatin.svg",
];

let timers = [];
let alarms = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION && k !== ALARM_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      await restoreAlarms();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(functions|__qoder_auth|__qoder_internal|rest|supabase|storage|api|internal)\//.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(VERSION);
          cache.put("/index.html", fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cached = await caches.match("/index.html");
          return cached ?? new Response("离线且没有缓存的应用壳。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(VERSION);
            cache.put(request, fresh.clone()).catch(() => undefined);
          }
          return fresh;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (fresh) => {
          if (fresh.ok) {
            const cache = await caches.open(VERSION);
            cache.put(request, fresh.clone()).catch(() => undefined);
          }
          return fresh;
        })
        .catch(() => null);
      return cached ?? (await network) ?? new Response("", { status: 504 });
    })(),
  );
});

async function persistAlarms(list) {
  try {
    const cache = await caches.open(ALARM_CACHE);
    await cache.put("/__alarms", new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } }));
  } catch {
    /* 缓存不可用时忽略 */
  }
}

async function restoreAlarms() {
  try {
    const cache = await caches.open(ALARM_CACHE);
    const res = await cache.match("/__alarms");
    if (!res) return;
    const list = await res.json();
    if (Array.isArray(list)) arm(list);
  } catch {
    /* 忽略 */
  }
}

function arm(list) {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  alarms = list;
  const now = Date.now();
  const soon = list.filter((a) => a.at > now - 60000 && a.at < now + 6 * 3600000).slice(0, 24);
  for (const alarm of soon) {
    const delay = Math.max(0, alarm.at - now);
    timers.push(
      setTimeout(() => {
        self.registration
          .showNotification(alarm.title, {
            body: alarm.body,
            tag: alarm.key,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            vibrate: [180, 90, 180],
            renotify: true,
            data: { url: `/?dose=${encodeURIComponent(alarm.key)}` },
          })
          .catch(() => undefined);
      }, delay),
    );
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "MEDPAL_ALARMS" && Array.isArray(data.alarms)) {
    event.waitUntil(
      (async () => {
        await persistAlarms(data.alarms);
        arm(data.alarms);
      })(),
    );
  }
  if (data.type === "MEDPAL_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = { title: "该服药了", body: "打开应用查看今日用药计划", key: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* 使用默认文案 */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.key || "medpal-push",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [180, 90, 180],
      data: { url: payload.key ? `/?dose=${encodeURIComponent(payload.key)}` : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "MEDPAL_OPEN_DOSE", url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "medpal-check") {
    event.waitUntil(
      (async () => {
        await restoreAlarms();
        const clientList = await self.clients.matchAll({ type: "window" });
        clientList.forEach((c) => c.postMessage({ type: "MEDPAL_RESYNC" }));
      })(),
    );
  }
});