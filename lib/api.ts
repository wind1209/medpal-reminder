export const FN_BASE = "/functions/v1/app";

export type ApiErrorCode =
  | "service_not_configured"
  | "unavailable"
  | "invalid_input"
  | "too_large"
  | "upstream_error"
  | "rate_limited"
  | "method_not_allowed"
  | "unknown";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MESSAGES: Record<ApiErrorCode, string> = {
  service_not_configured: "服务尚未配置密钥",
  unavailable: "暂时连不上服务",
  invalid_input: "提交的内容不符合要求",
  too_large: "图片太大了",
  upstream_error: "上游服务返回错误",
  rate_limited: "请求过于频繁，请稍后再试",
  method_not_allowed: "请求方式不被支持",
  unknown: "服务返回了异常结果",
};

export function describeError(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? e.message;
  if (e instanceof Error && e.message) return e.message;
  return "发生未知错误";
}

function looksLikeHtml(text: string) {
  const head = text.slice(0, 400).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html") || head.includes("<head");
}

// 线上网关会把路径里的函数名段替换成上游名，只有查询串原样保留，
// 因此路由同时用 action 参数表达，本地与线上走同一套调用。
function withAction(path: string): string {
  const action = path.split("?")[0].replace(/^\/+/, "");
  const sep = path.includes("?") ? "&" : "?";
  return `${FN_BASE}${path}${sep}action=${encodeURIComponent(action)}`;
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withAction(path), {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("unavailable", MESSAGES.unavailable);
  }

  const text = await res.text();
  if (looksLikeHtml(text)) throw new ApiError("unavailable", MESSAGES.unavailable, res.status);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ApiError("unknown", MESSAGES.unknown, res.status);
  }

  if (!res.ok) {
    const code = (payload as { error?: string })?.error as ApiErrorCode | undefined;
    const known: ApiErrorCode[] = [
      "service_not_configured",
      "invalid_input",
      "too_large",
      "upstream_error",
      "rate_limited",
      "method_not_allowed",
      "unavailable",
    ];
    throw new ApiError(known.includes(code as ApiErrorCode) ? (code as ApiErrorCode) : "unknown", MESSAGES.unknown, res.status);
  }

  if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
    throw new ApiError("unknown", MESSAGES.unknown, res.status);
  }
  return payload as T;
}

export interface HealthPayload {
  ok: true;
  ocr: boolean;
  ai: boolean;
  model: string;
}

let healthCache: { at: number; value: HealthPayload | null } | null = null;

export async function checkHealth(force = false): Promise<HealthPayload | null> {
  if (!force && healthCache && Date.now() - healthCache.at < 60000) return healthCache.value;
  try {
    const value = await requestJson<HealthPayload>("/health");
    healthCache = { at: Date.now(), value };
    return value;
  } catch {
    healthCache = { at: Date.now(), value: null };
    return null;
  }
}

export async function streamChat(
  messages: { role: string; content: string }[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(withAction("/chat"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError("unavailable", MESSAGES.unavailable);
  }

  const ctype = res.headers.get("content-type") ?? "";
  if (!res.ok || !ctype.includes("text/event-stream")) {
    const text = await res.text();
    if (looksLikeHtml(text)) throw new ApiError("unavailable", MESSAGES.unavailable, res.status);
    let code: ApiErrorCode = "unknown";
    try {
      code = ((JSON.parse(text) as { error?: ApiErrorCode }).error ?? "unknown") as ApiErrorCode;
    } catch {
      /* 保留 unknown */
    }
    throw new ApiError(code, MESSAGES[code] ?? MESSAGES.unknown, res.status);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new ApiError("unknown", MESSAGES.unknown);
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

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
        const parsed = JSON.parse(data) as { delta?: string; error?: string };
        if (parsed.error) throw new ApiError("upstream_error", MESSAGES.upstream_error);
        if (parsed.delta) {
          full += parsed.delta;
          onDelta(parsed.delta);
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
  }
  if (!full.trim()) throw new ApiError("unknown", MESSAGES.unknown);
  return full;
}