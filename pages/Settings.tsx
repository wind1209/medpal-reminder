import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Cloud,
  CloudOff,
  Contrast,
  Database,
  Download,
  Eye,
  FileJson,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  Smartphone,
  Sparkles,
  Sun,
  Sunrise,
  Trash2,
  Type,
  Upload,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearSamples,
  exportJSON,
  importJSON,
  loadSamples,
  resetAll,
  setSettings,
  useApp,
} from "@/lib/store";
import {
  initSync,
  pullAll,
  pushAll,
  sendCode,
  signOutCloud,
  subscribeSync,
  supabaseConfigured,
  supabaseProjectHost,
  syncSnapshot,
  verifyCode,
} from "@/lib/supabase";
import { installPromptEvent, isStandalone, notifyState, requestNotify, showLocalNotification, watchInstallPrompt } from "@/lib/notify";
import { sound, speak, stopSpeech, voiceStatus } from "@/lib/voice";
import { checkHealth, type HealthPayload } from "@/lib/api";
import type { FontScale, ThemeMode } from "@/lib/types";
import { todayKey } from "@/lib/time";
import { BigButton, Chip, Field, SectionTitle, SliderRow, ToggleRow, inputClass } from "@/components/bits";
import { PageHead } from "@/components/Shell";

const FONTS: { key: FontScale; label: string; sample: string }[] = [
  { key: "standard", label: "标准", sample: "每日 1 次" },
  { key: "large", label: "大字体", sample: "每日 1 次" },
  { key: "xlarge", label: "特大", sample: "每日 1 次" },
];
const THEMES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: "auto", label: "跟随系统", icon: Sunrise },
  { key: "light", label: "浅色", icon: Sun },
  { key: "dark", label: "深色", icon: Moon },
];

export function Settings() {
  const data = useApp();
  const s = data.settings;
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [notify, setNotify] = useState(() => notifyState());
  const [installable, setInstallable] = useState(!!installPromptEvent());
  const [sync, setSync] = useState(() => syncSnapshot());
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkHealth(true).then(setHealth);
    void initSync();
    const un = subscribeSync(() => setSync(syncSnapshot()));
    const un2 = watchInstallPrompt(() => setInstallable(!!installPromptEvent()));
    return () => {
      un();
      un2();
      stopSpeech();
    };
  }, []);

  const set = (patch: Parameters<typeof setSettings>[0]) => {
    setSettings(patch);
    sound("tap", patch.sound ?? s.sound, s.voiceVolume);
  };

  const tryVoice = () => {
    if (!s.voice) {
      toast("语音播报已关闭", { description: "先打开上面的开关再试听。" });
      return;
    }
    speak("您好，这是语音播报试听。现在该服用苯磺酸氨氯地平片，一次一片，温开水送服。", {
      enabled: true,
      rate: s.voiceRate,
      volume: s.voiceVolume,
    });
    toast("正在试听", { description: voiceStatus() });
  };

  const doExport = () => {
    const url = URL.createObjectURL(new Blob([exportJSON()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `用药数据_${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出全部数据", { description: "包含药品、计划、服药记录与设置，可用于备份或换机。" });
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = importJSON(text);
    if (res.ok) toast.success("导入成功", { description: "9 秒内可点撤销恢复导入前的数据。" });
    else toast.error("导入失败", { description: res.error });
  };

  const cloudReady = supabaseConfigured();

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="个性化与数据"
        title="设置"
        desc="所有调整立即生效。字号、对比度、语音和提醒时间都可以按老人的习惯慢慢调。"
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* 显示 */}
        <section className="panel anim-rise space-y-4 p-5">
          <SectionTitle icon={<Eye className="size-5" />} title="看得清楚" desc="字号与配色会立刻应用到整个应用" />

          <Field label="怎么称呼您" hint="显示在今日首页">
            <input
              className={inputClass}
              value={s.userName}
              maxLength={12}
              placeholder="例如：阿姨 / 张叔叔"
              onChange={(e) => setSettings({ userName: e.target.value })}
            />
          </Field>

          <Field label="字体大小" group>
            <div className="grid grid-cols-3 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => set({ fontScale: f.key })}
                  aria-pressed={s.fontScale === f.key}
                  className={cn(
                    "press flex min-h-[86px] flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border-2 p-2",
                    s.fontScale === f.key ? "border-pine-700 bg-pine-100" : "border-line bg-surface",
                  )}
                >
                  <Type className="size-5 text-pine-700" />
                  <span className="text-sm font-extrabold text-ink">{f.label}</span>
                  <span
                    className="font-bold text-ink-soft"
                    style={{ fontSize: f.key === "standard" ? 13 : f.key === "large" ? 16 : 20 }}
                  >
                    {f.sample}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="主题" group>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set({ theme: t.key })}
                    aria-pressed={s.theme === t.key}
                    className={cn(
                      "press flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border-2 p-2",
                      s.theme === t.key ? "border-pine-700 bg-pine-100" : "border-line bg-surface",
                    )}
                  >
                    <Icon className="size-6 text-pine-700" />
                    <span className="text-sm font-extrabold text-ink">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <ToggleRow
            icon={<Contrast className="size-6" />}
            title="高对比度"
            desc="加深文字与边框，强光下或视力较弱时更清楚"
            checked={s.highContrast}
            onChange={(v) => set({ highContrast: v })}
          />
        </section>

        {/* 声音 */}
        <section className="panel anim-rise stagger-1 space-y-4 p-5">
          <SectionTitle icon={<Volume2 className="size-5" />} title="声音与播报" desc="顶栏的声音按钮可一键全部静音" />

          <ToggleRow
            icon={<Volume2 className="size-6" />}
            title="语音播报药名和用量"
            desc={voiceStatus()}
            checked={s.voice}
            onChange={(v) => set({ voice: v })}
          />
          <SliderRow
            title="播报语速"
            value={s.voiceRate}
            min={0.5}
            max={1.5}
            step={0.05}
            disabled={!s.voice}
            format={(v) => `${v.toFixed(2)} 倍`}
            onChange={(v) => setSettings({ voiceRate: v })}
          />
          <SliderRow
            title="音量"
            value={Math.round(s.voiceVolume * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => setSettings({ voiceVolume: v / 100 })}
          />
          <div className="grid grid-cols-2 gap-3">
            <BigButton tone="soft" size="md" onClick={tryVoice}>
              <Sparkles className="size-5" />
              试听播报
            </BigButton>
            <BigButton tone="outline" size="md" onClick={() => stopSpeech()}>
              停止朗读
            </BigButton>
          </div>

          <ToggleRow
            icon={<BellRing className="size-6" />}
            title="操作提示音"
            desc="打卡、提醒、撤销时播放轻柔提示音"
            checked={s.sound}
            onChange={(v) => set({ sound: v })}
          />
          <div className="grid grid-cols-3 gap-2">
            {(["take", "remind", "done"] as const).map((n) => (
              <BigButton key={n} tone="outline" size="sm" onClick={() => sound(n, true, s.voiceVolume)}>
                {n === "take" ? "打卡音" : n === "remind" ? "提醒音" : "完成音"}
              </BigButton>
            ))}
          </div>
        </section>

        {/* 提醒 */}
        <section className="panel anim-rise stagger-2 space-y-4 p-5">
          <SectionTitle icon={<BellRing className="size-5" />} title="提醒方式" desc="应用内提醒始终生效，浏览器通知需要授权" />

          <ToggleRow
            icon={<BellRing className="size-6" />}
            title="浏览器通知"
            desc={
              notify === "unsupported"
                ? "此浏览器不支持通知"
                : notify === "granted"
                  ? "已授权，到点会推送系统通知"
                  : notify === "denied"
                    ? "已被拒绝，请在浏览器站点设置中重新允许"
                    : "尚未授权，点右侧按钮开启"
            }
            checked={s.notify}
            disabled={notify === "unsupported"}
            onChange={(v) => set({ notify: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <BigButton
              tone="azure"
              size="md"
              disabled={notify === "granted" || notify === "unsupported" || notify === "denied"}
              onClick={async () => {
                const st = await requestNotify();
                setNotify(st);
                if (st === "granted") toast.success("通知已开启");
                else toast.error("未获得通知权限", { description: "应用内提醒仍然有效。" });
              }}
            >
              授权通知
            </BigButton>
            <BigButton
              tone="outline"
              size="md"
              onClick={async () => {
                const ok = await showLocalNotification(
                  "测试提醒",
                  "这是一条测试通知，说明浏览器通知已正常工作。",
                  `medpal-test-${Date.now()}`,
                );
                toast[ok ? "success" : "error"](ok ? "测试通知已发送" : "无法发送通知", {
                  description: ok ? "请查看系统通知中心。" : "请先授权通知，或改用应用内提醒。",
                });
              }}
            >
              发测试通知
            </BigButton>
          </div>

          <SliderRow
            title="提前提醒"
            value={s.leadMinutes}
            min={0}
            max={30}
            step={5}
            format={(v) => (v === 0 ? "准点提醒" : `提前 ${v} 分钟`)}
            onChange={(v) => setSettings({ leadMinutes: v })}
          />
          <SliderRow
            title="漏服宽限时间"
            value={s.graceMinutes}
            min={15}
            max={180}
            step={15}
            format={(v) => `${v} 分钟`}
            onChange={(v) => setSettings({ graceMinutes: v })}
          />
          <SliderRow
            title="推迟提醒间隔"
            value={s.snoozeMinutes}
            min={5}
            max={30}
            step={5}
            format={(v) => `${v} 分钟`}
            onChange={(v) => setSettings({ snoozeMinutes: v })}
          />
          <p className="rounded-[var(--radius-lg)] bg-amber-100 p-3 text-xs leading-relaxed text-ink">
            说明：网页应用的后台推送能力有限。应用打开或安装在桌面、且浏览器允许通知时提醒最可靠；
            完全关闭浏览器后，系统可能不再触发提醒。建议把本应用安装到手机桌面并保持后台运行。
          </p>
        </section>

        {/* 云同步 */}
        <section className="panel anim-rise stagger-3 space-y-4 p-5">
          <SectionTitle
            icon={cloudReady ? <Cloud className="size-5" /> : <CloudOff className="size-5" />}
            title="云同步（Supabase）"
            desc="换手机也能看到同一份用药记录"
          />

          {!cloudReady ? (
            <div className="rounded-[var(--radius-lg)] border-2 border-azure-300 bg-azure-100 p-4 text-sm leading-relaxed text-ink">
              <p className="font-extrabold">当前为本地存储模式</p>
              <p className="mt-1">
                数据保存在这台设备的浏览器里，不会上传。要启用云同步，请在项目根目录的 <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">.env</code> 中填写
                <code className="mx-1 rounded bg-surface px-1.5 py-0.5 font-mono text-xs">VITE_SUPABASE_URL</code> 与
                <code className="mx-1 rounded bg-surface px-1.5 py-0.5 font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>，
                并在 Supabase 执行 <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">supabase/schema.sql</code>，然后重启开发服务器。
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] bg-pine-100 p-3 text-sm font-bold text-pine-900">
                <Database className="size-5" />
                已连接 {supabaseProjectHost()}
                <span
                  className={cn(
                    "ml-auto rounded-full px-3 py-1 text-xs font-extrabold",
                    sync.status === "idle" && "bg-lime-500 text-white",
                    sync.status === "syncing" && "bg-azure-500 text-white",
                    sync.status === "error" && "bg-vermil-500 text-white",
                    sync.status === "signed-out" && "bg-amber-500 text-[#2a1a02]",
                  )}
                >
                  {sync.status === "idle"
                    ? "已登录"
                    : sync.status === "syncing"
                      ? "同步中"
                      : sync.status === "error"
                        ? "同步出错"
                        : "未登录"}
                </span>
              </div>

              {sync.status === "signed-out" ? (
                <div className="space-y-3">
                  <Field label="邮箱" hint="用于接收 6 位验证码">
                    <input
                      className={inputClass}
                      type="email"
                      value={email}
                      placeholder="you@example.com"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  {codeSent ? (
                    <Field label="验证码" hint="邮件里的 6 位数字">
                      <input
                        className={cn(inputClass, "num tracking-[0.4em]")}
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        placeholder="000000"
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      />
                    </Field>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <BigButton
                      tone="outline"
                      size="md"
                      disabled={syncBusy || !email.includes("@")}
                      onClick={async () => {
                        setSyncBusy(true);
                        const r = await sendCode(email.trim());
                        setSyncBusy(false);
                        if (r.ok) {
                          setCodeSent(true);
                          toast.success("验证码已发送", { description: "请查收邮件，10 分钟内有效。" });
                        } else toast.error("发送失败", { description: r.error });
                      }}
                    >
                      <Mail className="size-5" />
                      {codeSent ? "重新发送" : "发送验证码"}
                    </BigButton>
                    <BigButton
                      tone="pine"
                      size="md"
                      disabled={syncBusy || !codeSent || code.length !== 6}
                      onClick={async () => {
                        setSyncBusy(true);
                        const r = await verifyCode(email.trim(), code);
                        setSyncBusy(false);
                        if (r.ok) {
                          toast.success("登录成功", { description: "正在把本地记录同步到云端。" });
                          setCode("");
                          setCodeSent(false);
                        } else toast.error("登录失败", { description: r.error });
                      }}
                    >
                      登录并同步
                    </BigButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-ink-soft">
                    登录邮箱：{sync.email || "—"}
                    {sync.lastSyncAt ? ` · 上次同步 ${new Date(sync.lastSyncAt).toLocaleString("zh-CN")}` : ""}
                  </p>
                  {sync.lastError ? (
                    <p className="rounded-xl bg-vermil-100 p-3 text-sm font-semibold text-vermil-600">{sync.lastError}</p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <BigButton
                      tone="soft"
                      size="md"
                      disabled={syncBusy}
                      onClick={async () => {
                        setSyncBusy(true);
                        const r = await pushAll(data);
                        setSyncBusy(false);
                        toast[r.ok ? "success" : "error"](r.ok ? "已上传到云端" : "上传失败", { description: r.error });
                      }}
                    >
                      <Upload className="size-5" />
                      上传本地
                    </BigButton>
                    <BigButton
                      tone="soft"
                      size="md"
                      disabled={syncBusy}
                      onClick={async () => {
                        setSyncBusy(true);
                        const r = await pullAll(data.deviceId);
                        setSyncBusy(false);
                        if (r.data) {
                          const res = importJSON(JSON.stringify(r.data));
                          toast[res.ok ? "success" : "error"](res.ok ? "已拉取云端数据" : "拉取失败", {
                            description: res.ok ? "9 秒内可撤销。" : res.error,
                          });
                        } else toast.error("拉取失败", { description: r.error ?? "云端没有可用数据。" });
                      }}
                    >
                      <Download className="size-5" />
                      拉取云端
                    </BigButton>
                  </div>
                  <BigButton
                    tone="ghost"
                    size="sm"
                    onClick={async () => {
                      await signOutCloud();
                      toast("已退出云同步", { description: "本地数据仍然保留。" });
                    }}
                  >
                    <LogOut className="size-4" />
                    退出登录
                  </BigButton>
                </div>
              )}
            </>
          )}
        </section>

        {/* 服务状态 */}
        <section className="panel anim-rise stagger-4 space-y-3 p-5">
          <SectionTitle icon={<Sparkles className="size-5" />} title="识别与问答服务" desc="密钥只填在后端，不会出现在前端" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn("rounded-[var(--radius-lg)] border-2 p-4", health?.ocr ? "border-lime-300 bg-lime-100" : "border-amber-300 bg-amber-100")}>
              <p className="text-sm font-extrabold text-ink">阿里云文字识别</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {health === null ? "检测中…" : health.ocr ? "已配置，可识别真实药盒照片" : "未配置密钥：拍照后转为手动填写，示例药盒仍可体验"}
              </p>
            </div>
            <div className={cn("rounded-[var(--radius-lg)] border-2 p-4", health?.ai ? "border-magenta-500 bg-magenta-100" : "border-azure-300 bg-azure-100")}>
              <p className="text-sm font-extrabold text-ink">通义千问（百炼）</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {health === null ? "检测中…" : health.ai ? `已配置 · ${health.model}` : "未配置密钥：使用内置离线知识库回答"}
              </p>
            </div>
          </div>
          <BigButton
            tone="outline"
            size="md"
            onClick={async () => {
              const h = await checkHealth(true);
              setHealth(h);
              toast(h ? "已重新检测服务状态" : "无法连接后端服务", {
                description: h ? `识别 ${h.ocr ? "可用" : "未配置"} · 问答 ${h.ai ? "可用" : "离线知识库"}` : "本地开发请先运行 npm run dev:function。",
              });
            }}
          >
            <RefreshCw className="size-5" />
            重新检测
          </BigButton>
          <p className="text-xs leading-relaxed text-ink-soft">
            密钥填写位置：Qoder Sites 的「设置 → Secrets」，或本地后端环境变量
            <code className="mx-1 rounded bg-pine-100 px-1.5 py-0.5 font-mono">ALIYUN_OCR_ACCESS_KEY_ID</code>、
            <code className="mx-1 rounded bg-pine-100 px-1.5 py-0.5 font-mono">ALIYUN_OCR_ACCESS_KEY_SECRET</code>、
            <code className="mx-1 rounded bg-pine-100 px-1.5 py-0.5 font-mono">DASHSCOPE_API_KEY</code>。
          </p>
        </section>

        {/* 安装与数据 */}
        <section className="panel anim-rise stagger-5 space-y-4 p-5">
          <SectionTitle icon={<Smartphone className="size-5" />} title="安装与数据管理" />

          {isStandalone() ? (
            <p className="rounded-[var(--radius-lg)] bg-lime-100 p-3 text-sm font-bold text-lime-600">
              已作为桌面应用运行，可离线查看用药计划。
            </p>
          ) : installable ? (
            <BigButton
              tone="pine"
              size="lg"
              full
              onClick={async () => {
                const evt = installPromptEvent();
                if (!evt) return;
                await evt.prompt();
                const c = await evt.userChoice;
                if (c.outcome === "accepted") toast.success("已添加到桌面");
                setInstallable(false);
              }}
            >
              <Smartphone className="size-6" />
              安装到手机桌面
            </BigButton>
          ) : (
            <p className="rounded-[var(--radius-lg)] bg-pine-100 p-3 text-xs leading-relaxed text-ink">
              安装方式：iPhone 用 Safari 打开后点「分享 → 添加到主屏幕」；安卓用 Chrome 点菜单里的「安装应用 / 添加到主屏幕」。
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <BigButton tone="soft" size="md" onClick={doExport}>
              <FileJson className="size-5" />
              导出 JSON
            </BigButton>
            <BigButton tone="soft" size="md" onClick={() => fileRef.current?.click()}>
              <Upload className="size-5" />
              导入 JSON
            </BigButton>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void doImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {data.settings.demoSeeded ? (
            confirmClear ? (
              <div className="rounded-[var(--radius-lg)] border-2 border-amber-300 bg-amber-100 p-4">
                <p className="text-sm font-extrabold text-ink">清除全部示例药品与示例记录？</p>
                <p className="mt-1 text-xs text-ink-soft">自己添加的药品不受影响，9 秒内可撤销。</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <BigButton tone="outline" size="sm" onClick={() => setConfirmClear(false)}>
                    取消
                  </BigButton>
                  <BigButton
                    tone="amber"
                    size="sm"
                    onClick={() => {
                      clearSamples();
                      setConfirmClear(false);
                      sound("undo", s.sound, s.voiceVolume);
                    }}
                  >
                    确认清除
                  </BigButton>
                </div>
              </div>
            ) : (
              <BigButton tone="outline" size="md" full onClick={() => setConfirmClear(true)}>
                <Trash2 className="size-5" />
                清除示例数据
              </BigButton>
            )
          ) : (
            <BigButton
              tone="outline"
              size="md"
              full
              onClick={() => {
                loadSamples();
                toast.success("已恢复示例数据", { description: "包含 3 种示例药与近 21 天的示例记录。" });
              }}
            >
              <RefreshCw className="size-5" />
              载入示例数据
            </BigButton>
          )}

          {confirmReset ? (
            <div className="rounded-[var(--radius-lg)] border-2 border-vermil-500 bg-vermil-100 p-4">
              <p className="text-sm font-extrabold text-vermil-600">重置全部数据？</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                药品、计划、服药记录、对话都会被清空，建议先导出 JSON 备份。9 秒内可撤销。
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <BigButton tone="outline" size="sm" onClick={() => setConfirmReset(false)}>
                  取消
                </BigButton>
                <BigButton
                  tone="vermil"
                  size="sm"
                  onClick={() => {
                    resetAll();
                    setConfirmReset(false);
                    sound("warn", s.sound, s.voiceVolume);
                  }}
                >
                  确认重置
                </BigButton>
              </div>
            </div>
          ) : (
            <BigButton tone="danger" size="md" full onClick={() => setConfirmReset(true)}>
              <Trash2 className="size-5" />
              重置全部数据
            </BigButton>
          )}
        </section>
      </div>

      <section className="panel anim-rise p-5">
        <SectionTitle title="关于与免责" />
        <p className="text-sm leading-relaxed text-ink-soft">
          慢病用药提醒助手 · 2026 Qoder 高校创造力大赛 · Hack4Good 技术向善赛道（医疗健康方向）。
          技术栈：React + TypeScript + Vite + Tailwind CSS，PWA 离线可用，Supabase 可选云同步，
          阿里云文字识别负责药盒识别，通义千问（阿里云百炼）负责用药问答。
        </p>
        <p className="mt-3 rounded-[var(--radius-lg)] border-2 border-vermil-300 bg-vermil-100 p-4 text-base font-extrabold leading-relaxed text-vermil-600">
          本应用仅做提醒记录，不能替代医生诊断和药师指导。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          药品剂量、能否合用、是否停药，请以主治医生和药师意见为准。出现严重不适请立即就医或拨打 120。
        </p>
      </section>
    </div>
  );
}