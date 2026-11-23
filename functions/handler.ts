import { recognizeGeneral, sniffImage } from "./aliyun.ts";

export interface Env {
  get(name: string): string | undefined;
}

const JSON_HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
const MAX_IMAGE_BASE64 = 6_500_000;
const MAX_MESSAGES = 20;
const MAX_CONTENT = 4000;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function fail(error: string, status: number) {
  return json({ ok: false, error }, status);
}

/* 尽力而为的限流：边缘实例内存级，跨实例不共享。 */
const buckets = new Map<string, { ocr: number[]; chat: number[] }>();
function limited(ip: string, kind: "ocr" | "chat", limit: number, windowMs: number) {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { ocr: [], chat: [] };
    buckets.set(ip, bucket);
  }
  bucket[kind] = bucket[kind].filter((t) => now - t < windowMs);
  if (bucket[kind].length >= limit) return true;
  bucket[kind].push(now);
  if (buckets.size > 4000) {
    for (const [key, value] of buckets) {
      if (!value.ocr.length && !value.chat.length) buckets.delete(key);
    }
  }
  return false;
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function routeOf(request: Request): { path: string; action: string } {
  const url = new URL(request.url);
  let path = url.pathname;
  const gateway = path.match(/\/functions\/v1\/[^/]+(\/.*)?$/);
  if (gateway) path = gateway[1] || "/";
  path = path.replace(/\/+$/, "") || "/";
  // 网关转发时前缀里的函数名会被替换成上游名，按已知路由后缀归一化。
  const tail = path.split("/").filter(Boolean).pop() ?? "";
  if (tail === "health" || tail === "ocr" || tail === "chat") path = `/${tail}`;
  const action = url.searchParams.get("action") ?? "";
  return { path, action };
}

function decodeBase64(input: string): Uint8Array | null {
  const clean = input.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  try {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function readJson(request: Request, limitBytes: number): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > limitBytes) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function ocrEnv(env: Env) {
  const accessKeyId = env.get("ALIYUN_OCR_ACCESS_KEY_ID")?.trim() ?? "";
  const accessKeySecret = env.get("ALIYUN_OCR_ACCESS_KEY_SECRET")?.trim() ?? "";
  const endpoint = (env.get("ALIYUN_OCR_ENDPOINT")?.trim() || "ocr-api.cn-hangzhou.aliyuncs.com").replace(/^https?:\/\//, "");
  if (!accessKeyId || !accessKeySecret) return null;
  return { accessKeyId, accessKeySecret, endpoint };
}

function aiEnv(env: Env) {
  const key = env.get("DASHSCOPE_API_KEY")?.trim() ?? "";
  if (!key) return null;
  return { key, model: env.get("DASHSCOPE_MODEL")?.trim() || "qwen-plus" };
}

async function handleOcr(request: Request, env: Env) {
  if (request.method !== "POST") return fail("method_not_allowed", 405);
  const config = ocrEnv(env);
  if (!config) return fail("service_not_configured", 503);
  if (limited(clientIp(request), "ocr", 30, 3_600_000)) return fail("rate_limited", 429);

  const body = await readJson(request, MAX_IMAGE_BASE64 + 2048);
  if (!body) return fail("invalid_input", 400);
  const image = typeof body.image === "string" ? body.image : "";
  if (!image || image.length > MAX_IMAGE_BASE64) return fail("too_large", 413);

  const bytes = decodeBase64(image.includes(",") ? image.slice(image.indexOf(",") + 1) : image);
  if (!bytes || bytes.length < 1024) return fail("invalid_input", 400);
  if (!sniffImage(bytes)) return fail("invalid_input", 400);

  try {
    const lines = await recognizeGeneral(bytes, config);
    if (!lines.length) return fail("upstream_error", 502);
    return json({ ok: true, provider: "aliyun-ocr", lines });
  } catch {
    return fail("upstream_error", 502);
  }
}

interface ChatMessage {
  role: string;
  content: string;
}

function sanitizeMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || !input.length || input.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  let total = 0;
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim() || content.length > MAX_CONTENT) return null;
    total += content.length;
    if (total > 24000) return null;
    out.push({ role, content });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out;
}

async function handleChat(request: Request, env: Env) {
  if (request.method !== "POST") return fail("method_not_allowed", 405);
  const config = aiEnv(env);
  if (!config) return fail("service_not_configured", 503);
  if (limited(clientIp(request), "chat", 60, 3_600_000)) return fail("rate_limited", 429);

  const body = await readJson(request, 200_000);
  if (!body) return fail("invalid_input", 400);
  const messages = sanitizeMessages(body.messages);
  if (!messages) return fail("invalid_input", 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let upstream: Response;
  try {
    upstream = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        temperature: 0.4,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return fail("upstream_error", 502);
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    await upstream.text().catch(() => "");
    return fail(upstream.status === 429 ? "rate_limited" : "upstream_error", upstream.status === 429 ? 429 : 502);
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      let buffer = "";
      let sent = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
              };
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length) {
                sent += delta.length;
                sink.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            } catch {
              /* 跳过不完整或非数据行 */
            }
          }
        }
        if (!sent) {
          sink.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "empty_response" })}\n\n`));
        }
        sink.enqueue(encoder.encode("data: [DONE]\n\n"));
        sink.close();
      } catch {
        try {
          sink.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "upstream_error" })}\n\n`));
          sink.close();
        } catch {
          /* 流已关闭 */
        }
      } finally {
        clearTimeout(timer);
        reader.releaseLock();
      }
    },
    cancel() {
      clearTimeout(timer);
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function handler(request: Request, env: Env): Promise<Response> {
  const { path, action } = routeOf(request);
  const route = action ? `/${action}` : path;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...JSON_HEADERS, Allow: "GET, POST, OPTIONS" } });
  }

  if (route === "/health") {
    if (request.method !== "GET") return fail("method_not_allowed", 405);
    return json({
      ok: true,
      ocr: Boolean(ocrEnv(env)),
      ai: Boolean(aiEnv(env)),
      model: aiEnv(env)?.model ?? "qwen-plus",
    });
  }

  if (route === "/ocr") return handleOcr(request, env);
  if (route === "/chat") return handleChat(request, env);

  if (route === "/" || route === "") {
    if (request.method !== "GET") return fail("method_not_allowed", 405);
    return json({ ok: true, service: "medpal-api", endpoints: ["/health", "/ocr", "/chat"] });
  }

  return fail("not_found", 404);
}