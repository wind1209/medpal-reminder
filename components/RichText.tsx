import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={`${keyBase}-${i}`} className="font-extrabold text-ink">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyBase}-${i}`}>{p}</span>
    ),
  );
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushBullets = (k: number) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${k}`} className="my-2 space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-pine-500" />
            <span className="flex-1">{inline(b, `li-${k}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  const flushPara = (k: number) => {
    if (!para.length) return;
    blocks.push(
      <p key={`p-${k}`} className="my-2 leading-relaxed">
        {inline(para.join(" "), `p-${k}`)}
      </p>,
    );
    para = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flushBullets(idx);
      flushPara(idx);
      return;
    }
    if (/^---+$/.test(line)) {
      flushBullets(idx);
      flushPara(idx);
      blocks.push(<hr key={`hr-${idx}`} className="my-3 border-line" />);
      return;
    }
    if (line.startsWith("## ")) {
      flushBullets(idx);
      flushPara(idx);
      blocks.push(
        <h4 key={`h-${idx}`} className="mt-3 mb-1 flex items-center gap-2 text-base font-extrabold text-pine-700">
          <span className="h-4 w-1 rounded-full bg-amber-500" />
          {line.slice(3)}
        </h4>,
      );
      return;
    }
    if (line.startsWith("> ")) {
      flushBullets(idx);
      flushPara(idx);
      blocks.push(
        <blockquote
          key={`q-${idx}`}
          className="my-2 rounded-r-xl border-l-4 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold leading-relaxed text-ink"
        >
          {inline(line.slice(2), `q-${idx}`)}
        </blockquote>,
      );
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara(idx);
      bullets.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    if (/^\d+[.、)]\s*/.test(line)) {
      flushPara(idx);
      bullets.push(line.replace(/^\d+[.、)]\s*/, ""));
      return;
    }
    flushBullets(idx);
    para.push(line);
  });
  flushBullets(lines.length);
  flushPara(lines.length);

  return <div className={cn("text-base text-ink", className)}>{blocks}</div>;
}