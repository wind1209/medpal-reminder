let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  if (unlocked) return;
  const c = ensure();
  if (!c) return;
  unlocked = true;
  const buffer = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  src.start(0);
}

type Tone = { f: number; t: number; d: number; g?: number; type?: OscillatorType };

function play(tones: Tone[], volume: number) {
  const c = ensure();
  if (!c || !master || volume <= 0) return;
  const now = c.currentTime;
  master.gain.setTargetAtTime(Math.min(1, Math.max(0, volume)) * 0.55, now, 0.02);
  for (const tone of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.f, now + tone.t);
    const peak = (tone.g ?? 0.3) * 0.9;
    gain.gain.setValueAtTime(0.0001, now + tone.t);
    gain.gain.exponentialRampToValueAtTime(peak, now + tone.t + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.t + tone.d);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now + tone.t);
    osc.stop(now + tone.t + tone.d + 0.05);
  }
}

export type SoundName = "take" | "remind" | "tap" | "warn" | "undo" | "done";

const SCORES: Record<SoundName, Tone[]> = {
  take: [
    { f: 659.25, t: 0, d: 0.26, g: 0.3 },
    { f: 987.77, t: 0.09, d: 0.4, g: 0.26 },
    { f: 1318.5, t: 0.09, d: 0.3, g: 0.1, type: "triangle" },
  ],
  remind: [
    { f: 880, t: 0, d: 0.5, g: 0.3 },
    { f: 1174.7, t: 0.22, d: 0.5, g: 0.26 },
    { f: 880, t: 0.46, d: 0.7, g: 0.24 },
  ],
  tap: [{ f: 520, t: 0, d: 0.07, g: 0.12, type: "triangle" }],
  warn: [
    { f: 392, t: 0, d: 0.24, g: 0.24 },
    { f: 311, t: 0.16, d: 0.36, g: 0.22 },
  ],
  undo: [
    { f: 740, t: 0, d: 0.16, g: 0.2 },
    { f: 494, t: 0.08, d: 0.24, g: 0.18 },
  ],
  done: [
    { f: 523.25, t: 0, d: 0.24, g: 0.26 },
    { f: 659.25, t: 0.1, d: 0.24, g: 0.24 },
    { f: 783.99, t: 0.2, d: 0.34, g: 0.24 },
    { f: 1046.5, t: 0.3, d: 0.6, g: 0.2 },
  ],
};

export function sound(name: SoundName, enabled: boolean, volume = 1) {
  if (!enabled) return;
  play(SCORES[name], volume);
}

/* ---------------- 语音播报 ---------------- */

let zhVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

function pickVoice() {
  if (typeof speechSynthesis === "undefined") return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  voicesReady = true;
  zhVoice =
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Yunyang|Ting|Mei|Hui/i.test(v.name)) ??
    voices.find((v) => /zh[-_]CN/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang)) ??
    null;
}

export function initVoice() {
  if (typeof speechSynthesis === "undefined") return;
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

export function voiceAvailable(): boolean {
  return typeof speechSynthesis !== "undefined";
}

export function voiceStatus(): string {
  if (!voiceAvailable()) return "此浏览器不支持语音播报";
  if (!voicesReady) return "语音引擎加载中";
  return zhVoice ? `已就绪 · ${zhVoice.name}` : "未找到中文语音，将使用系统默认声音";
}

export function speak(text: string, opts: { enabled: boolean; rate: number; volume: number }) {
  if (!opts.enabled || !voiceAvailable() || !text.trim()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    if (zhVoice) u.voice = zhVoice;
    u.rate = Math.min(2, Math.max(0.5, opts.rate));
    u.volume = Math.min(1, Math.max(0, opts.volume));
    u.pitch = 1.02;
    speechSynthesis.speak(u);
  } catch {
    /* 语音不可用时静默降级为文字提醒 */
  }
}

export function stopSpeech() {
  if (voiceAvailable()) speechSynthesis.cancel();
}

export function doseSpeech(name: string, amount: number, unit: string, food: string, time: string) {
  return `现在是${time}，请服用${name}，一次${amount}${unit}，${food}，温开水送服。`;
}