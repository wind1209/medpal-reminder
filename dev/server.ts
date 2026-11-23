// 本地后端调试入口（Node 24+ 原生支持 TypeScript 类型擦除，无需 Deno）。
// 密钥只从当前终端的环境变量读取，绝不写入代码或前端产物。
//   ALIYUN_OCR_ACCESS_KEY_ID / ALIYUN_OCR_ACCESS_KEY_SECRET / DASHSCOPE_API_KEY
import { createServer } from "node:http";
import { handler } from "../functions/handler.ts";

const PORT = Number(process.env.PORT ?? 8000);

const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const method = req.method ?? "GET";
    const request = new Request(`http://127.0.0.1:${PORT}${req.url ?? "/"}`, {
      method,
      headers: req.headers as Record<string, string>,
      body: method === "GET" || method === "HEAD" ? undefined : new Uint8Array(body),
      // @ts-expect-error Node 需要 duplex 才能发送请求体
      duplex: "half",
    });
    const response = await handler(request, { get: (name) => process.env[name] });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    res.writeHead(response.status, headers);
    if (response.body) {
      for await (const chunk of response.body) {
        res.write(chunk);
      }
    }
    res.end();
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
    console.error("[medpal-api]", error instanceof Error ? error.message : "unknown");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const has = (k: string) => (process.env[k] ? "已配置" : "未配置");
  console.log(`慢病用药助手后端 http://127.0.0.1:${PORT}/functions/v1/app/health`);
  console.log(`  阿里云 OCR: ${has("ALIYUN_OCR_ACCESS_KEY_ID")} / ${has("ALIYUN_OCR_ACCESS_KEY_SECRET")}`);
  console.log(`  百炼千问:   ${has("DASHSCOPE_API_KEY")}`);
});