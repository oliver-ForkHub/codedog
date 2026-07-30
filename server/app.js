require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { installConsoleCapture } = require('./utils/logger');

// 尽早捕获全应用 stdout/stderr，后台“文件日志”不再只包含少数手工埋点。
installConsoleCapture();

const { sequelize, testConnection } = require('./config/database');
const { isValidSessionSecret, resolveSessionSecret } = require('./config/auth');
const { User } = require('./models');
const DbAdapter = require('./utils/dbAdapter');

const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const adminRoutes = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const studioRoutes = require('./routes/studioRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const followRoutes = require('./routes/followRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const geetestRoutes = require('./routes/geetestRoutes');
const hcaptchaRoutes = require('./routes/hcaptchaRoutes');
const dbMigrationRoutes = require('./routes/dbMigration');
const developerRoutes = require('./routes/developerRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const openRoutes = require('./routes/openRoutes');
const { hcaptchaGuard } = require('./middleware/hcaptcha');
const { createRateLimiter } = require('./middleware/rateLimit');
const { ipBanMiddleware } = require('./middleware/ipBan');
const { getMobileVersionPolicy, mobileVersionGate } = require('./middleware/mobileVersion');
const { createSequelizeSessionStore } = require('./services/sessionStore');

const app = express();
app.disable('x-powered-by');

// 信任代理：Docker/Nginx 部署时必需,否则 req.ip 返回 Docker 网关 IP 而非真实客户端 IP
// 修复:显式把字符串 "false" 识别为关闭,避免 Express 把 "false" 当 IP 解析导致崩溃
const rawTrustProxy = process.env.TRUST_PROXY;
const trustProxySetting =
  rawTrustProxy === 'true'
    ? true
    : rawTrustProxy && rawTrustProxy !== 'false'
      ? rawTrustProxy
      : 'loopback, 172.16.0.0/12, 192.168.0.0/16, 10.0.0.0/8';
app.set('trust proxy', trustProxySetting);


// Maintenance mode: intercept all requests when active
const { isMaintenanceMode, maintenanceMiddleware } = require('./middleware/maintenance');
const maintenanceActive = isMaintenanceMode();
if (maintenanceActive) {
    console.log('⚠️  维护模式已开启 - Maintenance mode active');
}

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !isProduction;

function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        // script-src 保持严格:未知 JS 一旦放行,XSS 直接成真
        "script-src 'self' https://static.geetest.com https://*.geetest.com https://hcaptcha.com https://*.hcaptcha.com https://static.cloudflareinsights.com 'sha256-woUEpn988/d1lffqaFZ+jz+X5Lq2Kh9MoieNyiJyuzY='",
        // style/img/font 放宽到 https: + data:,能加载任何 HTTPS 源,
        // 这三类就算被注入也只能改显示/显示图片,不会执行任意代码
        "style-src 'self' 'unsafe-inline' https:",
        "img-src 'self' data: https: http:",
        "font-src 'self' data: https:",
        "connect-src 'self' https://*.codemao.cn wss://*.codemao.cn https://*.geetest.com https://hcaptcha.com https://*.hcaptcha.com https://cloudflareinsights.com",
        "frame-src 'self' https://*.codemao.cn https://hcaptcha.com/",
        "form-action 'self'"
    ].join('; '));
}

// 修复: 删除本地 resolveSessionSecret,改用 auth.js 的持久化版本,确保 PM2 cluster 各 worker 共享同一密钥
// isValidSessionSecret 仍保留用于其他校验场景

async function ensureInitialSuperadmin() {
    const userCount = await DbAdapter.count(User, {});
    if (userCount === 0) {
        console.log('No users exist. Configure INITIAL_ADMIN_CODEMAO_ID or a bootstrap token before the first login.');
        return;
    }
    const superadminCount = await DbAdapter.count(User, { where: { role: 'superadmin' } });
    if (superadminCount === 0) console.warn('No superadmin exists. Use the documented explicit bootstrap configuration; automatic promotion is disabled.');
}

// CORS 配置：默认不允许任意来源，只放行 CORS_ORIGIN 环境变量中配置的域名
// 多个 origin 可用逗号分隔；未配置时生产环境拒绝跨域，开发环境放行 localhost
const rawCorsOrigin = process.env.CORS_ORIGIN || '';
const allowedOrigins = rawCorsOrigin
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

function isSameHostBrowserOrigin(req, requestOrigin) {
    // Sec-Fetch-Site is supplied by the browser and cannot be set by page
    // JavaScript. It remains accurate even when a reverse proxy rewrites Host.
    if (String(req.get('sec-fetch-site') || '').toLowerCase() === 'same-origin') {
        return true;
    }
    try {
        const originHost = new URL(requestOrigin).host.toLowerCase();
        const requestHost = String(req.get('host') || '').trim().toLowerCase();
        return Boolean(requestHost) && originHost === requestHost;
    } catch (_) {
        return false;
    }
}

function isAllowedBrowserOrigin(req, requestOrigin) {
    if (!requestOrigin) return true;
    // 同域请求不应依赖 CORS_ORIGIN。反向代理部署或更换站点域名时，浏览器
    // Origin 与当前 Host 一致即可安全放行；真正跨域仍必须命中显式白名单。
    if (isSameHostBrowserOrigin(req, requestOrigin)) return true;
    if (allowedOrigins.length === 0) {
        return !isProduction && /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin);
    }
    return allowedOrigins.includes(requestOrigin);
}

// CORS response headers alone do not prevent a browser from sending a state-changing
// request. Reject explicit foreign/null origins before authentication or business logic.
app.use((req, res, next) => {
    const requestOrigin = req.header('Origin');
    const isUnsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (isUnsafeMethod && requestOrigin && !isAllowedBrowserOrigin(req, requestOrigin)) {
        return res.status(403).json({ code: 403, msg: 'Cross-origin request blocked', data: null });
    }
    return next();
});

app.use(cors((req, callback) => {
    const requestOrigin = req.header('Origin');
    const allow = isAllowedBrowserOrigin(req, requestOrigin);

    callback(null, {
        origin: allow,
        credentials: true,
        optionsSuccessStatus: 204
    });
}));

app.use((req, res, next) => {
    setSecurityHeaders(res);
    next();
});

if (maintenanceActive) {
    app.use(maintenanceMiddleware);
}

const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: 'login',
    keyGenerator: req => `${req.ip}:${String(req.body?.username || '').toLowerCase()}`
});

const codemaoImportRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    keyPrefix: 'codemao-import'
});

const writeRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    keyPrefix: 'api-write',
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ code: 400, msg: 'Invalid JSON request body', data: null });
    }
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ code: 413, msg: 'Request body is too large', data: null });
    }
    if (err?.status && err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ code: err.status, msg: 'Invalid request body', data: null });
    }
    next(err);
});

app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    const normalizedQuery = { ...req.query };
    if (normalizedQuery.page !== undefined) {
        const page = parseInt(normalizedQuery.page, 10);
        normalizedQuery.page = String(Number.isFinite(page) && page > 0 ? page : 1);
    }
    if (normalizedQuery.pageSize !== undefined) {
        const pageSize = parseInt(normalizedQuery.pageSize, 10);
        const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
        normalizedQuery.pageSize = String(Math.min(normalizedPageSize, 100));
    }
    // 修复: 添加 writable: true,避免后续中间件无法重新赋值 req.query
    Object.defineProperty(req, 'query', { value: normalizedQuery, writable: true, configurable: true, enumerable: true });
    next();
});

const sessionSecret = resolveSessionSecret();
if (isProduction && !isValidSessionSecret(sessionSecret)) {
    throw new Error('SESSION_SECRET is missing or too short');
}
const sessionStore = isProduction ? createSequelizeSessionStore(session, sequelize) : null;

const sessionOptions = {
    secret: sessionSecret,
    name: 'codedog.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax'
    }
};

if (sessionStore) sessionOptions.store = sessionStore;

app.use(session(sessionOptions));

// IP 封禁中间件: 置于限流之前,被封禁 IP 直接 403,不占用限流配额
app.use(ipBanMiddleware);

app.get('/api/mobile/version', async (req, res, next) => {
    try { res.json({ code: 200, msg: 'ok', data: await getMobileVersionPolicy() }); }
    catch (error) { next(error); }
});
app.use('/api', mobileVersionGate);

app.use('/api', writeRateLimiter);
app.use('/api/users/login', loginRateLimiter);
// 修复: 专项限流应挂在实际执行导入的路由 POST /api/works/import/:codemaoId 上
// 原先挂在 /api/works/codemao(GET 只读接口),无法限制实际触发编程猫 API + 审核 + 写库的导入操作
app.use('/api/works/import', codemaoImportRateLimiter);

app.use(hcaptchaGuard);

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: setSecurityHeaders,
    dotfiles: 'deny',
    index: false
}));

app.use('/api/users', userRoutes);
app.use('/api/works', workRoutes);
app.use('/api/admin/db-migration', dbMigrationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/studios', studioRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/geetest', geetestRoutes);
app.use('/api/hcaptcha', hcaptchaRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/uploads', require('./routes/uploadRoutes'));
app.use('/api/oauth', oauthRoutes);
app.use('/api/open/v1', openRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Service is running' });
});

const frontendPath = path.join(__dirname, '../client/dist');
const alternativePath = path.join(__dirname, 'public');

function setFrontendCacheHeaders(res, filePath) {
    setSecurityHeaders(res);
    const normalizedPath = String(filePath || '').replace(/\\/g, '/');
    if (normalizedPath.endsWith('/index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    } else if (normalizedPath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
}

function sendFrontendIndex(res, rootPath) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(path.join(rootPath, 'index.html'));
}

if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath, { setHeaders: setFrontendCacheHeaders }));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        if (req.path.startsWith('/uploads/')) return res.status(404).end();
        if (req.path.startsWith('/assets/')) return res.status(404).set('Cache-Control', 'no-store').end();
        return sendFrontendIndex(res, frontendPath);
    });
} else if (fs.existsSync(alternativePath)) {
    app.use(express.static(alternativePath, { setHeaders: setFrontendCacheHeaders }));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        if (req.path.startsWith('/uploads/')) return res.status(404).end();
        if (req.path.startsWith('/assets/')) return res.status(404).set('Cache-Control', 'no-store').end();
        return sendFrontendIndex(res, alternativePath);
    });
}

app.use((req, res) => {
    res.status(404).json({ code: 404, msg: 'Not found', data: null });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err.message, err.stack);
    res.status(500).json({ code: 500, msg: 'Internal server error', data: null });
});

const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

async function startServer() {
    try {
        await testConnection();

        // 生产环境禁用 alter:true：Sequelize 对 SQLite 的 alter 会创建临时表并
        // 复制数据，若中间崩溃会残留 *_backup 表，导致下次启动 id 唯一冲突。
        // 仅开发环境允许 alter:true。
        const syncOptions = isDevelopment ? { alter: true } : {};

        // 启动前兜底：清理 SQLite 中残留的 Sequelize 临时/备份表
        // 这些表通常是上一次 alter 中断遗留，会阻塞后续启动。
        if (isProduction && sequelize.options.dialect === 'sqlite') {
            try {
                const backupTables = await sequelize.query(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup'",
                    { type: sequelize.QueryTypes.SELECT }
                );
                for (const { name } of backupTables) {
                    const quotedName = sequelize.getQueryInterface().queryGenerator.quoteIdentifier(name);
                    await sequelize.query(`DROP TABLE IF EXISTS ${quotedName}`);
                    console.warn(`[启动清理] 已删除残留临时表: ${name}`);
                }
            } catch (cleanupError) {
                console.warn('[启动清理] 清理残留临时表失败:', cleanupError.message);
            }
        }

        // 迁移(必须在 sync 之前): 补齐老数据库缺失的列
        // 背景: 生产环境 sync 不带 alter,新增字段不会自动加到老数据库
        // 查询/写入时因找不到列而报错(SQLITE_ERROR: no such column)
        // 这里统一预检并 ALTER TABLE 补齐所有已知的新增列
        try {
            const dialect = sequelize.options.dialect;
            const existingTableNames = new Set((await sequelize.getQueryInterface().showAllTables()).map(item => {
                if (typeof item === 'string') return item.toLowerCase();
                return String(item.tableName || item.table_name || item.name || '').toLowerCase();
            }));

            // 通用: 检查表是否存在且缺少某列,缺少则 ALTER TABLE ADD COLUMN
            async function ensureColumn(tableName, columnName, columnDef) {
                const quoteIdentifier = value => sequelize.getQueryInterface().queryGenerator.quoteIdentifier(value);
                const quotedTable = quoteIdentifier(tableName);
                const quotedColumn = quoteIdentifier(columnName);
                // 全新安装时表尚未由 sync 创建；此时跳过补列，让后续 sync 按完整模型建表。
                // 旧库中已存在的表才执行 ALTER，兼容 SQLite 与 MySQL。
                if (!existingTableNames.has(String(tableName).toLowerCase())) return false;
                if (dialect === 'sqlite') {
                    const cols = await sequelize.query(`PRAGMA table_info(${quotedTable})`, { type: sequelize.QueryTypes.SELECT });
                    if (!cols.some(c => c.name === columnName)) {
                        console.log(`[迁移] 给 ${tableName} 表添加 ${columnName} 列...`);
                        // 修复: SQL 必须包含列名,否则 ALTER TABLE 报语法错误/列名丢失
                        await sequelize.query(`ALTER TABLE ${quotedTable} ADD COLUMN ${quotedColumn} ${columnDef.sqlite}`);
                        return true;
                    }
                } else if (dialect === 'mysql') {
                    const cols = await sequelize.query(`SHOW COLUMNS FROM ${quotedTable} LIKE :columnName`, { replacements: { columnName }, type: sequelize.QueryTypes.SELECT });
                    if (cols.length === 0) {
                        console.log(`[迁移] 给 ${tableName} 表添加 ${columnName} 列...`);
                        // 修复: SQL 必须包含列名
                        await sequelize.query(`ALTER TABLE ${quotedTable} ADD COLUMN ${quotedColumn} ${columnDef.mysql}`);
                        return true
                    }
                }
                return false;
            }

            // User 表新增字段
            await ensureColumn('users', 'token_version', { sqlite: 'INTEGER DEFAULT 0', mysql: 'INT DEFAULT 0' });
            await ensureColumn('users', 'password_changed_at', { sqlite: 'DATETIME', mysql: 'DATETIME NULL' });
            // 个人主页封面和收藏公开设置。模型新增字段必须同步加入启动预检，
            // 否则旧数据库在登录查询 User 全字段时会因 no such column 直接返回 500。
            await ensureColumn('users', 'profile_cover', { sqlite: 'VARCHAR(500)', mysql: 'VARCHAR(500) NULL' });
            await ensureColumn('users', 'show_favorites', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' });

            // Post 表新增字段
            await ensureColumn('posts', 'hidden_reason', { sqlite: 'VARCHAR(50)', mysql: 'VARCHAR(50) NULL' });
            // 成熟论坛基础字段。旧数据全部保留，board_id 在 sync 后按原 category 回填。
            await ensureColumn('posts', 'board_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('posts', 'studio_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('posts', 'legacy_studio_forum_post_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('comments', 'legacy_studio_forum_reply_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('user_warnings', 'source_title', { sqlite: 'VARCHAR(255)', mysql: 'VARCHAR(255) NULL' });
            await ensureColumn('user_warnings', 'source_content', { sqlite: 'TEXT', mysql: 'TEXT NULL' });
            await ensureColumn('posts', 'post_type', { sqlite: "VARCHAR(30) NOT NULL DEFAULT 'discussion'", mysql: "VARCHAR(30) NOT NULL DEFAULT 'discussion'" });
            await ensureColumn('posts', 'last_reply_at', { sqlite: 'DATETIME', mysql: 'DATETIME NULL' });
            await ensureColumn('posts', 'last_reply_user_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('posts', 'last_comment_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('posts', 'reply_count', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'INT NOT NULL DEFAULT 0' });
            await ensureColumn('posts', 'participant_count', { sqlite: 'INTEGER NOT NULL DEFAULT 1', mysql: 'INT NOT NULL DEFAULT 1' });
            await ensureColumn('posts', 'is_locked', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' });
            await ensureColumn('posts', 'slow_mode_seconds', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'INT NOT NULL DEFAULT 0' });
            await ensureColumn('posts', 'accepted_comment_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('posts', 'merged_into_post_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            // 主题关注的轻量未读游标。打开主题时更新时间，不保存逐条已读回执。
            await ensureColumn('post_subscriptions', 'last_read_at', { sqlite: 'DATETIME', mysql: 'DATETIME NULL' });
            await ensureColumn('forum_boards', 'studio_recruitment_only', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' });
            await ensureColumn('works', 'is_sidebar_recommended', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' });
            await ensureColumn('works', 'sidebar_sort_order', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'INT NOT NULL DEFAULT 0' });

            // Banner 表新增字段
            await ensureColumn('banners', 'source', { sqlite: 'VARCHAR(20)', mysql: 'VARCHAR(20) NULL' });

            // 公告展示配置: 颜色 + 展示位置
            await ensureColumn('announcements', 'color', { sqlite: "VARCHAR(20) DEFAULT 'blue'", mysql: "VARCHAR(20) NOT NULL DEFAULT 'blue'" });
            await ensureColumn('announcements', 'show_top_bar', { sqlite: 'INTEGER DEFAULT 1', mysql: 'TINYINT(1) NOT NULL DEFAULT 1' });
            await ensureColumn('announcements', 'show_popup', { sqlite: 'INTEGER DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' });
            await ensureColumn('announcements', 'show_community', { sqlite: 'INTEGER DEFAULT 1', mysql: 'TINYINT(1) NOT NULL DEFAULT 1' });
            await ensureColumn('announcements', 'author_id', { sqlite: 'INTEGER', mysql: 'INT NULL' });

            // Studio 表新增字段 + 回填 owner_claim
            const addedOwnerClaim = await ensureColumn('studios', 'owner_claim', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('studios', 'member_limit', { sqlite: 'INTEGER NOT NULL DEFAULT 100', mysql: 'INT NOT NULL DEFAULT 100' });
            await ensureColumn('studios', 'recruitment_status', { sqlite: "VARCHAR(20) NOT NULL DEFAULT 'open'", mysql: "VARCHAR(20) NOT NULL DEFAULT 'open'" });
            await ensureColumn('studios', 'application_questions', { sqlite: "TEXT NOT NULL DEFAULT '[]'", mysql: 'TEXT NULL' });
            await ensureColumn('studios', 'application_cooldown_days', { sqlite: 'INTEGER NOT NULL DEFAULT 7', mysql: 'INT NOT NULL DEFAULT 7' });
            await ensureColumn('studios', 'leave_work_policy', { sqlite: "VARCHAR(20) NOT NULL DEFAULT 'retain'", mysql: "VARCHAR(20) NOT NULL DEFAULT 'retain'" });
            await ensureColumn('studios', 'im_group_id', { sqlite: 'VARCHAR(100)', mysql: 'VARCHAR(100) NULL' });
            await ensureColumn('studio_members', 'permissions', { sqlite: 'TEXT', mysql: 'TEXT NULL' });
            await ensureColumn('studio_members', 'application_message', { sqlite: 'VARCHAR(500)', mysql: 'VARCHAR(500) NULL' });
            await ensureColumn('studio_members', 'application_answers', { sqlite: 'TEXT', mysql: 'TEXT NULL' });
            await ensureColumn('studio_members', 'review_reason', { sqlite: 'VARCHAR(500)', mysql: 'VARCHAR(500) NULL' });
            await ensureColumn('studio_members', 'reviewed_by', { sqlite: 'INTEGER', mysql: 'INT NULL' });
            await ensureColumn('studio_members', 'reviewed_at', { sqlite: 'DATETIME', mysql: 'DATETIME NULL' });
            await ensureColumn('studio_works', 'review_reason', { sqlite: 'VARCHAR(500)', mysql: 'VARCHAR(500) NULL' });
            await ensureColumn('studio_works', 'is_featured', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' });
            await ensureColumn('studio_works', 'sort_order', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'INT NOT NULL DEFAULT 0' });
            if (addedOwnerClaim) {
                await sequelize.query("UPDATE studios SET owner_claim = owner_id WHERE status != 'banned' AND owner_claim IS NULL");
                console.log('[迁移] owner_claim 已回填 = owner_id');
            }

            // 修复: Report 表新增 merged_from_ids + status 加 merged
            await ensureColumn('reports', 'merged_from_ids', { sqlite: 'TEXT', mysql: 'TEXT NULL' });
            // 修复: Notification 表加 meta 字段(站内信管理员选项)
            await ensureColumn('notifications', 'meta', { sqlite: 'TEXT', mysql: 'TEXT NULL' });
            // MySQL: 修改 status ENUM 支持 merged + reason 改 TEXT
            if (dialect === 'mysql') {
                try {
                    const cols = await sequelize.query(`SHOW COLUMNS FROM reports LIKE 'status'`, { type: sequelize.QueryTypes.SELECT });
                    if (cols.length > 0 && !cols[0].Type.includes('merged')) {
                        console.log('[迁移] reports.status 加 merged...');
                        await sequelize.query("ALTER TABLE reports MODIFY COLUMN status ENUM('pending','processing','resolved','rejected','merged') NOT NULL DEFAULT 'pending'");
                    }
                    // 修复: reason 从 VARCHAR(200) 改 TEXT,防止合并多条原因时截断
                    const reasonCol = await sequelize.query(`SHOW COLUMNS FROM reports LIKE 'reason'`, { type: sequelize.QueryTypes.SELECT });
                    if (reasonCol.length > 0 && reasonCol[0].Type.includes('varchar')) {
                        console.log('[迁移] reports.reason 改 TEXT...');
                        await sequelize.query("ALTER TABLE reports MODIFY COLUMN reason TEXT NOT NULL");
                    }
                } catch (e) {
                    console.warn('[迁移] reports 列修改跳过:', e.message);
                }
            }

            console.log('[迁移] 列预检完成');


            // 开发者应用审核历史表(记录每次审核/限流/密钥等变更,便于追溯)
            try {
                const tables = await sequelize.getQueryInterface().showAllTables();
                if (!tables.includes('developer_app_audit_logs')) {
                    const ddl = [
                        'CREATE TABLE IF NOT EXISTS developer_app_audit_logs (',
                        'id INTEGER PRIMARY KEY AUTOINCREMENT,',
                        'app_id INTEGER NOT NULL,',
                        'actor_user_id INTEGER,',
                        'action VARCHAR(50) NOT NULL,',
                        'from_status VARCHAR(20),',
                        'to_status VARCHAR(20),',
                        'review_note TEXT,',
                        'rate_limit_before INTEGER,',
                        'rate_limit_after INTEGER,',
                        'meta TEXT,',
                        'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
                        'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
                        ')'
                    ].join(String.fromCharCode(10));
                    await sequelize.query(ddl);
                    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_developer_app_audit_logs_app_id ON developer_app_audit_logs (app_id)');
                    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_developer_app_audit_logs_created_at ON developer_app_audit_logs (created_at)');
                    console.log('[迁移] developer_app_audit_logs created');
                }
            } catch (auditTableErr) {
                console.warn('[迁移] developer_app_audit_logs creation skipped:', auditTableErr.message);
            }


        } catch (migrationErr) {
            // 表可能尚未创建(首次部署),sync 后会自动带所有列,忽略
            console.warn('[迁移] 列预检跳过:', migrationErr.message);
        }

        await sequelize.sync(syncOptions);

        // 论坛默认版块采用幂等种子：重复启动或智能更新不会覆盖管理员后续修改。
        try {
            const { ForumBoard, Post, Comment, StudioForumPost, StudioForumReply } = require('./models');
            const defaultBoards = [
                { slug: 'discussion', name: '交流讨论', description: '讨论编程、创作与社区话题', icon: '💬', color: '#fec433', sort_order: 10 },
                { slug: 'question', name: '问答互助', description: '提出问题，等待社区成员解答', icon: '❓', color: '#5b8def', sort_order: 20 },
                { slug: 'share', name: '作品分享', description: '分享作品、经验、灵感与创作过程', icon: '✨', color: '#8b6ee8', sort_order: 30 },
                { slug: 'tutorial', name: '教程知识', description: '发布教程、知识总结与学习资料', icon: '📚', color: '#37a56b', sort_order: 40 },
                { slug: 'studios', name: '工作室论坛', description: '浏览各工作室的公开主题，工作室成员可参与讨论', icon: '🏠', color: '#c47c00', sort_order: 45 },
                { slug: 'news', name: '官方公告', description: '编程狗官方动态与重要通知', icon: '📢', color: '#ef6a5b', sort_order: 50, allow_post_roles: ['admin', 'superadmin'] }
            ];
            for (const board of defaultBoards) await ForumBoard.findOrCreate({ where: { slug: board.slug }, defaults: board });
            const studioBoard = await ForumBoard.findOne({ where: { slug: 'studios' } });
            const legacyStudioPosts = await StudioForumPost.findAll({ where: { status: 'active' }, order: [['id', 'ASC']] });
            for (const legacyPost of legacyStudioPosts) {
                const [nativePost] = await Post.findOrCreate({
                    where: { legacy_studio_forum_post_id: legacyPost.id },
                    defaults: {
                        title: legacyPost.title, content: legacyPost.content, user_id: legacyPost.user_id,
                        category: 'studios', board_id: studioBoard.id, studio_id: legacyPost.studio_id,
                        post_type: 'discussion', status: 'published', is_top: legacyPost.is_pinned,
                        view_count: legacyPost.view_count, reply_count: legacyPost.reply_count,
                        comment_count: legacyPost.reply_count, last_reply_at: legacyPost.last_reply_at || legacyPost.created_at,
                        last_reply_user_id: legacyPost.user_id, participant_count: 1,
                        created_at: legacyPost.created_at, updated_at: legacyPost.updated_at
                    }
                });
                const legacyReplies = await StudioForumReply.findAll({ where: { post_id: legacyPost.id, status: 'active' }, order: [['id', 'ASC']] });
                for (const legacyReply of legacyReplies) {
                    await Comment.findOrCreate({
                        where: { legacy_studio_forum_reply_id: legacyReply.id },
                        defaults: { content: legacyReply.content, user_id: legacyReply.user_id, post_id: nativePost.id, status: 'active', created_at: legacyReply.created_at, updated_at: legacyReply.updated_at }
                    });
                }
            }
            for (const board of defaultBoards) {
                await sequelize.query('UPDATE posts SET board_id = (SELECT id FROM forum_boards WHERE slug = :slug), post_type = CASE WHEN category = :slug THEN :postType ELSE post_type END WHERE board_id IS NULL AND category = :slug', {
                    replacements: { slug: board.slug, postType: board.slug === 'question' ? 'question' : board.slug === 'tutorial' ? 'tutorial' : 'discussion' }
                });
            }
            await sequelize.query('UPDATE posts SET last_reply_at = created_at WHERE last_reply_at IS NULL');
            await sequelize.query("UPDATE posts SET reply_count = (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND comments.status = 'active') WHERE reply_count = 0");
            await sequelize.query("UPDATE posts SET participant_count = 1 + (SELECT COUNT(DISTINCT user_id) FROM comments WHERE comments.post_id = posts.id AND comments.status = 'active' AND comments.user_id != posts.user_id) WHERE participant_count <= 1");
            await sequelize.query(`INSERT INTO post_revisions
                (post_id, revision_number, editor_id, source, change_reason, title, content, board_id, post_type, cover, tags, created_at, updated_at)
                SELECT posts.id, 1, posts.user_id, 'system', 'legacy_initial', posts.title, posts.content, posts.board_id,
                       COALESCE(posts.post_type, posts.category, 'discussion'), COALESCE(posts.cover, ''), COALESCE(posts.tags, '[]'),
                       posts.created_at, posts.updated_at
                FROM posts
                WHERE NOT EXISTS (SELECT 1 FROM post_revisions WHERE post_revisions.post_id = posts.id)`);
            console.log('[迁移] 论坛默认版块和旧帖子归属已校准');
        } catch (forumSeedError) {
            console.warn('[迁移] 论坛版块种子或旧数据回填跳过:', forumSeedError.message);
        }
        require('./services/imStatusPush').startImStatusPush();
        if (sessionStore) await sessionStore.sync();
        console.log('Database models synchronized.');

        try {
            const proxyService = require('./services/proxyService');
            await proxyService.loadConfig();
            console.log(`[代理] 配置已加载, 启用=${proxyService.enabled}, 池=${proxyService.poolUrl || '无'}`);
        } catch (e) {
            console.warn('[代理] 配置加载失败:', e.message);
        }

        try {
            const { Post } = require('./models');
            const [updated] = await Post.update({ status: 'published' }, { where: { status: 'active' } });
            if (updated > 0) console.log(`迁移完成：${updated} 条帖子状态从 active 更新为 published`);
        } catch (e) {
            console.warn('帖子状态迁移跳过:', e.message);
        }

        // 修复: 清理数据库中图片URL的反引号污染
        // 背景: 宝塔终端执行 curl/命令时,会自动给 https:// 开头的URL加反引号,
        // 导致存入数据库的 avatar/preview/cover 等字段值形如 `https://...`,
        // 前端渲染时 src 属性值带反引号,图片无法加载
        try {
            const { User, Work, Studio, Post, Banner } = require('./models');
            const cleanFields = [
                { model: User, field: 'avatar', label: 'users.avatar' },
                { model: Work, field: 'preview', label: 'works.preview' },
                { model: Work, field: 'work_url', label: 'works.work_url' },
                { model: Studio, field: 'cover', label: 'studios.cover' },
                { model: Studio, field: 'cover_url', label: 'studios.cover_url' },
                { model: Post, field: 'cover', label: 'posts.cover' },
                { model: Banner, field: 'image_url', label: 'banners.image_url' }
            ];
            for (const { model, field, label } of cleanFields) {
                const queryGenerator = sequelize.getQueryInterface().queryGenerator;
                const tableName = queryGenerator.quoteTable(model.getTableName());
                const fieldName = queryGenerator.quoteIdentifier(field);
                // SQL REPLACE 清理反引号,只更新含反引号的行
                const result = await sequelize.query(
                    `UPDATE ${tableName} SET ${fieldName} = REPLACE(${fieldName}, '\`', '') WHERE ${fieldName} LIKE '%\`%'`,
                    { type: sequelize.QueryTypes.UPDATE }
                );
                // SQLite 返回 [undefined, affectedCount], MySQL 返回 [affectedCount]
                const affected = Array.isArray(result) ? (result[1] || result[0] || 0) : 0;
                if (affected > 0) {
                    console.log(`[清理] ${label} 去除反引号: ${affected} 行`);
                }
            }
            console.log('[清理] 图片URL反引号清理完成');
        } catch (cleanErr) {
            console.warn('[清理] 图片URL反引号清理跳过:', cleanErr.message);
        }

        try {
            const { refreshRoleCache } = require('./config/permissions');
            const { RolePermission } = require('./models');
            await refreshRoleCache(RolePermission);
            console.log('Role permission cache refreshed.');
        } catch (e) {
            console.warn('Refresh role permission cache failed:', e.message);
        }

        await ensureInitialSuperadmin();

        // 修复: 保存 server 实例用于优雅停机和错误处理
        const server = app.listen(PORT, () => {
            console.log(`Server started on port ${PORT}`);
            console.log(`API: http://localhost:${PORT}/api`);
            if (isProduction) {
                console.warn('[WARNING] 生产环境：限流、hCaptcha缓存、角色权限缓存均为进程内状态。多实例部署时请使用Redis等共享存储，否则限流可被绕过、权限不同步。');
            }
        });

        // 修复: 处理端口占用等启动错误
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`端口 ${PORT} 已被占用,请检查是否有其他进程正在运行`);
            } else {
                console.error('服务器启动失败:', err.message);
            }
            process.exit(1);
        });

        // 修复: 添加优雅停机处理,确保 PM2 reload/stop 时正在处理的请求完成
        function gracefulShutdown(signal) {
            console.log(`收到 ${signal},开始优雅停机...`);
            server.close(async () => {
                try {
                    await sequelize.close();
                } catch (e) { /* 忽略关闭错误 */ }
                process.exit(0);
            });
            // 5秒后强制退出
            setTimeout(() => process.exit(1), 5000).unref();
        }
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;
