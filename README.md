# LarkIssueHub

Bug Tracker 的本地管理台。纯静态页面 + 一个取数脚本，没有后端、没有云服务依赖。

## 能力

| 能力 | 实现方式 | 是否实时 |
|---|---|---|
| 插件版本同步检查 | 读 GitHub 公开接口 + 解析线上构建号 | 点刷新即可 |
| 多维表格自动化流程 | 本地脚本取一次，写入 `data/automations.json` | 需重跑脚本 |
| 飞书群机器人通知 | 浏览器直接 POST Webhook | 实时 |

**不做的事**：不内嵌飞书文档界面（飞书禁止外部 iframe），只提供跳转按钮。

## 为什么自动化流程要跑脚本

飞书接口 `GET /open-apis/bitable/v1/apps/:app_token/workflows` 需要
`tenant_access_token`，而换 token 必须用 `app_secret`。

App Secret 一旦写进前端页面就等于公开，所以拆成两步：
脚本在本机拿 token、请求、落盘；页面只读这份 JSON。

接口只返回 `title` / `status` / `workflow_id`，**读不到触发条件和动作配置**。

## 快速开始

### 1. 准备凭据

```powershell
cd D:\MyFile\CODE\VSCODE\LarkIssueHub
Copy-Item .env.local.example .env.local
notepad .env.local
```

填写：

```ini
FEISHU_APP_ID=cli_aa8445104379dcb3
FEISHU_APP_SECRET=你的应用密钥
FEISHU_WIKI_TOKEN=目标多维表格的 wiki 节点 token
```

`FEISHU_WIKI_TOKEN` 与 `FEISHU_APP_TOKEN` 二选一：
- 表在知识库里 → 用 `FEISHU_WIKI_TOKEN`（脚本自动换出 app_token）
- 已知 app_token → 直接填 `FEISHU_APP_TOKEN`

**`.env.local` 已被 `.gitignore` 忽略，不会进仓库。**

### 2. 取自动化流程

```powershell
npm run automations
```

成功会打印条数并生成 `data/automations.json`。

### 3. 打开页面

```powershell
npm run serve
```

然后访问命令输出的地址（一般是 http://localhost:3000）。

直接双击 `index.html` 也能看版本信息，但 `file://` 下浏览器会拦截本地 JSON，
自动化区块会显示「未生成数据」。

## 页面上改的东西在哪

- **仓库 / 插件 / 多维表格链接、线上地址** → `config.json`
- **Webhook** → 只存在浏览器 localStorage，不落盘、不进仓库
- **自动化数据** → `data/automations.json`，脚本生成，已被忽略

## 权限要求

应用 [每日问题跟踪](https://open.feishu.cn/app/cli_aa8445104379dcb3/baseinfo) 需要：

- 权限：`base:workflow:read` 或 `bitable:app`（任一）
- 身份：是该多维表格的协作者

报错对照：

| 现象 | 原因 |
|---|---|
| `code=99991663` / 无 token | App ID 或 Secret 错误 |
| `code=1254003` | app_token 不对，检查 wiki 解析结果 |
| 权限类报错 | 应用没开权限或不是协作者 |
| wiki 接口报错 | 改用 `FEISHU_APP_TOKEN` 直接指定 |

## 安全

- 仓库里**没有**任何 App Secret、Webhook、流程数据
- `.env.local` 和 `data/automations.json` 都在 `.gitignore` 里
- 页面不发任何写操作到飞书，除了你自己点「发送到群」

## 已知限制

- 飞书 webhook 一般不放行 CORS：消息能发出去，但浏览器读不到返回，
  页面会提示「已提交，请到群里确认」。要确定性回执必须有后端转发。
- GitHub 未登录接口限流 60 次/小时/IP，页面只在点刷新时请求。
