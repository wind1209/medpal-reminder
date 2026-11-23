import { useEffect, useState } from "react";
import {
  AlarmClock,
  BellRing,
  Camera,
  CheckCheck,
  ChevronRight,
  Flame,
  MessageCircle,
  Package,
  Smartphone,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp, sweepMissed } from "@/lib/store";
import { useClock } from "@/lib/clock";
import { useRouter } from "@/lib/router";
import { dayStats, dosesFor, nextDose, pendingMissed, streak } from "@/lib/schedule";
import { countdown, dateFullCN, dueLabel, greeting, humanGap, todayKey } from "@/lib/time";
import { FOOD_LABEL, SLOT_META, type SlotKey } from "@/lib/types";
import { installPromptEvent, isStandalone, notifyState, requestNotify, watchInstallPrompt } from "@/lib/notify";
import { sound } from "@/lib/voice";
import { BigButton, Empty, PillGlyph, Ring, StatTile } from "@/components/bits";
import { PageHead } from "@/components/Shell";
import { PillBox } from "@/components/PillBox";
import { DoseCard } from "@/components/DoseCard";
import { MedSheet } from "@/components/MedSheet";

export function Today() {
  const data = useApp();
  const now = useClock();
  const { navigate } = useRouter();
  const [slot, setSlot] = useState<SlotKey | "all">("all");
  const [medId, setMedId] = useState<string | null>(null);
  const [installable, setInstallable] = useState(!!installPromptEvent());
  const [hideInstall, setHideInstall] = useState(false);
  const [notify, setNotify] = useState(() => notifyState());

  useEffect(() => {
    const un = watchInstallPrompt(() => setInstallable(!!installPromptEvent()));
    return () => {
      un();
    };
  }, []);

  const doses = dosesFor(data, todayKey(), now);
  const stats = dayStats(doses);
  const next = nextDose(doses, now);
  const pending = pendingMissed(data, now);
  const days = streak(data, now);
  const lowStock = data.meds.filter((m) => m.stock <= m.lowStock);
  const visible = slot === "all" ? doses : doses.filter((d) => d.slot === slot);
  const allDone = stats.total > 0 && stats.pending === 0 && stats.missed === 0;

  const askNotify = async () => {
    const state = await requestNotify();
    setNotify(state);
    if (state === "granted") {
      toast.success("浏览器通知已开启", { description: "到点会推送服药提醒，请保持应用安装在桌面。" });
      sound("done", data.settings.sound, data.settings.voiceVolume);
    } else if (state === "denied") {
      toast.error("通知被拒绝", { description: "可在浏览器地址栏的站点设置里重新允许通知。" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={dateFullCN(todayKey())}
        title={`${greeting(now.getHours())}，${data.settings.userName || "您好"}`}
        desc={
          stats.total
            ? `今天一共 ${stats.total} 次服药，已完成 ${stats.taken} 次。到点会自动提醒，吃完点一下打卡就行。`
            : "今天还没有服药安排。拍一张药盒照片，就能自动生成用药计划。"
        }
        right={
          <div className="flex gap-2">
            <BigButton tone="pine" size="md" onClick={() => navigate("/add")}>
              <Camera className="size-6" />
              拍照加药
            </BigButton>
            <BigButton tone="outline" size="md" onClick={() => navigate("/ask")}>
              <MessageCircle className="size-6" />
              问一问
            </BigButton>
          </div>
        }
      />

      {/* 主视觉：今日完成环 + 下一次服药 */}
      <section className="panel-raised anim-rise overflow-hidden">
        <div className="grid gap-6 p-5 lg:grid-cols-[auto_1fr] lg:p-7">
          <div className="flex items-center gap-5">
            <Ring value={stats.rate} size={176} stroke={16} color={allDone ? "var(--lime-500)" : "var(--pine-500)"}>
              <span className="num text-4xl font-extrabold leading-none text-ink">
                {stats.taken}
                <span className="text-xl text-ink-soft">/{stats.total}</span>
              </span>
              <span className="mt-1 text-sm font-bold text-ink-soft">今日已服</span>
              <span className="num mt-0.5 text-xs font-extrabold text-pine-700">
                {Math.round(stats.rate * 100)}%
              </span>
            </Ring>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-base font-extrabold text-ink">
                <Flame className="size-5 text-amber-600" />
                连续达标 <span className="num text-2xl text-amber-600">{days}</span> 天
              </p>
              <p className="max-w-[190px] text-sm leading-relaxed text-ink-soft">
                {allDone
                  ? "今天的药都按时吃完了，做得很好。"
                  : stats.missed
                    ? `有 ${stats.missed} 次漏服，已标红。补服前请先问医生。`
                    : "按时打卡，连续天数会一直累加。"}
              </p>
              {allDone ? (
                <span className="anim-pop inline-flex items-center gap-2 rounded-full bg-lime-500 px-4 py-2 text-sm font-extrabold text-white">
                  <Sparkles className="size-4" />
                  今日全部完成
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className={cn(
                "relative overflow-hidden rounded-[var(--radius-xl)] border-2 p-5",
                next ? "border-amber-500 bg-amber-100" : "border-line bg-pine-100",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-extrabold text-ink-soft">
                <AlarmClock className="size-5" />
                下一次服药
              </p>
              {next ? (
                <>
                  <p className="num mt-2 text-4xl font-extrabold leading-none text-ink">{next.time}</p>
                  <p className="mt-2 truncate text-lg font-extrabold text-ink">{next.med.name}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-bold text-ink-soft">
                    <PillGlyph size={22} color={SLOT_META[next.slot].hue} />
                    {next.amount} {next.plan.unit} · {FOOD_LABEL[next.plan.food]}
                  </p>
                  <p className="num mt-3 inline-flex rounded-full bg-[var(--surface)] px-3 py-1.5 text-sm font-extrabold text-pine-700">
                    {next.status === "due"
                      ? dueLabel(next.at.getTime() - now.getTime())
                      : `${humanGap(next.at.getTime() - now.getTime())}后`}
                    {next.at.getTime() > now.getTime() ? (
                      <span className="ml-2 text-ink-soft">{countdown(next.at.getTime() - now.getTime())}</span>
                    ) : null}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-extrabold text-ink">今天没有待服的了</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {stats.total ? "所有任务都已处理，明天会继续提醒。" : "先去添加一个药品吧。"}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
              <StatTile label="待服用" value={stats.pending} unit="次" hue="var(--azure-500)" icon={<BellRing className="size-4" />} />
              <StatTile label="漏服" value={stats.missed} unit="次" hue="var(--vermil-500)" icon={<TriangleAlert className="size-4" />} />
            </div>
          </div>
        </div>
      </section>

      {/* 状态提示条 */}
      {data.settings.notify && notify !== "granted" && notify !== "unsupported" ? (
        <div className="anim-rise flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-azure-300 bg-azure-100 p-4">
          <BellRing className="size-7 shrink-0 text-azure-600" />
          <p className="min-w-0 flex-1 text-sm font-bold leading-relaxed text-ink">
            开启浏览器通知，到点即使没看手机也能收到提醒。
            <span className="block text-xs font-semibold text-ink-soft">
              当前状态：{notify === "denied" ? "已被拒绝，需在浏览器站点设置中重新允许" : "尚未授权"}
            </span>
          </p>
          <BigButton tone="azure" size="md" onClick={askNotify} disabled={notify === "denied"}>
            开启通知
          </BigButton>
        </div>
      ) : null}

      {installable && !hideInstall && !isStandalone() ? (
        <div className="anim-rise flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-pine-300 bg-pine-100 p-4">
          <Smartphone className="size-7 shrink-0 text-pine-700" />
          <p className="min-w-0 flex-1 text-sm font-bold leading-relaxed text-ink">
            安装到手机桌面，像 App 一样打开，离线也能查看用药计划。
          </p>
          <BigButton
            tone="pine"
            size="md"
            onClick={async () => {
              const evt = installPromptEvent();
              if (!evt) return;
              await evt.prompt();
              const choice = await evt.userChoice;
              if (choice.outcome === "accepted") toast.success("已添加到桌面");
              setInstallable(false);
            }}
          >
            立即安装
          </BigButton>
          <button type="button" onClick={() => setHideInstall(true)} aria-label="暂不安装" className="press text-ink-soft">
            <X className="size-5" />
          </button>
        </div>
      ) : null}

      {pending.length ? (
        <div className="anim-rise flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-vermil-300 bg-vermil-100 p-4">
          <TriangleAlert className="size-7 shrink-0 text-vermil-600" />
          <p className="min-w-0 flex-1 text-sm font-bold leading-relaxed text-ink">
            有 {pending.length} 次过去的服药还没有记录。
            <span className="block text-xs font-semibold text-ink-soft">
              标记为漏服后会标红，方便复诊时给医生看。
            </span>
          </p>
          <BigButton
            tone="vermil"
            size="md"
            onClick={() => {
              const n = sweepMissed();
              sound("warn", data.settings.sound, data.settings.voiceVolume);
              toast(`已标记 ${n} 次漏服`, { description: "可在下方卡片里补打卡，或点撤销恢复。" });
            }}
          >
            标记漏服
          </BigButton>
        </div>
      ) : null}

      {lowStock.length ? (
        <div className="anim-rise flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-amber-300 bg-amber-100 p-4">
          <Package className="size-7 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm font-bold leading-relaxed text-ink">
            {lowStock.map((m) => `${m.name}（剩 ${m.stock}）`).join("、")} 需要配药。
          </p>
          <BigButton tone="amber" size="md" onClick={() => navigate("/cabinet")}>
            去药箱
            <ChevronRight className="size-5" />
          </BigButton>
        </div>
      ) : null}

      <PillBox doses={doses} active={slot} onSelect={setSlot} />

      {/* 服药任务列表 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink">
            <CheckCheck className="size-6 text-pine-700" />
            {slot === "all" ? "今日服药任务" : `${SLOT_META[slot].label}的任务`}
            <span className="num rounded-full bg-pine-100 px-3 py-0.5 text-sm text-pine-900">{visible.length}</span>
          </h2>
          {slot !== "all" ? (
            <BigButton tone="ghost" size="sm" onClick={() => setSlot("all")}>
              显示全部
            </BigButton>
          ) : null}
        </div>

        {visible.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {visible.map((d, i) => (
              <DoseCard key={d.key} dose={d} now={now} index={i} onOpenMed={setMedId} />
            ))}
          </div>
        ) : (
          <Empty
            icon={<Camera className="size-9" />}
            title={slot === "all" ? "还没有用药计划" : "这个时段没有安排"}
            desc={
              slot === "all"
                ? "拍一张药盒照片，识别药名和用法用量后自动生成每天的服药时间；也可以手动填写。"
                : "切换到其他时段，或显示全部任务。"
            }
            action={
              slot === "all" ? (
                <BigButton tone="pine" size="lg" full onClick={() => navigate("/add")}>
                  <Camera className="size-6" />
                  拍照添加药品
                </BigButton>
              ) : (
                <BigButton tone="soft" size="lg" full onClick={() => setSlot("all")}>
                  显示全部
                </BigButton>
              )
            }
          />
        )}
      </section>

      <MedSheet medId={medId} onClose={() => setMedId(null)} />
    </div>
  );
}