# Template provenance

Adapted from the user-provided Codex Sites 0.1.66 `sites-building/templates/vinext-starter`.

The UI catalog, hooks, utilities, Tailwind stylesheet and vendored Shadcn CSS originate from that template. The vendored CSS license is preserved beside the file. Dependencies retain their own licenses.

Qoder adaptations replace Vinext/Next server rendering and Cloudflare configuration with a Vite static build; remove D1/Drizzle, R2 and ChatGPT authentication scaffolding; set Shadcn to client rendering; and make the toast component use its system theme without a Next theme provider. The Function example reuses Qoder Sites' credential-free handler. No upstream hosting, auth or resource configuration is copied into generated projects.

Qoder adds the Sites design contract and maps the starter theme, spacing, typography and transition scales to Nudge variables. Original light/dark colors are preserved as named project variables.

## 本项目新增内容

- 业务代码（`lib/`、`components/`（除 `components/ui/`）、`pages/`、`src/App.tsx`、`src/globals.css` 的设计令牌）为本项目编写。
- `public/boxes/*.svg` 三张示例药盒为本地手绘矢量图，仅用于演示识别流程，界面中明确标注「示例」，不是真实药品包装照片。
- `public/icons/*.png` 由 `scripts/make-icons.mjs` 本地生成；`public/favicon.svg`、`public/manifest.webmanifest`、`public/sw.js` 为本项目编写。
- `lib/knowledge.ts` 的离线用药知识为项目内整理的科普条目，用于未配置百炼密钥时的降级回答，不构成医疗建议。
- `functions/aliyun.ts` 的阿里云 V3 签名实现按官方文档编写，`dev/verify-signature.ts` 用官方示例向量做纯本地校验。
- 预置的 3 种药品与 90 天服药历史为演示种子数据（`lib/seed.ts`），首次打开时写入本机 localStorage，可在设置中清空。
