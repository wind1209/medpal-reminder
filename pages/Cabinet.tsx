import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  GripVertical,
  Package,
  PackagePlus,
  Pencil,
  Printer,
  Search,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "@/lib/router";
import { deleteMed, deleteMeds, moveMed, reorderMeds, restock, useApp } from "@/lib/store";
import { CATEGORY_HUE, SLOT_META, type MedCategory } from "@/lib/types";
import { slotOf } from "@/lib/time";
import { sound } from "@/lib/voice";
import { BigButton, Chip, Empty, IconButton, MedArt, PillGlyph, inputClass } from "@/components/bits";
import { PageHead } from "@/components/Shell";
import { MedSheet } from "@/components/MedSheet";

type SortKey = "custom" | "name" | "stock" | "created";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "custom", label: "自定义顺序" },
  { key: "name", label: "按名称" },
  { key: "stock", label: "余量从少到多" },
  { key: "created", label: "最近添加" },
];
const CATEGORIES: (MedCategory | "全部")[] = ["全部", "降压", "降糖", "降脂", "抗凝", "其他"];

export function Cabinet() {
  const data = useApp();
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MedCategory | "全部">("全部");
  const [onlyLow, setOnlyLow] = useState(false);
  const [sort, setSort] = useState<SortKey>("custom");
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [medId, setMedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const canDrag = sort === "custom" && !query.trim() && category === "全部" && !onlyLow && !bulk;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = data.meds.filter((m) => {
      if (category !== "全部" && m.category !== category) return false;
      if (onlyLow && m.stock > m.lowStock) return false;
      if (!q) return true;
      return [m.name, m.alias, m.spec, m.category, m.usageText, m.note]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sort === "stock") return a.stock - b.stock;
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      return a.order - b.order;
    });
    return out;
  }, [data.meds, query, category, onlyLow, sort]);

  const planOf = (id: string) => data.plans.find((p) => p.medId === id);
  const lowCount = data.meds.filter((m) => m.stock <= m.lowStock).length;

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ids = list.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderMeds(ids);
    sound("tap", data.settings.sound, data.settings.voiceVolume);
    setDragId(null);
    setOverId(null);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="用药清单"
        title="我的药箱"
        desc={`共 ${data.meds.length} 种药品，${lowCount} 种需要配药。可以搜索、筛选、拖动排序，点开卡片查看详情或修改计划。`}
        right={
          <div className="flex flex-wrap gap-2">
            <BigButton tone="outline" size="md" onClick={() => window.print()}>
              <Printer className="size-5" />
              打印清单
            </BigButton>
            <BigButton
              tone={bulk ? "amber" : "soft"}
              size="md"
              onClick={() => {
                setBulk((b) => !b);
                setSelected([]);
                setConfirmBulk(false);
              }}
            >
              <CheckSquare className="size-5" />
              {bulk ? "退出批量" : "批量管理"}
            </BigButton>
            <BigButton tone="pine" size="md" onClick={() => navigate("/add")}>
              <PackagePlus className="size-5" />
              添加药品
            </BigButton>
          </div>
        }
      />

      {/* 搜索 / 筛选 / 排序 */}
      <div className="panel anim-rise space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
            <input
              className={cn(inputClass, "pl-12")}
              value={query}
              placeholder="搜索药名、别名、规格…"
              aria-label="搜索药品"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
                className="press absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-pine-100"
              >
                <X className="size-5" />
              </button>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-ink-soft">
            排序
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="排序方式"
              className="min-h-[52px] rounded-[var(--radius-lg)] border-2 border-line bg-surface px-3 text-base font-bold text-ink focus:border-pine-500 focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              selected={category === c}
              hue={c === "全部" ? "var(--pine-700)" : CATEGORY_HUE[c]}
              onClick={() => setCategory(c)}
            >
              {c}
              <span className="num opacity-70">
                {c === "全部" ? data.meds.length : data.meds.filter((m) => m.category === c).length}
              </span>
            </Chip>
          ))}
          <Chip selected={onlyLow} hue="var(--vermil-500)" onClick={() => setOnlyLow((v) => !v)}>
            <TriangleAlert className="size-4" />
            余量不足 {lowCount}
          </Chip>
        </div>

        {canDrag ? (
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <GripVertical className="size-4" />
            按住卡片左侧的把手拖动，可以调整药箱顺序；也可以用卡片上的上移 / 下移按钮。
          </p>
        ) : null}
      </div>

      {/* 批量操作条 */}
      {bulk ? (
        <div className="anim-rise flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-amber-300 bg-amber-100 p-4">
          <p className="text-sm font-extrabold text-ink">已选 {selected.length} 项</p>
          <BigButton tone="soft" size="sm" onClick={() => setSelected(list.map((m) => m.id))}>
            全选当前 {list.length} 项
          </BigButton>
          <BigButton tone="ghost" size="sm" onClick={() => setSelected([])}>
            清空选择
          </BigButton>
          {confirmBulk ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm font-bold text-vermil-600">确认删除？可撤销</span>
              <BigButton tone="outline" size="sm" onClick={() => setConfirmBulk(false)}>
                取消
              </BigButton>
              <BigButton
                tone="vermil"
                size="sm"
                onClick={() => {
                  deleteMeds(selected);
                  sound("warn", data.settings.sound, data.settings.voiceVolume);
                  toast(`已删除 ${selected.length} 个药品`, { description: "9 秒内可点撤销恢复。" });
                  setSelected([]);
                  setConfirmBulk(false);
                }}
              >
                确认删除
              </BigButton>
            </div>
          ) : (
            <BigButton
              tone="vermil"
              size="sm"
              className="ml-auto"
              disabled={!selected.length}
              onClick={() => setConfirmBulk(true)}
            >
              <Trash2 className="size-5" />
              删除所选
            </BigButton>
          )}
        </div>
      ) : null}

      {/* 药品卡片 */}
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((med, i) => {
            const plan = planOf(med.id);
            const hue = CATEGORY_HUE[med.category];
            const low = med.stock <= med.lowStock;
            const ratio = Math.max(0.04, Math.min(1, med.stock / Math.max(1, med.lowStock * 4)));
            const isSel = selected.includes(med.id);
            return (
              <article
                key={med.id}
                draggable={canDrag}
                onDragStart={() => setDragId(med.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  if (!canDrag) return;
                  e.preventDefault();
                  setOverId(med.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(med.id);
                }}
                className={cn(
                  "anim-rise panel relative flex flex-col overflow-hidden",
                  dragId === med.id && "opacity-40",
                  overId === med.id && dragId !== med.id && "border-pine-500 ring-2 ring-pine-300",
                  isSel && "border-amber-500 ring-2 ring-amber-300",
                  !plan?.active && "opacity-70",
                )}
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms`, borderTopWidth: 5, borderTopColor: hue }}
              >
                <div className="flex items-start gap-3 p-4">
                  {bulk ? (
                    <button
                      type="button"
                      onClick={() => toggleSelect(med.id)}
                      aria-label={`选择 ${med.name}`}
                      aria-pressed={isSel}
                      className="press mt-1 shrink-0 text-pine-700"
                    >
                      {isSel ? <CheckSquare className="size-7" /> : <Square className="size-7 text-ink-soft" />}
                    </button>
                  ) : canDrag ? (
                    <span className="mt-1 shrink-0 cursor-grab text-ink-soft active:cursor-grabbing" aria-hidden="true">
                      <GripVertical className="size-6" />
                    </span>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setMedId(med.id)}
                    className="press h-[62px] w-[84px] shrink-0 overflow-hidden rounded-xl border border-line bg-pine-100"
                    aria-label={`查看 ${med.name} 详情`}
                  >
                    <MedArt med={med} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="min-w-0 flex-1 text-lg font-extrabold leading-snug text-ink">{med.name}</h3>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white"
                        style={{ background: hue }}
                      >
                        {med.category}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-soft">
                      {[med.alias, med.spec, med.form].filter(Boolean).join(" · ") || "未填写规格"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plan?.times.length ? (
                        [...plan.times]
                          .sort((a, b) => a.localeCompare(b))
                          .map((t) => (
                            <span
                              key={t}
                              className="num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold"
                              style={{ background: SLOT_META[slotOf(t)].soft, color: SLOT_META[slotOf(t)].hue }}
                            >
                              <PillGlyph size={14} color={SLOT_META[slotOf(t)].hue} />
                              {t}
                            </span>
                          ))
                      ) : (
                        <span className="text-xs text-ink-soft">无计划</span>
                      )}
                      {plan && !plan.active ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-ink-soft">已停用</span>
                      ) : null}
                      {med.source === "sample" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600">示例</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="px-4">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={cn("flex items-center gap-1.5", low ? "text-vermil-600" : "text-ink-soft")}>
                      <Package className="size-4" />
                      余量 <span className="num text-base text-ink">{med.stock}</span> {plan?.unit ?? "片"}
                    </span>
                    {low ? (
                      <span className="flex items-center gap-1 rounded-full bg-vermil-500 px-2 py-0.5 text-white">
                        <TriangleAlert className="size-3" />
                        需配药
                      </span>
                    ) : (
                      <span className="text-ink-soft">低于 {med.lowStock} 时提醒</span>
                    )}
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${ratio * 100}%`, background: low ? "var(--vermil-500)" : ratio < 0.5 ? "var(--amber-500)" : "var(--lime-500)" }}
                    />
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2 p-4">
                  <BigButton tone="soft" size="sm" className="flex-1" onClick={() => setMedId(med.id)}>
                    <Pencil className="size-4" />
                    详情 / 编辑
                  </BigButton>
                  <IconButton
                    label={`为 ${med.name} 补货 10`}
                    onClick={() => {
                      restock(med.id, 10);
                      sound("tap", data.settings.sound, data.settings.voiceVolume);
                      toast.success(`${med.name} 已补货 10`, { description: `现有 ${med.stock + 10} ${plan?.unit ?? "片"}` });
                    }}
                  >
                    <PackagePlus className="size-5" />
                  </IconButton>
                  {sort === "custom" && !bulk ? (
                    <>
                      <IconButton label="上移" disabled={i === 0} onClick={() => moveMed(med.id, -1)}>
                        <ArrowUp className="size-5" />
                      </IconButton>
                      <IconButton label="下移" disabled={i === list.length - 1} onClick={() => moveMed(med.id, 1)}>
                        <ArrowDown className="size-5" />
                      </IconButton>
                    </>
                  ) : null}
                  <IconButton
                    label={`删除 ${med.name}`}
                    className="border-vermil-300 bg-vermil-100 text-vermil-600"
                    onClick={() => {
                      deleteMed(med.id);
                      sound("warn", data.settings.sound, data.settings.voiceVolume);
                    }}
                  >
                    <Trash2 className="size-5" />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<Package className="size-9" />}
          title={data.meds.length ? "没有符合条件的药品" : "药箱还是空的"}
          desc={
            data.meds.length
              ? "换个关键词或筛选条件试试，也可以清空筛选查看全部药品。"
              : "拍一张药盒照片就能自动生成用药计划，也可以手动填写。"
          }
          action={
            data.meds.length ? (
              <BigButton
                tone="soft"
                size="lg"
                full
                onClick={() => {
                  setQuery("");
                  setCategory("全部");
                  setOnlyLow(false);
                }}
              >
                清空筛选
              </BigButton>
            ) : (
              <BigButton tone="pine" size="lg" full onClick={() => navigate("/add")}>
                <PackagePlus className="size-6" />
                添加第一个药品
              </BigButton>
            )
          }
        />
      )}

      <MedSheet medId={medId} onClose={() => setMedId(null)} />
    </div>
  );
}