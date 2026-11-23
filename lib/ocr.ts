import { ApiError, requestJson } from "./api";
import { guessCategory, parseOcr, type OcrDraft } from "./parse";

export interface OcrOutcome {
  draft: OcrDraft;
  lines: string[];
  provider: "aliyun" | "sample" | "manual";
  note: string;
}

export const SAMPLE_BOXES = [
  {
    id: "amlodipine",
    label: "苯磺酸氨氯地平片",
    hint: "降压 · 5mg",
    image: "/boxes/amlodipine.svg",
    lines: [
      "处方药 · 心血管",
      "苯磺酸氨氯地平片",
      "Amlodipine Besylate Tablets",
      "5mg",
      "7 片 / 盒",
      "每日 1 次，每次 1 片，口服",
      "不受进食影响",
    ],
  },
  {
    id: "metformin",
    label: "盐酸二甲双胍片",
    hint: "降糖 · 0.5g",
    image: "/boxes/metformin.svg",
    lines: [
      "处方药 · 内分泌",
      "盐酸二甲双胍片",
      "Metformin Hydrochloride Tablets",
      "0.5g",
      "20 片 / 盒",
      "每日 3 次，每次 1 片，餐中或餐后服用",
    ],
  },
  {
    id: "atorvastatin",
    label: "阿托伐他汀钙片",
    hint: "降脂 · 20mg",
    image: "/boxes/atorvastatin.svg",
    lines: [
      "处方药 · 调血脂",
      "阿托伐他汀钙片",
      "Atorvastatin Calcium Tablets",
      "20mg",
      "7 片 / 盒",
      "每日 1 次，每次 1 片，睡前口服",
    ],
  },
] as const;

export function sampleOutcome(id: string): OcrOutcome {
  const box = SAMPLE_BOXES.find((b) => b.id === id) ?? SAMPLE_BOXES[0];
  const draft = parseOcr([...box.lines]);
  return {
    draft: { ...draft, category: guessCategory(draft.name) },
    lines: [...box.lines],
    provider: "sample",
    note: "这是预置的示例药盒图片，识别结果为示例文本，可直接修改。",
  };
}

export async function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("这张图片无法读取，请换一张试试。"));
      el.src = bitmapUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持图片处理，请手动填写药品信息。");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export async function recognize(dataUrl: string): Promise<OcrOutcome> {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  if (base64.length > 6_500_000) throw new ApiError("too_large", "图片太大了，请靠近药盒重拍一张。");
  const payload = await requestJson<{
    ok: true;
    lines: string[];
    provider: string;
  }>("/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 }),
  });
  const lines = Array.isArray(payload.lines) ? payload.lines.filter((l) => typeof l === "string") : [];
  if (!lines.length) throw new ApiError("upstream_error", "没有识别到文字，请手动填写或重拍。");
  const draft = parseOcr(lines);
  return {
    draft,
    lines,
    provider: "aliyun",
    note: draft.name ? "已识别药盒文字，请核对后再生成计划。" : "识别到文字但未能确定药名，请手动填写。",
  };
}

export function manualOutcome(): OcrOutcome {
  return {
    draft: { name: "", spec: "", usageText: "", form: "片剂", category: "其他" },
    lines: [],
    provider: "manual",
    note: "未配置阿里云识别服务，请照着药盒手动填写；填写后仍可自动生成用药计划。",
  };
}