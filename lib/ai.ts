import { checkHealth, streamChat } from "./api";
import { answerOffline, profilesForNames } from "./knowledge";
import type { ChatMessage, Medication } from "./types";

export interface AskResult {
  text: string;
  engine: ChatMessage["engine"];
  notice: string;
}

const SYSTEM_PROMPT = `你是「慢病用药提醒助手」的用药问答助手，服务对象是中国大陆的老年慢性病患者（高血压、2型糖尿病、血脂异常）及其家属。

规则：
1. 用简体中文回答，语气温和、句子短、避免专业术语堆砌；必要术语后用括号解释。
2. 结构清晰：先给结论，再给要点，最后给注意事项。可用「## 小标题」和「- 要点」组织。
3. 绝不给出个体化诊断，绝不擅自建议增减剂量或停药；涉及剂量调整一律引导咨询医生。
4. 每次回答末尾必须提醒：本回答仅供参考，不能替代医生诊断和药师指导。
5. 出现胸痛、晕厥、意识模糊、呼吸困难、严重低血糖、酱油色尿等危险信号时，第一句就建议立即就医或拨打120。
6. 不确定的内容明确说不确定，不要编造药品说明书内容、批准文号或研究数据。
7. 回答控制在 400 字以内，方便老人阅读。`;

export async function ask(
  question: string,
  history: ChatMessage[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  meds: Medication[] = [],
): Promise<AskResult> {
  const health = await checkHealth();
  const trimmed = history
    .filter((m) => !m.pending && m.text.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.text }));
  const cabinet = profilesForNames(meds.map((m) => m.name));
  const cabinetLine = meds.length
    ? `\n\n用户药箱（${meds.length} 种）：${meds
        .map((m) => `${m.name}${m.alias ? `（${m.alias}）` : ""} · ${m.category}`)
        .join("；")}。请优先结合这些药回答，不要假设用户还在服用其他药物。`
    : "\n\n用户药箱为空，不要假设用户正在服用某种具体药物。";

  if (health?.ai) {
    try {
      const text = await streamChat(
        [
          { role: "system", content: SYSTEM_PROMPT + cabinetLine },
          ...trimmed,
          { role: "user", content: question },
        ],
        onDelta,
        signal,
      );
      return { text, engine: "qwen", notice: "" };
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      const offline = answerOffline(question, cabinet);
      return {
        text: offline.text,
        engine: offline.engine,
        notice: "通义千问暂时不可用，已切换为离线知识库回答。",
      };
    }
  }

  const offline = answerOffline(question, cabinet);
  return {
    text: offline.text,
    engine: offline.engine,
    notice: health ? "尚未配置百炼 API Key，当前使用离线知识库回答。" : "",
  };
}

export function engineLabel(engine: ChatMessage["engine"]): string {
  if (engine === "qwen") return "通义千问";
  if (engine === "safety") return "安全提示";
  return "离线知识库";
}