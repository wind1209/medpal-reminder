import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Loader2,
  MessageCircle,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Stethoscope,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clearChat, getState, pushChat, useApp } from "@/lib/store";
import { ask, engineLabel } from "@/lib/ai";
import { checkHealth, type HealthPayload } from "@/lib/api";
import { SUGGESTIONS } from "@/lib/knowledge";
import { uid } from "@/lib/time";
import { sound, speak, stopSpeech } from "@/lib/voice";
import type { ChatMessage } from "@/lib/types";
import { BigButton, Chip, SectionTitle } from "@/components/bits";
import { PageHead } from "@/components/Shell";
import { RichText } from "@/components/RichText";

function plain(text: string) {
  return text
    .replace(/[#>*-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function Ask() {
  const data = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    checkHealth().then(setHealth);
    return () => {
      abortRef.current?.abort();
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data.chat.length, streamText, busy]);

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim();
    if (!q || busy) return;
    if (q.length > 400) {
      toast.error("问题太长了", { description: "请控制在 400 字以内，一次问一件事更容易得到清楚回答。" });
      return;
    }
    setInput("");
    stopSpeech();
    setSpeakingId(null);
    sound("tap", data.settings.sound, data.settings.voiceVolume);
    const history = getState().chat;
    pushChat({ id: uid("msg"), role: "user", text: q, at: new Date().toISOString(), engine: "offline" });
    setBusy(true);
    setStreamText("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await ask(q, history, (chunk) => setStreamText((s) => s + chunk), ctrl.signal, getState().meds);
      pushChat({
        id: uid("msg"),
        role: "assistant",
        text: res.text,
        at: new Date().toISOString(),
        engine: res.engine,
      });
      if (res.notice) toast(res.notice, { duration: 6000 });
      sound(res.engine === "safety" ? "warn" : "done", data.settings.sound, data.settings.voiceVolume);
      if (res.engine === "safety") {
        speak("您描述的情况可能需要立即就医，请尽快联系医生或拨打一二零。", {
          enabled: data.settings.voice,
          rate: data.settings.voiceRate,
          volume: data.settings.voiceVolume,
        });
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        toast("已停止回答");
      } else {
        pushChat({
          id: uid("msg"),
          role: "assistant",
          text: `## 暂时无法回答\n刚才的请求没有成功：${(e as Error)?.message ?? "未知错误"}。\n\n可以稍后再试，或换个说法重新提问。涉及身体不适请及时联系医生。`,
          at: new Date().toISOString(),
          engine: "offline",
        });
        toast.error("回答失败", { description: (e as Error)?.message ?? "请稍后再试" });
      }
    } finally {
      setBusy(false);
      setStreamText("");
      abortRef.current = null;
    }
  };

  const readAloud = (m: ChatMessage) => {
    if (!data.settings.voice) {
      toast("当前已静音", { description: "点右上角「已静音」按钮打开声音后即可朗读。" });
      return;
    }
    if (speakingId === m.id) {
      stopSpeech();
      setSpeakingId(null);
      return;
    }
    stopSpeech();
    setSpeakingId(m.id);
    speak(plain(m.text), { enabled: true, rate: data.settings.voiceRate, volume: data.settings.voiceVolume });
    window.setTimeout(() => setSpeakingId((cur) => (cur === m.id ? null : cur)), Math.min(60000, plain(m.text).length * 260));
  };

  const engineOnline = !!health?.ai;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="用药问答 Agent"
        title="问一问"
        desc="用大白话问就行，比如「氨氯地平能和降糖药一起吃吗」。回答会提示您咨询医生，不做诊断、不改剂量。"
        right={
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-extrabold",
              engineOnline ? "border-magenta-500 bg-magenta-100 text-magenta-500" : "border-azure-300 bg-azure-100 text-azure-600",
            )}
          >
            {engineOnline ? <Sparkles className="size-5" /> : <BookOpen className="size-5" />}
            {health === null ? "检测中…" : engineOnline ? `通义千问 · ${health.model}` : "离线知识库"}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="panel-raised flex min-h-[560px] flex-col overflow-hidden">
          {/* 对话区 */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" style={{ maxHeight: "62vh" }}>
            {!data.chat.length && !busy ? (
              <div className="anim-rise space-y-4">
                <div className="flex gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-magenta-100 text-magenta-500">
                    <Stethoscope className="size-6" />
                  </span>
                  <div className="panel max-w-[85%] p-4">
                    <p className="text-base font-extrabold text-ink">您好，我是用药问答助手。</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                      可以问我药能不能一起吃、饭前还是饭后吃、忘了吃药怎么办、药怎么保存。
                      我只提供用药常识参考，具体剂量和能否合用请以医生、药师的意见为准。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Chip key={s} onClick={() => void send(s)}>
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            {data.chat.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="anim-rise flex justify-end gap-3">
                  <div className="max-w-[85%] rounded-[var(--radius-xl)] rounded-tr-md bg-pine-700 px-4 py-3 text-base font-semibold leading-relaxed text-[var(--site-on-accent)]">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="anim-rise flex gap-3">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                      m.engine === "safety" ? "bg-vermil-100 text-vermil-600" : "bg-magenta-100 text-magenta-500",
                    )}
                  >
                    {m.engine === "safety" ? <ShieldAlert className="size-6" /> : <Stethoscope className="size-6" />}
                  </span>
                  <div className="min-w-0 max-w-[88%] flex-1">
                    <div
                      className={cn(
                        "panel p-4",
                        m.engine === "safety" && "border-vermil-500 bg-vermil-100/60",
                      )}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                            m.engine === "qwen" && "bg-magenta-100 text-magenta-500",
                            m.engine === "offline" && "bg-azure-100 text-azure-600",
                            m.engine === "safety" && "bg-vermil-500 text-white",
                          )}
                        >
                          {engineLabel(m.engine)}
                        </span>
                        {m.engine === "safety" ? (
                          <span className="text-xs font-extrabold text-vermil-600">建议立即就医 / 拨打 120</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => readAloud(m)}
                          className={cn(
                            "press ml-auto inline-flex min-h-[48px] items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold",
                            speakingId === m.id
                              ? "border-pine-500 bg-pine-100 text-pine-700"
                              : "border-line text-ink-soft hover:text-ink",
                          )}
                        >
                          {speakingId === m.id ? <Square className="size-3.5" /> : <Volume2 className="size-4" />}
                          {speakingId === m.id ? "停止朗读" : "朗读"}
                        </button>
                      </div>
                      <RichText text={m.text} />
                    </div>
                  </div>
                </div>
              ),
            )}

            {busy ? (
              <div className="flex gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-magenta-100 text-magenta-500">
                  <Loader2 className="size-6 animate-spin" />
                </span>
                <div className="panel min-w-0 max-w-[88%] flex-1 p-4">
                  {streamText ? (
                    <>
                      <RichText text={streamText} />
                      <span className="anim-caret ml-0.5 inline-block h-5 w-2 translate-y-0.5 bg-magenta-500" />
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-soft">
                      正在思考
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="size-2 rounded-full bg-magenta-500"
                            style={{ animation: `drift 1s ease-in-out ${i * 0.15}s infinite` }}
                          />
                        ))}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* 输入区 */}
          <div className="border-t border-line bg-[color-mix(in_srgb,var(--surface)_80%,var(--paper))] p-4">
            {data.chat.length ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {SUGGESTIONS.slice(0, 4).map((s) => (
                  <Chip key={s} disabled={busy} onClick={() => void send(s)} className="min-h-[48px] text-sm">
                    {s}
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={400}
                disabled={busy}
                aria-label="输入用药问题"
                placeholder="例如：氨氯地平能和降糖药一起吃吗？"
                className="max-h-[160px] min-h-[64px] flex-1 resize-y rounded-[var(--radius-lg)] border-2 border-line bg-surface px-4 py-3 text-base font-semibold leading-relaxed text-ink placeholder:font-normal placeholder:text-ink-soft/70 focus:border-pine-500 focus:outline-none"
              />
              {busy ? (
                <BigButton
                  tone="danger"
                  size="lg"
                  onClick={() => {
                    abortRef.current?.abort();
                    stopSpeech();
                  }}
                >
                  <Square className="size-5" />
                  停止
                </BigButton>
              ) : (
                <BigButton tone="pine" size="lg" disabled={!input.trim()} onClick={() => void send()}>
                  <Send className="size-6" />
                  发送
                </BigButton>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-ink-soft">Enter 发送 · Shift + Enter 换行 · {input.length}/400</p>
              {data.chat.length ? (
                <button
                  type="button"
                  onClick={() => {
                    clearChat();
                    stopSpeech();
                    setSpeakingId(null);
                    sound("undo", data.settings.sound, data.settings.voiceVolume);
                  }}
                  className="press inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-vermil-600"
                >
                  <Trash2 className="size-4" />
                  清空对话
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* 侧栏说明 */}
        <div className="space-y-4">
          <div className="panel anim-rise p-5">
            <SectionTitle icon={<MessageCircle className="size-5" />} title="可以这样问" />
            <ul className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send(s)}
                    className="press w-full rounded-[var(--radius-lg)] border border-line bg-surface px-3 py-2.5 text-left text-sm font-semibold leading-snug text-ink hover:border-pine-500 disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel anim-rise stagger-1 border-vermil-300 bg-vermil-100/60 p-5">
            <p className="flex items-center gap-2 text-base font-extrabold text-vermil-600">
              <ShieldAlert className="size-5" />
              这些情况请立刻就医
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
              <li>· 胸痛、胸闷、呼吸困难</li>
              <li>· 晕厥、意识模糊、说话不清</li>
              <li>· 严重低血糖：出冷汗、手抖、心慌</li>
              <li>· 酱油色尿、肌肉剧痛（他汀相关）</li>
              <li>· 皮疹伴发热、面部或喉咙肿胀</li>
            </ul>
            <p className="mt-3 rounded-xl bg-vermil-500 px-3 py-2 text-center text-base font-extrabold text-white">
              急救电话 120
            </p>
          </div>

          <div className="panel anim-rise stagger-2 p-5">
            <p className="text-sm font-extrabold text-ink">回答来源</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {engineOnline
                ? `已接入阿里云百炼「${health?.model}」，回答由通义千问生成，并强制附带就医提示。`
                : "当前未配置百炼 API Key，使用内置离线知识库回答（覆盖三种示例药的常见用法、相互作用与注意事项），回答会标注「离线知识库」。"}
            </p>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
              本应用仅做提醒记录，不能替代医生诊断和药师指导。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}