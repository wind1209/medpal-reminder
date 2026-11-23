import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Download, Flame, History as HistoryIcon, ListChecks, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useClock } from "@/lib/clock";
import { adherenceSeries, dayStats, dosesFor, streak } from "@/lib/schedule";
import { addDays, dateCN, dateFullCN, todayKey } from "@/lib/time";
import { CATEGORY_HUE, type DoseStatus } from "@/lib/types";
import { BigButton, Chip, Empty, SectionTitle, StatTile } from "@/components/bits";
import { PageHead } from "@/components/Shell";

const STATUS_LABEL: Record<DoseStatus, string> = { taken: "已服用", missed: "漏服", skipped: "已跳过" };
const STATUS_HUE: Record<DoseStatus, string> = {
  taken: "var(--lime-500)",
  missed: "var(--vermil-500)",
  skipped: "var(--azure-500)",
};
const MED_HUES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

function heatColor(rate: number, total: number) {
  if (!total) return "var(--muted)";
  if (rate >= 1) return "var(--lime-500)";
  if (rate >= 0.8) return "var(--lime-300)";
  if (rate >= 0.5) return "var(--amber-300)";
  if (rate > 0) return "var(--amber-500)";
  return "var(--vermil-500)";
}

export function History() {
  const data = useApp();
  const now = useClock();
  const [range, setRange] = useState<14 | 30>(30);
  const [day, setDay] = useState<string>(todayKey());
  const [medFilter, setMedFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<DoseStatus | "all">("all");

  const series = useMemo(() => adherenceSeries(data, range, now), [data, range, now]);
  const days = streak(data, now);
  const heat = useMemo(() => adherenceSeries(data, 35, now), [data, now]);

  const totals = useMemo(() => {
    const t = series.reduce(
      (acc, p) => ({
        taken: acc.taken + p.taken,
        missed: acc.missed + p.missed,
        skipped: acc.skipped + p.skipped,
        total: acc.total + p.total,
      }),
      { taken: 0, missed: 0, skipped: 0, total: 0 },
    );
    return { ...t, rate: t.total ? Math.round((t.taken / t.total) * 100) : 0 };
  }, [series]);

  const perMed = useMemo(
    () =>
      data.meds
        .map((m, i) => {
          const logs = data.logs.filter((l) => l.medId === m.id && series.some((p) => p.date === l.date));
          const taken = logs.filter((l) => l.status === "taken").length;
          const missed = logs.filter((l) => l.status === "missed").length;
          const skipped = logs.filter((l) => l.status === "skipped").length;
          const total = taken + missed + skipped;
          return {
            id: m.id,
            name: m.name,
            short: m.alias || m.name.slice(0, 6),
            taken,
            missed,
            skipped,
            total,
            rate: total ? Math.round((taken / total) * 100) : 0,
            hue: MED_HUES[i % MED_HUES.length],
            category: m.category,
          };
        })
        .filter((m) => m.total > 0)
        .sort((a, b) => b.total - a.total),
    [data.meds, data.logs, series],
  );

  const dayDoses = dosesFor(data, day, now);
  const dayStat = dayStats(dayDoses);

  const logs = useMemo(() => {
    const from = addDays(todayKey(), -(range - 1));
    return data.logs
      .filter((l) => l.date >= from && l.date <= todayKey())
      .filter((l) => (medFilter === "all" ? true : l.medId === medFilter))
      .filter((l) => (statusFilter === "all" ? true : l.status === statusFilter))
      .sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)));
  }, [data.logs, medFilter, statusFilter, range]);

  const exportCsv = () => {
    const nameOf = (id: string) => data.meds.find((m) => m.id === id)?.name ?? "已删除药品";
    const rows = [
      ["日期", "时间", "药品", "用量", "状态", "打卡时间", "备注"],
      ...logs.map((l) => [
        l.date,
        l.time,
        nameOf(l.medId),
        `${l.amount}`,
        STATUS_LABEL[l.status],
        l.at ? new Date(l.at).toLocaleString("zh-CN") : "",
        l.note,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `服药记录_${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${logs.length} 条记录`, { description: "CSV 文件可用 Excel 打开，复诊时给医生看。" });
  };

  const chartData = series.map((p) => ({ ...p, 漏服: p.missed, 已跳过: p.skipped, 已服用: p.taken, 达标率: p.rate }));

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="历史记录"
        title="服药记录"
        desc="按天查看服药情况，漏服会标红。可以导出 CSV，复诊时直接给医生看。"
        right={
          <div className="flex flex-wrap gap-2">
            <Chip selected={range === 14} onClick={() => setRange(14)}>
              近 14 天
            </Chip>
            <Chip selected={range === 30} onClick={() => setRange(30)}>
              近 30 天
            </Chip>
            <BigButton tone="pine" size="md" onClick={exportCsv} disabled={!logs.length}>
              <Download className="size-5" />
              导出 CSV
            </BigButton>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`近 ${range} 天达标率`} value={totals.rate} unit="%" hue="var(--chart-1)" icon={<TrendingUp className="size-4" />} />
        <StatTile label="已服用" value={totals.taken} unit="次" hue="var(--chart-6)" icon={<ListChecks className="size-4" />} />
        <StatTile label="漏服" value={totals.missed} unit="次" hue="var(--chart-4)" icon={<CalendarDays className="size-4" />} />
        <StatTile label="连续达标" value={days} unit="天" hue="var(--chart-2)" icon={<Flame className="size-4" />} />
      </div>

      {/* 热力图 */}
      <section className="panel anim-rise p-5">
        <SectionTitle
          title="每日服药热力图"
          desc="最近 35 天，颜色越绿表示当天完成得越好；点某一天可查看明细。"
          right={
            <div className="hidden items-center gap-2 text-xs font-bold text-ink-soft sm:flex">
              少
              {[0, 0.3, 0.6, 0.9, 1].map((r) => (
                <span key={r} className="size-4 rounded" style={{ background: heatColor(r, 1) }} />
              ))}
              多
            </div>
          }
        />
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(35,minmax(0,1fr))]">
          {heat.map((p) => (
            <button
              key={p.date}
              type="button"
              onClick={() => setDay(p.date)}
              title={`${dateCN(p.date)}：已服 ${p.taken}/${p.total}，漏服 ${p.missed}`}
              aria-label={`${dateCN(p.date)} 已服 ${p.taken} 共 ${p.total}`}
              className={cn(
                "press aspect-square rounded-md ring-offset-2 ring-offset-[var(--surface)]",
                day === p.date && "ring-2 ring-pine-700",
              )}
              style={{ background: heatColor(p.rate / 100, p.total) }}
            />
          ))}
        </div>
        <p className="num mt-3 text-xs font-semibold text-ink-soft">
          {dateCN(heat[0]?.date ?? todayKey())} — {dateCN(heat[heat.length - 1]?.date ?? todayKey())}
        </p>
      </section>

      {/* 图表 */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel anim-rise p-5">
          <SectionTitle title="每日服药次数" desc="按状态堆叠，直接标注数值含义" />
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--ink-soft)", fontSize: 12 }} interval={range === 30 ? 4 : 1} stroke="var(--line)" />
                <YAxis tick={{ fill: "var(--ink-soft)", fontSize: 12 }} allowDecimals={false} stroke="var(--line)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--overlay)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    color: "var(--ink)",
                    fontSize: 14,
                  }}
                  labelStyle={{ color: "var(--ink)", fontWeight: 800 }}
                  formatter={(v, n) => [`${v} 次`, String(n)]}
                />
                <Legend wrapperStyle={{ fontSize: 13, fontWeight: 700 }} />
                <Bar dataKey="已服用" stackId="a" fill="var(--chart-6)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="已跳过" stackId="a" fill="var(--chart-3)" />
                <Bar dataKey="漏服" stackId="a" fill="var(--chart-4)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel anim-rise stagger-1 p-5">
          <SectionTitle title="每日达标率" desc="当天已服次数 ÷ 当天应服次数" />
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--ink-soft)", fontSize: 12 }} interval={range === 30 ? 4 : 1} stroke="var(--line)" />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--ink-soft)", fontSize: 12 }} unit="%" stroke="var(--line)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--overlay)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    color: "var(--ink)",
                    fontSize: 14,
                  }}
                  formatter={(v) => [`${v}%`, "达标率"]}
                />
                <Line
                  type="monotone"
                  dataKey="达标率"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "var(--chart-2)", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "var(--chart-4)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* 分药品达标 */}
      {perMed.length ? (
        <section className="panel anim-rise p-5">
          <SectionTitle title="各药品达标情况" desc={`近 ${range} 天，按记录条数排序`} />
          <div className="space-y-3">
            {perMed.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3">
                <span className="w-[150px] shrink-0 truncate text-sm font-extrabold text-ink" title={m.name}>
                  {m.short}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold text-white"
                  style={{ background: CATEGORY_HUE[m.category] }}
                >
                  {m.category}
                </span>
                <div className="flex h-7 min-w-[160px] flex-1 overflow-hidden rounded-full bg-muted">
                  {m.taken ? (
                    <span
                      className="flex h-full items-center justify-center text-xs font-extrabold text-white"
                      style={{ width: `${(m.taken / m.total) * 100}%`, background: m.hue }}
                    >
                      {m.taken}
                    </span>
                  ) : null}
                  {m.skipped ? (
                    <span
                      className="h-full"
                      style={{
                        width: `${(m.skipped / m.total) * 100}%`,
                        background: "repeating-linear-gradient(45deg,var(--chart-3),var(--chart-3) 4px,var(--azure-100) 4px,var(--azure-100) 8px)",
                      }}
                      title={`跳过 ${m.skipped} 次`}
                    />
                  ) : null}
                  {m.missed ? (
                    <span
                      className="h-full"
                      style={{
                        width: `${(m.missed / m.total) * 100}%`,
                        background: "repeating-linear-gradient(-45deg,var(--chart-4),var(--chart-4) 4px,var(--vermil-100) 4px,var(--vermil-100) 8px)",
                      }}
                      title={`漏服 ${m.missed} 次`}
                    />
                  ) : null}
                </div>
                <span className="num w-[110px] shrink-0 text-right text-sm font-extrabold text-ink">
                  {m.rate}%
                  <span className="ml-1 text-xs font-semibold text-ink-soft">
                    {m.taken}/{m.total}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded" style={{ background: "var(--chart-1)" }} />
              实色 = 已服用（数字为次数）
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-3 rounded"
                style={{ background: "repeating-linear-gradient(45deg,var(--chart-3),var(--chart-3) 3px,var(--azure-100) 3px,var(--azure-100) 6px)" }}
              />
              斜纹 = 已跳过
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-3 rounded"
                style={{ background: "repeating-linear-gradient(-45deg,var(--chart-4),var(--chart-4) 3px,var(--vermil-100) 3px,var(--vermil-100) 6px)" }}
              />
              反斜纹 = 漏服
            </span>
          </p>
        </section>
      ) : null}

      {/* 选中日期明细 */}
      <section className="panel anim-rise p-5">
        <SectionTitle
          icon={<CalendarDays className="size-5" />}
          title={`${dateFullCN(day)} 明细`}
          desc={`应服 ${dayStat.total} 次 · 已服 ${dayStat.taken} · 漏服 ${dayStat.missed} · 跳过 ${dayStat.skipped}`}
          right={
            <div className="flex gap-2">
              <BigButton tone="ghost" size="sm" onClick={() => setDay(addDays(day, -1))}>
                前一天
              </BigButton>
              <BigButton tone="ghost" size="sm" disabled={day >= todayKey()} onClick={() => setDay(addDays(day, 1))}>
                后一天
              </BigButton>
              <BigButton tone="soft" size="sm" onClick={() => setDay(todayKey())}>
                回到今天
              </BigButton>
            </div>
          }
        />
        {dayDoses.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {dayDoses.map((d) => (
              <li
                key={d.key}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-lg)] border p-3",
                  d.status === "missed" ? "border-vermil-300 bg-vermil-100/60" : "border-line bg-surface",
                )}
              >
                <span className="num w-[58px] shrink-0 text-lg font-extrabold text-ink">{d.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-ink">{d.med.name}</span>
                  <span className="block text-xs text-ink-soft">
                    {d.amount} {d.plan.unit}
                    {d.log?.at ? ` · 打卡 ${new Date(d.log.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold text-white"
                  style={{
                    background:
                      d.status === "done"
                        ? "var(--lime-500)"
                        : d.status === "missed"
                          ? "var(--vermil-500)"
                          : d.status === "skipped"
                            ? "var(--azure-500)"
                            : "var(--ink-soft)",
                  }}
                >
                  {d.status === "done" ? "已服用" : d.status === "missed" ? "漏服" : d.status === "skipped" ? "跳过" : "未记录"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">这一天没有服药安排。</p>
        )}
      </section>

      {/* 记录表 */}
      <section className="panel anim-rise p-5">
        <SectionTitle
          icon={<HistoryIcon className="size-5" />}
          title="全部记录"
          desc={`近 ${range} 天共 ${logs.length} 条`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={medFilter}
                onChange={(e) => setMedFilter(e.target.value)}
                aria-label="按药品筛选"
                className="min-h-[46px] rounded-[var(--radius-lg)] border-2 border-line bg-surface px-3 text-sm font-bold text-ink focus:border-pine-500 focus:outline-none"
              >
                <option value="all">全部药品</option>
                {data.meds.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {(["all", "taken", "missed", "skipped"] as const).map((s) => (
                <Chip
                  key={s}
                  selected={statusFilter === s}
                  hue={s === "all" ? "var(--pine-700)" : STATUS_HUE[s]}
                  className="min-h-[48px] text-sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all" ? "全部" : STATUS_LABEL[s]}
                </Chip>
              ))}
            </div>
          }
        />
        {logs.length ? (
          <div className="max-h-[460px] overflow-auto rounded-[var(--radius-lg)] border border-line">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-pine-100 text-left">
                <tr>
                  {["日期", "时间", "药品", "用量", "状态", "打卡时间", "备注"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-xs font-extrabold text-pine-900">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const med = data.meds.find((m) => m.id === l.medId);
                  return (
                    <tr key={l.id} className="border-t border-line bg-surface odd:bg-[color-mix(in_srgb,var(--surface)_92%,var(--paper))]">
                      <td className="num px-3 py-2.5 font-bold text-ink">{dateCN(l.date)}</td>
                      <td className="num px-3 py-2.5 text-ink-soft">{l.time}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold text-ink">{med?.name ?? "已删除药品"}</td>
                      <td className="num px-3 py-2.5 text-ink-soft">{l.amount}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white"
                          style={{ background: STATUS_HUE[l.status] }}
                        >
                          {STATUS_LABEL[l.status]}
                        </span>
                      </td>
                      <td className="num px-3 py-2.5 text-ink-soft">
                        {l.at ? new Date(l.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-ink-soft">{l.note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<HistoryIcon className="size-9" />}
            title="没有符合条件的记录"
            desc="换个药品或状态筛选试试；开始打卡后这里会自动累积记录。"
          />
        )}
      </section>
    </div>
  );
}