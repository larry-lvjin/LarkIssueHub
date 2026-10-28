# LarkIssueHub

Sigma 耳机 Bug Tracker 的网页看板。纯静态页面 + 一个取数脚本，没有后端、不依赖云服务。

页面形态与飞书侧边栏插件一致：顶部四个指标卡片，下面是趋势折线图。

## 页面内容

- **指标卡片**：总数 / 未解决 / 重新打开 / 未解决与重新打开占比
- **折线图**：总数趋势、未解决与重新打开趋势、未解决占比趋势、每日新增未解决

数据来自多维表格 `BugStats_History` 表，由本地脚本读取后写成 `data/stats.json`，
页面只读这份 JSON，不发任何写请求。

## 快速开始

### 1. 准备凭据

```powershell
cd D:\MyFile\CODE\VSCODE\LarkIssueHub
Copy-Item .env.local.example .env.local
notepad .env.local
```

```ini
FEISHU_APP_ID=cli_aa8445104379dcb3
FEISHU_APP_SECRET=你的应用密钥
FEISHU_WIKI_TOKEN=目标多维表格的 wiki 节点 token
```

`FEISHU_WIKI_TOKEN` 与 `FEISHU_APP_TOKEN` 二选一：
- 表在知识库里 → 填 `FEISHU_WIKI_TOKEN`（脚本自动换出 app_token）
- 已知 app_token → 直接填 `FEISHU_APP_TOKEN`

`.env.local` 已被 `.gitignore` 忽略，不会进仓库。

### 2. 取数据

```powershell
npm run stats
```

成功会打印天数与最新一天的数字，并生成 `data/stats.json`。

### 3. 打开

```powershell
npm run serve
```

访问命令输出的地址。直接双击 `index.html` 不行——`file://` 下浏览器会拦截本地 JSON 请求。

## 其他脚本

| 命令 | 作用 |
|---|---|
| `npm run stats` | 生成 `data/stats.json`，看板数据 |
| `npm run automations` | 生成 `data/automations.json`，列出自动化流程 |
| `npm run inspect` | 只读列出所有数据表与字段，用来核对表结构 |
| `npm run serve` | 起本地静态服务 |

## 数据说明

`data/stats.json` 结构：

```json
{
  "generatedAt": "2026-10-28T13:05:43.000Z",
  "count": 166,
  "latest": { "date": "2026-08-22", "total": 1250, "unresolved": 89,
              "reopened": 9, "ratio": 7.8, "newUnresolved": 13, "resolved": 5 },
  "series": [ { "date": "2026-03-09", "...": "..." } ]
}
```

- 数据源表：`BugStats_History`（`tblWn6xhMFG67AfC`）
- 数据截止到表里最后一条记录，不是实时值
- 要更新就重跑 `npm run stats`，再点页面上的「刷新」

## 权限要求

应用 [每日问题跟踪](https://open.feishu.cn/app/cli_aa8445104379dcb3/baseinfo) 需要：

- 权限：`bitable:app` 或 `bitable:record:read`（读记录）+ `wiki:wiki:readonly`（解析 wiki 节点时）
- 身份：是该多维表格的协作者

报错对照：

| 现象 | 原因 |
|---|---|
| 缺 `FEISHU_APP_SECRET` | `.env.local` 没填或没保存 |
| `code=99991663` | App ID / Secret 错误 |
| 权限类报错 | 应用没开权限或不是协作者 |
| wiki 接口报错 | 改用 `FEISHU_APP_TOKEN` 直接指定 |

## 安全

- 仓库里没有任何 App Secret、Webhook、业务数据
- `.env.local` 与 `data/*.json` 都在 `.gitignore` 里
- 所有脚本只读，不写多维表格

## 已知限制

- 图表库走 CDN（jsdelivr），离线打不开就只能看到数字
- 数据是快照，不是实时；要看最新值必须重跑脚本
