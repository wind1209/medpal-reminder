import { toast } from "sonner";
import { clearDose, markMissed, skipDose, takeDose } from "./store";
import { doseSpeech, sound, speak } from "./voice";
import { clockText } from "./time";
import { FOOD_LABEL, type Dose, type Settings } from "./types";

function voiceOpts(s: Settings) {
  return { enabled: s.voice, rate: s.voiceRate, volume: s.voiceVolume };
}

export function performTake(dose: Dose, s: Settings) {
  takeDose(dose.key);
  sound("take", s.sound, s.voiceVolume);
  speak(
    `已记录。${dose.med.name}，${dose.amount}${dose.plan.unit}，${dose.time}这一次已完成。`,
    voiceOpts(s),
  );
  toast.success(`已打卡：${dose.med.name}`, {
    description: `${dose.time} · ${dose.amount} ${dose.plan.unit} · 记录时间 ${clockText(new Date())}`,
    duration: 3600,
  });
  const left = dose.med.stock - dose.amount;
  if (left <= dose.med.lowStock) {
    toast.warning(`${dose.med.name} 余量不足`, {
      description: `大约还剩 ${Math.max(0, left)} ${dose.plan.unit}，请及时配药。`,
      duration: 6000,
    });
    sound("warn", s.sound, s.voiceVolume);
  }
}

export function performSkip(dose: Dose, s: Settings) {
  skipDose(dose.key);
  sound("tap", s.sound, s.voiceVolume);
  toast(`已跳过：${dose.med.name} ${dose.time}`, {
    description: "这一次不计入漏服，如需服用仍可打卡。",
    duration: 4000,
  });
}

export function performMissed(dose: Dose, s: Settings) {
  markMissed(dose.key);
  sound("warn", s.sound, s.voiceVolume);
  toast.error(`已标记漏服：${dose.med.name} ${dose.time}`, {
    description: "漏服已标红。是否补服请先咨询医生或药师，不要自行加倍剂量。",
    duration: 6500,
  });
}

export function performClearDose(dose: Dose, s: Settings) {
  clearDose(dose.key);
  sound("undo", s.sound, s.voiceVolume);
  toast(`已撤销：${dose.med.name} ${dose.time}`, { duration: 3000 });
}

export function remindSpeech(dose: Dose) {
  return doseSpeech(
    dose.med.name,
    dose.amount,
    dose.plan.unit,
    FOOD_LABEL[dose.plan.food],
    dose.time,
  );
}