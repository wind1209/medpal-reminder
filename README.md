# 慢病用药提醒助手

线上地址：<https://medpal-reminder-j3e8dmby0zm.qoder.zone>（已公开访问）
代码仓库：<https://github.com/wind1209/medpal-reminder>（Public）

面向高血压、糖尿病、高血脂等慢病人群（尤其是长辈）的用药提醒 PWA。
一条主链路：**拍照识别药盒 → 核对信息 → 生成用药计划 → 到点提醒 → 服药打卡 → 历史统计**，另附用药问答 Agent。

- 中文界面、大字体、大按钮，关键操作点一下就能完成
- 预置 3 种示例药：苯磺酸氨氯地平片（降压）、盐酸二甲双胍片（降糖）、阿托伐他汀钙片（降脂）
- 本地优先：不填任何密钥也能完整跑通主链路，数据存在浏览器里
- 可选接入：Supabase 云同步、阿里云 OCR、阿里云百炼（通义千问）

> 本应用仅做提醒记录，不能替代医生诊断和药师指导。

---

## 1. 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + TypeScript 5.9 + Vite 8 + Tailwind CSS 4 |
| UI | Radix UI / Shadcn 原语（`components/ui/*`）+ lucide-react 图标 + Recharts 图表 + sonner 提示 |
| 状态 | `useSyncExternalStore` 自建 store（`lib/store.ts`），localStorage 持久化，单级撤销快照 |
| PWA | `public/manifest.webmanifest` + `public/sw.js`（离线缓存、通知点击跳转、尽力而为的定时提醒） |
| 数据层 | Supabase（Postgres + 自动 API + 行级安全），邮箱验证码登录，可选 |
| OCR | 阿里云文字识别，经 Qoder Sites Function 代理调用 |
| AI | 阿里云百炼 DashScope `qwen-plus`，SSE 流式输出，经同一个 Function 代理 |
| 后端 | Qoder Sites Function（Deno 入口 `functions/index.ts`），本地用 Node 等价服务调试 |

**密钥只存在于后端环境变量 / Sites Secrets，前端与日志永不接触。**

---

## 2. 本地怎么跑

要求 Node `^22.13.0 || >=24.0.0`（`package.json` 的 `engines` 会在安装/启动前校验）。

```sh
npm ci

# 终端 A：后端 Function 本地等价服务（127.0.0.1:8000）
npm run dev:function

# 终端 B：前端（Vite 会打印实际端口，通常是 5173，被占用时顺延到 5174）
npm run dev
```

打开 Vite 打印的 loopback 地址即可。Vite 的 dev 与 preview 都把 `/functions/v1/app` 代理到 `127.0.0.1:8000`，
所以前端始终用同源相对路径调用后端，本地与线上代码一致。

只跑前端也可以：不启动终端 A 时，OCR 与问答会自动降级（见第 5 节），主链路不受影响。

健康检查：

```sh
curl "http://127.0.0.1:5173/functions/v1/app/health"
# {"ok":true,"ocr":false,"ai":false,"model":"qwen-plus"}
```

`ocr` / `ai` 为 `false` 表示对应密钥未配置，属正常降级状态，不是报错。

生产构建与本地预览：

```sh
npm run build     # tsc --noEmit + vite build，产物在 dist/
npm run preview
```

其他脚本：

| 命令 | 用途 |
| --- | --- |
| `npm run check:function` | `deno check functions/index.ts`（需要本机装有 Deno） |
| `npm run dev:function:deno` | 用 Deno 直接跑 Function 本地入口 |
| `npm run verify:signature` | 校验阿里云 OCR 签名算法（纯本地计算，不发真实请求、不耗额度） |
| `npm run icons` | 重新生成 PWA 图标 |

---

## 3. Key 填在哪里

### 3.1 前端（可公开，会进构建产物）

复制 `.env.example` 为 `.env`，只填这两项：

```sh
VITE_SUPABASE_URL=https://<你的项目>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

获取位置：Supabase 控制台 → Project Settings → API → Project URL / `anon` `public`。

- `anon key` 是**公开键**，安全性由 `supabase/schema.sql` 里的行级安全策略保证。
- **绝不要**把 `service_role` key 写进 `.env`、前端代码或 Git。
- 不填这两项也能用：应用退回纯本地模式，设置页会显示「云同步未配置」。

### 3.2 后端密钥（只填环境变量 / Sites Secrets）

| 变量 | 用途 | 必填 |
| --- | --- | --- |
| `ALIYUN_OCR_ACCESS_KEY_ID` | 阿里云文字识别 | 启用 OCR 时必填 |
| `ALIYUN_OCR_ACCESS_KEY_SECRET` | 阿里云文字识别 | 启用 OCR 时必填 |
| `ALIYUN_OCR_ENDPOINT` | OCR 接入点，默认 `ocr-api.cn-hangzhou.aliyuncs.com` | 可选 |
| `DASHSCOPE_API_KEY` | 阿里云百炼（通义千问） | 启用在线问答时必填 |
| `DASHSCOPE_MODEL` | 模型名，默认 `qwen-plus` | 可选 |

- **线上**：Qoder Sites → 站点设置 → Secrets，逐条添加上面的名字和值。Function 通过 `Deno.env.get` 读取。
- **本地**：在启动 `npm run dev:function` 的那个终端里 export，例如

  ```sh
  export ALIYUN_OCR_ACCESS_KEY_ID=...
  export ALIYUN_OCR_ACCESS_KEY_SECRET=...
  export DASHSCOPE_API_KEY=...
  npm run dev:function
  ```

- `.env` 已被 `.gitignore` 排除；后端密钥不要写进 `.env`（`VITE_` 前缀的变量会被打包进前端）。
- 阿里云 OCR 需开通「文字识别」并保证账户有额度；百炼需在控制台创建 API-KEY 并开通对应模型。

---

## 4. Supabase 建表步骤

1. 在 <https://supabase.com> 新建项目（免费额度即可）。
2. 打开 SQL Editor，把 `supabase/schema.sql` 全文粘贴执行。它会创建 5 张表并开启行级安全：
   `medications`、`plans`、`dose_logs`、`chat_messages`、`app_settings`，
   每张表都只允许 `auth.uid() = user_id` 的本人读写。
3. Authentication → Providers → Email：开启 Email 登录（应用用的是邮箱验证码 / OTP，不需要密码）。
4. 把 Project URL 与 anon key 填进 `.env`（见 3.1），重启 `npm run dev`。
5. 应用内：设置 → 云同步 → 输入邮箱 → 填收到的验证码 → 上传本机数据。
   登录后换设备用同一邮箱即可拉回数据；未登录时数据仍完整保存在本机。

---

## 5. 能力矩阵（诚实说明降级行为）

| 能力 | 配好密钥 | 未配密钥（默认开箱状态） |
| --- | --- | --- |
| 药盒识别 | 阿里云 OCR 返回文字，前端解析出药名/规格/用法用量 | 上传照片后进入**手动核对**表单；也可用内置 3 张示例药盒走完整流程（示例药盒明确标注「示例」） |
| 用药问答 | 通义千问 `qwen-plus` 流式回答，带上你的药箱上下文 | 内置**离线知识库**回答（相互作用、忌口、漏服处理等），并标注为离线答案 |
| 数据同步 | Supabase 云同步，多设备一致 | 仅 localStorage 本机存储，可导出 / 导入 JSON 备份 |
| 到点提醒 | 应用内弹层 + 语音播报 + 浏览器通知 | 同样可用（通知需用户授权；授权被拒时页面会给出恢复指引） |

识别失败、上游报错、额度不足都会显示具体原因并保留手动录入入口，不会静默假装成功。

### PWA 与提醒的真实边界

- 可安装到手机主屏幕（Android Chrome / iOS Safari「添加到主屏幕」），离线可打开已缓存页面。
- 提醒由**页面每秒调度**为准：页面开着（含后台标签页）时到点必弹，并可选语音播报药名与用量。
- Service Worker 会为临近的服药点重新登记定时器，并处理通知点击跳转 `/?dose=<key>`。
- **浏览器完全退出后不能保证后台推送**：Web 端没有可靠的常驻闹钟。`sw.js` 里的 `push` 与 `periodicsync`
  是尽力而为的补充，需要浏览器支持且用户已安装 PWA；iOS 需先添加到主屏幕才会给通知权限。
  对必须准点服药的场景，请同时保留手机自带闹钟作为兜底。

---

## 6. 目录结构

```
lib/            纯逻辑：store / schedule / parse / knowledge / ai / ocr / supabase / voice / notify / time
components/     业务组件（Shell、PillBox、DoseCard、ReminderOverlay、MedForm、MedSheet…）
components/ui/  Shadcn / Radix 原语
pages/          Today / Cabinet / AddMed / Ask / History / Settings
src/            App.tsx（提醒调度 + 路由装配）、main.tsx、globals.css（设计令牌）
functions/      Sites Function：index.ts(Deno 入口) / handler.ts(路由) / aliyun.ts(签名与调用)
dev/            仅本地：Node 等价服务、签名校验、Deno 本地入口（不参与部署）
supabase/       schema.sql（建表 + 行级安全）
public/         manifest、sw.js、图标、3 张示例药盒 SVG
scripts/        构建、Node 版本校验、图标生成
```

别名 `@/*` 指向**项目根目录**（不是 `src/`）。

### 路由为什么放在 hash 里

页面地址形如 `/#/add`、`/#/history`。实测静态托管对 `/add` 这类深路径直接返回 404（不做 index.html 回退），
把路由放进 hash 后，任何入口都落在 `/`，直接访问、刷新、分享链接、通知跳转都可用，也不依赖服务端配置。
通知深链仍用 `/?dose=<key>`（根路径 + 查询串），应用读取后会规范化为 `/#/`。

---

## 7. 分模块自测步骤

**主链路（拍照 → 计划 → 提醒 → 打卡）**

1. 底部「加药」→ 选一张示例药盒（或上传自己的照片）→ 识别 → 进入核对页。
2. 核对页可改药名、别名、规格、剂型、用途、用量单位；确认「一次几片、一天几次、几点吃」。
3. 点「生成计划」→ 药箱出现新药，今日页出现对应服药卡片。
4. 等到点（或在设置里把「提前提醒」调大）→ 弹出全屏提醒 → 试三个按钮：
   「我已服用 · 立即打卡」写记录并扣减余量；「推迟 10 分钟」稍后再提醒；「本次跳过」不计漏服。
5. 打卡后卡片上点「撤销这次记录」（图标按钮）可回滚，余量与提醒一并恢复。
6. 超过宽限时间未打卡 → 卡片标红为「漏服」，并给出「先问医生再补服」的提示。

**药箱**：搜索（支持别名，如「络活喜」）、按用途筛选、排序、拖拽排序、批量选择删除（9 秒内可撤销）、
药品详情抽屉里配药入库 / 停用启用 / 编辑保存。

**问答**：点建议问题或自己输入，例如「氨氯地平能和降糖药一起吃吗」。
回答会列出具体忌合用清单，并始终提示咨询医生；未配百炼密钥时标注为离线知识库答案。

**记录**：依从性趋势图、90 天热力图、时间范围切换、状态筛选、明细表、导出 CSV（带 BOM，Excel 直接打开不乱码）。

**设置**：字体大小、主题（浅色/深色/跟随系统）、高对比度、提前提醒/宽限/推迟分钟数、
语音播报与语速、提示音、通知授权、JSON 导出导入、恢复示例数据、清空数据。
顶栏右上角是**唯一的声音总开关**，一键静音并显示当前状态。

---

## 8. 部署到 Qoder Sites

```sh
npm run build
```

然后在本项目的本地会话里走 `sites-hosting` 流程，参数：

- `webDirectory: "dist"`
- `functionDirectory: "functions"`
- `spa: true`（应用有客户端路由；实际路由在 hash 里，不依赖服务端回退）
- `secretNames`: `ALIYUN_OCR_ACCESS_KEY_ID`、`ALIYUN_OCR_ACCESS_KEY_SECRET`、`DASHSCOPE_API_KEY`
  （可选 `ALIYUN_OCR_ENDPOINT`、`DASHSCOPE_MODEL`）

不要上传项目根目录、`node_modules`、`dev` 或源码作为 web 产物。
构建成功不等于外部集成可用：OCR / 百炼 / Supabase 是否真的连通，取决于 Secrets 与 `.env` 是否填好。

**关于密钥与发布的关系**：一旦在 `secretNames` 里声明了密钥名，平台会要求这些密钥都有值才允许发布。
本应用在无密钥时是完整可用的（OCR 转手动录入、问答走离线知识库），因此当前线上版本没有声明密钥依赖。
要启用真实 OCR 与通义千问：在站点「设置 → Secrets」里填入上面三个名字的值，
然后重新 `prepare_site`（这次带上 `secretNames`）并发布一个版本，让依赖登记与同步生效。
密钥值只在站点设置里填写，不要写进代码、命令行或聊天记录。

### 公开 GitHub 仓库

代码已推送到公开仓库：**<https://github.com/wind1209/medpal-reminder>**（分支 `main`）。

仓库里共 132 个文件，不含 `.env`、`node_modules/`、`dist/` 或任何密钥值（`.env.example` 全部为空占位）。
提交者身份用 `git -c user.name=… -c user.email=…` 一次性传入，没有修改本机 git 配置；
邮箱用的是 GitHub noreply 地址，真实邮箱不会出现在提交记录里。

后续改动照常提交推送：

```sh
git add <改动的文件>
git commit -m "说明这次改了什么"
git push
```

如果你 fork 或另建仓库，先在 GitHub 网页上新建一个**空**仓库（不要勾选生成 README / .gitignore / license），
再执行：

```sh
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

推送前确认：`git status` 里**没有** `.env`；`.gitignore` 已排除 `node_modules/`、`dist/`、`.env*`（保留 `.env.example`）。
首次推送时 Git Credential Manager 会弹出 GitHub 授权窗口，由本人完成登录。

---

## 9. 验证状态（如实记录）

已执行：

- `npm run build`（含 `tsc --noEmit`）通过，产物在 `dist/`，路由级懒加载分包生效。
- 浏览器实测主链路：示例药盒 → 核对（可编辑）→ 生成计划 → 今日卡片 → 提醒弹层 →
  打卡（记录写入、余量扣减、低余量提示）→ 撤销（记录与余量复原、提醒重新弹出）→ 推迟 → 跳过 → 关闭。
- 药箱、问答（离线知识库）、记录、设置各模块交互实测；桌面与移动布局实测无横向溢出，
  提醒弹层在 320×568 / 360×640 / 390×844 / 1280×800 下均无裁切，打卡按钮始终可见。
- `lib/parse.ts` 的药名/规格/用法解析用 Node 直接跑了多组文本用例。
- 阿里云 OCR 签名算法用 `npm run verify:signature` 做纯本地校验，结果与官方示例向量一致（PASS）。
- **线上公开版本实测**（`https://medpal-reminder-j3e8dmby0zm.qoder.zone`）：
  六个路由直接访问与刷新均正常；首次打开自动播种并持久化；Service Worker 注册成功；
  `/functions/v1/app/health` 返回 `{"ok":true,"ocr":false,"ai":false,"model":"qwen-plus"}`；
  未配密钥时 `POST /ocr`、`POST /chat` 均返回 503 `service_not_configured`，错误方法返回 405，未知路由 404；
  示例药盒 → 生成计划 → 通知深链 `/?dose=` → 提醒弹层 → 打卡（余量 30→29、记录写入）全链路通过；
  问答离线答案带「离线知识库」标注与就医提示；重置全部数据 → 撤销可完整恢复。
- **已推送到公开 GitHub 仓库** `wind1209/medpal-reminder`：`git ls-remote` 与本地 `HEAD` 一致，
  仓库页面可见全部 132 个文件与渲染后的 README；跟踪文件里不含 `.env`、`node_modules/`、`dist/` 或密钥值。

未执行（原因）：

- **真实 OCR / 通义千问 / Supabase 云端调用未验证**：没有配置任何密钥，
  按约定不索取、不臆造密钥，也不伪造成功结果。填好 Secrets 后需按第 7 节复测。
- `npm run check:function`（`deno check`）**未执行**：本机没有安装 Deno。
  Function 逻辑通过 `npm run dev:function` 的 Node 等价服务在本地跑通，并已在线上验证路由与降级行为。
- 浏览器截图能力在当前环境不可用（返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`），
  移动端布局改用同源窄视口 iframe 实测尺寸与可点击性，不是截图目测。
- 通知授权在当前测试浏览器里是「已被拒绝」状态，因此**真实系统通知弹窗与点击跳转未实测**；
  应用内提醒、通知深链参数解析、Service Worker 消息回路已用真实代码路径验证。
- 安装到手机主屏幕后的离线推送表现未在真机上验证。

---

## 10. 安全与免责

- 所有云端调用都经后端 Function 代理，密钥不下发到浏览器。
- Supabase 每张表都启用行级安全，用户只能读写自己的数据。
- 问答回答不构成医疗建议；漏服是否补服、剂量是否调整，请咨询医生或药师，不要自行加倍。
- 本应用仅做提醒记录，不能替代医生诊断和药师指导。

模板来源与第三方许可见 `PROVENANCE.md` 与 `vendor/`。