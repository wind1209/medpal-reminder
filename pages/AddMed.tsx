import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Keyboard,
  Loader2,
  RefreshCw,
  ScanLine,
  Sparkles,
  TriangleAlert,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "@/lib/router";
import { addMed, useApp } from "@/lib/store";
import { checkHealth, describeError, type HealthPayload } from "@/lib/api";
import { SAMPLE_BOXES, fileToDataUrl, manualOutcome, recognize, sampleOutcome, type OcrOutcome } from "@/lib/ocr";
import { guessCategory, parseUsage } from "@/lib/parse";
import { FOOD_LABEL, SLOT_META, type Medication } from "@/lib/types";
import { slotOf, todayKey } from "@/lib/time";
import { sound, speak } from "@/lib/voice";
import { BigButton, Chip, MedArt, PillGlyph, SectionTitle } from "@/components/bits";
import { PageHead } from "@/components/Shell";
import { MedFields, PlanFields, emptyMedDraft, emptyPlanDraft, type MedDraft, type PlanDraft } from "@/components/MedForm";

const STEPS = ["拍药盒", "核对信息", "定计划", "完成"];

export function AddMed() {
  const { settings } = useApp();
  const { navigate } = useRouter();
  const [step, setStep] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OcrOutcome | null>(null);
  const [med, setMed] = useState<MedDraft>(emptyMedDraft);
  const [plan, setPlan] = useState<PlanDraft>(emptyPlanDraft);
  const [matched, setMatched] = useState<string[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [created, setCreated] = useState<Medication | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkHealth().then(setHealth);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOn]);

  const releaseCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("这个浏览器不支持直接调用摄像头，请改用「从相册选择」。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError("没有拿到摄像头权限。可以改用「从相册选择」，或直接手动填写。");
    }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("摄像头还没准备好，请稍候再拍。");
      return;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("浏览器不支持拍照处理，请改用「从相册选择」。");
      releaseCamera();
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.88);
    releaseCamera();
    void runRecognize(url);
  };

  const applyOutcome = (o: OcrOutcome, source: MedDraft["source"], art = "") => {
    setOutcome(o);
    const base = emptyMedDraft();
    setMed({
      ...base,
      name: o.draft.name,
      spec: o.draft.spec,
      usageText: o.draft.usageText,
      form: o.draft.form,
      category: o.draft.name ? guessCategory(o.draft.name) : o.draft.category,
      art,
      source,
    });
    const usage = parseUsage(o.draft.usageText);
    setPlan({ ...emptyPlanDraft(), perDose: usage.perDose, unit: usage.unit, times: usage.times, food: usage.food });
    setMatched(usage.matched);
    setStep(1);
  };

  const runRecognize = async (dataUrl: string) => {
    setBusy(true);
    setError(null);
    setImage(dataUrl);
    sound("tap", settings.sound, settings.voiceVolume);
    const h = await checkHealth();
    setHealth(h);
    if (!h?.ocr) {
      const o = manualOutcome();
      applyOutcome(o, "manual");
      toast("识别服务未配置", {
        description: "已切换到手动填写：照着药盒输入药名和用法，一样能生成计划。",
        duration: 6000,
      });
      setBusy(false);
      return;
    }
    try {
      const o = await recognize(dataUrl);
      applyOutcome(o, "ocr");
      sound("done", settings.sound, settings.voiceVolume);
      toast.success("药盒识别完成", { description: o.note });
    } catch (e) {
      const msg = describeError(e);
      setError(msg);
      applyOutcome(manualOutcome(), "manual");
      toast.error(`识别失败：${msg}`, { description: "可以重拍，或直接手动填写药品信息。", duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件（jpg / png）。");
      return;
    }
    setBusy(true);
    try {
      const url = await fileToDataUrl(file);
      await runRecognize(url);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const useSample = (id: string) => {
    const box = SAMPLE_BOXES.find((b) => b.id === id);
    if (!box) return;
    setImage(box.image);
    const o = sampleOutcome(id);
    applyOutcome(o, "sample", box.image);
    sound("done", settings.sound, settings.voiceVolume);
    toast("已载入示例药盒", { description: o.note, duration: 5000 });
  };

  const goManual = () => {
    setImage(null);
    applyOutcome(manualOutcome(), "manual");
  };

  const toPlanStep = () => {
    if (!med.name.trim()) {
      setError("请先填写药品名称，再生成计划。");
      toast.error("请填写药品名称");
      return;
    }
    setError(null);
    const usage = parseUsage(med.usageText);
    setPlan((p) => ({
      ...p,
      perDose: usage.perDose,
      unit: usage.unit,
      times: usage.times,
      food: usage.food,
      startDate: todayKey(),
    }));
    setMatched(usage.matched);
    setMed((m) => ({ ...m, category: guessCategory(m.name) }));
    setStep(2);
  };

  const submit = () => {
    if (!med.name.trim()) {
      toast.error("请填写药品名称");
      setStep(1);
      return;
    }
    if (!plan.times.length) {
      toast.error("请至少设置一个服药时间");
      return;
    }
    const { med: newMed } = addMed({ ...med, name: med.name.trim() }, plan);
    setCreated(newMed);
    setStep(3);
    sound("done", settings.sound, settings.voiceVolume);
    speak(
      `已添加${newMed.name}，每天${plan.times.length}次，每次${plan.perDose}${plan.unit}。`,
      { enabled: settings.voice, rate: settings.voiceRate, volume: settings.voiceVolume },
    );
    toast.success(`已生成用药计划：${newMed.name}`, {
      description: `每天 ${plan.times.length} 次 · 每次 ${plan.perDose} ${plan.unit} · ${plan.times.join(" / ")}`,
      duration: 6000,
    });
  };

  const restart = () => {
    setStep(0);
    setImage(null);
    setOutcome(null);
    setMed(emptyMedDraft());
    setPlan(emptyPlanDraft());
    setMatched([]);
    setError(null);
    setCreated(null);
  };

  const previewMed = { ...med, name: med.name || "待填写药名", category: med.category, spec: med.spec, art: med.art };

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="拍照识别 → 生成计划"
        title="添加药品"
        desc="对准药盒拍一张，自动读出药名、规格和用法用量；识别不准可以直接改，也可以全程手动填写。"
        right={
          step > 0 && step < 3 ? (
            <BigButton tone="ghost" size="md" onClick={restart}>
              <RefreshCw className="size-5" />
              重新开始
            </BigButton>
          ) : null
        }
      />

      {/* 步骤条 */}
      <ol className="panel anim-rise flex items-center gap-1 overflow-x-auto p-3">
        {STEPS.map((label, i) => (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              disabled={i > step || step === 3}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "press flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-lg)] px-3 text-left",
                i === step ? "bg-pine-700 text-[var(--site-on-accent)]" : i < step ? "bg-pine-100 text-pine-900" : "text-ink-soft",
              )}
            >
              <span
                className={cn(
                  "num flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
                  i === step ? "bg-[var(--surface)] text-pine-700" : i < step ? "bg-lime-500 text-white" : "bg-line text-ink-soft",
                )}
              >
                {i < step ? <Check className="size-4" strokeWidth={4} /> : i + 1}
              </span>
              <span className="truncate text-sm font-extrabold">{label}</span>
            </button>
            {i < STEPS.length - 1 ? <ArrowRight className="size-4 shrink-0 text-ink-soft" /> : null}
          </li>
        ))}
      </ol>

      {error ? (
        <div className="anim-rise flex items-start gap-3 rounded-[var(--radius-lg)] border-2 border-vermil-300 bg-vermil-100 p-4">
          <TriangleAlert className="mt-0.5 size-6 shrink-0 text-vermil-600" />
          <p className="flex-1 text-sm font-bold leading-relaxed text-ink">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="关闭提示" className="press text-ink-soft">
            <X className="size-5" />
          </button>
        </div>
      ) : null}

      {/* 第 1 步：拍药盒 */}
      {step === 0 ? (
        <div className="space-y-5">
          {cameraOn ? (
            <div className="panel-raised anim-pop overflow-hidden">
              <div className="relative aspect-[4/3] bg-pine-900">
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-white/70" />
                <p className="absolute inset-x-0 bottom-3 text-center text-sm font-bold text-white drop-shadow">
                  把药盒正面放进框里，光线充足更准确
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <BigButton tone="outline" size="lg" onClick={releaseCamera}>
                  <X className="size-6" />
                  取消
                </BigButton>
                <BigButton tone="pine" size="lg" onClick={shoot}>
                  <Camera className="size-6" />
                  拍照识别
                </BigButton>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={startCamera}
                className="press panel-raised anim-rise flex flex-col items-center gap-3 p-6 text-center hover:border-pine-500"
              >
                <span className="flex size-20 items-center justify-center rounded-3xl bg-pine-700 text-[var(--site-on-accent)]">
                  <Video className="size-10" />
                </span>
                <span className="text-lg font-extrabold text-ink">打开摄像头</span>
                <span className="text-sm leading-relaxed text-ink-soft">直接对着药盒拍照，识别药名与用法</span>
              </button>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="press panel-raised anim-rise stagger-1 flex flex-col items-center gap-3 p-6 text-center hover:border-amber-500"
              >
                <span className="flex size-20 items-center justify-center rounded-3xl bg-amber-500 text-[#2a1a02]">
                  <ImagePlus className="size-10" />
                </span>
                <span className="text-lg font-extrabold text-ink">从相册选择</span>
                <span className="text-sm leading-relaxed text-ink-soft">已经拍好的药盒照片也可以</span>
              </button>

              <button
                type="button"
                onClick={goManual}
                className="press panel-raised anim-rise stagger-2 flex flex-col items-center gap-3 p-6 text-center hover:border-azure-500"
              >
                <span className="flex size-20 items-center justify-center rounded-3xl bg-azure-500 text-white">
                  <Keyboard className="size-10" />
                </span>
                <span className="text-lg font-extrabold text-ink">手动填写</span>
                <span className="text-sm leading-relaxed text-ink-soft">照着药盒输入，不需要识别服务</span>
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {busy ? (
            <div className="panel-raised overflow-hidden">
              <div className="relative aspect-[3/2] bg-pine-100">
                {image ? <img src={image} alt="待识别的药盒" className="h-full w-full object-contain" /> : null}
                <span
                  className="pointer-events-none absolute inset-x-0 h-1 bg-lime-500 shadow-[0_0_18px_var(--lime-500)]"
                  style={{ animation: "scanline calc(1600ms * var(--site-motion)) ease-in-out infinite" }}
                />
              </div>
              <p className="flex items-center justify-center gap-2 p-4 text-base font-extrabold text-pine-700">
                <Loader2 className="size-6 animate-spin" />
                正在识别药盒文字…
              </p>
            </div>
          ) : null}

          <div className="panel anim-rise p-5">
            <SectionTitle
              icon={<ScanLine className="size-5" />}
              title="没有药盒在手边？先用示例药盒走一遍"
              desc="下面三张是预置的示例药盒图片，识别结果为示例文本，用来体验完整流程。"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {SAMPLE_BOXES.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => useSample(b.id)}
                  className="press overflow-hidden rounded-[var(--radius-lg)] border-2 border-line bg-surface text-left hover:border-pine-500"
                >
                  <img src={b.image} alt={`${b.label} 示例药盒`} className="aspect-[3/2] w-full object-cover" />
                  <span className="block p-3">
                    <span className="block truncate text-base font-extrabold text-ink">{b.label}</span>
                    <span className="block text-xs font-semibold text-ink-soft">{b.hint} · 示例</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {health === null
                ? "正在检测识别服务…"
                : health.ocr
                  ? "阿里云文字识别已配置，真实照片会调用云端识别。"
                  : "当前未配置阿里云识别密钥：真实照片会转为手动填写，示例药盒仍可完整体验流程。"}
            </p>
          </div>
        </div>
      ) : null}

      {/* 第 2 步：核对信息 */}
      {step === 1 ? (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="panel-raised overflow-hidden">
              <div className="relative aspect-[3/2] bg-pine-100">
                {image ? (
                  <img src={image} alt="药盒照片" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-soft">
                    <Keyboard className="size-10" />
                    <span className="text-sm font-bold">手动填写模式</span>
                  </div>
                )}
                {outcome?.provider === "sample" ? (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-3 py-1 text-xs font-extrabold text-[#2a1a02]">
                    示例药盒
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 p-4">
                <p className="text-sm font-bold text-ink">
                  {outcome?.provider === "aliyun"
                    ? "阿里云文字识别结果"
                    : outcome?.provider === "sample"
                      ? "示例识别文本"
                      : "手动填写"}
                </p>
                <p className="text-xs leading-relaxed text-ink-soft">{outcome?.note}</p>
                {image && outcome?.provider !== "sample" ? (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <BigButton tone="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <ImagePlus className="size-4" />
                      换一张
                    </BigButton>
                    <BigButton tone="soft" size="sm" onClick={() => void runRecognize(image)}>
                      <RefreshCw className="size-4" />
                      重识别
                    </BigButton>
                  </div>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {outcome?.lines.length ? (
              <div className="panel p-4">
                <p className="mb-2 text-sm font-extrabold text-ink">识别到的原始文字</p>
                <ul className="max-h-[240px] space-y-1 overflow-y-auto pr-1">
                  {outcome.lines.map((l, i) => (
                    <li key={`${l}-${i}`} className="rounded-lg bg-pine-100 px-3 py-1.5 text-sm text-pine-900">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="panel-raised p-5">
            <SectionTitle title="核对药品信息" desc="识别可能有误，请照着药盒确认后再继续。" />
            <MedFields value={med} onChange={(p) => setMed({ ...med, ...p })} />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <BigButton tone="outline" size="lg" onClick={() => setStep(0)}>
                <ArrowLeft className="size-6" />
                上一步
              </BigButton>
              <BigButton tone="pine" size="lg" onClick={toPlanStep}>
                下一步：定计划
                <ArrowRight className="size-6" />
              </BigButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* 第 3 步：定计划 */}
      {step === 2 ? (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="panel-raised h-fit overflow-hidden lg:sticky lg:top-[100px]">
            <div className="h-[150px] bg-pine-100">
              <MedArt med={previewMed} />
            </div>
            <div className="space-y-2 p-4">
              <p className="text-lg font-extrabold leading-snug text-ink">{med.name}</p>
              <p className="text-sm text-ink-soft">{[med.alias, med.spec, med.category].filter(Boolean).join(" · ")}</p>
              {med.usageText ? (
                <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-600">
                  药盒用法：{med.usageText}
                </p>
              ) : null}
              {matched.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {matched.map((m) => (
                    <span key={m} className="rounded-full bg-lime-100 px-2.5 py-1 text-xs font-extrabold text-lime-600">
                      已识别 {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-ink-soft">
                  未从用法文字中识别出次数与剂量，已给出默认计划，请按医嘱调整。
                </p>
              )}
              <div className="rounded-xl border border-line bg-surface p-3">
                <p className="text-xs font-bold text-ink-soft">计划预览</p>
                <p className="num mt-1 text-base font-extrabold text-ink">
                  每天 {plan.times.length} 次 · 每次 {plan.perDose} {plan.unit}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.times.map((t) => (
                    <span
                      key={t}
                      className="num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold"
                      style={{ background: SLOT_META[slotOf(t)].soft, color: SLOT_META[slotOf(t)].hue }}
                    >
                      <PillGlyph size={16} color={SLOT_META[slotOf(t)].hue} />
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold text-ink-soft">{FOOD_LABEL[plan.food]}</p>
              </div>
            </div>
          </div>

          <div className="panel-raised p-5">
            <SectionTitle
              icon={<Sparkles className="size-5" />}
              title="设置用药计划"
              desc="已按药盒用法自动填充，请对照医生嘱咐确认时间与剂量。"
            />
            <PlanFields value={plan} onChange={(p) => setPlan({ ...plan, ...p })} />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <BigButton tone="outline" size="lg" onClick={() => setStep(1)}>
                <ArrowLeft className="size-6" />
                上一步
              </BigButton>
              <BigButton tone="pine" size="lg" onClick={submit}>
                <Check className="size-6" strokeWidth={3} />
                生成计划
              </BigButton>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              剂量与时间请以医生处方为准。本应用仅做提醒记录，不能替代医生诊断和药师指导。
            </p>
          </div>
        </div>
      ) : null}

      {/* 第 4 步：完成 */}
      {step === 3 && created ? (
        <div className="panel-raised anim-pop mx-auto max-w-2xl overflow-hidden">
          <div className="flex items-center gap-4 bg-[linear-gradient(120deg,var(--lime-500),var(--pine-500))] px-6 py-6 text-white">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-white/20">
              <Check className="size-9" strokeWidth={3} />
            </span>
            <div>
              <p className="text-sm font-bold opacity-90">用药计划已生成</p>
              <p className="text-2xl font-extrabold leading-tight">{created.name}</p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-lg)] bg-pine-100 p-4">
                <p className="text-xs font-bold text-ink-soft">每天次数</p>
                <p className="num text-2xl font-extrabold text-ink">{plan.times.length} 次</p>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-amber-100 p-4">
                <p className="text-xs font-bold text-ink-soft">每次用量</p>
                <p className="num text-2xl font-extrabold text-ink">
                  {plan.perDose} {plan.unit}
                </p>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-azure-100 p-4">
                <p className="text-xs font-bold text-ink-soft">提醒方式</p>
                <p className="text-base font-extrabold text-ink">{plan.remind ? "到点提醒已开" : "仅记录不提醒"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {plan.times.map((t) => (
                <Chip key={t} selected hue={SLOT_META[slotOf(t)].hue}>
                  <span className="num">{t}</span>
                </Chip>
              ))}
            </div>
            {created.source === "sample" ? (
              <p className="rounded-[var(--radius-lg)] border border-amber-300 bg-amber-100 p-3 text-sm font-semibold leading-relaxed text-ink">
                这是用示例药盒生成的示例药品，可在「设置 → 数据管理」里一键清除。
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <BigButton tone="pine" size="xl" onClick={() => navigate("/")}>
                <Check className="size-7" />
                去看今日任务
              </BigButton>
              <BigButton tone="outline" size="xl" onClick={restart}>
                <Camera className="size-7" />
                再加一个药
              </BigButton>
            </div>
          </div>
        </div>
      ) : null}

      {step === 1 || step === 2 ? (
        <p className="text-center text-xs text-ink-soft">
          识别结果仅供参考，最终用法用量请以医生处方和药品说明书为准。
        </p>
      ) : null}

    </div>
  );
}