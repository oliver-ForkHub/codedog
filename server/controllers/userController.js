/**
 * 用户控制器
 * 仅支持编程猫账号登录
 */

const { User, Work, SystemConfig } = require('../models');
const { successResponse, errorResponse } = require('../middleware/response');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/auth');
const codemaoApi = require('../services/codemaoApi');
const path = require('path');
const fs = require('fs');
const DbAdapter = require('../utils/dbAdapter');
const GeetestService = require('../services/geetestService');
// 引入内容审核服务,落库前做敏感词/违规检查(参照 commentController)
const aiReview = require('../services/aiReview');
const { safeLog } = require('../utils/safeLog');
const { buildCodemaoPlayerUrl } = require('../utils/codemaoPlayer');
// 修复: token 改用 httpOnly cookie 防止 XSS 偷取; 同时保留返回体字段兼容旧前端
const { setTokenCookie, clearTokenCookie } = require('../middleware/auth');
const { logOperation } = require('../middleware/operationLog');

// codemao 登录创建本地用户时使用的占位密码哈希（与 adminController 占位密码方案一致）
// 使用 crypto.randomBytes 生成强随机串再 bcrypt 哈希，避免弱随机或非法哈希字符串
const PLACEHOLDER_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

const uploadDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// (Report4 #4, Report4 #15) 安全删除文件：严格限制在 uploads 根目录之内，
// 防御路径穿越（.. 序列）、null-byte 截断、符号链接逃逸等。
// 任何校验失败均跳过删除并记录日志，绝不抛出错误影响主流程。
function safeUnlinkFile(filePath, requiredRoot = uploadDir) {
    try {
        if (!filePath || typeof filePath !== 'string') return;
        // 拒绝包含空字节的路径，防御 null-byte 截断攻击
        if (filePath.includes('\0')) {
            console.warn('[safeUnlinkFile] 路径包含空字节，跳过删除:', filePath);
            return;
        }
        const resolvedRoot = path.resolve(requiredRoot);
        const resolvedPath = path.resolve(filePath);
        // 解析后路径必须严格位于 uploads 根目录之下（不可等于根目录本身）
        if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
            console.warn('[safeUnlinkFile] 路径越出 uploads 根目录，跳过删除:', filePath);
            return;
        }
        // 仅删除真实存在的普通文件，避免误删目录/符号链接等
        if (!fs.existsSync(resolvedPath)) return;
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) {
            console.warn('[safeUnlinkFile] 目标非普通文件，跳过删除:', resolvedPath);
            return;
        }
        fs.unlink(resolvedPath, (err) => {
            if (err) console.error('[safeUnlinkFile] 删除文件失败:', err.message);
        });
    } catch (e) {
        console.error('[safeUnlinkFile] 删除文件异常:', e.message);
    }
}

function cleanupUploadedFile(file) {
    // (Report4 #4, Report4 #15) 镜像同样的路径穿越防御：req.file.path 由 multer 写入
    // uploadDir，但仍校验其解析后路径严格位于 uploads 根目录之内
    if (file?.path) {
        safeUnlinkFile(file.path, uploadDir);
    }
}

function constantTimeEquals(a, b) {
    if (!a || !b) return false;
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    // 使用长度较大的 buffer 进行比较，避免泄露长度信息
    const maxLength = Math.max(left.length, right.length);
    const leftPadded = Buffer.alloc(maxLength, 0);
    const rightPadded = Buffer.alloc(maxLength, 0);
    left.copy(leftPadded);
    right.copy(rightPadded);
    const isEqual = crypto.timingSafeEqual(leftPadded, rightPadded);
    // 同时检查长度是否相等
    return isEqual && left.length === right.length;
}

function shouldPromoteInitialAdmin(req, codemaoUserId, userCount) {
    if (userCount !== 1) return false;
    const expectedId = String(process.env.INITIAL_ADMIN_CODEMAO_ID || '').trim();
    if (expectedId && expectedId === String(codemaoUserId)) return true;
    const configuredToken = String(process.env.INITIAL_ADMIN_BOOTSTRAP_TOKEN || '');
    const suppliedToken = String(req.headers['x-initial-admin-token'] || '');
    if (configuredToken.length >= 32 && suppliedToken.length === configuredToken.length) {
        return crypto.timingSafeEqual(Buffer.from(configuredToken), Buffer.from(suppliedToken));
    }
    // 仅开发环境允许显式开启“首用户成为超级管理员”，生产环境永不使用此便捷开关。
    return process.env.NODE_ENV !== 'production' && process.env.ALLOW_FIRST_USER_SUPERADMIN === 'true';
}

/**
 * 用户登录（仅支持编程猫账号）
 */
async function login(req, res) {
    try {
        const { username, password, geetest_challenge, geetest_validate, geetest_seccode } = req.body;
        
        if (!username || !password) {
            return errorResponse(res, '请输入用户名和密码', 400);
        }
        
        const result = await GeetestService.verify(
            'login', 
            geetest_challenge, 
            geetest_validate, 
            geetest_seccode, 
            req
        );
        
        if (!result.success) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, result.reason || '请完成验证码验证', 400, 'CAPTCHA_FAILED');
        }
        
        return await codemaoLogin(req, res, username, password);
    } catch (error) {
        console.error('登录错误:', error);
        return errorResponse(res, '登录失败，请稍后重试', 500);
    }
}

/**
 * 编程猫账号登录
 * 第一个使用编程猫登录的用户将自动成为管理员
 */
async function codemaoLogin(req, res, identity, password) {
    try {
        const codemaoRes = await codemaoApi.login(identity, password);
        
        // 修复 PII 泄露: 原代码打印 nickname（明文PII）。已通过 safeLog 脱敏
        safeLog('codemaoLogin', { nickname: codemaoRes?.user_info?.nickname, id: codemaoRes?.user_info?.id });
        
        if (!codemaoRes) {
            return errorResponse(res, '编程猫服务暂时不可用，请稍后重试', 502);
        }
        
        if (codemaoRes.error) {
            // 根据不同错误类型返回友好提示
            const errorMsg = getLoginErrorMessage(codemaoRes);
            const statusCode = codemaoRes.status || 401;
            return errorResponse(res, errorMsg, statusCode);
        }
        
        if (!codemaoRes.user_info) {
            return errorResponse(res, '用户名或密码错误，请检查后重试', 401);
        }
        
        const codemaoUser = codemaoRes.user_info;
        const codemaoToken = codemaoRes.auth?.token || codemaoRes.token || null;

        // 诊断日志:打印编程猫返回的 user_info 字段名和疑似头像字段值，
        // 用于确认不同接口头像字段名(avatar_url / avatar / portrait 等)
        console.log('[codemaoLogin] user_info 字段:', Object.keys(codemaoUser || {}));
        console.log('[codemaoLogin] 头像候选:', {
            avatar_url: codemaoUser?.avatar_url,
            avatar: codemaoUser?.avatar,
            portrait: codemaoUser?.portrait,
            resolved: codemaoApi.normalizeCodemaoAvatar(codemaoUser)
        });

        // 与 updateProfile / 已存在用户路径保持一致：先对原始文本审核，审核通过才转义落库
        const newRawNickname = codemaoUser.nickname != null ? String(codemaoUser.nickname).trim() : '';
        const newRawBio = codemaoUser.description != null ? String(codemaoUser.description).trim() : '';

        const newReviewText = [newRawNickname, newRawBio].filter(v => v).join('\n');
        let newProfileBlocked = false;
        if (newReviewText.trim()) {
            try {
                const reviewResult = await aiReview.fallbackReview(newReviewText);
                if (reviewResult.recommendation === 'delete' || reviewResult.recommendation === 'review') {
                    newProfileBlocked = true;
                    console.warn(`[codemaoLogin] 新用户资料未通过审核(${reviewResult.recommendation})，跳过 nickname/bio 存储: ${reviewResult.reason}`);
                }
            } catch (e) {
                console.error('[codemaoLogin] 新用户资料审核失败:', e.message);
                newProfileBlocked = true;
            }
        }

        // 存原始文本(不转义),渲染时才转义,与全站统一
        const safeNickname = (!newProfileBlocked && newRawNickname) ? newRawNickname : null;
        const safeBio = (!newProfileBlocked && newRawBio) ? newRawBio : null;

        // 使用 findOrCreate 避免竞态条件
        let user, created;
        try {
            [user, created] = await DbAdapter.findOrCreate(User, {
                where: { codemao_user_id: codemaoUser.id },
                defaults: {
                    codemao_user_id: codemaoUser.id,
                    username: `codemao_${codemaoUser.id}`,
                    email: codemaoRes.auth?.email || `codemao_${codemaoUser.id}@example.invalid`,
                    password: PLACEHOLDER_PASSWORD_HASH,
                    nickname: safeNickname,
                    avatar: codemaoApi.normalizeCodemaoAvatar(codemaoUser),
                    bio: safeBio,
                    codemao_token: codemaoToken,
                    role: 'user',
                    status: 'active'
                }
            });
        } catch (createError) {
            // 如果创建失败（可能是并发创建），尝试再次查找
            user = await DbAdapter.findOne(User, { 
                where: { codemao_user_id: codemaoUser.id } 
            });
            created = false;
            if (!user) {
                throw createError;
            }
        }
        
        // Production should not let a random first visitor claim superadmin.
        let isFirstUser = false;
        const userCount = created ? await DbAdapter.count(User, {}) : null;
        const promotedToInitialAdmin = shouldPromoteInitialAdmin(req, codemaoUser.id, userCount)
            && user.role !== 'superadmin';

        if (promotedToInitialAdmin) {
            isFirstUser = true;
            await DbAdapter.update(User, { role: 'superadmin' }, { where: { id: DbAdapter.getId(user) } });
            user.role = 'superadmin';
            // 修复 PII 泄露: 替换原直接打印 nickname + id 为 safeLog
            safeLog('initAdmin', { nickname: codemaoUser.nickname, id: codemaoUser.id });
        } else if (created && userCount === 1) {
            console.warn('Initial user was not promoted. Set INITIAL_ADMIN_CODEMAO_ID or INITIAL_ADMIN_BOOTSTRAP_TOKEN to bootstrap a superadmin.');
        }
        
        // 更新用户信息
        if (user.status !== 'active') {
            return errorResponse(res, '账号已被禁用，请联系管理员', 403);
        }

        if (!created) {
            // (Report 2 #18) 不要盲目用编程猫资料覆盖用户已自定义的本地资料：
            // 仅当本地字段为空时才覆盖，且 nickname/bio 需走与 updateProfile 一致的
            // 审核（基于原始文本）+ escapeHtml 转义流程，避免绕过本地内容审核
            const updateFields = { codemao_token: codemaoToken };

            const rawNickname = codemaoUser.nickname != null ? String(codemaoUser.nickname).trim() : '';
            const rawBio = codemaoUser.description != null ? String(codemaoUser.description).trim() : '';
            const codemaoAvatar = codemaoApi.normalizeCodemaoAvatar(codemaoUser);

            // 先对原始（未转义）文本做内容审核，与 updateProfile 顺序保持一致
            const reviewText = [rawNickname, rawBio].filter(v => v).join('\n');
            let profileBlocked = false;
            if (reviewText.trim()) {
                try {
                    const reviewResult = await aiReview.fallbackReview(reviewText);
                    if (reviewResult.recommendation === 'delete' || reviewResult.recommendation === 'review') {
                        // 登录流程不阻断，仅记录并跳过 nickname/bio 覆盖
                        profileBlocked = true;
                        console.warn(`[codemaoLogin] 编程猫资料未通过审核(${reviewResult.recommendation})，跳过覆盖: ${reviewResult.reason}`);
                    }
                } catch (e) {
                    console.error('[codemaoLogin] 编程猫资料审核失败:', e.message);
                    profileBlocked = true;
                }
            }

            // 仅当本地字段为空且审核通过时，才用编程猫资料覆盖(存原始)
            if (!user.nickname && rawNickname && !profileBlocked) {
                updateFields.nickname = rawNickname;
            }
            if (!user.bio && rawBio && !profileBlocked) {
                updateFields.bio = rawBio;
            }
            // avatar 是 URL，无需转义；仅在本地为空时覆盖，尊重用户自定义头像
            if (!user.avatar && codemaoAvatar) {
                updateFields.avatar = codemaoAvatar;
            }

            await DbAdapter.update(User, updateFields, { where: { id: DbAdapter.getId(user) } });
        }
        
        syncUserWorks(codemaoUser.id, DbAdapter.getId(user)).catch(err => {
            console.error('同步用户作品失败:', err);
        });
        
        const token = jwt.sign(
            { id: DbAdapter.getId(user), username: user.username, role: user.role, token_version: user.token_version || 0 },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN, issuer: 'codedog-community', audience: 'codedog-frontend' }
        );

        // 修复: 写 httpOnly cookie, 前端无感升级 (兼容旧 sessionStorage 路径)
        setTokenCookie(res, token);

        // 构建返回消息
        let message = '编程猫登录成功';
        if (isFirstUser) {
            message = '编程猫登录成功，您已被设为初始管理员';
        }
        
        // 网页端继续只使用 httpOnly cookie；独立的原生登录路由返回 Bearer token，
        // 由 Android/iOS 系统安全存储保管，避免依赖 WebView cookie jar。
        const responseData = {
            user: {
                id: DbAdapter.getId(user),
                codemao_user_id: user.codemao_user_id,
                username: user.username,
                email: user.email,
                nickname: user.nickname,
                avatar: user.avatar,
                bio: user.bio,
                role: user.role
            },
            syncingWorks: true  // 提示前端作品正在同步中
        };
        if (req.path === '/mobile/login') {
            responseData.access_token = token;
            responseData.token_type = 'Bearer';
            const appLogin = {
                app_last_login_at: new Date(),
                app_last_platform: String(req.get('x-app-platform') || 'unknown').slice(0, 20),
                app_last_version: String(req.get('x-app-version') || 'unknown').slice(0, 30),
                app_last_build: String(req.get('x-app-build') || 'unknown').slice(0, 30)
            };
            await DbAdapter.update(User, appLogin, { where: { id: DbAdapter.getId(user) } });
        }
        return successResponse(res, responseData, message);
    } catch (error) {
        console.error('编程猫登录错误:', error);
        return errorResponse(res, '编程猫登录失败', 500);
    }
}

// Bug-10: 用户级同步锁,防止频繁登录导致并发同步打爆外部 API
const syncLocks = new Map();
const SYNC_LOCK_TTL = 10 * 60 * 1000; // 10 分钟超时自动释放

/**
 * 同步用户作品
 */
async function syncUserWorks(codemaoUserId, localUserId) {
    // Bug-10: 用户级去重锁,同一用户短时间内不重复同步
    const lockKey = String(codemaoUserId);
    if (syncLocks.has(lockKey)) {
        console.log(`用户 ${codemaoUserId} 的作品正在同步中,跳过本次`);
        return;
    }
    syncLocks.set(lockKey, Date.now());
    // 超时兜底: 10 分钟后自动清除锁,防止异常导致永久锁死
    const lockTimer = setTimeout(() => syncLocks.delete(lockKey), SYNC_LOCK_TTL);
    lockTimer.unref();

    try {
        console.log(`开始同步用户 ${codemaoUserId} 的作品...`);
        
        const pageSize = 50;
        let offset = 0;
        let allItems = [];
        const maxItems = 200;
        
        while (allItems.length < maxItems) {
            const worksData = await codemaoApi.getUserWorks(codemaoUserId, offset, pageSize);
            
            if (!worksData || !worksData.items || worksData.items.length === 0) {
                break;
            }
            
            allItems = allItems.concat(worksData.items);
            offset += worksData.items.length;
            
            if (worksData.items.length < pageSize) {
                break;
            }
        }
        
        if (allItems.length === 0) {
            console.log('未获取到用户作品');
            return;
        }
        
        let syncCount = 0;
        
        for (const item of allItems) {
            try {
                const workDetail = await codemaoApi.getWorkDetail(item.id);
                if (!workDetail || !workDetail.id) continue;
                
                // 与后台 crawlWork 保持一致: type/ide_type 使用编程猫 IDE 类型(KITTEN/Nemo/KITTEN4 等)
                // 不要用 work_label_list 的中文标签(游戏/其他...)，否则首页角标会显示成「其他」
                let type = workDetail.type || workDetail.ide_type || 'KITTEN';
                let ideType = workDetail.ide_type || workDetail.type || 'KITTEN';
                
                // (报告1 #2, Bug-20) 落库前对作品名称+描述做内容审核，参照 publishWork
                // 违规/疑似违规内容设为 pending 待人工复核，避免登录同步直接 published 绕过本地审核
                let workStatus = 'published';
                try {
                    const reviewText = String(workDetail.work_name || '') + (workDetail.description || '');
                    const reviewResult = await aiReview.fallbackReview(reviewText);
                    if (reviewResult.recommendation === 'delete' || reviewResult.recommendation === 'review') {
                        workStatus = 'pending';
                        console.warn(`[syncUserWorks] 作品 ${workDetail.id} 未通过审核(${reviewResult.recommendation})，设为 pending: ${reviewResult.reason}`);
                    }
                } catch (e) {
                    console.error(`[syncUserWorks] 作品 ${workDetail.id} 审核失败:`, e.message);
                    workStatus = 'pending';
                }

                // 使用 findOrCreate,对已存在作品也重新审核状态(编程猫改违规后本地应同步)
                const defaults = {
                    codemao_work_id: workDetail.id,
                    name: workDetail.work_name,
                    description: workDetail.description,
                    preview: workDetail.preview,
                    type: type,
                    ide_type: ideType,
                    work_url: buildCodemaoPlayerUrl({ workId: workDetail.id, playerUrl: workDetail.player_url, type: workDetail.type, ideType }),
                    user_id: localUserId,
                    codemao_author_id: codemaoUserId,
                    codemao_author_name: workDetail.user_info?.nickname,
                    view_times: workDetail.view_times || 0,
                    // 中·脏数据: praise_times/collection_times/comment_count 始终从 0 开始
                    praise_times: 0,
                    collection_times: 0,
                    comment_count: 0,
                    status: workStatus
                };
                const [record, created] = await DbAdapter.findOrCreate(Work, {
                    where: { codemao_work_id: workDetail.id },
                    defaults
                });

                if (created) {
                    syncCount++;
                } else if (record && record.status === 'hidden') {
                    // 修复: 管理员已隐藏的作品,不被 sync 流程覆盖状态(hidden 是管理员主动设置)
                    console.log(`[syncUserWorks] 作品 ${workDetail.id} 已被管理员隐藏,跳过状态同步`);
                } else if (record) {
                    // 修复: 已存在作品同步刷新类型/封面等元数据，修正登录同步早期错误写入的 type=「其他」
                    const metaUpdate = {
                        name: workDetail.work_name || record.name,
                        description: workDetail.description != null ? workDetail.description : record.description,
                        preview: workDetail.preview || record.preview,
                        type: type,
                        ide_type: ideType,
                        work_url: buildCodemaoPlayerUrl({ workId: workDetail.id, playerUrl: workDetail.player_url, type: workDetail.type, ideType }),
                        codemao_author_name: workDetail.user_info?.nickname || record.codemao_author_name,
                        view_times: workDetail.view_times || record.view_times || 0
                    };
                    if (record.status === 'published' && workStatus === 'pending') {
                        metaUpdate.status = 'pending';
                        console.warn(`[syncUserWorks] 作品 ${workDetail.id} 重新审核不通过,更新为 pending`);
                    } else if (record.status === 'pending' && workStatus === 'published') {
                        metaUpdate.status = 'published';
                        console.log(`[syncUserWorks] 作品 ${workDetail.id} 审核通过,恢复为 published`);
                    }
                    await DbAdapter.update(Work, metaUpdate, { where: { id: record.id } });
                }


                // 延迟 200ms 避免被编程猫限流
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (itemError) {
                console.error(`同步作品 ${item.id} 失败:`, itemError.message);
                continue;
            }
        }
        
        // (报告1 #4, 中-1) work_count 仅统计已发布作品，与 workController.deleteWork 重算口径一致，
        // 避免把 pending/deleted 作品计入 work_count 导致虚高
        const totalWorkCount = await DbAdapter.count(Work, { where: { user_id: localUserId, status: 'published' } });
        await DbAdapter.update(User, { work_count: totalWorkCount }, { where: { id: localUserId } });
        
        console.log(`同步完成，新增 ${syncCount} 个作品，总计 ${totalWorkCount} 个`);
    } catch (error) {
        console.error('同步用户作品错误:', error);
    } finally {
        // Bug-10: 释放同步锁
        clearTimeout(lockTimer);
        syncLocks.delete(lockKey);
    }
}

/**
 * 登出: 清除服务端 httpOnly cookie
 * 即使 JWT 本身还有效,cookie 没了前端也调不通任何 API
 */
async function logout(req, res) {
    try {
        clearTokenCookie(res);
        // 修复: 登出时递增 token_version,使已签发的 JWT 全部失效(防泄漏Token重用)
        if (req.user?.id) {
            await DbAdapter.increment(User, { token_version: 1 }, { where: { id: DbAdapter.getId(req.user) } });
        }
        return successResponse(res, null, '已登出');
    } catch (error) {
        console.error('登出错误:', error);
        return errorResponse(res, '登出失败', 500);
    }
}

/**
 * 获取当前用户信息
 */
async function getCurrentUser(req, res) {
    try {
        const user = await DbAdapter.findByPk(User, DbAdapter.getId(req.user), {
            attributes: { exclude: ['password', 'codemao_token'] }
        });
        
        if (!user) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '用户不存在', 404);
        }
        
        return successResponse(res, user);
    } catch (error) {
        cleanupUploadedFile(req.file);
        console.error('获取用户信息错误:', error);
        return errorResponse(res, '获取用户信息失败', 500);
    }
}

/**
 * 更新用户资料
 */
async function updateProfile(req, res) {
    try {
        let { nickname, bio, doing, profile_cover, show_favorites, geetest_challenge, geetest_validate, geetest_seccode } = req.body;
        
        const result = req.geetestVerifiedScenes?.has('update_profile')
            ? { success: true }
            : await GeetestService.verify(
                'update_profile',
                geetest_challenge,
                geetest_validate,
                geetest_seccode,
                req
            );
        
        if (!result.success) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '请完成验证码验证', 400);
        }
        
        const user = await DbAdapter.findByPk(User, DbAdapter.getId(req.user));
        if (!user) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '用户不存在', 404);
        }

        // (报告1 #13) 昵称先 trim 再校验非空，避免纯空格通过校验
        // 在长度校验与审核之前执行，落库存的是 trim 后的值
        if (nickname !== undefined && nickname !== null) {
            nickname = String(nickname).trim();
            if (!nickname) {
                cleanupUploadedFile(req.file);
                return errorResponse(res, '昵称不能为纯空格', 400);
            }
        }

        if (nickname && String(nickname).length > 50) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '昵称不能超过50字', 400);
        }
        if (bio && String(bio).length > 500) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '简介不能超过500字', 400);
        }
        if (doing && String(doing).length > 200) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '正在做不能超过200字', 400);
        }

        if (profile_cover !== undefined && profile_cover !== null && profile_cover !== '' && (!/^https?:\/\//i.test(String(profile_cover)) || String(profile_cover).length > 500)) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '主页封面地址无效', 400);
        }

        let avatar = user.avatar;
        const oldAvatar = user.avatar; // (Report 1 #7) 记录旧头像，DB 更新后清理磁盘文件
        if (req.file) {
            avatar = req.file.external_url || `/uploads/avatars/${req.file.filename}`;
        }

        // (Report 2 #21) 先对原始（未转义）文本做内容审核，再转义落库。
        // 原代码先转义后审核，导致审核看到的是已转义文本而非用户真实输入，
        // review verdicts 可能与用户实际输入不符。
        const reviewContent = [
            nickname != null ? String(nickname).trim() : '',
            bio !== undefined ? String(bio).trim() : '',
            doing !== undefined ? String(doing).trim() : ''
        ].filter(v => v !== '').join('\n');
        if (reviewContent.trim()) {
            const reviewResult = await aiReview.fallbackReview(reviewContent);
            if (reviewResult.recommendation === 'delete') {
                cleanupUploadedFile(req.file);
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            if (reviewResult.recommendation === 'review') {
                cleanupUploadedFile(req.file);
                return errorResponse(res, `内容需人工审核,请修改后重试:${reviewResult.reason}`, 400);
            }
        }

        // 审核通过后存原始文本(不转义),渲染时才转义,避免 Vue 模板引擎二次转义(& → &amp;amp;)
        // 与 studioController 保持统一: 全站存原始,渲染转义
        const savedNickname = nickname ? nickname : user.nickname;
        const savedBio = bio !== undefined ? String(bio).trim() : user.bio;
        const savedDoing = doing !== undefined ? String(doing).trim() : user.doing;
        const savedCover = profile_cover !== undefined ? String(profile_cover || '').trim() : user.profile_cover;
        const savedShowFavorites = show_favorites !== undefined
            ? (show_favorites === true || show_favorites === 'true' || show_favorites === 1 || show_favorites === '1')
            : user.show_favorites;

        if (String(savedNickname).length > 50) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '昵称不能超过50字', 400);
        }
        if (String(savedBio).length > 500) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '简介不能超过500字', 400);
        }
        if (String(savedDoing).length > 200) {
            cleanupUploadedFile(req.file);
            return errorResponse(res, '正在做不能超过200字', 400);
        }

        await DbAdapter.update(User, {
            nickname: savedNickname,
            avatar: avatar,
            bio: savedBio,
            doing: savedDoing,
            profile_cover: savedCover || null,
            show_favorites: savedShowFavorites
        }, { where: { id: DbAdapter.getId(user) } });

        // (Report 1 #7) 头像更新后清理旧头像文件，避免磁盘泄漏。
        // (Report4 #4, Report4 #15) 加固路径穿越防御：
        // - 仅处理 /uploads/avatars/ 前缀的本地 URL，外部 URL（codemao/默认）跳过
        // - 拒绝含空字节的路径（oldAvatar.includes('\0') 即跳过）
        // - path.resolve 规范化 uploads 根目录与旧头像路径后，严格校验目标在根目录之下
        // - 仅删除真实存在的普通文件（fs.statSync().isFile()）
        // - unlink 失败不影响请求
        if (req.file && oldAvatar && oldAvatar !== avatar && oldAvatar.startsWith('/uploads/avatars/')) {
            try {
                if (oldAvatar.includes('\0')) {
                    // null-byte 截断防御：直接跳过删除
                    console.warn('[updateProfile] 旧头像路径包含空字节，跳过删除:', oldAvatar);
                } else {
                    const oldFileName = path.basename(oldAvatar);
                    const oldFilePath = path.join(uploadDir, oldFileName);
                    safeUnlinkFile(oldFilePath, uploadDir);
                }
            } catch (e) {
                console.error('[updateProfile] 清理旧头像文件异常:', e.message);
            }
        }
        
        const updatedUser = await DbAdapter.findByPk(User, DbAdapter.getId(user));

        // The local file is only a staging copy when the external image host
        // succeeded. Keep it solely when the persisted avatar is the local
        // fallback URL.
        if (req.file?.external_url) {
            cleanupUploadedFile(req.file);
        }
        
        return successResponse(res, {
            id: DbAdapter.getId(updatedUser),
            username: updatedUser.username,
            nickname: updatedUser.nickname,
            avatar: updatedUser.avatar,
            bio: updatedUser.bio,
            doing: updatedUser.doing,
            profile_cover: updatedUser.profile_cover,
            show_favorites: updatedUser.show_favorites
        }, '资料更新成功');
    } catch (error) {
        cleanupUploadedFile(req.file);
        console.error('更新资料错误:', error);
        return errorResponse(res, '更新资料失败', 500);
    }
}

/**
 * 获取用户公开信息（使用编程猫用户ID）
 * 注意：仅按 codemao_user_id 查询，禁止通过本地主键枚举
 */
async function getUserById(req, res) {
    try {
        const { codemaoId } = req.params;

        // 仅允许通过编程猫用户ID查询；防止外部通过本地主键遍历用户
        // 公开接口不返回本地主键 id，避免用户枚举/关联分析风险
        // 修复: 加上 status:'active' 过滤,封禁(disabled)用户不对外展示
        const user = await DbAdapter.findOne(User, {
            where: { codemao_user_id: String(codemaoId), status: 'active' },
            attributes: ['codemao_user_id', 'username', 'nickname', 'avatar', 'profile_cover', 'show_favorites', 'bio', 'doing', 'level', 'follower_count', 'following_count', 'work_count', 'created_at']
        });

        if (!user) {
            return errorResponse(res, '用户不存在', 404);
        }

        return successResponse(res, user);
    } catch (error) {
        console.error('获取用户信息错误:', error);
        return errorResponse(res, '获取用户信息失败', 500);
    }
}

async function createImSsoTicket(req, res) {
    try {
        const { createImTicket, getImPublicUrl } = require('../services/imSso');
        const publicUrl = getImPublicUrl();
        if (!publicUrl) return errorResponse(res, '即时通讯系统暂未启用', 503);
        const user = await DbAdapter.findByPk(User, req.user.id, {
            attributes: ['id', 'username', 'nickname', 'avatar', 'codemao_user_id', 'role', 'status', 'token_version']
        });
        if (!user || user.status !== 'active') return errorResponse(res, '账号不可用', 403);
        const params = new URLSearchParams();
        const action = String(req.body?.action || '');
        let peer = null;
        if (action === 'direct') {
            const userId = Number(req.body?.user_id);
            if (!Number.isInteger(userId) || userId <= 0 || userId === Number(req.user.id)) return errorResponse(res, '私聊目标无效', 400);
            peer = await DbAdapter.findByPk(User, userId, { attributes: ['id', 'username', 'nickname', 'avatar', 'codemao_user_id', 'role', 'status'] });
            if (!peer || peer.status !== 'active') return errorResponse(res, '私聊目标不存在或不可用', 404);
            params.set('action', 'direct'); params.set('user_id', String(userId));
        } else if (action === 'group') {
            const groupId = Number(req.body?.group_id);
            if (!Number.isInteger(groupId) || groupId <= 0) return errorResponse(res, '群聊目标无效', 400);
            params.set('action', 'group'); params.set('group_id', String(groupId));
        } else if (action === 'admin') {
            if (!['admin', 'superadmin'].includes(user.role)) return errorResponse(res, '无权访问即时通讯后台', 403);
            params.set('action', 'admin');
        }
        const ticket = createImTicket(user, { peer, req });
        params.set('ticket', ticket);
        // origin 用于前端导航白名单校验：只允许跳转到 IM 自身域名，防 open redirect
        let origin = '';
        try { origin = new URL(publicUrl).origin; } catch { origin = ''; }
        return successResponse(res, { url: `${publicUrl}/sso?${params.toString()}`, origin }, '正在进入即时通讯');
    } catch (error) {
        console.error('创建 IM SSO Ticket 失败:', error.message);
        return errorResponse(res, error.message || '即时通讯登录失败', error.statusCode || 500);
    }
}

async function getImAccountStatus(req, res) {
    try {
        const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (!token) return errorResponse(res, '缺少 IM 状态凭证', 401);
        const { verifyImStatusToken } = require('../services/imSso');
        const payload = verifyImStatusToken(token);
        const user = await DbAdapter.findByPk(User, Number(payload.sub), { attributes: ['id', 'status', 'role', 'token_version'] });
        if (!user || user.status !== 'active' || Number(user.token_version || 0) !== Number(payload.token_version || 0)) return errorResponse(res, '账号已停用或登录状态已失效', 403);
        return successResponse(res, { active: true, user_id: Number(user.id), role: user.role, token_version: user.token_version || 0 });
    } catch (error) {
        return errorResponse(res, 'IM 状态凭证无效或已过期', 401);
    }
}

/**
 * IM 举报后台的受限账号处置入口。
 * 仅接受编程狗自己签发给当前 IM 管理员的短期状态凭证；服务端会重新查询
 * 操作者角色，不能依赖 IM 传来的角色，也不能越级禁用同级或更高级管理员。
 */
async function disableUserFromIm(req, res) {
    try {
        const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const reason = String(req.body?.reason || '').trim();
        const targetId = Number(req.params.userId);
        if (!token) return errorResponse(res, '缺少 IM 管理凭证', 401);
        if (!Number.isInteger(targetId) || targetId <= 0 || reason.length < 5 || reason.length > 500) return errorResponse(res, '禁用参数或原因无效', 400);
        const { verifyImStatusToken } = require('../services/imSso');
        const payload = verifyImStatusToken(token);
        const operator = await DbAdapter.findByPk(User, Number(payload.sub), { attributes: ['id', 'username', 'nickname', 'role', 'status', 'token_version'] });
        if (!operator || operator.status !== 'active' || Number(operator.token_version || 0) !== Number(payload.token_version || 0)) return errorResponse(res, 'IM 管理凭证已失效', 403);
        if (!['admin', 'superadmin'].includes(operator.role)) return errorResponse(res, '当前账号无禁用用户权限', 403);
        const target = await DbAdapter.findByPk(User, targetId, { attributes: ['id', 'username', 'nickname', 'role', 'status', 'token_version'] });
        if (!target) return errorResponse(res, '目标用户不存在', 404);
        const levels = { user: 0, reviewer: 1, moderator: 2, admin: 3, superadmin: 4 };
        const operatorLevel = levels[operator.role] ?? -1;
        const targetLevel = levels[target.role] ?? Number.POSITIVE_INFINITY;
        if (Number(target.id) === Number(operator.id) || targetLevel >= operatorLevel) return errorResponse(res, '不能禁用自己或同级及更高权限账号', 403);
        if (target.status !== 'disabled') await DbAdapter.update(User, { status: 'disabled' }, { where: { id: targetId } });
        const refreshed = await DbAdapter.findByPk(User, targetId, { attributes: ['id', 'status', 'role', 'token_version'] });
        require('../services/imStatusPush').enqueueImStatus(refreshed);
        req.user = operator;
        await logOperation(req, 'im_report_disable_user', 'user', targetId, { reason, im_report_id: Number(req.body?.report_id) || null, old_status: target.status, new_status: 'disabled' });
        return successResponse(res, { user_id: targetId, status: 'disabled' }, '用户已由 IM 举报审核禁用');
    } catch (error) {
        console.error('IM 举报禁用用户失败:', error.message);
        return errorResponse(res, 'IM 管理凭证无效或处置失败', error.name === 'JsonWebTokenError' ? 401 : 500);
    }
}

/**
 * 根据编程猫API返回的错误信息生成友好的错误提示
 */
function getLoginErrorMessage(codemaoRes) {
    const message = codemaoRes.message || '';
    const errorCode = codemaoRes.error_code || codemaoRes.code;
    
    // 常见错误类型映射
    const errorMap = {
        'user_not_found': '用户不存在，请检查用户名是否正确',
        'password_error': '密码错误，请重新输入',
        'password_incorrect': '密码错误，请重新输入',
        'account_disabled': '账号已被禁用，请联系编程猫客服',
        'account_banned': '账号已被封禁，请联系编程猫客服',
        'account_locked': '账号已被锁定，请稍后重试或联系客服',
        'too_many_attempts': '登录尝试次数过多，请稍后重试',
        'invalid_credentials': '用户名或密码错误',
        'network_error': '网络连接失败，请检查网络后重试',
        'server_error': '编程猫服务暂时不可用，请稍后重试'
    };
    
    // 根据错误码查找
    if (errorCode && errorMap[errorCode]) {
        return errorMap[errorCode];
    }
    
    // 根据错误信息关键词判断
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('password') || lowerMessage.includes('密码')) {
        return '密码错误，请重新输入';
    }
    if (lowerMessage.includes('user') || lowerMessage.includes('用户') || lowerMessage.includes('not found')) {
        return '用户不存在，请检查用户名是否正确';
    }
    if (lowerMessage.includes('disabled') || lowerMessage.includes('banned') || lowerMessage.includes('禁用') || lowerMessage.includes('封禁')) {
        return '账号已被禁用，请联系编程猫客服';
    }
    if (lowerMessage.includes('locked') || lowerMessage.includes('锁定')) {
        return '账号已被锁定，请稍后重试';
    }
    if (lowerMessage.includes('too many') || lowerMessage.includes('频繁')) {
        return '操作过于频繁，请稍后重试';
    }
    
    // 默认返回原始信息或通用提示
    return message || '登录失败，请检查用户名和密码';
}

module.exports = {
    login,
    logout,
    getCurrentUser,
    updateProfile,
    getUserById,
    createImSsoTicket,
    getImAccountStatus,
    disableUserFromIm
};
