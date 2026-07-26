const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function check(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

const response = read('server/middleware/response.js');
check(response.includes('total: normalizedTotal'), 'paginateResponse should expose data.total for existing clients.');
check(response.includes('pagination: {'), 'paginateResponse should keep data.pagination for newer clients.');

const app = read('server/app.js');
check(app.includes('Math.min(normalizedPageSize, 100)'), 'app should clamp pageSize to prevent oversized list queries.');
check(app.includes("Object.defineProperty(req, 'query'"), 'app should replace req.query with normalized query values.');
check(app.includes('app.use(hcaptchaGuard)'), 'app should mount hcaptchaGuard.');
check(app.includes("res.setHeader('X-Content-Type-Options', 'nosniff')"), 'app should send nosniff for API/static responses.');
check(app.includes("app.disable('x-powered-by')"), 'app should hide Express fingerprinting.');
check(app.includes('Content-Security-Policy'), 'app should set a Content-Security-Policy header.');
check(app.includes('X-Frame-Options'), 'app should set clickjacking protection.');
check(app.includes("express.json({ limit: '256kb' })"), 'app should limit JSON request bodies.');
check(app.includes('allowedOrigins'), 'app should maintain a CORS origin allow-list from CORS_ORIGIN.');
check(app.includes('SESSION_SECRET is missing or too short'), 'production should require a strong SESSION_SECRET.');
check(app.includes('createSequelizeSessionStore') && app.includes('sessionOptions.store = sessionStore'), 'production should use a persistent session store.');
check(app.includes('isProduction'), 'CORS policy should distinguish production from development environments.');
check(app.includes('createRateLimiter') && app.includes('writeRateLimiter') && app.includes('codemaoImportRateLimiter'), 'app should rate-limit write APIs and codemao imports.');
check(app.includes('req.body === undefined') && app.includes('req.body = {}'), 'app should provide an empty body object for unsupported content-types.');
check(app.includes('Invalid request body'), 'body parser 4xx errors should not fall through to generic 500s.');
check(app.includes("ensureColumn('posts', 'merged_into_post_id'"), 'startup migration should add the forum topic merge column for existing databases.');

const authConfig = read('server/config/auth.js');
check(authConfig.includes('crypto.randomBytes'), 'auth config should generate an unpredictable development JWT secret.');
check(authConfig.includes("process.env.NODE_ENV === 'production'") && authConfig.includes('process.exit(1)'), 'production should not start without a strong JWT_SECRET.');
check(!authConfig.includes("JWT_SECRET || 'development-secret-key-do-not-use-in-production'"), 'auth config must not fall back to the old default JWT secret.');

const hcaptchaMiddleware = read('server/middleware/hcaptcha.js');
check(hcaptchaMiddleware.includes("req.path.startsWith('/api/')"), 'hcaptchaGuard should only guard API requests.');
check(hcaptchaMiddleware.includes("'/api/health'"), 'hcaptchaGuard should not block health checks.');

const authMiddleware = read('server/middleware/auth.js');
check(authMiddleware.includes('async function resolveUserFromToken'), 'auth middleware should resolve users from the database.');
check(authMiddleware.includes("user.status !== 'active'"), 'auth middleware should reject disabled users.');
check(authMiddleware.includes('role: user.role'), 'auth middleware should use the current database role.');

const requestApi = read('client/src/api/request.js');
check(requestApi.includes('error.response.data?.errorCode'), 'client request interceptor should read response.errorCode.');

const commentSubscriptionController = read('server/controllers/commentController.js');
check(!commentSubscriptionController.includes('PostSubscription.findOrCreate'), 'posting a comment must not silently subscribe the user to all topic replies.');

const router = read('client/src/router/index.js');
check(router.includes("path: '/register'") && router.includes("redirect: '/login'"), 'register route should redirect to login.');

const appVue = read('client/src/App.vue');
check(appVue.includes('result?.verified'), 'app should only accept successful hCaptcha verification results.');

const homeVue = read('client/src/views/Home.vue');
check(homeVue.includes('safeBanners') && homeVue.includes('rel="noopener noreferrer"'), 'home banners should sanitize URLs and use noopener.');

const maintenanceMiddleware = read('server/middleware/maintenance.js');
check(maintenanceMiddleware.includes('escapeHtml(customMsg') && !maintenanceMiddleware.includes('href="javascript:'), 'maintenance HTML should escape custom messages and avoid javascript URLs.');
check(app.indexOf('setSecurityHeaders(res);') < app.indexOf('app.use(maintenanceMiddleware);'), 'maintenance responses should receive the standard security headers.');

const developerController = read('server/controllers/developerController.js');
check(developerController.includes("validateDeveloperUrl(homepage_url") && developerController.includes("validateDeveloperUrl(logo_url"), 'developer homepage and logo URLs should be validated before storage.');

const imSso = read('server/services/imSso.js');
check(imSso.includes('normalizePublicHttpUrl(process.env.IM_PUBLIC_URL'), 'IM navigation should only use a validated public HTTP(S) URL.');

const workDetailVue = read('client/src/views/WorkDetail.vue');
check(workDetailVue.includes('sandbox="allow-scripts allow-same-origin allow-forms allow-popups"'), 'work preview iframe should be sandboxed.');
check(workDetailVue.includes('allowedPlayerHosts') && workDetailVue.includes("url.protocol !== 'https:'"), 'work preview URLs should be allow-listed HTTPS player URLs.');
check(workDetailVue.includes("ALLOWED_TAGS: ['p', 'br', 'strong'") && workDetailVue.includes("FORBID_TAGS: ['img']"), 'work descriptions should use a strict HTML allow-list and forbid images.');
check(workDetailVue.includes('WORK_DESCRIPTION_MAX_LENGTH = 10000'), 'work descriptions should be capped before Markdown rendering.');
check(workDetailVue.includes('r-work--description_toggle') && workDetailVue.includes('shouldCollapseDescription'), 'long work descriptions should be collapsible.');

const modelsSource = read('server/models/index.js');
const workModelStart = modelsSource.indexOf("const Work = sequelize.define('Work'");
const workModelEnd = modelsSource.indexOf("const Comment = sequelize.define('Comment'", workModelStart);
const workModelSection = modelsSource.slice(workModelStart, workModelEnd);
check(workModelSection.includes('args: [0, 10000]'), 'the Work model should reject descriptions longer than 10000 characters.');
check(workDetailVue.includes('isValidCodemaoWorkId') && workDetailVue.includes('作品ID格式不正确'), 'work detail should reject invalid Codemao IDs before API calls.');

const hcaptchaDialog = read('client/src/components/HCaptchaDialog.vue');
check(hcaptchaDialog.includes('const settle =') && hcaptchaDialog.includes('handleClosed'), 'hCaptcha dialog should always resolve pending prompts.');

const profile = read('client/src/views/Profile.vue');
check(profile.includes('当前仅支持编程猫账号登录'), 'profile password action should not call a missing local password API.');

const userRoutes = read('server/routes/userRoutes.js');
check(userRoutes.includes('allowedAvatarTypes') && userRoutes.includes('hasAllowedImageSignature'), 'avatar uploads should verify type and file signature.');
check(userRoutes.includes('createRateLimiter') && userRoutes.includes('loginRateLimit'), 'login route should be rate-limited.');
check(userRoutes.includes("keyPrefix: 'login-user'") && userRoutes.includes('keyGenerator'), 'login route should use a dedicated per-user rate-limit bucket.');
check(userRoutes.includes('avatarUpload') && userRoutes.includes('multer.MulterError'), 'avatar upload errors should return 400 instead of generic 500s.');

const rateLimit = read('server/middleware/rateLimit.js');
check(rateLimit.includes('keyGenerator') && rateLimit.includes('keySuffix'), 'rate limiter should honor custom key generators.');

const sessionStore = read('server/services/sessionStore.js');
check(sessionStore.includes('class SequelizeSessionStore extends session.Store'), 'Sequelize session store should extend express-session Store.');
check(sessionStore.includes("tableName: 'sessions'") && sessionStore.includes('clearExpired'), 'Sequelize session store should persist sessions and prune expired rows.');

const userController = read('server/controllers/userController.js');
check(userController.includes("exclude: ['password', 'codemao_token']"), 'current user endpoint should not expose codemao_token.');
check(userController.includes('INITIAL_ADMIN_CODEMAO_ID') && userController.includes('INITIAL_ADMIN_BOOTSTRAP_TOKEN'), 'initial admin promotion should support explicit bootstrap controls.');
check(userController.includes("ALLOW_FIRST_USER_SUPERADMIN === 'true'"), 'development first-user superadmin should require an explicit opt-in.');

const workRoutes = read('server/routes/workRoutes.js');
check(workRoutes.includes("router.get('/codemao/:codemaoId', optionalAuth"), 'codemao work detail route should use optionalAuth.');
check(workRoutes.includes("router.get('/:codemaoId', optionalAuth"), 'work detail route should use optionalAuth.');

const workController = read('server/controllers/workController.js');
check(workController.includes('async function withLikeStatus'), 'work details should share liked-state serialization.');
check(!workController.includes('workUrl: workDetail.player_url'), 'work sync should use playerUrl, not workUrl.');
check(workController.includes('playerUrl: workDetail.player_url'), 'work sync should preserve playerUrl.');
check(!workController.includes('work.user_id.toString()'), 'work ownership checks should handle null user_id.');
check(workController.includes('function canViewWork'), 'work details should hide non-published works from unauthorized users.');
check(workController.includes('function isValidCodemaoWorkId'), 'codemao work import should validate IDs before external fetch.');
check(workController.includes('!req.user') && workController.includes('getWorkByCodemaoId'), 'anonymous codemao imports should be blocked.');

const postController = read('server/controllers/postController.js');
check(postController.includes("post.status !== 'published'"), 'post detail should hide non-published posts.');
check(postController.includes('function canInteractWithPost'), 'post interactions should require published posts.');

const commentController = read('server/controllers/commentController.js');
check(commentController.includes('Comment target not found') && commentController.includes('Parent comment not found'), 'comments should validate published targets and matching parent comments.');

const favoriteController = read('server/controllers/favoriteController.js');
check(favoriteController.includes('function canInteractWithWork') && favoriteController.includes("status: 'published'"), 'work favorites should require published works and hide unpublished favorites.');

const studioController = read('server/controllers/studioController.js');
const studioRoutes = read('server/routes/studioRoutes.js');
check(studioRoutes.includes("router.get('/:id/works', optionalAuth"), 'studio works route should resolve optional auth for private studio visibility.');
check(studioController.includes("is_public: true") && studioController.includes('async function canViewStudio'), 'public studio APIs should hide private studios unless the viewer is allowed.');
check(studioController.includes("work.status !== 'published'"), 'studio submissions should reject unpublished works.');
check(studioController.includes("where: { status: 'published' }") && studioController.includes('required: true'), 'studio public work responses should only include published works.');
check(studioController.includes('VALID_JOIN_TYPES'), 'studio join_type inputs should be allow-listed.');
check(!studioController.includes("order: [['created_at', 'DESC']],"), 'StudioWork queries should not order by missing created_at.');
check(!studioController.includes("order: [['created_at', 'ASC']]"), 'Pending StudioWork queries should not order by missing created_at.');
check(!studioController.includes('submittedAt: w.created_at'), 'StudioWork responses should use added_at for submittedAt.');
check(studioController.includes("['added_at', 'DESC']"), 'StudioWork list should order by added_at.');
check(!studioController.includes('if (status) where.status = status'), 'public studio work lists should not allow status override.');
const studioManagementController = read('server/controllers/studioManagementController.js');
check(studioManagementController.includes('ownership_transferred') && studioManagementController.includes('sequelize.transaction'), 'studio ownership transfer must be atomic and audited.');
check(studioManagementController.includes('effectivePermissions') && studioManagementController.includes('member_permissions_updated'), 'studio management must enforce fine-grained permissions.');
check(studioRoutes.includes("geetestVerify('studio_management')"), 'studio sensitive mutations should be protected by Geetest.');
const communityView = read('client/src/views/Community.vue');
const appSource = read('server/app.js');
check(appSource.includes("slug: 'studios'") && communityView.includes("slug === 'studios'"), 'studio forum must be exposed as a native main-forum board.');
check(postController.includes('resolveStudioForumTarget') && postController.includes('StudioMember.findOne'), 'studio forum posting must require an active studio member.');
check(commentController.includes("post.category === 'studios'") && commentController.includes('StudioMember.findOne'), 'studio forum replies must require an active studio member.');
check(communityView.includes('WysiwygEditor') && communityView.includes('postForm.studio_id'), 'studio forum must reuse the native main-forum composer.');
check(postController.includes('studio_recruitment_only') && postController.includes('resolveRecruitmentStudio'), 'studio recruitment boards should only accept studio-owner posts.');
check(appSource.includes("ensureColumn('studios', 'member_limit'") && appSource.includes("ensureColumn('posts', 'studio_id'"), 'studio upgrade columns must be covered by startup migration.');

const dbMigrationRoutes = read('server/routes/dbMigration.js');
check(dbMigrationRoutes.includes("router.use(authMiddleware, requireRole('superadmin'))"), 'database migration routes should require superadmin auth.');
check(dbMigrationRoutes.includes('assertAllowedMysqlHost') && dbMigrationRoutes.includes('resolveSqlitePath'), 'database migration routes should restrict host and sqlite path inputs.');
check(!dbMigrationRoutes.includes('${error.message}'), 'database migration routes should not echo raw internal errors to clients.');

const adminController = read('server/controllers/adminController.js');
check(adminController.includes('canManageUser(operatorRole, user.role)'), 'impersonation should forbid same-or-higher role targets.');
check(adminController.includes('function canManageExistingUser') && adminController.includes('VALID_USER_STATUSES'), 'admin user management should reject same-or-higher targets and invalid statuses.');
check(adminController.includes('redactConfigDetails'), 'system config logging should redact secrets.');
check(adminController.includes('targetCount = Math.min') && adminController.includes('targetLimit = Math.min'), 'crawler admin endpoints should clamp requested limits.');
const adminWorksStart = adminController.indexOf('async function getWorks(req, res)');
const adminWorksEnd = adminController.indexOf('async function updateWork(req, res)', adminWorksStart);
const adminWorksSection = adminController.slice(adminWorksStart, adminWorksEnd);
check(adminWorksStart >= 0 && adminWorksEnd > adminWorksStart, 'admin work list controller section should be discoverable.');
check(!adminWorksSection.includes('ForumBoard'), 'admin Work queries must not include ForumBoard, which is only associated with Post.');

const geetestService = read('server/services/geetestService.js');
check(geetestService.includes('misconfigured') && geetestService.includes('success: false'), 'enabled Geetest with incomplete config should fail closed.');

const aiReview = read('server/services/aiReview.js');
check(aiReview.includes('validateAIEndpoint') && aiReview.includes("parsed.protocol !== 'https:'"), 'AI review endpoint should reject unsafe API URLs.');

const packageJson = read('server/package.json');
check(packageJson.includes('"security:attack"'), 'server package should expose the local security attack test.');
check(packageJson.includes('"security:targeted"'), 'server package should expose targeted production-boundary security tests.');

const attackTest = read('scripts/security-attack-test.js');
check(attackTest.includes('lookalike localhost Origin is blocked'), 'attack test should probe lookalike localhost origins.');
check(attackTest.includes('unsupported JSON charset does not return 5xx'), 'attack test should probe body parser 4xx handling.');
check(attackTest.includes('protected route requires auth'), 'attack test should probe protected route auth matrix.');
check(attackTest.includes('login brute force') && attackTest.includes("'Content-Type': 'text/plain'"), 'login brute-force test should exercise local rate limiting without hitting Codemao.');

const dbMigration = read('server/services/dbMigration.js');
check(!dbMigration.includes("status: 'active'"), 'dbMigration should not define Post.status with active (migrated to published).');

if (failures.length > 0) {
    console.error('Consistency checks failed:');
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log('Consistency checks passed.');
