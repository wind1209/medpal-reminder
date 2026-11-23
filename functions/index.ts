import { handler } from "./handler.ts";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, (request: Request) =>
  handler(request, { get: (name: string) => Deno.env.get(name) }),
);