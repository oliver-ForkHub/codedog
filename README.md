# 编程狗社区 (CodeDog)

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.4-brightgreen" alt="Vue">
  <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
  <img src="https://img.shields.io/badge/Element_Plus-2.x-blue" alt="Element Plus">
  <img src="https://img.shields.io/badge/License-AGPL%20v3-blue" alt="License">
  <img src="https://img.shields.io/badge/IM-System-orange" alt="IM System">
</p>

一个基于 Vue3 + Node.js 的编程社区系统，支持作品展示、评论互动、工作室、内容审核等功能，并集成可独立部署的即时通讯（IM）系统。

本仓库由两大子系统组成：

| 子系统 | 目录 | 说明 |
|--------|------|------|
| 编程狗社区（主站） | `server/`、`client/`、`scripts/` | 用户、作品、帖子、工作室、AI 审核、后台管理 |
| CodeDog IM（即时通讯） | `im-system/` | 私聊、群聊、独立后台、独立 MySQL/Redis，可与编程狗分开部署 |

> 详细架构设计见 [docs/IM-ARCHITECTURE.md](docs/IM-ARCHITECTURE.md)；IM 单独使用文档见 [im-system/README.md](im-system/README.md)。

## 🚀 一键部署

### Linux/Mac
```bash
git clone https://github.com/txcxgzs/codedog.git
cd codedog
chmod +x deploy.sh && ./deploy.sh
```

### Windows
```cmd
git clone https://github.com/txcxgzs/codedog.git
cd codedog
deploy.bat
```

## ✨ 功能特性

### 用户端
- 🔐 **用户认证** - 编程猫账号登录 / JWT 令牌认证
- 📝 **作品展示** - 支持从编程猫平台导入作品
- 💬 **评论系统** - 作品评论、回复、点赞
- 🏢 **工作室功能** - 创建工作室、成员管理、作品提交
- ❤️ **互动功能** - 点赞、收藏、关注用户
- 🔔 **消息通知** - 站内信、点赞通知、举报反馈
- 📱 **社区帖子** - 发布帖子、分类讨论

### 管理端
- 🤖 **AI 内容审核** - 支持自定义 AI API 或内置敏感词检测
- 📋 **敏感词管理** - 87,000+ 内置敏感词，支持分类和自定义
- 🔒 **验证码支持** - 极验 / hCaptcha 验证码
- 👨‍💼 **后台管理** - 用户、作品、评论、举报、公告、轮播图管理
- 📊 **操作日志** - 管理员操作审计追踪
- 🛡️ **IP 封禁** - 封禁恶意 IP
- ⚙️ **系统设置** - 网站配置、AI 审核配置、验证码配置

### 即时通讯（IM）系统
- 🎫 **一次性 RS256 SSO** - 编程狗签发 60 秒票据，IM 用公钥验签并防重放，IM 不接触用户密码或 Cookie
- 💬 **私聊** - 陌生人需先发起会话申请，对方同意后才能继续发消息
- 👥 **群聊** - 默认上限 100 人，编程狗 `admin/superadmin` 可在 IM 后台设置带审计的容量例外（硬上限 5000）
- 🖼️ **图片消息** - 复用编程狗现有图床，仅保存 URL/元数据，JPG/PNG/WebP/GIF ≤5MB，服务端做魔数校验
- 🔄 **消息可靠性** - 会话序号严格递增、`client_message_id` 幂等、断线按 `after_sequence` 游标补拉
- 📡 **WebSocket 推送** - 多设备同账号在线、`message.new`、`message.ack`、`session.revoked` 事件
- 🛑 **账号状态联动** - 编程狗封禁/解封/令牌版本变化实时推送至 IM，被停用账号立即下线
- 🛠️ **独立审计后台** - 聊天记录检索（必须填审计原因）、举报处置、群容量例外、违规消息隐藏与用户禁用
- 🐧 **独立运行** - IM 不读取编程狗数据库/Cookie/编程猫令牌，可单独扩容或多节点部署

## 🛠️ 技术栈

| 模块 | 前端 | 后端 |
|------|------|------|
| 编程狗社区 | Vue 3 + Element Plus + Pinia + Vue Router + Vite | Node.js + Express + Sequelize + SQLite/MySQL + JWT |
| CodeDog IM | 独立 Vue 3（科幻终端风格） | Node.js + Express + Sequelize + MySQL + Redis + WebSocket |
| 验证码 | 极验 / hCaptcha | — |

## 📦 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/txcxgzs/codedog.git
cd codedog

# 2. 一键部署
chmod +x deploy.sh && ./deploy.sh

# 访问 http://localhost:3001
```

### 方式二：本地开发

```bash
# 1. 克隆项目
git clone https://github.com/txcxgzs/codedog.git
cd codedog

# 2. 安装依赖
cd server && npm install
cd ../client && npm install

# 3. 启动后端（终端1）
cd server && npm run dev

# 4. 启动前端（终端2）
cd client && npm run dev

# 前端: http://localhost:8080
# 后端: http://localhost:3001
```

## 🔄 更新系统

### Linux/Mac
```bash
chmod +x update.sh && ./update.sh
```

### Windows
```cmd
update.bat
```

更新脚本会自动：备份数据 → 拉取最新代码 → 重新构建 → 重启服务

---

## 🛠️ 编程狗管理工具箱 (codedog)

部署后会自动安装 `codedog` 命令行工具，在任意终端输入 `codedog` 即可打开管理工具箱。

### 启动工具箱

```bash
# 在任意目录都可以运行
codedog
```

### 主菜单

```
╔═══════════════════════════════════════════════════╗
║           CodeDog 管理工具箱 v1.0.0              ║
╚═══════════════════════════════════════════════════╝

请选择操作：

  1) 📊 查看系统状态
  2) 📝 查看服务日志
  3) 🔄 检查更新
  4) ⬆️  执行更新
  5) 🔧 修复问题
  6) 🗄️  数据库管理
  7) 🛡️  敏感词管理
  8) ⚙️  系统配置
  9) 🧹 清理缓存
  0) 退出
```

### 功能详解

#### 1) 📊 查看系统状态

显示系统运行状态，包括：
- Docker 容器状态
- 后端服务是否正常
- 数据库大小和数据统计（用户数、作品数、帖子数、敏感词数）
- 上传目录大小

```
═══ 系统状态 ═══

✓ Docker 已安装: Docker version 24.0.7
✓ CodeDog 容器运行中
✓ 后端服务运行正常 (端口 3001)
✓ 数据库文件存在 (大小: 2.5M)
  - 用户数: 79
  - 作品数: 100
  - 帖子数: 15
  - 敏感词: 87012
✓ 上传目录存在 (大小: 15M)
```

#### 2) 📝 查看服务日志

```
1) 实时日志    - 实时查看服务输出
2) 最近 50 行  - 查看最近日志
3) 错误日志    - 只显示错误信息
```

#### 3) 🔄 检查更新

检查是否有新版本可用：

```
═══ 检查更新 ═══

当前版本: a49856d (codex/security-hardening)
正在检查远程更新...
⚠ 有 3 个新提交可用

最近更新:
b7f23e1 fix: improve API performance
c4a1d92 feat: add batch operations
e5f8a73 fix: notification link issue
```

#### 4) ⬆️ 执行更新

自动执行更新流程：

```
═══ 执行更新 ═══

确定要更新系统吗？(y/n): y

正在备份...
✓ 备份已保存到: backup_20260619_153045

正在拉取更新...
正在重新构建...
正在重启服务...
✓ 更新完成！

如需回滚，执行：
  cp -r backup_20260619_153045/data ./data
  cp -r backup_20260619_153045/uploads ./uploads
  docker compose restart
```

#### 5) 🔧 修复问题

```
1) 修复数据库表结构  - 添加缺失的列
2) 修复文件权限      - 修复目录权限
3) 重置管理员密码    - 重置密码说明
4) 修复敏感词表      - 检查/创建敏感词表
5) 全部修复          - 执行所有修复
```

#### 6) 🗄️ 数据库管理

```
1) 备份数据库    - 创建数据库备份
2) 恢复数据库    - 从备份恢复
3) 查看数据库信息 - 显示表和记录数
4) 优化数据库    - 执行 VACUUM 优化
```

**查看数据库信息示例：**
```
数据库信息:
文件大小: 2.5M

表统计:
  - users: 79 条记录
  - works: 100 条记录
  - posts: 15 条记录
  - comments: 234 条记录
  - sensitive_words: 87012 条记录
  - notifications: 156 条记录
```

#### 7) 🛡️ 敏感词管理

```
1) 查看敏感词统计  - 按分类和等级统计
2) 测试敏感词检测  - 输入内容测试是否命中
3) 重新导入敏感词库 - 清空并重新导入
```

**查看敏感词统计示例：**
```
敏感词统计:
总数: 87012

按分类:
  - 其他: 69319
  - 涉政: 15722
  - 涉黄: 1233
  - 涉暴: 615
  - 广告: 123

按等级:
  - 高风险: 17326
  - 中风险: 69610
  - 低风险: 76
```

**测试敏感词检测示例：**
```
请输入要测试的内容: 你个傻逼
命中敏感词:
  - 傻逼
  - 你妈
```

#### 8) ⚙️ 系统配置

```
1) 查看当前配置  - 显示 Docker 和环境变量配置
2) 修改端口      - 修改服务端口
3) 重置配置      - 恢复默认配置
```

#### 9) 🧹 清理缓存

```
1) 清理 Docker 缓存  - 清理无用镜像和容器
2) 清理旧备份        - 只保留最近 5 个备份
3) 清理日志          - 清理容器日志
4) 全部清理          - 执行所有清理
```

### 手动安装工具箱

如果部署时没有自动安装，可以手动安装：

**Linux/Mac:**
```bash
chmod +x install-cli.sh && ./install-cli.sh
```

**Windows:**
```cmd
install-cli.bat
```

---

## 📡 CodeDog IM 系统与终端工具箱

CodeDog IM 是仓库中独立的即时通讯系统，部署在 `im-system/` 目录。它与编程狗社区**完全解耦**：拥有独立的前端、后端、MySQL、Redis 和管理后台，可单独扩容或迁移到不同服务器。

### IM 与编程狗的连接方式

两套系统之间**只有四条明确连接**，不存在隐式数据库耦合：

```text
┌──────────────────┐                ┌──────────────────┐
│  编程狗社区      │                │  CodeDog IM       │
│  (Vue + Express) │                │  (Vue + Express) │
│                  │  ① 浏览器跳转   │                  │
│  IM_PUBLIC_URL   │ ─────────────▶│  /sso?ticket=... │
│                  │                │                  │
│  POST /api/users │  ② SSO Ticket  │  /api/auth/sso/  │
│  /im-sso-ticket  │ ─────────────▶│  exchange         │
│                  │  (RS256 + jti) │                  │
│                  │                │                  │
│  imStatusPush.js │  ③ 账号事件    │  /api/internal/  │
│  (持久重试队列)   │ ─────────────▶│  account-status   │
│                  │                │                  │
│  /api/users/     │  ④ IM 反向调用 │  communityRequest│
│  im-status       │ ◀─────────────│  (禁用违规用户)   │
└──────────────────┘                └──────────────────┘
```

1. **浏览器跳转**：编程狗前端调用 `POST /api/users/im-sso-ticket` 获取跳转 URL，浏览器跳到 `${IM_PUBLIC_URL}/sso?ticket=...`。
2. **一次性 SSO**：编程狗用 **RS256 私钥**签发 60 秒有效、单次使用（`jti` 写入 Redis 防重放）的 Ticket；IM 用**公钥**验签后写入自己的 HttpOnly 会话 Cookie。Ticket 内含 `client_ip_hash` / `client_network_hash` / `browser_hash` 用于校验来源一致性。
3. **账号事件推送**：编程狗 [server/services/imStatusPush.js](server/services/imStatusPush.js) 启动持久化重试队列，封禁/解封/令牌版本变化时通过 `POST /api/internal/account-status` 推送给 IM；IM 收到非 `active` 状态后立即关闭该账号所有 WebSocket 连接（断开码 `4001`）。每 60 秒扫描最近变更用户兜底；IM 不可达时按指数退避重试，最长 15 分钟一次。
4. **IM 反向处置**：IM 管理员处理举报时可通过 `communityRequest` 携带短期状态凭证回调编程狗 `POST /api/users/im-admin/users/:userId/disable`，由编程狗重新校验角色层级后执行禁用。

**安全边界**：
- IM **不读取**编程狗密码、Cookie、Session 或编程猫 Token。
- IM **不直接读写**编程狗数据库，资料通过 SSO Ticket 一次性携带并按需缓存。
- 编程狗只持有 SSO **私钥**，IM 只持有 SSO **公钥**。即便 IM 服务或数据库泄漏，攻击者也无法伪造编程狗登录身份。

### IM 一键部署（独立部署）

在 Linux 服务器执行，按中文交互向导选择即可：

```bash
curl -fsSL https://raw.githubusercontent.com/txcxgzs/codedog/main/im-system/install.sh -o /tmp/codedog-im-install.sh
sudo bash /tmp/codedog-im-install.sh
```

安装器默认安装到 `/opt/codedog-im`，交互式询问：
- 安装目录、IM 公开地址（如 `https://im.54188.xyz`，会自动补全为 `https://im.54188.xyz/im`）、本地监听端口（默认 `8100`）
- 内置 MySQL + Redis（不开放公网端口）或填写外部连接地址
- 是否同时绑定本机的编程狗社区（自动写入 `IM_PUBLIC_URL` 和 SSO 私钥到编程狗 `.env` 并重建社区容器）

安装器会自动：
- 生成随机 MySQL 密码、`IM_SESSION_SECRET`、SSO RSA 密钥对
- `npm ci` + `npm run check` + `docker compose up -d --build`
- 执行 IM 数据库迁移并等待健康检查通过
- 联合部署时把 IM 地址与私钥写入编程狗配置并重建社区服务

### IM 访问地址

宿主机 IM Web 端口默认仅绑定 `127.0.0.1:8100`，**不直接开放公网**。宿主机 Nginx/Caddy 反向代理到 `http://127.0.0.1:8100`：

```nginx
server {
    listen 80;
    server_name im.example.com;

    location / {
        proxy_pass http://127.0.0.1:8100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

同域名路径模式下的最终拓扑（推荐首发采用）：

| 路径 | 指向 |
|------|------|
| `https://54188.xyz/` | 编程狗社区 |
| `https://54188.xyz/im/` | IM 用户端 |
| `https://54188.xyz/im/admin/` | IM 后台 |
| `https://54188.xyz/im/api/` | IM HTTP API |
| `wss://54188.xyz/im/ws` | IM WebSocket |

### IM 终端工具箱 (codedogim)

IM 部署完成后会自动安装 `codedogim` 全局命令，可在任意目录运行；也可在 IM 目录运行 `./im.sh`（Linux）或双击 `im.bat`（Windows）。

```bash
codedogim        # Linux 任意目录
./im.sh          # 在 im-system 目录
im.bat           # Windows 双击
```

工具箱主菜单：

```
======================================
  CodeDog IM 管理工具箱 v0.1.0
======================================

 1. 构建并启动           7. 检查与构建
 2. 停止                 8. 生成 SSO 密钥
 3. 重启                 9. 安装依赖
 4. 智能更新            10. 备份 MySQL
 5. 查看日志            11. 安装/修复全局 codedogim 命令
 6. 状态                 0. 退出
```

| 选项 | 功能说明 |
|------|----------|
| 1) 构建并启动 | `docker compose up -d --build`，构建并启动全部 IM 容器 |
| 2) 停止 | 停止 IM 网页、消息服务、容器内 MySQL 和 Redis（需输入 `STOP` 二次确认） |
| 3) 重启 | `docker compose restart` 滚动重启 |
| 4) 智能更新 | 工作区预检 → 备份 `.env`/SSO 密钥 → 在线 MySQL 热备份 → `git fetch` + `ff-only` → 仅在 `package*.json` 变化时安装依赖 → `npm run check` → 滚动重建。无 IM 变更时跳过下载/重建 |
| 5) 查看日志 | `docker compose logs --tail=200 -f` |
| 6) 状态 | 显示目录、`.env`、SSO 公钥是否就绪、容器状态 |
| 7) 检查与构建 | `npm run check`：服务端单测 + 前端构建 |
| 8) 生成 SSO 密钥 | 重新生成 RS256 公私钥对（**会破坏已签发的 Ticket，需要重新执行编程狗绑定**） |
| 9) 安装依赖 | `npm install` |
| 10) 备份 MySQL | `mysqldump` 在线热备份到 `backups/codedog-im-*.sql` |
| 11) 安装/修复全局命令 | 在 Linux 把 `im.sh` 软链到 `/usr/local/bin/codedogim` |

### IM 补做绑定（中断恢复）

如果联合部署在绑定编程狗前中断，服务恢复健康后可安全补做绑定（命令会先备份编程狗 `.env`，不操作数据库）：

```bash
cd /opt/codedog-im/im-system
npm run bind-community -- --community-dir /root/codedog --public-url https://im.54188.xyz
```

### IM 独立更新

```bash
# Linux/Mac
cd im-system && sh update.sh
# Windows
cd im-system && update.bat
```

### IM 安全边界与产品决策

- 不开发语音消息、实时语音/视频通话、屏幕共享。
- 单条文本消息最大 10,000 字符；图片仅支持 JPG/PNG/WebP/GIF ≤5MB。
- 图片复用编程狗现有图床（`img.scdn.io`），IM 不保存图片二进制，只保存 URL、宽高、MIME、大小、hash 和审核状态。
- 产品**明确不提供已读回执**。
- 默认所有群上限 100 人；只有编程狗 `admin/superadmin` 可在 IM 后台设置带审计记录的容量例外，硬上限 `IM_GROUP_HARD_LIMIT=5000`。
- 聊天记录查看为高敏感权限：必须填至少 2 字符审计原因，操作记录到 `im_admin_audits`，撤回消息在客户端显示撤回提示但后台保留原内容用于举报与安全审计。
- 当前为单 IM 节点；多节点扩容时再引入 Redis Streams 或 NATS JetStream，不在首期范围。

### IM 数据库迁移

迁移文件位于 [im-system/migrations/](im-system/migrations/)，启动时由 `apps/server/src/database.js` 自动幂等执行：

- `001_initial_im_schema` 会话、成员、消息、群资料、管理员审计表
- `002_image_host_metadata` 图片表（仅图床 URL 和校验元数据）
- `003_remove_read_receipts` 移除已读位置字段（按产品不提供已读回执）
- `004_im_reports` 消息举报表（禁止同用户重复举报同一消息）
- `008_im_report_actions` 举报记录增加处置动作字段

迁移成功后才记录版本；失败时服务拒绝启动。**禁止使用 `sync({ alter: true })` 或启动时删表重建**。

---

## 🌐 访问地址

| 服务 | 地址 |
|------|------|
| 编程狗前端首页 | http://localhost:3001 |
| 编程狗后端 API | http://localhost:3001/api |
| 编程狗后台管理 | http://localhost:3001/admin |
| IM 用户端（同域名） | http://localhost:3001/im/ |
| IM 用户端（独立部署） | http://localhost:8100/im/ |
| IM 管理后台 | http://localhost:8100/im/admin/ |
| IM HTTP API | http://localhost:8100/im/api/ |
| IM WebSocket | ws://localhost:8100/im/ws |
| IM 健康检查 | http://localhost:8100/im/health |

## 👤 管理员说明

**第一个使用编程猫登录的用户将自动成为超级管理员。**

后续的管理员需要由超级管理员在后台进行设置。

### 角色权限

| 角色 | 权限 |
|------|------|
| user | 普通用户 |
| reviewer | 审核员，可审核举报 |
| moderator | 版主，可管理内容 |
| admin | 管理员，可管理用户和设置 |
| superadmin | 超级管理员，全部权限 |

IM 后台默认仅编程狗 `admin`、`superadmin` 可进入；IM 内部 RBAC 拆分为只读审计、举报处理、用户处置、群管理、群容量例外和系统配置，但管理员身份根来源仍是编程狗角色系统。

## ⚙️ 配置说明

### Docker 部署配置

编辑 `docker-compose.yml`：

```yaml
environment:
  - NODE_ENV=production
  - DB_TYPE=sqlite          # 或 mysql
  - DB_PATH=/app/server/data/database.sqlite
```

### 本地开发配置

复制 `.env.example` 为 `.env` 并修改配置：

```env
# 服务端口
CLIENT_PORT=8080
SERVER_PORT=3001

# 数据库类型 (sqlite/mysql)
DB_TYPE=sqlite

# JWT密钥（部署脚本会自动生成）
JWT_SECRET=auto-generated
```

> 后端端口优先读取 PORT，若未设置则读取 SERVER_PORT。

### IM 与编程狗联动配置

编程狗侧 `.env`：

```dotenv
# IM 公开入口地址（控制前端“即时通讯”按钮跳转目标）
IM_PUBLIC_URL=https://im.example.com/im
# IM SSO 私钥：可指定文件路径或 Base64
IM_SSO_PRIVATE_KEY_FILE=/安全路径/im_sso_private.pem
# 或者安装器自动写入的 Base64 形式
# IM_SSO_PRIVATE_KEY_BASE64=...
```

IM 侧 `.env`（详见 [im-system/.env.example](im-system/.env.example)）：

```dotenv
NODE_ENV=production
IM_PORT=3100                              # IM 服务端内部监听端口
IM_HTTP_PORT=8100                         # IM Web 容器对宿主机监听端口
IM_BIND_HOST=127.0.0.1                    # 默认只绑定本机，必须由宿主机 Nginx/Caddy 反向代理
IM_PUBLIC_ORIGIN=https://im.example.com   # IM 用户端公开 Origin（CORS）
IM_ADMIN_ORIGIN=https://im.example.com    # IM 后台公开 Origin（CORS）
IM_SESSION_SECRET=至少32字符随机密钥
IM_SSO_PUBLIC_KEY_FILE=./secrets/im_sso_public.pem
IM_DATABASE_URL=mysql://im_user:***@mysql:3306/codedog_im
IM_REDIS_URL=redis://redis:6379/0
IM_GROUP_DEFAULT_LIMIT=100                # 普通群默认上限
IM_GROUP_HARD_LIMIT=5000                  # 系统绝对上限，防止管理员误操作
# 图床复用编程狗现有配置
IMAGE_HOST_ENDPOINT=https://img.scdn.io/api/v1.php
IMAGE_HOST_CDN_DOMAIN=img.scdn.io
IMAGE_HOST_STORAGE_DESTINATION=telegram
```

> 私钥**只能留在编程狗服务器**，公钥复制到 IM `secrets/im_sso_public.pem`，绝不能反向复制。

## 📁 目录结构

```
codedog/
├── server/                     # 编程狗后端代码
│   ├── config/                 # 配置（数据库、认证、权限）
│   ├── controllers/            # 控制器（用户、作品、帖子、工作室、管理员等）
│   ├── middleware/             # 中间件（auth、hcaptcha、geetest、ipBan、permission、rateLimit 等）
│   ├── models/                 # Sequelize 数据模型
│   ├── routes/                 # 路由（userRoutes 含 IM SSO 与状态接口）
│   ├── services/
│   │   ├── aiReview.js         # AI 内容审核
│   │   ├── codemaoApi.js       # 编程猫 API 适配
│   │   ├── geetest.js          # 极验验证码
│   │   ├── hcaptcha.js         # hCaptcha 中间件
│   │   ├── imSso.js            # ★ IM SSO Ticket 签发与状态校验（RS256）
│   │   ├── imStatusPush.js     # ★ IM 账号状态持久化推送队列
│   │   ├── imageHost.js        # 编程狗图床（被 IM 复用）
│   │   └── ...
│   ├── utils/
│   ├── app.js                  # 入口文件
│   └── package.json
├── client/                     # 编程狗前端代码
│   ├── src/
│   │   ├── api/                # API 接口（im.js 为 IM 跳转接口）
│   │   ├── components/
│   │   ├── router/
│   │   ├── stores/             # Pinia 状态管理
│   │   ├── views/              # 页面（含 admin/、developer/ 子目录）
│   │   └── ...
│   └── vite.config.js
├── im-system/                  # ★ CodeDog IM 独立子系统
│   ├── apps/
│   │   ├── server/             # IM 服务端（HTTP API + WebSocket）
│   │   │   ├── src/
│   │   │   │   ├── app.js      # Express + WebSocket 入口
│   │   │   │   ├── auth.js     # SSO Ticket 兑换、会话、防重放
│   │   │   │   ├── accountStatus.js # 接收编程狗账号状态推送
│   │   │   │   ├── captcha.js  # IM 内置验证码（创建群、发消息、搜索）
│   │   │   │   ├── database.js  # MySQL 连接与迁移
│   │   │   │   ├── imageHost.js # 复用编程狗图床
│   │   │   │   ├── replayStore.js # Redis 防重放存储
│   │   │   │   └── config.js
│   │   │   └── package.json
│   │   ├── web/                # IM 用户前端（科幻终端风格）
│   │   └── admin/              # IM 独立后台
│   ├── migrations/             # IM 数据库迁移
│   ├── scripts/
│   │   ├── toolbox.js          # 终端工具箱入口
│   │   ├── keygen.js           # 生成 SSO RSA 密钥对
│   │   ├── bind-community.js   # 把 IM 地址与私钥写入编程狗 .env
│   │   ├── update.js           # 智能更新（备份/迁移/重建）
│   │   └── smoke-local.js      # 本地命令行冒烟测试
│   ├── deploy/nginx.conf       # IM 反向代理示例
│   ├── docker-compose.yml      # 内置 MySQL/Redis（默认不开放公网）
│   ├── docker-compose.external.yml # 外部 MySQL/Redis 部署
│   ├── install.sh              # Linux 一键安装向导
│   ├── im.sh / im.bat          # 工具箱入口
│   ├── update.sh / update.bat  # 独立更新脚本
│   └── .env.example
├── docs/
│   ├── IM-ARCHITECTURE.md      # ★ IM 架构设计文档
│   ├── DEPLOY.md               # 编程狗部署文档
│   └── codemao-api.md
├── scripts/                    # 编程狗主站脚本（含 toolbox.js 管理工具箱）
├── maintenance/                # 维护页静态站点
├── docker-compose.yml          # 编程狗 Docker 编排
├── Dockerfile                  # 编程狗 Docker 构建
├── deploy.sh / deploy.bat      # 编程狗一键部署
├── update.sh / update.bat      # 编程狗更新
├── install-cli.sh / install-cli.bat # 安装 codedog 全局命令
├── DEPLOY.md / DEPLOY_FLY.md / DEPLOY_RENDER.md  # 各平台部署文档
└── README.md
```

## 🔧 常用命令

### Docker 部署

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 进入容器
docker compose exec codedog sh
```

### 本地开发

```bash
# 后端开发模式
cd server && npm run dev

# 前端开发模式
cd client && npm run dev

# 构建前端
cd client && npm run build
```

### IM 本地开发

```bash
cd im-system
npm install
node scripts/keygen.js     # 生成 SSO 密钥对
npm run check               # 单测 + 构建
npm start                   # 启动服务端（默认内存数据库，重启数据清空）
node scripts/smoke-local.js # 命令行冒烟测试
```

## 📋 功能说明

### 内容审核

系统支持两种审核模式：

1. **AI 审核**（推荐）
   - 在后台"系统设置"中配置 AI API 地址和密钥
   - 支持 OpenAI、Claude 等兼容 API
   - 自动分析内容并给出风险评估

2. **敏感词检测**（内置）
   - 无需配置，开箱即用
   - 内置 87,000+ 敏感词库
   - 支持 8 个分类：辱骂、涉黄、涉政、涉暴、诈骗、广告、毒品、其他
   - 可在后台"敏感词管理"页面自定义

### 操作审计

管理员的所有操作都会记录在"操作日志"中，包括：
- 用户管理操作
- 内容审核操作
- 系统配置变更
- 敏感词管理

### 举报管理

- 用户可举报作品、帖子、评论、用户
- 管理员可处理举报，支持 AI 辅助审核
- 举报结果自动通知举报者

### IM 举报处置链路

- IM 用户可对单条消息发起举报，需填写 2-500 字原因
- IM 管理员可执行 `reject / confirm / delete_message / delete_and_disable` 四种处置
- `delete_and_disable` 会反向调用编程狗 `POST /api/users/im-admin/users/:userId/disable` 禁用违规用户
- 处置全程记录 `im_admin_audits`，包含操作者、原因、IP、原值/新值

## ❓ 常见问题

### 1. 端口被占用

修改 `.env` 文件中的端口配置：
```env
CLIENT_PORT=8081
SERVER_PORT=3002
```

### 2. 数据库连接失败

检查数据库配置是否正确，SQLite 无需额外配置。

### 3. 前端无法访问后端 API

检查后端服务是否正常启动，查看控制台日志。

### 4. AI 审核不工作

1. 检查是否在"系统设置"中启用了 AI 审核
2. 检查 AI API 地址和密钥是否正确
3. 未配置时会自动使用敏感词检测

### 5. 如何更新敏感词库

在后台"敏感词管理"页面可：
- 手动添加单个敏感词
- 批量导入敏感词（每行一个）
- 编辑或删除已有敏感词

### 6. IM 跳转后显示"即时通讯系统暂未启用"

编程狗 `.env` 中未配置 `IM_PUBLIC_URL`，或 IM 服务未启动。运行 `npm run bind-community` 重新绑定，或在 IM 服务器执行 `codedogim` 检查容器状态。

### 7. IM 用户被封禁后仍在线

封禁事件通过 `imStatusPush` 推送，IM 收到后立即关闭对应连接（断开码 `4001`）。如 IM 短时不可达，编程狗会按指数退避重试，30 分钟会话上限作为最终兜底，过期后 IM 会主动调用编程狗 `/api/users/im-status` 重新校验。

### 8. IM 后台提示"无聊天记录查看权限"

聊天记录查看为高敏感权限，只有编程狗 `admin/superadmin` 可访问，且每次查询必须填写至少 2 字符的审计原因。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 开源协议

本项目基于 [AGPL-3.0](LICENSE) 协议开源。

**AGPL-3.0 协议要求**：
- ✅ 可以自由使用、修改、分发
- ✅ 衍生作品必须使用相同的AGPL-3.0协议
- ✅ 修改后的代码必须开源
- ✅ 以网络服务形式提供也必须向用户提供源码
- ❌ 不能将代码闭源商业化

## 📸 界面预览

| 首页 | 作品详情 | 后台管理 |
|------|----------|----------|
| ![首页](docs/screenshots/home.png) | ![作品详情](docs/screenshots/work.png) | ![后台管理](docs/screenshots/admin.png) |

## 🙏 致谢

- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Element Plus](https://element-plus.org/) - Vue 3 组件库
- [Express.js](https://expressjs.com/) - Node.js Web 框架
- [Sequelize](https://sequelize.org/) - Node.js ORM
- [Pinia](https://pinia.vuejs.org/) - Vue 状态管理
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [ws](https://github.com/websockets/ws) - WebSocket 实现（IM 实时推送）
