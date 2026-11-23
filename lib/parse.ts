import type { DoseUnit, FoodRelation, MedCategory } from "./types";

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "0": 0,
};

function num(token: string): number | null {
  if (!token) return null;
  const direct = Number(token);
  if (Number.isFinite(direct)) return direct;
  if (token === "十") return 10;
  if (token.length === 2 && token[0] === "十") return 10 + (CN_NUM[token[1]] ?? 0);
  if (token.length === 2 && token[1] === "十") return (CN_NUM[token[0]] ?? 0) * 10;
  if (token.length === 3 && token[1] === "十")
    return (CN_NUM[token[0]] ?? 0) * 10 + (CN_NUM[token[2]] ?? 0);
  return CN_NUM[token] ?? null;
}

const NUM_RE = "([0-9]+(?:\\.[0-9]+)?|[一二两三四五六七八九十]{1,3})";

export interface UsageDraft {
  timesPerDay: number;
  perDose: number;
  unit: DoseUnit;
  times: string[];
  food: FoodRelation;
  matched: string[];
}

export function defaultTimes(n: number, bedtime = false): string[] {
  if (bedtime && n === 1) return ["21:30"];
  const table: Record<number, string[]> = {
    1: ["08:00"],
    2: ["08:00", "18:30"],
    3: ["08:00", "12:30", "18:30"],
    4: ["08:00", "12:00", "17:00", "21:30"],
    5: ["07:30", "11:00", "14:30", "18:00", "21:30"],
    6: ["07:00", "10:00", "13:00", "16:00", "19:00", "22:00"],
  };
  return [...(table[n] ?? table[3])];
}

export function parseUsage(text: string): UsageDraft {
  const raw = text.replace(/\s+/g, "");
  const matched: string[] = [];

  let timesPerDay = 1;
  const perDay =
    raw.match(new RegExp(`(?:每日|每天|一日|一天|日服|每日分|qd|bid|tid|qid)?(?:每日|每天|一日|一天)${NUM_RE}次`, "i")) ??
    raw.match(new RegExp(`(?:分|分作)${NUM_RE}次`, "i"));
  if (perDay) {
    const n = num(perDay[1]);
    if (n && n >= 1 && n <= 6) {
      timesPerDay = n;
      matched.push(`每日${n}次`);
    }
  } else if (/tid/i.test(raw)) {
    timesPerDay = 3;
    matched.push("tid");
  } else if (/bid/i.test(raw)) {
    timesPerDay = 2;
    matched.push("bid");
  } else if (/qid/i.test(raw)) {
    timesPerDay = 4;
    matched.push("qid");
  } else if (/qd/i.test(raw)) {
    timesPerDay = 1;
    matched.push("qd");
  } else if (/隔日一次|每两日一次/.test(raw)) {
    timesPerDay = 1;
    matched.push("隔日一次");
  }

  let perDose = 1;
  let unit: DoseUnit = "片";
  const perTime = raw.match(new RegExp(`(?:每次|一次|每回|单次)${NUM_RE}(片|粒|袋|毫升|ml|滴|丸|支|单位|iu)`, "i"));
  if (perTime) {
    const n = num(perTime[1]);
    if (n && n > 0 && n <= 20) {
      perDose = n;
      matched.push(`每次${n}${perTime[2]}`);
    }
    const u = perTime[2].toLowerCase();
    unit = u === "粒" || u === "丸" ? "粒" : u === "袋" ? "袋" : u === "毫升" || u === "ml" ? "毫升" : u === "滴" ? "滴" : "片";
  } else if (/半片/.test(raw)) {
    perDose = 0.5;
    matched.push("半片");
  } else {
    const doseOnly = raw.match(new RegExp(`${NUM_RE}(片|粒|袋|毫升|ml|滴)`, "i"));
    if (doseOnly) {
      const n = num(doseOnly[1]);
      if (n && n > 0 && n <= 20) {
        perDose = n;
        unit = /粒/.test(doseOnly[2]) ? "粒" : /袋/.test(doseOnly[2]) ? "袋" : /毫升|ml/i.test(doseOnly[2]) ? "毫升" : /滴/.test(doseOnly[2]) ? "滴" : "片";
        matched.push(`${n}${doseOnly[2]}`);
      }
    }
  }

  let food: FoodRelation = "any";
  if (/餐前|饭前|空腹/.test(raw)) {
    food = "before";
    matched.push("餐前");
  } else if (/随餐|餐中|与食物同服|进餐时|第一口饭/.test(raw)) {
    food = "with";
    matched.push("随餐");
  } else if (/餐后|饭后|餐后立即/.test(raw)) {
    food = "after";
    matched.push("餐后");
  }

  const bedtime = /睡前|临睡|夜晚|晚间/.test(raw);
  if (bedtime) matched.push("睡前");
  const times = defaultTimes(timesPerDay, bedtime);
  if (/早晨|早上|晨起|清晨/.test(raw) && times.length) {
    times[0] = "08:00";
    matched.push("早晨");
  }

  return { timesPerDay, perDose, unit, times, food, matched };
}

const NOISE = /用法|用量|规格|批准文号|国药准字|生产|企业|药业|制药|有限公司|地址|电话|有效期|产品批号|贮藏|包装|说明书|请仔细阅读|不良反应|禁忌|注意事项|成分|性状|适应症|适应症|贮藏|条形码|追溯码|mg|毫升/;
const USAGE_HINT = /每日|每天|一日|一次|每次|每回|单次|口服|睡前|临睡|餐前|餐后|随餐|饭前|饭后|空腹|服用|服法|嚼服|冲服|qd|bid|tid|qid/i;
const PACK_LINE = /^\d+\s*(片|粒|袋|支|丸|瓶|盒|板|枚)/;
const FORM_END = /(片|胶囊|颗粒|口服液|丸|散|糖浆|混悬液|滴剂|喷雾剂|软膏|乳膏|凝胶|贴|栓|注射液|注射用)$/;
const FORM_ANY = /片|胶囊|颗粒|口服液|分散片|缓释|控释|软胶囊|丸|糖浆|混悬液/;

function nameBase(line: string): string {
  return line
    .replace(/[（(][^）)]*[）)]\s*$/, "")
    .replace(/\s*\d+(?:\.\d+)?\s*(?:mg|g|毫克|克|μg|ug|微克|iu|单位)\s*$/i, "")
    .trim();
}

function nameScore(line: string): number {
  let score = 0;
  if (FORM_END.test(line)) score += 6;
  if (/[一-龥]{2,}/.test(line)) score += 3;
  if (USAGE_HINT.test(line)) score -= 12;
  if (PACK_LINE.test(line)) score -= 10;
  if (NOISE.test(line)) score -= 8;
  if (/^\d/.test(line)) score -= 4;
  if (/[×x*\/／]/.test(line)) score -= 3;
  if (line.length > 24) score -= 4;
  return score;
}

export interface OcrDraft {
  name: string;
  spec: string;
  usageText: string;
  form: string;
  category: MedCategory;
}

export function guessCategory(name: string): MedCategory {
  if (/地平|沙坦|普利|洛尔|降压|硝苯|氨氯|缬沙坦|厄贝沙坦/.test(name)) return "降压";
  if (/双胍|格列|胰岛素|降糖|阿卡波糖|西格列汀|达格列净/.test(name)) return "降糖";
  if (/他汀|降脂|贝特|依折麦布|血脂/.test(name)) return "降脂";
  if (/华法林|肝素|利伐沙班|阿哌沙班|氯吡格雷|阿司匹林/.test(name)) return "抗凝";
  return "其他";
}

export function parseOcr(lines: string[]): OcrDraft {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  const ranked = cleaned
    .filter((l) => FORM_ANY.test(l))
    .map((l) => nameBase(l))
    .filter(Boolean)
    .map((l) => ({ line: l, score: nameScore(l) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length);
  const name = (
    ranked[0]?.line ??
    cleaned.find((l) => l.length >= 4 && !NOISE.test(l) && !USAGE_HINT.test(l) && !PACK_LINE.test(l)) ??
    ""
  ).slice(0, 40);

  const specLine =
    cleaned.find((l) => /\d+(?:\.\d+)?\s*(?:mg|g|毫克|克|μg|ug|微克|IU|单位)/i.test(l) && /片|粒|袋|支|×|x|\*/i.test(l)) ??
    cleaned.find((l) => /\d+(?:\.\d+)?\s*(?:mg|g|毫克|克)/i.test(l)) ??
    "";
  const specMatch = specLine.match(/(\d+(?:\.\d+)?\s*(?:mg|g|毫克|克|μg|ug|微克))/i);
  const packLine = cleaned.find((l) => PACK_LINE.test(l) || /[×x*]\s*\d+\s*(片|粒|袋|支)/i.test(l)) ?? "";
  const countMatch =
    specLine.match(/[×x*]\s*(\d+)\s*(片|粒|袋|支)/i) ??
    packLine.match(/[×x*]\s*(\d+)\s*(片|粒|袋|支)/i) ??
    packLine.match(/(\d+)\s*(片|粒|袋|支)/);
  const spec = specMatch
    ? `${specMatch[1].replace(/\s+/g, "")}${countMatch ? ` × ${countMatch[1]}${countMatch[2]}` : ""}`
    : specLine.slice(0, 30);

  const usageLine =
    cleaned.find((l) => USAGE_HINT.test(l) && l.length > 5) ?? "";
  const usageText = usageLine.replace(/^用法用量[:：]?/, "").slice(0, 80);

  const form = /胶囊/.test(name) ? "胶囊" : /颗粒/.test(name) ? "颗粒" : /口服液/.test(name) ? "口服液" : "片剂";

  return { name, spec, usageText, form, category: guessCategory(name) };
}

export function normalizeName(input: string): string {
  return input.replace(/\s+/g, "").slice(0, 40);
}