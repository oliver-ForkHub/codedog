/**
 * 后台管理控制器
 */

const { User, UserWarning, Work, Comment, Post, ForumBoard, ForumBoardModerator, PostSubscription, PostDraft, PostRevision, ForumModerationLog, Favorite, Follow, Banner, Report, ReportAuditLog, IpBan, Notification, Announcement, SystemConfig, OperationLog, SensitiveWord, RolePermission, CaptchaStats, Statistics, Studio, StudioMember, StudioWork, StudioPointLog, StudioTask, Like, sequelize } = require('../models');
const { successResponse, errorResponse, paginateResponse } = require('../middleware/response');
const { getAllRoles, canManageUser, getRole, hasPermission, getAllPermissions, refreshRoleCache, DEFAULT_ROLES } = require('../config/permissions');
const { logOperation } = require('../middleware/operationLog');
const { Op } = require('sequelize');
const codemaoApi = require('../services/codemaoApi');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/auth');
const DbAdapter = require('../utils/dbAdapter');
const { likeContains } = require('../utils/security');
const { snapshotPost, recordPostRevision, recordModerationLog, softDeletePost } = require('../services/forumHistory');
const { getModeratedBoardIds, canModerateBoard } = require('../services/forumModeration');
const { invalidateForumReputation } = require('../services/forumReputation');
// H12: 引入内容审核服务，爬虫/管理员落库前对 nickname/bio/作品名+描述 做敏感词检查
const aiReview = require('../services/aiReview');
const proxyService = require('../services/proxyService');
const { safeLog } = require('../utils/safeLog');
const { buildCodemaoPlayerUrl } = require('../utils/codemaoPlayer');
// 修复: token 写 httpOnly cookie 防止 XSS 偷
const { setTokenCookie } = require('../middleware/auth');
const { normalizeHttpUrl } = require('../utils/urlSafety');

// 爬取日志存储
const crawlLogs = new Map();
const MAX_LOG_ENTRIES = 500;
const MAX_CRAWL_TASK_AGE = 60 * 60 * 1000;

// 实时日志存储（不再劫持全局 console，避免污染所有模块的日志缓存
const realtimeLogs = [];
const MAX_REALTIME_LOGS = 1000;
const MAX_REALTIME_LOG_STRING_LENGTH = 2000;

const VALID_USER_ROLES = ['user', 'reviewer', 'moderator', 'admin', 'superadmin'];
const VALID_USER_STATUSES = ['active', 'disabled'];
const FORUM_ATTENTION_DEFAULTS = Object.freeze({ view_threshold: 20, like_threshold: 8, report_threshold: 3 });
const FORUM_ATTENTION_CONFIG_KEYS = Object.freeze({
    view_threshold: 'forum_attention_view_threshold',
    like_threshold: 'forum_attention_like_threshold',
    report_threshold: 'forum_attention_report_threshold'
});

async function readForumAttentionSettings() {
    const rows = await SystemConfig.findAll({ where: { config_key: { [Op.in]: Object.values(FORUM_ATTENTION_CONFIG_KEYS) } }, raw: true });
    const stored = new Map(rows.map(row => [row.config_key, row.config_value]));
    const settings = {};
    for (const [name, key] of Object.entries(FORUM_ATTENTION_CONFIG_KEYS)) {
        const value = Number(stored.get(key));
        settings[name] = Number.isSafeInteger(value) && value >= 1 && value <= 100000 ? value : FORUM_ATTENTION_DEFAULTS[name];
    }
    return settings;
}

// 爬虫创建虚拟用户时使用的占位密码哈希
// 在模块加载时用强随机数生成一次合法 bcrypt 哈希并缓存，避免每个爬取请求都重复计算影响性能
// （此前基于 Date.now() 的盐可预测，已改为 crypto.randomBytes 强随机源）
const PLACEHOLDER_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

function isSelf(req, user) {
    return String(DbAdapter.getId(req.user)) === String(DbAdapter.getId(user));
}

function canManageExistingUser(req, user) {
    return !isSelf(req, user) && canManageUser(req.user.role, user.role);
}

/**
 * (报告1 #3 / Report4 #3) 爬虫创建占位用户时对编程猫返回的 nickname/bio 做内容审核 + HTML 转义，
 * 与 userController.codemaoLogin 新用户路径保持一致，避免绕过本地内容审核与 XSS。
 * 审核未通过或异常时返回 { nickname: null, bio: null }，由调用方决定是否使用占位昵称兜底。
 * @param {string} rawNickname 编程猫返回的原始 nickname
 * @param {string} rawBio 编程猫返回的原始 bio/description
 * @returns {Promise<{nickname: string|null, bio: string|null}>}
 */
async function sanitizeCodemaoProfile(rawNickname, rawBio) {
    const nickname = rawNickname != null ? String(rawNickname).trim() : '';
    const bio = rawBio != null ? String(rawBio).trim() : '';
    const reviewText = [nickname, bio].filter(v => v).join('\n');
    let blocked = false;
    if (reviewText.trim()) {
        try {
            const reviewResult = await aiReview.fallbackReview(reviewText);
            if (reviewResult.recommendation === 'delete' || reviewResult.recommendation === 'review') {
                blocked = true;
                console.warn(`[crawl] 占位用户资料未通过审核(${reviewResult.recommendation})，跳过 nickname/bio 存储: ${reviewResult.reason}`);
            }
        } catch (e) {
            console.error('[crawl] 占位用户资料审核失败:', e.message);
            blocked = true;
        }
    }
    return {
        // 存原始,渲染转义,全站统一
        nickname: (!blocked && nickname) ? nickname : null,
        bio: (!blocked && bio) ? bio : null
    };
}

/**
 * 将日志条目追加到内存环形缓冲；通过专用 API 端点暴露给前端
 * 不再覆盖全局 console.* 以避免污染其他模块
 */
function addRealtimeLog(level, ...args) {
    const rawMessage = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try {
            return JSON.stringify(arg);
        } catch (e) {
            return String(arg);
        }
    }).join(' ');
    const { sanitizeSecrets } = require('../utils/logger');
    const message = sanitizeSecrets(rawMessage);

    realtimeLogs.push({
        time: new Date().toISOString(),
        level,
        message: message.substring(0, MAX_REALTIME_LOG_STRING_LENGTH)
    });

    // 修复: 同步写入文件日志,保证重启/Docker环境仍可查历史
    try {
        const { writeLog } = require('../utils/logger');
        writeLog(level, 'admin', message.substring(0, MAX_REALTIME_LOG_STRING_LENGTH));
    } catch (e) {
        // 日志写入失败不影响业务
    }

    if (realtimeLogs.length > MAX_REALTIME_LOGS) {
        realtimeLogs.shift();
    }
}

/**
 * 统一的管理员操作日志入口：输出到 stdout 并写入实时日志缓存
 * 用于替代此前对全局 console.* 的劫持
 */
function adminLog(level, ...args) {
    const fn = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);
    fn.apply(console, args);
    addRealtimeLog(level, ...args);
}

function addCrawlLog(taskId, message, type = 'info') {
    if (!crawlLogs.has(taskId)) {
        crawlLogs.set(taskId, []);
    }
    const logs = crawlLogs.get(taskId);
    logs.push({
        time: new Date().toISOString(),
        message,
        type
    });
    if (logs.length > MAX_LOG_ENTRIES) {
        logs.shift();
    }
}

function cleanupCrawlLogs() {
    const now = Date.now();
    for (const [taskId, logs] of crawlLogs.entries()) {
        const lastEntry = logs[logs.length - 1];
        if (lastEntry && (now - new Date(lastEntry.time).getTime()) > MAX_CRAWL_TASK_AGE) {
            crawlLogs.delete(taskId);
        }
    }
}

setInterval(cleanupCrawlLogs, 10 * 60 * 1000).unref();

function getCrawlLogs(taskId) {
    return crawlLogs.get(taskId) || [];
}

function clearCrawlLogs(taskId) {
    crawlLogs.delete(taskId);
}

// ==================== 辅助函数 ====================

/**
 * 获取统计数据
 */
async function getStats(req, res) {
    try {
        const dateParts = new Intl.DateTimeFormat('en-US', {
            timeZone: process.env.STAT_TIMEZONE || 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const dateValues = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
        const todayKey = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
        // 修复: 统计数据排除 deleted/hidden/pending 等非活跃内容,避免后台统计虚高
        const userCount = await DbAdapter.count(User, { where: { status: 'active' } });
        const workCount = await DbAdapter.count(Work, { where: { status: 'published' } });
        const commentCount = await DbAdapter.count(Comment, { where: { status: 'active' } });
        const todayUsers = await DbAdapter.count(User, {
            where: {
                status: 'active',
                created_at: {
                    [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });
        const todayWorks = await DbAdapter.count(Work, {
            where: {
                status: 'published',
                created_at: {
                    [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });
        const todayComments = await DbAdapter.count(Comment, {
            where: {
                status: 'active',
                created_at: {
                    [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });
        const pendingReports = await DbAdapter.count(Report, { where: { status: 'pending' } });
        const activeIpBans = await DbAdapter.count(IpBan, { where: { [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }] } });
        const featuredWorks = await DbAdapter.count(Work, { where: { is_featured: true, status: 'published' } });
        const disabledUsers = await DbAdapter.count(User, { where: { status: 'disabled' } });
        const todayPvRow = await DbAdapter.findOne(Statistics, {
            where: { stat_key: `site_pv:${todayKey}` },
            attributes: ['stat_value']
        });
        const todayVisits = Number(todayPvRow?.stat_value || 0);
        const todayUniqueIps = await DbAdapter.count(Statistics, {
            where: { stat_key: { [Op.like]: `site_uv:${todayKey}:%` } }
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const newUsersWeek = await DbAdapter.count(User, {
            where: { status: 'active', created_at: { [Op.gte]: sevenDaysAgo } }
        });
        const newWorksWeek = await DbAdapter.count(Work, {
            where: { status: 'published', created_at: { [Op.gte]: sevenDaysAgo } }
        });

        return successResponse(res, {
            userCount,
            workCount,
            commentCount,
            todayUsers,
            todayWorks,
            todayComments,
            pendingReports,
            activeIpBans,
            featuredWorks,
            disabledUsers,
            todayVisits,
            todayUniqueIps,
            newUsersWeek,
            newWorksWeek
        });
    } catch (error) {
        console.error('获取统计错误:', error);
        return errorResponse(res, '获取统计数据失败', 500);
    }
}

/**
 * 获取用户列表
 */
async function getUsers(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const keyword = req.query.keyword || '';
        const role = req.query.role || '';
        const status = req.query.status || '';

        const where = {};
        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['username', 'nickname', 'email', 'codemao_user_id'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        
        if (role) where.role = role;
        if (status) where.status = status;

        const { count, rows } = await DbAdapter.findAndCountAll(User, {
            where,
            attributes: { exclude: ['password', 'codemao_token'] },
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取用户列表错误:', error);
        return errorResponse(res, '获取用户列表失败', 500);
    }
}

/**
 * 获取用户详情
 */
async function getUserDetail(req, res) {
    try {
        const { userId } = req.params;
        
        const user = await DbAdapter.findByPk(User, userId, {
            attributes: { exclude: ['password'] }
        });
        
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        // 修复: 标记是否有 token,非 superadmin 不返回 token 字段
        const hasCodemaoToken = !!user.codemao_token;
        if (req.user.role !== 'superadmin') {
            user.codemao_token = undefined;
        }
        
        // 修复: 统计排除 deleted/hidden/pending 等非活跃内容
        const [works, comments, favorites, following, followers, warnings] = await Promise.all([
            DbAdapter.findAndCountAll(Work, {
                where: { user_id: userId, status: 'published' },
                order: [['created_at', 'DESC']],
                limit: 10
            }),
            DbAdapter.findAndCountAll(Comment, {
                where: { user_id: userId, status: 'active' },
                include: [{
                    model: Work,
                    as: 'work',
                    attributes: ['id', 'name', 'codemao_work_id']
                }],
                order: [['created_at', 'DESC']],
                limit: 10
            }),
            DbAdapter.count(Favorite, { where: { user_id: userId } }),
            DbAdapter.count(Follow, { where: { follower_id: userId } }),
            DbAdapter.count(Follow, { where: { following_id: userId } }),
            UserWarning.findAll({
                where: { user_id: userId },
                include: [{ model: User, as: 'issuer', attributes: ['id', 'username', 'nickname'] }],
                order: [['created_at', 'DESC']]
            })
        ]);

        const likesReceived = await DbAdapter.count(Like, {
            include: [{
                model: Work,
                as: 'work',
                where: { user_id: userId, status: 'published' },
                attributes: []
            }]
        });
        
        const stats = {
            worksCount: works.count,
            commentsCount: comments.count,
            favoritesCount: favorites,
            followingCount: following,
            followersCount: followers,
            likesReceived: likesReceived
        };
        
        logOperation(req, 'view_user_detail', 'user', userId, { username: user.username });
        
        return successResponse(res, {
            user: {
                ...user.toJSON(),
                codemao_token: undefined,  // 修复: 详情接口永不返回完整 token,仅 superadmin 通过专用接口获取
                has_codemao_token: hasCodemaoToken,
                // 修复: superadmin 返回脱敏预览
                ...(req.user.role === 'superadmin' && hasCodemaoToken
                    ? { codemao_token_mask: maskToken(user.codemao_token) }
                    : {})
            },
            stats,
            recentWorks: works.rows,
            recentComments: comments.rows,
            warnings
        });
    } catch (error) {
        console.error('获取用户详情错误:', error);
        return errorResponse(res, '获取用户详情失败', 500);
    }
}

/**
 * 脱敏 token:保留前 4 位 + ... + 后 4 位
 */
function maskToken(token) {
    if (!token || token.length <= 12) return '****';
    return token.slice(0, 4) + '…' + token.slice(-4);
}

/**
 * 查看完整编程猫 Token
 * 仅 superadmin 可调用,每次调用记录操作日志
 */
async function getUserCodemaoToken(req, res) {
    try {
        const { userId } = req.params;

        const user = await DbAdapter.findByPk(User, userId, {
            attributes: ['id', 'username', 'codemao_token']
        });

        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        // 修复: 查看完整 token 记操作日志,做到可审计
        logOperation(req, 'view_codemao_token', 'user', userId, {
            username: user.username,
            action: '查看编程猫 Token'
        });

        return successResponse(res, {
            codemao_token: user.codemao_token,
            has_token: !!user.codemao_token,
            masked_preview: user.codemao_token ? maskToken(user.codemao_token) : null
        });
    } catch (error) {
        console.error('获取编程猫 Token 错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

/**
 * 修改用户密码
 */
async function updateUserPassword(req, res) {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return errorResponse(res, '密码长度至少6位', 400);
        }

        if (newPassword.length > 128) {
            return errorResponse(res, '密码长度不能超过128位', 400);
        }
        
        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }
        
        // (Report4 #20) BOLA 防护：修改他人密码要求操作者角色严格高于目标用户。
        // canManageExistingUser 已阻断 self + 非严格更高（managerLevel > targetLevel）；
        // 同级用户（如 moderator↔moderator）一律拒绝，返回明确的 403，禁止同级改密。
        if (isSelf(req, user)) {
            return errorResponse(res, 'Cannot manage this user', 403);
        }
        if (!canManageUser(req.user.role, user.role)) {
            return errorResponse(res, '无权修改同级用户密码', 403);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        // 🟠8 修复: 密码重置时同步更新 password_changed_at,配合 JWT 验证中的 iat 比对
        // 使旧 Token(签发于密码修改之前)立即失效,防止黑客用已截获 Token 继续操作
        await DbAdapter.update(User, {
            password: hashedPassword,
            password_changed_at: new Date(),
            token_version: (user.token_version || 0) + 1
        }, { where: { id: userId } });
        
        logOperation(req, 'update_user_password', 'user', userId);
        return successResponse(res, null, '密码已更改,所有设备已强制退出');
    } catch (error) {
        console.error('修改用户密码错误:', error);
        return errorResponse(res, '修改密码失败', 500);
    }
}

/**
 * 更新用户信息
 */
async function updateUser(req, res) {
    try {
        const { userId } = req.params;
        const { nickname, email, role, status, is_active_dalao } = req.body;
        const operatorRole = req.user.role;

        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        // 角色层级检查(防止同级互改):即使目标是自己,只要改 role/status
        // 仍需通过 canManageUser(自己对自己永远是 true,但保留作为防御)
        if (!canManageUser(operatorRole, user.role)) {
            return errorResponse(res, 'Cannot manage this user', 403);
        }

        // 修复: 仅 role/status 变更时禁止操作自己(防止自我降权/自我禁用),
        // nickname/email/is_active_dalao 等无害字段允许超级管理员对自己操作
        const isSelfUpdate = isSelf(req, user);
        if (isSelfUpdate && (role !== undefined || status !== undefined)) {
            return errorResponse(res, '不能修改自己的角色或状态', 400);
        }

        if (role && role !== user.role) {
            if (!VALID_USER_ROLES.includes(role)) {
                return errorResponse(res, 'Invalid role', 400);
            }
            if (!canManageUser(operatorRole, user.role) || !canManageUser(operatorRole, role)) {
                return errorResponse(res, '权限不足', 403);
            }
        }

        if (status !== undefined && !VALID_USER_STATUSES.includes(status)) {
            return errorResponse(res, 'Invalid status', 400);
        }

        const updateData = {};
        if (nickname !== undefined) {
            const trimmedNickname = String(nickname).trim();
            const reviewResult = await aiReview.fallbackReview(String(trimmedNickname));
            if (reviewResult.recommendation === 'delete') {
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            // 🟠7 修复: 管理员在后台执行人工干预,AI review 结果仅告警不拦截
            // review 时可写入但标记审核结果,允许管理员覆盖 AI 误判
            if (reviewResult.recommendation === 'review') {
                console.warn(`[admin] 管理员 ${req.user.username} 修改用户 ${user.username} 昵称为疑似违规内容:${reviewResult.reason},已放行(管理特权)`);
            }
            const storedNickname = String(trimmedNickname).substring(0, 50); // 存原始,渲染转义
            updateData.nickname = storedNickname;
        }
        if (email !== undefined) {
            // 修复: 邮箱格式/长度/唯一性预检查
            const trimmedEmail = String(email).trim().toLowerCase();
            if (!trimmedEmail) {
                return errorResponse(res, '邮箱不能为空', 400);
            }
            if (trimmedEmail.length > 254) {
                return errorResponse(res, '邮箱长度不能超过 254 字符', 400);
            }
            // 简单邮箱格式校验
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                return errorResponse(res, '邮箱格式无效', 400);
            }
            // 唯一性检查(排除当前用户)
            const existingEmail = await DbAdapter.findOne(User, { where: { email: trimmedEmail, id: { [Op.ne]: userId } } });
            if (existingEmail) {
                return errorResponse(res, '该邮箱已被其他用户使用', 400);
            }
            updateData.email = trimmedEmail;
        }
        if (role !== undefined) updateData.role = role;
        if (status !== undefined) updateData.status = status;
        // 修复: is_active_dalao 强制布尔转换,避免字符串 "false"(Truthy)被当作真值存入
        if (is_active_dalao !== undefined) updateData.is_active_dalao = is_active_dalao === true || is_active_dalao === 'true';

        await DbAdapter.update(User, updateData, { where: { id: userId } });
        logOperation(req, 'update_user', 'user', userId, { 
            changes: updateData,
            old_values: {
                nickname: user.nickname,
                email: user.email,
                role: user.role,
                status: user.status,
                is_active_dalao: user.is_active_dalao
            }
        });

        return successResponse(res, null, '更新成功');
    } catch (error) {
        console.error('更新用户信息错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 一键登录用户
 */
async function impersonateUser(req, res) {
    try {
        const { userId } = req.params;
        const operatorRole = req.user.role;

        if (operatorRole !== 'admin' && operatorRole !== 'superadmin') {
            return errorResponse(res, '权限不足', 403);
        }

        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }
        if (!canManageUser(operatorRole, user.role)) {
            return errorResponse(res, '您没有权限以该用户身份登录', 403);
        }
        if (user.status !== 'active') {
            return errorResponse(res, '目标账号已被禁用', 403);
        }

        // 生成 Token
        // 修复: 加 impersonatedBy 字段, 恢复管理员身份时用此字段重新签 admin token
        const token = jwt.sign(
            {
                id: DbAdapter.getId(user),
                username: user.username,
                role: user.role,
                token_version: user.token_version || 0,
                impersonatedBy: DbAdapter.getId(req.user), // 记录是哪个管理员在操作
                impersonatorRole: req.user.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN, issuer: 'codedog-community', audience: 'codedog-frontend' }
        );

        // 修复: 写 httpOnly cookie
        setTokenCookie(res, token);

        logOperation(req, 'impersonate_user', 'user', userId, { target_username: user.username, target_nickname: user.nickname, target_role: user.role, operator_id: DbAdapter.getId(req.user) });

        // 修复: httpOnly cookie 模式下不再返回 token,前端通过 cookie 恢复身份
        return successResponse(res, {
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                avatar: user.avatar,
                role: user.role
            }
        }, '登录成功');
    } catch (error) {
        console.error('一键登录错误', error);
        return errorResponse(res, '操作失败', 500);
    }
}

/**
 * 从 impersonate 状态恢复为原管理员身份
 * 修复: cookie 模式下原 sessionStorage admin_token 已失效,改用 JWT 字段记录管理员 ID
 * 流程: 读当前 cookie → JWT 验证 → 取出 impersonatedBy → 用管理员 ID 重新签 token → 写 cookie
 */
async function restoreFromImpersonate(req, res) {
    try {
        // req.user 是当前被模拟用户, JWT payload 里有 impersonatedBy 字段
        // 修复: 该字段在 resolveUserFromToken 中会一并解码, 但当前实现没返回, 需要从原始 token 重新解析
        const tokenCookieName = require('../config/auth').JWT_COOKIE_NAME;
        const cookieHeader = req.headers.cookie || '';
        let rawToken = null;
        for (const part of cookieHeader.split(';')) {
            const eqIdx = part.indexOf('=');
            if (eqIdx < 0) continue;
            if (part.slice(0, eqIdx).trim() !== tokenCookieName) continue;
            try {
                rawToken = decodeURIComponent(part.slice(eqIdx + 1).trim());
            } catch (e) { /* ignore */ }
            break;
        }
        // 后备: 如果 cookie 路径拿不到, 尝试 Authorization 头
        if (!rawToken) {
            const authHeader = req.headers.authorization || '';
            const m = authHeader.match(/^bearer\s+([a-zA-Z0-9._-]+)$/i);
            if (m) rawToken = m[1];
        }
        if (!rawToken) {
            return errorResponse(res, '未找到 token', 401);
        }

        let decoded;
        try {
            decoded = require('jsonwebtoken').verify(rawToken, require('../config/auth').JWT_SECRET, {
                algorithms: ['HS256'],
                issuer: 'codedog-community',
                audience: 'codedog-frontend'
            });
        } catch (e) {
            return errorResponse(res, 'token 无效', 401);
        }

        if (!decoded.impersonatedBy) {
            return errorResponse(res, '当前未处于 impersonate 状态', 400);
        }

        // 取出原管理员, 重新签 token
        const adminUser = await DbAdapter.findByPk(User, decoded.impersonatedBy);
        if (!adminUser) {
            return errorResponse(res, '原管理员账户不存在', 404);
        }
        if (adminUser.status !== 'active') {
            return errorResponse(res, '原管理员账户已被禁用', 403);
        }

        // 重新签发 admin 身份 token
        const newToken = require('jsonwebtoken').sign(
            {
                id: DbAdapter.getId(adminUser),
                username: adminUser.username,
                role: adminUser.role,
                token_version: adminUser.token_version || 0
                // 不带 impersonatedBy 字段, 表示非 impersonate 状态
            },
            require('../config/auth').JWT_SECRET,
            {
                expiresIn: require('../config/auth').JWT_EXPIRES_IN,
                issuer: 'codedog-community',
                audience: 'codedog-frontend'
            }
        );

        setTokenCookie(res, newToken);
        logOperation(req, 'restore_from_impersonate', 'user', DbAdapter.getId(adminUser), { admin_id: DbAdapter.getId(adminUser), admin_username: adminUser.username, was_impersonating_user_id: DbAdapter.getId(req.user) });

        // 修复: httpOnly cookie 模式下不再返回 token
        return successResponse(res, {
            user: {
                id: adminUser.id,
                username: adminUser.username,
                nickname: adminUser.nickname,
                avatar: adminUser.avatar,
                role: adminUser.role
            }
        }, '已恢复管理员身份');
    } catch (error) {
        console.error('恢复管理员身份错误:', error);
        return errorResponse(res, '恢复失败', 500);
    }
}

/**
 * 更新用户状态
 */
async function updateUserStatus(req, res) {
    try {
        const { userId } = req.params;
        const { status } = req.body;

        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        if (!canManageExistingUser(req, user)) {
            return errorResponse(res, 'Cannot manage this user', 403);
        }
        if (!VALID_USER_STATUSES.includes(status)) {
            return errorResponse(res, 'Invalid status', 400);
        }

        await DbAdapter.update(User, { status }, { where: { id: userId } });
        const refreshedUser = await DbAdapter.findByPk(User, userId, { attributes: ['id', 'status', 'role', 'token_version'] });
        try { require('../services/imStatusPush').enqueueImStatus(refreshedUser); }
        catch (pushError) { console.error('[IM status enqueue]', pushError.message); }
        
        logOperation(req, 'update_user_status', 'user', userId, { 
            username: user.username, 
            oldStatus: user.status, 
            newStatus: status 
        });

        return successResponse(res, null, '更新成功');
    } catch (error) {
        console.error('更新用户状态错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 更新用户角色
 */
async function updateUserRole(req, res) {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        const operatorRole = req.user.role;

        if (!['user', 'reviewer', 'moderator', 'admin', 'superadmin'].includes(role)) {
            return errorResponse(res, '无效的角色', 400);
        }

        const targetUser = await DbAdapter.findByPk(User, userId);
        if (!targetUser) {
            return errorResponse(res, '用户不存在', 404);
        }
        
        // 检查操作者是否有权限管理目标用户
        if (!canManageUser(operatorRole, targetUser.role)) {
            return errorResponse(res, '您没有权限管理此用户', 403);
        }
        
        // 检查操作者对目标"新角色"的权限,使用与 updateUser 相同的严格 canManageUser
        // 高·越权修复: 除 superadmin 特例外,操作者必须严格高于目标新角色等级
        // 防止 admin(3) 将 user(0) 提升为 admin(3) (3>3 不成立,拦截)
        const { getRoleSync } = require('../config/permissions');
        const newRoleInfo = getRoleSync(role);
        if (!canManageUser(operatorRole, role)) {
            return errorResponse(res, '您没有权限分配此角色', 403);
        }

        const oldRole = targetUser.role;
        await DbAdapter.update(User, { role }, { where: { id: userId } });
        
        logOperation(req, 'update_user_role', 'user', userId, { 
            username: targetUser.username, 
            oldRole, 
            newRole: role 
        });
        
        try {
            await DbAdapter.create(Notification, {
                user_id: targetUser.id,
                type: 'system',
                title: '角色变更通知',
                content: `您的角色已从「${getRoleSync(oldRole).name}」变更为「${getRoleSync(role).name}」`
            });
        } catch (notifyErr) {
            console.error('发送角色变更通知失败:', notifyErr.message);
        }

        return successResponse(res, { role }, '更新成功');
    } catch (error) {
        console.error('更新用户角色错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 删除用户
 */
async function deleteUser(req, res) {
    try {
        const { userId } = req.params;

        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        if (DbAdapter.getId(user) === DbAdapter.getId(req.user)) {
            return errorResponse(res, '不能删除自己', 400);
        }

        if (!canManageExistingUser(req, user)) {
            return errorResponse(res, 'Cannot manage this user', 403);
        }

        const { Work, Comment, Like, Favorite, Follow, Notification, Post, Studio, StudioMember, StudioWork, Report, OperationLog } = require('../models');
        const uid = DbAdapter.getId(user);

        // 先收集受影响的work/post ID，用于后续重算计数
        const userComments = await DbAdapter.findAll(Comment, { where: { user_id: uid }, attributes: ['work_id', 'post_id'] });
        const affectedWorkIds = [...new Set(userComments.filter(c => c.work_id).map(c => c.work_id))];
        const affectedPostIds = [...new Set(userComments.filter(c => c.post_id).map(c => c.post_id))];

        const userWorks = await DbAdapter.findAll(Work, { where: { user_id: uid }, attributes: ['id'] });
        affectedWorkIds.push(...userWorks.map(w => DbAdapter.getId(w)));

        const userPosts = await DbAdapter.findAll(Post, { where: { user_id: uid }, attributes: ['id'] });
        affectedPostIds.push(...userPosts.map(p => DbAdapter.getId(p)));

        // H1修复: 额外收集用户点赞/收藏过的作品ID。此前只收集了发布过和评论过的作品，
        // 漏掉了点赞/收藏的作品，导致这些作品的 praise_times/favorite_times 在删除后无法重算而漂移
        const userLikedWorks = await DbAdapter.findAll(Like, { where: { user_id: uid, work_id: { [Op.ne]: null } }, attributes: ['work_id'] });
        affectedWorkIds.push(...userLikedWorks.map(l => l.work_id).filter(Boolean));
        const userFavoritedWorks = await DbAdapter.findAll(Favorite, { where: { user_id: uid, work_id: { [Op.ne]: null } }, attributes: ['work_id'] });
        affectedWorkIds.push(...userFavoritedWorks.map(f => f.work_id).filter(Boolean));

        // Bug-4(幽灵点赞数): 收集用户点赞过的评论 ID,用于后续重算 Comment.like_count
        const userLikedComments = await DbAdapter.findAll(Like, { where: { user_id: uid, comment_id: { [Op.ne]: null } }, attributes: ['comment_id'] });
        const affectedCommentIds = [...new Set(userLikedComments.map(l => l.comment_id).filter(Boolean))];

        // Bug-2: 收集用户点赞/收藏过的帖子 ID,用于后续重算 Post 计数
        const userLikedPosts = await DbAdapter.findAll(Like, { where: { user_id: uid, post_id: { [Op.ne]: null } }, attributes: ['post_id'] });
        affectedPostIds.push(...userLikedPosts.map(l => l.post_id).filter(Boolean));
        const userFavoritedPosts = await DbAdapter.findAll(Favorite, { where: { user_id: uid, post_id: { [Op.ne]: null } }, attributes: ['post_id'] });
        affectedPostIds.push(...userFavoritedPosts.map(f => f.post_id).filter(Boolean));

        // H13: 收集被删用户的关注/粉丝关系，用于后续重算 follower_count/following_count
        const userFollows = await DbAdapter.findAll(Follow, {
            where: { [Op.or]: [{ follower_id: uid }, { following_id: uid }] },
            attributes: ['follower_id', 'following_id']
        });
        const affectedFollowerIds = [...new Set(userFollows.filter(f => f.follower_id !== uid).map(f => f.follower_id))];
        const affectedFollowingIds = [...new Set(userFollows.filter(f => f.following_id !== uid).map(f => f.following_id))];

        // H13: 整个删除流程必须用事务包裹，任一步失败整体回滚，避免数据不一致
        await sequelize.transaction(async (t) => {
            await DbAdapter.destroy(Notification, { where: { user_id: uid }, transaction: t });
            await DbAdapter.destroy(OperationLog, { where: { user_id: uid }, transaction: t });
            await DbAdapter.destroy(Report, { where: { reporter_id: uid }, transaction: t });
            // (Bug-3) 清理针对该用户的举报（type='user', target_id=uid），避免成为悬空记录
            await DbAdapter.destroy(Report, { where: { type: 'user', target_id: uid }, transaction: t });
            await DbAdapter.destroy(Follow, { where: { [Op.or]: [{ follower_id: uid }, { following_id: uid }] }, transaction: t });
            await DbAdapter.destroy(Favorite, { where: { user_id: uid }, transaction: t });
            await DbAdapter.destroy(Like, { where: { user_id: uid }, transaction: t });
            // H4修复: 改为软删评论（status:'deleted'）。此前硬删会破坏评论树——若该用户顶层评论被他人回复，
            // 删除后 parent_id 将悬空。软删保留行，重算 comment_count 时按 status:'active' 过滤不受影响
            await DbAdapter.update(Comment, { status: 'deleted' }, { where: { user_id: uid }, transaction: t });
            // 级联软删挂在这些被删评论下的子回复（含其他用户的多级回复），
            // 否则子回复 parent_id 指向已软删评论却仍 status:'active'，成为悬空"幽灵回复"。
            // 用循环处理多级回复链：先删直接子回复，再把它们的 id 作为下一层 parent_id 继续删，直到无子节点。
            try {
                const deletedRootComments = await DbAdapter.findAll(Comment, {
                    where: { user_id: uid },
                    attributes: ['id'],
                    transaction: t
                });
                let currentParentIds = deletedRootComments.map(c => DbAdapter.getId(c));
                while (currentParentIds.length > 0) {
                    const children = await DbAdapter.findAll(Comment, {
                        where: { parent_id: { [Op.in]: currentParentIds }, status: 'active' },
                        attributes: ['id'],
                        transaction: t
                    });
                    if (children.length === 0) break;
                    const childIds = children.map(c => DbAdapter.getId(c));
                    await DbAdapter.update(Comment, { status: 'deleted' }, {
                        where: { id: { [Op.in]: childIds } },
                        transaction: t
                    });
                    currentParentIds = childIds;
                }
            } catch (cascadeErr) {
                // (报告1 #8) 重新抛出以中止整个 deleteUser 事务：
                // 否则父评论已软删但级联子回复失败时，子回复仍 status:'active' 成为悬空“幽灵回复”
                console.error('级联软删子回复失败:', cascadeErr);
                throw cascadeErr;
            }
            // Bug-14: 软删帖子前先清理挂在其上的 Report/Notification，避免悬空引用
            const userPostIds = userPosts.map(p => DbAdapter.getId(p)).filter(Boolean);
            if (userPostIds.length > 0) {
                await DbAdapter.destroy(Report, { where: { type: 'post', target_id: { [Op.in]: userPostIds } }, transaction: t });
                await DbAdapter.destroy(Notification, { where: { related_id: { [Op.in]: userPostIds }, related_type: 'post' }, transaction: t });
            }
            // Bug-2: 改为软删帖子（status:'deleted'），与 Comment 软删保持一致，避免评论 post_id 成为死指针
            await DbAdapter.update(Post, { status: 'deleted' }, { where: { user_id: uid }, transaction: t });
            const userStudios = await DbAdapter.findAll(Studio, { where: { owner_id: uid }, transaction: t });
            for (const s of userStudios) {
                await DbAdapter.destroy(StudioWork, { where: { studio_id: DbAdapter.getId(s) }, transaction: t });
                await DbAdapter.destroy(StudioMember, { where: { studio_id: DbAdapter.getId(s) }, transaction: t });
                await DbAdapter.destroy(Studio, { where: { id: DbAdapter.getId(s) }, transaction: t });
            }
            await DbAdapter.destroy(StudioMember, { where: { user_id: uid }, transaction: t });
            await DbAdapter.destroy(StudioWork, { where: { user_id: uid }, transaction: t });
            // Bug-13: 软删作品前先清理挂在其上的 Report，避免悬空引用
            // Bug-12: 软删作品前先清理指向其的 StudioWork 记录，并重算受影响工作室的 work_count
            const userWorkIds = userWorks.map(w => DbAdapter.getId(w)).filter(Boolean);
            if (userWorkIds.length > 0) {
                await DbAdapter.destroy(Report, { where: { type: 'work', target_id: { [Op.in]: userWorkIds } }, transaction: t });
                const affectedStudioWorksFromUserWorks = await DbAdapter.findAll(StudioWork, {
                    where: { work_id: { [Op.in]: userWorkIds }, status: 'approved' },
                    attributes: ['studio_id'],
                    transaction: t
                });
                const affectedStudioIdsFromUserWorks = [...new Set(affectedStudioWorksFromUserWorks.map(sw => sw.studio_id))];
                await DbAdapter.destroy(StudioWork, { where: { work_id: { [Op.in]: userWorkIds } }, transaction: t });
                for (const sid of affectedStudioIdsFromUserWorks) {
                    // 修复: 同时重算 work_count 和 total_score,与 removeStudioMember/removeStudioWork 保持一致
                    // 此前只重算 work_count,导致工作室总分漂移且无法通过 repair-counts 恢复
                    const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: sid, status: 'approved' }, transaction: t });
                    const approvedScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: sid, status: 'approved' }, transaction: t }) || 0;
                    await DbAdapter.update(Studio, { work_count: approvedCount, total_score: approvedScore }, { where: { id: sid }, transaction: t });
                }
            }
            // Bug-3: 改为软删作品（status:'deleted'），与 Comment 软删保持一致，避免评论 work_id 成为死指针
            await DbAdapter.update(Work, { status: 'deleted', praise_times: 0, collection_times: 0, comment_count: 0 }, { where: { user_id: uid }, transaction: t });

            // Bug-2: 软删"别人评论在该用户作品/帖子下"的评论,
            // 删除用户后这些 active 评论会挂在 deleted work/post 下,应一并软删
            if (userWorkIds.length > 0) {
                await DbAdapter.update(Comment, { status: 'deleted' }, { where: { work_id: { [Op.in]: userWorkIds } }, transaction: t });
                // Bug-15: 清理 Notification 中 related_type='work' 指向被删作品的记录,防止死链
                await DbAdapter.destroy(Notification, { where: { related_id: { [Op.in]: userWorkIds }, related_type: 'work' }, transaction: t });
                // Bug-14: 清理别人对被删作品的 Like/Favorite,soft delete 作品计数也应归零
                await DbAdapter.destroy(Like, { where: { work_id: { [Op.in]: userWorkIds } }, transaction: t });
                await DbAdapter.destroy(Favorite, { where: { work_id: { [Op.in]: userWorkIds } }, transaction: t });
            }
            if (userPostIds.length > 0) {
                await DbAdapter.update(Comment, { status: 'deleted' }, { where: { post_id: { [Op.in]: userPostIds } }, transaction: t });
            }

            // 🔴5 修复: 用批量查询替代逐条 for 循环,避免数万条记录产生 DB DoS 锁死
            const uniqueWorkIds = [...new Set(affectedWorkIds)].filter(Boolean);
            if (uniqueWorkIds.length > 0) {
                // 批量: 一次 count 所有受影响的 works
                const [workLikeCounts, workFavCounts, workCommentCounts] = await Promise.all([
                    DbAdapter.findAll(Like, { attributes: ['work_id', [sequelize.fn('COUNT', '*'), 'count']], where: { work_id: { [Op.in]: uniqueWorkIds } }, group: ['work_id'], transaction: t, raw: true }),
                    DbAdapter.findAll(Favorite, { attributes: ['work_id', [sequelize.fn('COUNT', '*'), 'count']], where: { work_id: { [Op.in]: uniqueWorkIds } }, group: ['work_id'], transaction: t, raw: true }),
                    DbAdapter.findAll(Comment, { attributes: ['work_id', [sequelize.fn('COUNT', '*'), 'count']], where: { work_id: { [Op.in]: uniqueWorkIds }, status: 'active', parent_id: null }, group: ['work_id'], transaction: t, raw: true })
                ]);
                const likeMap = new Map(workLikeCounts.map(r => [String(r.work_id), r.count]));
                const favMap = new Map(workFavCounts.map(r => [String(r.work_id), r.count]));
                const commentMap = new Map(workCommentCounts.map(r => [String(r.work_id), r.count]));
                for (const wid of uniqueWorkIds) {
                    await DbAdapter.update(Work, {
                        praise_times: likeMap.get(String(wid)) || 0,
                        collection_times: favMap.get(String(wid)) || 0,
                        comment_count: commentMap.get(String(wid)) || 0
                    }, { where: { id: wid }, transaction: t });
                }
            }

            const uniquePostIds = [...new Set(affectedPostIds)].filter(Boolean);
            if (uniquePostIds.length > 0) {
                const [postLikeCounts, postFavCounts, postCommentCounts] = await Promise.all([
                    DbAdapter.findAll(Like, { attributes: ['post_id', [sequelize.fn('COUNT', '*'), 'count']], where: { post_id: { [Op.in]: uniquePostIds } }, group: ['post_id'], transaction: t, raw: true }),
                    DbAdapter.findAll(Favorite, { attributes: ['post_id', [sequelize.fn('COUNT', '*'), 'count']], where: { post_id: { [Op.in]: uniquePostIds } }, group: ['post_id'], transaction: t, raw: true }),
                    DbAdapter.findAll(Comment, { attributes: ['post_id', [sequelize.fn('COUNT', '*'), 'count']], where: { post_id: { [Op.in]: uniquePostIds }, status: 'active', parent_id: null }, group: ['post_id'], transaction: t, raw: true })
                ]);
                const plikeMap = new Map(postLikeCounts.map(r => [String(r.post_id), r.count]));
                const pfavMap = new Map(postFavCounts.map(r => [String(r.post_id), r.count]));
                const pcommentMap = new Map(postCommentCounts.map(r => [String(r.post_id), r.count]));
                for (const pid of uniquePostIds) {
                    await DbAdapter.update(Post, {
                        like_count: plikeMap.get(String(pid)) || 0,
                        collection_count: pfavMap.get(String(pid)) || 0,
                        comment_count: pcommentMap.get(String(pid)) || 0
                    }, { where: { id: pid }, transaction: t });
                }
            }

            // Bug-4(幽灵点赞数): 批量重算被删用户曾点赞过的 Comment 的 like_count
            const uniqueCommentIds = [...new Set(affectedCommentIds)].filter(Boolean);
            if (uniqueCommentIds.length > 0) {
                const commentLikeCounts = await DbAdapter.findAll(Like, {
                    attributes: ['comment_id', [sequelize.fn('COUNT', '*'), 'count']],
                    where: { comment_id: { [Op.in]: uniqueCommentIds } },
                    group: ['comment_id'],
                    transaction: t,
                    raw: true
                });
                const clikeMap = new Map(commentLikeCounts.map(r => [String(r.comment_id), r.count]));
                for (const cid of uniqueCommentIds) {
                    await DbAdapter.update(Comment, { like_count: clikeMap.get(String(cid)) || 0 }, { where: { id: cid }, transaction: t });
                }
            }

            // H13: 重算被删用户曾关注过的人及关注过被删用户的人的 follower_count/following_count
            for (const fid of [...new Set([...affectedFollowerIds, ...affectedFollowingIds])]) {
                const followingCount = await DbAdapter.count(Follow, { where: { follower_id: fid }, transaction: t });
                const followerCount = await DbAdapter.count(Follow, { where: { following_id: fid }, transaction: t });
                await DbAdapter.update(User, { following_count: followingCount, follower_count: followerCount }, { where: { id: fid }, transaction: t });
            }

            // (Bug-4) 改为软删用户（status:'disabled'），与 Comment/Post/Work 软删保持一致，
            // 避免硬删 User 导致 Comment.user_id 等外键成为指向已删用户的死指针。
            // User.status ENUM 仅有 'active'/'disabled'，故用 'disabled'
            // Bug-3: 同时清空 codemao_user_id/email/username,释放占用,
            // 避免被删用户以后无法用同一编程猫账号重新注册/登录。
            // 用后缀标记已删除,保持唯一性约束不冲突
            const deleteSuffix = `_deleted_${uid}`;
            // 低·边界: 防止 null 变成 "null_deleted_x" 或字段长度超限
            const safePrefix = (str, maxLen) => {
                if (str == null) return `deleted_${uid}`;
                const s = String(str);
                // 预留后缀空间,超过列长度时截断(常用列: username 50, email 100, codemao_user_id 50)
                const maxPrefix = Math.max(2, maxLen - deleteSuffix.length);
                return s.length > maxPrefix ? s.substring(0, maxPrefix) : s;
            };
            await DbAdapter.update(User, {
                status: 'disabled',
                codemao_user_id: (user.codemao_user_id ? safePrefix(user.codemao_user_id, 50) : `${uid}`) + deleteSuffix,
                email: safePrefix(user.email, 100) + deleteSuffix,
                username: safePrefix(user.username, 50) + deleteSuffix,
                codemao_token: null
            }, { where: { id: uid }, transaction: t });
        });

        // 兼容历史警告：首次查看时从仍保留的违规内容补齐快照，之后即使内容被隐藏或删除也可审计。
        for (const warning of warnings) {
            if (warning.source_content || !warning.source_type || !warning.source_id) continue;
            let sourceTitle = warning.source_title;
            let sourceContent = null;
            if (warning.source_type === 'post') {
                const source = await Post.findByPk(warning.source_id, { attributes: ['title', 'content'] });
                sourceTitle = source?.title || sourceTitle;
                sourceContent = source?.content || null;
            } else if (warning.source_type === 'comment') {
                const source = await Comment.findByPk(warning.source_id, { attributes: ['content', 'post_id', 'work_id'] });
                sourceContent = source?.content || null;
                if (source?.post_id) {
                    const post = await Post.findByPk(source.post_id, { attributes: ['title'] });
                    sourceTitle = post?.title ? `帖子“${post.title}”中的评论` : '帖子评论';
                } else if (source?.work_id) sourceTitle = '作品评论';
            }
            if (sourceContent) await warning.update({ source_title: sourceTitle, source_content: sourceContent });
        }
        logOperation(req, 'delete_user', 'user', userId, { username: user.username });
        invalidateForumReputation();

        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除用户错误:', error);
        return errorResponse(res, '删除失败', 500);
    }
}

/**
 * 获取作品列表（管理）
 */
async function getWorks(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const keyword = req.query.keyword || '';
        const status = req.query.status || '';
        const isFeatured = req.query.isFeatured || '';
        const type = req.query.type || '';

        const where = {};
        
        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['name', 'codemao_work_id', 'codemao_author_name'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        
        if (status) where.status = status;
        if (isFeatured !== '') where.is_featured = isFeatured === 'true';
        if (type) where.type = type;

        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where,
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'username', 'nickname', 'avatar']
            }],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });

        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取作品列表错误:', error);
        return errorResponse(res, '获取作品列表失败', 500);
    }
}

/**
 * 更新作品信息
 */
async function updateWork(req, res) {
    try {
        const { workId } = req.params;
        const { name, publisher_id, preview, type, ide_type, view_times, praise_times, collection_times, status, is_featured, is_sidebar_recommended, sidebar_sort_order, _reason } = req.body;

        const work = await DbAdapter.findByPk(Work, workId);
        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }

        const VALID_WORK_STATUSES = ['pending', 'published', 'rejected', 'hidden', 'deleted'];
        const updateData = {};
        if (publisher_id !== undefined) {
            const publisherId = Number(publisher_id);
            if (!Number.isSafeInteger(publisherId) || publisherId <= 0) {
                return errorResponse(res, '发布者编号格式不正确', 400);
            }
            const newPublisher = await DbAdapter.findByPk(User, publisherId);
            if (!newPublisher || newPublisher.status !== 'active') {
                return errorResponse(res, '目标发布者不存在或账号已被禁用', 400);
            }
            updateData.user_id = publisherId;
        }
        if (name !== undefined) {
            const trimmedName = String(name).trim();
            if (!trimmedName) return errorResponse(res, '作品名称不能为空', 400);
            // Bug-7 修复: 管理员更新作品 name 时缺少 AI 内容审核 + escapeHtml 转义,
            // 参照 workController.updateWork 调用 aiReview.fallbackReview
            const reviewResult = await aiReview.fallbackReview(trimmedName);
            if (reviewResult.recommendation === 'delete') {
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            const escapedName = String(trimmedName).substring(0, 200); // 存原始,渲染转义
            updateData.name = escapedName;
            if (reviewResult.recommendation === 'review') {
                updateData.status = 'pending';
            }
        }
        if (preview !== undefined && preview !== '') updateData.preview = String(preview).substring(0, 500);
        // 管理员可纠正历史作品的具体型号与 IDE 系列；Nemo 和 Neko 必须保持为不同值。
        const normalizeWorkType = (value, fieldName) => {
            const normalized = String(value || '').trim().toUpperCase();
            if (!normalized || normalized.length > 50 || !/^[A-Z0-9_-]+$/.test(normalized)) {
                return { error: `${fieldName} 格式不正确` };
            }
            return { value: normalized };
        };
        if (type !== undefined) {
            const result = normalizeWorkType(type, '作品类型');
            if (result.error) return errorResponse(res, result.error, 400);
            updateData.type = result.value;
        }
        if (ide_type !== undefined) {
            const result = normalizeWorkType(ide_type, 'IDE 类型');
            if (result.error) return errorResponse(res, result.error, 400);
            updateData.ide_type = result.value;
        }
        if (view_times !== undefined) updateData.view_times = Math.max(0, parseInt(view_times, 10) || 0);
        if (praise_times !== undefined) updateData.praise_times = Math.max(0, parseInt(praise_times, 10) || 0);
        if (collection_times !== undefined) updateData.collection_times = Math.max(0, parseInt(collection_times, 10) || 0);
        if (status !== undefined && VALID_WORK_STATUSES.includes(status)) updateData.status = status;
        if (is_featured !== undefined) updateData.is_featured = is_featured;
        if (is_sidebar_recommended !== undefined) updateData.is_sidebar_recommended = Boolean(is_sidebar_recommended);
        if (sidebar_sort_order !== undefined) updateData.sidebar_sort_order = Math.max(-9999, Math.min(9999, parseInt(sidebar_sort_order, 10) || 0));

        const oldPublisherId = Number(work.user_id);
        const newPublisherId = Number(updateData.user_id || work.user_id);
        const effectiveStatus = updateData.status || work.status;
        await sequelize.transaction(async (transaction) => {
            await DbAdapter.update(Work, updateData, { where: { id: workId }, transaction });
            const affectedPublisherIds = [...new Set([oldPublisherId, newPublisherId])]
                .filter(publisherId => Number.isSafeInteger(publisherId) && publisherId > 0);
            if (updateData.user_id !== undefined || effectiveStatus !== work.status) {
                for (const publisherId of affectedPublisherIds) {
                    const workCount = await DbAdapter.count(Work, {
                        where: { user_id: publisherId, status: 'published' },
                        transaction
                    });
                    await DbAdapter.update(User, { work_count: workCount }, { where: { id: publisherId }, transaction });
                }
            }
        });
        logOperation(req, 'update_work', 'work', workId, {
            reason: _reason || '未说明',
            changes: updateData,
            old_values: {
                name: work.name,
                user_id: work.user_id,
                preview: work.preview,
                type: work.type,
                ide_type: work.ide_type,
                view_times: work.view_times,
                praise_times: work.praise_times,
                collection_times: work.collection_times,
                status: work.status,
                is_featured: work.is_featured,
                is_sidebar_recommended: work.is_sidebar_recommended,
                sidebar_sort_order: work.sidebar_sort_order
            }
        });

        return successResponse(res, null, '更新成功');
    } catch (error) {
        console.error('更新作品错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 设置作品精选
 */
async function setWorkFeatured(req, res) {
    try {
        const { workId } = req.params;
        const { isFeatured } = req.body;

        const work = await DbAdapter.findByPk(Work, workId);
        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }

        await DbAdapter.update(Work, { is_featured: isFeatured }, { where: { id: workId } });
        logOperation(req, 'set_work_featured', 'work', workId, { isFeatured });

        return successResponse(res, null, isFeatured ? '已设为精选' : '已取消精选');
    } catch (error) {
        console.error('设置精选错误', error);
        return errorResponse(res, '操作失败', 500);
    }
}

/**
 * 删除作品
 */
async function deleteWork(req, res) {
    try {
        const { workId } = req.params;

        const work = await DbAdapter.findByPk(Work, workId);
        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }

        const { Like, Favorite, Comment, Report, StudioWork, Notification } = require('../models');
        const wid = DbAdapter.getId(work);
        // (报告1 #5 / Report4 #7) 记录作者，用于事务内重算 work_count（镜像 workController.deleteWork）
        const authorId = work.user_id;

        // L4: 删除作品涉及多表关联数据，必须用事务包裹，任一步失败整体回滚
        await sequelize.transaction(async (t) => {
            // 收集受影响的工作室，用于后续重算 work_count
            const affectedStudioWorks = await DbAdapter.findAll(StudioWork, {
                where: { work_id: wid, status: 'approved' },
                attributes: ['studio_id'],
                transaction: t
            });
            const affectedStudioIds = [...new Set(affectedStudioWorks.map(sw => sw.studio_id))];

            await DbAdapter.destroy(Notification, { where: { related_id: wid, related_type: 'work' }, transaction: t });
            await DbAdapter.destroy(StudioWork, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(Report, { where: { target_id: wid, type: 'work' }, transaction: t });
            await DbAdapter.destroy(Like, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(Favorite, { where: { work_id: wid }, transaction: t });
            // Comment 有 status 字段，软删保留历史可追溯
            await DbAdapter.update(Comment, { status: 'deleted' }, { where: { work_id: wid }, transaction: t });
            // H3修复: 作品改为软删（status:'deleted'）。此前作品 destroy 硬删而评论仅软删，
            // 会导致评论的 work_id 成为指向不存在作品的死指针。统一软删，保留作品行让外键不悬空，且数据可恢复
            // (报告1 #5 / Report4 #7) 同时清零 praise_times/collection_times/comment_count，与 workController.deleteWork 保持一致，
            // 避免恢复后计数与已删除的 Like/Favorite/Comment 记录错位
            await DbAdapter.update(Work, { status: 'deleted', praise_times: 0, collection_times: 0, comment_count: 0 }, { where: { id: wid }, transaction: t });

            // 修复: 重算受影响工作室的 work_count 和 total_score
            // 原先只重算 work_count 不重算 total_score,删除已评分作品后总分漂移
            for (const sid of affectedStudioIds) {
                const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: sid, status: 'approved' }, transaction: t });
                const totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: sid, status: 'approved' }, transaction: t }) || 0;
                await DbAdapter.update(Studio, { work_count: approvedCount, total_score: totalScore }, { where: { id: sid }, transaction: t });
            }

            // (报告1 #5 / Report4 #7) 重算作者 work_count，仅统计 status:'published'，
            // 避免软删作品仍计入作者 work_count（镜像 workController.deleteWork）
            if (authorId != null) {
                const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
            }
        });
        logOperation(req, 'delete_work', 'work', workId, { name: work.name });

        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除作品错误:', error);
        return errorResponse(res, '删除失败', 500);
    }
}

/**
 * 彻底删除作品：物理清理关联数据，并在同一事务内保留独立审计快照。
 */
async function purgeWork(req, res) {
    try {
        const { workId } = req.params;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        const confirmation = String(req.body?.confirmCodemaoWorkId ?? '').trim();
        if (reason.length < 5 || reason.length > 500) return errorResponse(res, '彻底删除原因需为 5-500 个字符', 400);

        const work = await DbAdapter.findByPk(Work, workId);
        if (!work) return errorResponse(res, '作品不存在', 404);
        const codemaoWorkId = String(work.codemao_work_id ?? '');
        if (!codemaoWorkId || confirmation !== codemaoWorkId) return errorResponse(res, '确认的编程猫作品 ID 不匹配', 400);

        const wid = DbAdapter.getId(work);
        const authorId = work.user_id;
        let auditLogId = null;
        await sequelize.transaction(async (t) => {
            const [comments, studioWorks, workReports] = await Promise.all([
                DbAdapter.findAll(Comment, { where: { work_id: wid }, attributes: ['id'], transaction: t }),
                DbAdapter.findAll(StudioWork, { where: { work_id: wid }, attributes: ['id', 'studio_id', 'status'], transaction: t }),
                DbAdapter.findAll(Report, { where: { target_id: wid, type: 'work' }, attributes: ['id'], transaction: t })
            ]);
            const commentIds = comments.map(item => item.id);
            const commentReports = commentIds.length ? await DbAdapter.findAll(Report, {
                where: { target_id: { [Op.in]: commentIds }, type: 'comment' }, attributes: ['id'], transaction: t
            }) : [];
            const reportIds = [...workReports, ...commentReports].map(item => item.id);
            const affectedStudioIds = [...new Set(studioWorks.filter(item => item.status === 'approved').map(item => item.studio_id))];
            const relationCounts = {
                comments: commentIds.length,
                work_likes: await DbAdapter.count(Like, { where: { work_id: wid }, transaction: t }),
                comment_likes: commentIds.length ? await DbAdapter.count(Like, { where: { comment_id: { [Op.in]: commentIds } }, transaction: t }) : 0,
                favorites: await DbAdapter.count(Favorite, { where: { work_id: wid }, transaction: t }),
                studio_works: studioWorks.length,
                studio_tasks_detached: await DbAdapter.count(StudioTask, { where: { work_id: wid }, transaction: t }),
                reports: reportIds.length,
                notifications: await DbAdapter.count(Notification, { where: { related_id: wid, related_type: 'work' }, transaction: t })
                    + (commentIds.length ? await DbAdapter.count(Notification, { where: { related_id: { [Op.in]: commentIds }, related_type: 'comment' }, transaction: t }) : 0)
            };

            const audit = await DbAdapter.create(OperationLog, {
                user_id: req.user?.id || null,
                action: 'purge_work', target_type: 'work', target_id: wid,
                details: JSON.stringify({
                    schema_version: 1, irreversible: true, reason,
                    work_snapshot: work.toJSON(), relation_counts: relationCounts,
                    affected_studio_ids: affectedStudioIds,
                    operator: { id: req.user?.id || null, role: req.user?.role || null },
                    request_id: req.id || req.headers['x-request-id'] || null
                }),
                ip_address: req.ip || null,
                user_agent: req.get('user-agent') || null
            }, { transaction: t });
            auditLogId = audit.id;

            if (reportIds.length) {
                await DbAdapter.destroy(ReportAuditLog, { where: { report_id: { [Op.in]: reportIds } }, transaction: t });
                await DbAdapter.destroy(Report, { where: { id: { [Op.in]: reportIds } }, transaction: t });
            }
            await DbAdapter.destroy(Notification, { where: { related_id: wid, related_type: 'work' }, transaction: t });
            if (commentIds.length) {
                await DbAdapter.destroy(Notification, { where: { related_id: { [Op.in]: commentIds }, related_type: 'comment' }, transaction: t });
                await DbAdapter.destroy(Like, { where: { comment_id: { [Op.in]: commentIds } }, transaction: t });
                await DbAdapter.update(Comment, { parent_id: null }, { where: { id: { [Op.in]: commentIds } }, transaction: t });
            }
            await DbAdapter.destroy(Like, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(Favorite, { where: { work_id: wid }, transaction: t });
            await DbAdapter.update(StudioTask, { work_id: null }, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(StudioWork, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(Comment, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(Work, { where: { id: wid }, transaction: t });

            for (const sid of affectedStudioIds) {
                const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: sid, status: 'approved' }, transaction: t });
                const totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: sid, status: 'approved' }, transaction: t }) || 0;
                await DbAdapter.update(Studio, { work_count: approvedCount, total_score: totalScore }, { where: { id: sid }, transaction: t });
            }
            if (authorId != null) {
                const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
            }
        });
        return successResponse(res, { auditLogId }, '作品已彻底删除，现在可以重新爬取');
    } catch (error) {
        console.error('彻底删除作品错误:', error);
        return errorResponse(res, '彻底删除失败，数据未变更', 500);
    }
}

/**
 * 爬取作品
 */
async function crawlWork(req, res) {
    try {
        const { workId } = req.body;

        if (!workId) {
            return errorResponse(res, '请提供作品ID', 400);
        }

        if (!/^\d{1,20}$/.test(String(workId))) {
            return errorResponse(res, '作品ID格式无效', 400);
        }

        logOperation(req, 'crawl_work', 'work', null, { codemaoWorkId: workId });

        const workDetail = await codemaoApi.getWorkDetail(workId);
        if (!workDetail || !workDetail.id) {
            return errorResponse(res, '获取作品信息失败，请检查作品ID', 400);
        }

        const existing = await DbAdapter.findOne(Work, { where: { codemao_work_id: workDetail.id } });
        if (existing) {
            return errorResponse(res, '作品已存在', 400);
        }

        const userInfo = workDetail.user_info || {};
        const codemaoUserId = userInfo.id != null ? String(userInfo.id) : null;

        // (报告1 #2) Work.user_id allowNull:false，缺少作者信息时直接跳过，
        // 避免 user_id:null 落库失败/产生脏数据
        if (!codemaoUserId) {
            return errorResponse(res, '作品缺少作者信息，无法爬取', 400);
        }

        let user = null;
        user = await DbAdapter.findOne(User, {
            where: { codemao_user_id: codemaoUserId }
        });

        if (!user) {
            // (报告1 #3) 占位用户 nickname/bio 走审核+转义，与 userController.codemaoLogin 一致，
            // 避免爬虫绕过本地内容审核与 XSS
            const safeProfile = await sanitizeCodemaoProfile(userInfo.nickname, userInfo.description);
            user = await DbAdapter.create(User, {
                codemao_user_id: codemaoUserId,
                username: `codemao_${codemaoUserId}`,
                email: `codemao_${codemaoUserId}@example.invalid`,
                password: PLACEHOLDER_PASSWORD_HASH,
                nickname: safeProfile.nickname || `用户${codemaoUserId}`,
                avatar: codemaoApi.normalizeCodemaoAvatar(userInfo),
                bio: safeProfile.bio,
                role: 'user',
                status: 'active'
            });
        }

        // (报告1 #1) 爬虫落库前对作品名+描述做内容审核，与 workController.publishWork 一致：
        // delete→跳过不落库，review→status:'pending'，pass→status:'published'
        let workStatus = 'published';
        const workReviewText = String(`${workDetail.work_name || ''} ${workDetail.description || ''}`);
        try {
            const workReviewResult = await aiReview.fallbackReview(workReviewText);
            if (workReviewResult.recommendation === 'delete') {
                return errorResponse(res, '作品内容未通过审核，已跳过', 400);
            } else if (workReviewResult.recommendation === 'review') {
                workStatus = 'pending';
            }
        } catch (reviewErr) {
            console.error('[crawlWork] 作品内容审核失败:', reviewErr.message);
            workStatus = 'pending';
        }

        // 识别作品类型 (主类型
        let workType = workDetail.type || workDetail.ide_type || 'KITTEN';

        // 修复: create Work + 重算 work_count 用事务包裹,与 workController.publishWork 保持一致
        const work = await sequelize.transaction(async (t) => {
            const newWork = await DbAdapter.create(Work, {
                codemao_work_id: workDetail.id,
                name: workDetail.work_name,
                description: workDetail.description,
                preview: workDetail.preview,
                type: workType,
                // H8修复: 补充 ide_type 字段（与 crawlHotWorks 保持一致）
                ide_type: workDetail.ide_type || 'KITTEN',
                // 修复: player_url 为空时回退到标准播放器 URL,避免 work_url 落库为空
                work_url: buildCodemaoPlayerUrl({ workId: workDetail.id, playerUrl: workDetail.player_url, type: workDetail.type, ideType: workDetail.ide_type }),
                user_id: user ? DbAdapter.getId(user) : null,
                codemao_author_id: codemaoUserId,
                codemao_author_name: userInfo.nickname || '未知作者',
                view_times: workDetail.view_times || 0,
                // 中·脏数据: praise_times/collection_times 归 0,与 workController 保持一致
                // 外部数据是编程猫总计数,本地无 Like/Favorite 记录→不能直接写入
                praise_times: 0,
                collection_times: 0,
                // Bug-2(脏数据): comment_count 始终从 0 开始,不使用外部 comment_times
                comment_count: 0,
                status: workStatus
            }, { transaction: t });

            // 修复: 新增作品后重算作者 work_count,仅统计 published,避免计数不更新
            if (user) {
                const authorId = DbAdapter.getId(user);
                const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
            }
            return newWork;
        });

        return successResponse(res, work, '爬取成功');
    } catch (error) {
        console.error('爬取作品错误:', error);
        return errorResponse(res, '爬取失败', 500);
    }
}

/**
 * 批量爬取发现页面作品 - 使用新的API
 */
async function crawlHotWorks(req, res) {
    const taskId = Date.now().toString();
    try {
        logOperation(req, 'crawl_hot_works', 'work', null, { taskId });
        const { count = 20 } = req.body;
        const requestedCount = parseInt(count, 10);
        const targetCount = Math.min(Math.max(Number.isFinite(requestedCount) ? requestedCount : 20, 1), 100);
        const results = [];
        let offset = 0;
        const pageSize = 50;
        let attempts = 0;
        const maxAttempts = Math.ceil(targetCount * 3) + 100;
        let skippedCount = 0;
        let errorCount = 0;
        const seenWorkIds = new Set();

        addCrawlLog(taskId, `开始爬取发现页面作品，目标数量: ${targetCount}`, 'start');
        adminLog('info', `[爬取 ${taskId}] 开始爬取发现页面作品，目标数量: ${targetCount}`);

        while (results.length < targetCount && attempts < maxAttempts) {
            attempts++;
            const statusMsg = `🔄${attempts} 次 | 成功: ${results.length}/${targetCount} | 跳过: ${skippedCount} | 错误: ${errorCount}`;
            addCrawlLog(taskId, statusMsg);
            adminLog('info', `[爬取 ${taskId}] ${statusMsg}`);

            const discoverData = await codemaoApi.getDiscoverWorks(offset, pageSize);
            
            if (!discoverData || !discoverData.items || discoverData.items.length === 0) {
                addCrawlLog(taskId, 'API返回为空，重新从开头获取', 'warn');
                offset = 0;
                attempts++;
                if (attempts >= maxAttempts) break;
                continue;
            }

            let pageAdded = 0;
            let pageSkipped = 0;

            for (const item of discoverData.items) {
                if (results.length >= targetCount) break;
                
                try {
                    const workId = item.work_id;
                    if (!workId) {
                        pageSkipped++;
                        continue;
                    }

                    if (seenWorkIds.has(workId)) {
                        pageSkipped++;
                        continue;
                    }
                    seenWorkIds.add(workId);
                    
                    const existing = await DbAdapter.findOne(Work, { where: { codemao_work_id: String(workId) } });
                    if (existing) {
                        pageSkipped++;
                        skippedCount++;
                        continue;
                    }

                    let user = await DbAdapter.findOne(User, {
                        where: { codemao_user_id: String(item.user_id) }
                    });

                    if (!user) {
                        try {
                            // (报告1 #3) 占位用户 nickname 走审核+转义，与 userController.codemaoLogin 一致
                            const safeProfile = await sanitizeCodemaoProfile(item.nickname, null);
                            user = await DbAdapter.create(User, {
                                codemao_user_id: String(item.user_id),
                                username: `codemao_${item.user_id}`,
                                email: `codemao_${item.user_id}@example.invalid`,
                                password: PLACEHOLDER_PASSWORD_HASH,
                                nickname: safeProfile.nickname || `用户${item.user_id}`,
                                avatar: codemaoApi.normalizeCodemaoAvatar(item),
                role: 'user',
                                status: 'active'
                            });
                        } catch (userCreateError) {
                            user = await DbAdapter.findOne(User, {
                                where: { codemao_user_id: String(item.user_id) }
                            });
                            if (!user) {
                                pageSkipped++;
                                continue;
                            }
                        }
                    }

                    const workDetail = await codemaoApi.getWorkDetail(workId);
                    if (!workDetail || !workDetail.id || !workDetail.work_name) {
                        pageSkipped++;
                        errorCount++;
                        continue;
                    }

                    // Bug-12/13 修复: 优先用详情接口的 workDetail.user_info.id 作为作者归属,
                    // 而非 discover 列表的 item.user_id(两者可能不一致或 item.user_id 为 undefined)。
                    // 若详情接口有 user_info.id 则以它为准重新解析作者,避免归错作者或生成 codemao_undefined 脏用户
                    const detailAuthorId = workDetail.user_info?.id;
                    if (detailAuthorId && String(detailAuthorId) !== String(item.user_id)) {
                        // 详情接口的作者与列表不一致,以详情为准
                        user = await DbAdapter.findOne(User, {
                            where: { codemao_user_id: String(detailAuthorId) }
                        });
                        if (!user) {
                            try {
                                const safeProfile = await sanitizeCodemaoProfile(workDetail.user_info?.nickname, workDetail.user_info?.description);
                                user = await DbAdapter.create(User, {
                                    codemao_user_id: String(detailAuthorId),
                                    username: `codemao_${detailAuthorId}`,
                                    email: `codemao_${detailAuthorId}@example.invalid`,
                                    password: PLACEHOLDER_PASSWORD_HASH,
                                    nickname: safeProfile.nickname || `用户${detailAuthorId}`,
                                    avatar: codemaoApi.normalizeCodemaoAvatar(workDetail.user_info),
                                    role: 'user',
                                    status: 'active'
                                });
                            } catch (userCreateError) {
                                user = await DbAdapter.findOne(User, {
                                    where: { codemao_user_id: String(detailAuthorId) }
                                });
                                if (!user) {
                                    pageSkipped++;
                                    continue;
                                }
                            }
                        }
                    }

                    // (报告1 #1) 爬虫落库前对作品名+描述做内容审核，与 workController.publishWork 一致：
                    // delete→跳过，review→status:'pending'，pass→status:'published'
                    let workStatus = 'published';
                    const workReviewText = String(`${workDetail.work_name || ''} ${workDetail.description || ''}`);
                    try {
                        const workReviewResult = await aiReview.fallbackReview(workReviewText);
                        if (workReviewResult.recommendation === 'delete') {
                            pageSkipped++;
                            skippedCount++;
                            addCrawlLog(taskId, `作品 ${workId} 内容未通过审核，已跳过`, 'warn');
                            continue;
                        } else if (workReviewResult.recommendation === 'review') {
                            workStatus = 'pending';
                        }
                    } catch (reviewErr) {
                        console.error(`[crawlHotWorks] 作品 ${workId} 内容审核失败:`, reviewErr.message);
                        workStatus = 'pending';
                    }

                    try {
                        const work = await DbAdapter.create(Work, {
                            codemao_work_id: String(workId),
                            name: workDetail.work_name || item.work_name || `作品${workId}`,
                            description: workDetail.description || '',
                            preview: workDetail.preview || item.preview_url || '',
                            type: workDetail.type || workDetail.work_label_list?.[0]?.label_name || 'KITTEN',
                            ide_type: workDetail.ide_type || 'KITTEN',
                            work_url: buildCodemaoPlayerUrl({ workId, playerUrl: workDetail.player_url, type: workDetail.type, ideType: workDetail.ide_type }),
                            user_id: DbAdapter.getId(user),
                            // Bug-13 修复: 作者归属用详情接口的 user_info 而非 item.user_id
                            codemao_author_id: String(detailAuthorId || item.user_id),
                            codemao_author_name: workDetail.user_info?.nickname || item.nickname || '未知',
                            view_times: workDetail.view_times || item.views_count || 0,
                            // 中·脏数据: 归 0,与 workController 一致
                            praise_times: 0,
                            collection_times: 0,
                            // Bug-2(脏数据): comment_count 始终从 0 开始
                            comment_count: 0,
                            status: workStatus
                        });

                        results.push(work);
                        pageAdded++;

                        // 修复: 新增作品后重算作者 work_count,仅统计 published
                        const authorId = DbAdapter.getId(user);
                        const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' } });
                        await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId } });

                        const successMsg = `✅成功 (${results.length}/${targetCount}): ${work.name}`;
                        addCrawlLog(taskId, successMsg, 'success');
                        adminLog('info', `[爬取 ${taskId}] ${successMsg}`);
                    } catch (createError) {
                        if (createError.name === 'SequelizeUniqueConstraintError') {
                            pageSkipped++;
                            skippedCount++;
                        } else {
                            pageSkipped++;
                            errorCount++;
                            addCrawlLog(taskId, `创建失败: ${createError.message}`, 'error');
                        }
                    }
                } catch (e) {
                    pageSkipped++;
                    errorCount++;
                    addCrawlLog(taskId, `处理失败: ${e.message}`, 'error');
                }
            }

            addCrawlLog(taskId, `本页: 成功 ${pageAdded}，跳过: ${pageSkipped}`);
            
            offset += pageSize;
            
            if (discoverData.items.length < pageSize) {
                addCrawlLog(taskId, '已到最后一页，重新从开头获取', 'warn');
                offset = 0;
            }
        }

        const completeMsg = `爬取完成！成功 ${results.length}，跳过 ${skippedCount}，错误 ${errorCount}`;
        addCrawlLog(taskId, completeMsg, 'complete');
        adminLog('info', `[爬取 ${taskId}] ${completeMsg}`);
        
        return successResponse(res, { 
            taskId,
            total: results.length,
            skipped: skippedCount,
            errors: errorCount,
            attempts,
            works: results.map(w => ({ id: w.id, name: w.name, codemao_work_id: w.codemao_work_id }))
        }, `成功爬取 ${results.length} 个作品`);
    } catch (error) {
        addCrawlLog(taskId, `爬取失败: ${error.message}`, 'error');
        console.error('批量爬取错误:', error);
        return errorResponse(res, '批量爬取失败: ' + error.message, 500);
    }
}

/**
 * 获取爬取日志
 */
async function getCrawlLogsApi(req, res) {
    try {
        const { taskId } = req.query;
        const logs = crawlLogs.get(taskId) || [];
        return successResponse(res, { logs });
    } catch (error) {
        return errorResponse(res, '获取日志失败', 500);
    }
}

/**
 * 获取实时日志
 * 修复: 双来源 -- 应用内存日志 + 文件日志(包含 Docker stdout/stderr)
 * 文件日志通过 logger.js 写入 data/logs/app.log,记录所有 console输出
 */
async function getRealtimeLogs(req, res) {
    try {
        const { lastTime, limit = 100, source = 'all' } = req.query;
        const logLimit = Math.min(parseInt(limit) || 100, 500);

        let result = {};

        // 来源1: 内存中的应用日志(realtimeLogs)
        if (source === 'all' || source === 'memory') {
            let logs = realtimeLogs;
            if (lastTime) {
                const lastTimeDate = new Date(lastTime);
                logs = logs.filter(log => new Date(log.time) > lastTimeDate);
            }
            result.memoryLogs = logs.slice(-logLimit);
        }

        // 来源2: 文件日志(记录所有 logger 输出)
        if (source === 'all' || source === 'file') {
            const { getRecentLogs } = require('../utils/logger');
            // 修复: getRecentLogs 改为异步,需要用 await
            const rawLines = await getRecentLogs(logLimit);
            const fileLogs = rawLines.reduce((logs, line) => {
                // 解析格式: [2024-01-01T00:00:00.000Z] [LEVEL] [tag] message
                const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
                if (match) {
                    logs.push({ time: match[1], level: match[2], tag: match[3], message: match[4] });
                } else if (logs.length) {
                    // Error.stack 会跨多行写入文件；续行应属于上一条日志，而不是
                    // 伪造成一个没有时间戳的新日志条目。
                    logs[logs.length - 1].message += `\n${line}`;
                } else {
                    // 读取文件尾部时可能正好从一段堆栈中间开始。
                    logs.push({ time: null, level: 'INFO', tag: 'raw', message: line });
                }
                return logs;
            }, []);
            if (lastTime) {
                const lastTimeDate = new Date(lastTime);
                result.fileLogs = fileLogs.filter(log => log.time && new Date(log.time) > lastTimeDate);
            } else {
                result.fileLogs = fileLogs.slice(-logLimit);
            }
        }

        // 兼容旧版前端: 如果没有 source 参数,返回内存日志(保持兼容)
        if (!source) {
            return successResponse(res, {
                logs: result.memoryLogs || [],
                total: realtimeLogs.length
            });
        }

        const selectedLogs = source === 'file'
            ? (result.fileLogs || [])
            : source === 'memory'
                ? (result.memoryLogs || [])
                : [...(result.memoryLogs || []), ...(result.fileLogs || [])]
                    .sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
        return successResponse(res, {
            ...result,
            logs: selectedLogs,
            total: selectedLogs.length,
            memoryTotal: realtimeLogs.length
        });
    } catch (error) {
        return errorResponse(res, '获取日志失败', 500);
    }
}

/**
 * 清空实时日志
 */
async function clearRealtimeLogs(req, res) {
    try {
        const count = realtimeLogs.length;
        realtimeLogs.length = 0;
        logOperation(req, 'clear_realtime_logs', 'system', null, { clearedCount: count });
        return successResponse(res, { message: '日志已清空' });
    } catch (error) {
        return errorResponse(res, '清空日志失败', 500);
    }
}

/**
 * 按用户ID爬取作品
 */
async function crawlUserWorks(req, res) {
    try {
        const { userId, limit = 100 } = req.body;

        if (!userId) {
            return errorResponse(res, '请提供用户ID', 400);
        }

        logOperation(req, 'crawl_user_works', 'user', userId, { limit });
        
        console.log(`开始爬取用户 ${userId} 的作品...`);
        
        const parsedLimit = parseInt(limit, 10);
        const targetLimit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 100);
        const pageSize = 50;
        let offset = 0;
        let allItems = [];
        
        while (allItems.length < targetLimit) {
            const fetchSize = Math.min(pageSize, targetLimit - allItems.length);
            const worksData = await codemaoApi.getUserWorks(userId, offset, fetchSize);
            
            if (!worksData || !worksData.items || worksData.items.length === 0) {
                break;
            }
            
            allItems = allItems.concat(worksData.items);
            offset += worksData.items.length;
            
            if (worksData.items.length < fetchSize) {
                break;
            }
        }
        
        if (allItems.length === 0) {
            return errorResponse(res, '该用户没有公开作品', 400);
        }
        
        // 用户资料接口目前可能要求登录。先尝试该接口；若没有返回可用资料，
        // 从第一件公开作品详情的 user_info 回退获取作者资料，并缓存该详情供后续爬取复用。
        const prefetchedDetails = new Map();
        let userInfo = await codemaoApi.getUserInfo(userId);
        const hasUsableUserInfo = userInfo && typeof userInfo === 'object'
            && (userInfo.nickname || userInfo.username || userInfo.description || codemaoApi.normalizeCodemaoAvatar(userInfo));
        if (!hasUsableUserInfo) {
            const firstItem = allItems[0];
            const firstDetail = firstItem ? await codemaoApi.getWorkDetail(firstItem.id) : null;
            if (firstDetail?.id) {
                prefetchedDetails.set(String(firstDetail.id), firstDetail);
            }
            const detailAuthor = firstDetail?.user_info;
            if (detailAuthor?.id != null && String(detailAuthor.id) === String(userId)) {
                userInfo = detailAuthor;
                console.log(`[crawlUserWorks] 用户资料接口不可用，已从作品 ${firstDetail.id} 的作者信息回退`);
            } else {
                userInfo = null;
            }
        }

        const safeProfile = await sanitizeCodemaoProfile(
            userInfo?.nickname || userInfo?.username,
            userInfo?.description
        );
        const profileAvatar = codemaoApi.normalizeCodemaoAvatar(userInfo);
        const placeholderNickname = `用户${userId}`;

        let user = await DbAdapter.findOne(User, { where: { codemao_user_id: String(userId) } });
        if (!user) {
            user = await DbAdapter.findOne(User, { where: { username: `codemao_${userId}` } });
        }
        if (!user) {
            try {
                user = await DbAdapter.create(User, {
                    codemao_user_id: String(userId),
                    username: `codemao_${userId}`,
                    email: `codemao_${userId}@example.invalid`,
                    password: PLACEHOLDER_PASSWORD_HASH,
                    nickname: safeProfile.nickname || placeholderNickname,
                    avatar: profileAvatar,
                    bio: safeProfile.bio,
                    role: 'user',
                    status: 'active'
                });
            } catch (createError) {
                console.error('创建用户失败:', createError.message);
                user = await DbAdapter.findOne(User, { where: { username: `codemao_${userId}` } });
            }
        } else if (userInfo) {
            // 再次手动爬取时自动修复此前因资料接口失败产生的占位昵称、空头像和空简介；
            // 已有的非占位资料不覆盖，保留用户或管理员后续修改。
            const profileUpdates = {};
            if (safeProfile.nickname && (!user.nickname || user.nickname === placeholderNickname)) {
                profileUpdates.nickname = safeProfile.nickname;
            }
            if (profileAvatar && !user.avatar) profileUpdates.avatar = profileAvatar;
            if (safeProfile.bio && !user.bio) profileUpdates.bio = safeProfile.bio;
            if (!user.codemao_user_id) profileUpdates.codemao_user_id = String(userId);
            if (Object.keys(profileUpdates).length > 0) {
                await DbAdapter.update(User, profileUpdates, { where: { id: DbAdapter.getId(user) } });
            }
        }
        
        const results = [];
        
        for (const item of allItems) {
            try {
                const existing = await DbAdapter.findOne(Work, { where: { codemao_work_id: item.id } });
                if (existing) continue;
                
                const detailKey = String(item.id);
                const workDetail = prefetchedDetails.get(detailKey) || await codemaoApi.getWorkDetail(item.id);
                prefetchedDetails.delete(detailKey);
                if (!workDetail || !workDetail.id) continue;
                
                // 修复 PII/资源链接泄露: 改用 safeLog 自动脱敏 preview/player_url 等
                safeLog('crawlWorkDetail', {
                    id: workDetail.id,
                    name: workDetail.work_name,
                    preview: workDetail.preview,
                    player_url: workDetail.player_url,
                    ide_type: workDetail.ide_type,
                    type: workDetail.type
                });
                
                let workType = workDetail.type || workDetail.ide_type || 'KITTEN';

                // (报告1 #1) 爬虫落库前对作品名+描述做内容审核，与 workController.publishWork 一致：
                // delete→跳过，review→status:'pending'，pass→status:'published'
                let workStatus = 'published';
                const workReviewText = String(`${workDetail.work_name || ''} ${workDetail.description || ''}`);
                try {
                    const workReviewResult = await aiReview.fallbackReview(workReviewText);
                    if (workReviewResult.recommendation === 'delete') {
                        console.warn(`[crawlUserWorks] 作品 ${workDetail.id} 内容未通过审核，已跳过`);
                        continue;
                    } else if (workReviewResult.recommendation === 'review') {
                        workStatus = 'pending';
                    }
                } catch (reviewErr) {
                    console.error(`[crawlUserWorks] 作品 ${workDetail.id} 内容审核失败:`, reviewErr.message);
                    workStatus = 'pending';
                }

                const work = await DbAdapter.create(Work, {
                    codemao_work_id: String(workDetail.id),
                    name: workDetail.work_name,
                    description: workDetail.description,
                    preview: workDetail.preview,
                    type: workType,
                    // H8修复: 补充 ide_type 字段（与 crawlHotWorks 保持一致）
                    ide_type: workDetail.ide_type || 'KITTEN',
                    // H11修复: work_url 增加 fallback，避免 player_url 为空时作品无法播放
                    work_url: buildCodemaoPlayerUrl({ workId: workDetail.id, playerUrl: workDetail.player_url, type: workDetail.type, ideType: workDetail.ide_type }),
                    user_id: DbAdapter.getId(user),
                    codemao_author_id: String(userId),
                    codemao_author_name: workDetail.user_info?.nickname,
                    view_times: workDetail.view_times || 0,
                    // 中·脏数据: 归 0,与 workController 一致
                    praise_times: 0,
                    collection_times: 0,
                    // Bug-2(脏数据): comment_count 始终从 0 开始
                    comment_count: 0,
                    status: workStatus
                });
                
                // 修复 PII 泄露: 改用 safeLog
                safeLog('crawlWorkCreated', { id: work.id, name: work.name, preview: work.preview });
                results.push(work);
            } catch (e) {
                console.error(`爬取作品 ${item.id} 失败:`, e.message);
            }
        }
        
        // Bug-5 修复: work_count 仅统计 status:'published',与 syncUserWorks/crawlHotWorks 口径一致,
        // 避免把 pending/deleted 作品计入 work_count 导致虚高
        const totalWorkCount = await DbAdapter.count(Work, { where: { user_id: DbAdapter.getId(user), status: 'published' } });
        await DbAdapter.update(User, { work_count: totalWorkCount }, { where: { id: DbAdapter.getId(user) } });
        
        return successResponse(res, { total: results.length }, `成功爬取 ${results.length} 个作品`);
    } catch (error) {
        console.error('爬取用户作品错误:', error);
        return errorResponse(res, '爬取失败', 500);
    }
}

/**
 * 从论坛帖子爬取作品
 */
async function crawlPostWorks(req, res) {
    try {
        const { keyword, limit = 20 } = req.body;

        logOperation(req, 'crawl_post_works', "post", null, { keyword, limit });
        
        const postsData = await codemaoApi.searchPosts(keyword, 1, 50);
        
        if (!postsData || !postsData.items) {
            return errorResponse(res, '搜索帖子失败', 400);
        }
        
        const workIds = new Set();
        const results = [];
        
        for (const post of postsData.items) {
            const matches = post.content?.matchAll(/work\/(\d+)/g);
            if (matches) {
                for (const match of matches) {
                    workIds.add(parseInt(match[1]));
                }
            }
        }
        
        console.log(`从帖子中提取了 ${workIds.size} 个作品ID`);
        
        const parsedLimit = parseInt(limit, 10);
        const targetLimit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 100);

        for (const workId of Array.from(workIds).slice(0, targetLimit)) {
            try {
                const existing = await DbAdapter.findOne(Work, { where: { codemao_work_id: String(workId) } });
                if (existing) continue;
                
                const workDetail = await codemaoApi.getWorkDetail(workId);
                if (!workDetail || !workDetail.id) continue;
                
                const rawAuthorId = workDetail.user_info?.id;
                if (!rawAuthorId) {
                    console.error(`作品 ${workId} 缺少作者信息，跳过`);
                    continue;
                }
                const authorId = String(rawAuthorId);
                let user = await DbAdapter.findOne(User, { where: { codemao_user_id: authorId } });
                if (!user) {
                    user = await DbAdapter.findOne(User, { where: { username: `codemao_${authorId}` } });
                }
                if (!user) {
                    try {
                        // (报告1 #3) 占位用户 nickname/bio 走审核+转义，与 userController.codemaoLogin 一致
                        const safeProfile = await sanitizeCodemaoProfile(
                            workDetail.user_info?.nickname,
                            workDetail.user_info?.description
                        );
                        user = await DbAdapter.create(User, {
                            codemao_user_id: authorId,
                            username: `codemao_${authorId}`,
                            email: `codemao_${authorId}@example.invalid`,
                            password: PLACEHOLDER_PASSWORD_HASH,
                            nickname: safeProfile.nickname || `用户${authorId}`,
                            avatar: workDetail.user_info?.avatar,
                            bio: safeProfile.bio,
                            role: 'user',
                            status: 'active'
                        });
                    } catch (createError) {
                        console.error('创建用户失败:', createError.message);
                        user = await DbAdapter.findOne(User, { where: { username: `codemao_${authorId}` } });
                    }
                }
                
                const workType = workDetail.type || '其他';

                // (报告1 #1) 爬虫落库前对作品名+描述做内容审核，与 workController.publishWork 一致：
                // delete→跳过，review→status:'pending'，pass→status:'published'
                let workStatus = 'published';
                const workReviewText = String(`${workDetail.work_name || ''} ${workDetail.description || ''}`);
                try {
                    const workReviewResult = await aiReview.fallbackReview(workReviewText);
                    if (workReviewResult.recommendation === 'delete') {
                        console.warn(`[crawlPostWorks] 作品 ${workDetail.id} 内容未通过审核，已跳过`);
                        continue;
                    } else if (workReviewResult.recommendation === 'review') {
                        workStatus = 'pending';
                    }
                } catch (reviewErr) {
                    console.error(`[crawlPostWorks] 作品 ${workDetail.id} 内容审核失败:`, reviewErr.message);
                    workStatus = 'pending';
                }

                const work = await DbAdapter.create(Work, {
                    codemao_work_id: String(workDetail.id),
                    name: workDetail.work_name,
                    description: workDetail.description,
                    preview: workDetail.preview,
                    type: workType,
                    // H8修复: 补充 ide_type 字段（与 crawlHotWorks 保持一致）
                    ide_type: workDetail.ide_type || 'KITTEN',
                    // H11修复: work_url 增加 fallback，避免 player_url 为空时作品无法播放
                    work_url: buildCodemaoPlayerUrl({ workId: workDetail.id, playerUrl: workDetail.player_url, type: workDetail.type, ideType: workDetail.ide_type }),
                    user_id: DbAdapter.getId(user),
                    codemao_author_id: String(workDetail.user_info?.id),
                    codemao_author_name: workDetail.user_info?.nickname,
                    view_times: workDetail.view_times || 0,
                    // 中·脏数据: 归 0,与 workController 一致
                    praise_times: 0,
                    collection_times: 0,
                    // Bug-2(脏数据): comment_count 始终从 0 开始
                    comment_count: 0,
                    status: workStatus
                });
                
                results.push(work);
            } catch (e) {
                console.error(`爬取作品 ${workId} 失败:`, e.message);
            }
        }
        
        return successResponse(res, { total: results.length }, `成功爬取 ${results.length} 个作品`);
    } catch (error) {
        console.error('从帖子爬取作品错误', error);
        return errorResponse(res, '爬取失败', 500);
    }
}

async function crawlBanners(req, res) {
    try {
        console.log('开始从编程猫爬取轮播图...');
        
        const bannerData = await codemaoApi.getBanners();
        console.log('API返回数据:', JSON.stringify(bannerData, null, 2));
        
        if (!bannerData) {
            return errorResponse(res, '获取轮播图数据为空', 500);
        }
        
        let items = bannerData.items || bannerData.data || bannerData.banners || bannerData;
        if (!Array.isArray(items)) {
            console.log('数据格式:', typeof items, Object.keys(bannerData));
            return errorResponse(res, '轮播图数据格式不正确', 500);
        }
        
        if (items.length === 0) {
            return errorResponse(res, '没有找到轮播图', 404);
        }
        
        // 先创建新轮播图，成功后再删旧数据，避免外部数据异常导致首页轮播丢失
        const newBanners = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(`处理轮播图${i + 1}:`, item);
            try {
                const rawImageUrl = item.background_url || item.image_url || item.cover || item.picture || item.image || item.src;
                const rawLinkUrl = item.target_url || item.link_url || item.url || item.link || '';
                const imageResult = normalizeHttpUrl(rawImageUrl, { allowEmpty: false, maxLength: 500 });
                const linkResult = normalizeHttpUrl(rawLinkUrl, { allowEmpty: true, maxLength: 500 });
                if (!imageResult.ok || !linkResult.ok) {
                    console.warn(`跳过URL不安全的轮播图${i + 1}`);
                    continue;
                }
                const banner = await DbAdapter.create(Banner, {
                    title: item.title || item.name || item.text || `轮播图${i + 1}`,
                    image_url: imageResult.value,
                    link_url: linkResult.value,
                    sort: i,
                    is_active: true,
                    // H7修复: 标记来源为编程猫爬取，便于后续只清理爬取数据而不误删手工创建的轮播图
                    source: 'codemao'
                });
                newBanners.push(DbAdapter.getId(banner));
            } catch (e) {
                console.error('创建轮播图失败', e.message);
            }
        }

        // 如果新轮播图全部创建失败，不删除旧数据，避免首页轮播丢失
        if (newBanners.length === 0) {
            return errorResponse(res, '轮播图创建全部失败，旧数据已保留', 500);
        }

        // H7修复: 只删除爬取来源(source='codemao')的旧轮播图，保留手工创建(source='manual' 或 null)的轮播图
        // 此前无差别 destroy 会把管理员手工创建的轮播图一并删掉
        await DbAdapter.destroy(Banner, { where: { id: { [Op.notIn]: newBanners }, source: 'codemao' } });
        
        const count = newBanners.length;
        
        logOperation(req, 'crawl_banners', 'banner', null, { count });
        console.log(`爬取轮播图完成，共 ${count} 个`);
        return successResponse(res, { count }, `成功爬取 ${count} 个轮播图`);
    } catch (error) {
        console.error('爬取轮播图错误', error);
        return errorResponse(res, '爬取失败', 500);
    }
}

/**
 * 获取轮播图列表
 */
async function getBanners(req, res) {
    try {
        const banners = await DbAdapter.findAll(Banner, {
            order: [['sort', 'ASC'], ['created_at', 'DESC']]
        });
        return successResponse(res, banners);
    } catch (error) {
        console.error('获取轮播图错误', error);
        return errorResponse(res, '获取轮播图失败', 500);
    }
}

/**
 * 创建轮播图
 */
async function createBanner(req, res) {
    try {
        const { title, image_url, link_url, sort, is_active } = req.body;
        
        if (!image_url) {
            return errorResponse(res, '请提供图片URL', 400);
        }
        const imageResult = normalizeHttpUrl(image_url, { allowEmpty: false, maxLength: 500 });
        if (!imageResult.ok) return errorResponse(res, `轮播图片${imageResult.msg}`, 400);
        const linkResult = normalizeHttpUrl(link_url, { allowEmpty: true, maxLength: 500 });
        if (!linkResult.ok) return errorResponse(res, `轮播链接${linkResult.msg}`, 400);
        
        const banner = await DbAdapter.create(Banner, {
            title,
            image_url: imageResult.value,
            link_url: linkResult.value,
            sort: sort || 0,
            is_active: is_active !== false
        });
        
        logOperation(req, 'create_banner', 'banner', DbAdapter.getId(banner), { title, image_url });
        
        return successResponse(res, banner, '创建成功');
    } catch (error) {
        console.error('创建轮播图错误', error);
        return errorResponse(res, '创建失败', 500);
    }
}

/**
 * 更新轮播图
 */
async function updateBanner(req, res) {
    try {
        const { bannerId } = req.params;
        const { title, image_url, link_url, sort, is_active } = req.body;
        
        const banner = await DbAdapter.findByPk(Banner, bannerId);
        if (!banner) {
            return errorResponse(res, '轮播图不存在', 404);
        }
        
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (image_url !== undefined) {
            const result = normalizeHttpUrl(image_url, { allowEmpty: false, maxLength: 500 });
            if (!result.ok) return errorResponse(res, `轮播图片${result.msg}`, 400);
            updateData.image_url = result.value;
        }
        if (link_url !== undefined) {
            const result = normalizeHttpUrl(link_url, { allowEmpty: true, maxLength: 500 });
            if (!result.ok) return errorResponse(res, `轮播链接${result.msg}`, 400);
            updateData.link_url = result.value;
        }
        if (sort !== undefined) updateData.sort = sort;
        if (is_active !== undefined) updateData.is_active = is_active;
        
        await DbAdapter.update(Banner, updateData, { where: { id: bannerId } });
        
        logOperation(req, 'update_banner', 'banner', bannerId, { title, image_url, link_url });
        
        const updatedBanner = await DbAdapter.findByPk(Banner, bannerId);
        return successResponse(res, updatedBanner, '更新成功');
    } catch (error) {
        console.error('更新轮播图错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 删除轮播图
 */
async function deleteBanner(req, res) {
    try {
        const { bannerId } = req.params;
        
        const banner = await DbAdapter.findByPk(Banner, bannerId);
        if (!banner) {
            return errorResponse(res, '轮播图不存在', 404);
        }
        
        await DbAdapter.destroy(Banner, { where: { id: DbAdapter.getId(banner) } });
        logOperation(req, 'delete_banner', 'banner', bannerId, { title: banner.title });
        
        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除轮播图错误', error);
        return errorResponse(res, '删除失败', 500);
    }
}

/**
 * 获取评论列表
 */
async function getComments(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const keyword = req.query.keyword || '';
        const status = req.query.status || '';
        const userId = req.query.userId || '';
        const workId = req.query.workId || '';

        const where = {};
        
        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['content'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        if (status) where.status = status;
        if (userId) where.user_id = parseInt(userId, 10) || userId;
        if (workId) where.work_id = parseInt(workId, 10) || workId;

        let scopedPostWhere = null;
        if (req.user.role === 'reviewer') {
            where.work_id = { [Op.ne]: null };
        } else if (req.user.role === 'moderator') {
            const boardIds = await getModeratedBoardIds(req.user);
            scopedPostWhere = { board_id: { [Op.in]: boardIds?.length ? boardIds : [-1] } };
            where.post_id = { [Op.ne]: null };
        }

        const { count, rows } = await DbAdapter.findAndCountAll(Comment, {
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'username', 'nickname', 'avatar']
                },
                {
                    model: Work,
                    as: 'work',
                    attributes: ['id', 'name', 'preview', 'codemao_work_id', 'status'],
                    required: false
                },
                {
                    model: Post,
                    as: 'post',
                    attributes: ['id', 'title', 'status'],
                    required: Boolean(scopedPostWhere),
                    ...(scopedPostWhere ? { where: scopedPostWhere } : {})
                },
                {
                    model: User,
                    as: 'reply_to_user',
                    attributes: ['id', 'username', 'nickname'],
                    required: false
                }
            ],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });

        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取评论列表错误:', error);
        return errorResponse(res, '获取评论列表失败', 500);
    }
}

/**
 * 更新评论状态
 */
async function updateCommentStatus(req, res) {
    try {
        const { commentId } = req.params;
        const { status } = req.body;

        if (!['active', 'hidden', 'deleted'].includes(status)) {
            return errorResponse(res, '无效的状态值', 400);
        }

        const comment = await DbAdapter.findByPk(Comment, commentId);
        if (!comment) {
            return errorResponse(res, '评论不存在', 404);
        }

        const oldStatus = comment.status;
        const wasActive = oldStatus === 'active';
        const isActive = status === 'active';
        // Bug-5: 评论状态变更 + 子回复级联 + 计数增减涉及多表,必须用事务包裹
        await sequelize.transaction(async (t) => {
            await DbAdapter.update(Comment, { status }, { where: { id: commentId }, transaction: t });
            // H6修复: 父评论（顶层评论）被 hidden/deleted 时，同步级联子回复状态，避免子回复仍对用户可见
            if (!comment.parent_id && (status === 'hidden' || status === 'deleted')) {
                await DbAdapter.update(Comment, { status }, { where: { parent_id: commentId }, transaction: t });
            }
            // Bug-11: 父评论从 hidden/deleted 恢复为 active 时,同时恢复被级联隐藏(hidden)的子回复,
            // 避免用户看到 comment_count 但看不到回复。仅恢复 hidden 子回复,不恢复被版主独立删除的 deleted 子回复
            if (!comment.parent_id && isActive && !wasActive) {
                await DbAdapter.update(Comment, { status: 'active' }, { where: { parent_id: commentId, status: 'hidden' }, transaction: t });
            }

            // 仅在 active → 非active 时扣减，非active → active 时补回，避免重复扣减
            // （comment_count 仅统计顶层评论，子回复恢复不影响计数）
            if (!comment.parent_id) {
                if (wasActive && !isActive) {
                    // active → hidden/deleted: 扣减
                    if (comment.work_id) {
                        const work = await DbAdapter.findByPk(Work, comment.work_id, { transaction: t });
                        // 原子条件递减：仅当 comment_count > 0 时递减，避免 check-then-decrement 竞态导致负数
                        if (work) await DbAdapter.decrement(work, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                    }
                    if (comment.post_id) {
                        const post = await DbAdapter.findByPk(Post, comment.post_id, { transaction: t });
                        if (post) await DbAdapter.decrement(post, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                    }
                } else if (!wasActive && isActive) {
                    // hidden/deleted → active: 补回
                    if (comment.work_id) {
                        const work = await DbAdapter.findByPk(Work, comment.work_id, { transaction: t });
                        if (work) await DbAdapter.increment(work, 'comment_count', { transaction: t });
                    }
                    if (comment.post_id) {
                        const post = await DbAdapter.findByPk(Post, comment.post_id, { transaction: t });
                        if (post) await DbAdapter.increment(post, 'comment_count', { transaction: t });
                    }
                }
            }
        });

        logOperation(req, 'update_comment_status', 'comment', commentId, { status });

        return successResponse(res, null, '更新成功');
    } catch (error) {
        console.error('更新评论状态错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 删除评论
 */
async function deleteComment(req, res) {
    try {
        const { commentId } = req.params;

        const comment = await DbAdapter.findByPk(Comment, commentId);
        if (!comment) {
            return errorResponse(res, '评论不存在', 404);
        }

        const wasActive = comment.status === 'active';
        // Bug-4: 删除评论涉及多表关联数据(评论软删/子回复软删/点赞清理/计数递减),必须用事务包裹
        // Bug-10: 子回复点赞清理统一用数组形式(Op.in),不使用 Number(commentId)——后者对字符串 ID 返回 NaN
        const { Like } = require('../models');
        await sequelize.transaction(async (t) => {
            await DbAdapter.update(Comment, { status: 'deleted' }, { where: { id: commentId }, transaction: t });

            // 修复: 级联软删所有多级子回复(不只直接子回复),与 commentController 保持一致
            let currentParentIds = [commentId];
            const maxDepth = 100;
            for (let depth = 0; depth < maxDepth && currentParentIds.length > 0; depth++) {
                const children = await DbAdapter.findAll(Comment, {
                    where: { parent_id: { [Op.in]: currentParentIds }, status: { [Op.ne]: 'deleted' } },
                    attributes: ['id'],
                    transaction: t
                });
                if (children.length === 0) break;
                const childIds = children.map(c => DbAdapter.getId(c));
                await DbAdapter.update(Comment, { status: 'deleted' }, {
                    where: { id: { [Op.in]: childIds } },
                    transaction: t
                });
                // 清理子回复的 Like 记录 + 清零 like_count
                await DbAdapter.destroy(Like, { where: { comment_id: { [Op.in]: childIds } }, transaction: t });
                await DbAdapter.update(Comment, { like_count: 0 }, { where: { id: { [Op.in]: childIds } }, transaction: t });
                currentParentIds = childIds;
            }

            // 清理父评论自身的 Like 记录 + 清零 like_count
            await DbAdapter.destroy(Like, { where: { comment_id: commentId }, transaction: t });
            await DbAdapter.update(Comment, { like_count: 0 }, { where: { id: commentId }, transaction: t });

            // 仅在旧状态为 active 且顶层评论时才递减 comment_count，避免 hidden→deleted 重复扣减
            // Bug-1 修复: 改用原子条件 decrement(where:{comment_count:{[Op.gt]:0}}),与其他 controller 统一,
            // 避免 check-then-decrement 竞态导致并发删评论时 comment_count 变负数
            if (wasActive && !comment.parent_id) {
                if (comment.work_id) {
                    const work = await DbAdapter.findByPk(Work, comment.work_id, { transaction: t });
                    if (work) await DbAdapter.decrement(work, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                }
                if (comment.post_id) {
                    const post = await DbAdapter.findByPk(Post, comment.post_id, { transaction: t });
                    if (post) await DbAdapter.decrement(post, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                }
            }
        });

        logOperation(req, 'delete_comment', 'comment', commentId, {
            content: comment.content.substring(0, 100),
            user_id: comment.user_id
        });

        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除评论错误:', error);
        return errorResponse(res, '删除失败', 500);
    }
}

/**
 * 获取举报列表
 */
async function getRoleReportScope(user) {
    if (!['reviewer', 'moderator'].includes(user.role)) return null;
    if (user.role === 'reviewer') {
        const comments = await Comment.findAll({ where: { work_id: { [Op.ne]: null } }, attributes: ['id'], raw: true });
        return { [Op.or]: [{ type: 'work' }, { type: 'comment', target_id: { [Op.in]: comments.length ? comments.map(item => item.id) : [-1] } }] };
    }
    const boardIds = await getModeratedBoardIds(user);
    const posts = await Post.findAll({ where: { board_id: { [Op.in]: boardIds?.length ? boardIds : [-1] } }, attributes: ['id'], raw: true });
    const postIds = posts.map(item => item.id);
    const comments = await Comment.findAll({ where: { post_id: { [Op.in]: postIds.length ? postIds : [-1] } }, attributes: ['id'], raw: true });
    return { [Op.or]: [
        { type: 'post', target_id: { [Op.in]: postIds.length ? postIds : [-1] } },
        { type: 'comment', target_id: { [Op.in]: comments.length ? comments.map(item => item.id) : [-1] } }
    ] };
}

async function canAccessReport(user, report) {
    if (!['reviewer', 'moderator'].includes(user.role)) return true;
    const scope = await getRoleReportScope(user);
    return Boolean(await Report.findOne({ where: { id: report.id, ...scope }, attributes: ['id'] }));
}

async function getReports(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const type = req.query.type || '';
        const status = req.query.status || '';

        const where = {};
        if (type) where.type = type;
        if (status) where.status = status;
        // 修复: 默认排除已合并的举报,避免干扰正常列表
        if (!status) {
            where.status = { [Op.ne]: 'merged' };
        }
        const reportScope = await getRoleReportScope(req.user);
        if (reportScope) where[Op.and] = [reportScope];

        const { count, rows } = await DbAdapter.findAndCountAll(Report, {
            where,
            include: [
                {
                    model: User,
                    as: 'reporter',
                    attributes: ['id', 'username', 'nickname', 'avatar', 'codemao_user_id']
                },
                {
                    model: User,
                    as: 'handler',
                    attributes: ['id', 'username', 'nickname'],
                    required: false
                }
            ],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });

        // 修复: 批量加载目标,避免 N+1 查询(按类型分组一次查完)
        const reportsByType = {};
        rows.forEach(r => {
            if (!reportsByType[r.type]) reportsByType[r.type] = [];
            reportsByType[r.type].push(r);
        });

        for (const [type, reports] of Object.entries(reportsByType)) {
            const targetIds = reports.map(r => Number(r.target_id)).filter(id => !isNaN(id) && id > 0);
            if (targetIds.length === 0) continue;
            let targets = [];
            try {
                if (type === 'work') {
                    targets = await DbAdapter.findAll(Work, { where: { id: { [Op.in]: targetIds } }, attributes: ['id', 'name', 'preview', 'user_id'], include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname', 'codemao_user_id'] }] });
                } else if (type === 'comment') {
                    targets = await DbAdapter.findAll(Comment, { where: { id: { [Op.in]: targetIds } }, attributes: ['id', 'content', 'user_id'], include: [{ model: User, as: 'user', attributes: ['id', 'username', 'nickname', 'codemao_user_id'] }] });
                } else if (type === 'post') {
                    targets = await DbAdapter.findAll(Post, { where: { id: { [Op.in]: targetIds } }, attributes: ['id', 'title', 'content', 'status', 'user_id'], include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname', 'codemao_user_id'] }] });
                } else if (type === 'user') {
                    targets = await DbAdapter.findAll(User, { where: { id: { [Op.in]: targetIds } }, attributes: ['id', 'username', 'nickname', 'avatar', 'codemao_user_id'] });
                }
            } catch (loadErr) {
                console.error(`加载 ${type} 目标失败(load targets):`, loadErr.message);
            }
            const targetMap = new Map(targets.map(t => [Number(DbAdapter.getId(t)), t]));
            reports.forEach(r => {
                const tid = Number(r.target_id);
                r.dataValues.target = targetMap.get(tid) || null;
            });
        }

        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取举报列表错误:', error);
        return errorResponse(res, '获取举报列表失败', 500);
    }
}

/**
 * 处理举报
 */
async function handleReport(req, res) {
    try {
        const { reportId } = req.params;
        const { status, handleNote, takeAction } = req.body;

        const VALID_REPORT_STATUSES = ['pending', 'processing', 'resolved', 'rejected'];
        if (!VALID_REPORT_STATUSES.includes(status)) {
            return errorResponse(res, '无效的状态值', 400);
        }

        const report = await DbAdapter.findByPk(Report, reportId);
        if (!report) {
            return errorResponse(res, '举报不存在', 404);
        }
        if (!await canAccessReport(req.user, report)) return errorResponse(res, '您只能处理职责范围内的举报', 403);

        // 修复: takeAction 时按举报类型校验细粒度权限,防止 reviewer 借举报接口绕过删除/禁用权限
        if (req.body.takeAction && status === 'resolved') {
            const { hasPermission } = require('../config/permissions');
            const permMap = { work: 'work:delete', comment: 'comment:delete', post: 'post:delete', user: 'user:disable' };
            if (permMap[report.type] && !hasPermission(req.user.role, permMap[report.type])) {
                return errorResponse(res, `无权执行此操作,需要 ${permMap[report.type]} 权限`, 403);
            }
        }

        // 修复: 在删除其他举报之前,先从 merged_from_ids 收集所有需要通知的举报人
        // 否则 takeAction 删除同目标举报后,merged_from_ids 指向的记录已不存在,合并来源举报人收不到通知
        const mergedReporterIds = new Set();
        if (report.merged_from_ids) {
            const mergedIds = report.merged_from_ids.split(',').filter(Boolean);
            const mergedReports = await DbAdapter.findAll(Report, {
                where: { id: { [Op.in]: mergedIds } },
                attributes: ['reporter_id']
            });
            mergedReports.forEach(r => mergedReporterIds.add(r.reporter_id));
        }

        // Bug-7: 先执行 takeAction 逻辑（含权限校验），失败/无权时直接返回，不更新举报状态
        // 此前 status update 在最前面执行,若 takeAction 失败或权限被拒会导致举报已标记 resolved 但未实际处理
        let targetOwnerId = null;
        const typeNames = { work: '作品', comment: '评论', post: '帖子', user: '用户' };

        if (takeAction && status === 'resolved') {
            if (report.type === 'work') {
                const work = await DbAdapter.findByPk(Work, report.target_id);
                if (work) {
                    targetOwnerId = work.user_id;
                    // BOLA 防御: 校验内容所有者角色,与 aiAutoHandleReports 保持一致
                    // 低权限管理员不能通过举报机制删除高权限用户的内容
                    if (targetOwnerId) {
                        const owner = await DbAdapter.findByPk(User, targetOwnerId, { attributes: ['role'] });
                        if (owner && !canManageUser(req.user.role, owner.role)) {
                            return errorResponse(res, '无权处理该内容所有者的内容', 403);
                        }
                    }
                    const wid = report.target_id;
                    const { Like, Favorite, Comment, StudioWork, Notification, Report: ReportModel } = require('../models');
                    // L4: 多表关联清理用事务包裹，Comment 软删保留历史可追溯
                    // Bug-2: 删除作品时清零 praise_times/collection_times/comment_count,与 adminController.deleteWork 一致
                    // Bug-3: 清理针对该作品的 Report 记录 + 重算作者 work_count,与 adminController.deleteWork 一致
                    await sequelize.transaction(async (t) => {
                        const affectedStudioWorks = await DbAdapter.findAll(StudioWork, {
                            where: { work_id: wid, status: 'approved' },
                            attributes: ['studio_id'],
                            transaction: t
                        });
                        const affectedStudioIds = [...new Set(affectedStudioWorks.map(sw => sw.studio_id))];

                        await DbAdapter.destroy(Notification, { where: { related_id: wid, related_type: 'work' }, transaction: t });
                        await DbAdapter.destroy(StudioWork, { where: { work_id: wid }, transaction: t });
                        // Bug-3: 清理针对该作品的其他 Report 记录,避免 pending report 变悬空
                        // 修复: 排除当前 reportId,保留当前举报记录作为审核审计资料,否则后续 update 会无效
                        await DbAdapter.destroy(ReportModel, { where: { type: 'work', target_id: wid, id: { [Op.ne]: reportId } }, transaction: t });
                        await DbAdapter.destroy(Like, { where: { work_id: wid }, transaction: t });
                        await DbAdapter.destroy(Favorite, { where: { work_id: wid }, transaction: t });
                        await DbAdapter.update(Comment, { status: 'deleted' }, { where: { work_id: wid }, transaction: t });
                        // Bug-2: 清零计数字段,与 adminController.deleteWork 一致
                        await DbAdapter.update(Work, { status: 'deleted', praise_times: 0, collection_times: 0, comment_count: 0 }, { where: { id: wid }, transaction: t });

                        // 修复: 重算受影响工作室的 work_count 和 total_score
                        for (const sid of affectedStudioIds) {
                            const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: sid, status: 'approved' }, transaction: t });
                            const totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: sid, status: 'approved' }, transaction: t }) || 0;
                            await DbAdapter.update(Studio, { work_count: approvedCount, total_score: totalScore }, { where: { id: sid }, transaction: t });
                        }

                        // Bug-3: 重算作者 work_count,仅统计 published,与 adminController.deleteWork 一致
                        if (targetOwnerId != null) {
                            const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: targetOwnerId, status: 'published' }, transaction: t });
                            await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: targetOwnerId }, transaction: t });
                        }
                    });
                }
            } else if (report.type === 'comment') {
                const comment = await DbAdapter.findByPk(Comment, report.target_id);
                if (comment) {
                    targetOwnerId = comment.user_id;
                    // BOLA 防御: 校验内容所有者角色,与 aiAutoHandleReports 保持一致
                    if (targetOwnerId) {
                        const owner = await DbAdapter.findByPk(User, targetOwnerId, { attributes: ['role'] });
                        if (owner && !canManageUser(req.user.role, owner.role)) {
                            return errorResponse(res, '无权处理该内容所有者的内容', 403);
                        }
                    }
                    const wasActive = comment.status === 'active';
                    const isTopLevel = !comment.parent_id;
                    const { Like, Report: ReportModel } = require('../models');
                    await sequelize.transaction(async (t) => {
                        await DbAdapter.update(Comment, { status: 'deleted' }, { where: { id: report.target_id }, transaction: t });
                        // Bug-1: 清理该评论相关的其他 Report 记录(type='comment', target_id=评论ID)
                        // 与 work 分支清理 work Report 的逻辑对齐
                        // 修复: 排除当前 reportId,保留当前举报记录作为审核审计资料
                        await DbAdapter.destroy(ReportModel, { where: { type: 'comment', target_id: report.target_id, id: { [Op.ne]: reportId } }, transaction: t });

                        // 修复: 级联软删所有多级子回复(不只直接子回复),与 commentController 保持一致
                        let currentParentIds = [report.target_id];
                        const maxDepth = 100;
                        for (let depth = 0; depth < maxDepth && currentParentIds.length > 0; depth++) {
                            const children = await DbAdapter.findAll(Comment, {
                                where: { parent_id: { [Op.in]: currentParentIds }, status: { [Op.ne]: 'deleted' } },
                                attributes: ['id'],
                                transaction: t
                            });
                            if (children.length === 0) break;
                            const childIds = children.map(c => DbAdapter.getId(c));
                            await DbAdapter.update(Comment, { status: 'deleted' }, {
                                where: { id: { [Op.in]: childIds } },
                                transaction: t
                            });
                            await DbAdapter.destroy(Like, { where: { comment_id: { [Op.in]: childIds } }, transaction: t });
                            await DbAdapter.update(Comment, { like_count: 0 }, { where: { id: { [Op.in]: childIds } }, transaction: t });
                            currentParentIds = childIds;
                        }

                        // 清理父评论自身的 Like 记录 + 清零 like_count
                        await DbAdapter.destroy(Like, { where: { comment_id: report.target_id }, transaction: t });
                        await DbAdapter.update(Comment, { like_count: 0 }, { where: { id: report.target_id }, transaction: t });

                        // Bug-3: 仅在旧状态为 active 且顶层评论时才递减 comment_count
                        if (wasActive && isTopLevel) {
                            if (comment.work_id) {
                                const work = await DbAdapter.findByPk(Work, comment.work_id, { transaction: t });
                                if (work) {
                                    // 原子递减并重算确保一致
                                    await DbAdapter.decrement(work, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                                }
                            }
                            if (comment.post_id) {
                                const post = await DbAdapter.findByPk(Post, comment.post_id, { transaction: t });
                                if (post) {
                                    await DbAdapter.decrement(post, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                                }
                            }
                        }
                    });
                }
            } else if (report.type === 'post') {
                const post = await DbAdapter.findByPk(Post, report.target_id);
                if (post) {
                    targetOwnerId = post.user_id;
                    // BOLA 防御: 校验内容所有者角色,与 aiAutoHandleReports 保持一致
                    if (targetOwnerId) {
                        const owner = await DbAdapter.findByPk(User, targetOwnerId, { attributes: ['role'] });
                        if (owner && !canManageUser(req.user.role, owner.role)) {
                            return errorResponse(res, '无权处理该内容所有者的内容', 403);
                        }
                    }
                    const pid = report.target_id;
                    const { Like, Favorite, Comment, Notification } = require('../models');
                    await sequelize.transaction(async (t) => {
                        await DbAdapter.destroy(Notification, { where: { related_id: pid, related_type: 'post' }, transaction: t });
                        // Bug-2: 清理挂在帖子评论上的 Like(comment_id),与 work 分支保持一致
                        const postComments = await DbAdapter.findAll(Comment, {
                            where: { post_id: pid },
                            attributes: ['id'],
                            transaction: t
                        });
                        const commentIds = postComments.map(c => DbAdapter.getId(c));
                        if (commentIds.length > 0) {
                            await DbAdapter.destroy(Like, { where: { comment_id: { [Op.in]: commentIds } }, transaction: t });
                        }
                        await DbAdapter.destroy(Like, { where: { post_id: pid }, transaction: t });
                        await DbAdapter.destroy(Favorite, { where: { post_id: pid }, transaction: t });
                        await DbAdapter.update(Comment, { status: 'deleted' }, { where: { post_id: pid }, transaction: t });
                        await DbAdapter.update(Post, { status: 'deleted', like_count: 0, collection_count: 0, comment_count: 0 }, { where: { id: pid }, transaction: t });
                    });
                }
            } else if (report.type === 'user') {
                // H14: 处理用户举报前必须校验权限，低权限管理员不能通过举报机制禁用高权限用户
                const targetUser = await DbAdapter.findByPk(User, report.target_id);
                if (!targetUser) {
                    return errorResponse(res, '目标用户不存在(可能已删除)', 404);
                }
                // Bug-4: 检查用户状态,已 disabled 的用户无需重复操作
                if (targetUser.status === 'disabled') {
                    return errorResponse(res, '该用户已被禁用', 400);
                }
                if (!canManageUser(req.user.role, targetUser.role)) {
                    return errorResponse(res, '无权处理该用户', 403);
                }
                targetOwnerId = report.target_id;
                await DbAdapter.update(User, { status: 'disabled' }, { where: { id: report.target_id } });
            }
        }

        // Bug-7: takeAction 成功后才更新举报状态（移到此处），避免权限被拒或处理失败时举报已标记 resolved
        await DbAdapter.update(Report, {
            status,
            handle_note: handleNote,
            handler_id: DbAdapter.getId(req.user)
        }, { where: { id: reportId } });
        // 写入审计日志
        await addReportAuditLog(reportId, DbAdapter.getId(req.user), 'human', `处理为${status}`, handleNote || null);
        logOperation(req, 'handle_report', 'report', reportId, { status, handleNote, takeAction });

        let targetName = '';
        let linkType = report.type;
        let linkId = report.target_id;

        const target = await (async () => {
            if (report.type === 'work') return await DbAdapter.findByPk(Work, report.target_id);
            if (report.type === 'comment') return await DbAdapter.findByPk(Comment, report.target_id);
            if (report.type === 'post') return await DbAdapter.findByPk(Post, report.target_id);
            if (report.type === 'user') return await DbAdapter.findByPk(User, report.target_id);
            return null;
        })();

        if (target) {
            if (report.type === 'work') {
                targetName = target.name;
                linkId = target.codemao_work_id || target.id;
            }
            else if (report.type === 'post') targetName = target.title;
            else if (report.type === 'comment') {
                targetName = target.content.substring(0, 20) + (target.content.length > 20 ? '...' : '');
                if (target.work_id) {
                    linkType = 'work';
                    const work = await DbAdapter.findByPk(Work, target.work_id);
                    linkId = work ? (work.codemao_work_id || work.id) : target.work_id;
                }
                else if (target.post_id) { linkType = 'post'; linkId = target.post_id; }
            }
            else if (report.type === 'user') targetName = target.nickname || target.username;
        }

        // 发送举报处理结果通知给举报者
        const { Notification } = require('../models');
        const statusText = status === 'resolved' ? '已处理' : (status === 'rejected' ? '已驳回' : '处理中');
        // 修复: 仅通知主举报人 + 合并来源的举报人;不通知同目标其他独立 pending 举报人(避免状态不一致)
        // mergedReporterIds 已在 takeAction 删除其他举报之前收集,确保通知不丢失
        const notifyReporterIds = new Set([report.reporter_id, ...mergedReporterIds]);

        // 通知所有需通知的举报人(主举报人 + 合并来源)
        for (const reporterId of notifyReporterIds) {
            try {
                await DbAdapter.create(Notification, {
                    user_id: reporterId,
                    type: 'system',
                    title: `举报${statusText}`,
                    content: `您举报的${typeNames[report.type]}「${targetName}」${statusText}，${handleNote ? '处理说明：' + handleNote : ''}`,
                    related_id: linkId,
                    related_type: linkType
                });
            } catch (notifyErr) {
                console.error(`发送举报处理通知给用户 ${reporterId} 失败:`, notifyErr.message);
            }
        }

        // 如果采取了行动，通知被处理的用户
        if (takeAction && status === 'resolved' && targetOwnerId) {
            try {
                await DbAdapter.create(Notification, {
                    user_id: targetOwnerId,
                    type: 'system',
                    title: `您的${typeNames[report.type]}已被处理`,
                    content: `您的${typeNames[report.type]}「${targetName}」因违反社区规范已被处理。${handleNote ? '处理说明：' + handleNote : '如有疑问请联系管理员。'}`,
                    related_id: linkId,
                    related_type: linkType
                });
            } catch (notifyErr) {
                console.error('发送被处理用户通知失败:', notifyErr.message);
            }
        }

        return successResponse(res, null, '处理成功');
    } catch (error) {
        console.error('处理举报错误:', error);
        return errorResponse(res, '处理失败', 500);
    }
}

/**
 * 获取重复举报分组
 * 找出同一目标(type+target_id)被多次举报的待处理举报组
 * 每组包含合并后的原因、举报人数、所有举报ID
 */
async function getDuplicateReportGroups(req, res) {
    try {
        const { type } = req.query;
        const where = { status: 'pending' };
        if (type) where.type = type;

        const reports = await DbAdapter.findAll(Report, {
            where,
            attributes: ['id', 'type', 'target_id', 'reason', 'reporter_id', 'created_at'],
            order: [['target_id', 'ASC'], ['created_at', 'ASC']]
        });

        // 按 type + target_id 分组
        const groups = {};
        for (const r of reports) {
            const key = `${r.type}:${r.target_id}`;
            if (!groups[key]) {
                groups[key] = {
                    type: r.type,
                    target_id: r.target_id,
                    reportIds: [],
                    reasons: [],
                    reporterIds: [],
                    count: 0,
                    earliest: r.created_at
                };
            }
            groups[key].reportIds.push(r.id);
            groups[key].reasons.push(r.reason);
            groups[key].reporterIds.push(r.reporter_id);
            groups[key].count++;
            if (r.created_at < groups[key].earliest) groups[key].earliest = r.created_at;
        }

        // 只保留 count > 1 的组,按数量降序
        const duplicates = Object.values(groups)
            .filter(g => g.count > 1)
            .sort((a, b) => b.count - a.count);

        return successResponse(res, { groups: duplicates, total: duplicates.length });
    } catch (error) {
        console.error('获取重复举报错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

/**
 * 合并重复举报
 * 将同一目标的多条待处理举报合并为一条,保留所有原因和举报人
 * 合并后只保留主报告,其余标记为已合并(merged)
 */
async function mergeReports(req, res) {
    try {
        const { reportIds } = req.body;
        if (!Array.isArray(reportIds) || reportIds.length < 2) {
            return errorResponse(res, '至少选择2条举报才能合并', 400);
        }

        const reports = await DbAdapter.findAll(Report, {
            where: { id: { [Op.in]: reportIds }, status: 'pending' }
        });

        if (reports.length < 2) {
            return errorResponse(res, '所选举报不足2条待处理', 400);
        }

        // 验证所有报告都是同一目标
        const firstTarget = `${reports[0].type}:${reports[0].target_id}`;
        if (!reports.every(r => `${r.type}:${r.target_id}` === firstTarget)) {
            return errorResponse(res, '只能合并同一目标的举报', 400);
        }

        // 以最早创建的为主报告
        const primary = reports.reduce((a, b) => a.created_at < b.created_at ? a : b);
        const others = reports.filter(r => r.id !== primary.id);

        // 合并所有原因(去重)
        const allReasons = [...new Set(reports.map(r => r.reason).filter(Boolean))];
        const mergedReason = allReasons.length > 0
            ? `[合并${reports.length}条] ${allReasons.join(' | ')}`
            : primary.reason;

        // 在主报告的 handle_note 中记录合并信息
        const mergeInfo = `\n[${new Date().toISOString()}] 合并了 ${reports.length} 条举报,举报人: ${[...new Set(reports.map(r => r.reporter_id))].join(',')}`;

        // 修复: 整个合并过程放入事务,避免半合并状态
        await sequelize.transaction(async (t) => {
            await DbAdapter.update(Report, {
                reason: mergedReason,
                handle_note: (primary.handle_note || '') + mergeInfo,
                merged_from_ids: others.map(r => r.id).join(',')
            }, { where: { id: primary.id }, transaction: t });

            // 将其他报告标记为已合并(仅更新仍为 pending 的,避免误改已处理的)
            const [affectedCount] = await DbAdapter.update(Report, {
                status: 'merged',
                handle_note: `已合并到举报 #${primary.id}`
            }, { where: { id: { [Op.in]: others.map(r => r.id) }, status: 'pending' }, transaction: t });

            // 修复: 验证受影响行数,若不一致说明有举报已被其他管理员处理,回滚事务
            if (affectedCount !== others.length) {
                throw new Error(`合并冲突: 预期合并 ${others.length} 条,实际更新 ${affectedCount} 条(部分举报可能已被其他管理员处理)`);
            }
        });

        logOperation(req, 'merge_reports', 'report', primary.id, {
            mergedCount: reports.length,
            reportIds
        });
        // 合并审计日志: 为主报告和每条被合并报告都写入记录
        await addReportAuditLog(primary.id, DbAdapter.getId(req.user), 'human', '合并举报', `合并了 ${reports.length} 条重复举报`);
        for (const oId of others) {
            await addReportAuditLog(oId, DbAdapter.getId(req.user), 'human', '被合并', `合并到主举报 #${primary.id}`);
        }

        return successResponse(res, { primaryId: primary.id, mergedCount: reports.length }, `已合并 ${reports.length} 条举报`);
    } catch (error) {
        console.error('合并举报错误:', error);
        return errorResponse(res, '合并失败', 500);
    }
}

/**
 * 写入举报审计日志
 */
async function addReportAuditLog(reportId, handlerId, handlerType, action, note, transaction) {
    await DbAdapter.create(ReportAuditLog, {
        report_id: reportId,
        handler_id: handlerId,
        handler_type: handlerType,
        action,
        note
    }, transaction ? { transaction } : {});
}

/**
 * 获取举报审计日志(处理记录)
 */
async function getReportAuditLogs(req, res) {
    try {
        const { reportId } = req.params;
        const logs = await DbAdapter.findAll(ReportAuditLog, {
            where: { report_id: reportId },
            include: [{ model: User, as: 'handler', attributes: ['id', 'nickname', 'username', 'avatar'] }],
            order: [['created_at', 'ASC']]
        });
        return successResponse(res, logs);
    } catch (error) {
        console.error('获取举报审计日志错误:', error);
        return errorResponse(res, '获取处理记录失败', 500);
    }
}

/**
 * 获取代理配置
 */
async function getProxyConfig(req, res) {
    await proxyService.loadConfig();
    return successResponse(res, proxyService.getStatus());
}

/**
 * 更新代理配置
 */
async function updateProxyConfig(req, res) {
    try {
        const { enabled, poolUrl, protocol, autoRefresh } = req.body;
        // 顺序: URL/协议/自动刷新先写入，最后处理 enabled，以便 setEnabled 能读到最新配置
        if (poolUrl !== undefined) await proxyService.setPoolUrl(poolUrl);
        if (protocol !== undefined) await proxyService.setProtocol(protocol || '');
        if (autoRefresh !== undefined) await proxyService.setAutoRefresh(autoRefresh);
        if (enabled !== undefined) await proxyService.setEnabled(!!enabled);
        return successResponse(res, proxyService.getStatus(), '代理配置已更新');
    } catch (error) {
        console.error('更新代理配置错误:', error);
        return errorResponse(res, '更新失败: ' + error.message, 500);
    }
}

/**
 * 测试代理
 */
async function testProxy(req, res) {
    try {
        const { proxyUrl } = req.body;
        if (!proxyUrl) {
            const result = await proxyService.testCurrentProxy();
            return successResponse(res, result);
        }
        const result = await proxyService.testProxy(proxyUrl);
        return successResponse(res, { proxyUrl, ...result });
    } catch (error) {
        console.error('代理测试错误:', error);
        return errorResponse(res, '测试失败: ' + error.message, 500);
    }
}

/**
 * 从代理池刷新
 */
async function refreshProxy(req, res) {
    try {
        const result = await proxyService.refreshFromPool();
        await proxyService.loadConfig();
        return successResponse(res, result, `已刷新代理: ${result.host}:${result.port}`);
    } catch (error) {
        console.error('代理刷新错误:', error);
        return errorResponse(res, '刷新失败: ' + error.message, 500);
    }
}

/**
 * 获取IP封禁列表
 */
async function getIpBans(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);

        const where = {};
        // L9: 默认过滤已过期的临时封禁(expires_at 非空且早于当前时间)，可通过 ?includeExpired=1 查看全部
        const includeExpired = req.query.includeExpired === '1' || req.query.includeExpired === 'true';
        if (!includeExpired) {
            where[Op.or] = [
                { expires_at: null },
                { expires_at: { [Op.gt]: new Date() } }
            ];
        }

        const { count, rows } = await DbAdapter.findAndCountAll(IpBan, {
            where,
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset,
            include: [{ model: User, as: 'bannedByUser', attributes: ['id', 'username', 'nickname'] }]
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取IP封禁列表错误:', error);
        return errorResponse(res, '获取IP封禁列表失败', 500);
    }
}

/**
 * 添加IP封禁
 */
async function addIpBan(req, res) {
    try {
        const { ip_address, reason, expires_at } = req.body;

        if (!ip_address) {
            return errorResponse(res, '请提供IP地址', 400);
        }

        const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
        const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
        if (!IPV4_REGEX.test(ip_address) && !IPV6_REGEX.test(ip_address)) {
            return errorResponse(res, 'IP地址格式无效', 400);
        }

        // IPv4 各段必须在0~255 范围内
        if (IPV4_REGEX.test(ip_address)) {
            const parts = ip_address.split('.').map(Number);
            if (parts.some(p => p > 255)) {
                return errorResponse(res, 'IP地址格式无效', 400);
            }
        }

        const existing = await DbAdapter.findOne(IpBan, { where: { ip: ip_address } });
        if (existing) {
            return errorResponse(res, '该IP已被封禁', 400);
        }

        const ipBan = await DbAdapter.create(IpBan, {
            ip: ip_address,
            reason,
            banned_by: DbAdapter.getId(req.user),
            expires_at: expires_at ? new Date(expires_at) : null
        });
        // 修复: 封禁后立即失效缓存,确保新封禁的 IP 在下一次请求就被拦截
        const { invalidateIpBanCache } = require('../middleware/ipBan');
        invalidateIpBanCache(ip_address);
        logOperation(req, 'add_ip_ban', 'ip_ban', DbAdapter.getId(ipBan), { ip: ip_address, reason });

        return successResponse(res, ipBan, '封禁成功');
    } catch (error) {
        console.error('添加IP封禁错误:', error);
        return errorResponse(res, '封禁失败', 500);
    }
}

/**
 * 解除IP封禁
 */
async function removeIpBan(req, res) {
    try {
        const { ipBanId } = req.params;

        const ipBan = await DbAdapter.findByPk(IpBan, ipBanId);
        if (!ipBan) {
            return errorResponse(res, '封禁记录不存在', 404);
        }

        await DbAdapter.destroy(IpBan, { where: { id: DbAdapter.getId(ipBan) } });
        // 修复: 解封后立即失效缓存,确保被解封的 IP 在下一次请求就能正常访问
        const { invalidateIpBanCache } = require('../middleware/ipBan');
        invalidateIpBanCache(ipBan.ip);
        logOperation(req, 'remove_ip_ban', 'ip_ban', ipBanId, { ip: ipBan.ip });

        return successResponse(res, null, '解除封禁成功');
    } catch (error) {
        console.error('解除IP封禁错误:', error);
        return errorResponse(res, '解除封禁失败', 500);
    }
}

/**
 * 获取数据趋势
 */
async function getTrends(req, res) {
    try {
        // H13修复: days 限制在 1~90 之间，避免传入超大值导致循环过多或负值异常
        const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
        const result = {
            users: [],
            works: [],
            comments: [],
            dates: []
        };

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            result.dates.push(date.toISOString().split('T')[0]);
            result.users.push(await DbAdapter.count(User, {
                where: { created_at: { [Op.gte]: date, [Op.lt]: nextDate } }
            }));
            result.works.push(await DbAdapter.count(Work, {
                where: { created_at: { [Op.gte]: date, [Op.lt]: nextDate } }
            }));
            result.comments.push(await DbAdapter.count(Comment, {
                where: { created_at: { [Op.gte]: date, [Op.lt]: nextDate } }
            }));
        }

        return successResponse(res, result);
    } catch (error) {
        console.error('获取数据趋势错误:', error);
        return errorResponse(res, '获取数据趋势失败', 500);
    }
}

/**
 * 获取所有角色
 */
async function getRoles(req, res) {
    try {
        const roles = getAllRoles();
        return successResponse(res, roles);
    } catch (error) {
        console.error('获取角色错误:', error);
        return errorResponse(res, '获取角色失败', 500);
    }
}

/**
 * 获取管理员列表
 */
async function getAdminUsers(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const role = req.query.role;
        
        const where = {};
        if (role) {
            where.role = role;
        } else {
            where.role = { [Op.ne]: 'user' };
        }
        
        const { count, rows } = await DbAdapter.findAndCountAll(User, {
            where,
            attributes: ['id', 'username', 'nickname', 'avatar', 'role', 'status', 'created_at'],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取管理员列表错误', error);
        return errorResponse(res, '获取失败', 500);
    }
}

// ==================== 公告管理 ====================

async function getAnnouncements(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        
        const { count, rows } = await DbAdapter.findAndCountAll(Announcement, {
            order: [['created_at', 'DESC']],
            include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname'] }],
            limit: pageSize,
            offset
        });
        
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取公告错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

async function createAnnouncement(req, res) {
    try {
        const { title, content, type, is_active, color, show_top_bar, show_popup, show_community } = req.body;

        // (报告1 #13) 先 trim 再校验非空/长度，避免纯空白标题/内容绕过校验，并落库规范化文本
        const trimmedTitle = title != null ? String(title).trim() : '';
        const trimmedContent = content != null ? String(content).trim() : '';

        if (!trimmedTitle || !trimmedContent) {
            return errorResponse(res, '标题和内容不能为空', 400);
        }

        if (trimmedTitle.length > 200) {
            return errorResponse(res, '标题不能超过200字', 400);
        }

        if (trimmedContent.length > 10000) {
            return errorResponse(res, '内容不能超过10000字', 400);
        }

        const allowedTypes = ['notice', 'update', 'warning'];
        const allowedColors = ['blue', 'green', 'orange', 'red', 'purple', 'yellow'];
        const finalType = allowedTypes.includes(type) ? type : 'notice';
        const finalColor = allowedColors.includes(color) ? color : 'blue';
        const toBool = (v, defaultValue) => {
            if (v === undefined || v === null || v === '') return defaultValue;
            if (v === false || v === 0 || v === '0' || v === 'false' || v === 'off') return false;
            return true;
        };

        const announcement = await DbAdapter.create(Announcement, {
            title: trimmedTitle,
            content: trimmedContent,
            type: finalType,
            color: finalColor,
            show_top_bar: toBool(show_top_bar, true),
            show_popup: toBool(show_popup, false),
            show_community: toBool(show_community, true),
            is_active: toBool(is_active, true),
            author_id: req.user?.id || null
        });

        logOperation(req, 'create_announcement', 'announcement', DbAdapter.getId(announcement), { title: trimmedTitle, type: finalType, color: finalColor, content: trimmedContent?.slice(0, 100) });
        return successResponse(res, announcement, '创建成功');
    } catch (error) {
        console.error('创建公告错误:', error);
        return errorResponse(res, '创建失败', 500);
    }
}

async function updateAnnouncement(req, res) {
    try {
        const { announcementId } = req.params;
        const { title, content, type, is_active, color, show_top_bar, show_popup, show_community } = req.body;

        const announcement = await DbAdapter.findByPk(Announcement, announcementId);
        if (!announcement) {
            return errorResponse(res, '公告不存在', 404);
        }

        const allowedTypes = ['notice', 'update', 'warning'];
        const allowedColors = ['blue', 'green', 'orange', 'red', 'purple', 'yellow'];
        const toBool = (v) => {
            if (v === false || v === 0 || v === '0' || v === 'false' || v === 'off') return false;
            return true;
        };

        const updateData = {};
        if (title !== undefined) {
            const t = String(title).trim();
            if (t.length === 0) return errorResponse(res, '标题不能为空', 400);
            if (t.length > 200) return errorResponse(res, '标题不能超过200字', 400);
            updateData.title = t;
        }
        if (content !== undefined) {
            const c = String(content).trim();
            if (c.length === 0) return errorResponse(res, '内容不能为空', 400);
            if (c.length > 10000) return errorResponse(res, '内容不能超过10000字', 400);
            updateData.content = c;
        }
        if (type !== undefined) {
            if (!allowedTypes.includes(type)) {
                return errorResponse(res, '无效的公告类型', 400);
            }
            updateData.type = type;
        }
        if (color !== undefined) {
            if (!allowedColors.includes(color)) {
                return errorResponse(res, '无效的公告颜色', 400);
            }
            updateData.color = color;
        }
        if (show_top_bar !== undefined) updateData.show_top_bar = toBool(show_top_bar);
        if (show_popup !== undefined) updateData.show_popup = toBool(show_popup);
        if (show_community !== undefined) updateData.show_community = toBool(show_community);
        if (is_active !== undefined) updateData.is_active = toBool(is_active);

        await DbAdapter.update(Announcement, updateData, { where: { id: announcementId } });
        logOperation(req, 'update_announcement', 'announcement', announcementId, {
            title: updateData.title || announcement.title,
            changes: updateData
        });

        const updatedAnnouncement = await DbAdapter.findByPk(Announcement, announcementId);
        return successResponse(res, updatedAnnouncement, '更新成功');
    } catch (error) {
        console.error('更新公告错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function deleteAnnouncement(req, res) {
    try {
        const { announcementId } = req.params;
        
        const announcement = await DbAdapter.findByPk(Announcement, announcementId);
        if (!announcement) {
            return errorResponse(res, '公告不存在', 404);
        }
        
        await DbAdapter.destroy(Announcement, { where: { id: DbAdapter.getId(announcement) } });
        logOperation(req, 'delete_announcement', 'announcement', announcementId, { title: announcement?.title });
        
        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除公告错误:', error);
        return errorResponse(res, '删除失败', 500);
    }
}

// ==================== 系统设置 ====================

function updateEnvVariable(content, key, value) {
    const safeValue = String(value ?? '');
    if (/[\r\n\0]/.test(safeValue)) {
        const error = new Error(`${key} 包含非法换行字符`);
        error.statusCode = 400;
        throw error;
    }
    const escapedValue = safeValue.replace(/(["\\])/g, '\\$1');
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedKey}=.*$`, 'gm');
    return regex.test(content)
        ? content.replace(regex, `${key}="${escapedValue}"`)
        : `${content}${content && !content.endsWith('\n') ? '\n' : ''}${key}="${escapedValue}"`;
}

function redactConfigDetails(configs = {}) {
    const redacted = {};
    for (const [key, value] of Object.entries(configs)) {
        redacted[key] = /password|secret|token|api[_-]?key|auth/i.test(key) ? '***' : value;
    }
    return redacted;
}

async function getSystemConfigs(req, res) {
    try {
        const configs = await DbAdapter.findAll(SystemConfig, {});
        // 修复: 统一小写 + 正则匹配,覆盖所有 password/secret/token/key 类配置
        const isSensitive = (key) => /password|secret|token|api[_-]?key|auth/i.test(key);
        const result = {};
        configs.forEach(c => {
            if (isSensitive(c.config_key)) {
                result[c.config_key] = c.config_value ? '******' : '';
            } else {
                result[c.config_key] = c.config_value;
            }
        });
        return successResponse(res, result);
    } catch (error) {
        console.error('获取系统设置错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

async function updateSystemConfig(req, res) {
    try {
        const { key } = req.params;
        const { value } = req.body;

        // 修复 M11：单项配置更新也使用白名单校验，与 batchUpdateConfigs 一致，
        // 避免任意 key 写入 system_configs 表污染配置
        const ALLOWED_CONFIG_KEYS = [
            'ai_enabled', 'ai_api_url', 'ai_api_key', 'ai_model', 'ai_prompt',
            'hcaptcha_enabled', 'hcaptcha_site_key', 'hcaptcha_secret_key', 'hcaptcha_expire_minutes',
            'geetest_enabled', 'geetest_id', 'geetest_key', 'geetest_product',
            'geetest_login', 'geetest_register', 'geetest_like', 'geetest_comment', 'geetest_reply',
            'geetest_report', 'geetest_publish_work', 'geetest_publish_post', 'geetest_favorite',
            'geetest_remove_favorite', 'geetest_update_profile', 'geetest_create_studio',
            'geetest_join_studio', 'geetest_submit_work', 'geetest_review_member', 'geetest_studio_management', 'geetest_developer_app',
            'geetest_im_message', 'geetest_im_search', 'geetest_im_create_group',
            'sensitive_check_mode',
            'sensitive_api_enabled', 'sensitive_api_url', 'sensitive_api_key',
            'db_type', 'db_path', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password',
            'mysql_host', 'mysql_port', 'mysql_database', 'mysql_username', 'mysql_password',
            'proxy_enabled', 'proxy_pool_url', 'proxy_current', 'proxy_protocol', 'proxy_auto_refresh',
            'mobile_android_min_version', 'mobile_android_latest_version', 'mobile_android_update_url', 'mobile_android_update_message'
        ];
        if (!ALLOWED_CONFIG_KEYS.includes(key)) {
            return errorResponse(res, `不支持的配置项: ${key}`, 400);
        }

        if (['mobile_android_min_version', 'mobile_android_latest_version'].includes(key) && !/^\d+\.\d+\.\d+$/.test(String(value))) return errorResponse(res, '版本号必须是 x.y.z 格式', 400);
        if (key === 'mobile_android_update_url' && !/^https:\/\//i.test(String(value))) return errorResponse(res, 'App 更新地址必须使用 HTTPS', 400);
        let config = await DbAdapter.findOne(SystemConfig, { where: { config_key: key } });
        if (config) {
            await DbAdapter.update(SystemConfig, { config_value: value }, { where: { config_key: key } });
        } else {
            config = await DbAdapter.create(SystemConfig, { config_key: key, config_value: value });
        }

        // 敏感配置修改后，同步清理 hCaptcha 中间件缓存，避免 60s 内仍用旧值
        if (key === 'hcaptcha_enabled') {
            try { require('../middleware/hcaptcha').invalidateHcaptchaCache(); } catch (e) {}
        }
        if (key.startsWith('mobile_android_')) require('../middleware/mobileVersion').invalidateMobileVersionCache();

        // 修复 P2-10: 数据库相关配置同时写 .env,与批量更新保持一致
        const dbEnvKeyMap = {
            db_type: 'DB_TYPE', db_path: 'DB_PATH', db_host: 'DB_HOST', db_port: 'DB_PORT',
            db_name: 'DB_NAME', db_user: 'DB_USER', db_password: 'DB_PASSWORD',
            mysql_host: 'DB_HOST', mysql_port: 'DB_PORT', mysql_database: 'DB_NAME',
            mysql_username: 'DB_USER', mysql_password: 'DB_PASSWORD'
        };
        if (dbEnvKeyMap[key]) {
            try {
                const fs = require('fs');
                const path = require('path');
                const envPath = path.join(__dirname, '../.env');
                let envContent = '';
                if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf8');
                envContent = updateEnvVariable(envContent, dbEnvKeyMap[key], value);
                fs.writeFileSync(envPath, envContent);
            } catch (envErr) {
                console.warn('[config] .env 写入失败(配置已入库):', envErr.message);
            }
        }

        const updatedConfig = await DbAdapter.findOne(SystemConfig, { where: { config_key: key } });
        logOperation(req, 'update_config', 'system_config', null, redactConfigDetails({ [key]: value }));
        // 修复: 敏感配置不返回明文,统一掩码
        // 修复 P1-8: 敏感配置不返回明文,统一掩码
        const isSensitive = (k) => /password|secret|token|api[_-]?key|auth/i.test(k);
        if (isSensitive(key)) {
            return successResponse(res, {
                config_key: updatedConfig.config_key,
                config_value: updatedConfig.config_value ? '******' : ''
            }, '更新成功');
        }
        return successResponse(res, updatedConfig, '更新成功');
    } catch (error) {
        console.error('更新系统设置错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function batchUpdateConfigs(req, res) {
    try {
        const { configs } = req.body;

        const ALLOWED_CONFIG_KEYS = [
            'ai_enabled', 'ai_api_url', 'ai_api_key', 'ai_model', 'ai_prompt',
            'hcaptcha_enabled', 'hcaptcha_site_key', 'hcaptcha_secret_key', 'hcaptcha_expire_minutes',
            'geetest_enabled', 'geetest_id', 'geetest_key', 'geetest_product',
            'geetest_login', 'geetest_register', 'geetest_like', 'geetest_comment', 'geetest_reply',
            'geetest_report', 'geetest_publish_work', 'geetest_publish_post', 'geetest_favorite',
            'geetest_remove_favorite', 'geetest_update_profile', 'geetest_create_studio',
            'geetest_join_studio', 'geetest_submit_work', 'geetest_review_member', 'geetest_studio_management', 'geetest_developer_app',
            'geetest_im_message', 'geetest_im_search', 'geetest_im_create_group',
            'sensitive_check_mode',
            'sensitive_api_enabled', 'sensitive_api_url', 'sensitive_api_key',
            'db_type', 'db_path', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password',
            'mysql_host', 'mysql_port', 'mysql_database', 'mysql_username', 'mysql_password',
            'proxy_enabled', 'proxy_pool_url', 'proxy_current', 'proxy_protocol', 'proxy_auto_refresh',
            'mobile_android_min_version', 'mobile_android_latest_version', 'mobile_android_update_url', 'mobile_android_update_message'
        ];
        const maskedValues = ['******', '***'];
        const sensitiveKeys = ['ai_api_key', 'hcaptcha_secret_key', 'geetest_key', 'sensitive_api_key', 'mysql_password', 'db_password'];
        const filteredConfigs = {};
        for (const [key, value] of Object.entries(configs)) {
            if (!ALLOWED_CONFIG_KEYS.includes(key)) continue;
            if (sensitiveKeys.includes(key) && maskedValues.includes(String(value))) continue;
            filteredConfigs[key] = value;
        }
        for (const key of ['mobile_android_min_version', 'mobile_android_latest_version']) {
            if (filteredConfigs[key] !== undefined && !/^\d+\.\d+\.\d+$/.test(String(filteredConfigs[key]))) return errorResponse(res, `${key} 必须是 x.y.z 格式`, 400);
        }
        if (filteredConfigs.mobile_android_update_url !== undefined && !/^https:\/\//i.test(String(filteredConfigs.mobile_android_update_url))) return errorResponse(res, 'App 更新地址必须使用 HTTPS', 400);
        if (filteredConfigs.mobile_android_min_version !== undefined && filteredConfigs.mobile_android_latest_version !== undefined) {
            const { compareVersions } = require('../middleware/mobileVersion');
            if (compareVersions(filteredConfigs.mobile_android_latest_version, filteredConfigs.mobile_android_min_version) < 0) return errorResponse(res, '线上最新版本不能低于最低允许版本', 400);
        }

        const hasDbConfig = Object.keys(filteredConfigs).some(key =>
            key.startsWith('db_') || key.startsWith('mysql_')
        );

        if (hasDbConfig) {
            for (const [key, value] of Object.entries(filteredConfigs)) {
                if (!(key.startsWith('db_') || key.startsWith('mysql_'))) continue;
                if (/[\r\n\0]/.test(String(value ?? ''))) {
                    return errorResponse(res, `${key} 包含非法换行字符`, 400);
                }
            }
        }

        // 修复 P2-9: DB 配置更新放入事务,失败时回滚
        await sequelize.transaction(async (t) => {
            for (const [key, value] of Object.entries(filteredConfigs)) {
                const existing = await DbAdapter.findOne(SystemConfig, { where: { config_key: key }, transaction: t });
                if (existing) {
                    await DbAdapter.update(SystemConfig, { config_value: value }, { where: { config_key: key }, transaction: t });
                } else {
                    await DbAdapter.create(SystemConfig, { config_key: key, config_value: value }, { transaction: t });
                }
            }
        });

        // DB 更新成功后再写 .env
        if (hasDbConfig) {
            try {
                const fs = require('fs');
                const path = require('path');
                const envPath = path.join(__dirname, '../.env');
                let envContent = '';
                if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf8');

                const envKeyMap = {
                    db_type: 'DB_TYPE', db_path: 'DB_PATH', db_host: 'DB_HOST', db_port: 'DB_PORT',
                    db_name: 'DB_NAME', db_user: 'DB_USER', db_password: 'DB_PASSWORD',
                    mysql_host: 'DB_HOST', mysql_port: 'DB_PORT', mysql_database: 'DB_NAME',
                    mysql_username: 'DB_USER', mysql_password: 'DB_PASSWORD'
                };
                for (const [cfgKey, envKey] of Object.entries(envKeyMap)) {
                    if (filteredConfigs[cfgKey] !== undefined) {
                        envContent = updateEnvVariable(envContent, envKey, filteredConfigs[cfgKey]);
                    }
                }
                fs.writeFileSync(envPath, envContent);
            } catch (envErr) {
                console.warn('[config] .env 写入失败(配置已入库):', envErr.message);
            }
        }

        logOperation(req, 'batch_update_config', 'system_config', null, redactConfigDetails(filteredConfigs));
        if (Object.keys(filteredConfigs).some(key => key.startsWith('mobile_android_'))) require('../middleware/mobileVersion').invalidateMobileVersionCache();
        return successResponse(res, null, '更新成功');
    } catch (error) {
        console.error('批量更新系统设置错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

// ==================== 操作日志 ====================



async function getOperationLogs(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const userId = req.query.userId;
        const action = req.query.action;
        const targetType = req.query.targetType;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        
        const where = {};
        if (userId) where.user_id = userId;
        if (action) where.action = action;
        if (targetType) where.target_type = targetType;
        if (startDate || endDate) {
            where.created_at = {};
            if (startDate) where.created_at[Op.gte] = new Date(startDate);
            if (endDate) where.created_at[Op.lte] = new Date(endDate);
        }
        
        const { count, rows } = await DbAdapter.findAndCountAll(OperationLog, {
            where,
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'nickname', 'role'] }],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        
        const logs = rows.map((row) => {
            const item = row.toJSON ? row.toJSON() : row;
            let auditDetails = {};
            try {
                auditDetails = item.details ? JSON.parse(item.details) : {};
            } catch (_) {
                auditDetails = { legacy_raw_details: item.details || '' };
            }
            return { ...item, audit_details: auditDetails };
        });
        return paginateResponse(res, logs, count, page, pageSize);
    } catch (error) {
        console.error('获取操作日志错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

// ==================== 敏感词管理====================

async function getOperationLogOptions(req, res) {
    try {
        const [operatorRows, actionRows, targetTypeRows] = await Promise.all([
            DbAdapter.findAll(OperationLog, {
                attributes: ['user_id'],
                where: { user_id: { [Op.ne]: null } },
                group: ['user_id'],
                raw: true
            }),
            DbAdapter.findAll(OperationLog, {
                attributes: ['action'],
                where: { action: { [Op.ne]: null } },
                group: ['action'],
                order: [['action', 'ASC']],
                raw: true
            }),
            DbAdapter.findAll(OperationLog, {
                attributes: ['target_type'],
                where: { target_type: { [Op.ne]: null } },
                group: ['target_type'],
                order: [['target_type', 'ASC']],
                raw: true
            })
        ]);
        const operatorIds = operatorRows.map((item) => item.user_id).filter(Boolean);
        const operators = operatorIds.length
            ? await DbAdapter.findAll(User, {
                where: { id: { [Op.in]: operatorIds } },
                attributes: ['id', 'username', 'nickname', 'role', 'status'],
                order: [['nickname', 'ASC'], ['username', 'ASC']]
            })
            : [];
        return successResponse(res, {
            operators,
            actions: actionRows.map((item) => item.action).filter(Boolean),
            targetTypes: targetTypeRows.map((item) => item.target_type).filter(Boolean)
        });
    } catch (error) {
        console.error('获取操作日志筛选项错误:', error);
        return errorResponse(res, '获取筛选项失败', 500);
    }
}

async function getSensitiveWords(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const category = req.query.category;
        const status = req.query.status;
        
        const where = {};
        if (category) where.category = category;
        if (status) where.status = status;
        
        const { count, rows } = await DbAdapter.findAndCountAll(SensitiveWord, {
            where,
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取敏感词错误', error);
        return errorResponse(res, '获取失败', 500);
    }
}

async function addSensitiveWord(req, res) {
    try {
        const { word, category, level, replacement } = req.body;

        // 修复: 校验敏感词非空(空字符串会导致 content.includes('') 永远为 true,所有内容判高风险)
        if (!word || typeof word !== 'string' || !word.trim()) {
            return errorResponse(res, '敏感词不能为空', 400);
        }
        if (word.trim().length > 100) {
            return errorResponse(res, '敏感词长度不能超过 100 字符', 400);
        }

        const existing = await DbAdapter.findOne(SensitiveWord, { where: { word: word.trim() } });
        if (existing) {
            return errorResponse(res, '该敏感词已存在', 400);
        }

        const sensitiveWord = await DbAdapter.create(SensitiveWord, {
            word: word.trim(),
            category: category || 'other',
            level: level || 1,
            replacement
        });
        
        logOperation(req, 'add_sensitive_word', 'sensitive_word', DbAdapter.getId(sensitiveWord), { word });
        return successResponse(res, sensitiveWord, '添加成功');
    } catch (error) {
        console.error('添加敏感词错误', error);
        return errorResponse(res, '添加失败', 500);
    }
}

async function updateSensitiveWord(req, res) {
    try {
        const { wordId } = req.params;
        const { word, category, level, replacement, status } = req.body;
        
        const sensitiveWord = await DbAdapter.findByPk(SensitiveWord, wordId);
        if (!sensitiveWord) {
            return errorResponse(res, '敏感词不存在', 404);
        }
        
        await DbAdapter.update(SensitiveWord, { word, category, level, replacement, status }, { where: { id: wordId } });
        const updatedWord = await DbAdapter.findByPk(SensitiveWord, wordId);
        logOperation(req, 'update_sensitive_word', 'sensitive_word', wordId, { word });
        
        return successResponse(res, updatedWord, '更新成功');
    } catch (error) {
        console.error('更新敏感词错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function deleteSensitiveWord(req, res) {
    try {
        const { wordId } = req.params;
        
        const sensitiveWord = await DbAdapter.findByPk(SensitiveWord, wordId);
        if (!sensitiveWord) {
            return errorResponse(res, '敏感词不存在', 404);
        }
        
        await DbAdapter.destroy(SensitiveWord, { where: { id: DbAdapter.getId(sensitiveWord) } });
        logOperation(req, 'delete_sensitive_word', 'sensitive_word', wordId);
        
        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除敏感词错误', error);
        return errorResponse(res, '删除失败', 500);
    }
}

async function batchImportSensitiveWords(req, res) {
    try {
        const { words, category, level } = req.body;
        const results = { success: 0, failed: 0, duplicates: 0 };

        if (!Array.isArray(words) || words.length === 0) {
            return errorResponse(res, '请提供敏感词列表', 400);
        }

        if (words.length > 1000) {
            return errorResponse(res, '单次最多导入1000个敏感词', 400);
        }

        for (const word of words) {
            const existing = await DbAdapter.findOne(SensitiveWord, { where: { word } });
            if (existing) {
                results.duplicates++;
                continue;
            }
            
            try {
                await DbAdapter.create(SensitiveWord, {
                    word,
                    category: category || 'other',
                    level: level || 1
                });
                results.success++;
            } catch (e) {
                results.failed++;
            }
        }
        
        logOperation(req, 'batch_import_sensitive_words', 'sensitive_word', null, results);
        return successResponse(res, results, `成功导入${results.success}个敏感词`);
    } catch (error) {
        console.error('批量导入敏感词错误', error);
        return errorResponse(res, '导入失败', 500);
    }
}

// ==================== AI审核功能 ====================
// aiReview 已在模块顶部引入（H12），此处不再重复 require

async function aiReviewReport(req, res) {
    try {
        const { reportId } = req.params;
        
        const report = await DbAdapter.findByPk(Report, reportId, {
            include: [
                { model: Work, as: 'work', attributes: ['id', 'name', 'description'] },
                { model: Post, as: 'post', attributes: ['id', 'title', 'content'] },
                { model: Comment, as: 'comment', attributes: ['id', 'content'] }
            ]
        });
        
        if (!report) {
            return errorResponse(res, '举报不存在', 404);
        }
        
        // 修复:将举报原因(reason)纳入 AI 审核上下文,让 AI 看到举报人为何举报
        // 同时补全被举报目标的信息(用户类举报应看用户资料而非仅 description)
        let content = '';
        let type = '作品';
        if (report.type === 'work') {
            content = `## 被举报内容\n作品名称: ${report.work?.name || ''}\n作品描述: ${report.work?.description || ''}`;
            type = '作品';
        } else if (report.type === 'post') {
            content = `## 被举报内容\n帖子标题: ${report.post?.title || ''}\n帖子内容: ${report.post?.content || ''}`;
            type = '帖子';
        } else if (report.type === 'comment') {
            content = `## 被举报内容\n${report.comment?.content || ''}`;
            type = '评论';
        } else if (report.type === 'user') {
            // 修复:用户类举报应展示被举报用户资料,而非仅举报说明
            const targetUser = await DbAdapter.findByPk(User, report.target_id, { attributes: ['nickname', 'bio', 'doing'] });
            content = `## 被举报内容\n用户昵称: ${targetUser?.nickname || ''}\n简介: ${targetUser?.bio || ''}\n正在做: ${targetUser?.doing || ''}`;
            type = '用户';
        }

        // 将举报原因/补充说明作为上下文注入(与待审内容分区标注,防 prompt injection)
        const reasonCtx = report.reason ? `\n\n## 举报原因\n${report.reason}` : '';
        const descCtx = report.description ? `\n\n## 举报补充说明\n${report.description}` : '';
        const fullContent = `${content}${reasonCtx}${descCtx}`;

        const result = await aiReview.reviewContent(type, fullContent);

        logOperation(req, 'ai_review', 'report', reportId, {
            type,
            riskLevel: result.riskLevel || result.fallback?.riskLevel,
            violations: result.violations || result.fallback?.violations,
            recommendation: result.recommendation || result.fallback?.recommendation,
            confidence: result.confidence || result.fallback?.confidence,
            isFallback: !!result.fallback
        });

        // 如果AI未启用或失败，返回fallback结果并标记
        if (result.fallback) {
            return successResponse(res, {
                success: false,
                isFallback: true,
                error: result.error,
                ...result.fallback
            });
        }

        return successResponse(res, {
            success: result.success,
            riskLevel: result.riskLevel,
            violations: result.violations || [],
            reason: result.reason || '',
            recommendation: result.recommendation,
            confidence: result.confidence,
            error: result.error || null
        });
    } catch (error) {
        console.error('AI审核错误:', error);
        return errorResponse(res, 'AI审核失败', 500);
    }
}

async function testSensitiveCheck(req, res) {
    try {
        const { text, mode } = req.body;

        if (!text) {
            return errorResponse(res, '请输入要测试的内容', 400);
        }

        const result = await aiReview.fallbackReview(text, mode);

        return successResponse(res, result);
    } catch (error) {
        console.error('敏感词测试错误', error);
        return errorResponse(res, '测试失败', 500);
    }
}

async function aiBatchReviewReports(req, res) {
    try {
        const { reportIds } = req.body;

        if (!Array.isArray(reportIds) || reportIds.length === 0) {
            return errorResponse(res, '请选择要审核的举报', 400);
        }

        if (reportIds.length > 20) {
            return errorResponse(res, '单次最多审核20条举报', 400);
        }

        logOperation(req, 'ai_batch_review', 'report', null, { count: reportIds.length });

        // 修复: 校验 reportIds 元素类型,与 aiAutoHandleReports 保持一致
        const validReportIds = reportIds.filter(id => Number.isInteger(Number(id))).map(Number);
        if (validReportIds.length === 0) {
            return errorResponse(res, '请提供有效的举报ID', 400);
        }

        const results = [];

        for (const reportId of validReportIds) {
            const report = await DbAdapter.findByPk(Report, reportId, {
                include: [
                    { model: Work, as: 'work', attributes: ['name', 'description'] },
                    { model: Post, as: 'post', attributes: ['title', 'content'] },
                    { model: Comment, as: 'comment', attributes: ['content'] }
                ]
            });
            if (!report) continue;

            let content = '';
            let type = '作品';
            if (report.type === 'work') {
                content = `作品名称: ${report.work?.name || ''}\n作品描述: ${report.work?.description || ''}`;
                type = '作品';
            } else if (report.type === 'post') {
                content = `帖子标题: ${report.post?.title || ''}\n帖子内容: ${report.post?.content || ''}`;
                type = '帖子';
            } else if (report.type === 'comment') {
                content = report.comment?.content || '';
                type = '评论';
            }
            
            const result = await aiReview.reviewContent(type, content);
            
            results.push({
                reportId,
                riskLevel: result.riskLevel,
                violations: result.violations || [],
                recommendation: result.recommendation,
                confidence: result.confidence
            });
        }
        
        return successResponse(res, results);
    } catch (error) {
        console.error('批量AI审核错误:', error);
        return errorResponse(res, '批量审核失败', 500);
    }
}

async function aiAutoHandleReports(req, res) {
    try {
        const { reportIds } = req.body;
        // H15: 必须校验 reportIds 是数组，且元素均为整数，防止传入字符串/对象导致遍历异常
        if (!Array.isArray(reportIds) || reportIds.length === 0) {
            return errorResponse(res, '请提供举报ID数组', 400);
        }
        const validReportIds = reportIds.filter(id => Number.isInteger(Number(id))).map(Number);
        if (validReportIds.length === 0) {
            return errorResponse(res, '举报ID数组格式无效', 400);
        }
        // 修复: 添加批量上限,防止一次提交数千 ID 长时间占用连接和数据库事务
        // 与 aiBatchReviewReports 的 20 条上限保持同量级,这里放宽到 50 条
        const AI_AUTO_HANDLE_MAX_BATCH = 50;
        if (validReportIds.length > AI_AUTO_HANDLE_MAX_BATCH) {
            return errorResponse(res, `单次最多处理 ${AI_AUTO_HANDLE_MAX_BATCH} 条举报，请分批提交`, 400);
        }

        const results = { handled: 0, passed: 0, deleted: 0 };

        // 敏感词表只查询一次，避免 N+1 问题
        const sensitiveWords = await DbAdapter.findAll(SensitiveWord, { where: { status: 'active' } });

        for (const reportId of validReportIds) {
            const report = await DbAdapter.findByPk(Report, reportId);
            if (!report || report.status !== 'pending') continue;

            // AI审核
            let riskLevel = 'low';
            // 修复:将举报原因(reason)纳入 AI 审核上下文
            let actualContent = '';
            try {
                if (report.type === 'work') {
                    const work = await DbAdapter.findByPk(Work, report.target_id, { attributes: ['name', 'description', 'status'] });
                    if (work && work.status !== 'deleted' && work.status !== 'hidden') {
                        actualContent = `## 被举报内容\n作品名称: ${work.name || ''}\n作品描述: ${work.description || ''}`;
                    }
                } else if (report.type === 'comment') {
                    const comment = await DbAdapter.findByPk(Comment, report.target_id, { attributes: ['content', 'status'] });
                    if (comment && comment.status !== 'deleted') {
                        actualContent = `## 被举报内容\n${comment.content || ''}`;
                    }
                } else if (report.type === 'post') {
                    const post = await DbAdapter.findByPk(Post, Number(report.target_id), { attributes: ['title', 'content', 'status'] });
                    if (post && post.status !== 'deleted') {
                        actualContent = `## 被举报内容\n帖子标题: ${post.title || '(无标题)'}\n帖子内容: ${post.content || '(无内容)'}`;
                    } else if (post && post.status === 'deleted') {
                        actualContent = `## 被举报内容\n帖子已被删除`;
                    } else {
                        actualContent = `## 被举报内容\n帖子不存在(可能已清理)`;
                    }
                } else if (report.type === 'user') {
                    const targetUser = await DbAdapter.findByPk(User, report.target_id, { attributes: ['nickname', 'bio', 'status'] });
                    if (targetUser && targetUser.status !== 'disabled') {
                        actualContent = `## 被举报内容\n用户昵称: ${targetUser.nickname || ''}\n简介: ${targetUser.bio || ''}`;
                    }
                }
            } catch (loadErr) {
                console.error('加载被举报内容失败:', loadErr.message);
            }
            // 将举报原因/补充说明作为上下文注入(与待审内容分区标注,防 prompt injection)
            const reasonCtx = report.reason ? `\n\n## 举报原因\n${report.reason}` : '';
            const descCtx = report.description ? `\n\n## 举报补充说明\n${report.description}` : '';
            const content = `${actualContent}${reasonCtx}${descCtx}`.trim();

            for (const sw of sensitiveWords) {
                if (content.includes(sw.word)) {
                    if (sw.level >= 3) { riskLevel = 'high'; break; }
                    if (sw.level >= 2) riskLevel = 'medium';
                }
            }

            if (riskLevel === 'high') {
                // (报告1 #12) BOLA 防御：低权限管理员不能通过 AI 自动处理删除高权限用户的内容。
                // 与 user 分支（事务内已有 canManageUser 校验）保持一致，对 work/post/comment 目标
                // 也校验内容所有者角色；无权时仅标记举报已处理、跳过删除动作，避免中断整批流程。
                let canAutoDelete = true;
                if (report.type === 'work') {
                    const targetWork = await DbAdapter.findByPk(Work, report.target_id, { attributes: ['user_id'] });
                    if (targetWork && targetWork.user_id) {
                        const owner = await DbAdapter.findByPk(User, targetWork.user_id, { attributes: ['role'] });
                        if (owner && !canManageUser(req.user.role, owner.role)) canAutoDelete = false;
                    }
                } else if (report.type === 'comment') {
                    const targetComment = await DbAdapter.findByPk(Comment, report.target_id, { attributes: ['user_id'] });
                    if (targetComment && targetComment.user_id) {
                        const owner = await DbAdapter.findByPk(User, targetComment.user_id, { attributes: ['role'] });
                        if (owner && !canManageUser(req.user.role, owner.role)) canAutoDelete = false;
                    }
                } else if (report.type === 'post') {
                    const targetPost = await DbAdapter.findByPk(Post, report.target_id, { attributes: ['user_id'] });
                    if (targetPost && targetPost.user_id) {
                        const owner = await DbAdapter.findByPk(User, targetPost.user_id, { attributes: ['role'] });
                        if (owner && !canManageUser(req.user.role, owner.role)) canAutoDelete = false;
                    }
                }
                // user 分支已在事务内做 canManageUser 校验，这里不再重复

                if (!canAutoDelete) {
                    // 修复: 权限不足时保持 pending(而非 resolved),让有权限的管理员后续处理
                    await DbAdapter.update(Report, { status: 'pending', handler_id: null, handle_note: 'AI自动处理-权限不足,需人工处理' }, { where: { id: DbAdapter.getId(report) } });
                    await addReportAuditLog(DbAdapter.getId(report), null, 'ai', '自动处理-权限不足', 'AI权限不足,保持待处理需人工审核');
                    results.skipped = (results.skipped || 0) + 1;
                    continue;
                }

                // H15: 自动删除时需级联清理关联数据，与 handleReport 行为保持一致
                // 中-2: 多表级联清理必须用事务包裹，与 handleReport 行为一致，任一步失败整体回滚
                await sequelize.transaction(async (t) => {
                    if (report.type === 'work') {
                        const { Like, Favorite, Comment, StudioWork, Notification } = require('../models');
                        const wid = report.target_id;
                        const affectedStudioWorks = await DbAdapter.findAll(StudioWork, {
                            where: { work_id: wid, status: 'approved' },
                            attributes: ['studio_id'],
                            transaction: t
                        });
                        const affectedStudioIds = [...new Set(affectedStudioWorks.map(sw => sw.studio_id))];
                        await DbAdapter.destroy(Notification, { where: { related_id: wid, related_type: 'work' }, transaction: t });
                        await DbAdapter.destroy(StudioWork, { where: { work_id: wid }, transaction: t });
                        await DbAdapter.destroy(Like, { where: { work_id: wid }, transaction: t });
                        await DbAdapter.destroy(Favorite, { where: { work_id: wid }, transaction: t });
                        await DbAdapter.update(Comment, { status: 'deleted' }, { where: { work_id: wid }, transaction: t });
                        // 修复: 清零 Work 计数,与 adminController.deleteWork 和 workController.deleteWork 保持一致
                        await DbAdapter.update(Work, { status: 'deleted', praise_times: 0, collection_times: 0, comment_count: 0 }, { where: { id: wid }, transaction: t });
                        // 修复: 重算受影响工作室的 work_count 和 total_score
                        for (const sid of affectedStudioIds) {
                            const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: sid, status: 'approved' }, transaction: t });
                            const totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: sid, status: 'approved' }, transaction: t }) || 0;
                            await DbAdapter.update(Studio, { work_count: approvedCount, total_score: totalScore }, { where: { id: sid }, transaction: t });
                        }
                    } else if (report.type === 'comment') {
                        const comment = await DbAdapter.findByPk(Comment, report.target_id, { transaction: t });
                        if (comment) {
                            const wasActive = comment.status === 'active';
                            const { Like } = require('../models');
                            await DbAdapter.update(Comment, { status: 'deleted' }, { where: { id: report.target_id }, transaction: t });
                            // 修复: 级联软删所有多级子回复(不只直接子回复) + 清理 Like + 清零 like_count
                            let currentParentIds = [report.target_id];
                            const maxDepth = 100;
                            for (let depth = 0; depth < maxDepth && currentParentIds.length > 0; depth++) {
                                const children = await DbAdapter.findAll(Comment, {
                                    where: { parent_id: { [Op.in]: currentParentIds }, status: { [Op.ne]: 'deleted' } },
                                    attributes: ['id'],
                                    transaction: t
                                });
                                if (children.length === 0) break;
                                const childIds = children.map(c => DbAdapter.getId(c));
                                await DbAdapter.update(Comment, { status: 'deleted' }, {
                                    where: { id: { [Op.in]: childIds } },
                                    transaction: t
                                });
                                await DbAdapter.destroy(Like, { where: { comment_id: { [Op.in]: childIds } }, transaction: t });
                                await DbAdapter.update(Comment, { like_count: 0 }, { where: { id: { [Op.in]: childIds } }, transaction: t });
                                currentParentIds = childIds;
                            }
                            // 清理父评论自身的 Like 记录 + 清零 like_count
                            await DbAdapter.destroy(Like, { where: { comment_id: report.target_id }, transaction: t });
                            await DbAdapter.update(Comment, { like_count: 0 }, { where: { id: report.target_id }, transaction: t });
                            if (wasActive && !comment.parent_id) {
                                if (comment.work_id) {
                                    const work = await DbAdapter.findByPk(Work, comment.work_id, { transaction: t });
                                    if (work) await DbAdapter.decrement(work, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                                }
                                if (comment.post_id) {
                                    const post = await DbAdapter.findByPk(Post, comment.post_id, { transaction: t });
                                    if (post) await DbAdapter.decrement(post, 'comment_count', { where: { comment_count: { [Op.gt]: 0 } }, transaction: t });
                                }
                            }
                        }
                    } else if (report.type === 'post') {
                        const { Like, Favorite, Comment, Notification } = require('../models');
                        const pid = report.target_id;
                        await DbAdapter.destroy(Notification, { where: { related_id: pid, related_type: 'post' }, transaction: t });
                        // 修复: 清理挂在帖子评论上的 Like(comment_id),与 handleReport 保持一致
                        const postComments = await DbAdapter.findAll(Comment, {
                            where: { post_id: pid },
                            attributes: ['id'],
                            transaction: t
                        });
                        const commentIds = postComments.map(c => DbAdapter.getId(c));
                        if (commentIds.length > 0) {
                            await DbAdapter.destroy(Like, { where: { comment_id: { [Op.in]: commentIds } }, transaction: t });
                        }
                        await DbAdapter.destroy(Like, { where: { post_id: pid }, transaction: t });
                        await DbAdapter.destroy(Favorite, { where: { post_id: pid }, transaction: t });
                        await DbAdapter.update(Comment, { status: 'deleted' }, { where: { post_id: pid }, transaction: t });
                        // 修复: 清零 Post 计数,与 handleReport 保持一致
                        await DbAdapter.update(Post, { status: 'deleted', like_count: 0, collection_count: 0, comment_count: 0 }, { where: { id: pid }, transaction: t });
                    } else if (report.type === 'user') {
                        // 与 handleReport 高危用户举报分支保持一致：禁用用户
                        // 批量场景下若当前管理员权限不足以处理该用户（低权限不能禁高权限），则跳过禁用动作，
                        // 但仍允许报告标记为已处理，避免中断整批流程
                        const targetUser = await DbAdapter.findByPk(User, report.target_id, { transaction: t });
                        if (targetUser && canManageUser(req.user.role, targetUser.role)) {
                            await DbAdapter.update(User, { status: 'disabled' }, { where: { id: report.target_id }, transaction: t });
                        }
                    }
                    await DbAdapter.update(Report, { status: 'resolved', handler_id: DbAdapter.getId(req.user), handle_note: 'AI自动处理-删除' }, { where: { id: DbAdapter.getId(report) }, transaction: t });
                    await addReportAuditLog(DbAdapter.getId(report), DbAdapter.getId(req.user), 'ai', '自动处理-删除', 'AI自动删除违规内容');

                    // 修复: 删除内容后重算作者 work_count
                    if (report.type === 'work') {
                        const deletedWork = await DbAdapter.findByPk(Work, report.target_id, { attributes: ['user_id'], transaction: t });
                        if (deletedWork?.user_id) {
                            const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: deletedWork.user_id, status: 'published' }, transaction: t });
                            await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: deletedWork.user_id }, transaction: t });
                        }
                    }
                });
                results.deleted++;
            } else {
                // 通过
                await DbAdapter.update(Report, { status: 'rejected', handler_id: DbAdapter.getId(req.user), handle_note: 'AI自动处理-通过' }, { where: { id: DbAdapter.getId(report) } });
                await addReportAuditLog(DbAdapter.getId(report), DbAdapter.getId(req.user), 'ai', '自动处理-通过', 'AI判定内容正常,驳回举报');
                results.passed++;
            }

            // 修复: AI 删除内容后,清理同目标的其他 pending 举报(避免悬空)
            if (riskLevel === 'high' && canAutoDelete) {
                await DbAdapter.update(Report, {
                    status: 'resolved',
                    handler_id: DbAdapter.getId(req.user),
                    handle_note: `AI自动处理-目标已删除(同目标清理)`
                }, { where: { type: report.type, target_id: report.target_id, id: { [Op.ne]: DbAdapter.getId(report) }, status: 'pending' } });
                await addReportAuditLog(DbAdapter.getId(report), null, 'ai', '自动处理-同目标清理', '同目标重复举报自动解决');
            }

            results.handled++;

            // 修复 P2-3: AI 自动处理后通知举报人处理结果
            try {
                const targetName = report.target?.name || report.target?.title || report.target?.content?.substring(0, 20) || '';
                const actionText = riskLevel === 'high' && canAutoDelete ? '删除' : '通过';
                await DbAdapter.create(Notification, {
                    user_id: report.reporter_id,
                    type: 'system',
                    title: `举报已处理`,
                    content: `您举报的${typeNames[report.type]||report.type}「${targetName}」已${actionText}`,
                    related_id: report.target_id,
                    related_type: report.type
                });
            } catch (e) { console.error('AI处理通知失败:', e.message); }
        }

        logOperation(req, 'ai_auto_handle_reports', 'report', null, results);
        return successResponse(res, results, `AI自动处理完成，共处理${results.handled}条举报`);
    } catch (error) {
        console.error('AI自动处理错误:', error);
        return errorResponse(res, '处理失败', 500);
    }
}

// ==================== 权限管理 ====================

async function getPermissions(req, res) {
    try {
        const permissions = getAllPermissions();
        return successResponse(res, permissions);
    } catch (error) {
        console.error('获取权限列表错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

async function getRolePermissionsList(req, res) {
    try {
        // 刷新缓存并获取最新角色权限
        await refreshRoleCache(RolePermission);
        const roles = getAllRoles();
        return successResponse(res, roles);
    } catch (error) {
        console.error('获取角色权限错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

async function updateRolePermissions(req, res) {
    try {
        const { role } = req.params;
        const { name, level, permissions } = req.body;
        
        // 不能修改超级管理员权限
        if (role === 'superadmin') {
            return errorResponse(res, '不能修改超级管理员权限', 403);
        }
        
        // 检查角色是否存在
        if (!DEFAULT_ROLES[role]) {
            return errorResponse(res, '角色不存在', 404);
        }
        
        // 更新或创建角色权限
        let rolePerm = await DbAdapter.findOne(RolePermission, { where: { role } });

        // RolePermission.permissions 的模型 setter 负责把数组序列化为 TEXT。
        // Sequelize 的 Model.update 同样会执行 setter，因此更新和创建都必须传数组；
        // 这里若预先 JSON.stringify，会被 setter 再序列化一次，读取时便会回退为空数组。
        if (rolePerm) {
            await DbAdapter.update(RolePermission, {
                name: name || rolePerm.name,
                level: level !== undefined ? level : rolePerm.level,
                permissions: permissions || []
            }, { where: { role } });
        } else {
            await DbAdapter.create(RolePermission, {
                role,
                name: name || DEFAULT_ROLES[role].name,
                level: level !== undefined ? level : DEFAULT_ROLES[role].level,
                permissions: permissions || []
            });
        }
        
        // 刷新缓存
        await refreshRoleCache(RolePermission);
        
        // 重新查询获取最新数据
        const updatedRolePerm = await DbAdapter.findOne(RolePermission, { where: { role } });

        let parsedPermissions;
        try {
            // 修复双重 parse：updatedRolePerm.permissions 已被模型 getter 解析为数组，禁止再次 JSON.parse
            parsedPermissions = Array.isArray(updatedRolePerm.permissions) ? updatedRolePerm.permissions : [];
        } catch (parseError) {
            console.error('解析角色权限JSON失败:', parseError);
            parsedPermissions = [];
        }

        logOperation(req, 'update_role_permissions', 'role', null, { role, name, level, permissions });
        return successResponse(res, {
            role,
            name: updatedRolePerm.name,
            level: updatedRolePerm.level,
            permissions: parsedPermissions
        }, '权限更新成功');
    } catch (error) {
        console.error('更新角色权限错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function resetRolePermissions(req, res) {
    try {
        const { role } = req.params;
        
        if (role === 'superadmin') {
            return errorResponse(res, '不能重置超级管理员权限', 403);
        }
        
        if (!DEFAULT_ROLES[role]) {
            return errorResponse(res, '角色不存在', 404);
        }
        
        // 删除自定义权限，恢复默认
        await DbAdapter.destroy(RolePermission, { where: { role } });
        
        // 刷新缓存
        await refreshRoleCache(RolePermission);
        
        logOperation(req, 'reset_role_permissions', 'role', null, { role });
        return successResponse(res, DEFAULT_ROLES[role], '权限已重置为默认');
    } catch (error) {
        console.error('重置角色权限错误:', error);
        return errorResponse(res, '重置失败', 500);
    }
}

async function getCaptchaStats(req, res) {
    try {
        // 修复: days 边界校验,防止无效值或过大值
        const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const stats = await DbAdapter.findAll(CaptchaStats, {
            where: {
                created_at: { [Op.gte]: startDate }
            },
            attributes: [
                'type',
                'action',
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: ['type', 'action']
        });
        
        const geetestStats = { show: 0, pass: 0, block: 0 };
        const hcaptchaStats = { show: 0, pass: 0, block: 0 };
        
        stats.forEach(s => {
            const data = s.toJSON();
            if (data.type === 'geetest') {
                geetestStats[data.action] = parseInt(data.count);
            } else if (data.type === 'hcaptcha') {
                hcaptchaStats[data.action] = parseInt(data.count);
            }
        });
        
        const dailyStats = await DbAdapter.findAll(CaptchaStats, {
            where: {
                created_at: { [Op.gte]: startDate }
            },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
                'type',
                'action',
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at')), 'type', 'action'],
            order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
        });
        
        return successResponse(res, {
            geetest: geetestStats,
            hcaptcha: hcaptchaStats,
            daily: dailyStats.map(s => s.toJSON())
        });
    } catch (error) {
        console.error('获取验证码统计错误', error);
        return errorResponse(res, '获取统计失败', 500);
    }
}

async function getStudios(req, res) {
    try {
        // M14: 统一使用 DbAdapter.parsePagination 限制 pageSize 上限(<=100)
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { keyword, status } = req.query;
        const where = {};

        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['name'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        if (status) {
            where.status = status;
        }

        const { count, rows } = await DbAdapter.findAndCountAll(Studio, {
            where,
            include: [{
                model: User,
                as: 'owner',
                attributes: ['id', 'username', 'nickname', 'avatar']
            }],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });

        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取工作室列表错误:', error);
        return errorResponse(res, '获取工作室列表失败', 500);
    }
}

async function updateStudioStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const VALID_STUDIO_STATUSES = ['active', 'banned', 'pending', 'dissolved'];
        if (!VALID_STUDIO_STATUSES.includes(status)) {
            return errorResponse(res, '无效的状态值', 400);
        }

        const studio = await DbAdapter.findByPk(Studio, id);
        if (!studio) {
            return errorResponse(res, '工作室不存在', 404);
        }

        // 修复: 同步 owner_claim 字段,保持"每人一个工作室"并发不变量
        // banned 工作室的 owner_claim 置 NULL,允许该 owner 创建新工作室(唯一索引允许多个 NULL)
        // 非 banned 状态恢复 owner_claim = owner_id,重新占用唯一索引
        const ownerClaim = status === 'banned' ? null : studio.owner_id;
        await DbAdapter.update(Studio, { status, owner_claim: ownerClaim }, { where: { id } });
        logOperation(req, 'update_studio_status', 'studio', id, { status });

        const updatedStudio = await DbAdapter.findByPk(Studio, id);
        return successResponse(res, updatedStudio, '工作室状态已更新');
    } catch (error) {
        console.error('更新工作室状态错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function updateStudio(req, res) {
    try {
        const { id } = req.params;
        let { name, description, cover, is_public, join_type, status, vice_owner_id } = req.body;

        const VALID_JOIN_TYPES = ['public', 'apply', 'invite'];
        const VALID_STUDIO_STATUSES = ['active', 'banned', 'pending', 'dissolved'];

        if (join_type !== undefined && !VALID_JOIN_TYPES.includes(join_type)) {
            return errorResponse(res, '无效的加入方式', 400);
        }
        if (status !== undefined && !VALID_STUDIO_STATUSES.includes(status)) {
            return errorResponse(res, '无效的工作室状态', 400);
        }

        const studio = await DbAdapter.findByPk(Studio, id);
        if (!studio) {
            return errorResponse(res, '工作室不存在', 404);
        }

        // Bug-5: 管理员更新工作室 name 时需添加 AI 内容审核,与 studioController.updateStudio 一致
        const finalName = name !== undefined ? String(name).trim() : studio.name;
        const finalDesc = description !== undefined ? String(description).trim() : studio.description;
        if (name !== undefined || description !== undefined) {
            const reviewResult = await aiReview.fallbackReview(String(finalName + (finalDesc ? ' ' + finalDesc : '')));
            if (reviewResult.recommendation === 'delete') {
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            if (reviewResult.recommendation === 'review') {
                console.warn(`[admin] 管理员更新工作室名称/描述为疑似违规内容,已放行(管理特权)`);
            }
        }

        // 修复: vice_owner_id 的变更必须同步 StudioMember.role,否则会出现"挂名副室长"
        // 通用编辑接口此前只更新 Studio.vice_owner_id,不更新成员角色,导致副室长无实际管理权限
        // 现在用事务包裹,降级旧副室长 + 提升新副室长 + 更新 Studio.vice_owner_id
        // 修复: 同步 owner_claim 字段。finalStatus 为本次更新后的工作室状态,
        // banned → owner_claim=null;其他 → owner_claim=owner_id,保证并发不变量
        const finalStatus = status !== undefined ? status : studio.status;
        const finalOwnerClaim = finalStatus === 'banned' ? null : studio.owner_id;

        if (vice_owner_id !== undefined) {
            const { StudioMember } = require('../models');
            const oldViceOwnerId = studio.vice_owner_id;

            // 校验新副室长是否为该工作室的 active 成员
            if (vice_owner_id !== null) {
                const memberRecord = await DbAdapter.findOne(StudioMember, {
                    where: { studio_id: id, user_id: vice_owner_id, status: 'active' }
                });
                if (!memberRecord) {
                    return errorResponse(res, '副室长必须为该工作室的活跃成员', 400);
                }
            }

            await sequelize.transaction(async (t) => {
                // 降级旧副室长的成员角色为 admin(如果旧副室长存在且不是 owner)
                if (oldViceOwnerId && String(oldViceOwnerId) !== String(vice_owner_id)) {
                    const oldViceMember = await DbAdapter.findOne(StudioMember, {
                        where: { studio_id: id, user_id: oldViceOwnerId, role: 'vice_owner' },
                        transaction: t
                    });
                    if (oldViceMember) {
                        await DbAdapter.update(StudioMember, { role: 'admin' }, {
                            where: { id: DbAdapter.getId(oldViceMember) },
                            transaction: t
                        });
                    }
                }

                // 提升新副室长的成员角色为 vice_owner
                if (vice_owner_id !== null) {
                    await DbAdapter.update(StudioMember, { role: 'vice_owner' }, {
                        where: { studio_id: id, user_id: vice_owner_id, status: 'active' },
                        transaction: t
                    });
                }

                // 更新 Studio.vice_owner_id 及其他字段
                await DbAdapter.update(Studio, {
                    name: finalName,
                    description: finalDesc || null,
                    cover: cover !== undefined ? cover : studio.cover,
                    is_public: is_public !== undefined ? is_public : studio.is_public,
                    join_type: join_type !== undefined ? join_type : studio.join_type,
                    status: finalStatus,
                    vice_owner_id: vice_owner_id,
                    owner_claim: finalOwnerClaim
                }, { where: { id }, transaction: t });
            });
        } else {
            // 不涉及 vice_owner_id 变更,直接更新其他字段
            await DbAdapter.update(Studio, {
                name: finalName,
                description: finalDesc || null,
                cover: cover !== undefined ? cover : studio.cover,
                is_public: is_public !== undefined ? is_public : studio.is_public,
                join_type: join_type !== undefined ? join_type : studio.join_type,
                status: finalStatus,
                owner_claim: finalOwnerClaim
            }, { where: { id } });
        }

        logOperation(req, 'update_studio', 'studio', id, { name, description, is_public, join_type, status, vice_owner_id });
        
        const updatedStudio = await DbAdapter.findByPk(Studio, id);
        return successResponse(res, updatedStudio, '工作室已更新');
    } catch (error) {
        console.error('更新工作室错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function setWorkScore(req, res) {
    try {
        const { id } = req.params;
        const { score } = req.body;

        const StudioWork = require('../models').StudioWork;
        const parsedScore = Math.max(0, parseInt(score, 10) || 0);

        // 修复: 用事务 + SELECT FOR UPDATE 包裹 score 更新 + total_score 重算
        // 原先非事务化: 更新分数 → SUM → 写 total_score,并发评分可能写回旧汇总值
        let oldScore, totalScore = 0;
        await sequelize.transaction(async (t) => {
            const studioWork = await DbAdapter.findByPk(StudioWork, id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!studioWork) {
                const err = new Error('作品记录不存在');
                err.statusCode = 404;
                throw err;
            }
            oldScore = studioWork.score || 0;
            await DbAdapter.update(StudioWork, { score: parsedScore }, { where: { id }, transaction: t });

            const studio = await DbAdapter.findByPk(Studio, studioWork.studio_id, { transaction: t });
            if (studio) {
                totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: studioWork.studio_id, status: 'approved' }, transaction: t }) || 0;
                await DbAdapter.update(Studio, { total_score: totalScore }, { where: { id: DbAdapter.getId(studio) }, transaction: t });
            }
        });

        logOperation(req, 'set_work_score', 'studio_work', id, { oldScore, newScore: parsedScore });

        return successResponse(res, { score: parsedScore, totalScore }, '积分已更改');
    } catch (error) {
        if (error.statusCode === 404) {
            return errorResponse(res, '作品记录不存在', 404);
        }
        console.error('设置作品积分错误:', error);
        return errorResponse(res, '设置失败', 500);
    }
}

async function updateUserLevel(req, res) {
    try {
        const { userId } = req.params;
        const { level } = req.body;
        const operatorRole = req.user.role;

        // 只有超级管理员可以修改用户等级
        if (operatorRole !== 'superadmin') {
            return errorResponse(res, '只有超级管理员可以修改用户等级', 403);
        }

        const numLevel = Number(level);
        if (!Number.isInteger(numLevel) || numLevel < 1 || numLevel > 100) {
            return errorResponse(res, '等级必须是1-100之间的整数', 400);
        }
        
        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }
        
        const oldLevel = user.level || 1;
        await DbAdapter.update(User, { level }, { where: { id: userId } });
        logOperation(req, 'update_user_level', 'user', userId, { oldLevel, newLevel: level });
        
        return successResponse(res, { id: DbAdapter.getId(user), level }, '用户等级已更改');
    } catch (error) {
        console.error('更新用户等级错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function deleteStudio(req, res) {
    try {
        const { id } = req.params;

        const studio = await DbAdapter.findByPk(Studio, id);
        if (!studio) {
            return errorResponse(res, '工作室不存在', 404);
        }

        // 多表关联删除必须用事务包裹，任一步失败整体回滚（与 studioController.deleteStudio 保持一致）
        // Bug-6: 同时清理 Notification 中 related_type='studio' 的记录,避免解散后死链
        await sequelize.transaction(async (t) => {
            await DbAdapter.destroy(Notification, { where: { related_id: Number(id), related_type: 'studio' }, transaction: t });
            await DbAdapter.destroy(StudioPointLog, { where: { studio_id: id }, transaction: t });
            await DbAdapter.destroy(StudioMember, { where: { studio_id: id }, transaction: t });
            await DbAdapter.destroy(StudioWork, { where: { studio_id: id }, transaction: t });
            await DbAdapter.destroy(Studio, { where: { id: DbAdapter.getId(studio) }, transaction: t });
        });

        logOperation(req, 'delete_studio', 'studio', id);
        return successResponse(res, null, '工作室已删除');
    } catch (error) {
        console.error('删除工作室错误', error);
        return errorResponse(res, '删除失败', 500);
    }
}

async function getStudioDetail(req, res) {
    try {
        const { id } = req.params;
        
        const studio = await DbAdapter.findByPk(Studio, id, {
            include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'nickname', 'avatar'] }]
        });
        if (!studio) {
            return errorResponse(res, '工作室不存在', 404);
        }
        
        const members = await DbAdapter.findAll(StudioMember, {
            where: { studio_id: id, status: 'active' },
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'nickname', 'avatar'] }],
            order: [['role', 'ASC']]
        });

        // 修复: 单独查询待审核成员,不混入正式成员列表
        const pendingMembers = await DbAdapter.findAll(StudioMember, {
            where: { studio_id: id, status: 'pending' },
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'nickname', 'avatar'] }],
            order: [['joined_at', 'ASC']]
        });
        
        const studioWorks = await DbAdapter.findAll(StudioWork, {
            where: { studio_id: id },
            include: [{ model: Work, as: 'work', include: [{ model: User, as: 'author', attributes: ['id', 'nickname'] }] }],
            order: [['added_at', 'DESC']],
            limit: 50
        });

        const pointLogs = await DbAdapter.findAll(StudioPointLog, {
            where: { studio_id: id },
            include: [{ model: User, as: 'admin', attributes: ['id', 'username', 'nickname'] }],
            order: [['created_at', 'DESC']],
            limit: 100
        });
        
        logOperation(req, 'view_studio_detail', 'studio', id, { name: studio.name });
        
        return successResponse(res, {
            studio,
            owner: studio.owner,
            // 修复: 显式结构化成员数据,确保 user_id 不被 user.id 覆盖
            members: members.filter(m => m.user).map(m => ({
                id: m.id,
                studio_id: m.studio_id,
                user_id: m.user_id,
                role: m.role,
                status: m.status,
                joined_at: m.joined_at,
                user: m.user.toJSON(),
                // 扁平兼容字段(防止旧前端取不到嵌套 user)
                nickname: m.user.nickname,
                username: m.user.username,
                avatar: m.user.avatar,
                codemao_user_id: m.user.codemao_user_id
            })),
            pendingMembers: pendingMembers.filter(m => m.user).map(m => ({
                id: m.id,
                studio_id: m.studio_id,
                user_id: m.user_id,
                role: m.role,
                status: m.status,
                joined_at: m.joined_at,
                user: m.user.toJSON()
            })),
            works: studioWorks.filter(sw => sw.work).map(sw => ({
                ...sw.work.toJSON(),
                studio_work_id: sw.id,
                studio_score: sw.score || 0,
                studio_work_status: sw.status,
                added_at: sw.added_at
            })),
            pointLogs: pointLogs.map(log => ({
                id: log.id,
                delta: log.delta,
                points_before: log.points_before,
                points_after: log.points_after,
                note: log.note,
                ip_address: log.ip_address,
                created_at: log.created_at,
                admin: log.admin ? log.admin.toJSON() : null
            }))
        });
    } catch (error) {
        console.error('获取工作室详情错误', error);
        return errorResponse(res, '获取工作室详情失败', 500);
    }
}

async function updateStudioMember(req, res) {
    try {
        const { studioId, userId } = req.params;
        const { role } = req.body;

        if (!['owner', 'vice_owner', 'admin', 'member'].includes(role)) {
            return errorResponse(res, '无效的角色值', 400);
        }

        // 修复: 禁止通过此接口将成员提升为 owner,避免制造"伪室长"
        // owner 只能通过专门的转移流程(同时更新 Studio.owner_id)变更
        if (role === 'owner') {
            return errorResponse(res, '不能通过此接口设置室长，请使用专门的室长转移流程', 400);
        }

        const member = await DbAdapter.findOne(StudioMember, {
            where: { studio_id: studioId, user_id: userId }
        });
        if (!member) {
            return errorResponse(res, '成员不存在', 404);
        }

        if (member.role === 'owner') {
            return errorResponse(res, '不能修改室长角色', 400);
        }
        
        // Bug-7: 修改角色为 vice_owner 时需同步 Studio.vice_owner_id,与 studioController.setMemberRole 一致
        if (role === 'vice_owner') {
            const studio = await DbAdapter.findByPk(Studio, studioId);
            await sequelize.transaction(async (t) => {
                // 降级旧副室长
                if (studio && studio.vice_owner_id && String(studio.vice_owner_id) !== String(userId)) {
                    await DbAdapter.update(StudioMember, { role: 'member' }, {
                        where: { studio_id: studioId, user_id: studio.vice_owner_id },
                        transaction: t
                    });
                }
                await DbAdapter.update(StudioMember, { role }, { where: { id: DbAdapter.getId(member) }, transaction: t });
                await DbAdapter.update(Studio, { vice_owner_id: userId }, { where: { id: studioId }, transaction: t });
            });
        } else {
            // 降级时清除 vice_owner_id
            if (member.role === 'vice_owner') {
                const studio = await DbAdapter.findByPk(Studio, studioId);
                if (studio && String(studio.vice_owner_id) === String(userId)) {
                    await DbAdapter.update(Studio, { vice_owner_id: null }, { where: { id: studioId } });
                }
            }
            await DbAdapter.update(StudioMember, { role }, { where: { id: DbAdapter.getId(member) } });
        }
        logOperation(req, 'update_studio_member', 'studio_member', DbAdapter.getId(member), { role });
        
        return successResponse(res, null, '成员角色已更改');
    } catch (error) {
        console.error('更新成员角色错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

async function reviewStudioMember(req, res) {
    try {
        const { studioId, userId } = req.params;
        const { action } = req.body;

        if (!['approve', 'reject'].includes(action)) {
            return errorResponse(res, '无效的操作', 400);
        }

        const member = await DbAdapter.findOne(StudioMember, {
            where: { studio_id: studioId, user_id: userId }
        });
        if (!member) {
            return errorResponse(res, '成员不存在', 404);
        }

        if (member.status !== 'pending') {
            return errorResponse(res, '该申请已处理', 400);
        }

        const newStatus = action === 'approve' ? 'active' : 'rejected';
        await DbAdapter.update(StudioMember, { status: newStatus }, { where: { id: DbAdapter.getId(member) } });

        logOperation(req, 'review_studio_member', 'studio_member', DbAdapter.getId(member), { action, status: newStatus });

        return successResponse(res, null, action === 'approve' ? '已通过申请' : '已拒绝申请');
    } catch (error) {
        console.error('审核工作室成员错误:', error);
        return errorResponse(res, '审核失败', 500);
    }
}

async function removeStudioMember(req, res) {
    try {
        const { studioId, userId } = req.params;

        const member = await DbAdapter.findOne(StudioMember, {
            where: { studio_id: studioId, user_id: userId }
        });
        if (!member) {
            return errorResponse(res, '成员不存在', 404);
        }

        if (member.role === 'owner') {
            return errorResponse(res, '不能移除室长', 400);
        }

        const wasActive = member.status === 'active';
        await sequelize.transaction(async (t) => {
            // Bug-8: 清理该用户在该工作室的 StudioWork 记录,与 studioController.leaveStudio/kickMember 一致
            const removedStudioWorks = await DbAdapter.findAll(StudioWork, {
                where: { studio_id: studioId, user_id: userId, status: 'approved' },
                attributes: ['id'],
                transaction: t
            });
            await DbAdapter.destroy(StudioWork, { where: { studio_id: studioId, user_id: userId }, transaction: t });

            await DbAdapter.destroy(StudioMember, { where: { id: DbAdapter.getId(member) }, transaction: t });
            const studio = await DbAdapter.findByPk(Studio, studioId, { transaction: t });
            if (studio && wasActive && (studio.member_count || 0) > 0) {
                await DbAdapter.decrement(studio, 'member_count', { transaction: t });
            }
            // 如果被移除者是副室长，清除引用
            if (studio && String(studio.vice_owner_id) === String(userId)) {
                await DbAdapter.update(Studio, { vice_owner_id: null }, { where: { id: DbAdapter.getId(studio) }, transaction: t });
            }
            // Bug-8: 如果有已通过审核的作品被移除,重算工作室 work_count 和 total_score
            // 修复: 此前只重算 work_count 不重算 total_score,导致工作室总分漂移且无法通过 repair-counts 恢复
            if (removedStudioWorks.length > 0 && studio) {
                const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: studioId, status: 'approved' }, transaction: t });
                const approvedScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: studioId, status: 'approved' }, transaction: t }) || 0;
                await DbAdapter.update(Studio, { work_count: approvedCount, total_score: approvedScore }, { where: { id: DbAdapter.getId(studio) }, transaction: t });
            }
        });

        logOperation(req, 'remove_studio_member', 'studio_member', DbAdapter.getId(member));
        return successResponse(res, null, '成员已移除');
    } catch (error) {
        console.error('移除成员错误:', error);
        return errorResponse(res, '移除失败', 500);
    }
}

async function removeStudioWork(req, res) {
    try {
        const { studioId, workId } = req.params;

        const studioWork = await DbAdapter.findOne(StudioWork, {
            where: { studio_id: studioId, work_id: workId }
        });
        if (!studioWork) {
            return errorResponse(res, '作品不存在于工作室', 404);
        }

        const wasApproved = studioWork.status === 'approved';
        // Bug-9: destroy + recompute work_count/total_score 需事务包裹，保证一致性
        await sequelize.transaction(async (t) => {
            await DbAdapter.destroy(StudioWork, { where: { id: DbAdapter.getId(studioWork) }, transaction: t });

            if (wasApproved) {
                const studio = await DbAdapter.findByPk(Studio, studioId, { transaction: t });
                if (studio) {
                    const workCount = await DbAdapter.count(StudioWork, { where: { studio_id: studioId, status: 'approved' }, transaction: t });
                    const totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: studioId, status: 'approved' }, transaction: t }) || 0;
                    await DbAdapter.update(Studio, { work_count: workCount, total_score: totalScore }, { where: { id: DbAdapter.getId(studio) }, transaction: t });
                }
            }
        });

        logOperation(req, 'remove_studio_work', 'studio_work', DbAdapter.getId(studioWork));
        return successResponse(res, null, '作品已移除');
    } catch (error) {
        console.error('移除作品错误:', error);
        return errorResponse(res, '移除失败', 500);
    }
}

async function sendUserNotification(req, res) {
    try {
        const { userId } = req.params;
        const { title, content, useAdminAvatar, showAdminName } = req.body;

        if (!title || !content) {
            return errorResponse(res, '标题和内容不能为空', 400);
        }

        const user = await DbAdapter.findByPk(User, userId);
        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        // 修复:站内信格式优化――明确标注站内信,管理员名称与标题间加空格
        const adminName = req.user.nickname || req.user.username;
        let notificationTitle = title;

        if (showAdminName) {
            notificationTitle = `【站内信】${adminName}：${title}`;
        } else {
            notificationTitle = `【站内信】${title}`;
        }

        await DbAdapter.create(Notification, {
            user_id: userId,
            type: 'system',
            title: notificationTitle,
            content,
            sender_id: DbAdapter.getId(req.user),
            meta: JSON.stringify({ useAdminAvatar: !!useAdminAvatar, showAdminName: !!showAdminName })
        });

        logOperation(req, 'send_notification', 'user', userId, { title });
        return successResponse(res, null, '站内信发送成功');
    } catch (error) {
        console.error('发送站内信错误:', error);
        return errorResponse(res, '发送失败', 500);
    }
}

async function sendBatchNotifications(req, res) {
    try {
        const { userIds, title, content } = req.body;
        
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return errorResponse(res, '请选择接收用户', 400);
        }

        if (userIds.length > 500) {
            return errorResponse(res, '单次最多发送500条通知', 400);
        }

        if (!title || !content) {
            return errorResponse(res, '标题和内容不能为空', 400);
        }
        
        const notifications = userIds.map(userId => ({
            user_id: userId,
            type: 'system',
            title,
            content,
            sender_id: DbAdapter.getId(req.user)
        }));
        
        await DbAdapter.bulkCreate(Notification, notifications);
        
        logOperation(req, 'send_batch_notifications', 'notification', null, { count: userIds.length, title });
        return successResponse(res, { count: userIds.length }, `成功发送给 ${userIds.length} 个用户`);
    } catch (error) {
        console.error('批量发送站内信错误:', error);
        return errorResponse(res, '发送失败', 500);
    }
}

async function sendAllUsersNotification(req, res) {
    try {
        const { title, content } = req.body;
        
        if (!title || !content) {
            return errorResponse(res, '标题和内容不能为空', 400);
        }
        
        const users = await DbAdapter.findAll(User, {
            where: { status: 'active' },
            attributes: ['id']
        });
        
        if (users.length === 0) {
            return errorResponse(res, '没有可发送的用户', 400);
        }
        
        const notifications = users.map(user => ({
            user_id: DbAdapter.getId(user),
            type: 'system',
            title,
            content,
            sender_id: DbAdapter.getId(req.user)
        }));
        
        await DbAdapter.bulkCreate(Notification, notifications);
        
        logOperation(req, 'send_all_notification', 'notification', null, { count: users.length, title });
        return successResponse(res, { count: users.length }, `成功发送给全部 ${users.length} 个用户`);
    } catch (error) {
        console.error('全员发送站内信错误:', error);
        return errorResponse(res, '发送失败', 500);
    }
}

async function updateStudioPoints(req, res) {
    try {
        const { id } = req.params;
        const { points, action = 'add', note } = req.body;
        const cleanNote = String(note || '').trim();
        
        const parsedPoints = parseInt(points, 10);
        if (!Number.isFinite(parsedPoints) || parsedPoints === 0 || parsedPoints < -10000 || parsedPoints > 10000) {
            return errorResponse(res, '积分必须是-10000 到 10000 之间的有效数字', 400);
        }
        if (!['add', 'subtract'].includes(action)) {
            return errorResponse(res, '无效的积分操作', 400);
        }
        if (cleanNote.length < 5 || cleanNote.length > 500) {
            return errorResponse(res, '积分备注必须为 5-500 个字符', 400);
        }

        // 修复: 使用事务 + SELECT FOR UPDATE 防止并发 read-modify-write 竞态
        // 原先读取 points → 内存相加 → 写回,并发两次加分只生效一次(丢失更新)
        let oldPoints, newPoints, newLevel;
        await sequelize.transaction(async (t) => {
            const studio = await DbAdapter.findByPk(Studio, id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!studio) {
                const err = new Error('工作室不存在');
                err.statusCode = 404;
                throw err;
            }
            oldPoints = studio.points || 0;
            const requestedDelta = action === 'subtract' ? -Math.abs(parsedPoints) : Math.abs(parsedPoints);
            newPoints = Math.max(0, oldPoints + requestedDelta);
            const actualDelta = newPoints - oldPoints;
            newLevel = Math.min(10, Math.floor(newPoints / 100) + 1);
            await DbAdapter.update(Studio, { points: newPoints, level: newLevel }, { where: { id }, transaction: t });
            await DbAdapter.create(StudioPointLog, {
                studio_id: Number(id),
                admin_id: DbAdapter.getId(req.user),
                delta: actualDelta,
                points_before: oldPoints,
                points_after: newPoints,
                note: cleanNote,
                ip_address: req.ip || req.socket?.remoteAddress || 'unknown'
            }, { transaction: t });
        });

        await logOperation(req, 'update_studio_points', 'studio', id, {
            oldPoints,
            newPoints,
            delta: newPoints - oldPoints,
            action,
            note: cleanNote
        });

        const updatedStudio = await DbAdapter.findByPk(Studio, id);
        return successResponse(res, updatedStudio, '积分已更改');
    } catch (error) {
        if (error.statusCode === 404) {
            return errorResponse(res, '工作室不存在', 404);
        }
        console.error('更新工作室积分错误', error);
        return errorResponse(res, '更新失败', 500);
    }
}

module.exports = {
    getStats,
    getUsers,
    getUserDetail,
    updateUserStatus,
    updateUserRole,
    updateUserPassword,
    deleteUser,
    getWorks,
    setWorkFeatured,
    deleteWork,
    purgeWork,
    crawlWork,
    crawlHotWorks,
    crawlUserWorks,
    crawlPostWorks,
    crawlBanners,
    getCrawlLogs: getCrawlLogsApi,
    getRealtimeLogs,
    clearRealtimeLogs,
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    getComments,
    updateCommentStatus,
    deleteComment,
    getReports,
    handleReport,
    getReportAuditLogs,
    getProxyConfig,
    updateProxyConfig,
    testProxy,
    refreshProxy,
    getIpBans,
    addIpBan,
    removeIpBan,
    getTrends,
    getRoles,
    getAdminUsers,
    getAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getSystemConfigs,
    updateSystemConfig,
    batchUpdateConfigs,
    getOperationLogs,
    getOperationLogOptions,
    getSensitiveWords,
    addSensitiveWord,
    updateSensitiveWord,
    deleteSensitiveWord,
    batchImportSensitiveWords,
    aiReviewReport,
    aiBatchReviewReports,
    aiAutoHandleReports,
    testSensitiveCheck,
    getPermissions,
    getRolePermissionsList,
    updateRolePermissions,
    resetRolePermissions,
    getCaptchaStats,
    getStudios,
    getStudioDetail,
    updateStudio,
    updateStudioStatus,
    updateStudioMember,
    removeStudioMember,
    reviewStudioMember,
    removeStudioWork,
    deleteStudio,
    sendUserNotification,
    sendBatchNotifications,
    sendAllUsersNotification,
    getDuplicateReportGroups,
    mergeReports,
    getUserCodemaoToken,
    updateStudioPoints,
    setWorkScore,
    updateUserLevel,
    updateUser,
    impersonateUser,
    restoreFromImpersonate,
    updateWork,
    getForumOverview,
    getForumAttentionSettings,
    updateForumAttentionSettings,
    getForumBoards,
    getForumBoardModerators,
    assignForumBoardModerator,
    removeForumBoardModerator,
    getPostHistory,
    restorePostRevision,
    movePost,
    mergePosts,
    createForumBoard,
    updateForumBoard,
    deleteForumBoard,
    updatePost,
    getPosts,
    getPendingReviewPosts,
    reviewPendingPost,
    deletePost,
    setPostEssence,
    setPostTop,
    recalibrateAllWorks,
    getRecalibrationJob,
    applyRecalibrationJob
};

/**
 * 安全校准任务：先只读扫描并保存差异快照，确认后才应用。
 * 任务保存在内存中且有过期时间；服务重启后自然失效，不会误应用旧计划。
 */
const recalibrationJobs = new Map();
const RECALIBRATION_JOB_TTL = 30 * 60 * 1000;
let activeRecalibrationJobId = null;

function publicRecalibrationJob(job) {
    return {
        id: job.id,
        phase: job.phase,
        status: job.status,
        total: job.total,
        processed: job.processed,
        changedCount: job.changes.length,
        unchangedCount: job.unchangedCount,
        failedCount: job.failures.length,
        conflictCount: job.conflictCount || 0,
        appliedCount: job.appliedCount || 0,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
        // 只返回有限样例，避免大型站点把整个计划塞进响应。
        changes: job.changes.slice(0, 100),
        failures: job.failures.slice(0, 100)
    };
}

function cleanExpiredRecalibrationJobs() {
    const now = Date.now();
    for (const [id, job] of recalibrationJobs) {
        if (job.expiresAt <= now && job.status !== 'running') recalibrationJobs.delete(id);
    }
}

async function recalibrateAllWorks(req, res) {
    try {
        cleanExpiredRecalibrationJobs();
        if (activeRecalibrationJobId) {
            const active = recalibrationJobs.get(activeRecalibrationJobId);
            if (active?.status === 'running') {
                return errorResponse(res, '已有校准任务正在运行，请等待完成', 409);
            }
            activeRecalibrationJobId = null;
        }

        const works = await DbAdapter.findAll(Work);
        const jobId = crypto.randomUUID();
        const job = {
            id: jobId,
            ownerId: String(req.user.id),
            phase: 'preview', status: 'running', total: works.length, processed: 0,
            changes: [], failures: [], unchangedCount: 0, conflictCount: 0, appliedCount: 0,
            createdAt: Date.now(), expiresAt: Date.now() + RECALIBRATION_JOB_TTL
        };
        recalibrationJobs.set(jobId, job);
        activeRecalibrationJobId = jobId;

        // 脱离当前 HTTP 请求在后台扫描；此阶段绝不写数据库。
        void (async () => {
          try {
            for (const work of works) {
            try {
                if (!work.codemao_work_id) {
                    job.failures.push({ id: DbAdapter.getId(work), reason: '缺少编程猫作品 ID' });
                    job.processed++;
                    continue;
                }

                const workDetail = await codemaoApi.getWorkDetail(work.codemao_work_id);
                if (!workDetail?.id) {
                    job.failures.push({ id: DbAdapter.getId(work), codemaoWorkId: work.codemao_work_id, reason: 'API 未返回有效作品' });
                    job.processed++;
                    continue;
                }

                const proposed = {
                    type: workDetail.type || work.type || 'KITTEN',
                    ide_type: workDetail.ide_type || work.ide_type || 'KITTEN',
                    work_url: buildCodemaoPlayerUrl({ workId: workDetail.id, playerUrl: workDetail.player_url, type: workDetail.type, ideType: workDetail.ide_type || work.ide_type })
                };
                const oldValues = { type: work.type, ide_type: work.ide_type, work_url: work.work_url };
                const changed = Object.keys(proposed).some(key => String(proposed[key] || '') !== String(oldValues[key] || ''));
                if (changed) {
                    job.changes.push({ id: DbAdapter.getId(work), codemaoWorkId: work.codemao_work_id, name: work.name, oldValues, newValues: proposed, apiPlayerUrl: Boolean(workDetail.player_url) });
                } else {
                    job.unchangedCount++;
                }
            } catch (e) {
                job.failures.push({ id: DbAdapter.getId(work), codemaoWorkId: work.codemao_work_id, reason: e.message });
            }
            job.processed++;
            // 保守限速为每秒最多约 2 次请求。
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          job.status = 'ready';
          job.expiresAt = Date.now() + RECALIBRATION_JOB_TTL;
          } catch (error) {
            job.status = 'failed';
            job.failures.push({ reason: error.message });
          } finally {
            if (activeRecalibrationJobId === job.id) activeRecalibrationJobId = null;
          }
        })();

        logOperation(req, 'preview_recalibrate_works', 'work', 'all', { jobId, total: works.length });
        return successResponse(res, publicRecalibrationJob(job), '已开始只读扫描，不会修改数据库');
    } catch (error) {
        console.error('重新校准作品错误:', error);
        return errorResponse(res, '校准失败', 500);
    }
}

async function getRecalibrationJob(req, res) {
    cleanExpiredRecalibrationJobs();
    const job = recalibrationJobs.get(req.params.jobId);
    if (!job || job.ownerId !== String(req.user.id)) return errorResponse(res, '校准任务不存在或已过期', 404);
    return successResponse(res, publicRecalibrationJob(job));
}

async function applyRecalibrationJob(req, res) {
    cleanExpiredRecalibrationJobs();
    const job = recalibrationJobs.get(req.params.jobId);
    if (!job || job.ownerId !== String(req.user.id)) return errorResponse(res, '校准任务不存在或已过期', 404);
    if (job.phase !== 'preview' || job.status !== 'ready') return errorResponse(res, '扫描尚未完成或任务已应用', 409);
    if (activeRecalibrationJobId) return errorResponse(res, '已有校准任务正在运行', 409);

    job.phase = 'apply'; job.status = 'running'; job.processed = 0;
    activeRecalibrationJobId = job.id;
    void (async () => {
      try {
        for (const change of job.changes) {
          try {
            const current = await DbAdapter.findByPk(Work, change.id);
            if (!current) { job.conflictCount++; job.processed++; continue; }
            // 乐观并发检查：扫描后被人工修改过的数据绝不覆盖。
            const stale = ['type', 'ide_type', 'work_url'].some(key => String(current[key] || '') !== String(change.oldValues[key] || ''));
            if (stale) { job.conflictCount++; job.processed++; continue; }
            await DbAdapter.update(Work, change.newValues, { where: { id: change.id } });
            job.appliedCount++;
          } catch (error) {
            job.failures.push({ id: change.id, codemaoWorkId: change.codemaoWorkId, reason: `应用失败: ${error.message}` });
          }
          job.processed++;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        job.status = 'completed';
        job.expiresAt = Date.now() + RECALIBRATION_JOB_TTL;
        logOperation(req, 'apply_recalibrate_works', 'work', 'all', { jobId: job.id, appliedCount: job.appliedCount, conflictCount: job.conflictCount, failedCount: job.failures.length });
      } catch (error) {
        job.status = 'failed';
        job.failures.push({ reason: error.message });
      } finally {
        if (activeRecalibrationJobId === job.id) activeRecalibrationJobId = null;
      }
    })();
    return successResponse(res, publicRecalibrationJob(job), '已开始应用确认过的校准计划');
}

/**
 * 获取帖子列表 (管理)
 */
async function getForumBoards(req, res) {
    try {
        const boards = await ForumBoard.findAll({ order: [['sort_order', 'ASC'], ['id', 'ASC']] });
        const data = await Promise.all(boards.map(async board => ({
            ...board.toJSON(),
            post_count: await Post.count({ where: { board_id: board.id, status: { [Op.ne]: 'deleted' } } })
        })));
        return successResponse(res, data);
    } catch (error) {
        console.error('获取论坛板块管理列表失败:', error);
        return errorResponse(res, '获取板块失败', 500);
    }
}

async function getForumBoardModerators(req, res) {
    try {
        const board = await ForumBoard.findByPk(Number(req.params.boardId), { attributes: ['id', 'name'] });
        if (!board) return errorResponse(res, '板块不存在', 404);
        const assignments = await ForumBoardModerator.findAll({
            where: { board_id: board.id },
            include: [{ model: User, as: 'user', required: true, attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'role', 'status'] }],
            order: [['created_at', 'ASC']]
        });
        return successResponse(res, assignments);
    } catch (error) {
        console.error('获取板块版主失败:', error);
        return errorResponse(res, '获取板块版主失败', 500);
    }
}

async function assignForumBoardModerator(req, res) {
    try {
        const boardId = Number(req.params.boardId);
        const userId = Number(req.body?.user_id);
        const note = String(req.body?.note || '').trim();
        if (!Number.isInteger(userId) || userId <= 0) return errorResponse(res, '请选择有效用户', 400);
        if (note.length > 300) return errorResponse(res, '备注不能超过 300 个字', 400);
        const [board, user] = await Promise.all([ForumBoard.findByPk(boardId), User.findByPk(userId)]);
        if (!board) return errorResponse(res, '板块不存在', 404);
        if (!user || user.status !== 'active') return errorResponse(res, '用户不存在或已被禁用', 404);
        if (user.role !== 'moderator') return errorResponse(res, '只有角色为“版主”的账号可以分配到板块', 400);
        const [assignment, created] = await ForumBoardModerator.findOrCreate({
            where: { board_id: boardId, user_id: userId },
            defaults: { assigned_by: DbAdapter.getId(req.user), note }
        });
        if (!created) await assignment.update({ assigned_by: DbAdapter.getId(req.user), note });
        logOperation(req, created ? 'assign_forum_board_moderator' : 'update_forum_board_moderator', 'forum_board', boardId, { user_id: userId, note });
        return successResponse(res, assignment, created ? '板块版主已分配' : '板块版主设置已更新');
    } catch (error) {
        console.error('分配板块版主失败:', error);
        return errorResponse(res, '分配板块版主失败', 500);
    }
}

async function removeForumBoardModerator(req, res) {
    try {
        const boardId = Number(req.params.boardId);
        const userId = Number(req.params.userId);
        const deleted = await ForumBoardModerator.destroy({ where: { board_id: boardId, user_id: userId } });
        if (!deleted) return errorResponse(res, '该板块版主分配不存在', 404);
        logOperation(req, 'remove_forum_board_moderator', 'forum_board', boardId, { user_id: userId });
        return successResponse(res, null, '板块版主已移除');
    } catch (error) {
        console.error('移除板块版主失败:', error);
        return errorResponse(res, '移除板块版主失败', 500);
    }
}

async function movePost(req, res) {
    try {
        const postId = Number(req.params.postId);
        const boardId = Number(req.body?.board_id);
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3 || reason.length > 500) return errorResponse(res, '移动原因需要 3-500 个字', 400);
        const [post, board] = await Promise.all([Post.findByPk(postId), ForumBoard.findOne({ where: { id: boardId, status: 'active' } })]);
        if (!post || post.status === 'deleted') return errorResponse(res, '帖子不存在', 404);
        if (!board) return errorResponse(res, '目标板块不存在或已停用', 400);
        if (!(await canModerateBoard(req.user, board.id))) return errorResponse(res, '您没有目标板块的管理权限', 403);
        if (Number(post.board_id) === boardId) return errorResponse(res, '帖子已经位于该板块', 400);
        const before = snapshotPost(post);
        await sequelize.transaction(async transaction => {
            await post.update({ board_id: board.id, category: board.slug }, { transaction });
            await recordPostRevision(post, DbAdapter.getId(req.user), 'moderator', reason, { transaction });
            await recordModerationLog(post.id, DbAdapter.getId(req.user), 'move_post', reason, before, snapshotPost(post), { transaction });
        });
        logOperation(req, 'move_post', 'post', postId, { from_board_id: before.board_id, to_board_id: board.id, reason });
        return successResponse(res, post, '帖子已移动');
    } catch (error) {
        console.error('移动帖子失败:', error);
        return errorResponse(res, '移动帖子失败', 500);
    }
}

async function mergePosts(req, res) {
    try {
        const sourceId = Number(req.params.postId);
        const targetId = Number(req.body?.target_post_id);
        const reason = String(req.body?.reason || '').trim();
        if (!Number.isInteger(targetId) || targetId <= 0 || targetId === sourceId) return errorResponse(res, '请选择不同的有效目标帖子', 400);
        if (reason.length < 3 || reason.length > 500) return errorResponse(res, '合并原因需要 3-500 个字', 400);
        const [source, target] = await Promise.all([Post.findByPk(sourceId), Post.findByPk(targetId)]);
        if (!source || !target || source.status === 'deleted' || target.status !== 'published') return errorResponse(res, '源帖子或目标帖子不存在', 404);
        if (!(await canModerateBoard(req.user, target.board_id))) return errorResponse(res, '您没有目标帖子所在板块的管理权限', 403);
        const sourceStatus = source.status;

        await sequelize.transaction(async transaction => {
            const [sourceLikes, sourceFavorites, sourceSubscriptions] = await Promise.all([
                Like.findAll({ where: { post_id: sourceId }, attributes: ['user_id'], raw: true, transaction }),
                Favorite.findAll({ where: { post_id: sourceId }, attributes: ['user_id'], raw: true, transaction }),
                PostSubscription.findAll({ where: { post_id: sourceId }, attributes: ['user_id', 'notify', 'last_read_at'], raw: true, transaction })
            ]);
            if (sourceLikes.length) await Like.bulkCreate(sourceLikes.map(item => ({ user_id: item.user_id, post_id: targetId })), { ignoreDuplicates: true, transaction });
            if (sourceFavorites.length) await Favorite.bulkCreate(sourceFavorites.map(item => ({ user_id: item.user_id, post_id: targetId })), { ignoreDuplicates: true, transaction });
            if (sourceSubscriptions.length) await PostSubscription.bulkCreate(sourceSubscriptions.map(item => ({ user_id: item.user_id, post_id: targetId, notify: item.notify, last_read_at: item.last_read_at })), { ignoreDuplicates: true, transaction });
            await Promise.all([
                Comment.update({ post_id: targetId }, { where: { post_id: sourceId }, transaction }),
                Like.destroy({ where: { post_id: sourceId }, transaction }),
                Favorite.destroy({ where: { post_id: sourceId }, transaction }),
                PostSubscription.destroy({ where: { post_id: sourceId }, transaction }),
                Notification.update({ related_id: targetId }, { where: { related_type: 'post', related_id: sourceId }, transaction })
            ]);

            const [commentCount, replyCount, likeCount, favoriteCount, participantCount, lastComment] = await Promise.all([
                Comment.count({ where: { post_id: targetId, status: 'active', parent_id: null }, transaction }),
                Comment.count({ where: { post_id: targetId, status: 'active' }, transaction }),
                Like.count({ where: { post_id: targetId }, transaction }),
                Favorite.count({ where: { post_id: targetId }, transaction }),
                Comment.count({ where: { post_id: targetId, status: 'active', user_id: { [Op.ne]: target.user_id } }, distinct: true, col: 'user_id', transaction }),
                Comment.findOne({ where: { post_id: targetId, status: 'active' }, order: [['created_at', 'DESC']], transaction })
            ]);
            await target.update({
                comment_count: commentCount, reply_count: replyCount, like_count: likeCount, collection_count: favoriteCount,
                participant_count: Math.max(1, participantCount + (Number(target.user_id) ? 1 : 0)),
                last_comment_id: lastComment?.id || null, last_reply_at: lastComment?.created_at || target.created_at,
                last_reply_user_id: lastComment?.user_id || target.user_id,
                accepted_comment_id: target.accepted_comment_id || source.accepted_comment_id || null
            }, { transaction });
            await source.update({
                status: 'deleted', merged_into_post_id: targetId, is_top: false, is_essence: false,
                comment_count: 0, reply_count: 0, like_count: 0, collection_count: 0
            }, { transaction });
            await recordModerationLog(sourceId, DbAdapter.getId(req.user), 'merge_post_source', reason, { status: sourceStatus }, { status: 'deleted', merged_into_post_id: targetId }, { transaction });
            await recordModerationLog(targetId, DbAdapter.getId(req.user), 'merge_post_target', reason, { merged_source_id: null }, { merged_source_id: sourceId }, { transaction });
        });
        logOperation(req, 'merge_posts', 'post', sourceId, { target_post_id: targetId, reason });
        invalidateForumReputation();
        return successResponse(res, { source_post_id: sourceId, target_post_id: targetId }, '主题已安全合并');
    } catch (error) {
        console.error('合并帖子失败:', error);
        return errorResponse(res, '合并帖子失败', 500);
    }
}

async function getPostHistory(req, res) {
    try {
        const postId = Number(req.params.postId);
        const post = await Post.findByPk(postId, { attributes: ['id', 'title', 'status'] });
        if (!post) return errorResponse(res, '帖子不存在', 404);
        const [revisions, moderationLogs] = await Promise.all([
            PostRevision.findAll({
                where: { post_id: postId },
                include: [{ model: User, as: 'editor', required: false, attributes: ['id', 'username', 'nickname', 'avatar'] }],
                order: [['revision_number', 'DESC']]
            }),
            ForumModerationLog.findAll({
                where: { post_id: postId },
                include: [{ model: User, as: 'operator', required: false, attributes: ['id', 'username', 'nickname', 'avatar'] }],
                order: [['created_at', 'DESC']]
            })
        ]);
        const logs = moderationLogs.map(log => {
            const item = log.toJSON();
            try { item.before_state = item.before_state ? JSON.parse(item.before_state) : null; } catch {}
            try { item.after_state = item.after_state ? JSON.parse(item.after_state) : null; } catch {}
            return item;
        });
        return successResponse(res, { post, revisions, moderation_logs: logs });
    } catch (error) {
        console.error('获取帖子历史失败:', error);
        return errorResponse(res, '获取帖子历史失败', 500);
    }
}

async function restorePostRevision(req, res) {
    try {
        const postId = Number(req.params.postId);
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3 || reason.length > 500) return errorResponse(res, '回滚原因需为 3-500 字', 400);
        const [post, revision] = await Promise.all([
            Post.findByPk(postId),
            PostRevision.findOne({ where: { id: Number(req.params.revisionId), post_id: postId } })
        ]);
        if (!post || !revision) return errorResponse(res, '帖子或修订版本不存在', 404);
        if (revision.board_id) {
            const board = await ForumBoard.findOne({ where: { id: revision.board_id, status: 'active' } });
            if (!board) return errorResponse(res, '该历史版本所属板块已停用，请先移动帖子后再回滚', 400);
            if (!(await canModerateBoard(req.user, board.id))) return errorResponse(res, '您没有该历史版本所属板块的管理权限', 403);
        }
        const before = snapshotPost(post);
        await sequelize.transaction(async transaction => {
            await post.update({
                title: revision.title, content: revision.content, board_id: revision.board_id,
                category: revision.post_type, post_type: revision.post_type, cover: revision.cover, tags: revision.tags
            }, { transaction });
            await recordPostRevision(post, DbAdapter.getId(req.user), 'rollback', reason, { transaction });
            await recordModerationLog(postId, DbAdapter.getId(req.user), 'restore_revision', reason, before, snapshotPost(post), { transaction });
        });
        logOperation(req, 'restore_post_revision', 'post', postId, { revision_id: revision.id, reason });
        return successResponse(res, null, '帖子已回滚到指定版本');
    } catch (error) {
        console.error('回滚帖子版本失败:', error);
        return errorResponse(res, '回滚帖子版本失败', 500);
    }
}

function normalizeForumBoardInput(body, partial = false) {
    const data = {};
    if (!partial || body.slug !== undefined) {
        const slug = String(body.slug || '').trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]{1,49}$/.test(slug)) return { error: '板块标识需为 2-50 位小写字母、数字或连字符' };
        data.slug = slug;
    }
    if (!partial || body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name || name.length > 50) return { error: '板块名称需为 1-50 字' };
        data.name = name;
    }
    if (body.description !== undefined) data.description = String(body.description || '').trim().slice(0, 300);
    if (body.icon !== undefined) data.icon = String(body.icon || '💬').trim().slice(0, 30) || '💬';
    if (body.color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(String(body.color))) return { error: '板块颜色格式无效' };
        data.color = String(body.color);
    }
    if (body.sort_order !== undefined) data.sort_order = Math.max(0, Math.min(9999, Number(body.sort_order) || 0));
    if (body.status !== undefined) {
        if (!['active', 'disabled'].includes(body.status)) return { error: '板块状态无效' };
        data.status = body.status;
    }
    if (body.allow_post_roles !== undefined) {
        const validRoles = ['user', 'reviewer', 'moderator', 'admin', 'superadmin'];
        if (!Array.isArray(body.allow_post_roles) || body.allow_post_roles.some(role => !validRoles.includes(role))) return { error: '发帖角色配置无效' };
        data.allow_post_roles = [...new Set(body.allow_post_roles)];
    }
    if (body.studio_recruitment_only !== undefined) data.studio_recruitment_only = !!body.studio_recruitment_only;
    return { data };
}

async function createForumBoard(req, res) {
    try {
        const parsed = normalizeForumBoardInput(req.body || {});
        if (parsed.error) return errorResponse(res, parsed.error, 400);
        const existing = await ForumBoard.findOne({ where: { slug: parsed.data.slug } });
        if (existing) return errorResponse(res, '板块标识已存在', 409);
        const board = await ForumBoard.create(parsed.data);
        logOperation(req, 'create_forum_board', 'forum_board', board.id, parsed.data);
        return successResponse(res, board, '板块已创建');
    } catch (error) {
        console.error('创建论坛板块失败:', error);
        return errorResponse(res, '创建板块失败', 500);
    }
}

async function updateForumBoard(req, res) {
    try {
        const board = await ForumBoard.findByPk(Number(req.params.boardId));
        if (!board) return errorResponse(res, '板块不存在', 404);
        const parsed = normalizeForumBoardInput(req.body || {}, true);
        if (parsed.error) return errorResponse(res, parsed.error, 400);
        if (parsed.data.slug && parsed.data.slug !== board.slug) {
            const duplicate = await ForumBoard.findOne({ where: { slug: parsed.data.slug, id: { [Op.ne]: board.id } } });
            if (duplicate) return errorResponse(res, '板块标识已存在', 409);
        }
        await board.update(parsed.data);
        if (parsed.data.status === 'disabled') await PostDraft.update({ board_id: null }, { where: { board_id: board.id } });
        logOperation(req, 'update_forum_board', 'forum_board', board.id, parsed.data);
        return successResponse(res, board, '板块已更新');
    } catch (error) {
        console.error('更新论坛板块失败:', error);
        return errorResponse(res, '更新板块失败', 500);
    }
}

async function deleteForumBoard(req, res) {
    try {
        const board = await ForumBoard.findByPk(Number(req.params.boardId));
        if (!board) return errorResponse(res, '板块不存在', 404);
        const postCount = await Post.count({ where: { board_id: board.id, status: { [Op.ne]: 'deleted' } } });
        if (postCount > 0) {
            await PostDraft.update({ board_id: null }, { where: { board_id: board.id } });
            await board.update({ status: 'disabled' });
            logOperation(req, 'disable_forum_board', 'forum_board', board.id, { post_count: postCount });
            return successResponse(res, { disabled: true, post_count: postCount }, '板块已有帖子，已安全停用而非删除');
        }
        await PostDraft.update({ board_id: null }, { where: { board_id: board.id } });
        await board.destroy();
        logOperation(req, 'delete_forum_board', 'forum_board', board.id, {});
        return successResponse(res, { deleted: true }, '板块已删除');
    } catch (error) {
        console.error('删除论坛板块失败:', error);
        return errorResponse(res, '删除板块失败', 500);
    }
}

async function getPosts(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const keyword = req.query.keyword || '';
        const category = req.query.category || '';
        const status = req.query.status || '';

        const where = {};
        if (req.user?.role === 'moderator') {
            const boardIds = await getModeratedBoardIds(req.user);
            where.board_id = { [Op.in]: boardIds || [] };
        }
        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['title', 'content'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        if (category) where.category = category;
        if (status) where.status = status;

        const { count, rows } = await DbAdapter.findAndCountAll(Post, {
            where,
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'username', 'nickname', 'avatar']
            }, {
                model: ForumModerationLog,
                as: 'moderation_logs',
                required: false,
                separate: true,
                order: [['created_at', 'DESC']]
            }],
            order: [['is_top', 'DESC'], ['created_at', 'DESC']],
            limit: pageSize,
            offset
        });

        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取帖子列表错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

/**
 * 获取待审查帖子（命中敏感词的帖子）
 * 查询 ForumModerationLog 中 action='sensitive_detected' 且 after_state.reviewed=false 的帖子
 * 分区版主只能查看自己负责的板块
 */
async function getPendingReviewPosts(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        // 构造待审查条件：存在 sensitive_detected 且未审核的日志
        const boardWhere = {};
        if (req.user?.role === 'moderator') {
            const boardIds = await getModeratedBoardIds(req.user);
            boardWhere.board_id = { [Op.in]: boardIds || [] };
        }
        // 数据库聚合：按 post_id 分组只取最新一条 sensitive_detected 日志。
        // 不加日期窗口，避免超期未处理的待审帖子从后台凭空消失；
        // 性能由 forum_moderation_logs 的 (action) / (post_id, created_at) 索引保障，
        // 且只把「每个候选帖子一条最新日志」取回内存，而非全部历史日志
        const latestRows = await ForumModerationLog.findAll({
            attributes: ['post_id', [sequelize.fn('MAX', sequelize.col('created_at')), 'latest_created']],
            where: { action: 'sensitive_detected' },
            group: ['post_id'],
            raw: true
        });
        if (!latestRows.length) return paginateResponse(res, [], 0, page, pageSize);
        // 用 (post_id, created_at) 精确取回每组最新日志的完整记录（含 after_state 判断是否已审核）
        const logs = await DbAdapter.findAll(ForumModerationLog, {
            where: {
                action: 'sensitive_detected',
                [Op.or]: latestRows.map(row => ({ post_id: row.post_id, created_at: row.latest_created }))
            }
        });
        // 过滤出仍未审核的帖子
        const pendingByPost = new Map();
        for (const log of logs) {
            if (pendingByPost.has(log.post_id)) continue;
            let afterState = null;
            try { afterState = JSON.parse(log.after_state || '{}'); } catch { afterState = {}; }
            if (!afterState.reviewed) pendingByPost.set(log.post_id, log);
        }
        const pendingPostIds = [...pendingByPost.keys()];
        if (!pendingPostIds.length) return paginateResponse(res, [], 0, page, pageSize);

        const { count, rows } = await DbAdapter.findAndCountAll(Post, {
            // 排除已删除帖子：用户自删后敏感词日志不会自动关闭，需保证 deleted 帖不进入待审专区
            where: { id: { [Op.in]: pendingPostIds }, status: { [Op.ne]: 'deleted' }, ...boardWhere },
            include: [{
                model: User, as: 'author', attributes: ['id', 'username', 'nickname', 'avatar']
            }, { model: ForumBoard, as: 'board', attributes: ['id', 'slug', 'name', 'icon', 'color'] }],
            order: [['created_at', 'DESC']],
            limit: pageSize, offset
        });
        // 把命中详情挂到行上
        const rowsWithFlag = rows.map(post => {
            const log = pendingByPost.get(post.id);
            let sensitiveInfo = null;
            if (log) {
                try { sensitiveInfo = JSON.parse(log.after_state || '{}'); } catch { sensitiveInfo = {}; }
            }
            return { ...post.toJSON(), sensitive_info: sensitiveInfo, sensitive_log_id: log?.id };
        });
        return paginateResponse(res, rowsWithFlag, count, page, pageSize);
    } catch (error) {
        console.error('获取待审查帖子错误:', error);
        return errorResponse(res, '获取失败', 500);
    }
}

/**
 * 审核待审查帖子（标记为已审核）
 * 记录完整审计：操作者、操作类型（通过/删除/忽略）、原因
 * 仅允许审核“在待审队列中”的帖子（存在未审核的 sensitive_detected 日志）
 */
async function reviewPendingPost(req, res) {
    try {
        const { postId } = req.params;
        const { action, reason } = req.body; // action: pass / delete / ignore
        if (!['pass', 'delete', 'ignore'].includes(action)) {
            return errorResponse(res, '无效的审核操作', 400);
        }
        const post = await DbAdapter.findByPk(Post, Number(postId), {
            include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname', 'avatar'] }]
        });
        if (!post) return errorResponse(res, '帖子不存在', 404);
        if (post.status === 'deleted') {
            return errorResponse(res, '该帖子已删除，无法审核', 400);
        }

        // 分区版主权限检查
        if (req.user?.role === 'moderator') {
            const boardIds = await getModeratedBoardIds(req.user);
            if (!boardIds?.includes(post.board_id)) {
                return errorResponse(res, '无权审核该板块的帖子', 403);
            }
        }

        const operatorId = DbAdapter.getId(req.user);
        const reviewReason = String(reason || '').trim().slice(0, 500);
        if (action === 'delete' && reviewReason.length < 2) {
            return errorResponse(res, '删除操作请填写原因', 400);
        }

        // 安全校验：仅允许审核“在待审队列中”的帖子（存在未审核的 sensitive_detected 日志），
        // 防止用 post:review 权限通过该入口处理/删除不在队列中的普通帖子（权限绕路）
        const pendingLogs = await DbAdapter.findAll(ForumModerationLog, {
            where: { post_id: post.id, action: 'sensitive_detected' }
        });
        const isUnreviewed = (log) => {
            try { return !(JSON.parse(log.after_state || '{}').reviewed); } catch { return true; }
        };
        if (!pendingLogs.some(isUnreviewed)) {
            return errorResponse(res, '该帖子不在敏感词待审队列中', 400);
        }

        // 三步操作（删除/恢复帖子、记录审计日志、标记待审日志）必须同一事务，任一步失败整体回滚。
        // 并发防护：SQLite 用 BEGIN IMMEDIATE 事务（开始即取写锁，串行化并发写事务），
        // MySQL 用 FOR UPDATE 行锁，避免两个管理员同时审核同一帖子造成重复处理。
        const TransactionTypes = sequelize.constructor.Transaction ? sequelize.constructor.Transaction.TYPES : null;
        const useImmediate = sequelize.options.dialect === 'sqlite' && TransactionTypes;
        const transactionOptions = useImmediate ? { type: TransactionTypes.IMMEDIATE } : {};
        await sequelize.transaction(transactionOptions, async (t) => {
            // 事务内二次校验：持锁后重新读取，若已被其他管理员审核则拒绝
            const freshPending = await DbAdapter.findAll(ForumModerationLog, {
                where: { post_id: post.id, action: 'sensitive_detected' },
                transaction: t,
                lock: sequelize.options.dialect === 'mysql' ? (t.LOCK ? t.LOCK.UPDATE : 'UPDATE') : undefined
            });
            if (!freshPending.some(isUnreviewed)) {
                throw Object.assign(new Error('该帖子已被其他管理员审核'), { statusCode: 400 });
            }
            if (action === 'delete') {
                // 删除帖子：复用完整删帖逻辑（通知/举报/点赞/收藏清理、评论软删、计数清零、审计日志）
                await softDeletePost(post, operatorId, reviewReason, { action: 'review_delete', transaction: t });
            } else {
                // pass / ignore 不修改帖子状态，只记录审计日志
                const after = { status: post.status, hidden_reason: post.hidden_reason };
                if (action === 'pass' && post.status === 'hidden' && post.hidden_reason === 'ai_review') {
                    // 通过：恢复因 AI 审核被隐藏的帖子（仅 ai_review 隐藏，不复活管理员手动隐藏的帖子）
                    await DbAdapter.update(Post, { status: 'published', hidden_reason: null }, { where: { id: post.id }, transaction: t });
                    after.status = 'published';
                    after.hidden_reason = null;
                }
                await ForumModerationLog.create({
                    post_id: post.id,
                    operator_id: operatorId,
                    action: action === 'pass' ? 'review_pass' : 'review_ignore',
                    reason: reviewReason,
                    before_state: JSON.stringify({ status: post.status, hidden_reason: post.hidden_reason }),
                    after_state: JSON.stringify(after)
                }, { transaction: t });
            }
            // 标记待审日志为已审核：保留原始 violations/riskLevel/source 结构化信息，仅追加审核结果
            for (const log of freshPending) {
                let state = {};
                try { state = JSON.parse(log.after_state || '{}'); } catch { state = {}; }
                state.reviewed = true;
                state.review_action = action;
                state.reviewer = operatorId;
                state.reviewed_at = new Date().toISOString();
                await log.update({ after_state: JSON.stringify(state) }, { transaction: t });
            }
        });

        invalidateForumReputation();
        return successResponse(res, { id: post.id, action }, '审核完成');
    } catch (error) {
        console.error('审核待审查帖子错误:', error);
        // 仅对主动抛出的业务错误(带 statusCode)透出 message，其余返回通用文案避免泄露内部信息
        return errorResponse(res, error.statusCode ? error.message : '审核失败', error.statusCode || 500);
    }
}

/**
 * 论坛运营总览。管理员查看全站，分区版主只能查看已分配板块。
 * 查询在数据库中聚合，避免将大量帖子或评论加载到 Node.js 内存。
 */
async function getForumOverview(req, res) {
    try {
        const attentionSettings = await readForumAttentionSettings();
        const moderatedBoardIds = await getModeratedBoardIds(req.user);
        const scoped = Array.isArray(moderatedBoardIds);
        const boardIds = scoped ? moderatedBoardIds : null;
        const impossibleBoardIds = [-1];
        const boardWhere = scoped
            ? { board_id: { [Op.in]: boardIds.length ? boardIds : impossibleBoardIds } }
            : {};
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const trendStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
        const publishedWhere = { ...boardWhere, status: 'published' };
        const commentPostWhere = { ...boardWhere, status: { [Op.ne]: 'deleted' } };
        const commentScope = {
            where: { status: { [Op.ne]: 'deleted' } },
            include: [{ model: Post, as: 'post', attributes: [], required: true, where: commentPostWhere }]
        };

        const [
            totalPublished, totalReplies, todayTopics, todayReplies, unansweredQuestions,
            staleQuestions, lockedTopics, hiddenTopics, essenceTopics, activePostAuthors,
            activeReplyAuthors, postTrendRows, replyTrendRows, boards, boardCountRows,
            hiddenAttention, staleAttention, recentLikeRows, pendingReportRows, recentViewRows
        ] = await Promise.all([
            Post.count({ where: publishedWhere }),
            Comment.count({ ...commentScope, distinct: true, col: 'id' }),
            Post.count({ where: { ...publishedWhere, created_at: { [Op.gte]: todayStart } } }),
            Comment.count({ ...commentScope, where: { ...commentScope.where, created_at: { [Op.gte]: todayStart } }, distinct: true, col: 'id' }),
            Post.count({ where: { ...publishedWhere, post_type: 'question', accepted_comment_id: null } }),
            Post.count({ where: { ...publishedWhere, post_type: 'question', accepted_comment_id: null, created_at: { [Op.lt]: staleBefore } } }),
            Post.count({ where: { ...publishedWhere, is_locked: true } }),
            Post.count({ where: { ...boardWhere, status: 'hidden' } }),
            Post.count({ where: { ...publishedWhere, is_essence: true } }),
            Post.findAll({ attributes: ['user_id'], where: { ...publishedWhere, created_at: { [Op.gte]: thirtyDaysAgo } }, group: ['user_id'], raw: true }),
            Comment.findAll({ attributes: ['user_id'], ...commentScope, where: { ...commentScope.where, created_at: { [Op.gte]: thirtyDaysAgo } }, group: ['Comment.user_id'], raw: true }),
            Post.findAll({
                attributes: [[sequelize.fn('DATE', sequelize.col('created_at')), 'day'], [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                where: { ...publishedWhere, created_at: { [Op.gte]: trendStart } },
                group: [sequelize.fn('DATE', sequelize.col('created_at'))], raw: true
            }),
            Comment.findAll({
                attributes: [[sequelize.fn('DATE', sequelize.col('Comment.created_at')), 'day'], [sequelize.fn('COUNT', sequelize.col('Comment.id')), 'count']],
                ...commentScope,
                where: { ...commentScope.where, created_at: { [Op.gte]: trendStart } },
                group: [sequelize.fn('DATE', sequelize.col('Comment.created_at'))], raw: true
            }),
            ForumBoard.findAll({
                where: scoped ? { id: { [Op.in]: boardIds.length ? boardIds : impossibleBoardIds } } : {},
                attributes: ['id', 'name', 'icon', 'color', 'status'], order: [['sort_order', 'ASC'], ['id', 'ASC']], raw: true
            }),
            Post.findAll({
                attributes: ['board_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                where: publishedWhere, group: ['board_id'], raw: true
            }),
            Post.findAll({
                where: { ...boardWhere, status: 'hidden' },
                include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname'] }, { model: ForumBoard, as: 'board', attributes: ['id', 'name', 'icon'] }],
                order: [['updated_at', 'DESC']], limit: 6
            }),
            Post.findAll({
                where: { ...publishedWhere, post_type: 'question', accepted_comment_id: null, created_at: { [Op.lt]: staleBefore } },
                include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname'] }, { model: ForumBoard, as: 'board', attributes: ['id', 'name', 'icon'] }],
                order: [['created_at', 'ASC']], limit: 6
            }),
            Like.findAll({
                attributes: ['post_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                where: { post_id: { [Op.ne]: null }, created_at: { [Op.gte]: twoHoursAgo } },
                group: ['post_id'], raw: true
            }),
            Report.findAll({
                attributes: ['target_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                where: { type: 'post', status: { [Op.in]: ['pending', 'processing'] } },
                group: ['target_id'], raw: true
            }),
            Statistics.findAll({
                attributes: ['stat_key', 'stat_value', 'stat_date'],
                where: { stat_key: { [Op.like]: 'forum_post_view:%' }, stat_date: { [Op.gte]: twoHoursAgo } },
                raw: true
            })
        ]);

        const authorIds = new Set([
            ...activePostAuthors.map(row => Number(row.user_id)),
            ...activeReplyAuthors.map(row => Number(row.user_id))
        ].filter(Number.isFinite));
        const dayKey = date => {
            const year = date.getFullYear();
            return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        const topicTrend = new Map(postTrendRows.map(row => [String(row.day), Number(row.count || 0)]));
        const replyTrend = new Map(replyTrendRows.map(row => [String(row.day), Number(row.count || 0)]));
        const trend = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(trendStart.getTime() + index * 24 * 60 * 60 * 1000);
            const day = dayKey(date);
            return { day, topics: topicTrend.get(day) || 0, replies: replyTrend.get(day) || 0 };
        });
        const boardCounts = new Map(boardCountRows.map(row => [Number(row.board_id), Number(row.count || 0)]));
        const normalizeAttention = (post, reason, signalCount = null) => ({
            id: Number(post.id), title: post.title, status: post.status, post_type: post.post_type,
            board_id: post.board_id, is_essence: Boolean(post.is_essence), is_top: Boolean(post.is_top),
            is_locked: Boolean(post.is_locked), slow_mode_seconds: Number(post.slow_mode_seconds || 0),
            created_at: post.created_at, updated_at: post.updated_at, view_count: Number(post.view_count || 0),
            like_count: Number(post.like_count || 0), comment_count: Number(post.comment_count || 0),
            author: post.author, board: post.board, reason, signal_count: signalCount
        });
        const attentionMap = new Map();
        hiddenAttention.forEach(post => attentionMap.set(Number(post.id), normalizeAttention(post, 'hidden')));
        staleAttention.forEach(post => {
            if (!attentionMap.has(Number(post.id))) attentionMap.set(Number(post.id), normalizeAttention(post, 'stale_question'));
        });

        const rapidLikeCounts = new Map(recentLikeRows.map(row => [Number(row.post_id), Number(row.count || 0)]).filter(([, count]) => count >= attentionSettings.like_threshold));
        const reportCounts = new Map(pendingReportRows.map(row => [Number(row.target_id), Number(row.count || 0)]).filter(([, count]) => count >= attentionSettings.report_threshold));
        const rapidViewCounts = new Map();
        recentViewRows.forEach(row => {
            const match = /^forum_post_view:(\d+):\d+$/.exec(String(row.stat_key));
            if (!match) return;
            const postId = Number(match[1]);
            rapidViewCounts.set(postId, (rapidViewCounts.get(postId) || 0) + Number(row.stat_value || 0));
        });
        for (const [postId, count] of [...rapidViewCounts]) if (count < attentionSettings.view_threshold) rapidViewCounts.delete(postId);

        const signalIds = [...new Set([...rapidViewCounts.keys(), ...rapidLikeCounts.keys(), ...reportCounts.keys()])];
        if (signalIds.length) {
            const signaledPosts = await Post.findAll({
                where: { ...publishedWhere, id: { [Op.in]: signalIds } },
                include: [{ model: User, as: 'author', attributes: ['id', 'username', 'nickname'] }, { model: ForumBoard, as: 'board', attributes: ['id', 'name', 'icon'] }]
            });
            signaledPosts.forEach(post => {
                const postId = Number(post.id);
                if (attentionMap.has(postId)) return;
                if (reportCounts.has(postId)) attentionMap.set(postId, normalizeAttention(post, 'many_reports', reportCounts.get(postId)));
                else if (rapidLikeCounts.has(postId)) attentionMap.set(postId, normalizeAttention(post, 'rapid_likes', rapidLikeCounts.get(postId)));
                else if (rapidViewCounts.has(postId)) attentionMap.set(postId, normalizeAttention(post, 'rapid_views', rapidViewCounts.get(postId)));
            });
        }

        return successResponse(res, {
            scope: scoped ? 'assigned' : 'all',
            can_configure_attention: getRole(req.user.role).level >= getRole('admin').level,
            attention_settings: attentionSettings,
            metrics: {
                total_published: Number(totalPublished), total_replies: Number(totalReplies),
                today_topics: Number(todayTopics), today_replies: Number(todayReplies),
                active_authors_30d: authorIds.size, unanswered_questions: Number(unansweredQuestions),
                stale_questions: Number(staleQuestions), locked_topics: Number(lockedTopics),
                hidden_topics: Number(hiddenTopics), essence_topics: Number(essenceTopics)
            },
            trend,
            boards: boards.map(board => ({ ...board, post_count: boardCounts.get(Number(board.id)) || 0 })),
            attention: Array.from(attentionMap.values()).slice(0, 10)
        });
    } catch (error) {
        console.error('获取论坛运营总览错误:', error);
        return errorResponse(res, '获取论坛运营总览失败', 500);
    }
}

async function getForumAttentionSettings(req, res) {
    try {
        return successResponse(res, await readForumAttentionSettings());
    } catch (error) {
        console.error('获取论坛关注规则失败:', error);
        return errorResponse(res, '获取论坛关注规则失败', 500);
    }
}

async function updateForumAttentionSettings(req, res) {
    try {
        const next = {};
        for (const name of Object.keys(FORUM_ATTENTION_CONFIG_KEYS)) {
            const value = Number(req.body?.[name]);
            if (!Number.isSafeInteger(value) || value < 1 || value > 100000) {
                return errorResponse(res, '关注阈值必须是 1-100000 的整数', 400);
            }
            next[name] = value;
        }
        await sequelize.transaction(async transaction => {
            for (const [name, key] of Object.entries(FORUM_ATTENTION_CONFIG_KEYS)) {
                const [config] = await SystemConfig.findOrCreate({ where: { config_key: key }, defaults: { config_value: String(next[name]) }, transaction });
                if (String(config.config_value) !== String(next[name])) await config.update({ config_value: String(next[name]) }, { transaction });
            }
        });
        logOperation(req, 'update_forum_attention_settings', 'system_config', null, next);
        return successResponse(res, next, '关注规则已更新');
    } catch (error) {
        console.error('更新论坛关注规则失败:', error);
        return errorResponse(res, '更新论坛关注规则失败', 500);
    }
}

/**
 * 删除帖子 (管理)
 */
async function deletePost(req, res) {
    try {
        const { postId } = req.params;
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3 || reason.length > 500) return errorResponse(res, '删除原因需为 3-500 字', 400);
        const post = await DbAdapter.findByPk(Post, postId);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        // L5: 删除帖子涉及多表关联数据，必须用事务包裹；Comment 软删保留历史
        // Bug-1: Post 改为软删（status:'deleted' + 计数清零），避免评论 post_id 成为指向已硬删帖子的死指针
        // 复用 softDeletePost 统一删除逻辑（通知/举报/点赞/收藏清理、评论软删、计数清零、审计日志，事务内完成）
        await softDeletePost(post, DbAdapter.getId(req.user), reason, { action: 'delete_post' });
        logOperation(req, 'delete_post', 'post', postId, { title: post.title, reason });
        invalidateForumReputation();
        return successResponse(res, null, '删除成功');
    } catch (error) {
        console.error('删除帖子错误:', error);
        return errorResponse(res, '删除失败', 500);
    }
}

/**
 * 更新帖子信息
 */
async function updatePost(req, res) {
    try {
        const { postId } = req.params;
        const { title, content, category, status, is_top, is_essence, board_id, post_type, is_locked, slow_mode_seconds, moderation_reason } = req.body;

        const post = await DbAdapter.findByPk(Post, postId);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }

        const VALID_POST_STATUSES = ['published', 'draft', 'hidden', 'deleted'];
        if (status !== undefined && !VALID_POST_STATUSES.includes(status)) {
            return errorResponse(res, '无效的帖子状态', 400);
        }

        const updateData = {};
        if (title !== undefined) {
            const t = String(title).trim();
            if (t.length === 0) return errorResponse(res, '标题不能为空', 400);
            if (t.length > 200) return errorResponse(res, '标题不能超过200字', 400);
            updateData.title = t;
        }
        if (content !== undefined) {
            const c = String(content).trim();
            if (c.length === 0) return errorResponse(res, '内容不能为空', 400);
            if (c.length > 10000) return errorResponse(res, '内容不能超过10000字', 400);
            updateData.content = c;
        }
        if (category !== undefined) updateData.category = category;
        // 管理员手动修改 status 时的 hidden_reason 处理：
        // - 设为 hidden → 清空 hidden_reason,视为管理员隐藏(用户编辑不能恢复)
        // - 设为 published → 清空 hidden_reason
        // - 其他(draft/deleted) → 清空 hidden_reason
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'hidden') {
                updateData.hidden_reason = null; // 管理员手动隐藏,不标记 ai_review
            } else if (status === 'published') {
                updateData.hidden_reason = null;
            } else {
                updateData.hidden_reason = null;
            }
        }
        if (is_top !== undefined) updateData.is_top = is_top;
        if (is_essence !== undefined) updateData.is_essence = is_essence;
        if (board_id !== undefined) {
            const board = await DbAdapter.findByPk(ForumBoard, Number(board_id));
            if (!board || board.status !== 'active') return errorResponse(res, '论坛板块不存在或已停用', 400);
            if (!(await canModerateBoard(req.user, board.id))) return errorResponse(res, '您没有目标板块的管理权限', 403);
            updateData.board_id = Number(board_id);
        }
        const moderationChanged = [status, is_top, is_essence, board_id, is_locked, slow_mode_seconds].some(value => value !== undefined);
        if (moderationChanged && String(moderation_reason || '').trim().length < 3) {
            return errorResponse(res, '版务操作原因至少需要 3 个字', 400);
        }
        const beforeState = {
            status: post.status, is_top: post.is_top, is_essence: post.is_essence, board_id: post.board_id,
            is_locked: post.is_locked, slow_mode_seconds: post.slow_mode_seconds
        };
        if (post_type !== undefined) {
            if (!['discussion', 'question', 'share', 'tutorial', 'news'].includes(post_type)) return errorResponse(res, '无效的帖子类型', 400);
            updateData.post_type = post_type;
            updateData.category = post_type;
        }
        if (is_locked !== undefined) updateData.is_locked = Boolean(is_locked);
        if (slow_mode_seconds !== undefined) {
            const seconds = Number(slow_mode_seconds);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) return errorResponse(res, '慢速模式必须在 0 到 86400 秒之间', 400);
            updateData.slow_mode_seconds = seconds;
        }

        // Bug-6 修复: 管理员更新帖子 title/content 时缺少 AI 内容审核,
        // 用户可通过管理员通道编辑帖子绕过审核。参照 postController.updatePost 调用 aiReview.fallbackReview
        if (title !== undefined || content !== undefined) {
            const finalTitle = title !== undefined ? updateData.title : post.title;
            const finalContent = content !== undefined ? updateData.content : post.content;
            const reviewResult = await aiReview.fallbackReview(`${finalTitle}\n${finalContent}`);
            if (reviewResult.recommendation === 'delete') {
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            if (reviewResult.recommendation === 'review') {
                updateData.status = 'hidden';
                // 与 postController.updatePost 保持一致:标记 ai_review,审核通过后自动恢复
                updateData.hidden_reason = 'ai_review';
            } else {
                // 审核通过: 若帖子此前因 AI 审核被 hidden,恢复为 published;
                // 若为管理员手动隐藏(hidden_reason 非 ai_review)则不恢复
                if (post.status === 'hidden' && post.hidden_reason === 'ai_review') {
                    updateData.status = 'published';
                    updateData.hidden_reason = null;
                }
            }
        }

        await sequelize.transaction(async transaction => {
            await DbAdapter.update(Post, updateData, { where: { id: postId }, transaction });
            const updated = await DbAdapter.findByPk(Post, postId, { transaction });
            if (title !== undefined || content !== undefined || board_id !== undefined || post_type !== undefined) {
                await recordPostRevision(updated, DbAdapter.getId(req.user), 'admin', moderation_reason || 'admin_edit', { transaction });
            }
            if (moderationChanged) {
                const afterState = {
                    status: updated.status, is_top: updated.is_top, is_essence: updated.is_essence, board_id: updated.board_id,
                    is_locked: updated.is_locked, slow_mode_seconds: updated.slow_mode_seconds
                };
                await recordModerationLog(postId, DbAdapter.getId(req.user), 'update_post_moderation', moderation_reason, beforeState, afterState, { transaction });
            }
        });
        logOperation(req, 'update_post', 'post', postId, updateData);
        if (updateData.status !== undefined) invalidateForumReputation();

        return successResponse(res, null, '更新成功');
    } catch (error) {
        console.error('更新帖子错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

/**
 * 设置帖子精华
 */
async function setPostEssence(req, res) {
    try {
        const { postId } = req.params;
        const { isEssence, reason } = req.body;
        if (String(reason || '').trim().length < 3) return errorResponse(res, '操作原因至少需要 3 个字', 400);
        
        const post = await DbAdapter.findByPk(Post, postId);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        
        await sequelize.transaction(async transaction => {
            await DbAdapter.update(Post, { is_essence: isEssence }, { where: { id: postId }, transaction });
            await recordModerationLog(postId, DbAdapter.getId(req.user), isEssence ? 'set_essence' : 'unset_essence', reason, { is_essence: post.is_essence }, { is_essence: Boolean(isEssence) }, { transaction });
        });
        logOperation(req, 'set_post_essence', 'post', postId, { isEssence });
        
        return successResponse(res, null, '设置成功');
    } catch (error) {
        console.error('设置精华帖错误', error);
        return errorResponse(res, '设置失败', 500);
    }
}

/**
 * 设置帖子置顶
 */
async function setPostTop(req, res) {
    try {
        const { postId } = req.params;
        const { isTop, reason } = req.body;
        if (String(reason || '').trim().length < 3) return errorResponse(res, '操作原因至少需要 3 个字', 400);
        
        const post = await DbAdapter.findByPk(Post, postId);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        
        await sequelize.transaction(async transaction => {
            await DbAdapter.update(Post, { is_top: isTop }, { where: { id: postId }, transaction });
            await recordModerationLog(postId, DbAdapter.getId(req.user), isTop ? 'set_top' : 'unset_top', reason, { is_top: post.is_top }, { is_top: Boolean(isTop) }, { transaction });
        });
        logOperation(req, 'set_post_top', 'post', postId, { isTop });
        
        return successResponse(res, null, '设置成功');
    } catch (error) {
        console.error('设置置顶帖错误', error);
        return errorResponse(res, '设置失败', 500);
    }
}
