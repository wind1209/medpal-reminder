const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message) as BufferSource));
}

export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k] ?? "")}`)
    .join("&");
}

export interface SignInput {
  method: string;
  host: string;
  canonicalUri: string;
  query: Record<string, string>;
  action: string;
  version: string;
  body: Uint8Array;
  accessKeyId: string;
  accessKeySecret: string;
  contentType?: string;
  date?: string;
  nonce?: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export async function signV3(input: SignInput): Promise<SignedRequest> {
  const hashedPayload = await sha256Hex(input.body);
  const date = input.date ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = input.nonce ?? toHex(crypto.getRandomValues(new Uint8Array(16)));

  const headers: Record<string, string> = {
    host: input.host,
    "x-acs-action": input.action,
    "x-acs-version": input.version,
    "x-acs-date": date,
    "x-acs-signature-nonce": nonce,
    "x-acs-content-sha256": hashedPayload,
  };
  if (input.contentType) headers["content-type"] = input.contentType;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const query = canonicalQuery(input.query);

  const canonicalRequest = [
    input.method.toUpperCase(),
    input.canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const stringToSign = `ACS3-HMAC-SHA256\n${await sha256Hex(canonicalRequest)}`;
  const signature = await hmacSha256Hex(input.accessKeySecret, stringToSign);

  return {
    url: `https://${input.host}${input.canonicalUri}${query ? `?${query}` : ""}`,
    headers: {
      ...headers,
      accept: "application/json",
      Authorization: `ACS3-HMAC-SHA256 Credential=${input.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
    body: input.body,
  };
}

export interface OcrEnv {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
}

const IMAGE_MAGIC: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "image/jpeg"],
  [[0x89, 0x50, 0x4e, 0x47], "image/png"],
  [[0x42, 0x4d], "image/bmp"],
  [[0x52, 0x49, 0x46, 0x46], "image/webp"],
];

export function sniffImage(bytes: Uint8Array): string | null {
  for (const [magic, type] of IMAGE_MAGIC) {
    if (magic.every((b, i) => bytes[i] === b)) return type;
  }
  return null;
}

export async function recognizeGeneral(bytes: Uint8Array, env: OcrEnv, timeoutMs = 20000): Promise<string[]> {
  const signed = await signV3({
    method: "POST",
    host: env.endpoint,
    canonicalUri: "/",
    query: {},
    action: "RecognizeGeneral",
    version: "2021-07-07",
    body: bytes,
    accessKeyId: env.accessKeyId,
    accessKeySecret: env.accessKeySecret,
    contentType: "application/octet-stream",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body as BufferSource,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    let code = "";
    try {
      code = (JSON.parse(text) as { Code?: string }).Code ?? "";
    } catch {
      /* 上游返回非 JSON */
    }
    throw new Error(`aliyun_ocr_${res.status}${code ? `_${code}` : ""}`);
  }

  let payload: { Data?: string; Content?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("aliyun_ocr_bad_json");
  }

  const dataRaw = payload.Data ?? payload.Content ?? "";
  let words: string[] = [];
  let content = "";
  try {
    const data = JSON.parse(dataRaw) as {
      content?: string;
      prism_wordsInfo?: { word?: string }[];
    };
    content = data.content ?? "";
    words = (data.prism_wordsInfo ?? []).map((w) => w.word ?? "").filter(Boolean);
  } catch {
    content = dataRaw;
  }

  if (!words.length) words = content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return words.slice(0, 120);
}