# 编程狗社区 (CodeDog) Code Wiki

> 本文档为 CodeDog 项目的结构化代码百科，覆盖整体架构、模块职责、关键类与函数、依赖关系与运行方式。
> 旧版 Wiki 已过时，本文档基于 IM 系统、开发者平台、OAuth2、论坛版块、工作室论坛等最新代码重写。
> 最后更新：2026-07-17

---

## 快速导航

| 想做的事 | 跳转章节 |
|---|---|
| 第一次接触项目，想了解整体 | [2. 项目概述](#2-项目概述) · [3. 整体架构](#3-整体架构) |
| 查看目录与文件作用 | [4. 项目目录结构](#4-项目目录结构) |
| 理解后端代码 | [5. 服务端架构](#5-服务端架构) |
| 理解前端代码 | [6. 客户端架构](#6-客户端架构) |
| 理解 IM 系统 | [7. IM 系统架构](#7-im-系统架构) |
| 查看核心流程 | [8. 关键流程详解](#8-关键流程详解) |
| 查看数据库表 | [9. 数据库设计](#9-数据库设计) |
| 了解角色权限 | [10. 权限与角色体系](#10-权限与角色体系) |
| 部署/运行项目 | [11. 部署与运行方式](#11-部署与运行方式) |
| 修改配置 | [12. 配置文档](#12-配置文档) |
| 运维管理 | [13. 运维工具箱](#13-运维工具箱) |
| 避免踩坑 | [14. 硬约束与最佳实践](#14-硬约束与最佳实践) |
| 查看脚本与工具 | [15. 脚本与辅助工具](#15-脚本与辅助工具) |

---

## 1. 文档定位与阅读约定

### 1.1 文档定位
- 本文档面向项目维护者、二开者与 AI 助手。
- 重点描述"模块做什么、关键函数在哪、流程怎么走、怎么部署/修改"。
- 不重复 README 的功能介绍，聚焦代码结构。

### 1.2 阅读约定
- 路径以仓库根目录 `codedog/` 为基准，引用源文件时给出相对路径。
- 函数签名采用 `name(params) -> 返回` 简化表示。
- 端点采用 `METHOD /api/path` 格式。
- 角色层级：`user < reviewer < moderator < admin < superadmin`。

### 1.3 与其他文档的关系
- [README.md](./README.md)：面向最终用户的功能介绍与一键部署。
- [DEPLOY.md](./DEPLOY.md)、[DEPLOY_FLY.md](./DEPLOY_FLY.md)、[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)：各平台部署细节。
- [docs/IM-ARCHITECTURE.md](./docs/IM-ARCHITECTURE.md)：IM 设计方案（规划文档）。
- [im-system/README.md](./im-system/README.md)：IM 子项目运维手册。
- [docs/codemao-api.md](./docs/codemao-api.md)：编程猫开放接口参考。

---

## 2. 项目概述

### 2.1 项目定位
CodeDog 是一个基于编程猫账号体系的垂直编程社区，提供作品展示、评论互动、论坛版块、工作室、消息通知、内容审核、开发者开放平台、独立 IM 即时通讯等能力。

### 2.2 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (Composition API) + Vite 5 + Pinia + Vue Router 4 + Element Plus + axios + marked + DOMPurify + highlight.js |
| 后端 | Node.js 20 + Express 4 + Sequelize 6 + JWT + express-session + multer + sharp + bcryptjs |
| 数据库 | SQLite（默认）/ MySQL 8（生产可选） |
| 验证码 | 极验（gt3-sdk）+ hCaptcha |
| IM | 独立子项目 Node.js + Express + ws + Sequelize + Redis + MySQL |
| 部署 | Docker + docker-compose + Nginx + 多阶段构建 |

### 2.3 核心功能特性

**用户端**
- 编程猫账号登录（无注册）/ JWT + httpOnly Cookie 双层鉴权
- 作品展示与导入（按 IDE 型号生成播放器 URL）
- 评论与多级回复 / 点赞 / 收藏 / 关注
- 论坛版块（讨论/问答/分享/教程/工作室/官方公告）+ 草稿 + 订阅 + 修订历史 + 声望系统
- 工作室（成员管理 / 作品投稿 / 工作室论坛 / 邀请码 / 转让 / 黑名单 / 操作日志 / 默认封面生成）
- 消息通知（点赞/评论/回复/提及/关注/系统/举报/开发者应用审核）
- 移动端响应式（底部导航 + 逐页样式）
- 违规警告与保证书签署

**管理端**
- AI 内容审核（自定义 AI API + 内置 87000+ 敏感词库，含 `<user_content>` 防 prompt injection）
- 用户/作品/评论/帖子/工作室/举报/轮播图/公告/IP 封禁/敏感词管理
- 操作日志自动审计（中间件形式）
- 举报合并 + AI 批量审核 + 自动处理
- 模拟登录（impersonate）/ 全端强制下线
- 维护模式 / 系统设置 / 角色权限自定义

**开发者平台**
- OAuth2 应用注册（client_credentials + authorization_code）
- 35+ 开放 API（`/api/open/v1`），按 scope 鉴权
- 调用日志 + 失败日志 + 90 天保留 + 脱敏
- 应用审核 / 限流 / 撤销 token / 重置密钥

**IM 即时通讯系统**
- 独立部署 / 联合部署 两种模式
- RS256 一次性 SSO Ticket + 登录环境绑定（IP 网段 + UA 哈希）
- 私聊 + 100 人默认群聊 + 5000 人硬上限
- 文本/图片消息（复用编程狗图床）+ 消息序号 + 客户端幂等 + 断线补拉
- 管理员聊天检索 + 举报处置 + 持久审计
- 账号状态实时推送（封禁/解封立即踢线）

### 2.4 角色层级

| 角色 | level | 主要权限范围 |
|---|---|---|
| user | 0 | 基础读写 |
| reviewer | 1 | 举报查看/处理 + 作品/评论审核 |
| moderator | 2 | 版主：帖子/评论管理 + 用户警告 |
| admin | 3 | 用户/作品/工作室/系统配置/开发者审核（不含 `log:view`） |
| superadmin | 4 | 全部 32 项权限（含 `log:view`、`role:manage`） |

> 第一个登录用户自动 superadmin（`userController.js:85-92` 登录时检查，`app.js:92-100` 启动时检查）。

---

## 3. 整体架构

### 3.1 三大子项目结构

```
codedog/
├── server/          # 主站后端（Node.js + Express）
├── client/          # 主站前端（Vue 3 + Vite）
├── im-system/       # 独立 IM 子项目（自带 server/web/admin）
├── docs/            # 设计与 API 文档
├── maintenance/     # 维护模式静态页
├── scripts/         # 一次性修复脚本与工具箱
├── docker-compose.yml          # 主站容器编排
├── Dockerfile                  # 主站多阶段构建
├── deploy.sh / deploy.bat      # 一键部署
├── update.sh / update.bat      # 一键更新
├── codedog.sh / codedog.bat    # 管理工具箱入口
├── install-cli.sh / .bat       # 安装 codedog 全局命令
└── .env.example                # 环境变量模板
```

### 3.2 分层架构（主站后端）

```
┌────────────────────────────────────────────┐
│  HTTP 请求 (Express)                       │
└──────────────┬─────────────────────────────┘
               │
   ┌───────────▼───────────┐
   │ 全局中间件              │ app.js
   │ CORS / Helmet / Session │
   │ IP封禁 / hCaptcha / 限流 │
   │ 维护模式 / 操作日志      │
   └───────────┬───────────┘
               │
   ┌───────────▼───────────┐
   │ 路由层 routes/          │ 17 个路由文件
   │ 挂载控制器 + 鉴权 + 校验 │
   └───────────┬───────────┘
               │
   ┌───────────▼───────────┐
   │ 控制器层 controllers/   │ 13 个 controller
   │ 业务编排 + 调用服务      │
   └───────────┬───────────┘
               │
   ┌───────────▼───────────┐
   │ 服务层 services/        │ 17 个 service
   │ AI审核 / 编程猫API / SSO │
   │ 论坛 / 工作室 / 代理池    │
   └───────────┬───────────┘
               │
   ┌───────────▼───────────┐
   │ 模型层 models/index.js  │ Sequelize 模型
   │ + config/database.js    │ SQLite/MySQL 双支持
   └───────────────────────┘
```

### 3.3 前后端数据契约

**统一响应格式**：
```json
{ "code": 200, "msg": "ok", "data": {...} }
```

**分页响应**（`middleware/response.js`）：
```json
{
  "code": 200, "msg": "ok",
  "data": { "list": [...], "pagination": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 } }
}
```

**鉴权方式**：
- 主站：`Authorization: Bearer <jwt>` 或 `cd_token` httpOnly Cookie
- 开放 API：`Authorization: Bearer <access_token>` 或 `__application_token__` 应用令牌
- IM：`im_session` httpOnly Cookie（30 分钟）

### 3.4 主站与 IM 的连接（仅四条链路）

```
[编程狗主站]                              [IM 系统]
    │                                         │
    │ 1. 浏览器跳转 ?ticket=...               │
    │ ─────────────────────────────────────►  │
    │    (RS256 一次性 SSO Ticket)            │
    │                                         │
    │ 2. POST /api/internal/account-status    │
    │ ─────────────────────────────────────►  │
    │    (RS256 状态推送，封禁立即踢线)         │
    │                                         │
    │ 3. POST /api/users/im-admin/users/:id/disable
    │ ◄─────────────────────────────────────  │
    │    (IM 反向调主站，Bearer status_token)  │
    │                                         │
    │ 4. GET /api/geetest/* + GET /api/health │
    │ ◄─────────────────────────────────────  │
    │    (IM 代理极验验证码 + 健康检查)         │
```

不共享数据库、不共享密码、不共享 Cookie。

---

## 4. 项目目录结构

### 4.1 主站后端 `server/`

```
server/
├── app.js                    # 入口：启动、迁移、清理、监听
├── docker-entrypoint.sh      # Docker 启动脚本（探活 MySQL）
├── Dockerfile                # 后端镜像（被根 Dockerfile 引用为 builder）
├── .env.example              # 后端环境变量模板
├── config/
│   ├── auth.js               # JWT/Session 密钥管理（持久化到 .data/secrets/）
│   ├── database.js           # Sequelize 实例 + SQLite PRAGMA
│   └── permissions.js        # 角色/权限定义 + 缓存
├── controllers/              # 13 个控制器
│   ├── adminController.js        # 后台管理（80+ 函数，最大文件）
│   ├── userController.js         # 登录/资料/IM SSO 票据
│   ├── workController.js         # 作品发布/导入/点赞
│   ├── postController.js         # 论坛帖子/版块/草稿/订阅
│   ├── commentController.js      # 评论/回复/点赞
│   ├── studioController.js       # 工作室基础
│   ├── studioForumController.js  # 工作室论坛
│   ├── studioManagementController.js # 工作室高级管理（权限/邀请/转让）
│   ├── developerController.js    # 开发者平台 + OAuth2 + 开放 API
│   ├── favoriteController.js     # 收藏
│   ├── followController.js       # 关注
│   ├── notificationController.js # 通知
│   └── warningController.js      # 违规警告 + 保证书
├── middleware/               # 12 个中间件
│   ├── auth.js                   # JWT 解析 + token_version 校验
│   ├── permission.js             # requirePermission/requireAdmin
│   ├── rateLimit.js              # 内存桶限流（LRU 10000）
│   ├── hcaptcha.js               # hCaptcha 全局守卫（60s 缓存，fail-closed）
│   ├── geetest.js                # 极验动态场景验证
│   ├── ipBan.js                  # IP 封禁（60s 缓存，fail-closed）
│   ├── maintenance.js            # 维护模式
│   ├── oauthAuth.js              # OAuth2 access_token 解析
│   ├── developerOpenApi.js       # 开放 API 限流 + 日志 + 脱敏
│   ├── forumModeration.js        # 版块版主范围权限
│   ├── operationLog.js           # 自动操作日志
│   └── response.js               # 统一响应 + 分页
├── models/
│   └── index.js                  # 35+ Sequelize 模型定义
├── routes/                   # 17 个路由文件
│   ├── adminRoutes.js            # /api/admin（90+ 端点）
│   ├── userRoutes.js             # /api/users
│   ├── workRoutes.js             # /api/works
│   ├── postRoutes.js             # /api/posts
│   ├── commentRoutes.js          # /api/comments
│   ├── studioRoutes.js           # /api/studios
│   ├── favoriteRoutes.js         # /api/favorites
│   ├── followRoutes.js           # /api/follows
│   ├── notificationRoutes.js     # /api/notifications
│   ├── reportRoutes.js           # /api/reports
│   ├── publicRoutes.js           # /api/public（PV/UV/公告/轮播图）
│   ├── uploadRoutes.js           # /api/uploads
│   ├── geetestRoutes.js          # /api/geetest
│   ├── hcaptchaRoutes.js         # /api/hcaptcha
│   ├── developerRoutes.js        # /api/developer
│   ├── oauthRoutes.js            # /api/oauth
│   ├── openRoutes.js             # /api/open/v1（35+ 开放 API）
│   └── dbMigration.js            # /api/admin/db-migration
├── services/                 # 17 个服务
│   ├── aiReview.js               # AI 审核 + 敏感词 + SSRF 防护
│   ├── codemaoApi.js             # 编程猫 API + 代理 + 重试
│   ├── dbMigration.js            # 35 个模型迁移顺序
│   ├── developerApiLogger.js     # 开发者 API 日志（90 天清理）
│   ├── forumHistory.js           # 帖子修订历史
│   ├── forumModeration.js        # 版主范围校验
│   ├── forumReputation.js        # 论坛声望系统
│   ├── geetest.js                # GeetestLib
│   ├── geetestService.js         # 极验配置 + 场景开关
│   ├── hcaptcha.js               # hCaptcha 服务
│   ├── imSso.js                  # IM SSO 票据 + 状态 token
│   ├── imStatusPush.js           # 状态推送队列（文件持久化 + 指数退避）
│   ├── imageHost.js              # 编程狗图床
│   ├── proxyService.js           # HTTPS/SOCKS 代理池
│   ├── seedData.js               # 默认版块种子
│   ├── sessionStore.js           # Sequelize Session Store
│   └── studioCover.js            # 工作室默认封面（sharp 生成 PNG）
├── utils/
│   ├── codemaoPlayer.js          # 编程猫播放器 URL 构造
│   ├── dbAdapter.js              # Sequelize 适配器 + 分页 + 防负数
│   ├── logger.js                 # 5MB 轮转日志 + console 劫持
│   ├── oauth.js                  # OAuth2 scope/secret/redirect_uri 工具
│   ├── safeLog.js                # 敏感字段脱敏（循环引用检测）
│   └── security.js               # XSS/SQL LIKE 转义 + 安全校验
├── scripts/                  # 运维脚本
│   ├── checkAvatars.js
│   ├── fix-ipban-dirty-data.js
│   ├── repairImageUrls.js
│   ├── smoke-developer-*.js      # 开发者 API 冒烟测试
│   ├── smoke-oauth-utils.js
│   └── test-db-migration.js
└── uploads/                  # 头像/图片上传目录（运行时生成）
```

### 4.2 主站前端 `client/`

```
client/
├── index.html               # Vite 入口 HTML
├── vite.config.js           # Vite 配置（@别名 + /api 代理）
├── nginx.conf               # 生产 Nginx 配置（SPA fallback）
├── Dockerfile               # 前端镜像（被根 Dockerfile 引用为 builder）
├── .env.production          # 生产构建变量
└── src/
    ├── main.js              # 入口：Pinia + Router + Element Plus + 全局图标
    ├── App.vue              # 应用外壳（顶栏/公告/警告/hCaptcha/精致鼠标）
    ├── api/                 # 17 个 API 模块
    │   ├── request.js           # axios 封装（401 防抖 + hCaptcha 全局事件）
    │   ├── admin.js             # 后台管理（含 AI 批量审核、模拟登录）
    │   ├── comment.js
    │   ├── developer.js         # 开发者平台 + OAuth
    │   ├── favorite.js
    │   ├── follow.js
    │   ├── geetest.js
    │   ├── hcaptcha.js
    │   ├── im.js                # IM SSO 票据
    │   ├── notification.js
    │   ├── post.js              # 论坛 + 草稿 + 订阅 + 声望
    │   ├── public.js            # PV/UV/公告/轮播图/活跃用户
    │   ├── report.js
    │   ├── studio.js            # 工作室大模块
    │   ├── upload.js
    │   ├── user.js              # 登录/资料/警告
    │   └── work.js
    ├── components/          # 9 个组件
    │   ├── AppImage.vue         # 防盗链图片 + 失败回退
    │   ├── GeetestCaptcha.vue   # 极验嵌入式
    │   ├── GeetestDialog.vue    # 极验对话框
    │   ├── HCaptchaDialog.vue   # hCaptcha 全局对话框
    │   ├── MarkdownEditor.vue   # Markdown 编辑器（marked + DOMPurify）
    │   ├── MobileBottomNav.vue  # 移动端底部导航
    │   ├── SocialCardPicker.vue # IM 名片选择器
    │   ├── SocialCommentCard.vue# IM 名片渲染
    │   └── WysiwygEditor.vue    # 富文本编辑器（仿 Word）
    ├── composables/
    │   └── useGeetestConfig.js  # 极验配置单例 + Promise 缓存
    ├── router/
    │   └── index.js             # 20 个路由 + 全局守卫
    ├── stores/              # Pinia
    │   ├── user.js              # 登录态（httpOnly Cookie 模式）
    │   └── notification.js      # 通知（并发竞态保护）
    ├── styles/
    │   ├── main.scss            # CSS 变量 + Element Plus 主题覆盖
    │   └── mobile.scss          # 移动端响应式（768px + 380px 双断点）
    ├── utils/
    │   └── format.js            # 时间格式化（兼容 MySQL 无时区字符串）
    └── views/               # 视图层
        ├── Home.vue             # 首页（轮播 + 推荐 + 鼠标光晕）
        ├── Works.vue            # 作品列表
        ├── WorkDetail.vue       # 作品详情（iframe sandbox 播放器）
        ├── Community.vue        # 社区帖子列表
        ├── PostDetail.vue       # 帖子详情（WysiwygEditor 编辑）
        ├── Studio.vue           # 工作室列表
        ├── StudioDetail.vue     # 工作室详情（Tab：作品/成员/管理）
        ├── Login.vue            # 登录页（编程猫账号）
        ├── Publish.vue          # 发布作品
        ├── Profile.vue          # 个人中心
        ├── MyWorks.vue
        ├── Favorites.vue
        ├── UserProfile.vue      # 用户公开主页
        ├── Notification.vue     # 通知中心（8 类型 Tab）
        ├── OAuthAuthorize.vue   # OAuth2 授权同意页
        ├── Admin.vue            # 后台管理单页（272KB，activeMenu 切换）
        ├── admin/               # 后台子页面（被 Admin.vue 引用）
        │   ├── Init.vue             # 初始化说明
        │   ├── Layout.vue           # 独立布局（未实际使用）
        │   ├── Dashboard.vue
        │   ├── Users.vue
        │   ├── Works.vue
        │   ├── Posts.vue
        │   ├── Studios.vue
        │   ├── Banners.vue
        │   └── Announcements.vue
        └── developer/           # 开发者平台
            ├── DeveloperHome.vue    # 应用管理（4 步创建向导）
            └── DeveloperDocs.vue    # OAuth2 文档
```

### 4.3 IM 系统 `im-system/`

```
im-system/
├── package.json             # monorepo（workspaces: apps/* packages/*）
├── docker-compose.yml       # 内置 MySQL + Redis + im-server + im-web
├── docker-compose.external.yml # 外置 DB 模式
├── Dockerfile               # 多阶段（deps + builder + server + frontend）
├── install.sh               # Linux 一键部署向导
├── im.sh / im.bat           # 工具箱入口
├── update.sh / update.bat   # 智能更新
├── .env.example
├── apps/
│   ├── server/              # @codedog-im/server
│   │   ├── package.json
│   │   └── src/
│   │       ├── app.js           # Express + WebSocket 主入口
│   │       ├── auth.js          # SSO Ticket 验证 + 会话 + 环境绑定
│   │       ├── accountStatus.js # 账号状态推送接收 + Redis
│   │       ├── captcha.js       # 极验代理（3 场景）
│   │       ├── config.js        # 环境变量 + 启动校验
│   │       ├── database.js      # 内存/MySQL 双实现 + 8 个迁移版本
│   │       ├── imageHost.js     # 图床代理（文件签名校验）
│   │       └── replayStore.js   # Redis 防重放 + 账号状态
│   ├── web/                # @codedog-im/web（用户端，单文件 Vue）
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.vue          # 单文件应用（约 300 行）
│   │       ├── main.js
│   │       ├── theme.css        # 科幻主题
│   │       └── mobile.css       # 移动端
│   └── admin/              # @codedog-im/admin（管理后台，单文件 Vue）
│       └── src/App.vue          # 9 个区块（仪表盘/用户/会话/审计/举报/群/在线/日志/设置）
├── deploy/
│   └── nginx.conf           # 前端 Nginx（/im /im/admin /im/api /im/ws）
├── scripts/
│   ├── keygen.js            # 生成 RSA 密钥对（3072 位）
│   ├── toolbox.js           # 11 项管理工具箱
│   ├── update.js            # 智能更新（仅在文件变化时重建）
│   ├── bind-community.js    # 主站绑定（写 IM_PUBLIC_URL + 私钥到 .env）
│   └── smoke-local.js       # 本地冒烟测试
├── migrations/
│   └── README.md            # 迁移规范
└── secrets/                 # SSO 公私钥（运行时生成，chmod 600）
```

### 4.4 顶层辅助文件

| 文件 | 作用 |
|---|---|
| [deploy.sh](./deploy.sh) / [deploy.bat](./deploy.bat) | 一键部署：检查环境 → 生成 .env → docker compose up |
| [update.sh](./update.sh) / [update.bat](./update.bat) | 一键更新：备份 → git pull → 重建 → 重启 |
| [codedog.sh](./codedog.sh) / [codedog.bat](./codedog.bat) | 管理工具箱入口（9 项菜单） |
| [install-cli.sh](./install-cli.sh) / [install-cli.bat](./install-cli.bat) | 安装 `codedog` 全局命令 |
| [scripts/toolbox.js](./scripts/toolbox.js) | 工具箱主逻辑（状态/日志/更新/修复/数据库/敏感词/配置/清理） |
| [scripts/check-consistency.js](./scripts/check-consistency.js) | 一致性检查 |
| [scripts/security-attack-test.js](./scripts/security-attack-test.js) | 安全攻击模拟测试 |
| [maintenance/](./maintenance/) | 维护模式静态页 + Nginx 配置 |
| [fly.toml](./fly.toml) / [render.yaml](./render.yaml) | Fly.io / Render 部署配置 |

---

## 5. 服务端架构

### 5.1 入口与启动流程（`server/app.js`）

**启动顺序**：

1. 加载 `dotenv`，调用 `installConsoleCapture()` 劫持全局 console（所有日志同步写文件）
2. 创建 Express 应用，`app.disable('x-powered-by')`
3. **信任代理**：生产环境必须配置明确的代理 CIDR 或跳数（例如单层本机反代使用 `TRUST_PROXY=1`）；禁止使用 `TRUST_PROXY=true`。
4. **维护模式中间件**：`MAINTENANCE_MODE=1` 或 `.maintenance` 文件存在时拦截所有请求（放行 `/api/admin/*` 和 `/api/users/login`）
5. **CORS**：基于 `CORS_ORIGIN` 白名单，逗号分隔多域名；未配置时开发环境放行 localhost，生产拒绝
6. **安全头**：`X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy`/严格 CSP（`script-src` 仅放行 geetest/hcaptcha/cloudflareinsights）
7. **限流**：
   - `loginRateLimiter`：15min/10 次，key=`${ip}:${username}`
   - `codemaoImportRateLimiter`：10min/20 次，挂载在 `/api/works/import`
   - `writeRateLimiter`：1min/120 次，跳过 GET/HEAD/OPTIONS
8. **JSON 体解析**：256KB 上限 + JSON 错误中间件（400/413）
9. **查询参数归一化**：`page`/`pageSize` 强制整数化，`pageSize` 上限 100
10. **Session**：`express-session` + `codedog.sid` Cookie + 30 分钟过期；生产环境用 `createSequelizeSessionStore`
11. **IP 封禁中间件**（在限流之前，避免占用限流配额）
12. **hCaptcha 全局守卫**
13. 静态文件 `/uploads`
14. 挂载 17 个路由
15. `/api/health` 健康检查端点
16. 前端静态文件 + SPA fallback

**`startServer()` 启动序列**：

```
testConnection()              → 数据库连通 + SQLite PRAGMA (foreign_keys=ON, journal_mode=WAL)
清理残留临时表                → 删除 *_backup 表（Sequelize alter 中断遗留）
列预检迁移                    → ensureColumn() 给旧库补齐 35+ 新增列
sequelize.sync()              → 开发环境 alter:true，生产环境无 alter
论坛默认版块种子              → 6 个默认版块（讨论/问答/分享/教程/工作室/官方公告）
旧工作室论坛数据迁移          → StudioForumPost/Reply 迁移到 Post/Comment
imStatusPush.startImStatusPush() → 启动状态推送定时器
sessionStore.sync()           → 同步 session 表
proxyService.loadConfig()     → 加载代理池配置
帖子状态迁移                  → 'active' → 'published'
图片 URL 反引号清理           → SQL REPLACE 清洗 7 个字段（avatar/preview/work_url/cover/cover_url/image_url）
refreshRoleCache()            → 刷新角色权限缓存
ensureInitialSuperadmin()     → 检查是否存在 superadmin
app.listen(PORT)              → 启动 HTTP 服务
SIGTERM/SIGINT 优雅停机       → server.close() + sequelize.close()，5 秒强制退出
```

### 5.2 配置层 `config/`

#### 5.2.1 `config/auth.js` — 密钥管理

| 函数 | 作用 |
|---|---|
| `isValidJwtSecret(s)` | 长度 ≥32 + 不在弱密钥黑名单 |
| `isValidSessionSecret(s)` | 同上 |
| `getOrCreatePersistentSecret(filename, options)` | 文件持久化（`wx` 排他写防并发）保存到 `.data/secrets/` |
| `resolveJwtSecret()` | 优先 `process.env.JWT_SECRET`，否则读文件，最后生成并持久化 |
| `resolveSessionSecret()` | 同上 |

**关键设计**：PM2 cluster 模式下各 worker 共享同一密钥文件，避免签名不一致。

#### 5.2.2 `config/database.js` — 数据库配置

- 读取 `DB_TYPE`（默认 sqlite）和 `DB_*` 环境变量
- **SQLite**：`storage` 默认 `./data/database.sqlite`，`afterConnect` 钩子在每个新连接执行 `PRAGMA foreign_keys=ON`（连接级设置，非数据库级），`pool.max=5`，重试 `SQLITE_BUSY/LOCKED`
- **MySQL**：`timezone: '+08:00'`，`charset: utf8mb4`，`pool.max=10`，连接类错误重试 5 次
- `testConnection()`：authenticate 之后调 `applySqlitePragmas()` 开启 `foreign_keys=ON` + `journal_mode=WAL`

#### 5.2.3 `config/permissions.js` — 权限配置

**5 级角色定义**：`DEFAULT_ROLES`（user/reviewer/moderator/admin/superadmin）

**32 项权限**：`ALL_PERMISSIONS` 数组，按 8 分类组织（举报/作品/评论/帖子/用户/公告/轮播图/系统功能）

**关键函数**：
| 函数 | 作用 |
|---|---|
| `getRole(name, RolePermission)` | 优先从数据库读自定义权限，否则用默认 |
| `getRoleSync(name)` | 同步版本，从 `cachedRoles` 读取（中间件用） |
| `refreshRoleCache(RolePermission)` | 启动时调用，刷新缓存；level 字段受保护不被 DB 覆盖 |
| `hasPermission(userRole, perm)` | 通配符 `*` 或精确匹配 |
| `isRoleAtLeast(role, minRole)` | 5 级层级比较 |
| `canManageUser(manager, target)` | **严格大于**才返回 true（同级拒绝，防 admin 改 admin） |

### 5.3 中间件层 `middleware/`

#### 5.3.1 `auth.js` — 鉴权

| 函数 | 作用 |
|---|---|
| `getBearerToken(req)` | 从 `Authorization: Bearer xxx` 取 token |
| `parseCookieToken(req)` | 从 `cd_token` Cookie 取 token |
| `getToken(req)` | 合并两种来源 |
| `setTokenCookie(res, token)` | httpOnly + Secure + SameSite=Lax |
| `resolveUserFromToken(token)` | **强制 HS256 算法**，比对 `token_version` 与 `password_changed_at` |
| `authMiddleware` | 强制登录 |
| `optionalAuth` | 可选登录（公开端点附带用户上下文） |
| `adminMiddleware` | 要求 reviewer+ |
| `reviewerOrAboveMiddleware` | 同上 |

**安全要点**：JWT 强制 `algorithms: ['HS256']` 防 `alg=none` 攻击；密码修改后 `password_changed_at` 更新，旧 Token 立即失效。

#### 5.3.2 `permission.js` — 权限校验

- `requirePermission(perm)`：检查 `req.user` 是否具备指定权限
- `requireRole(role)` / `requireAdmin` / `requireSuperAdmin`

#### 5.3.3 `rateLimit.js` — 限流

- `createRateLimiter({ windowMs, max, keyPrefix, keyGenerator })`：内存桶限流器
- `getClientIp(req)`：兼容 trust proxy
- 内部 `MAX_BUCKETS = 10000` LRU 驱逐，避免内存爆炸

#### 5.3.4 `hcaptcha.js` — hCaptcha 全局守卫

- `isHcaptchaEnabled()`：**60 秒缓存**，从数据库读 `hcaptcha_enabled`
- `hcaptchaGuard(scene)`：中间件，**fail-closed**（验证失败拒绝请求）
- `verifyHcaptcha(token)`：调 hCaptcha siteverify
- `invalidateHcaptchaCache()`：admin API 修改时立即调用，使 60 秒缓存立即失效

#### 5.3.5 `geetest.js` — 极验动态场景

- `geetestVerify(sceneOrFn)`：支持函数入参，如评论场景根据 `req.body?.parent_id` 区分 `comment`/`reply`
- `cleanupRejectedUpload`：清理被拒绝的上传文件

#### 5.3.6 `ipBan.js` — IP 封禁

- `checkIpBanned(ip)`：**60 秒缓存**，从 IpBan 表查询
- `invalidateIpBanCache()`：admin 操作时立即调用
- `ipBanMiddleware`：**fail-closed**

#### 5.3.7 `maintenance.js` — 维护模式

- `isMaintenanceMode()`：环境变量 `MAINTENANCE_MODE=1` 或 `.maintenance` 文件存在
- `maintenanceMiddleware`：放行 `/api/admin/*` 与 `/api/users/login`
- `getMaintenancePage()`：返回维护页面 HTML

#### 5.3.8 `oauthAuth.js` — OAuth2 鉴权

- `oauthAuth`：解析 `Authorization: Bearer xxx` 或 `__application_token__` 应用 token
- `requireApplicationToken`：强制要求应用 token（公开数据接口）
- `requireScopes(...scopes)` / `requireAnyScopes(...scopes)`

#### 5.3.9 `developerOpenApi.js` — 开放 API 中间件

- `perAppRateLimiter(models)`：按 `client_id` 限流（默认 60 req/min）
- `authFailLimiter`：登录失败限流（防爆破）
- `failLogMiddleware(models)`：失败请求写入 `developer_api_fail` 日志
- `redact(obj)`：脱敏响应体（自动屏蔽 token/secret/password）
- `captureRequest(req)` / `installResponseCapture(res)`：拦截请求/响应用于日志

#### 5.3.10 `forumModeration.js` — 版主范围权限

- `requireForumPostPermission(perm)`：从 `req.params.postId` 反查帖子所属版块，验证当前用户是否该板块版主
- `requireScopedCommentPermission(perm)`：针对评论所属帖子/作品

#### 5.3.11 `operationLog.js` — 自动操作日志

- `sanitize(obj)`：脱敏快照
- `auditAdminRequest()`：**中间件形式自动审计所有 admin 路由**，记录 before/after 快照
- `logOperation(req, action, targetType, targetId, details)`：手动埋点

#### 5.3.12 `response.js` — 统一响应

- `successResponse(res, data, msg)` → `{ code: 200, msg, data }`
- `errorResponse(res, msg, code)` → `{ code, msg, data: null }`
- `paginateResponse(res, rows, count, page, pageSize)`：含 `pagination` 字段，NaN 防御

### 5.4 数据模型层 `models/index.js`

定义 35+ Sequelize 模型，全部 `timestamps: true + underscored: true`，由 Sequelize 自动维护 `created_at`/`updated_at`。

**核心模型清单**（按业务分组）：

| 分组 | 模型 | 关键字段 |
|---|---|---|
| 用户 | User | codemao_user_id, username, password, role, status, token_version, password_changed_at, profile_cover, show_favorites |
| 作品 | Work | codemao_work_id, name, preview, work_url, ide_type, user_id, status(pending/published/rejected/hidden/deleted), is_featured |
| 评论 | Comment | content, user_id, work_id, post_id, parent_id, reply_to_user_id, legacy_studio_forum_reply_id, status |
| 论坛 | Post | title, content, user_id, board_id, studio_id, post_type, last_reply_at, last_reply_user_id, reply_count, participant_count, is_locked, slow_mode_seconds, accepted_comment_id, merged_into_post_id, hidden_reason(ai_review/manual), tags(JSON) |
| 论坛 | ForumBoard | slug, name, icon, color, sort_order, studio_recruitment_only, allow_post_roles(JSON) |
| 论坛 | ForumBoardSubscription / ForumBoardModerator / PostSubscription / PostDraft / PostRevision / ForumModerationLog | 订阅/版主/草稿/修订/审核日志 |
| 工作室 | Studio | name, owner_id, vice_owner_id, member_count, work_count, total_score, points, level, member_limit, recruitment_status, application_questions(JSON), im_group_id, owner_claim(唯一索引防并发) |
| 工作室 | StudioMember | studio_id, user_id, role(owner/vice_owner/admin/member), status, permissions(JSON), application_message, application_answers(JSON), review_reason, reviewed_by |
| 工作室 | StudioWork / StudioPointLog / StudioInvite / StudioOperationLog / StudioAnnouncement / StudioTask / StudioBlacklist / StudioDiscussion / StudioForumPost / StudioForumReply | 工作室业务全表 |
| 互动 | Favorite / Follow / Like | 收藏/关注/点赞 |
| 举报 | Report / ReportAuditLog | type, target_id(多态), status(pending/processing/resolved/rejected/merged), merged_from_ids |
| 通知 | Notification | type, user_id, actor_id, target_type, target_id, is_read, meta |
| 审核 | UserWarning | user_id, source_title, source_content, reason, type, status |
| 系统 | Banner / Announcement / SensitiveWord / IpBan / OperationLog / SystemConfig / Visit / RolePermission / DeveloperApp / DeveloperAppAuditLog / OAuthAuthorization / OAuthAccessToken / OAuthRefreshToken / DeveloperAppCall / DeveloperApiFail | 系统/开发者平台 |
| OAuth | OAuthAuthorization / OAuthAccessToken / OAuthRefreshToken | OAuth2 三表 |

**关键设计决策**：
- M3：`Work.user_id` 改为 `allowNull: false`
- M4/M5：`StudioMember`/`StudioWork` 加复合唯一索引防重复
- M7：`status` 字段统一改 ENUM
- M8：`Follow` 加 `beforeCreate` hook 防自关注
- M10：`Comment` 自引用 `onDelete: 'SET NULL'`
- M21/M22：高频查询字段补索引
- M24：`Post.tags` getter 返回 `[]` 而非 `null`
- M25：`RolePermission.permissions` 加 JSON get/set
- L8：`User.codemao_token` 当前明文存储（TODO 待 AES-256-GCM 加密）
- `Studio.owner_claim` 唯一索引：`status != 'banned'` 时等于 `owner_id`，banned 时为 NULL，实现数据库级"每人一个工作室"

### 5.5 路由层 `routes/`

详见各路由文件，关键挂载点：

| 路由 | 挂载路径 | 前置中间件 | 端点数 |
|---|---|---|---|
| adminRoutes | `/api/admin` | authMiddleware + adminMiddleware + auditAdminRequest | 90+ |
| userRoutes | `/api/users` | 按端点 | 10 |
| workRoutes | `/api/works` | 按端点 | 11 |
| postRoutes | `/api/posts` | 按端点 | 16 |
| commentRoutes | `/api/comments` | 按端点 | 5 |
| studioRoutes | `/api/studios` | 按端点 | 30+ |
| favoriteRoutes | `/api/favorites` | 按端点 | 5 |
| followRoutes | `/api/follows` | 按端点 | 5 |
| notificationRoutes | `/api/notifications` | authMiddleware | 6 |
| reportRoutes | `/api/reports` | authMiddleware + geetest | 2 |
| publicRoutes | `/api/public` | visitRateLimiter | 4 |
| uploadRoutes | `/api/uploads` | authMiddleware + multer | 1 |
| geetestRoutes | `/api/geetest` | registerRateLimiter | 4 |
| hcaptchaRoutes | `/api/hcaptcha` | verifyRateLimit | 4 |
| developerRoutes | `/api/developer` | authMiddleware | 11 |
| oauthRoutes | `/api/oauth` | authFailLimiter | 5 |
| openRoutes | `/api/open/v1` | failLog + oauthAuth + perAppRateLimit | 35+ |
| dbMigration | `/api/admin/db-migration` | superadmin | - |

### 5.6 控制器层 `controllers/`

#### 5.6.1 `adminController.js`（80+ 函数，最大文件）

按功能分组：

**统计**：`getStats`（14 项指标聚合）、`getTrends`、`getCaptchaStats`

**用户管理**：
- `getUsers` / `getUserDetail` / `getUserCodemaoToken`（superadmin 专享，写操作日志）
- `updateUser` / `updateUserPassword`（强制 `token_version+1` + `password_changed_at=new Date()`）
- `updateUserStatus` / `updateUserRole` / `deleteUser` / `updateUserLevel`
- `impersonateUser`（admin+ 一键登录，JWT 注入 `impersonatedBy`）/ `restoreFromImpersonate`

**作品管理**：`getWorks` / `updateWork` / `setWorkFeatured` / `deleteWork` / `recalibrateAllWorks`（superadmin 三步：扫描→确认→应用）

**爬取**：`crawlWork` / `crawlHotWorks` / `crawlUserWorks` / `crawlPostWorks` / `crawlBanners` / `getRealtimeLogs`

**评论/帖子**：`getComments` / `updateCommentStatus` / `getPosts` / `getPostHistory` / `restorePostRevision` / `movePost` / `mergePosts` / `setPostEssence` / `setPostTop` / `deletePost`

**轮播图/公告**：CRUD

**举报管理**：
- `getReports`（带 `canAccessReport` 角色范围限制）
- `handleReport`（写 `addReportAuditLog` 审计）
- `getDuplicateReportGroups` + `mergeReports`（**举报合并**）
- `aiReviewReport` / `aiBatchReviewReports` / `aiAutoHandleReports`（**AI 自动处理**）

**系统**：`getIpBans` / `addIpBan` / `removeIpBan` / `getSystemConfigs` / `updateSystemConfig` / `getOperationLogs` / `getSensitiveWords` / `batchImportSensitiveWords` / `testSensitiveCheck`

**权限**：`getPermissions` / `getRolePermissionsList` / `updateRolePermissions` / `resetRolePermissions`（superadmin）

**工作室**：`getStudios` / `updateStudio` / `updateStudioStatus` / `updateStudioPoints` / `updateStudioMember` / `removeStudioMember` / `deleteStudio` / `setWorkScore`

**开发者平台审核**：`adminListApps` / `adminReviewApp` / `adminUpdateAppRateLimit` / `adminRevokeAllTokens` / `adminRegenerateSecret` / `adminDeleteApp` / `adminListAuditLogs` / `adminCallLogStats`

#### 5.6.2 `userController.js`

- `login`：编程猫 OAuth 登录，写 `cd_token` httpOnly Cookie，第一个登录用户自动 superadmin
- `logout` / `getCurrentUser` / `updateProfile`（含头像上传 + AI 审核）
- `getUserById`（公开用户主页）
- **`createImSsoTicket`**：IM SSO 票据签发（调 `imSso.createImTicket`，60 秒短时票据 + RS256 + IP/UA 哈希绑定）
- `getImAccountStatus` / `disableUserFromIm`（IM 管理员禁用用户，签名验证）

#### 5.6.3 `workController.js`

- `publishWork`：事务包裹，调 `codemaoApi.getWorkDetail` 抓取作品
- `getWorks` / `getWorkDetail`（**浏览量冷却**，同 IP/同 user 短时间不重复计数）
- `importWork`：按角色分支鉴权（管理员可导入任意，普通用户只能导入自己的）
- `likeWork`：事务保护防 `SequelizeUniqueConstraintError`
- `deleteWork`：级联删除评论/点赞/收藏 + 触发 `recalculateStudioStats`
- `updateWork`：含 AI 审核

#### 5.6.4 `postController.js`

- `createPost`：支持 `board_id`（版块）/ `studio_id`（工作室主题）/ `is_recruit`（招募帖）
- `getPosts` / `getPostDetail` / `updatePost`（写 `forumHistory.recordPostRevision`，**重试 3 次防并发**）
- `deletePost`：软删除，触发 `forumReputation.invalidateForumReputation`
- `likePost` / `favoritePost` / `unfavoritePost`：带 `likeRateLimit`
- `acceptAnswer`：问答帖采纳
- `getBoards` / `toggleBoardSubscription` / `togglePostSubscription` / `getDraft` / `saveDraft` / `deleteDraft`
- `getLeaderboard` / `getUserReputation` / `getUserForumPosts` / `getMyForumSubscriptions`

#### 5.6.5 `commentController.js`

- `createComment`：根据 `parent_id` 自动切换 scene（comment/reply），触发 AI 审核
- `getWorkComments` / `getCommentReplies` / `deleteComment`（递归软删除子评论）/ `likeComment`

#### 5.6.6 `studioController.js`

- `createStudio`：含 `owner_claim` 唯一索引防并发，调 `studioCover.generateAndUploadStudioCover` 生成默认封面
- `joinStudio` / `leaveStudio` / `kickMember`
- `recalculateStudioStats`：重新计算 `work_count` + `total_score`
- `submitWork` / `reviewWork` / `removeWork` / `toggleWorkStatus`
- `setViceOwner` / `setMemberRole` / `reviewMember` / `dissolveStudio`

#### 5.6.7 `studioForumController.js`

工作室内部独立论坛：`listPosts` / `getPost` / `createPost` / `createReply` / `updatePostState` / `deletePost`

#### 5.6.8 `studioManagementController.js`

**12 项权限**：`manage_members` / `manage_works` / `manage_settings` / `manage_announcements` / `manage_invites` / `manage_blacklist` / `view_logs` / `view_analytics` / `submit_work` / `review_work` / `transfer_ownership` / `dissolve_studio`

**角色默认**：`owner`（全权限）/ `vice_owner`（管理类）/ `admin`（部分管理）/ `member`（基础）

- `effectivePermissions(member)`：合并角色默认 + 自定义权限
- `setMemberPermissions` / `createInvite` / `revokeInvite` / `acceptInvite`
- `transferOwnership`（**防假_OWNER**：禁止直接 PUT role=owner）
- `getCapabilities` / `listAnnouncements` / `createAnnouncement` / `updateSettings` / `getAnalytics` / `listLogs` / `listBlacklist` / `addBlacklist` / `removeBlacklist`

#### 5.6.9 `developerController.js`

- `listMyApps` / `getMyApp` / `createApp` / `updateApp` / `rotateSecret` / `uploadAppLogo`
- `listMyAuthorizations` / `revokeMyAuthorization`
- `getAuthorizeInfo` / `approveAuthorize`（OAuth2 `/authorize` 流程）
- `tokenEndpoint`（authorization_code + refresh_token）
- `revokeToken` / `userinfo`（OIDC 风格）
- admin 函数：`adminListApps` / `adminReviewApp` / `adminUpdateAppRateLimit` / `adminRevokeAllTokens` / `adminRegenerateSecret` / `adminDeleteApp` / `adminListAuditLogs` / `adminCallLogStats`
- 开放 API：`openMe` / `openMyWorks` / `openPublicWorks` / `openSearch` 等 30+ 函数

#### 5.6.10 其他 controller

- `favoriteController`：`addFavorite` / `removeFavorite` / `getMyFavorites` / `getUserFavorites` / `checkFavorite`
- `followController`：`followUser` / `unfollowUser` / `getFollowers` / `getFollowing` / `checkFollow`（含 `status: 'active'` 过滤防禁用用户被枚举）
- `notificationController`：`getNotifications` / `getUnreadCount` / `markAsRead` / `markAllAsRead` / `deleteNotification` / `clearAll` / `createNotification`
- `warningController`：`issueWarning` / `getPendingWarning` / `acknowledgeWarning`（保证书签署）

### 5.7 服务层 `services/`

#### 5.7.1 `aiReview.js` — AI 审核

- `validateAIEndpoint(url)`：**SSRF 防护**，拒绝内网/环回/保留 IP
- `buildPinnedIpAgents(hostname, ip)`：**DNS pinning** 防 DNS 重绑定
- `extractJSONObject(text)`：平衡括号计数从 LLM 输出提取 JSON
- `reviewContent(content, options)`：主入口，AI 审核 + **强制 `<user_content>` 标签防 prompt injection**
- `fallbackReview(content)`：内置敏感词检测
- `builtinSensitiveCheck` / `externalSensitiveCheck` / `mergeResults`

#### 5.7.2 `codemaoApi.js` — 编程猫 API

- `getProxyAgent()` / `getAxiosConfig()`：组合代理 + 超时 + UA
- `requestWithRetry(fn, retries)`：自动重试
- `getWorkDetail(codemaoWorkId)`：调用编程猫 API

#### 5.7.3 `dbMigration.js`

- `MODEL_ORDER`：35 个模型的迁移顺序
- `getCanonicalModelEntries()` / `getCanonicalModels()`

#### 5.7.4 `developerApiLogger.js`

`DeveloperApiLogger` 类：批量缓冲日志 + 定时 flush + 90 天自动清理

#### 5.7.5 `forumHistory.js`

- `snapshotPost(post)` / `recordPostRevision(post, editorId)`（**重试 3 次防并发**）/ `recordModerationLog`

#### 5.7.6 `forumModeration.js`

`getModeratedBoardIds(userId)` / `canModerateBoard(userId, boardId)`

#### 5.7.7 `forumReputation.js`

- `buildBadges(user)` / `titleFor(reputation)` / `buildReputationCache(userId)`（60 秒缓存）
- `getForumLeaderboard()` / `getUserForumReputation(userId)` / `invalidateForumReputation(userId)`

#### 5.7.8 `geetest.js` / `geetestService.js` / `hcaptcha.js`

- `GeetestLib`：`register`（10s 超时）/ `validate`（8s 超时）
- `geetestService`：`getConfig()` / `isSceneEnabled(scene)` / `verify()`
- `HCaptchaService`：`verify(token)` 调 siteverify

#### 5.7.9 `imSso.js` — IM SSO 核心

- `normalizeIp(ip)` / `networkKey(ip)`：IPv4 取 /24，IPv6 取 /64
- `signingKey()`：从数据库读取 RSA 私钥
- `clientContext(req)`：IP + UA 哈希
- **`createImTicket(user, req)`**：RS256 签名，60 秒短时票据，绑定 IP/UA 哈希
- `createStatusToken(user)` / `verifyImStatusToken(token)`
- `createImStatusEvent(user, status)` / `getImPublicUrl()`

#### 5.7.10 `imStatusPush.js` — 状态推送队列

- `loadQueue()` / `persistQueue()`：文件持久化待推送队列
- `enqueueImStatus(event)` / `flushQueue()`：**指数退避重试**推送
- `scanRecentUsers()` / `startImStatusPush()`：启动定时器

#### 5.7.11 `imageHost.js`

`uploadToImageHost(file)` / `uploadBufferToImageHost(buffer, filename)` → 上传到 `img.scdn.io`

#### 5.7.12 `proxyService.js`

`ProxyService` 类：HTTPS + SOCKS 代理池 + 自动故障切换 + `startAutoRefresh()` / `loadConfig()` / `setEnabled(bool)`

#### 5.7.13 `sessionStore.js`

`createSequelizeSessionStore(sequelize)` / `getExpiration()` — 15 分钟清理过期 session

#### 5.7.14 `studioCover.js`

`palettes` / `pixelGlyphs` / `renderPixelText()` / `renderBlueArchiveStyleName()` / `createStudioCoverBuffer(name)`（调 `sharp` 生成 PNG）/ `generateAndUploadStudioCover(studio)`

#### 5.7.15 `seedData.js`

填充论坛默认版块 + 系统配置默认值

### 5.8 工具层 `utils/`

#### 5.8.1 `codemaoPlayer.js`

- `FALLBACK_BASE_URLS`：各编辑器型号的播放器 base URL（KITTEN3/KITTEN4/NEMO/NEKO/COCO/WOOD 等）
- `normalizeIdeModel(value)`：统一格式化
- `buildCodemaoPlayerUrl({ workId, playerUrl, type, ideType })`：优先 API 返回的 `player_url`，否则按型号选兜底

#### 5.8.2 `dbAdapter.js`

- `parsePagination(query)`：默认 page=1, pageSize=20, maxPageSize=100
- `DbAdapter` 类：`findAll` / `findOne` / `findByPk` / `findAndCountAll` / `findOrCreate` / `count` / `sum` / `create` / `update` / `destroy` / `bulkCreate` / `upsert` / `increment` / `decrement` / `save` / `getId`
- **关键修复**：`increment`/`decrement` 区分实例调用与模型类调用；实例带 `where` 时回退到模型级（避免防负数保护失效）

#### 5.8.3 `logger.js`

- `LOG_DIR`：`.data/logs/`，`LOG_FILE`：`app.log`，**5MB 自动轮转**（保留最近 3 个 `.bak`）
- `enqueueWrite(level, tag, message)`：异步写入队列
- `installConsoleCapture()`：劫持全局 `console.log/warn/error`
- `getRecentLogs(limit)` / `getRecentLogsSync(limit)`：尾部高效读取

#### 5.8.4 `oauth.js`

- `ALL_SCOPES`：20+ 个 scope（profile/works/comments/posts/studios/follows/favorites/likes/notifications/community/openid/developer）
- `APPLICATION_SCOPES`：8 个应用级 scope
- `APPLICATION_TOKEN_MARKER`：`'__application_token__'`
- `ACCESS_TOKEN_TTL_MS`（2 小时）/ `REFRESH_TOKEN_TTL_MS`（30 天）/ `AUTH_CODE_TTL_MS`（10 分钟）
- `randomToken` / `hashToken` / `hashSecret` / `verifySecret`
- `validateRedirectUri`：**强制 HTTPS**（localhost 例外）
- `publicAppView` / `scopeCatalog`

#### 5.8.5 `safeLog.js`

- `MASK_FIELDS`：password/token/api_key/secret/cookie/email/phone
- `TRUNCATE_ONLY_FIELDS`：description/bio/preview/cover/content（截断 80 字符）
- `maskValue`：智能打码（短串全打码、email 特殊处理、token 三段式）
- `maskSensitive`：递归脱敏 + **循环引用检测**
- `safeLog(tag, data, level)`：**永不抛错**

#### 5.8.6 `security.js`

- `escapeHtml(text)`：转义 `& < > " ' /` 防 XSS
- `escapeLike(value)`：转义 SQL LIKE 通配符 `%` `_` `\`
- `SAFE_SQL_IDENTIFIER`：正则 `/^[A-Za-z_][A-Za-z0-9_]*$/`
- `likeContains(sequelize, columns, keyword)`：**跨方言安全的 LIKE 匹配**，自动附带 `ESCAPE` 子句

### 5.9 后端关键架构特征

1. **双数据库支持**：通过 `DB_TYPE` 切换 SQLite/MySQL，所有 SQL 通过 Sequelize 抽象
2. **JWT + Cookie 双层鉴权**：JWT 用于 API 客户端，Cookie 用于浏览器
3. **token_version 失效机制**：管理员重置密码时 `token_version+1`，所有旧 Token 立即失效
4. **fail-closed 中间件**：hCaptcha 和 IP 封禁查询失败时拒绝请求，避免故障放行
5. **自动操作日志**：`auditAdminRequest()` 中间件形式自动审计所有 admin 路由
6. **SSRF 防护**：AI 审核端点校验拒绝内网 IP + DNS pinning
7. **跨方言 SQL 安全**：`likeContains` 自动生成方言正确的 ESCAPE 子句

---

## 6. 客户端架构

### 6.1 入口与配置

#### 6.1.1 `main.js`

- 创建 Vue app，注册 Pinia + Router + Element Plus（中文 locale `zhCn`）
- 全量注册 `@element-plus/icons-vue` 所有图标为全局组件
- 引入 `styles/main.scss` 和 `styles/mobile.scss`
- 全局错误处理器：`app.config.errorHandler` + `window.addEventListener('unhandledrejection', ...)`

#### 6.1.2 `vite.config.js`

```js
{
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { host: 'localhost', port: 8080,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } } }
}
```

#### 6.1.3 `App.vue`（约 1100 行）

**模板结构**：el-config-provider → 顶栏（Logo + 主菜单 + 平台入口 + 搜索 + 用户区）→ 公告顶部条 → router-view → MobileBottomNav → footer → 公告弹窗队列 → 违规警告保证书对话框 → HCaptchaDialog

**关键逻辑**：
- `userStore.user.id` watch：登录后拉未读数 + 检查 pending warning
- `route.fullPath` watch：每次路由变化调 `publicApi.recordVisit()` 记 PV
- **hCaptcha 状态轮询**：onMounted 立即检查 + 每 30 秒定时检查 + 监听 `hcaptcha-required` 全局事件
- **精致鼠标样式**：仅在 `(hover: hover) and (pointer: fine)` 设备弹确认框，启用后通过 `pointerover` 动态设置 `data-codedog-cursor` 属性
- **impersonate 恢复**：通过 `sessionStorage.getItem('admin_token')` 判断，调 `/users/restore-from-impersonate`
- **`openIm()`**：调 `imApi.createSsoTicket()` 获取 SSO URL 后 `window.open`
- 公告本地存储：`ann_topbar_dismissed` / `ann_popup_dismissed`，仅保留最近 50 条

### 6.2 API 层 `api/`

#### 6.2.1 `request.js` — axios 封装（关键）

- `baseURL`：优先 `import.meta.env.VITE_API_BASE_URL`，默认 `/api`
- `timeout`：30s（AI 审核 120s / 爬取 180s 单独覆盖）
- `withCredentials: true`
- 请求拦截器：兼容模式从 `sessionStorage` 读 token 加 `Authorization: Bearer`
- 响应拦截器：
  - `HCAPTCHA_REQUIRED` 错误码：派发全局 `hcaptcha-required` 事件（5 秒防抖）
  - 401：`isHandling401` 防抖，跳过 `/login`/`/users/me`，500ms 后 `window.location.href` 跳 `/login?redirect=...`
  - 403/404/500：`ElMessage.error`
  - 网络错误：提示

#### 6.2.2 接口清单

| 文件 | 核心接口 |
|---|---|
| `admin.js` | 开发者应用审核、统计、用户管理、作品/帖子操作、轮播图、举报（含 AI 批量审核）、IP封禁、爬取、实时日志、敏感词、权限、工作室、AI 自动处理 |
| `comment.js` | `getWorkComments` / `getReplies` / `createComment` / `deleteComment` / `likeComment` |
| `developer.js` | `developerApi`：scope 文档/应用 CRUD/旋转密钥/上传 Logo/调用记录/授权管理；`oauthApi`：授权信息/同意 |
| `favorite.js` | 收藏 + 帖子收藏 |
| `follow.js` | `follow` / `unfollow` / `check` / `getFollowers` / `getFollowing` |
| `geetest.js` | `getConfig` / `register` / `validate` / `recordShow` |
| `hcaptcha.js` | `getConfig` / `verify` / `getStatus` / `recordShow` |
| `im.js` | `createSsoTicket(action)` → POST `/users/im-sso-ticket` |
| `notification.js` | `getNotifications` / `getUnreadCount` / `markAsRead` / `markAllAsRead` / `deleteNotification` / `clearAll` |
| `post.js` | 草稿/订阅/论坛声望/问答采纳/CRUD |
| `public.js` | `recordVisit` / `getAnnouncements` / `getBanners` / `getActiveUsers` |
| `report.js` | `create` / `getMyReports` |
| `studio.js` | 工作室大模块：CRUD/成员/作品/邀请/能力/黑名单/解散/日志/公告/分析 |
| `upload.js` | `image(file)`（60s 超时） |
| `user.js` | `login` / `getCurrentUser` / `getPendingWarning` / `acknowledgeWarning` / `logout` / `updateProfile` / `updateAvatar` / `getUserById` |
| `work.js` | `publish` / `getList` / `getFeatured` / `getById` / `getDetail` / `getUserWorks` / `getMyWorks` / `like` / `update` / `delete` |

### 6.3 路由 `router/index.js`

20 个路由 + 全局守卫：

**守卫关键逻辑**：
- 标题设置
- `authChecked` 模块级标记：游客首次 401 后即标记，避免每次路由都发 `/users/me` 产生 401 spam
- httpOnly cookie 模式下 token 初始为空，必须先调 `/users/me` 验证 cookie
- 网络错误不标记 `authChecked`（下次路由重试），仅 401 才标记为已确认游客
- 已登录用户访问 `/login` 跳首页
- `requiresAuth` 未登录 → 跳 `/login?redirect=to.fullPath`
- `requiresAdmin` 非管理员 → 跳 `/`

### 6.4 状态管理 `stores/`

#### 6.4.1 `user.js`（Composition API）

- State：`token`（仅占位 `'cookie-session'`）/ `user`
- Getters：`isLoggedIn` / `isAdmin`（admin+superadmin）/ `isStaff`（reviewer+）
- Actions：`login` / `logout` / `fetchCurrentUser`（401 返回 null）/ `updateProfile`

#### 6.4.2 `notification.js`（Options API）

- State：`unreadCount` / `notifications` / `loading` / `_lastRequestId`（并发竞态保护）
- Actions：`fetchUnreadCount` / `fetchNotifications`（防竞态）/ `markAsRead` / `markAllAsRead` / `deleteNotification` / `clearAll` / `decrementUnread` / `incrementUnread`

### 6.5 视图层 `views/`

#### 6.5.1 主功能页面

| 视图 | 功能 |
|---|---|
| Home | 首页：轮播图 + 推荐作品 + 最新作品 + 热门作品 + 鼠标光晕 + 右侧边栏 |
| Works | 作品列表：Hero 头部视差光晕 + 类型筛选 + 搜索 + 排序 |
| WorkDetail | 作品详情：iframe sandbox 播放器 + 作品信息 + 作者卡片 + 点赞/收藏/评论 |
| Community | 社区帖子列表：板块/工作室/标签筛选 + 排序 + 右侧公告/活跃用户 |
| PostDetail | 帖子详情：面包屑 + WysiwygEditor 编辑切换 + 标签 + 评论区 + 问答采纳 |
| Studio | 工作室列表：搜索 + 创建对话框 + "全部/我的"切换 |
| StudioDetail | 工作室详情：封面横幅 + Tab（作品/成员/管理）+ 工作室操作 |
| Login | 登录页：左侧装饰 banner + 右侧表单 + GeetestCaptcha |
| Publish | 发布作品：编程猫作品 ID + GeetestCaptcha |
| Profile | 个人中心：编辑资料/头像/密码 |
| MyWorks / Favorites / UserProfile / Notification | 个人相关页面 |

#### 6.5.2 新增功能页面（重点）

- **OAuthAuthorize** (`/oauth/authorize`)：OAuth2 授权同意页，解析 query 参数，按 risk 分级提示（admin/write/只读），支持 `reauthorization_required`
- **DeveloperHome** (`/developer`)：应用管理控制台，4 步创建向导，草稿自动保存到 localStorage，secret 一次性展示，回调地址校验（localhost 允许 HTTP）
- **DeveloperDocs** (`/developer/docs`)：OAuth2 静态文档（动态加载 scope 列表）
- **Admin** (`/admin`)：272KB 单文件大组件，通过 `activeMenu` 切换 17 个 section
- **Notification** (`/notifications`)：8 种通知类型 Tab，智能跳转（被处理内容不跳、开发者应用跳控制台）

#### 6.5.3 admin 子目录

Init / Layout（未使用）/ Dashboard / Users / Works / Posts / Studios / Banners / Announcements

### 6.6 组件 `components/`

| 组件 | 职责 |
|---|---|
| AppImage | `referrerpolicy="no-referrer"` 绕过编程猫 CDN 防盗链 + 失败回退 |
| GeetestCaptcha | 极验嵌入式，动态加载 `gt.0.5.0.js`（仅一次），暴露 `getValidateData`/`reset`/`verify` |
| GeetestDialog | 极验对话框版，基于 Promise 的 `show(sceneName)` |
| HCaptchaDialog | hCaptcha 对话框，`show(sceneName)` 返回 Promise，`onVerify` 调后端验证 |
| MarkdownEditor | 分屏 Markdown 编辑器（marked + highlight.js + DOMPurify，FORBID_TAGS 包括 style/form/input/iframe/script） |
| MobileBottomNav | 移动端底部导航，5 项 + 创作中央按钮，768px 以下显示 |
| SocialCardPicker | IM 名片选择器（user/group/studio） |
| SocialCommentCard | 识别 `[[codedog-social-card]]` 前缀渲染卡片，点击跳转 IM |
| WysiwygEditor | 仿 Word 富文本编辑器，粘贴图片自动上传，DOMPurify + 白名单 style 过滤 |

### 6.7 composables 与 utils

- `useGeetestConfig.js`：模块级单例 + Promise 缓存解决并发竞态；`fetchGeetestConfig()` / `geetestEnabled(scene)`
- `format.js`：`formatTime`（兼容 MySQL 无时区字符串）/ `relativeTime`（未来时间显示绝对日期）

### 6.8 样式 `styles/`

- `main.scss`：CSS 变量（主题色 `--primary-color: #FEC433` + 圆角层级 + 阴影）+ Element Plus 主题色覆盖 + 通用工具类
- `mobile.scss`：768px + 380px 双断点，逐页面响应式重排

### 6.9 客户端关键架构特征

1. **httpOnly Cookie 模式**：彻底防 XSS 偷 token，前端 `token` 仅作占位
2. **impersonate 一键登录**：管理员模拟普通用户，`admin_token` sessionStorage 标志位
3. **双验证码体系**：Geetest（嵌入式 + 对话框）+ hCaptcha（全局轮询 + 403 自动弹窗）
4. **scene 级别验证码开关**：`scenes[scene] === true` 精细控制
5. **OAuth2 完整流程**：授权码 + client_credentials + 风险分级 + 重新授权 + 草稿自动保存
6. **IM 外部 SSO 集成**：通过 `imApi.createSsoTicket` 拿票据后跳外部 IM
7. **并发竞态保护**：notification store 用 `_lastRequestId` 防止乱序响应
8. **超时分级**：30s 默认 / 60s 上传 / 120s AI 审核 / 180s 爬取

---

## 7. IM 系统架构

### 7.1 整体架构

IM 系统（`im-system/`）是**独立子项目**，与编程狗主站**松耦合**：通过 RS256 SSO 票据 + Redis 状态同步通信，**不共享数据库**、不共享会话。

```
┌─────────────────────────┐         ┌─────────────────────────────────────┐
│   编程狗主站(server/)    │         │            IM 系统(im-system/)       │
│                         │         │                                     │
│  /api/im/sso-ticket ────┼─RS256──▶│ /api/auth/sso/exchange              │
│  /api/im/status-push ───┼─RS256──▶│ /api/internal/account-status        │
│  /api/geetest/*  ◀──────┼─HTTP────│ captcha.js (复用主站极验)            │
│  /api/users/im-admin/* ◀┼─HTTP────│ communityRequest (用户禁用回调)      │
│                         │         │                                     │
│  前端 client/           │         │  apps/web (Vue 用户端)              │
│  ┌─────────────┐        │         │  ┌─────────────┐                    │
│  │ 即时通讯入口 │────────┼─跳转───▶│  │ /im 路由    │──┐                 │
│  └─────────────┘        │         │  └─────────────┘  │                 │
│                         │         │  apps/admin (Vue 后台)              │
│                         │         │  ┌─────────────┐  │                 │
│                         │         │  │ /im-admin   │  │                 │
│                         │         │  └─────────────┘  │                 │
│                         │         │  apps/server (Node + Express + ws)  │
│                         │         │  ┌─────────────┐  │                 │
│                         │         │  │ REST + /ws  │◀─┘                 │
│                         │         │  └──────┬──────┘                    │
│                         │         │         │                           │
│                         │         │  MySQL + Redis (Docker 内置)        │
└─────────────────────────┘         └─────────────────────────────────────┘
```

**关键设计决策**：
- **独立 npm workspaces**：根 `im-system/package.json` 用 `workspaces: ["apps/*", "packages/*"]` 管理三个子包（`@codedog-im/server`、`@codedog-im/web`、`@codedog-im/admin`），可分别 `npm run dev:server/dev:web/dev:admin`
- **双部署模式**：`docker-compose.yml`（内置 MySQL 8.4 + Redis 7.4）或 `docker-compose.external.yml`（外部 MySQL/Redis）
- **路由前缀约定**：用户端 `/im`、管理后台 `/im-admin`（由宿主机 Nginx 反向代理转发到容器内 Nginx）
- **端口隔离**：`im-server` 仅容器内 3100；`im-web` 暴露宿主机 `127.0.0.1:8100`（强制本机，禁止公网直接访问）

### 7.2 服务端 `apps/server/src/` 模块详解

IM 服务端用极简单文件结构实现完整 IM 功能，共 **9 个 JS 文件**，全部位于 `apps/server/src/`：

#### 7.2.1 `app.js`（主入口，约 600 行）
- 创建 Express + Helmet + CORS + JSON body parser
- 注册 REST 路由（约 30 个端点）：
  - **健康检查**：`GET /health` → 探活数据库
  - **SSO 票据兑换**：`POST /api/auth/sso/exchange` → 调 `exchangeTicket` 颁发 30 分钟 `im_session` Cookie
  - **登出**：`POST /api/auth/logout` → 清除 Cookie
  - **当前用户**：`GET /api/me`
  - **极验验证码三件套**：`GET /api/captcha/config` + `GET /api/captcha/register` + `POST /api/captcha/validate`
  - **图片上传**：`POST /api/images`（5MB 限制，jpg/png/webp/gif，sha256 去重，复用编程狗图床）
  - **会话列表**：`GET /api/conversations`
  - **用户搜索**：`POST /api/search`（`requireCaptcha('im_search')`）
  - **私聊申请列表/处理**：`GET /api/conversation-requests` + `POST /api/conversation-requests/:id`
  - **创建私聊**：`POST /api/conversations/direct`（对方状态 `pending`，需接受）
  - **创建群聊**：`POST /api/conversations/group`（`requireCaptcha('im_create_group')`）
  - **群资料**：`GET /api/groups/:id` / `PATCH /api/groups/:id`（含管理员调容量，写 `AdminAudit`）
  - **群成员管理**：`POST /api/groups/:id/members` / `DELETE /api/groups/:id/members/:userId` / `PATCH /api/groups/:id/members/:userId`
  - **消息列表**：`GET /api/conversations/:id/messages`（按 sequence 增量拉取，最多 100 条）
  - **发消息（HTTP 兜底）**：`POST /api/messages`（`requireCaptcha('im_message')`）
  - **举报**：`POST /api/reports`
  - **管理后台**：`GET /api/admin/dashboard` / `GET /api/admin/users` / `GET /api/admin/users/:id` / `GET /api/admin/conversations` / `GET /api/admin/audits` / `POST /api/admin/messages/search` / `GET /api/admin/reports` / `GET /api/admin/reports/:id` / `PATCH /api/admin/reports/:id` / `GET /api/admin/groups`
  - **账号状态推送**：`POST /api/internal/account-status`（主站推送禁用/启用，立即踢下线）
- 启动 HTTP 服务并挂载 `WebSocketServer({ noServer: true })`，在 `server.on('upgrade')` 中：
  - 校验路径必须 `/ws`
  - 校验 Origin 白名单
  - 调 `parseSession(req)` 验证 `im_session` Cookie
  - 调 `assertAccountActive(user)` 确认账号未禁用
  - 握手成功后 `wss.emit('connection', ws, user)`
- `broadcastConversation(conversationId, event, data)`：异步查所有 active 成员并广播

#### 7.2.2 `config.js`（环境变量 + 启动期硬约束）
- `production` 模式硬约束（不满足直接 throw）：
  - `IM_SESSION_SECRET` 至少 32 字符
  - `IM_REDIS_URL` 必填（防重放 + 账号状态缓存）
  - `IM_PUBLIC_ORIGIN` 必填（CORS 白名单 + Cookie Secure）
- 默认值：`port=3100`、`communityInternalUrl=http://host.docker.internal:3001`、`databaseUrl=memory:`、`groupDefaultLimit=100`、`groupHardLimit=5000`
- 公钥路径：`secrets/im_sso_public.pem`（主站私钥签名，IM 公钥验签）

#### 7.2.3 `auth.js`（SSO 票据兑换 + 会话验证 + 登录环境绑定）
**核心函数**：
- `exchangeTicket(ticket, req)`：用公钥 RS256 验签 SSO 票据 → 校验 `purpose='im_sso'` + `jti` + `sub` → **登录环境绑定校验**（IP 哈希 + 浏览器哈希必须匹配）→ `consumeOnce(jti, exp)` 防重放 → `setAccountState` 写账号状态 → 用 `sessionSecret` HS256 签发 30 分钟 `im_session`（含用户全量字段 + 绑定哈希）
- `parseSession(req)`：解析 `im_session` Cookie → HS256 验签 → **二次校验登录环境**（防 Cookie 被盗用）
- `requireSession(req, res, next)`：中间件，无效返回 401 "请重新从编程狗进入"
- `requestContext(req)`：从 `cf-connecting-ip` / `x-forwarded-for` / `x-real-ip` / `req.socket.remoteAddress` 收集所有 IP 候选
- `networkKey(ip)`：IPv4 取前三段（/24 网段），IPv6 取前 4 段，用于"同网段"匹配（兼容家宽 PPPoE 重连）
- `boundHash(nonce, value)`：`sha256(nonce + "\n" + value)` base64url，加 salt 防 IP 哈希碰撞

#### 7.2.4 `accountStatus.js`（账号状态推送验证）
- `acceptStatusPush(token)`：RS256 验签主站推送 → `consumeOnce("status:" + jti)` 防重放 → `setAccountState` 更新状态
- `assertAccountActive(user)`：每次请求/WS 握手时调用，从 Redis/内存读状态 → 若 `status != 'active'` 或 `token_version` 不匹配则 throw 401

#### 7.2.5 `replayStore.js`（Redis + 内存双层防重放）
- `connectReplayStore()`：连接 Redis（生产必填，开发可选）
- `consumeOnce(jti, expiresAtMs)`：Redis `SET NX PX ttl` 或本地 Map，**一次性消费**（SSO 票据 + 状态推送均不可重放）
- `setAccountState(userId, state)` / `getAccountState(userId)`：Redis + 本地 Map 双写，Redis 不可用时降级内存

#### 7.2.6 `database.js`（内存 + MySQL 双实现 + 8 版本迁移）
- `memoryDatabase()`：开发环境用，模拟全部 Sequelize 模型方法（findAll/findOne/findOrCreate/create/count/save/toJSON），通过 `Op.in/gt/gte/like` 实现 where 过滤
- `mysqlDatabase()`：生产环境用 Sequelize + MySQL，定义 9 张表（见 7.5）
- `connectDatabase()`： authenticate → 顺序执行 8 个迁移版本：
  - `001_initial_im_schema`：创建 conversations/members/messages/groups/audits
  - `002_image_host_metadata`：创建 images 表
  - `003_remove_read_receipts`：删除 `last_read_sequence`（不收集已读回执，保护隐私）
  - `004_im_reports`：创建 reports 表
  - `005_im_user_profiles`：创建 user_profiles 表（SSO 缓存）
  - `006_im_profile_codemao_id`：增加 codemao_user_id 字段
  - `007_im_report_resolution`：增加 resolution_reason/resolved_by/resolved_at
  - `008_im_report_actions`：增加 resolution_action（reject/confirm/delete_message/delete_and_disable）

#### 7.2.7 `captcha.js`（极验验证码 + Grant JWT）
- 三个场景：`im_message`（发消息）/ `im_search`（搜用户）/ `im_create_group`（建群）
- `sceneConfig(user, scene)`：调主站 `/api/geetest/config`，60 秒缓存，返回 `{enabled, product}`
- `registerCaptcha(user, scene)`：调主站 `/api/geetest/register` 拿 challenge
- `validateCaptcha(user, scene, payload)`：调主站 `/api/geetest/validate` 验证，通过后签发 Grant JWT
  - `im_message` 场景 `reusable=true`、有效期 2 分钟（验证一次后 2 分钟内免再验）
  - 其他场景 `reusable=false`、有效期 90 秒、一次性消费（`consumed` Map 防重放）
- `requireCaptcha(scene)`：中间件，若场景启用则检查 `x-im-captcha-grant` Header，无效返回 403 `captcha_required: true`

#### 7.2.8 `imageHost.js`（图床上传 + 文件签名校验）
- `validSignature(file)`：读取文件头字节验证 JPEG/PNG/WebP/GIF 真实格式（防伪装扩展名）
- `uploadImage(file)`：multipart 上传到 `IMAGE_HOST_ENDPOINT`（默认 `https://img.scdn.io/api/v1.php`），返回 CDN URL

### 7.3 用户端 `apps/web/`

Vue 3 单页应用，部署在 `im-web` 容器（Nginx 托管静态资源 + 反代 `/api` 与 `/ws` 到 `im-server`）。

**核心文件**（`apps/web/src/`）：
- `App.vue`（约 800 行）：单文件实现完整 IM UI，包含：
  - 左侧栏：搜索框 / 私聊申请 / 会话列表 / 当前账号
  - 中间消息区：时间线 + 消息气泡（图片消息直显图）+ 输入框（Enter 发送，Shift+Enter 换行）
  - 右侧状态栏：服务状态 + 消息数量 + 安全提示
  - 4 个弹窗：举报消息 / 极验验证 / Session 过期重进 / 错误 Toast
- `main.js`：创建 Vue 实例，加载 theme.css + mobile.css
- `theme.css`：暗色赛博朋克风格（深色背景 + 黄绿点缀 + 等宽字体）
- `mobile.css`：768px 断点切换为"列表/聊天"两屏滑动布局
- `index.html`：单页模板，引入极验 SDK

**前端关键逻辑**：
- 入口自动从 URL `?ticket=xxx` 取 SSO 票据 → POST `/api/auth/sso/exchange` → 失败显示诊断编号（管理员可在日志中查）
- WebSocket 自动重连：`online` / `offline` / `close` 事件触发指数退避重连
- 消息发送：先尝试 WebSocket（`message.send` 事件），失败降级 HTTP POST `/api/messages`
- 图片上传：先 POST `/api/images` 拿 `image_id`，再作为 `image` 类型消息发送

### 7.4 管理后台 `apps/admin/`

Vue 3 单页应用，独立部署在 `/im-admin` 路径。

**5 个主要面板**：
- **dashboard 仪表盘**：今日消息数 / 在线用户 / 待处理举报 / 审计日志数 + 近期举报列表
- **users 用户管理**：搜索 + 列表 + 详情弹窗（会话数 / 消息数 / 被举报数）。**注意**：IM 不单独封禁，需跳转编程狗用户管理
- **conversations 会话审计**：私聊/群聊筛选 + 成员预览 + "审计消息"按钮跳转检索
- **audit 聊天记录检索**：必须填 ≥5 字符原因 → 调 `POST /api/admin/messages/search` → 写 `AdminAudit`
- **reports 举报处理**：4 种处置（reject/confirm/delete_message/delete_and_disable）+ 聊天上下文展示（被举报消息前后各 5 条）
- **logs 审计日志**：管理员操作流水（聊天检索 / 举报处置 / 群容量调整），不可删除

### 7.5 数据库设计

IM 数据库共 **9 张表**（前缀 `im_`），与主站完全隔离：

| 表名 | 主键 | 关键字段 | 用途 |
|------|------|---------|------|
| `im_user_profiles` | `id` (INT) | username, nickname, avatar, codemao_user_id, role | SSO 用户资料缓存 |
| `im_conversations` | `id` (BIGINT) | type('direct'/'group'), direct_key('uid1:uid2' 唯一), last_sequence | 会话主表 |
| `im_conversation_members` | (conversation_id, user_id) | role('owner'/'admin'/'member'), state('active'/'pending'/'left'/'removed'/'banned') | 会话成员关系 |
| `im_messages` | `id` (BIGINT) | conversation_id, sequence, sender_id, client_message_id, type('text'/'image'/'system'), content, status('active'/'edited'/'recalled'/'hidden') | 消息表 |
| `im_groups` | `conversation_id` (BIGINT) | name, owner_id, member_limit | 群资料 |
| `im_images` | `id` (BIGINT) | user_id, url, mime, size, sha256, status('ready'/'used'/'blocked') | 图片资源（防滥用） |
| `im_admin_audits` | `id` (BIGINT) | admin_id, action, reason, filters(JSON), source_ip | 管理员操作审计 |
| `im_reports` | `id` (BIGINT) | reporter_id, message_id, conversation_id, reason, status, resolution_reason, resolution_action, resolved_by, resolved_at | 消息举报 |
| `im_schema_migrations` | `version` (VARCHAR) | checksum | 迁移版本追踪 |

**关键索引**：
- `im_messages`：`(conversation_id, sequence)` 唯一 + `(sender_id, client_message_id)` 唯一（防重发）+ `(conversation_id, created_at)`
- `im_conversation_members`：`(user_id, state)` 复合索引
- `im_reports`：`(reporter_id, message_id)` 唯一（防重复举报）+ `(status, created_at)`
- `im_admin_audits`：`(admin_id, created_at)` + `(action, created_at)`

### 7.6 WebSocket 协议

**帧格式**（JSON，所有帧统一）：
```json
{ "version": 1, "event": "事件名", "request_id": "可选", "data": { ... } }
```

**客户端 → 服务端事件**：
| 事件 | 用途 | 响应 |
|------|------|------|
| `ping` | 心跳保活 | `pong` + `{ at: timestamp }` |
| `message.send` | 发消息（推荐方式） | `message.ack` + 广播 `message.new` |

**服务端 → 客户端事件**：
| 事件 | 触发时机 | data 内容 |
|------|---------|----------|
| `auth.ok` | 握手成功 | `{ user_id }` |
| `pong` | 心跳响应 | `{ at }` |
| `message.ack` | 客户端发消息确认 | 完整消息对象（含 sender） |
| `message.new` | 会话新消息广播 | 完整消息对象 |
| `message.moderated` | 管理员删除消息 | `{ id, status: 'hidden', content: '该消息因违规已被管理员删除' }` |
| `conversation.updated` | 群资料更新 | 群对象 |
| `member.updated` | 成员加入/退出/角色变更 | `{ user_id, state?, role? }` |
| `message.error` | 发送失败 | `{ message }` |

**鉴权与安全**：
- 握手时强制验证 `im_session` Cookie + Origin 白名单 + 账号状态
- `maxPayload: 64KB` 限制单帧大小
- 心跳超时由 Nginx `proxy_read_timeout` 默认 60s 控制

### 7.7 SSO 完整流程

#### 7.7.1 用户进入 IM 流程（一次性 RS256 票据）

```
1. 用户在编程狗前端点击"即时通讯"
   ↓
2. 前端调主站 POST /api/im/sso-ticket
   ↓
3. 主站用 IM_SSO_PRIVATE_KEY (RS256) 签发票据，payload 含：
   - purpose: 'im_sso'
   - sub: 用户 ID, username, nickname, avatar, codemao_user_id, role
   - jti: UUID（一次性）
   - exp: 短期（如 30 秒）
   - binding_nonce: 随机 nonce
   - client_ip_hashes: [boundHash(nonce, ip1), ...]（多候选 IP 哈希）
   - client_network_hashes: [boundHash(nonce, /24 网段), ...]
   - browser_hash: boundHash(nonce, userAgent)
   - community_url, community_status_url, status_token
   - status: 'active', token_version
   - peer: 可选（带跳转目标用户，用于"从编程狗用户主页发起私聊"）
   ↓
4. 前端跳转 https://im.example.com/im?ticket=xxx
   ↓
5. IM 用户端取 ticket → POST /api/auth/sso/exchange
   ↓
6. IM 服务端 exchangeTicket(ticket, req):
   a) 用 IM_SSO_PUBLIC_KEY RS256 验签
   b) 校验 purpose / jti / sub
   c) contextMatchResult: 用当前请求 IP 候选 + UA 算哈希，对比 payload 中的哈希
      - 精确 IP 匹配 或 同 /24 网段匹配 → ipMatches=true
      - 浏览器哈希匹配 → browserMatches=true
      - 两者均匹配才通过（防 Cookie 被盗用）
   d) consumeOnce(jti): Redis SET NX，防重放
   e) setAccountState: 缓存账号状态
   f) HS256 签发 im_session JWT（30 分钟），写入 httpOnly Cookie
   g) upsert UserProfile + 可选 peer UserProfile
   ↓
7. 用户端拿到 Cookie，后续所有请求自动携带，可建立 WebSocket
```

#### 7.7.2 账号状态推送流程（RS256 通知）

```
主站用户被禁用/启用 → 主站 POST /api/im/status-push
   → IM 服务端 POST /api/internal/account-status
   → acceptStatusPush:
      a) RS256 验签
      b) consumeOnce("status:" + jti) 防重放
      c) setAccountState 更新状态
      d) 若 status != 'active'，立即遍历 socketsByUser 关闭所有 WebSocket（4001）
   → 后续该用户任何请求都触发 assertAccountActive → 401 踢出
```

#### 7.7.3 举报处置回调主站流程

```
IM 管理员处置 delete_and_disable →
   IM 服务端 communityRequest(user, 'POST', /api/users/im-admin/users/{sender_id}/disable)
   → 用 user.status_token 作为 Bearer 调主站
   → 主站禁用账号 + 推送状态到 IM → 形成闭环
```

### 7.8 部署

#### 7.8.1 Docker Compose（推荐）

`im-system/docker-compose.yml` 定义 4 个服务：

| 服务 | 镜像/构建 | 端口 | 依赖 |
|------|----------|------|------|
| `mysql` | mysql:8.4 | 内部 3306 | - |
| `redis` | redis:7.4-alpine | 内部 6379 | - |
| `im-server` | 本地构建 target=server | 内部 3100 | mysql + redis healthy |
| `im-web` | 本地构建 target=frontend | `127.0.0.1:8100:80` | im-server healthy |

**关键配置**：
- `im-server` 挂载 `./secrets/im_sso_public.pem` 到 `/run/secrets/im_sso_public.pem:ro`
- `extra_hosts: ["host.docker.internal:host-gateway"]`：Linux 下访问宿主机编程狗 3001 端口
- `im-web` 仅绑 `127.0.0.1`，强制由宿主机 Nginx 反代

#### 7.8.2 一键安装 `install.sh`

交互式向导，步骤：
1. 询问安装目录 `/opt/codedog-im` + IM 公网 URL `https://im.example.com/im` + 本地端口 `8100`
2. 询问是否使用内置 MySQL + Redis（推荐）
3. 询问是否绑定本机编程狗社区目录 `/opt/codedog`
4. 安装系统依赖（git / curl / openssl / Node 20 / Docker）
5. git clone 或 git pull 仓库
6. 生成随机密码 + 写 `.env`
7. 调 `scripts/keygen.js` 生成 RS256 密钥对（私钥写入编程狗 `secrets/`，公钥写入 IM `secrets/`）
8. 若绑定了编程狗目录，调 `scripts/bind-community.js` 自动注入 `IM_SSO_PRIVATE_KEY_BASE64` 等到编程狗 `.env`
9. `docker compose up -d --build`
10. 输出 Nginx 反代配置示例

#### 7.8.3 运维脚本（`im-system/scripts/`）

| 脚本 | 作用 |
|------|------|
| `keygen.js` | 生成 RS256 密钥对（私钥给主站签发，公钥给 IM 验签） |
| `bind-community.js` | 把 IM 配置注入主站 `.env`（IM_PUBLIC_URL / IM_SSO_PRIVATE_KEY_BASE64） |
| `toolbox.js` | 交互式工具箱：查看日志 / 重启 / 备份 MySQL / 查看 Redis / 健康检查 |
| `update.js` | 安全更新：git pull → 数据库迁移 → 滚动重启 |
| `smoke-local.js` | 本地冒烟测试：起内存模式 + 模拟 SSO + 发消息 + 验证广播 |

### 7.9 安全边界

| 边界 | 实现 |
|------|------|
| **数据隔离** | IM 数据库与主站完全分离，仅通过 RS256 票据单向通信 |
| **登录环境绑定** | IP 哈希 + 浏览器哈希 + binding_nonce 三重绑定，Cookie 被盗也无法用 |
| **票据一次性** | Redis `SET NX` 防重放，jti 用过即废 |
| **会话短时** | im_session 仅 30 分钟，强制定期回主站刷新 |
| **状态实时同步** | 主站禁用账号 → 推送 → IM 立即踢下线 |
| **管理员审计** | 聊天检索 / 举报处置 / 群容量调整 全部写 `im_admin_audits`，不可删除 |
| **隐私保护** | 不收集已读回执（003 迁移已移除 last_read_sequence 字段） |
| **图片防滥用** | sha256 去重 + status 状态机（ready → used，禁止复用）+ 文件签名校验 |
| **群容量例外** | 仅编程狗 admin/superadmin 可调，需填 ≥5 字符原因，写审计 |
| **极验防刷** | 3 个高风险场景强制极验，im_message 验证后 2 分钟免再验 |
| **WebSocket 鉴权** | 握手时强制 Cookie + Origin + 账号状态三重校验 |

---

## 8. 关键流程详解

本章详细剖析 9 个核心业务流程，每个流程包含流程图、关键函数定位、安全检查点。

### 8.1 JWT 认证 + token_version 失效机制

**主文件**：[server/middleware/auth.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/auth.js)
**关键函数**：`getToken`、`resolveUserFromToken`、`authMiddleware`、`optionalAuth`

```
请求到达
   ↓
getToken(req)
   ├─ parseCookieToken(httpOnly cookie)  ← 优先（防 XSS）
   └─ getBearerToken(Authorization 头)  ← 兼容回退
   ↓
jwt.verify(token, JWT_SECRET, {
  algorithms: ['HS256'],                ← 防 alg=none 攻击
  issuer: 'codedog-community',
  audience: 'codedog-frontend'
})
   ↓
DbAdapter.findByPk(User, decoded.id)
   ├─ 不存在 → 401 USER_NOT_FOUND
   └─ user.status !== 'active' → 403 账号已被禁用
   ↓
★ token_version 失效检查 ★
if (decoded.token_version !== user.token_version)
   → throw TOKEN_REVOKED → 401
   ↓
req.user = { id, username, role, status, codemao_user_id }
   ↓
next()
```

**token_version 触发递增场景**：用户修改密码 / 主动登出所有设备 / IM 举报禁用 / 管理员禁用账号 → 全部旧 JWT 立即失效。

**安全检查点**：
| 检查点 | 防御目标 |
|--------|----------|
| Cookie 字符集 `^[a-zA-Z0-9._-]+$` + 长度 ≤4096 | 异常输入 + CPU DoS |
| Bearer 正则替代 `split(' ')` | 多空格/异常输入绕过 |
| 显式 `algorithms: ['HS256']` | alg=none + 算法混淆攻击 |
| issuer + audience 校验 | 跨服务 token 误用 |
| token_version 比对 | 已注销账号复用旧 token |
| `optionalAuth` 静默降级游客（仅 JWT 类错误） | 游客可访问接口兼容性 |

### 8.2 hCaptcha fail-closed 守卫机制

**主文件**：[server/middleware/hcaptcha.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/hcaptcha.js)
**关键函数**：`isHcaptchaEnabled`、`hcaptchaGuard`、`verifyHcaptcha`、`invalidateHcaptchaCache`

```
请求到达
   ↓
路径非 /api/ → next()
   ↓
路径在白名单（login/register/logout/me/im-status/health/hcaptcha/geetest/public/oauth/open/developer）→ next()
   ↓
try { enabled = await isHcaptchaEnabled() }
catch (DB故障) → ★ 503 fail-closed ★（不降级放行）
   ↓
enabled=false → next()
   ↓
enabled=true → 校验 req.session.hcaptchaVerified + hcaptchaExpires
   ├─ 在有效期 → next()
   └─ 过期或未验证 → 403 HCAPTCHA_REQUIRED
```

**关键设计**：
- **白名单严格**：`/api/admin` **不在白名单**（修复 L8）—— 管理端不绕过验证码
- **IM 凭证豁免**：`/api/users/im-status`、`im-admin` 在白名单（IM 用 RS256 status_token 鉴权，无法完成交互式验证码）
- **缓存 60s TTL**：`isHcaptchaEnabled()` 内存缓存 60 秒，管理员后台修改后须调 `invalidateHcaptchaCache()` 立即生效
- **fail-closed**：DB 故障返回 503，避免降级放行（修复 H1）
- **secret 不入 URL**：放在请求体而非 params，避免代理日志泄露

### 8.3 限流策略

**主文件**：[server/middleware/rateLimit.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/rateLimit.js)
**关键函数**：`getClientIp`、`createRateLimiter`、`pruneBuckets`、`evictIfFull`

```
请求到达
   ↓
skip && skip(req) → next()
   ↓
keySuffix = keyGenerator(req) || getClientIp(req)
   ★ getClientIp 仅用 req.ip，不读 XFF ★（修复 L1）
   ↓
key = `${keyPrefix}:${keySuffix}`
buckets.get(key)
   ├─ 不存在或已过期 → 新建桶 {count:1, resetAt: now+windowMs} → next()
   └─ 存在且未过期 → count++
      ├─ count > max → 429 + Retry-After
      └─ 否则 → next()

后台定时任务（每 60s）：
   pruneBuckets: 清理过期桶
   evictIfFull: MAX_BUCKETS=10000，超限时驱逐最早 20%
```

**关键设计**：
- **不读 X-Forwarded-For**：统一依赖 Express `req.ip`（受 trust proxy 配置控制），防伪造 IP 绕过
- **独立 buckets Map**：每个限流器实例独立 Map，避免相互驱逐（修复 H4）
- **MAX_BUCKETS=10000**：硬上限防海量 IP 撑爆内存，按 `createdAt` LRU 驱逐
- **keyGenerator 异常回退**：自定义生成器异常回退到 IP 维度
- **timer.unref()**：定时任务不阻止进程退出

### 8.4 AI 内容审核流程

**主文件**：[server/services/aiReview.js](file:///c:/Users/Administrator/Desktop/codedog/server/services/aiReview.js)
**关键函数**：`reviewContent`、`fallbackReview`、`builtinSensitiveCheck`、`externalSensitiveCheck`、`validateAIEndpoint`、`buildPinnedIpAgents`、`extractJSONObject`

```
调用方（createPost/publishWork 等）
   ↓
fallbackReview(content, overrideMode)
   config = await getAIConfig()
   checkMode = config.sensitiveCheckMode || 'builtin' (builtin/api/both)
   ↓
   ┌────────────────────┬────────────────────┐
   ▼ builtin/both       ▼ api/both
builtinSensitiveCheck  externalSensitiveCheck
- SensitiveWord 表查询  ★ SSRF 四层防护 ★
- level>=3 high         validateAIEndpoint:
- level=2 medium         - HTTPS 强制（生产）
- level=1 low            - isPrivateIP（10/127/172/
                          192.168/169.254/224/240）
                         - isSuspiciousIPFormat
                          （0x/十进制/八进制/短IP）
                         - DNS lookup 防重绑定
                        buildPinnedIpAgents(ip):
                         - 固定 IP lookup
                         - rejectUnauthorized
                        axios.post(maxRedirects:0)
   ↓                     ↓
mergeResults: 取更高 riskLevel + 合并 violations
   ↓
★ 安全降级检查 ★
if (!apiResult && !builtinResult)
   → recommendation='review' 转人工（不放行）
   ↓
返回 { riskLevel, violations, reason, recommendation, source }
   ↓
调用方根据 recommendation：
- 'pass'   → 直接发布
- 'review' → status='hidden' + hidden_reason='ai_review' 待人工
- 'delete' → 400 拒绝
```

**AI 高级审核 reviewContent 关键点**：
- **Prompt 注入防护**：用户内容用 `<user_content>...</user_content>` 标签包裹，并转义 `</user_content>` 防逃逸
- **JSON 平衡括号法**：`extractJSONObject` 从第一个 `{` 开始计数，字符串内 `{}` 不参与，处理转义符，depth 归零时截取（防贪婪正则误匹配）
- **解析失败降级**：返回 `recommendation='review'` 转人工，不放行（修复 Bug2）

**SSRF 四层防御**：
| 层 | 实现 | 防御目标 |
|----|------|----------|
| Layer 1 | `validateAIEndpoint` HTTPS 强制 + 私网拒绝 + 可疑格式拒绝 + DNS lookup | 直接内网探测 + DNS 重绑定 |
| Layer 2 | `buildPinnedIpAgents` 固定 IP 到 Agent 的 lookup | 第二次 DNS 解析攻击窗口 |
| Layer 3 | `maxRedirects: 0` | 302 跳转 SSRF |
| Layer 4 | `ALLOW_INTERNAL_HTTP_AI=1` opt-in HTTP | 默认强制 HTTPS |

### 8.5 作品爬取/导入流程

**主文件**：[server/services/codemaoApi.js](file:///c:/Users/Administrator/Desktop/codedog/server/services/codemaoApi.js) + [server/controllers/workController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/workController.js)
**关键函数**：`publishWork`、`importWork`、`fetchOrCreateWork`、`getWorkDetail`、`requestWithRetry`、`normalizeWorkUrls`

```
用户发布 POST /works  或  管理员导入 POST /works/import/:codemaoId
   ↓
1. 参数校验（codemaoWorkId 必填 + isValidCodemaoWorkId 格式校验）
   ↓
2. fetchCodemaoWork(codemaoId)
   getAxiosConfig():
   - 优先 proxyService（DB 配置代理池）
   - 失败回退 HTTPS_PROXY 环境变量
   - HttpsProxyAgent / SocksProxyAgent
   requestWithRetry(retries=2):
   - 网络错误 → markDead 当前代理 + 指数退避
   - HTTP 错误 → 不杀代理（链路通）
   normalizeWorkUrls(response.data)
   - 规范化 preview/cover/player_url
   - 嵌套 user_info.avatar 也规范化
   ↓
3. 作者归属校验
   publishWork: codemaoAuthorId === req.user.codemao_user_id
   importWork:
   - 普通用户：codemaoAuthorId 必须等于本人（防冒名）
   - 管理员：通过 ensureCodemaoUser 解析/创建归属
   ↓
4. ★ AI 内容审核 ★
   aiReview.fallbackReview(`${name} ${description}`)
   ↓
5. ★ 事务入库 ★
   sequelize.transaction:
   [work, created] = findOrCreate(Work, {where: {codemao_work_id}})
   if (created && status==='published')
     重算 author.work_count（Bug-11 修复）
   ↓
6. 返回完整作品信息（含 author 关联）
```

**代理池策略**：
- `proxyService` 从数据库读代理列表，支持热更新
- 失败 `markDead` 后自动切换到下一个代理
- 无代理时回退到环境变量 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`
- 支持 `socks4`/`socks5` 协议（`SocksProxyAgent`）

### 8.6 OAuth2 授权码流程

**主文件**：[server/utils/oauth.js](file:///c:/Users/Administrator/Desktop/codedog/server/utils/oauth.js) + [server/controllers/developerController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/developerController.js)
**辅助**：[server/middleware/oauthAuth.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/oauthAuth.js)、[server/routes/oauthRoutes.js](file:///c:/Users/Administrator/Desktop/codedog/server/routes/oauthRoutes.js)

#### 阶段 1：授权页信息 GET /oauth/authorize-info（optionalAuth）

```
1. response_type 必须为 'code'
2. client_id / redirect_uri 必填
3. 查 DeveloperApp，必须 status='active'
4. matchRedirectUri（精确匹配已登记列表）  ← 防开放重定向
5. scope 校验：
   - 排除 APPLICATION_SCOPES（应用级 scope）
   - intersectScopes(requested, appUserScopes)  ← 仅返回应用获批范围
6. 若已登录，查 UserAppAuthorization 计算 previouslyAuthorized 和 newScopes
   ↓
返回应用信息 + scopes + redirect_uri + state
前端展示授权确认页
```

#### 阶段 2：用户授权确认 POST /oauth/authorize（authMiddleware）

```
1. 再次校验 client_id / redirect_uri / app.active
2. approved === false → 构造 denyUrl 返回 error=access_denied
3. 计算 allowed = intersectScopes(...)
4. 生成 code = randomToken('ac_', 24)  ← 24 字节随机
   expiresAt = now + 10 分钟
5. ★ 事务入库 ★
   - OAuthAuthCode.create({code, app_id, user_id, redirect_uri, scopes, expires_at})
   - UserAppAuthorization: 已存在则 merge scopes，否则 create
     merged = intersectScopes([...existing, ...allowed], app.scopes_requested)  ← 不能超出应用获批
6. 302 重定向到 redirect_uri?code=xxx&state=xxx
```

#### 阶段 3：换取 token POST /oauth/token（authFailLimiter 按 ip:client_id 限流）

```
1. extractClientCredentials:
   - Authorization: Basic base64(id:secret)  ← 优先
   - 或 body.client_id / client_secret
2. 校验 client_id → app
   app.status === 'active'
   verifySecret(client_secret, hash)  ← bcrypt 校验
3. 按 grant_type 分支：
```

**authorization_code 分支**：
1. code + redirect_uri 必填
2. OAuthAuthCode 查询：code 匹配 + app_id 匹配 + `used_at IS NULL`（防重放）+ `expires_at > now`（防过期）+ redirect_uri 精确匹配（防开放重定向）
3. UserAppAuthorization 必须存在且 `revoked_at IS NULL`
4. scopes = `intersectScopes(authCode.scopes, app.scopes_requested, authorization.scopes)` ← **三重交集**
5. 事务：`authCode.used_at = now`（标记已用）+ issueTokens
   - access_token = `atk_` + 24B（仅存 SHA-256 hash）
   - refresh_token = `rtk_` + 24B（仅存 SHA-256 hash）
   - TTL：access 2h / refresh 30d

**client_credentials 分支**：签发应用级令牌（含 `APPLICATION_TOKEN_MARKER`，user=null）

**refresh_token 分支**：校验 + 撤销旧 refresh + 签发新对（轮换）

**安全检查点**：
| 检查点 | 防御目标 |
|--------|----------|
| redirect_uri 精确匹配 | 开放重定向 |
| 应用必须 active | 未审核应用滥用 |
| scope 交集运算 | 越权申请 scope |
| code 一次性使用 + 过期校验 | 授权码重放 |
| client_secret bcrypt | 密钥泄露 |
| token 仅存 hash | 数据库泄露后滥用 |
| 三重 scope 交集 | 应用降权后旧 token 越权 |
| authFailLimiter | 暴力换 token |
| APPLICATION_TOKEN_MARKER | 应用/用户令牌混淆 |
| refresh_token 轮换 | 旧 refresh 复用 |

### 8.7 IM SSO 票据签发流程

**主文件**：[server/services/imSso.js](file:///c:/Users/Administrator/Desktop/codedog/server/services/imSso.js) + [server/controllers/userController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/userController.js)
**关键函数**：`createImTicket`、`createStatusToken`、`verifyImStatusToken`、`createImSsoTicket`、`getImAccountStatus`、`disableUserFromIm`

#### 票据签发流程

```
用户点击「进入即时通讯」→ POST /api/users/im-sso（authMiddleware）
   ↓
createImSsoTicket:
1. getImPublicUrl() → IM_PUBLIC_URL 必须配置，否则 503
2. 查 User（必须 status='active'）
3. 解析 action:
   - 'direct': 校验目标 user_id（≠ 自己，active）
   - 'group': 校验 group_id
   - 'admin': 仅 admin/superadmin
4. ticket = createImTicket(user, { peer, req })
   ↓
createImTicket (imSso.js):
1. signingKey():
   - 优先 IM_SSO_PRIVATE_KEY_BASE64 环境变量
   - 否则读 im-system/secrets/im_sso_private.pem
   - 不存在 → throw 503
2. nonce = crypto.randomBytes(18).base64url
3. clientContext(req) 收集客户端特征:
   - ips: cf-connecting-ip / x-forwarded-for / x-real-ip / req.ip / req.socket.remoteAddress
   - browser: user-agent
4. communityPublicUrl(req) 解析社区公网 URL（Origin/Referer → x-forwarded-host → Host → PUBLIC_URL）
5. createStatusToken(user, key) → status_token（RS256，35 分钟，含 token_version）
6. ★ JWT payload 包含绑定信息 ★
   - client_ip_hash / client_ip_hashes / client_network_hashes（/24 或 /64 网段哈希）
   - browser_hash / binding_nonce
   - status_token / token_version
7. jwt.sign(payload, key, {
     algorithm: 'RS256',                ← 非对称签名
     issuer: 'codedog-community',
     audience: 'codedog-im',
     subject: String(user.id),
     jwtid: crypto.randomUUID(),
     expiresIn: '60s'                   ← 仅 60 秒有效
   })
   ↓
返回 { url: `${IM_PUBLIC_URL}/sso?action=...&ticket=...` }
前端跳转到 IM 系统
```

#### IM 回调社区查询账号状态 GET /api/users/im-status（无 hCaptcha，status_token 鉴权）

```
getImAccountStatus:
1. 从 Authorization Bearer 提取 status_token
2. verifyImStatusToken(token): RS256 + 公钥 + issuer/audience + purpose='im_status'
3. 查 User by payload.sub
4. ★ 重新校验 status='active' ★（不信任 IM 传来的状态）
5. ★ 重新校验 token_version 一致 ★（已注销则失效）
6. 返回 { active, user_id, role, token_version }
```

#### IM 反向禁用用户 POST /api/users/:userId/im-disable（status_token 鉴权）

```
disableUserFromIm:
1. 校验 status_token（同上）
2. ★ 重新查询操作者角色 ★（不信任 IM 传来的角色）
   必须 admin/superadmin
3. ★ 角色等级比较 ★（canManageUser 防越级）
   - 不能禁用自己
   - 不能禁用同级或更高级别
4. 更新 target.status='disabled'
5. enqueueImStatus(refreshed) 推送状态变更到 IM
6. logOperation('im_report_disable_user')
```

### 8.8 发帖审核流程

**主文件**：[server/controllers/postController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/postController.js)
**关键函数**：`createPost`、`updatePost`、`deletePost`、`validateTags`、`resolveBoard`、`resolveRecruitmentStudio`、`recordPostRevision`

#### 发帖流程 createPost

```
POST /api/posts（前置：authMiddleware + hcaptchaGuard）
   ↓
1. 参数校验
   - title/content 非 null 且 trim 非空  ← 修复 null 绕过（String(null)=="null"）
   - title ≤ 200 字，content ≤ 50000 字
   - validateTags: 数组 / ≤20 个 / 每项 ≤30 字  ← OOM 防御
   ↓
2. ★ AI 内容审核（落库前）★
   reviewResult = aiReview.fallbackReview(`${title}\n${content}`)
   - 'delete' → 400 拒绝
   - 'review' → status='hidden', hidden_reason='ai_review'
   - 'pass'   → status='published'
   ↓
3. resolveBoard(board_id, category, role)
   - 版块必须 status='active'
   - allow_post_roles 角色权限校验
   ↓
4. 特殊版块校验
   - studio_recruitment_only：仅活跃工作室室长（recruitment_status='open'）
   - 'studios' 版块：需指定 studio_id + 必须是正式成员
   ↓
5. ★ 事务入库 ★
   sequelize.transaction:
   - DbAdapter.create(Post, {...})
   - recordPostRevision(created, 'initial')  ← 历史记录
   - PostDraft.destroy（清除草稿）
   ↓
6. invalidateForumReputation()  ← 失效论坛声望缓存
7. 返回完整 Post（含 author/board/studio 关联）
```

#### 更新帖子 updatePost 关键点

- `change_reason` 必填（3-500 字）—— 强制修改说明
- 仅当 title/content 变更才重新审核
- **AI 隐藏不复活管理员隐藏**：仅当 `post.status === 'hidden' && post.hidden_reason === 'ai_review'` 时才恢复为 published，防绕过管理员操作

#### 删除帖子 deletePost 关键点

- 作者本人或 moderator+ 可删
- **moderator 删他人帖子时校验目标角色**：`canManageUser(req.user.role, targetAuthor.role)` 防越级删除管理员内容
- 事务删除关联：Notification（物理删）/ Like（物理删）/ Favorite（物理删）/ Comment（软删 status='deleted'）/ Post（软删 + 计数清零）

### 8.9 开发者应用审核流程

**主文件**：[server/controllers/developerController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/developerController.js)
**关键函数**：`createApp`、`updateApp`、`adminReviewApp`、`rotateSecret`、`adminRegenerateSecret`、`recordAppAudit`

#### 应用生命周期

```
阶段 1: 用户创建应用 POST /api/developer/apps
   ↓
createApp:
1. name 校验（非空 / ≤100 字）
2. normalizeScopes：仅保留 ALL_SCOPES 中定义的
3. 默认 scope = ['profile:read']
4. normalizeRedirectUris:
   - 每条 URL 走 validateRedirectUri
   - HTTPS 强制（生产）/ http 仅允许 localhost（开发）
   - 不允许 hash / 最多 10 条
5. clientId = randomToken('app_', 16)
   clientSecret = randomToken('sk_', 24)
   clientSecretHash = bcrypt.hash(secret, 10)  ← bcrypt 存储
6. status='pending'
7. logOperation('create_developer_app')
   ↓
状态：pending（待审核）

阶段 2: 管理员审核 POST /api/admin/developer-apps/:id/review
   前置：adminMiddleware + requirePermission('developer:review')
   ↓
adminReviewApp:
1. action 必须为 approve/reject/suspend
2. ★ reject 必须填写整改建议（≥5 字）★
3. map: approve→active, reject→rejected, suspend→suspended
4. 更新 DeveloperApp: status, review_note, reviewed_by, reviewed_at
5. ★ suspend/reject 时撤销所有令牌 ★
   - OAuthAccessToken.revoked_at = now
   - OAuthRefreshToken.revoked_at = now
6. logOperation('review_developer_app')
7. recordAppAudit(app.id, actorUserId, {action: 'review_'+action, ...})
8. ★ 所有审核结果都通知应用所有者 ★（approve/reject/suspend 都发 Notification）

阶段 3: 应用更新触发重新审核 updateApp
1. suspended 状态不可修改
2. 检测 sensitiveChanged:
   - redirect_uris 变更
   - scopes 变更（userAuthorizationChanged 或 applicationAuthorizationChanged）
3. ★ sensitiveChanged 且原状态 active/rejected → status 重置为 'pending' ★
4. 事务内:
   - update DeveloperApp
   - 若 userAuthorizationChanged:
     ★ 撤销所有 OAuthAuthCode ★
     ★ 撤销所有 OAuthAccessToken ★
     ★ 撤销所有 OAuthRefreshToken ★
     ★ 同步收缩 UserAppAuthorization.scopes ★
       intersectScopes(existing, nextScopeList)  ← 防恢复已删 scope
     若 narrowed.length===0 → revoke authorization
   - 若 applicationAuthorizationChanged:
     仅撤销应用令牌（含 APPLICATION_TOKEN_MARKER），不影响用户令牌
5. 返回 added_scopes + user_reauthorization_required
```

#### 密钥重置 rotateSecret / adminRegenerateSecret

- 仅 active 应用可重置
- 新 secret = `randomToken('sk_', 24)` + bcrypt.hash 存储
- 撤销该应用所有现存令牌
- `recordAppAudit('rotate_secret')` + `logOperation`
- **明文 secret 仅此一次返回**（client_secret_notice: '请立即保存'）

---

## 9. 数据库设计

### 9.1 概览

项目采用 **双数据库** 架构：
- **主站**：SQLite（默认，启用 `PRAGMA foreign_keys=ON` + WAL 模式）或 MySQL 8（生产推荐）
- **IM 系统**：独立的 MySQL 数据库（与主站完全隔离）

主站共 **45 张表**，IM 系统 9 张表。所有主站模型统一定义在 [server/models/index.js](file:///c:/Users/Administrator/Desktop/codedog/server/models/index.js)，使用 Sequelize 6 ORM。

### 9.2 通用配置

所有主站模型共享配置：
| 配置项 | 值 |
|--------|-----|
| `timestamps` | `true` |
| `underscored` | `true` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| 主键 | `id: INTEGER, primaryKey: true, autoIncrement: true` |

### 9.3 主站模型清单（按业务域分组）

#### 9.3.1 用户系统（1 张表）

**User**（`users`）—— 用户主表
| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| codemao_user_id | STRING(50) | unique | 编程猫用户 ID |
| username | STRING(50) | allowNull:false, unique | 用户名 |
| email | STRING(100) | allowNull:false, unique | 邮箱 |
| password | STRING(255) | allowNull:false | 密码（bcrypt 哈希） |
| nickname/avatar/profile_cover | STRING | - | 资料 |
| bio | TEXT | - | 简介 |
| doing | STRING(200) | - | 状态签名 |
| gender | ENUM('m','f','unknown') | defaultValue:'unknown' | 性别 |
| level/experience | INTEGER | defaultValue:1/0 | 等级/经验 |
| follower_count/following_count/work_count | INTEGER | defaultValue:0 | 计数 |
| codemao_token | TEXT | - | 编程猫 token（TODO 待加密 L8） |
| role | ENUM('user','reviewer','moderator','admin','superadmin') | defaultValue:'user' | 角色 |
| status | ENUM('active','disabled') | defaultValue:'active' | 账号状态 |
| token_version | INTEGER | defaultValue:0 | **token 版本号（失效机制核心）** |
| password_changed_at | DATE | allowNull:true | 密码修改时间戳 |
| is_active_dalao | BOOLEAN | defaultValue:false | 是否活跃大佬 |
| show_favorites | BOOLEAN | defaultValue:false | 是否公开收藏 |

#### 9.3.2 作品/评论系统（2 张表）

**Work**（`works`）—— 作品表
| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| codemao_work_id | STRING(50) | unique | 编程猫作品 ID |
| name | STRING(200) | allowNull:false | 作品名 |
| description | TEXT | - | 描述 |
| preview/work_url | STRING(500) | - | 预览图/URL |
| type/ide_type | STRING | defaultValue:'KITTEN' | 类型/IDE |
| user_id | INTEGER | allowNull:false (M3) | 归属用户 |
| codemao_author_id/codemao_author_name | STRING | - | 编程猫作者信息 |
| view_times/praise_times/collection_times/comment_count | INTEGER | defaultValue:0 | 计数 |
| status | ENUM('pending','published','rejected','hidden','deleted') | defaultValue:'published' | 状态 |
| is_featured | BOOLEAN | defaultValue:false | 是否精选 |
| 索引 | status / user_id / created_at | - | - |

**Comment**（`comments`）—— 评论表（支持作品+帖子+自引用回复）
| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| content | TEXT | allowNull:false | 内容 |
| user_id | INTEGER | allowNull:false | 评论者 |
| work_id/post_id | INTEGER | - | 关联作品/帖子 |
| parent_id | INTEGER | - | 父评论（自引用，onDelete: SET NULL M10） |
| reply_to_user_id | INTEGER | - | 回复目标用户 |
| legacy_studio_forum_reply_id | INTEGER | unique | 旧工作室论坛回复 ID |
| like_count | INTEGER | defaultValue:0 | 点赞数 |
| status | ENUM('active','hidden','deleted') | defaultValue:'active' | 状态 |

#### 9.3.3 论坛系统（7 张表）

**Post**（`posts`）—— 论坛帖子主表
| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| title | STRING(200) | allowNull:false | 标题 |
| content | TEXT | allowNull:false | 内容 |
| user_id | INTEGER | allowNull:false | 作者 |
| view_count/like_count/comment_count/reply_count/collection_count | INTEGER | defaultValue:0 | 计数 |
| is_top/is_essence/is_locked | BOOLEAN | defaultValue:false | 置顶/加精/锁定 |
| category | STRING(50) | defaultValue:'discussion' | 分类 |
| board_id/studio_id | INTEGER | allowNull:true | 板块/工作室 |
| post_type | STRING(30) | defaultValue:'discussion' | 帖子类型 |
| last_reply_at/last_reply_user_id/last_comment_id | DATE/INTEGER | allowNull:true | 最后回复信息 |
| participant_count | INTEGER | defaultValue:1 | 参与人数 |
| slow_mode_seconds | INTEGER | defaultValue:0 | 慢模式 |
| accepted_comment_id/merged_into_post_id | INTEGER | allowNull:true | 采纳评论/合并到 |
| cover | STRING(500) | - | 封面 |
| hidden_reason | STRING(50) | defaultValue:null | **'ai_review'/'manual'** |
| status | ENUM('published','draft','hidden','deleted') | defaultValue:'published' | 状态（M6） |
| tags | TEXT | get/set | 标签（JSON 数组，M24 兜底 `[]`） |
| 索引 | [board_id, status, last_reply_at] / [post_type, status] | - | 列表分页 |

**ForumBoard**（`forum_boards`）—— 板块
- slug（unique）/name/description/icon/color/sort_order/status
- studio_recruitment_only（仅工作室招募）
- allow_post_roles（get/set JSON，允许发帖角色）

**ForumBoardSubscription/ForumBoardModerator** —— 板块订阅/版主
**PostSubscription** —— 帖子订阅（含 last_read_at）
**PostDraft** —— 帖子草稿（每用户唯一）
**PostRevision** —— 帖子修订历史（完整快照，含 change_reason）
**ForumModerationLog** —— 论坛审核日志

#### 9.3.4 工作室系统（11 张表）

**Studio**（`studios`）—— 工作室主表
| 关键字段 | 说明 |
|---------|------|
| name/description/cover/cover_url | 资料 |
| owner_id | 创建者 |
| vice_owner_id | 副室长 |
| member_count/work_count/total_score/points/level | 计数与等级 |
| is_public/join_type | 公开/加入方式 |
| member_limit | 成员上限（默认 100） |
| recruitment_status | 招募状态（'open'/'closed'） |
| application_questions | get/set JSON，申请问题 |
| application_cooldown_days | 申请冷却（默认 7） |
| leave_work_policy | 退室作品策略 |
| im_group_id | 关联 IM 群组 |
| status | ENUM('active','pending','dissolved','banned') |
| **owner_claim** | **unique 索引，并发保护"每人一个工作室"**（banned 时置 NULL 允许多个） |

**StudioMember** —— 成员（role: owner/vice_owner/admin/member，status: active/pending/rejected）
**StudioWork** —— 工作室作品关联（unique [studio_id, work_id]，status: pending/approved/rejected/down）
**StudioPointLog** —— 积分日志（delta + points_before/after + ip_address）
**StudioInvite** —— 邀请码（code unique + max_uses + expires_at）
**StudioOperationLog** —— 操作日志（含 is_public 标志）
**StudioAnnouncement** —— 公告（is_pinned + published_at）
**StudioTask** —— 任务（assignee_id + needed_role + priority + deadline）
**StudioBlacklist** —— 黑名单（unique [studio_id, user_id]）
**StudioDiscussion** —— 讨论
**StudioForumPost/StudioForumReply** —— 工作室独立论坛（不进入主论坛 Post 表）

#### 9.3.5 互动系统（4 张表）

**Like**（`likes`）—— 点赞（多态）
- user_id + work_id/post_id/comment_id（三者必填其一，模型级 validate.hasTarget）
- 三个唯一约束：unique [user_id, work_id]/[user_id, post_id]/[user_id, comment_id]

**Favorite**（`favorites`）—— 收藏（多态）
- user_id + work_id/post_id（必填其一）
- unique [user_id, work_id]/[user_id, post_id]

**Follow**（`follows`）—— 关注
- follower_id + following_id
- unique [follower_id, following_id]
- **beforeCreate Hook**：禁止自关注（M8）

**Notification**（`notifications`）—— 通知
- user_id + type + title + content + related_id/related_type + sender_id
- is_read + meta（JSON，站内信管理员选项）

#### 9.3.6 举报系统（2 张表）

**Report**（`reports`）—— 举报
| 字段 | 说明 |
|------|------|
| type/target_id | **多态目标 ID**（指向 Work/Comment/Post/User，不建 FK，M9） |
| reporter_id/reason/description | 举报人/理由/详细 |
| status | ENUM('pending','processing','resolved','rejected','merged') |
| handler_id/handle_note/ai_result | 处理信息 |
| merged_from_ids | 合并的举报 ID 列表 |

**ReportAuditLog** —— 举报审计日志（handler_type: human/ai/system）

#### 9.3.7 系统管理（10 张表）

| 模型 | 表名 | 关键字段 |
|------|------|---------|
| Announcement | announcements | type(notice/update/warning) + color + show_top_bar/popup/community |
| Banner | banners | image_url + link_url + sort + source('codemao'/'manual') |
| IpBan | ip_bans | ip(unique) + reason + expires_at |
| CaptchaStats | captcha_stats | type/scene/action/ip/user_agent |
| SystemConfig | system_configs | config_key(unique) + config_value |
| OperationLog | operation_logs | user_id + action + target_type/id + details + ip_address |
| RolePermission | role_permissions | role(unique) + name + level + permissions（get/set JSON M25） |
| Statistics | statistics | stat_key(unique) + stat_value(BIGINT) + stat_date |
| UserWarning | user_warnings | user_id + reason + source_* + status(pending/acknowledged) + guarantee_text |
| SensitiveWord | sensitive_words | word + category + level + replacement + status(active/disabled) |

#### 9.3.8 开发者平台/OAuth2（6 张表）

**DeveloperApp**（`developer_apps`）—— 开发者应用
- owner_user_id + name + description + homepage_url + logo_url
- client_id(unique) + client_secret_hash(bcrypt)
- redirect_uris（JSON）+ scopes_requested（JSON）
- status: pending/active/rejected/suspended
- review_note/reviewed_by/reviewed_at
- rate_limit_per_min（默认 60）

**DeveloperAppAuditLog** —— 应用审计日志（from_status/to_status/review_note）
**OAuthAuthCode** —— 授权码（code unique + expires_at + used_at + code_challenge PKCE）
**OAuthAccessToken** —— 访问令牌（token_hash unique SHA-256 + expires_at + revoked_at）
**OAuthRefreshToken** —— 刷新令牌（token_hash unique + replaced_by 轮换）
**UserAppAuthorization** —— 用户应用授权（[user_id, app_id] + scopes + revoked_at）

### 9.4 关键设计要点

#### 9.4.1 多态外键不建 FK 约束

`Report.target_id` 可指向 Work/Comment/Post/User，4 条 belongsTo 关联均用 `constraints: false`，删除目标对象需 controller 层同步清理（M9）。

#### 9.4.2 工作室"每人一个工作室"并发保护

通过 `Studio.owner_claim` 字段 + 唯一索引实现：
- 正常时 owner_claim = owner_id
- banned 时 owner_claim = NULL（唯一索引允许多个 NULL，故被封禁用户可创建新工作室）
- 创建工作室时事务内 INSERT，并发请求会因唯一约束冲突而失败

#### 9.4.3 Post.tags 空 JSON 兜底（M24）

`tags` 字段使用 getter：JSON.parse 返回数组，无值/解析失败返回 `[]` 而非 `null`，避免前端空指针。

#### 9.4.4 RolePermission.permissions 双重 parse 修复（M25）

getter 始终返回数组（空值 `[]`，已数组直接返回，字符串解析失败回退 `[]`），业务层禁止再次 JSON.parse。

#### 9.4.5 Comment 自引用 onDelete 策略（M10）

`Comment.parent_id` 自引用关联使用 `onDelete: 'SET NULL'`，父评论删除时子评论 parent_id 置空但保留子评论。需 SQLite 开启 `PRAGMA foreign_keys=ON`。

#### 9.4.6 六类审计日志体系

| 审计日志 | 覆盖业务 |
|---------|---------|
| ForumModerationLog | 论坛版主操作 |
| StudioOperationLog | 工作室操作 |
| StudioPointLog | 工作室积分变更 |
| ReportAuditLog | 举报处理 |
| DeveloperAppAuditLog | 开发者应用审核 |
| OperationLog | 全站管理员操作 |

#### 9.4.7 Like/Favorite 多态校验

模型级 `validate.hasTarget` 强制 `work_id`/`post_id`/`comment_id`（Like）或 `work_id`/`post_id`（Favorite）必须且只能有一个非空，防脏数据。

#### 9.4.8 OAuth2 完整实现

六张表构成完整 OAuth2 流程：
- 支持 PKCE（`code_challenge`）
- Token 撤销（`revoked_at`）
- 令牌轮换（`replaced_by`）
- 限流（`rate_limit_per_min`）
- Token 仅存 SHA-256 hash（`token_hash`）

### 9.5 IM 系统数据库（9 张表）

详见 [第 7.5 章 IM 数据库设计](#75-数据库设计)。IM 数据库与主站完全隔离，通过 RS256 票据单向通信。

### 9.6 数据库迁移

**主站**：使用 Sequelize `sync({ alter: true })` + 启动期列预检迁移（[server/services/dbMigration.js](file:///c:/Users/Administrator/Desktop/codedog/server/services/dbMigration.js)）

**IM 系统**：使用 `im_schema_migrations` 表追踪 8 个迁移版本（001-008），见 [第 7.2.6 章](#726-databasejs内存--mysql-双实现--8-版本迁移)。

---

## 10. 权限与角色体系

### 10.1 五级角色层级

**配置文件**：[server/config/permissions.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/permissions.js)

| 角色名 | 显示名 | level | 权限策略 |
|--------|--------|-------|---------|
| `user` | 普通用户 | 0 | 无管理权限 |
| `reviewer` | 审核员 | 1 | 举报查看/处理 + 作品/评论审核 |
| `moderator` | 版主 | 2 | 评论/帖子管理 + 用户警告 + 公告查看 |
| `admin` | 管理员 | 3 | 几乎全部权限（除 `log:view`） |
| `superadmin` | 超级管理员 | 4 | 通配符 `*` 拥有全部权限 |

**关键设计**：
- `level` 字段**受保护**：DB 自定义角色权限覆盖时，`level` 不被覆盖，仅覆盖 `name` 和 `permissions`（防越权提权）
- `superadmin` 用 `permissions: ['*']` 通配符，自动展开为全部权限
- `admin` **不包含 `log:view` 权限**（修复：管理员操作链含敏感信息，仅 superadmin 可读）

### 10.2 32 项权限清单

| 权限 key | 名称 | 分类 |
|---------|------|------|
| `report:view` | 查看举报 | 举报管理 |
| `report:handle` | 处理举报 | 举报管理 |
| `work:review` | 审核作品 | 作品管理 |
| `work:delete` | 删除作品 | 作品管理 |
| `work:feature` | 精选作品 | 作品管理 |
| `work:edit` | 编辑作品 | 作品管理 |
| `comment:review` | 审核评论 | 评论管理 |
| `comment:delete` | 删除评论 | 评论管理 |
| `post:review` | 审核帖子 | 帖子管理 |
| `post:delete` | 删除帖子 | 帖子管理 |
| `post:sticky` | 置顶帖子 | 帖子管理 |
| `post:lock` | 锁定帖子 | 帖子管理 |
| `post:edit` | 编辑帖子 | 帖子管理 |
| `user:view` | 查看用户 | 用户管理 |
| `user:edit` | 编辑用户 | 用户管理 |
| `user:disable` | 禁用用户 | 用户管理 |
| `user:warn` | 警告用户 | 用户管理 |
| `announcement:view` | 查看公告 | 公告管理 |
| `announcement:create` | 创建公告 | 公告管理 |
| `announcement:edit` | 编辑公告 | 公告管理 |
| `announcement:delete` | 删除公告 | 公告管理 |
| `banner:view` | 查看轮播图 | 轮播图管理 |
| `banner:create` | 创建轮播图 | 轮播图管理 |
| `banner:edit` | 编辑轮播图 | 轮播图管理 |
| `banner:delete` | 删除轮播图 | 轮播图管理 |
| `statistics:view` | 查看统计 | 系统功能 |
| `crawl:works` | 爬取作品 | 系统功能 |
| `sensitive:manage` | 管理敏感词 | 系统功能 |
| `developer:manage` | 管理开发者应用 | 系统功能 |
| `developer:review` | 审核开发者应用 | 系统功能 |
| `config:manage` | 系统设置 | 系统功能 |
| `log:view` | 查看日志（**仅 superadmin**） | 系统功能 |
| `role:manage` | 管理角色权限 | 系统功能 |

### 10.3 核心函数

| 函数 | 位置 | 用途 |
|------|------|------|
| `getRole(roleName, RolePermission)` | permissions.js:130 | 异步获取角色（优先 DB，回退默认） |
| `getRoleSync(roleName)` | permissions.js:159 | 同步获取（中间件用，读缓存） |
| `refreshRoleCache(RolePermission)` | permissions.js:169 | 刷新缓存（启动 + 管理员修改后） |
| `hasPermission(userRole, permission)` | permissions.js:207 | 检查权限（含 `*` 通配） |
| `isRoleAtLeast(userRole, targetRole)` | permissions.js:216 | 检查角色 ≥ 目标角色 |
| `canManageUser(managerRole, targetRole)` | permissions.js:225 | **检查是否能管理目标用户（严格大于才 true）** |
| `getAllRoles()` | permissions.js:234 | 获取所有角色列表 |
| `getRolePermissions(roleName)` | permissions.js:261 | 获取角色权限（含通配展开） |

### 10.4 鉴权中间件

**文件**：[server/middleware/permission.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/permission.js)

| 中间件 | 用途 | 触发条件 |
|--------|------|---------|
| `requirePermission(permission)` | 检查具体权限 | `hasPermission(role, permission)` 为 false → 403 |
| `requireRole(minRole)` | 检查角色级别 | `isRoleAtLeast(role, minRole)` 为 false → 403 |
| `requireAdmin` | 检查 admin+ | `isRoleAtLeast(role, 'admin')` 为 false → 403 |
| `requireSuperAdmin` | 检查 superadmin | `role !== 'superadmin'` → 403 |

**典型用法**：
```javascript
router.post('/banners', authMiddleware, requirePermission('banner:create'), bannerController.create);
router.put('/users/:id/role', authMiddleware, requireSuperAdmin, adminController.updateUserRole);
router.delete('/works/:codemaoId', authMiddleware, requirePermission('work:delete'), canManageUser, workController.deleteWork);
```

### 10.5 自定义角色权限机制

管理员可通过后台修改 `RolePermission` 表覆盖默认权限：
- `role`：角色名（unique）
- `name`：显示名（可覆盖）
- `level`：**受保护，DB 不可覆盖**（防越权提权）
- `permissions`：JSON 数组（get/set 自动序列化，M25 修复双重 parse）

修改后须调 `refreshRoleCache(RolePermission)` 刷新内存缓存，否则中间件仍用旧权限。

### 10.6 前端角色控制

**store**：`userStore.role` / `userStore.permissions`
**computed**：`hasPermission(perm)` / `hasRole(role)` / `canManageUser(targetRole)`
**指令**：`v-if="hasPermission('banner:create')"` 控制按钮显隐
**路由 meta**：`requiresAuth` / `requiresRole` / `requiresPermission` 字段，全局守卫校验

### 10.7 首位用户自动提权

**两道保险机制**确保首位登录用户成为 superadmin：

1. **登录时检查**（[userController.js:85-92](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/userController.js#L85)）：
   ```javascript
   const userCount = await DbAdapter.count(User);
   if (userCount === 1 && firstUser.role !== 'superadmin') {
     firstUser.role = 'superadmin';
     await firstUser.save();
   }
   ```

2. **启动时检查**（[app.js:68-86](file:///c:/Users/Administrator/Desktop/codedog/server/app.js#L68)）：
   ```javascript
   const userCount = await DbAdapter.count(User);
   if (userCount === 1) {
     const firstUser = await DbAdapter.findOne(User, { order: [['id', 'ASC']] });
     if (firstUser && firstUser.role !== 'superadmin') {
       firstUser.role = 'superadmin';
       await firstUser.save();
       console.log('✅ 首位用户已自动提升为 superadmin');
     }
   }
   ```

**环境变量控制**：`ALLOW_FIRST_USER_SUPERADMIN=false` 可禁用此机制（默认未禁用）

### 10.8 OAuth2 scope 鉴权

OAuth2 access_token 通过 `scopes` 字段鉴权，独立于角色权限体系：

**文件**：[server/utils/oauth.js](file:///c:/Users/Administrator/Desktop/codedog/server/utils/oauth.js) + [server/middleware/oauthAuth.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/oauthAuth.js)

- **应用级令牌**（`client_credentials`）：包含 `APPLICATION_TOKEN_MARKER`，仅可访问 `APPLICATION_SCOPES`
- **用户级令牌**（`authorization_code`）：关联用户，可访问用户授权范围内的 scope
- **scope 校验**：`requireScopes(...needed)` / `requireAnyScopes(...)` 中间件
- **scope 交集运算**：`intersectScopes` 多次取交集防越权

### 10.9 JWT 与 Session 密钥安全

**文件**：[server/config/auth.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/auth.js)

| 配置项 | 值/规则 |
|--------|---------|
| `JWT_SECRET` | 生产环境必须 ≥32 字符且不在弱密钥黑名单，否则启动失败 |
| `SESSION_SECRET` | 同上 |
| `JWT_EXPIRES_IN` | 默认 `7d` |
| `JWT_ISSUER` | `codedog-community` |
| `JWT_AUDIENCE` | `codedog-frontend` |
| `JWT_COOKIE_NAME` | `cd_token`（httpOnly，前端不可读） |
| `JWT_ALGORITHMS` | `['HS256']`（强制，防 alg=none 攻击） |

**密钥持久化**（PM2 cluster 兼容）：
- 非生产环境若未提供密钥，写入 `.data/.jwt_secret` 和 `.data/.session_secret`
- 使用 `fs.writeFileSync(flag: 'wx')` 排他写，防多 worker 并发覆盖
- 多机器/多容器部署仍需显式设置环境变量

---

## 11. 部署与运行方式

本章面向**首次部署**和**日常运维**两类场景，覆盖主站与 IM 系统的全部运行方式。**小白用户请优先阅读 11.3 宝塔面板部署**。

### 11.1 运行环境前置要求

| 项目 | 主站要求 | IM 系统要求 |
|---|---|---|
| 操作系统 | Linux x86_64（Ubuntu 20.04+/CentOS 7+/Debian 11+）| 同左 |
| Node.js | 20.x（Docker 镜像内置，无需手动装）| 20.x（用于密钥生成与工具箱）|
| Docker | 20.10+ | 20.10+ |
| Docker Compose | v2（`docker compose` 子命令） | v2 |
| 内存 | ≥ 512MB（容器上限 512m） | ≥ 1GB（含 MySQL+Redis） |
| 磁盘 | ≥ 2GB（含上传文件） | ≥ 2GB（含 MySQL 数据） |
| 端口 | 3001（容器对外） | 8100（仅绑 127.0.0.1） |
| 反向代理 | Nginx（推荐）/Caddy | Nginx（推荐）/Caddy |

> 香港或海外服务器：Dockerfile 已切换清华镜像源加速 `apk add`，`npm install` 使用淘宝镜像，构建时间约 1-2 分钟。

### 11.2 主站本地开发环境

**适用场景**：开发者本机调试，非生产部署。

**步骤**：

1. **克隆代码**
   ```bash
   git clone https://github.com/txcxgzs/codedog.git
   cd codedog
   ```

2. **安装后端依赖**
   ```bash
   cd server
   npm install
   cd ..
   ```

3. **安装前端依赖并构建**（也可保持 `npm run dev` 热更新）
   ```bash
   cd client
   npm install
   npm run build    # 生成 dist/ 静态文件，供后端静态托管
   # 或：npm run dev  # Vite 开发服务器，访问 http://localhost:5173
   cd ..
   ```

4. **配置环境变量**
   ```bash
   cp .env.example server/.env
   # 编辑 server/.env，至少设置 JWT_SECRET/SESSION_SECRET（≥32 字符）
   ```
   开发环境密钥留空时，[server/config/auth.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/auth.js) 会自动写入 `.data/.jwt_secret` 持久化文件，PM2 cluster 下可共享。

5. **启动后端服务**
   ```bash
   cd server
   npm run dev      # nodemon 热重启，访问 http://localhost:3001
   ```

6. **默认数据库**：SQLite，文件路径 `server/data/database.sqlite`，自动创建。启用外键约束 `PRAGMA foreign_keys=ON`，启用 WAL 模式 `PRAGMA journal_mode=WAL`。

7. **首位登录用户自动成为超级管理员**（两道保险）：
   - 登录时检查（[server/controllers/userController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/userController.js) 第 85-92 行）
   - 启动时检查（[server/app.js](file:///c:/Users/Administrator/Desktop/codedog/server/app.js) 第 68-86 行）

### 11.3 宝塔面板部署（推荐小白用户）

**用户偏好：喜欢宝塔面板，要求文档详细**。本节给出宝塔部署的完整步骤。

#### 11.3.1 安装宝塔面板

```bash
# Ubuntu/Debian
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec

# CentOS
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec
```

安装完成后记下**面板地址、用户名、密码**，登录宝塔。

#### 11.3.2 在宝塔安装 Docker

- 宝塔面板 → **Docker** → 首次进入会提示安装 Docker 管理器，点击安装。
- 或在终端执行 `curl -fsSL https://get.docker.com | sh`。

#### 11.3.3 拉取项目代码

宝塔面板 → **终端**：
```bash
cd /www/wwwroot
git clone https://github.com/txcxgzs/codedog.git
cd codedog
```

#### 11.3.4 一键部署主站

```bash
bash deploy.sh
```

`deploy.sh` 会交互式询问：
1. 数据库类型选择（1=SQLite 默认，2=MySQL）
2. 若选 MySQL，则询问主机/端口/库名/用户/密码
3. 自动生成 `JWT_SECRET`（64 字节十六进制）和 `SESSION_SECRET`（32 字节十六进制）
4. 自动写入 `.env`
5. 创建 `data/`、`uploads/avatars/`、`uploads/works/` 目录并修复权限
6. 清理 SQLite 残留 `_backup` 表
7. `docker compose build` + `docker compose up -d`
8. 等待 `/api/health` 响应（最长 120 秒）
9. 失败时自动调用 `diagnose_startup_failure` 给出修复建议
10. 安装 `codedog` 全局命令（通过 `install-cli.sh`）

部署完成后访问 `http://服务器IP:3001`，后台 `http://服务器IP:3001/admin`。

#### 11.3.5 宝塔配置 Nginx 反向代理 + HTTPS

**为什么需要反向代理**：Docker 直接暴露 3001 端口可访问，但建议用 Nginx 反代以启用 HTTPS、限流、压缩。

**步骤**：

1. 宝塔面板 → **网站** → **添加站点** → 域名填 `你的域名.com`（不填 www，宝塔会自动生成 www 反代）→ **根目录**随意（如 `/www/wwwroot/你的域名.com`）→ **PHP版本**选 **纯静态** → 提交。

2. 点击站点 → **设置** → **配置文件**，在 `server` 块内加入：
   ```nginx
   # 主站反代
   location / {
       proxy_pass http://127.0.0.1:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```
   保存后重启 Nginx。

3. **关键**：编辑项目根目录 `.env`，设置：
   ```env
   CORS_ORIGIN=https://你的域名.com
TRUST_PROXY=1
   ```
   - `CORS_ORIGIN`：生产环境必填，否则启动会失败
   - `TRUST_PROXY`：经单层 Nginx 反代时设为 `1`；复杂拓扑应填写明确代理 CIDR，禁止设为 `true`
   修改后重启容器：`docker compose restart codedog`

4. 宝塔站点设置 → **SSL** → **Let's Encrypt** → 申请免费证书 → 开启**强制 HTTPS**。

#### 11.3.6 宝塔部署 IM 系统进阶章节 11.5

IM 系统单独部署在 `im-system/` 目录，详见 11.5 节。

### 11.4 Docker 生产部署（主站）

**适用场景**：纯 Docker 部署，不依赖宝塔。

#### 11.4.1 docker-compose.yml 关键配置

文件：[docker-compose.yml](file:///c:/Users/Administrator/Desktop/codedog/docker-compose.yml)

```yaml
services:
  codedog:
    build: { context: ., dockerfile: Dockerfile }
    container_name: codedog
    ports: ["3001:3001"]
    volumes:
      - ./data:/app/server/data          # SQLite 数据库
      - ./uploads:/app/server/uploads    # 用户上传文件
      - ./.data:/app/.data                # JWT/Session 密钥持久化
    env_file: [.env]
    environment:
      - NODE_ENV=production
      - DB_TYPE=${DB_TYPE:-sqlite}
      - DB_PATH=${DB_PATH:-/app/server/data/database.sqlite}
      - JWT_SECRET=${JWT_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - CORS_ORIGIN=${CORS_ORIGIN:-}
      - TRUST_PROXY=${TRUST_PROXY:-}
      - IM_PUBLIC_URL=${IM_PUBLIC_URL:-}
      - IM_SSO_PRIVATE_KEY_BASE64=${IM_SSO_PRIVATE_KEY_BASE64:-}
    restart: unless-stopped
    mem_limit: 512m
    cpus: '1.0'
    healthcheck:
      test: ["CMD", "curl", "-fs", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

**关键点**：
- `mem_limit: 512m`：容器内存上限，含 Node.js + sharp 原生模块
- `healthcheck`：每 30 秒探测 `/api/health`，3 次失败标记 unhealthy
- `logging`：日志文件 10MB 滚动，最多 3 份，防止磁盘被日志撑爆
- `volumes`：3 个持久化目录必须挂载，否则容器重建后数据丢失

#### 11.4.2 Dockerfile 多阶段构建

文件：[Dockerfile](file:///c:/Users/Administrator/Desktop/codedog/Dockerfile)

**3 个阶段**：

1. **frontend-builder**（`node:20-alpine`）
   - `COPY client/package*.json` → `npm install`（淘宝源）
   - `COPY client/` → `npm run build` 生成 `dist/`

2. **backend-builder**（`node:20-alpine`）
   - 装 `python3 make g++`（编译 sqlite3/sharp 原生模块）
   - `COPY server/package*.json` → `npm install --production`（淘宝源）
   - 输出 `node_modules/` 含编译好的 `.node` 二进制

3. **runtime**（`node:20-alpine`）
   - 清华源装 `netcat-openbsd mysql-client curl font-noto-cjk`（不装编译工具）
   - 从 backend-builder 复制 `node_modules`
   - 从 frontend-builder 复制 `dist/`
   - 复制 `server/` 源码
   - `EXPOSE 3001`，`CMD ["./docker-entrypoint.sh"]`

**构建时间**：
- 首次构建：约 2 分钟
- 依赖未变时复用 layer 缓存：约 1 分钟
- 全量重建（`docker compose build --no-cache`）：约 6 分钟

#### 11.4.3 docker-entrypoint.sh 启动流程

文件：[server/docker-entrypoint.sh](file:///c:/Users/Administrator/Desktop/codedog/server/docker-entrypoint.sh)

1. 创建 `./data ./uploads/avatars ./uploads/works` 并 `chmod -R 777`（Render 持久磁盘挂载后属主可能为 root）
2. SQLite 模式：检查数据库文件存在性，清理 `*_backup` 残留表（防 Sequelize alter 重启死锁）
3. MySQL 模式：`mysqladmin ping` 重试 30 次（每次 2 秒），等待 MySQL 就绪
4. `exec node app.js` 启动主服务

#### 11.4.4 手动部署命令

```bash
# 1. 克隆代码
git clone https://github.com/txcxgzs/codedog.git
cd codedog

# 2. 一键部署（推荐）
bash deploy.sh

# 或手动：
cp .env.example .env
# 编辑 .env，设置 JWT_SECRET/SESSION_SECRET/CORS_ORIGIN
docker compose build
docker compose up -d

# 3. 查看日志
docker compose logs -f codedog

# 4. 健康检查
curl http://localhost:3001/api/health

# 5. 全量重建（缓存损坏时）
docker compose build --no-cache
```

### 11.5 MySQL 数据库切换

**默认 SQLite**，生产环境高并发建议切 MySQL。

**步骤**：

1. 安装 MySQL 8（宝塔面板 → 软件商店 → MySQL 8.0 一键安装）。

2. 创建数据库（宝塔 → 数据库 → 添加数据库）：
   - 数据库名：`coding_dog`
   - 用户名：`codedog`
   - 密码：随机生成 16+ 位强密码
   - 访问权限：**本地服务器**

3. 编辑 `.env`：
   ```env
   DB_TYPE=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=coding_dog
   DB_USER=codedog
   DB_PASSWORD=你的强密码
   ```

4. **Docker 容器访问宿主机 MySQL**：`DB_HOST` 不能填 `127.0.0.1`（指容器自身），需填：
   - Linux 宿主机内网 IP（如 `192.168.1.100`）
   - 或 `host.docker.internal`（需在 docker-compose.yml 添加 `extra_hosts: ["host.docker.internal:host-gateway"]`）
   - 或把 MySQL 也容器化（推荐，见下方 docker-compose 示例）

5. **MySQL 字符集**：必须 `utf8mb4`，宝塔默认即为此。

6. 重启容器：`docker compose restart codedog`。首次启动会自动建表（`sequelize.sync()`），耗时约 30-60 秒。

7. **数据迁移**（如已有 SQLite 数据）：暂无自动迁移脚本，建议用 `sqlite3 .dump` 导出 SQL，手工调整后导入 MySQL。新部署建议直接选 MySQL。

### 11.6 IM 系统部署

**IM 系统是独立子项目**，位于 `im-system/`，与主站通过 SSO 票据对接。

#### 11.6.1 IM 架构与容器

文件：[im-system/docker-compose.yml](file:///c:/Users/Administrator/Desktop/codedog/im-system/docker-compose.yml)

4 个服务：

| 服务 | 镜像 | 端口 | 作用 |
|---|---|---|---|
| `mysql` | mysql:8.4 | 内部 3306 | IM 业务数据（不暴露公网） |
| `redis` | redis:7.4-alpine | 内部 6379 | 防重放 token + 账号状态缓存 |
| `im-server` | 本地构建 | 内部 3100 | Node.js + WebSocket 后端 |
| `im-web` | 本地构建 | 127.0.0.1:8100 → 80 | Nginx 托管前端 + 反代 im-server |

**关键设计**：
- `im-web` 仅绑 `127.0.0.1:8100`，**禁止直接暴露公网**，必须由宿主机 Nginx/Caddy 反代
- `im-server` 通过 `extra_hosts: ["host.docker.internal:host-gateway"]` 访问宿主机主站 3001（用于账号状态确认，避免绕行 Cloudflare）
- `im-server` 挂载 `secrets/im_sso_public.pem` 为 `/run/secrets/im_sso_public.pem:ro`，用于验签 SSO 票据

#### 11.6.2 一键安装向导

文件：[im-system/install.sh](file:///c:/Users/Administrator/Desktop/codedog/im-system/install.sh)

**命令**：
```bash
cd im-system
sudo bash install.sh
```

**交互式询问**：
1. 安装目录（默认 `/opt/codedog-im`）
2. IM 对外访问地址（如 `https://im.你的域名.com/im`，必须含 `/im` 路径）
3. IM 本地监听端口（默认 8100）
4. 是否使用内置 MySQL + Redis（推荐 Y，不开放公网端口）
5. 是否同时绑定本机的编程狗社区（推荐 Y）

**自动执行**：
- 安装 `git curl ca-certificates openssl` + Node 20（若版本 < 20）+ Docker（若未装）
- 克隆/更新代码
- 生成 `.env`（含 `IM_SESSION_SECRET`、`DATABASE_URL`、`REDIS_URL`）
- 运行 `node scripts/keygen.js` 生成 RS256 密钥对（`secrets/im_sso_private.pem` + `secrets/im_sso_public.pem`）
- `npm ci` + `npm run check`
- `docker compose up -d --build`
- 健康检查 `/im/health`（最长 90 秒）
- 若选择绑定主站：自动把 `IM_PUBLIC_URL` 和 `IM_SSO_PRIVATE_KEY_BASE64` 写入主站 `.env`，并重启主站容器

**部署完成提示**：
```
用户端：https://im.你的域名.com/im/
管理后台：https://im.你的域名.com/im/admin/
本地代理上游：http://127.0.0.1:8100
管理工具：cd /opt/codedog-im && ./im.sh
以后可在任意目录执行：codedogim
```

#### 11.6.3 IM 密钥生成

文件：`im-system/scripts/keygen.js`

生成 RS256 非对称密钥对：
- `secrets/im_sso_private.pem`：**主站持有**，用于签发 SSO 票据
- `secrets/im_sso_public.pem`：**IM 服务端持有**，用于验签票据

**主站配置**（`.env`）：
```env
IM_PUBLIC_URL=https://im.你的域名.com/im
IM_SSO_PRIVATE_KEY_BASE64=<base64 编码的 im_sso_private.pem 内容>
```

**IM 配置**（`im-system/.env`）：
```env
IM_SSO_PUBLIC_KEY_FILE=./secrets/im_sso_public.pem
```

#### 11.6.4 IM Nginx 反向代理

在宝塔站点配置中添加（与主站同域名或子域名均可）：

```nginx
# IM 用户端 + 管理后台（HTTP）
location /im/ {
    proxy_pass http://127.0.0.1:8100/im/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# IM WebSocket（必须，否则消息推送不工作）
location /im/ws {
    proxy_pass http://127.0.0.1:8100/im/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 86400s;    # WebSocket 长连接
    proxy_send_timeout 86400s;
}
```

**关键**：WebSocket 升级头 `Upgrade`/`Connection` 必须设置，长连接超时建议 86400 秒（24 小时）。

### 11.7 健康检查与监控

#### 11.7.1 主站健康检查

- **HTTP 端点**：`GET /api/health`
- **响应**：`{ status: 'ok', timestamp: ... }`
- **Docker healthcheck**：每 30 秒 `curl -fs http://localhost:3001/api/health`，3 次失败标记 unhealthy
- **手动检查**：`curl http://localhost:3001/api/health`

#### 11.7.2 IM 健康检查

- **HTTP 端点**：`GET /im/health`
- **Docker healthcheck**：每 15 秒 `wget -qO- http://127.0.0.1:3100/health`，5 次失败标记 unhealthy
- **手动检查**：`curl http://127.0.0.1:8100/im/health`

#### 11.7.3 日志查看

```bash
# 主站实时日志
docker compose logs -f codedog

# 主站最近 100 行
docker compose logs --tail=100 codedog

# IM 实时日志
cd im-system && docker compose logs -f im-server

# IM 所有服务
cd im-system && docker compose logs -f
```

### 11.8 常见部署问题与解决

| 问题 | 原因 | 解决 |
|---|---|---|
| 启动报 `JWT_SECRET is missing` | `.env` 中 JWT_SECRET 为空或 < 32 字符 | 运行 `openssl rand -hex 64` 生成，写入 `.env`，重启 |
| 启动报 `CORS_ORIGIN required` | 生产环境未设 CORS_ORIGIN | `.env` 设 `CORS_ORIGIN=https://你的域名` |
| 启动报 `SQLITE_ERROR: backup table` | Sequelize alter 残留临时表 | `codedog` 工具箱 → 5 修复 → 4 清理残留备份表 |
| 启动报 `EADDRINUSE :3001` | 端口被占用 | `lsof -i:3001` 找占用进程，`kill -9 PID` |
| 启动报 `ECONNREFUSED 3306` | MySQL 未启动或连接信息错误 | 检查 MySQL 服务状态与 `.env` 中 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD |
| 启动报 `getDialectName is not a function` | 旧版 Sequelize 适配代码残留 | `git pull` + `docker compose build --no-cache` |
| 用户头像/作品图无法显示 | Codemao CDN 防盗链 + 数据库 URL 反引号污染 | `<img>` 加 `referrerpolicy="no-referrer"`；运行 `codedog` → 5 修复 → 5 修复图片 URL |
| Nginx 反代后获取 IP 都是 127.0.0.1 | 未设 TRUST_PROXY | 单层反代在 `.env` 设 `TRUST_PROXY=1`；复杂拓扑填写明确代理 CIDR，重启 |
| IM WebSocket 连不上 | Nginx 未配置 Upgrade 头 | Nginx `location /im/ws` 加 `proxy_set_header Upgrade $http_upgrade` |
| IM SSO 登录失败 | 主站与 IM 密钥不匹配 | 重新运行 `node scripts/keygen.js`，同步 `IM_SSO_PRIVATE_KEY_BASE64` 到主站 `.env` |
| 部署后 hCaptcha 开关不生效 | 中间件 60 秒缓存 | 等待 60 秒，或 `docker compose restart codedog` 立即生效 |

---

## 12. 配置文档

本章详细说明主站与 IM 系统的所有配置项，**所有配置都通过环境变量（`.env` 文件）注入，禁止改代码改配置**。

### 12.1 主站环境变量总览

文件位置：项目根目录 `.env`（由 `deploy.sh` 或手动从 `.env.example` 复制生成）。

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SERVER_PORT` | 否 | 3001 | 后端监听端口（Docker 部署固定 3001，勿改）|
| `NODE_ENV` | 是 | - | `production`（生产）/`development`（开发），Docker 部署自动设为 production |
| `DB_TYPE` | 是 | sqlite | `sqlite` 或 `mysql` |
| `DB_PATH` | SQLite 时必填 | `./data/database.sqlite` | SQLite 文件路径 |
| `DB_HOST` | MySQL 时必填 | localhost | MySQL 主机 |
| `DB_PORT` | MySQL 时必填 | 3306 | MySQL 端口（字符串自动转 int）|
| `DB_NAME` | MySQL 时必填 | coding_dog | MySQL 数据库名 |
| `DB_USER` | MySQL 时必填 | root | MySQL 用户名 |
| `DB_PASSWORD` | MySQL 时必填 | - | MySQL 密码 |
| `JWT_SECRET` | **是** | - | JWT 签名密钥，**≥32 字符**，生产环境留空或弱密钥会启动失败 |
| `JWT_EXPIRES_IN` | 否 | 7d | JWT 过期时间 |
| `SESSION_SECRET` | **是** | - | Session 签名密钥，**≥32 字符**，生产环境留空或弱密钥会启动失败 |
| `CORS_ORIGIN` | 生产必填 | - | 允许的前端域名，多个用逗号分隔，如 `https://a.com,https://b.com` |
| `TRUST_PROXY` | 反代时必填 | - | 单层反代设为 `1`，复杂拓扑填写明确代理 CIDR；禁止使用 `true` |
| `IM_PUBLIC_URL` | 接入 IM 时必填 | - | IM 用户端对外地址，如 `https://im.你的域名.com/im` |
| `IM_SSO_PRIVATE_KEY_BASE64` | 接入 IM 时必填 | - | IM SSO 私钥 PEM 的 Base64 编码 |
| `IM_SSO_PRIVATE_KEY_FILE` | 二选一 | - | IM SSO 私钥 PEM 文件绝对路径（与 BASE64 二选一）|
| `GEETEST_ID` | 否 | - | 极验验证码 ID |
| `GEETEST_KEY` | 否 | - | 极验验证码 Key |
| `HCAPTCHA_SITE_KEY` | 否 | - | hCaptcha 站点 Key |
| `HCAPTCHA_SECRET_KEY` | 否 | - | hCaptcha 密钥 |
| `INITIAL_ADMIN_CODEMAO_ID` | 否 | - | 显式初始化超管的编程猫用户 ID |
| `INITIAL_ADMIN_BOOTSTRAP_TOKEN` | 否 | - | 显式初始化超管的引导令牌（≥32 字符）|
| `ALLOW_FIRST_USER_SUPERADMIN` | 否 | - | 设为 `true` 时允许首位登录用户自动成为超管 |

### 12.2 主站数据库配置

文件：[server/config/database.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/database.js)

**SQLite 模式**（`DB_TYPE=sqlite`）：
- `storage`：`process.env.DB_PATH || './data/database.sqlite'`
- `pool`：`{ max: 5, min: 0, acquire: 30000, idle: 10000 }`（修复 L2：恢复 max=5，避免事务死锁）
- `retry`：`{ max: 3, match: [/SQLITE_BUSY/, /SQLITE_LOCKED/, ...] }`（只重试连接类错误）
- `hooks.afterConnect`：每个新连接执行 `PRAGMA foreign_keys = ON`（修复 H2：连接级设置，防池中新连接外键失效）
- `applySqlitePragmas()`：启动时执行 `PRAGMA foreign_keys = ON` + `PRAGMA journal_mode = WAL` 并验证生效

**MySQL 模式**（`DB_TYPE=mysql`）：
- `dialect: 'mysql'`，`timezone: '+08:00'`
- `define`：`{ timestamps: true, underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' }`
- `pool`：`{ max: 10, min: 0, acquire: 30000, idle: 10000 }`
- `retry`：`{ max: 5, match: [/SequelizeConnectionError/, ...] }`

**关键设计**：
- SQLite 外键约束**必须每个连接开启**（连接级设置，非数据库级持久化）
- SQLite WAL 模式是**数据库级持久化**，启动时执行一次即可
- MySQL 字符集**必须 utf8mb4**（支持 emoji 与生僻字）
- `underscored: true`：模型字段用驼峰，数据库列用下划线（如 `userId` → `user_id`）

### 12.3 主站认证配置

文件：[server/config/auth.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/auth.js)

| 配置项 | 值 | 说明 |
|---|---|---|
| `JWT_SECRET` | 环境变量或持久化文件 | ≥32 字符，弱密钥黑名单校验 |
| `JWT_EXPIRES_IN` | `7d` | JWT 有效期 |
| `JWT_ISSUER` | `codedog-community` | JWT 签发者 |
| `JWT_AUDIENCE` | `codedog-frontend` | JWT 受众 |
| `JWT_COOKIE_NAME` | `cd_token` | httpOnly Cookie 名，前端不可读 |
| `JWT_ALGORITHMS` | `['HS256']` | 强制 HS256，防 `alg=none` 攻击 |
| `SESSION_SECRET` | 环境变量或持久化文件 | ≥32 字符，与 JWT 同等校验 |

**弱密钥黑名单**（`INSECURE_SECRETS`）：
- `development-secret-key-do-not-use-in-production`
- `your-random-secret-key-change-in-production`
- `your-session-secret-key-at-least-32-chars`
- `please-change-this-to-a-random-string-at-least-64-characters`
- `change-me` / `secret` / `jwt-secret` / `session-secret` / `your-jwt-secret` / `default-secret`

**密钥持久化机制**（非生产环境兜底）：
- 持久化目录：`.data/`
- 文件：`.jwt_secret`、`.session_secret`（mode 0o600）
- 写入用 `fs.writeFileSync(flag: 'wx')` 排他写，防多 worker 并发覆盖
- PM2 cluster 下所有 worker 共享同一密钥
- **多机器/多容器部署仍需显式设置环境变量**（文件系统不共享）

**生产环境硬约束**：
- `NODE_ENV=production` 时，若 JWT_SECRET 或 SESSION_SECRET 无效 → `console.error` + `process.exit(1)`
- 启动直接失败，避免线上用弱密钥运行

### 12.4 主站 CORS 与反代配置

**CORS_ORIGIN**：
- 生产环境**必填**，否则启动失败
- 多个域名用逗号分隔：`https://a.com,https://b.com`
- 不带协议或带通配符均无效
- 开发环境留空时允许所有来源

**TRUST_PROXY**：
- 经 Nginx/Caddy/Cloudflare 反代时**必须设为 `true`**
- 信任 `X-Forwarded-For` / `X-Forwarded-Proto` 头
- 不设会导致：所有请求 IP 都是 127.0.0.1，限流失效；HTTPS 判断错误，Cookie secure 标志失效

### 12.5 主站 IM 集成配置

接入 IM 系统时，主站 `.env` 需配置：

```env
# IM 用户端对外地址（含 /im 路径）
IM_PUBLIC_URL=https://im.你的域名.com/im

# IM SSO 私钥（二选一）
# 方式1：Base64 编码（推荐，Docker 友好）
IM_SSO_PRIVATE_KEY_BASE64=<base64 编码的 im_sso_private.pem 内容>

# 方式2：文件路径
IM_SSO_PRIVATE_KEY_FILE=/absolute/path/to/im_sso_private.pem
```

**工作流程**：
1. 用户在主站点击"进入 IM"
2. 主站用 `IM_SSO_PRIVATE_KEY` 签发 RS256 SSO 票据（含 `jti`、`ip`、`browserHash`、`tokenVersion`）
3. 跳转到 `IM_PUBLIC_URL?ticket=xxx`
4. IM 服务端用 `IM_SSO_PUBLIC_KEY` 验签，校验 IP/浏览器哈希，consumeOnce 防重放
5. 签发 IM 会话 Cookie（HS256，30 分钟）

### 12.6 主站验证码配置

**极验（Geetest）**：
- 注册：https://www.geetest.com/
- 配置：`GEETEST_ID` + `GEETEST_KEY`
- 开关：数据库 `system_configs` 表 `geetest_enabled` 字段（true/false）
- 工具箱：`codedog` → 9 验证码开关

**hCaptcha**：
- 注册：https://www.hcaptcha.com/
- 配置：`HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY`
- 开关：数据库 `system_configs` 表 `hcaptcha_enabled` 字段（true/false）
- **fail-closed 模式**：验证服务故障时**拒绝请求**（非放行），防绕过
- **60 秒缓存**：开关修改后最多 60 秒生效；`docker compose restart codedog` 立即生效
- **admin API 切换时立即清缓存**：避免管理员改了开关还要等 60 秒

### 12.7 前端 Vite 配置

文件：[client/vite.config.js](file:///c:/Users/Administrator/Desktop/codedog/client/vite.config.js)

```javascript
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: {
    host: 'localhost',
    port: 8080,           // Vite 开发服务器端口
    proxy: {
      '/api': {
        target: 'http://localhost:3001',   // 代理到后端
        changeOrigin: true
      }
    }
  }
})
```

**关键**：
- 开发时前端 `http://localhost:8080`，后端 `http://localhost:3001`
- `/api` 请求自动代理到后端，避免 CORS
- 生产构建 `npm run build` 输出 `dist/`，由后端静态托管，无 CORS 问题

### 12.8 IM 系统环境变量

文件：`im-system/.env`（由 `install.sh` 自动生成）

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `NODE_ENV` | 是 | production | 生产环境必须为 production |
| `IM_PORT` | 否 | 3100 | IM 后端监听端口（容器内部） |
| `IM_HTTP_PORT` | 否 | 8100 | im-web 对外端口（仅绑 127.0.0.1） |
| `IM_BIND_HOST` | 否 | 127.0.0.1 | im-web 绑定地址，**禁止改 0.0.0.0** |
| `IM_PUBLIC_ORIGIN` | **是** | - | IM 用户端对外域名，如 `https://im.你的域名.com` |
| `IM_ADMIN_ORIGIN` | 否 | 同 PUBLIC_ORIGIN | IM 管理后台对外域名 |
| `IM_SESSION_SECRET` | **是** | - | IM 会话签名密钥，**≥32 字符** |
| `IM_SSO_PUBLIC_KEY_FILE` | **是** | `./secrets/im_sso_public.pem` | SSO 公钥文件路径 |
| `IM_DATABASE_URL` | **是** | `memory:` | MySQL 连接串，如 `mysql://user:pass@host:3306/codedog_im` |
| `IM_REDIS_URL` | **是** | - | Redis 连接串，如 `redis://:pass@host:6379/0` |
| `IM_DB_PASSWORD` | 内置 MySQL 时必填 | - | 内置 MySQL 的 im_user 密码 |
| `IM_DB_ROOT_PASSWORD` | 内置 MySQL 时必填 | - | 内置 MySQL 的 root 密码 |
| `IM_GROUP_DEFAULT_LIMIT` | 否 | 100 | 群组默认成员上限 |
| `IM_GROUP_HARD_LIMIT` | 否 | 5000 | 群组硬上限 |
| `IM_COMMUNITY_INTERNAL_URL` | 否 | `http://host.docker.internal:3001` | 主站内网地址（用于账号状态确认） |
| `IMAGE_HOST_ENDPOINT` | 否 | - | 图床上传接口 |
| `IMAGE_HOST_CDN_DOMAIN` | 否 | - | 图床 CDN 域名 |
| `IMAGE_HOST_STORAGE_DESTINATION` | 否 | - | 图床存储目标 |

### 12.9 IM 系统启动期硬约束

文件：[im-system/apps/server/src/config.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/apps/server/src/config.js)

**生产环境（`NODE_ENV=production`）启动期校验**：

```javascript
if (production && configuredSessionSecret.length < 32) {
  throw new Error('IM_SESSION_SECRET must contain at least 32 characters in production');
}
if (production && !process.env.IM_REDIS_URL) {
  throw new Error('IM_REDIS_URL is required in production');
}
if (production && !process.env.IM_PUBLIC_ORIGIN) {
  throw new Error('IM_PUBLIC_ORIGIN is required in production');
}
```

**3 个硬约束**：
1. `IM_SESSION_SECRET` ≥ 32 字符
2. `IM_REDIS_URL` 必填（防重放 token + 账号状态缓存依赖 Redis）
3. `IM_PUBLIC_ORIGIN` 必填（CORS 与 SSO 跳转依赖）

**非生产环境兜底**：
- `sessionSecret` 留空时用 `sha256('codedog-im-local:' + root)` 兜底
- `databaseUrl` 留空时用 `memory:`（内存数据库，重启丢数据）
- `redisUrl` 留空时降级为内存防重放（多实例部署失效）

### 12.10 Nginx 完整配置示例（主站 + IM）

```nginx
# 主站 server 块
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /www/server/panel/vhost/cert/yourdomain.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/yourdomain.com/privkey.pem;

    # 主站反代
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 20m;     # 上传文件大小限制
    }

    # IM 用户端 + 管理后台
    location /im/ {
        proxy_pass http://127.0.0.1:8100/im/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # IM WebSocket（必须独立 location，配置升级头）
    location /im/ws {
        proxy_pass http://127.0.0.1:8100/im/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;    # WebSocket 长连接 24 小时
        proxy_send_timeout 86400s;
    }
}

# HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

**关键配置说明**：
- `client_max_body_size 20m`：上传文件大小限制，与后端 multer 配置一致
- WebSocket 的 `proxy_read_timeout` 必须 ≥ 86400 秒，否则长连接会被 Nginx 60 秒默认超时断开
- `Upgrade` / `Connection` 头是 WebSocket 协议升级必需
- HTTP 80 端口强制 301 跳转 HTTPS

### 12.11 Docker Compose 环境变量传递

主站 `docker-compose.yml` 通过两种方式注入环境变量：

1. **`env_file: [.env]`**：加载整个 `.env` 文件
2. **`environment:` 列表**：显式覆盖特定变量（优先级高于 env_file）

**优先级**：`environment` > `env_file` > `.env` 文件原始值

**IM 系统特殊处理**：
- `IM_DB_PASSWORD` 和 `IM_DB_ROOT_PASSWORD` 用 `${VAR:?msg}` 语法，**变量未设时启动失败**
- `IM_BIND_HOST` 默认 `127.0.0.1`，用 `${VAR:-default}` 语法提供默认值

---

## 13. 运维工具箱

本章详述主站与 IM 系统的运维工具箱，**小白用户日常运维只需记两个命令：`codedog` 和 `codedogim`**。

### 13.1 主站工具箱 codedog

**入口**：[codedog.sh](file:///c:/Users/Administrator/Desktop/codedog/codedog.sh)（Linux）/ `codedog.bat`（Windows）

**全局安装**（部署时 `install-cli.sh` 自动安装）：
```bash
# 在任意目录直接执行
codedog
# 或带参数直接执行功能
codedog update      # 智能更新
codedog status      # 查看状态
codedog fix         # 进入修复菜单
codedog logs        # 查看日志
codedog check       # 检查更新
codedog db          # 数据库管理
codedog sensitive   # 敏感词管理
codedog config      # 系统配置
codedog clean       # 清理缓存
codedog captcha     # 验证码开关
codedog menu        # 交互式主循环
```

#### 13.1.1 主菜单功能

| 选项 | 功能 | 说明 |
|---|---|---|
| 1 | 查看系统状态 | Docker 版本、容器状态、健康检查、后端响应、数据库状态 |
| 2 | 查看服务日志 | 实时日志 / 最近 50 行 / 最近 100 行 |
| 3 | 检查更新 | `git fetch` 对比本地与远程 commit |
| 4 | 执行更新 | **智能模式 8 步流程**（见 13.1.2） |
| 5 | 修复问题 | 6 个修复选项（见 13.1.3） |
| 6 | 数据库管理 | SQLite 备份 / 查看数据表 |
| 7 | 敏感词管理 | 查看敏感词统计（按分类） |
| 8 | 系统配置 | 显示 `.env`（敏感字段自动脱敏） |
| 9 | 验证码开关 | 紧急开启/关闭 hCaptcha/极验（见 13.1.4） |
| 0 | 退出 | - |

#### 13.1.2 智能更新流程（菜单 4）

`do_update` 函数的 8 步流程，是日常更新最常用的功能：

**步骤 1/8：停止服务并备份**
- `docker compose down --remove-orphans`
- 等待 3001 端口释放（最多 10 秒）
- 启动宿主机维护页服务器（`scripts/maintenance-server.sh`），占用 3001 端口，避免用户看到 502
- 备份数据：`data/` + `uploads/` + `.env` + SQLite 热备份（`sqlite3 .backup`）

**步骤 2/8：预检 - 清理 SQLite 残留 backup 表**
- 调用 `clean_backup_tables`，删除 `*_backup` 表
- 防 Sequelize alter 残留导致启动崩溃

**步骤 3/8：预检 - 环境变量检查**
- 调用 `check_env_required`，检查：
  - `JWT_SECRET` ≥ 32 字符
  - `SESSION_SECRET` ≥ 32 字符
  - 生产环境 `CORS_ORIGIN` 必填

**步骤 4/8：拉取更新**
- `git pull origin <当前分支>`
- 失败时检测本地改动，提示是否自动 `git stash` 保存后重试
- 仍失败则中止更新，提示用户手动处理

**步骤 5/8：修复持久化目录权限**
- `mkdir -p data uploads/avatars uploads/works`
- `chmod -R a+rwX data uploads`

**步骤 6/8：重新构建并启动**
- `docker compose build`（复用 layer 缓存）
- 停止维护页服务器，等待 3001 端口释放
- `docker compose up -d --no-build codedog`（用刚构建的镜像启动）
- 启动失败则恢复维护页 + 诊断

**步骤 7/8：等待服务启动 + 智能诊断**
- 60 次 × 2 秒 = 120 秒等待 `/api/health` 响应
- 超时则调用 `diagnose_startup_failure` 扫描日志给出修复建议
- 诊断后停止异常容器，恢复维护页

**步骤 8/8：数据修复检查**
- 检测 `server/scripts/repairImageUrls.js` 是否存在
- 询问是否执行（修复历史图片/头像 URL 反引号污染）
- 执行后重启容器刷新缓存

**关键设计**：
- **维护页机制**：更新期间用户看到的是维护提示页，而非 502 错误
- **端口等待**：每步都等待 3001 端口真正释放，避免容器启动失败
- **失败回退**：任何步骤失败都恢复维护页，保证用户始终能看到响应
- **智能诊断**：扫描 7 类已知崩溃模式，给出具体修复建议

#### 13.1.3 修复问题菜单（菜单 5）

| 选项 | 功能 | 实现 |
|---|---|---|
| 1 | 检查数据库状态 | 调用 `show_database_status` |
| 2 | 修复文件权限 | `mkdir -p` + `chmod -R a+rwX` |
| 3 | 修复敏感词表 | `sqlite3 SELECT COUNT(*) FROM sensitive_words` 验证 |
| 4 | 清理 SQLite 残留备份表 | `DROP TABLE *_backup` |
| 5 | 执行图片/头像 URL 修复脚本 | `docker compose exec codedog node server/scripts/repairImageUrls.js` + 重启 |
| 6 | 全部修复 | 依次执行：权限 → 清理 → 敏感词 → 图片 URL → 重启 |

#### 13.1.4 验证码开关（菜单 9）

**用途**：验证码服务故障时紧急关闭，避免登录/发帖/评论被全部拦截。

**实现**：直接修改 SQLite `system_configs` 表的 `hcaptcha_enabled` / `geetest_enabled` 字段。

**选项**：
1. 关闭 hCaptcha（紧急放行）
2. 开启 hCaptcha
3. 关闭极验 Geetest
4. 开启极验 Geetest
5. 全部关闭（验证码服务故障时使用）
6. 全部开启

**关键提醒**：
- hCaptcha 中间件有 **60 秒缓存**，关闭后最多 60 秒生效
- 重启服务（`docker compose restart codedog`）立即生效
- MySQL 模式下不支持直接改 SQLite 文件，需用后台管理界面

**辅助函数 `set_system_config`**：
- 存在则 UPDATE，不存在则 INSERT
- 自动更新 `updated_at` 时间戳

#### 13.1.5 智能诊断函数

`diagnose_startup_failure` 扫描日志匹配 7 类崩溃模式：

| 模式 | 关键词 | 修复建议 |
|---|---|---|
| SQLite backup 表残留 | `SQLITE_ERROR.*backup`、`UNIQUE constraint failed: users_backup` | 菜单 5 → 选项 4 |
| JWT/SESSION 缺失 | `JWT_SECRET`、`SESSION_SECRET.*required` | 检查 `.env` |
| CORS 缺失 | `CORS_ORIGIN.*required` | `.env` 设 `CORS_ORIGIN=https://域名` |
| 旧版 Sequelize 适配 | `getDialectName is not a function` | `git pull` + `--no-cache` 重建 |
| 端口占用 | `EADDRINUSE`、`port.*already in use` | `lsof -i:3001` |
| 数据库连接失败 | `ECONNREFUSED.*3306`、`database.*connection.*fail` | 检查 DB_TYPE 和 MySQL 服务 |
| 模块缺失 | `Cannot find module`、`MODULE_NOT_FOUND` | `--no-cache` 重建镜像 |

### 13.2 IM 工具箱 codedogim

**入口**：[im-system/im.sh](file:///c:/Users/Administrator/Desktop/codedog/im-system/im.sh) → 调用 `node scripts/toolbox.js`

**全局安装**（`install.sh` 自动安装）：
```bash
# 在任意目录直接执行
codedogim
# 或带参数
codedogim 1    # 构建并启动
codedogim 3    # 重启
codedogim 6    # 状态
```

#### 13.2.1 菜单功能

| 选项 | 功能 | 实现命令 |
|---|---|---|
| 1 | 构建并启动 | `docker compose up -d --build` |
| 2 | 停止 | `docker compose stop`（需输入 STOP 确认） |
| 3 | 重启 | `docker compose restart` |
| 4 | 智能更新 | `node scripts/update.js` |
| 5 | 查看日志 | `docker compose logs --tail=200 -f` |
| 6 | 状态 | 显示目录、.env、SSO 公钥、`docker compose ps` |
| 7 | 检查与构建 | `npm run check` |
| 8 | 生成 SSO 密钥 | `node scripts/keygen.js` |
| 9 | 安装依赖 | `npm install` |
| 10 | 备份 MySQL | `docker compose exec mysql mysqldump ...` |
| 11 | 安装/修复全局 codedogim 命令 | 软链接到 `/usr/local/bin/codedogim` |
| 0 | 退出 | - |

#### 13.2.2 危险操作保护

**停止服务（选项 2）**：必须输入 `STOP` 确认，其他输入均取消。
```javascript
if (answer === '2') {
  console.log('警告：停止会让 IM 网页、消息服务、容器内 MySQL 和 Redis 一并停止。');
  const confirmation = await ask(rl, '确认停止请输入 STOP，其他输入均取消: ');
  if (confirmation !== 'STOP') { /* 取消 */ }
}
```

**命令行直接停止**：必须带 `--yes` 参数
```bash
codedogim 2 --yes
```

#### 13.2.3 MySQL 备份（选项 10）

```javascript
docker compose exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers codedog_im'
```

**备份文件**：`im-system/backups/codedog-im-<ISO时间>.sql`

**关键参数**：
- `--single-transaction`：InnoDB 一致性快照，不锁表
- `--routines`：包含存储过程
- `--triggers`：包含触发器

### 13.3 工具箱使用场景速查

| 场景 | 主站命令 | IM 命令 |
|---|---|---|
| 首次部署 | `bash deploy.sh` | `sudo bash install.sh` |
| 日常更新 | `codedog update` | `codedogim 4` |
| 查看状态 | `codedog status` | `codedogim 6` |
| 查看日志 | `codedog logs` | `codedogim 5` |
| 重启服务 | `docker compose restart codedog` | `codedogim 3` |
| 停止服务 | `docker compose down` | `codedogim 2` |
| 备份数据库 | `codedog db` → 1 | `codedogim 10` |
| 修复常见问题 | `codedog fix` | - |
| 验证码紧急关闭 | `codedog captcha` → 5 | - |
| 重新生成 SSO 密钥 | - | `codedogim 8` |
| 清理 Docker 缓存 | `codedog clean` | `docker system prune -f` |

### 13.4 维护页机制

文件：`scripts/maintenance-server.sh`（主站更新时自动调用）

**工作原理**：
1. 更新前启动宿主机轻量 HTTP 服务器，绑定 3001 端口
2. 返回维护提示页（HTTP 503 + 友好 HTML）
3. 用户访问看到"系统维护中"，而非 502 错误
4. Docker 容器启动前停止维护页服务器
5. 等待 3001 端口释放后启动新容器

**为什么不用 Docker 维护页**：
- Docker 容器停止后端口立即释放，新容器启动前会有空窗期
- 宿主机维护页服务器直接绑定 3001，无空窗期
- 不依赖 Docker，即使 Docker 故障也能响应

### 13.5 日志查看技巧

```bash
# 主站实时日志（Ctrl+C 退出）
docker compose logs -f codedog

# 主站最近 100 行 + 实时跟踪
docker compose logs --tail=100 -f codedog

# 主站按时间过滤（最近 10 分钟）
docker compose logs --since=10m codedog

# 主站按时间过滤（指定时间起）
docker compose logs --since=2026-07-17T10:00:00 codedog

# 主站过滤关键字
docker compose logs codedog | grep -i error

# IM 所有服务日志
cd im-system && docker compose logs -f

# IM 仅 im-server
cd im-system && docker compose logs -f im-server

# IM MySQL 慢查询日志
cd im-system && docker compose exec mysql cat /var/lib/mysql/*.log
```

### 13.6 数据库手动操作

**SQLite**（主站默认）：
```bash
# 进入 SQLite 命令行
sqlite3 data/database.sqlite

# 查看所有表
.tables

# 查看用户表结构
.schema users

# 查看用户数
SELECT COUNT(*) FROM users;

# 退出
.quit
```

**MySQL**（主站或 IM）：
```bash
# 进入 MySQL 命令行（主站）
mysql -u codedog -p coding_dog

# 进入 MySQL 命令行（IM，通过 Docker）
cd im-system && docker compose exec mysql mysql -uroot -p codedog_im

# 查看所有表
SHOW TABLES;

# 查看表结构
DESC users;

# 备份（主站）
mysqldump -u codedog -p coding_dog > backup.sql

# 备份（IM）
cd im-system && docker compose exec -T mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" codedog_im > backup.sql

# 恢复
mysql -u codedog -p coding_dog < backup.sql
```

---

## 14. 硬约束与最佳实践

本章汇总项目所有的**硬约束**（不可违反的规则）和**最佳实践**（推荐遵循的规范）。**这些约束大多是用血泪 bug 换来的，修改前请三思**。

### 14.1 硬约束清单

#### 14.1.1 认证与密钥

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-1 | 生产环境必须注入 `JWT_SECRET`、`SESSION_SECRET`、`CORS_ORIGIN` | 防线上用弱密钥运行 | [server/config/auth.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/auth.js) |
| HC-2 | `JWT_SECRET` 和 `SESSION_SECRET` 必须 ≥ 32 字符 | 防 brute force | `isValidJwtSecret` / `isValidSessionSecret` |
| HC-3 | JWT 验证必须指定 `algorithms: ['HS256']` | 防 `alg=none` 攻击 | [server/middleware/auth.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/auth.js) |
| HC-4 | 弱密钥黑名单（10 个常见占位密钥）必须拒绝 | 防用户不修改默认值 | `INSECURE_SECRETS` |
| HC-5 | 多机器/多容器部署必须显式设置密钥环境变量 | 文件系统不共享，持久化文件兜底失效 | `getOrCreatePersistentSecret` |
| HC-6 | 密钥持久化用 `fs.writeFileSync(flag: 'wx')` 排他写 | 防 PM2 cluster 多 worker 并发覆盖 | `getOrCreatePersistentSecret` |

#### 14.1.2 数据库

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-7 | SQLite 必须启用 `PRAGMA foreign_keys=ON` | 外键约束默认关闭，会导致数据不一致 | [server/config/database.js](file:///c:/Users/Administrator/Desktop/codedog/server/config/database.js) `afterConnect` 钩子 |
| HC-8 | SQLite 外键约束必须**每个连接**开启 | `foreign_keys` 是连接级设置，非数据库级持久化 | `hooks.afterConnect` |
| HC-9 | SQLite 必须启用 WAL 模式 | 提升并发读写性能 | `applySqlitePragmas` |
| HC-10 | MySQL 字符集必须 `utf8mb4` | 支持 emoji 与生僻字 | `define.charset` |
| HC-11 | `tags` 字段必须有空 JSON 兜底 | 防 NULL 导致 JSON.parse 崩溃 | 模型 `defaultValue: '[]'` |
| HC-12 | 工作室创建必须有 `owner_claim` 唯一索引 | 防并发请求绕过"一人一工作室"限制 | Studio 模型索引 |

#### 14.1.3 中间件与路由

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-13 | 所有中间件必须使用 `async/await`，禁用 callback 风格 | 防回调地狱与未捕获异常 | 全部中间件 |
| HC-14 | 路由文件在中间件重构时不得修改 | 防止重构引入路由 bug | 重构规范 |
| HC-15 | `/api/admin` 路由不得绕过验证码验证 | 防管理员操作被自动化攻击 | 路由配置 |
| HC-16 | hCaptcha 中间件必须 **fail-closed**（失败时拒绝） | 防验证服务故障时被绕过 | [server/middleware/hcaptcha.js](file:///c:/Users/Administrator/Desktop/codedog/server/middleware/hcaptcha.js) |
| HC-17 | hCaptcha 中间件 60 秒缓存，admin API 切换时必须立即清缓存 | 避免管理员改开关还要等 60 秒 | 缓存失效逻辑 |

#### 14.1.4 内容审核

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-18 | 内容发布必须包括 AI 审核 + 敏感词过滤 | 防违规内容上线 | [server/services/aiReview.js](file:///c:/Users/Administrator/Desktop/codedog/server/services/aiReview.js) |
| HC-19 | AI 审核必须用 `<user_content>` 标签包裹用户内容 | 防 prompt injection | `aiReview` 调用 |
| HC-20 | AI 审核 SSRF 防护必须四层（URL 协议/IP 解析/内网过滤/DNS pinning） | 防内网探测 | `aiReview` |
| HC-21 | 敏感 API 设置必须存数据库（非环境变量） | 支持运行时热更新，无需重启 | `system_configs` 表 |

#### 14.1.5 权限与角色

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-22 | 删除内容必须用 `canManageUser` 角色层级检查 | 防 moderator 删 admin 内容 | DELETE `/api/works/:codemaoId` 等 |
| HC-23 | `level` 字段受保护，不可直接修改 | 防越权提升角色等级 | Role 模型 |
| HC-24 | admin API 响应必须脱敏敏感 API 密钥 | 防密钥泄露 | [server/controllers/adminController.js](file:///c:/Users/Administrator/Desktop/codedog/server/controllers/adminController.js) |
| HC-25 | OAuth2 必须支持 PKCE | 防授权码拦截 | [server/utils/oauth.js](file:///c:/Users/Administrator/Desktop/codedog/server/utils/oauth.js) |
| HC-26 | OAuth2 scope 鉴权必须做应用级与用户级令牌的交集运算 | 防应用令牌越权访问用户私有数据 | OAuth2 中间件 |

#### 14.1.6 部署与运维

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-27 | Docker 容器必须以非 root 用户运行 | 安全隔离 | Dockerfile `USER app`（宝塔/Render 可选 root） |
| HC-28 | `im-web` 仅绑 `127.0.0.1:8100`，禁止直接暴露公网 | 必须经 Nginx 反代启用 HTTPS | im-system docker-compose.yml |
| HC-29 | 主站与 IM 多容器部署必须共享 `JWT_SECRET`/`SESSION_SECRET` | 防 token 跨容器失效 | 部署文档 |
| HC-30 | Nginx 反代必须配置明确的 `TRUST_PROXY` 跳数或 CIDR | 禁止 `true`；单层反代可设为 `1` | `.env` |

#### 14.1.7 IM 系统

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-31 | IM 生产环境必须 `IM_SESSION_SECRET` ≥ 32 字符 | 防弱密钥 | [im-system/apps/server/src/config.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/apps/server/src/config.js) |
| HC-32 | IM 生产环境必须 `IM_REDIS_URL` | 防重放 token 依赖 Redis | config.js |
| HC-33 | IM 生产环境必须 `IM_PUBLIC_ORIGIN` | CORS 与 SSO 跳转依赖 | config.js |
| HC-34 | IM SSO 必须用 RS256 非对称签名 | 主站持私钥签发，IM 持公钥验签，密钥分离 | [im-system/apps/server/src/auth.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/apps/server/src/auth.js) |
| HC-35 | IM SSO `jti` 必须一次性消费 | 防票据重放攻击 | `consumeOnce` |
| HC-36 | IM SSO 必须绑定 IP + 浏览器哈希 | 防票据被盗用 | `boundHash` + `networkKey` |
| HC-37 | IM 每次请求必须校验 `status` + `token_version` | 防主站禁用用户后 IM 仍可用 | `assertAccountActive` |
| HC-38 | IM `im_message` 验证码场景 `reusable=true` 2 分钟 | 平衡用户体验与防垃圾 | [im-system/apps/server/src/captcha.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/apps/server/src/captcha.js) |

#### 14.1.8 工具箱

| 编号 | 约束 | 原因 | 实现位置 |
|---|---|---|---|
| HC-39 | 终端工具箱必须支持直接改数据库开关验证码 | 验证码服务故障时紧急放行 | `do_captcha_toggle` |
| HC-40 | 工具箱配置显示必须脱敏所有敏感字段（密码/密钥/代理/令牌/API key） | 防运维截图泄露 | `do_config` |

### 14.2 最佳实践

#### 14.2.1 代码风格

- **中间件统一 async/await**：禁用 callback，避免未捕获异常
- **错误响应统一格式**：用 `errorResponse(res, msg, code)` 工具函数
- **服务层抛错，控制器层捕获**：服务层抛 `AppError`，控制器用 try-catch 包裹
- **数据库操作必须事务**：多表操作用 `sequelize.transaction(async t => {...})`
- **并发检查用条件更新**：如 `UPDATE ... WHERE member_count < max` 而非先查后改

#### 14.2.2 安全实践

- **httpOnly Cookie**：JWT 存 httpOnly Cookie，前端不可读，防 XSS 盗取
- **token_version 失效机制**：用户改密码/被禁用时 `token_version++`，所有旧 JWT 立即失效
- **敏感字段脱敏**：admin API 响应中 API key 中间用 `****` 替换
- **图片防盗链**：所有 `<img>` 加 `referrerpolicy="no-referrer"`
- **数据库 URL 启动清理**：服务启动时 `REPLACE` 掉 7 个字段中的反引号污染
- **文件上传签名校验**：IM `imageHost.validSignature` 读文件头字节验证 JPEG/PNG/WebP/GIF

#### 14.2.3 数据库实践

- **外键约束**：所有关联表必须定义 `foreignKey` + `onDelete`/`onUpdate` 策略
- **多态外键**：评论/点赞用 `resource_type` + `resource_id` 多态设计，避免多表外键
- **软删除**：用户/作品删除时设 `status='deleted'`，保留数据可恢复
- **审计日志**：6 类审计（admin/system/role/api/security/data）覆盖所有敏感操作
- **索引优化**：高频查询字段（user_id/created_at/status）必须建索引

#### 14.2.4 部署实践

- **多阶段构建**：编译工具隔离在 builder 阶段，runtime 镜像更小
- **镜像源优化**：Alpine 用清华源，npm 用淘宝源
- **layer 缓存**：依赖未变时复用 `apk add`/`npm install` 层
- **健康检查**：Docker healthcheck + 应用层 `/api/health` 双重探活
- **日志滚动**：10MB 滚动，最多 3 份，防磁盘撑爆
- **资源限制**：`mem_limit: 512m` + `cpus: '1.0'`
- **维护页机制**：更新期间用户看到维护提示，而非 502

#### 14.2.5 IM 系统实践

- **SSO 票据 30 分钟短时会话**：IM 会话 30 分钟过期，引导用户回到主站续签
- **账号状态主动推送 + 拉取校验**：主站禁用用户时主动推送状态到 IM，IM 每次请求也拉取校验
- **Redis + 内存双层防重放**：Redis 故障时降级内存，单实例仍可用
- **图床文件签名校验**：不信任 Content-Type，读文件头字节验证
- **群组成员数硬上限**：`IM_GROUP_HARD_LIMIT=5000`，防超群拖垮服务

### 14.3 严禁事项

| 编号 | 严禁 | 原因 |
|---|---|---|
| NG-1 | 严禁在生产环境用默认/弱密钥 | 启动会失败（HC-1/HC-2） |
| NG-2 | 严禁 JWT 不指定算法或允许 `none` | alg=none 攻击（HC-3） |
| NG-3 | 严禁 hCaptcha fail-open | 验证服务故障时被绕过（HC-16） |
| NG-4 | 严禁 AI 审核不包裹 `<user_content>` | prompt injection（HC-19） |
| NG-5 | 严禁 admin 路由绕过验证码 | 自动化攻击（HC-15） |
| NG-6 | 严禁 `im-web` 直接暴露公网 | 绕过 HTTPS（HC-28） |
| NG-7 | 严禁多容器部署不共享密钥 | token 跨容器失效（HC-29） |
| NG-8 | 严禁 Nginx 反代不开 `TRUST_PROXY` | 限流失效（HC-30） |
| NG-9 | 严禁 SQLite 不开外键约束 | 数据不一致（HC-7/HC-8） |
| NG-10 | 严禁 moderator 删 admin 内容不做角色层级检查 | 越权（HC-22） |
| NG-11 | 严禁 admin API 响应返回明文 API 密钥 | 密钥泄露（HC-24） |
| NG-12 | 严禁 OAuth2 不支持 PKCE | 授权码拦截（HC-25） |

### 14.4 常见陷阱与规避

#### 14.4.1 SQLite 陷阱

| 陷阱 | 后果 | 规避 |
|---|---|---|
| `foreign_keys` 只在主连接开一次 | 池中新连接外键失效 | 用 `afterConnect` 钩子每个连接都开 |
| `pool.max=2` 过小 | 事务内遗漏 `transaction: t` 时死锁 | 恢复 `max=5`，写靠 SQLite 串行化 |
| Sequelize alter 残留 `_backup` 表 | 重启死锁 | 启动时清理 `*_backup` 表 |
| 冷拷贝数据库 | WAL 模式下不一致 | 用 `sqlite3 .backup` 热备份 |

#### 14.4.2 并发陷阱

| 陷阱 | 后果 | 规避 |
|---|---|---|
| "一人一工作室"检查在事务外 | 并发请求绕过限制 | `owner_claim` 唯一索引 |
| 工作室成员数先查后改 | 并发加入超员 | 条件更新 `WHERE member_count < max` |
| 评分先读后写 | 并发评分丢失更新 | 用 `UPDATE ... SET score = score + ?` 原子操作 |

#### 14.4.3 安全陷阱

| 陷阱 | 后果 | 规避 |
|---|---|---|
| AI 审核 SSRF 无 DNS pinning | TOCTOU 攻击（首次解析正常，二次解析内网） | 解析后锁定 IP，请求时强制用该 IP |
| OAuth2 应用令牌无 scope 交集 | 应用越权访问用户私有数据 | 应用 scope ∩ 用户 scope |
| 图片 URL 反引号污染 | 头像/作品图无法显示 | 启动时 `REPLACE` 清理 7 个字段 |
| IM SSO 无 IP 绑定 | 票据被盗用 | `networkKey` + `boundHash` 绑定 |

---

## 15. 脚本与辅助工具

本章汇总项目所有脚本与辅助工具，按用途分类。**小白用户只需关注 15.1 顶层运维脚本**，其他脚本为开发/排障用途。

### 15.1 顶层运维脚本（小白必看）

位于项目根目录，是日常运维的核心入口。

| 脚本 | 平台 | 用途 | 调用方式 |
|---|---|---|---|
| [deploy.sh](file:///c:/Users/Administrator/Desktop/codedog/deploy.sh) | Linux | 主站一键部署 | `bash deploy.sh` |
| `deploy.bat` | Windows | 主站一键部署（Windows） | 双击或 `deploy.bat` |
| [update.sh](file:///c:/Users/Administrator/Desktop/codedog/update.sh) | Linux | 主站更新（等同 `codedog update`） | `bash update.sh` |
| `update.bat` | Windows | 主站更新（Windows） | 双击或 `update.bat` |
| [install.sh](file:///c:/Users/Administrator/Desktop/codedog/install.sh) | Linux | 主站首次安装向导 | `sudo bash install.sh` |
| [install-cli.sh](file:///c:/Users/Administrator/Desktop/codedog/install-cli.sh) | Linux | 安装 `codedog` 全局命令 | `bash install-cli.sh`（deploy.sh 自动调用） |
| `install-cli.bat` | Windows | 安装 `codedog` 全局命令 | 双击 |
| [codedog.sh](file:///c:/Users/Administrator/Desktop/codedog/codedog.sh) | Linux | 主站管理工具箱（菜单式） | `codedog` 或 `bash codedog.sh` |
| `codedog.bat` | Windows | 主站管理工具箱（Windows） | `codedog` 或双击 |

**IM 系统脚本**（位于 `im-system/`）：

| 脚本 | 平台 | 用途 | 调用方式 |
|---|---|---|---|
| [im-system/install.sh](file:///c:/Users/Administrator/Desktop/codedog/im-system/install.sh) | Linux | IM 一键安装向导 | `sudo bash install.sh` |
| [im-system/im.sh](file:///c:/Users/Administrator/Desktop/codedog/im-system/im.sh) | Linux | IM 管理工具箱 | `codedogim` 或 `./im.sh` |
| `im-system/im.bat` | Windows | IM 管理工具箱（Windows） | 双击 |
| [im-system/update.sh](file:///c:/Users/Administrator/Desktop/codedog/im-system/update.sh) | Linux | IM 更新 | `bash update.sh` |
| `im-system/update.bat` | Windows | IM 更新（Windows） | 双击 |

### 15.2 维护页服务器

文件：[scripts/maintenance-server.sh](file:///c:/Users/Administrator/Desktop/codedog/scripts/maintenance-server.sh)

**用途**：主站更新期间占用 3001 端口，返回维护提示页，避免用户看到 502。

**调用**：`codedog update` 智能更新流程自动调用，无需手动运行。

**命令**：
```bash
bash scripts/maintenance-server.sh start    # 启动维护页
bash scripts/maintenance-server.sh stop     # 停止维护页
```

**工作流程**：
1. 启动宿主机轻量 HTTP 服务器（Python/Node 兜底），绑定 3001 端口
2. 返回 HTTP 503 + 维护提示 HTML（[maintenance/index.html](file:///c:/Users/Administrator/Desktop/codedog/maintenance/index.html)）
3. 等待 Docker 容器停止并释放端口
4. 容器启动前停止维护页，让出端口

### 15.3 数据库一致性检查

文件：[scripts/check-consistency.js](file:///c:/Users/Administrator/Desktop/codedog/scripts/check-consistency.js)

**用途**：检查数据库数据一致性，发现并报告：
- 工作室 `member_count` 与实际成员数不匹配
- 工作室 `total_score` 与作品评分之和不匹配
- 用户 `work_count` 与实际作品数不匹配
- 孤立的 StudioMember 记录（工作室已删除）
- 孤立的 Follow 记录（用户已删除）

**调用**：
```bash
node scripts/check-consistency.js
# 或在容器内
docker compose exec codedog node scripts/check-consistency.js
```

**输出**：检查报告 + 修复建议（不自动修复，需手动确认）。

### 15.4 启动检查

文件：[scripts/check_startup.js](file:///c:/Users/Administrator/Desktop/codedog/scripts/check_startup.js)

**用途**：启动前预检，验证：
- `.env` 文件存在
- 必需环境变量已设置（JWT_SECRET/SESSION_SECRET/CORS_ORIGIN）
- 数据库文件可写（SQLite 模式）
- 端口 3001 未被占用

**调用**：
```bash
node scripts/check_startup.js
```

### 15.5 安全测试脚本

| 脚本 | 用途 |
|---|---|
| [scripts/security-attack-test.js](file:///c:/Users/Administrator/Desktop/codedog/scripts/security-attack-test.js) | 模拟常见攻击（XSS/SQL注入/路径遍历/SSRF），验证防护 |
| [scripts/security-targeted-test.js](file:///c:/Users/Administrator/Desktop/codedog/scripts/security-targeted-test.js) | 针对性安全测试（JWT 伪造/越权/枚举） |

**调用**：
```bash
node scripts/security-attack-test.js
node scripts/security-targeted-test.js
```

**注意**：仅在测试环境运行，会发送大量恶意请求，**禁止在生产环境运行**。

### 15.6 主站服务端脚本

位于 [server/scripts/](file:///c:/Users/Administrator/Desktop/codedog/server/scripts)：

| 脚本 | 用途 | 调用方式 |
|---|---|---|
| [repairImageUrls.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/repairImageUrls.js) | 修复历史图片/头像 URL 反引号污染 | `docker compose exec codedog node server/scripts/repairImageUrls.js` |
| [checkAvatars.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/checkAvatars.js) | 检查所有用户头像 URL 有效性 | `docker compose exec codedog node server/scripts/checkAvatars.js` |
| [fix-ipban-dirty-data.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/fix-ipban-dirty-data.js) | 修复 IP 封禁表脏数据 | `docker compose exec codedog node server/scripts/fix-ipban-dirty-data.js` |
| [test-db-migration.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/test-db-migration.js) | 数据库迁移测试 | `node server/scripts/test-db-migration.js` |
| [smoke-developer-full.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/smoke-developer-full.js) | 开发者 API 完整烟雾测试 | `node server/scripts/smoke-developer-full.js` |
| [smoke-developer-http.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/smoke-developer-http.js) | 开发者 API HTTP 烟雾测试 | `node server/scripts/smoke-developer-http.js` |
| [smoke-developer-static.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/smoke-developer-static.js) | 开发者 API 静态分析测试 | `node server/scripts/smoke-developer-static.js` |
| [smoke-oauth-utils.js](file:///c:/Users/Administrator/Desktop/codedog/server/scripts/smoke-oauth-utils.js) | OAuth 工具函数测试 | `node server/scripts/smoke-oauth-utils.js` |

**repairImageUrls.js 详解**（最常用）：

**修复范围**（7 个字段）：
- `User.avatar`
- `Work.preview` / `Work.work_url`
- `Post.cover` / `Post.cover_url`
- `Studio.cover`
- `Banner.image_url`

**修复逻辑**：
- 去除反引号包裹（`` `https://...` `` → `https://...`）
- 相对路径转绝对路径（`/uploads/...` → `https://域名/uploads/...`）

**调用**：
```bash
# 工具箱方式（推荐）
codedog fix → 5 执行图片/头像 URL 修复脚本

# 命令行方式
docker compose exec codedog node server/scripts/repairImageUrls.js

# 修复后重启刷新缓存
docker compose restart codedog
```

### 15.7 IM 系统脚本

位于 [im-system/scripts/](file:///c:/Users/Administrator/Desktop/codedog/im-system/scripts)：

| 脚本 | 用途 | 调用方式 |
|---|---|---|
| [keygen.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/scripts/keygen.js) | 生成 RS256 SSO 密钥对 | `node scripts/keygen.js` |
| [toolbox.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/scripts/toolbox.js) | IM 管理工具箱核心 | `./im.sh` 或 `codedogim` |
| [update.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/scripts/update.js) | IM 智能更新 | `codedogim 4` |
| [bind-community.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/scripts/bind-community.js) | 绑定编程狗社区主站 | `node scripts/bind-community.js` |
| [smoke-local.js](file:///c:/Users/Administrator/Desktop/codedog/im-system/scripts/smoke-local.js) | 本地烟雾测试 | `node scripts/smoke-local.js` |

**keygen.js 详解**：

**作用**：生成 RS256 非对称密钥对，用于 IM SSO 票据签名。

**输出**：
- `im-system/secrets/im_sso_private.pem`：私钥（**主站持有**，用于签发票据）
- `im-system/secrets/im_sso_public.pem`：公钥（**IM 服务端持有**，用于验签）

**调用**：
```bash
cd im-system
node scripts/keygen.js
```

**安装向导自动调用**：`install.sh` 中 `[ -f secrets/im_sso_public.pem ] || node scripts/keygen.js`。

**bind-community.js 详解**：

**作用**：把 IM 的 `IM_PUBLIC_URL` 和 `IM_SSO_PRIVATE_KEY_BASE64` 写入主站 `.env`，并重启主站容器。

**调用**：
```bash
cd im-system
node scripts/bind-community.js /opt/codedog    # 参数为主站目录
```

**install.sh 自动调用**：选择"绑定本机编程狗社区"时自动执行。

### 15.8 开发期补丁脚本（历史归档）

位于 [scripts/](file:///c:/Users/Administrator/Desktop/codedog/scripts) 目录下的 `.b64`、`patch_*.js`、`fix_*.js`、`apply_*.js` 等文件是**开发期间用于批量修复代码的临时脚本**，**已经应用完成，普通用户无需运行**。

**包括**：
- `patch_admin_api.js` / `patch_admin_vue.js` / `patch_controller.js`：补丁脚本
- `apply_dev_fixes.js` / `apply_developer_patches.js`：开发者模块补丁
- `fix_auditcount.js` / `fix_cleanup.js` / `fix_dev.js` / `fix_doublelog.js` / `fix_ratelimit.js` / `fix_tabs.js`：专项修复
- `assemble_controller.js` / `rebuild_controller.js` / `run_dev_controller_patch.js`：控制器重建
- `dedup_vue.js`：Vue 文件去重
- `*.b64`：Base64 编码的代码片段（已被 decoder.js 解码并应用）
- `decoder.js`：解码 .b64 文件的工具

**警告**：这些脚本再次运行可能**破坏代码**，仅作历史归档用途。**禁止在生产环境运行**。

### 15.9 部署平台配置文件

项目支持多种部署平台，配置文件位于根目录：

| 文件 | 平台 | 用途 |
|---|---|---|
| [Dockerfile](file:///c:/Users/Administrator/Desktop/codedog/Dockerfile) | Docker | 主站多阶段构建 |
| [docker-compose.yml](file:///c:/Users/Administrator/Desktop/codedog/docker-compose.yml) | Docker Compose | 主站容器编排 |
| [render.yaml](file:///c:/Users/Administrator/Desktop/codedog/render.yaml) | Render | Render.com 部署配置 |
| [fly.toml](file:///c:/Users/Administrator/Desktop/codedog/fly.toml) | Fly.io | Fly.io 部署配置 |
| [DEPLOY.md](file:///c:/Users/Administrator/Desktop/codedog/DEPLOY.md) | 通用 | 通用部署文档 |
| [DEPLOY_RENDER.md](file:///c:/Users/Administrator/Desktop/codedog/DEPLOY_RENDER.md) | Render | Render 部署文档 |
| [DEPLOY_FLY.md](file:///c:/Users/Administrator/Desktop/codedog/DEPLOY_FLY.md) | Fly.io | Fly.io 部署文档 |

**IM 系统**：
| 文件 | 用途 |
|---|---|
| [im-system/Dockerfile](file:///c:/Users/Administrator/Desktop/codedog/im-system/Dockerfile) | IM 多阶段构建（server + web + admin） |
| [im-system/docker-compose.yml](file:///c:/Users/Administrator/Desktop/codedog/im-system/docker-compose.yml) | IM 内置 MySQL+Redis 模式 |
| [im-system/docker-compose.external.yml](file:///c:/Users/Administrator/Desktop/codedog/im-system/docker-compose.external.yml) | IM 外部 MySQL+Redis 模式 |

### 15.10 文档资源

| 文档 | 用途 |
|---|---|
| [README.md](file:///c:/Users/Administrator/Desktop/codedog/README.md) | 项目简介 |
| [CODE_WIKI.md](file:///c:/Users/Administrator/Desktop/codedog/CODE_WIKI.md) | **本文档**（Code Wiki 完整技术文档） |
| [DEPLOY.md](file:///c:/Users/Administrator/Desktop/codedog/DEPLOY.md) | 通用部署文档 |
| [docs/DEPLOY.md](file:///c:/Users/Administrator/Desktop/codedog/docs/DEPLOY.md) | 部署文档（docs 目录副本） |
| [docs/IM-ARCHITECTURE.md](file:///c:/Users/Administrator/Desktop/codedog/docs/IM-ARCHITECTURE.md) | IM 架构文档 |
| [docs/codemao-api.md](file:///c:/Users/Administrator/Desktop/codedog/docs/codemao-api.md) | 编程猫 API 文档 |
| [im-system/README.md](file:///c:/Users/Administrator/Desktop/codedog/im-system/README.md) | IM 系统说明 |
| [.env.example](file:///c:/Users/Administrator/Desktop/codedog/.env.example) | 主站环境变量示例 |
| [im-system/.env.example](file:///c:/Users/Administrator/Desktop/codedog/im-system/.env.example) | IM 环境变量示例 |

### 15.11 脚本使用速查表

| 场景 | 脚本/命令 |
|---|---|
| 首次部署主站 | `bash deploy.sh` |
| 首次部署 IM | `cd im-system && sudo bash install.sh` |
| 主站日常更新 | `codedog update` |
| IM 日常更新 | `codedogim 4` |
| 主站修复常见问题 | `codedog fix` |
| 主站验证码紧急关闭 | `codedog captcha` → 5 |
| 检查数据库一致性 | `node scripts/check-consistency.js` |
| 修复图片 URL | `codedog fix` → 5 |
| 重新生成 IM SSO 密钥 | `codedogim 8` |
| 备份主站 SQLite | `codedog db` → 1 |
| 备份 IM MySQL | `codedogim 10` |
| 查看主站日志 | `codedog logs` |
| 查看 IM 日志 | `codedogim 5` |
| 安全测试（仅测试环境） | `node scripts/security-attack-test.js` |
| 开发者 API 烟雾测试 | `node server/scripts/smoke-developer-full.js` |

### 15.12 脚本开发规范

如需新增运维脚本，请遵循：

1. **Linux 用 `.sh`，Windows 用 `.bat`**，功能对等
2. **`.sh` 开头加 `#!/bin/bash` + `set -e`**（出错即停）
3. **交互式输入用 `read -p`**，敏感信息用 `read -s -p`
4. **危险操作必须确认**：`read -p "确认? (y/n): " confirm && [ "$confirm" = "y" ]`
5. **错误信息加前缀** `[错误]` / `[警告]`，成功加 `[OK]`
6. **路径用绝对路径**或 `$(cd "$(dirname "$0")" && pwd)` 获取脚本目录
7. **Docker 命令兼容**：`docker compose` 优先，回退 `docker-compose`
8. **颜色输出**：`RED='\033[0;31m'` + `echo -e "${RED}错误${NC}"`
9. **注释用中文**，说明脚本用途、参数、输出
10. **幂等性**：重复运行不报错，已存在则跳过

---

## 附录：文档维护说明

### A.1 文档更新时机

本文档应在以下场景更新：
- 新增模块/服务（如新增子项目）
- 重大架构调整（如更换数据库、新增中间件）
- 新增硬约束（如修复安全 bug 后新增约束）
- 部署方式变化（如新增部署平台）
- 环境变量增减
- 脚本增减

### A.2 文档版本

- **版本**：1.0
- **生成日期**：2026-07-17
- **覆盖范围**：主站（server/ + client/）+ IM 系统（im-system/）
- **代码版本**：GitHub main 分支最新提交

### A.3 快速导航（重温）

- [第1章 文档定位与阅读约定](#1-文档定位与阅读约定)
- [第2章 项目概述](#2-项目概述)
- [第3章 整体架构](#3-整体架构)
- [第4章 项目目录结构](#4-项目目录结构)
- [第5章 服务端架构](#5-服务端架构)
- [第6章 客户端架构](#6-客户端架构)
- [第7章 IM 系统架构](#7-im-系统架构)
- [第8章 关键流程详解](#8-关键流程详解)
- [第9章 数据库设计](#9-数据库设计)
- [第10章 权限与角色体系](#10-权限与角色体系)
- [第11章 部署与运行方式](#11-部署与运行方式)
- [第12章 配置文档](#12-配置文档)
- [第13章 运维工具箱](#13-运维工具箱)
- [第14章 硬约束与最佳实践](#14-硬约束与最佳实践)
- [第15章 脚本与辅助工具](#15-脚本与辅助工具)

### A.4 联系与反馈

如发现文档错误或遗漏，请：
1. 提交 GitHub Issue
2. 或直接提交 PR 修改 [CODE_WIKI.md](file:///c:/Users/Administrator/Desktop/codedog/CODE_WIKI.md)

**文档优先级**：代码实现 > 本文档 > 其他 docs/ 文档。如有冲突，以代码实现为准。

---

**文档结束**
