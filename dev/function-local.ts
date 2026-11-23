// Deno 版本地后端入口（可选）。没有 Deno 时用 `npm run dev:function`（Node 24+）。
import { handler } from "../functions/handler.ts";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, (request: Request) =>
  handler(request, { get: (name: string) => Deno.env.get(name) }),
);