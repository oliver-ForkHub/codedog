/**
 * 作品控制器
 */

const { Work, User, sequelize } = require('../models');
const { successResponse, errorResponse, paginateResponse } = require('../middleware/response');
const { Op } = require('sequelize');
const DbAdapter = require('../utils/dbAdapter');
const codemaoApi = require('../services/codemaoApi');
const { isRoleAtLeast, canManageUser } = require('../config/permissions');
const { likeContains } = require('../utils/security');
const { buildCodemaoPlayerUrl } = require('../utils/codemaoPlayer');
// H12: 引入内容审核服务，落库前做敏感词检查
const aiReview = require('../services/aiReview');
// P0: 与 adminController 保持一致，爬虫创建虚拟用户时使用合法的占位密码哈希
// 旧实现使用非法字符串 '$2a$10$placeholder' 会导致 bcrypt 校验异常，这里在模块加载时
// 运行时生成一次合法哈希并缓存，避免重复计算
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PLACEHOLDER_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
/**
 * 从编程猫API获取作品信息
 */
async function fetchCodemaoWork(workId) {
    try {
        const data = await codemaoApi.getWorkDetail(workId);
        
        if (!data || !data.id) {
            console.error('获取编程猫作品失败: 返回数据为空或无效');
            return null;
        }
        
        if (!data.work_name) {
            console.error('获取编程猫作品失败: 作品名称为空');
            return null;
        }
        
        return {
            codemaoWorkId: data.id,
            name: data.work_name,
            description: data.description || '',
            preview: data.preview || '',
            type: data.type || data.work_label_list?.[0]?.label_name || '其他',
            ideType: data.ide_type || 'KITTEN',
            playerUrl: data.player_url || '',
            codemaoAuthorId: data.user_info?.id || null,
            codemaoAuthorName: data.user_info?.nickname || '未知作者',
            praiseTimes: data.praise_times || data.liked_times || 0,
            collectionTimes: data.collect_times || 0,
            viewTimes: data.view_times || 0,
            commentTimes: data.comment_times || 0
        };
    } catch (error) {
        console.error('获取编程猫作品失败:', error.message);
        return null;
    }
}

/**
 * 构建 Work.create 参数
 */
function buildWorkCreateParams(workInfo, userId) {
    return {
        codemao_work_id: String(workInfo.codemaoWorkId),
        name: workInfo.name,
        description: workInfo.description,
        preview: workInfo.preview,
        type: workInfo.type || '其他',
        ide_type: workInfo.ideType || 'KITTEN',
        // 修复: player_url 为空时回退到标准播放器 URL，避免 work_url 落库为空
        work_url: buildCodemaoPlayerUrl({
            workId: workInfo.codemaoWorkId,
            playerUrl: workInfo.playerUrl,
            type: workInfo.type,
            ideType: workInfo.ideType
        }),
        user_id: userId,
        codemao_author_id: workInfo.codemaoAuthorId != null ? String(workInfo.codemaoAuthorId) : null,
        codemao_author_name: workInfo.codemaoAuthorName,
        // 中·脏数据: praise_times/collection_times 统一归 0,不与 comment_count 口径不一致。
        // 外部数据是编程猫总赞/收藏,本地无 Like/Favorite 记录;
        // 若非 0 入库会导致: consistency-check 判漂移、repair-counts 归零、用户点赞翻倍(+1 叠加在 500 上)。
        // 如需保留外部快照,应新增独立字段存储,不参与本地重算。
        praise_times: 0,
        collection_times: 0,
        view_times: workInfo.viewTimes,
        comment_count: 0,
        status: 'published'
    };
}

async function withLikeStatus(req, work) {
    const data = work.toJSON ? work.toJSON() : work.toObject ? work.toObject() : work;
    let liked = false;

    if (req.user) {
        const { Like } = require('../models');
        const likeRecord = await DbAdapter.findOne(Like, {
            where: { user_id: DbAdapter.getId(req.user), work_id: DbAdapter.getId(work) }
        });
        liked = !!likeRecord;
    }

    return { ...data, liked };
}

function isValidCodemaoWorkId(codemaoId) {
    return /^\d{1,20}$/.test(String(codemaoId));
}

function canViewWork(req, work) {
    if (!work || work.status === 'deleted') {
        return false;
    }
    if (work.status === 'published') {
        return true;
    }
    if (!req.user) {
        return false;
    }
    const isOwner = work.user_id != null && String(work.user_id) === String(DbAdapter.getId(req.user));
    return isOwner || isRoleAtLeast(req.user.role, 'moderator');
}

function canInteractWithWork(work) {
    return work && work.status === 'published';
}

/**
 * 确保编程猫用户存在，不存在则创建
 * Bug-8 修复: nickname/bio 需经内容审核 + escapeHtml 转义,与 adminController.sanitizeCodemaoProfile 一致
 */
async function ensureCodemaoUser(userInfo) {
    let user = await DbAdapter.findOne(User, {
        where: { codemao_user_id: userInfo.id }
    });

    if (!user) {
        // Bug-8: 对 nickname/bio 做内容审核 + HTML 转义,与 adminController.sanitizeCodemaoProfile 一致
        const rawNickname = userInfo.nickname != null ? String(userInfo.nickname).trim() : '';
        const rawBio = userInfo.description != null ? String(userInfo.description).trim() : '';
        const reviewText = [rawNickname, rawBio].filter(v => v).join('\n');
        let blocked = false;
        if (reviewText.trim()) {
            try {
                const reviewResult = await aiReview.fallbackReview(reviewText);
                if (reviewResult.recommendation === 'delete' || reviewResult.recommendation === 'review') {
                    blocked = true;
                    console.warn(`[ensureCodemaoUser] 用户资料未通过审核(${reviewResult.recommendation})，跳过存储: ${reviewResult.reason}`);
                }
            } catch (e) {
                console.error('[ensureCodemaoUser] 用户资料审核失败:', e.message);
                blocked = true;
            }
        }

        user = await DbAdapter.create(User, {
            codemao_user_id: userInfo.id,
            username: `codemao_${userInfo.id}`,
            // 修复: 使用 @example.invalid 占位域名（与 adminController 一致），避免占用真实邮箱域
            email: `codemao_${userInfo.id}@example.invalid`,
            // 修复: 使用合法的 bcrypt 占位哈希，避免非法字符串导致校验异常
            password: PLACEHOLDER_PASSWORD_HASH,
            nickname: (!blocked && rawNickname) ? rawNickname : null,
            avatar: codemaoApi.normalizeCodemaoAvatar(userInfo),
            bio: (!blocked && rawBio) ? rawBio : null,
            role: 'user',
            status: 'active'
        });
    }

    return user;
}

/**
 * 发布作品
 */
async function publishWork(req, res) {
    try {
        const { codemaoWorkId } = req.body;
        
        if (!codemaoWorkId) {
            return errorResponse(res, '请输入编程猫作品ID', 400);
        }
        if (!isValidCodemaoWorkId(codemaoWorkId)) {
            return errorResponse(res, '作品ID格式不正确', 400);
        }
        
        const workInfo = await fetchCodemaoWork(codemaoWorkId);
        
        if (!workInfo) {
            return errorResponse(res, '获取作品信息失败，请检查作品ID是否正确或作品是否公开', 400);
        }

        const isOwnWork = workInfo.codemaoAuthorId
            && String(workInfo.codemaoAuthorId) === String(req.user.codemao_user_id);
        const canPublishOthers = isRoleAtLeast(req.user.role, 'admin');

        // 普通用户只能发布本人作品；管理员可代发布任意公开作品。
        // 代发布作品在编程狗站内归执行操作的管理员，编程猫原作者信息仍保存在
        // codemao_author_id / codemao_author_name 来源字段中。
        if (!isOwnWork && !canPublishOthers) {
            return errorResponse(res, '只能发布自己的编程猫作品', 403);
        }

        // H12 / 报告1 #3: 落库前审核作品 name + description（敏感词/违规检查）
        // 原 fallbackReview 仅审核 description，导致作品名包含违规内容时被放行；
        // 现将 name 与 description 拼接后一起审核
        // fallbackReview 返回 recommendation: pass / review / delete
        const reviewResult = await aiReview.fallbackReview(String(`${workInfo.name || ''} ${workInfo.description || ''}`));
        if (reviewResult.recommendation === 'delete') {
            return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
        }
        // Work 模型 status 有 pending 枚举，review 时设为 pending 待人工复核
        const workStatus = reviewResult.recommendation === 'review' ? 'pending' : 'published';

        const createParams = buildWorkCreateParams(workInfo, DbAdapter.getId(req.user));
        createParams.status = workStatus;

        // Bug-11: 将 findOrCreate Work + 重算 work_count 放入同一事务,避免中途失败造成作品已创建但计数没更新
        let work, created;
        await sequelize.transaction(async (t) => {
            [work, created] = await DbAdapter.findOrCreate(Work, {
                where: { codemao_work_id: String(codemaoWorkId) },
                defaults: createParams,
                include: [{
                    model: User,
                    as: 'author',
                    attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
                }],
                transaction: t
            });

            if (!created) {
                return;
            }

            // 中-1: 新作品发布成功后重算作者 work_count（与 deleteWork 口径一致，仅统计 published）
            // 仅当新作品状态为 published 时才重算（pending 作品不计入 work_count）
            if (workStatus === 'published') {
                const authorId = DbAdapter.getId(req.user);
                const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
            }
        });

        if (!created) {
            return errorResponse(res, '该作品已在平台发布', 400);
        }
        
        const result = await DbAdapter.findByPk(Work, DbAdapter.getId(work), {
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }]
        });
        
        return successResponse(res, result, '作品发布成功');
    } catch (error) {
        console.error('发布作品错误:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, '该作品已在平台发布', 400);
        }
        return errorResponse(res, '发布作品失败', 500);
    }
}

/**
 * 获取作品列表
 */
async function getWorks(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const keyword = req.query.keyword || '';
        const type = req.query.type || '';
        const sortBy = req.query.sortBy || 'latest';
        
        const where = { status: 'published' };
        
        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['name', 'description'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        
        if (type) {
            where.type = type;
        }
        
        let order = [['created_at', 'DESC']];
        if (sortBy === 'popular') {
            order = [['view_times', 'DESC']];
        } else if (sortBy === 'praise') {
            order = [['praise_times', 'DESC']];
        }
        
        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where,
            include: [{
                model: User,
                as: 'author',
                // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                // 使用 required: false 使作品仍可见但 author 为 null,避免历史内容凭空消失
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }],
            order,
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
 * 获取作品详情（使用编程猫ID）
 */
async function getWorkDetail(req, res) {
    try {
        const codemaoId = req.params.codemaoId;
        const idText = String(codemaoId || '').trim();
        // 兼容管理后台跳转: 路由参数可能是 codemao_work_id 或本地 works.id
        let where = { codemao_work_id: idText };
        if (/^\d{1,20}$/.test(idText)) {
            where = {
                [Op.or]: [
                    { codemao_work_id: idText },
                    { id: Number(idText) }
                ]
            };
        }


        const work = await DbAdapter.findOne(Work, {
            where,
            include: [{
                model: User,
                as: 'author',
                // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'bio']
            }]
        });

        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }
        if (!canViewWork(req, work)) {
            return errorResponse(res, '作品不存在', 404);
        }

        // M16: 浏览量去重，参照 postController 的 session 冷却方案（5分钟内不重复计数）
        const viewKey = `work_view_${work.id}`;
        const sessionViews = (req.session && req.session.workViews) || {};
        const now = Date.now();
        const lastView = sessionViews[viewKey];
        const VIEW_COOLDOWN = 5 * 60 * 1000;
        if (!lastView || (now - lastView) > VIEW_COOLDOWN) {
            await DbAdapter.increment(work, 'view_times');
            await work.reload();
            if (req.session) {
                if (!req.session.workViews) req.session.workViews = {};
                req.session.workViews[viewKey] = now;
            }
        }
        return successResponse(res, await withLikeStatus(req, work));
    } catch (error) {
        console.error('获取作品详情错误:', error);
        return errorResponse(res, '获取作品详情失败', 500);
    }
}

/**
 * 通过编程猫ID获取作品（纯只读：命中返回，未命中返回 404，不写库）
 * 原 ?import=1 隐式导入行为已移至 POST /works/import/:codemaoId，避免 GET 产生副作用
 */
async function getWorkByCodemaoId(req, res) {
    try {
        const { codemaoId } = req.params;

        const work = await DbAdapter.findOne(Work, {
            where: { codemao_work_id: String(codemaoId) },
            include: [{
                model: User,
                as: 'author',
                // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'bio']
            }]
        });

        if (!work) {
            // 修复: GET 严格只读，不再隐式导入；导入请用 POST /works/import/:codemaoId
            return errorResponse(res, '作品不存在', 404);
        }
        if (!canViewWork(req, work)) {
            return errorResponse(res, '作品不存在', 404);
        }

        // [Bug4 修复] 复用 getWorkDetail 的 session 冷却逻辑,统一计数口径
        // 同一会话 5 分钟内不重复计数,避免刷新/爬虫无限刷浏览量
        // viewKey 使用 work.id,与 getWorkDetail 共享同一冷却记录,确保计数口径一致
        const viewKey = `work_view_${work.id}`;
        const sessionViews = (req.session && req.session.workViews) || {};
        const now = Date.now();
        const lastView = sessionViews[viewKey];
        const VIEW_COOLDOWN = 5 * 60 * 1000; // 5分钟内不重复计数
        if (!lastView || (now - lastView) > VIEW_COOLDOWN) {
            await DbAdapter.increment(work, 'view_times');
            await work.reload();
            if (req.session) {
                if (!req.session.workViews) req.session.workViews = {};
                req.session.workViews[viewKey] = now;
            }
        }
        return successResponse(res, await withLikeStatus(req, work));
    } catch (error) {
        console.error('获取编程猫作品错误:', error);
        return errorResponse(res, '获取作品信息失败', 500);
    }
}

/**
 * 导入编程猫作品（POST，需登录）
 * 语义拆分：
 *   (a) 普通用户 —— 仅可导入本人名下的编程猫作品（codemao_user_id 匹配），作品归属当前用户
 *   (b) 管理员   —— 可导入任意作品，按 codemao 作者信息解析/创建归属用户
 */
async function importWork(req, res) {
    try {
        const { codemaoId } = req.params;

        if (!req.user) {
            return errorResponse(res, '请先登录后导入作品', 401);
        }

        if (!isValidCodemaoWorkId(codemaoId)) {
            return errorResponse(res, '作品ID格式不正确', 400);
        }

        // 已存在则直接返回，避免重复导入
        const existing = await DbAdapter.findOne(Work, {
            where: { codemao_work_id: String(codemaoId) },
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'bio']
            }]
        });
        if (existing) {
            if (!canViewWork(req, existing)) {
                return errorResponse(res, '作品不存在', 404);
            }
            return successResponse(res, await withLikeStatus(req, existing), '作品已存在');
        }

        const workInfo = await fetchCodemaoWork(codemaoId);
        if (!workInfo) {
            return errorResponse(res, '作品不存在或未公开', 404);
        }

        const isAdmin = isRoleAtLeast(req.user.role, 'admin');

        // 确定作品归属用户
        let author = null;
        let importStatus = 'published';
        if (isAdmin) {
            // 管理员可导入任意作品；按 codemao 作者信息解析/创建归属用户
            if (!workInfo.codemaoAuthorId) {
                return errorResponse(res, '作品缺少作者信息，无法导入', 400);
            }
            author = await ensureCodemaoUser({
                id: workInfo.codemaoAuthorId,
                nickname: workInfo.codemaoAuthorName,
                avatar: null,
                description: ''
            });
        } else {
            // L8: 普通用户只能导入本人名下的编程猫作品，防止冒名导入
            if (!workInfo.codemaoAuthorId || String(workInfo.codemaoAuthorId) !== String(req.user.codemao_user_id)) {
                return errorResponse(res, '只能导入自己的作品', 403);
            }
            author = req.user;
        }

        // 报告1 #18: 管理员与普通用户导入均需经 AI 内容审核（与 publishWork 一致），审核 name + description
        // 管理员不得通过 import 绕过审核；如需直接发布可走单独的审批接口
        // fallbackReview 返回 recommendation: pass / review / delete
        const reviewResult = await aiReview.fallbackReview(String(`${workInfo.name || ''} ${workInfo.description || ''}`));
        if (reviewResult.recommendation === 'delete') {
            return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
        }
        // review（疑似违规）/审核失败均转 pending 待人工复核，不直接发布未审核内容
        importStatus = reviewResult.recommendation === 'pass' ? 'published' : 'pending';

        // Bug-11: 将 create Work + 重算 work_count 放入同一事务,避免中途失败造成作品已创建但计数没更新
        let work;
        try {
            const createParams = buildWorkCreateParams(workInfo, DbAdapter.getId(author));
            createParams.status = importStatus;
            await sequelize.transaction(async (t) => {
                work = await DbAdapter.create(Work, createParams, { transaction: t });

                // 中-1: 新作品导入成功后重算作者 work_count（与 deleteWork 口径一致，仅统计 published）
                // 仅当新作品状态为 published 时才重算（pending 作品不计入 work_count）
                if (importStatus === 'published') {
                    const authorId = DbAdapter.getId(author);
                    const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                    await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
                }
            });
        } catch (createError) {
            if (createError.name === 'SequelizeUniqueConstraintError') {
                const found = await DbAdapter.findOne(Work, {
                    where: { codemao_work_id: String(codemaoId) },
                    include: [{
                        model: User,
                        as: 'author',
                        attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'bio']
                    }]
                });
                if (found) {
                    if (!canViewWork(req, found)) {
                        return errorResponse(res, '作品不存在', 404);
                    }
                    return successResponse(res, await withLikeStatus(req, found));
                }
                return errorResponse(res, '作品不存在', 404);
            }
            throw createError;
        }

        const result = await DbAdapter.findByPk(Work, DbAdapter.getId(work), {
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'bio']
            }]
        });

        return successResponse(res, await withLikeStatus(req, result || work), '作品导入成功');
    } catch (error) {
        console.error('导入作品错误:', error);
        return errorResponse(res, '导入作品失败', 500);
    }
}

/**
 * 获取首页推荐作品
 */
async function getFeaturedWorks(req, res) {
    try {
        // 修复: GET /works/featured 严格只读，不再回源编程猫并写库（避免绕过登录/审核/权限）
        // 无推荐作品时直接返回空数组
        const works = await DbAdapter.findAll(Work, {
            where: {
                status: 'published',
                is_featured: true
            },
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }],
            order: [['created_at', 'DESC']],
            limit: 15
        });

        return successResponse(res, works);
    } catch (error) {
        console.error('获取推荐作品错误:', error);
        return errorResponse(res, '获取推荐作品失败', 500);
    }
}

/**
 * 获取首页右侧磁吸推荐。仅返回后台明确启用且已发布的作品。
 */
async function getSidebarRecommendedWorks(req, res) {
    try {
        const works = await DbAdapter.findAll(Work, {
            where: {
                status: 'published',
                is_sidebar_recommended: true
            },
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }],
            order: [['sidebar_sort_order', 'DESC'], ['updated_at', 'DESC']],
            limit: 8
        });
        return successResponse(res, works);
    } catch (error) {
        console.error('获取右侧推荐作品错误:', error);
        return errorResponse(res, '获取右侧推荐作品失败', 500);
    }
}

/**
 * 从编程猫获取热门作品
 */
async function getHotWorksFromCodemao() {
    try {
        const bannersData = await codemaoApi.getBanners('OFFICIAL');
        const works = [];
        const seenIds = new Set();
        
        if (bannersData && bannersData.items) {
            for (const banner of bannersData.items.slice(0, 5)) {
                const workIdMatch = banner.target_url?.match(/work\/(\d+)/);
                if (!workIdMatch) continue;
                
                const workId = parseInt(workIdMatch[1]);
                if (seenIds.has(workId)) continue;
                seenIds.add(workId);
                
                const work = await fetchOrCreateWork(workId);
                if (work && work.status === 'published') works.push(work);
            }
        }
        
        if (works.length < 8) {
            const postsData = await codemaoApi.searchPosts('精选', 1, 30);
            if (postsData && postsData.items) {
                for (const post of postsData.items) {
                    if (works.length >= 8) break;
                    
                    const workIdMatch = post.content?.match(/work\/(\d+)/);
                    if (!workIdMatch) continue;
                    
                    const workId = parseInt(workIdMatch[1]);
                    if (seenIds.has(workId)) continue;
                    seenIds.add(workId);
                    
                    const work = await fetchOrCreateWork(workId);
                    if (work && work.status === 'published') works.push(work);
                }
            }
        }
        
        // 中-2/报告1 #19: 仅返回 status:'published' 的作品，过滤掉 pending（疑似违规）作品
        return works.filter(w => w && w.status === 'published');
    } catch (error) {
        console.error('获取编程猫热门作品错误:', error);
        return [];
    }
}

/**
 * 获取或创建作品
 *
 * 注意（报告1 #19）: 本函数会向数据库写入（创建 Work 记录），并已内置 AI 内容审核（round 2 修复）。
 * 仅可从已审核/受控的路径调用，不可直接接入 GET 只读端点，否则会绕过登录/审核/权限入口控制。
 * getHotWorksFromCodemao 调用本函数，并对外只返回 status:'published' 的作品（中-2 修复）。
 */
async function fetchOrCreateWork(workId) {
    let work = await DbAdapter.findOne(Work, { 
        where: { codemao_work_id: String(workId) },
        include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
        }]
    });
    
    if (work) return work;
    
    const workDetail = await codemaoApi.getWorkDetail(workId);
    if (!workDetail || !workDetail.id || !workDetail.work_name) {
        console.error(`获取作品详情失败或数据无效: workId=${workId}`);
        return null;
    }

    // 修复 P0: 作品必须有作者归属，缺少 codemao 作者信息时跳过该作品，
    // 避免 user_id:null 触发 Work.user_id 的 notNull 错误并污染 getHotWorksFromCodemao 回退结果
    if (!workDetail.user_info?.id) {
        console.warn(`作品缺少作者信息，跳过: workId=${workId}`);
        return null;
    }

    const user = await ensureCodemaoUser(workDetail.user_info);
    
    // 与后台 crawlWork 保持一致: 使用 IDE 类型，而非 work_label_list 中文标签
    let type = workDetail.type || workDetail.ide_type || 'KITTEN';
    
    const workInfo = {
        codemaoWorkId: workDetail.id,
        name: workDetail.work_name,
        description: workDetail.description || '',
        preview: workDetail.preview || '',
        type: type,
        ideType: workDetail.ide_type || type || 'KITTEN',
        playerUrl: workDetail.player_url || '',
        codemaoAuthorId: workDetail.user_info?.id,
        codemaoAuthorName: workDetail.user_info?.nickname || '未知作者',
        viewTimes: workDetail.view_times || 0,
        praiseTimes: workDetail.praise_times || workDetail.liked_times || 0,
        collectionTimes: workDetail.collect_times || 0,
        commentTimes: workDetail.comment_times || 0
    };
    
    // Bug-19: 热门作品回退创建也需经过与 publishWork/importWork 一致的内容审核（name + description），
    // 违规/疑似违规内容不得直接发布。fallbackReview 返回 recommendation: pass / review / delete
    // 审核失败/异常时 fallbackReview 内部已捕获并返回 recommendation:'review'，故此处无需 try/catch
    let fetchStatus = 'published';
    {
        const reviewResult = await aiReview.fallbackReview(String(`${workInfo.name || ''} ${workInfo.description || ''}`));
        // review（疑似违规）/ delete（严重违规）均转 pending 待人工复核，爬虫场景不阻断流程
        if (reviewResult.recommendation !== 'pass') {
            fetchStatus = 'pending';
        }
    }

    try {
        const createParams = buildWorkCreateParams(workInfo, user ? DbAdapter.getId(user) : null);
        createParams.status = fetchStatus;
        // Bug-10: create Work + 重算 author work_count 放入同一事务,避免作品创建后计数未更新
        await sequelize.transaction(async (t) => {
            work = await DbAdapter.create(Work, createParams, { transaction: t });
            if (fetchStatus === 'published' && user) {
                const authorId = DbAdapter.getId(user);
                const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
            }
        });
    } catch (createError) {
        if (createError.name === 'SequelizeUniqueConstraintError') {
            work = await DbAdapter.findOne(Work, {
                where: { codemao_work_id: String(workId) },
                include: [{
                    model: User,
                    as: 'author',
                    attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
                }]
            });
            if (work) return work;
        }
        throw createError;
    }
    
    return await DbAdapter.findByPk(Work, DbAdapter.getId(work), {
        include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
        }]
    });
}

/**
 * 获取我的作品
 */
async function getMyWorks(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);

        // Bug-18: 过滤掉 deleted 作品,但保留 pending/published/rejected,
        // 让用户在"我的作品"看到待审/被拒状态的作品,但不显示已删作品
        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where: { user_id: DbAdapter.getId(req.user), status: { [Op.ne]: 'deleted' } },
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取我的作品错误:', error);
        return errorResponse(res, '获取我的作品失败', 500);
    }
}

/**
 * 获取用户发布的作品
 */
async function getUserWorks(req, res) {
    try {
        const codemaoUserId = req.params.userId;
        // M3: 统一使用 DbAdapter.parsePagination 限制 pageSize 上限(<=100)
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);

        const user = await DbAdapter.findOne(User, {
            // 修复: 禁用用户不对外展示作品,与公开资料接口 status:'active' 过滤策略保持一致
            where: { codemao_user_id: String(codemaoUserId), status: 'active' },
            attributes: ['id']
        });

        if (!user) {
            return paginateResponse(res, [], 0, page, pageSize);
        }

        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where: { user_id: DbAdapter.getId(user), status: 'published' },
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });

        return paginateResponse(res, rows, count, page, pageSize);
    } catch (error) {
        console.error('获取用户作品错误:', error);
        return errorResponse(res, '获取用户作品失败', 500);
    }
}

/**
 * 点赞作品
 */
async function likeWork(req, res) {
    try {
        const codemaoId = req.params.codemaoId;
        const { Like, Notification } = require('../models');
        
        const work = await DbAdapter.findOne(Work, { where: { codemao_work_id: String(codemaoId) } });
        
        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }
        
        if (!canInteractWithWork(work)) {
            return errorResponse(res, 'Work not found', 404);
        }

        const existingLike = await DbAdapter.findOne(Like, {
            where: { user_id: DbAdapter.getId(req.user), work_id: DbAdapter.getId(work) }
        });
        
        if (existingLike) {
            // 已点赞 → 取消点赞（toggle）
            // 修复 bug3/bug4: destroy Like + decrement praise_times 用事务包裹保证一致性；
            // 原子 decrement 仅当 praise_times > 0 时才执行，避免并发导致负数（参照 commentController.likeComment）
            await sequelize.transaction(async (t) => {
                const removed = await DbAdapter.destroy(Like, {
                    where: { id: DbAdapter.getId(existingLike) },
                    transaction: t
                });
                if (removed) {
                    await DbAdapter.decrement(work, 'praise_times', {
                        where: { praise_times: { [Op.gt]: 0 } },
                        transaction: t
                    });
                }
            });
            await work.reload();
            const praiseTimes = Math.max(0, work.praise_times || 0);
            return successResponse(res, { praise_times: praiseTimes, liked: false }, '已取消点赞');
        }

        // 修复 bug3: create Like + increment praise_times 用事务包裹，中途失败回滚避免不一致
        try {
            await sequelize.transaction(async (t) => {
                await DbAdapter.create(Like, {
                    user_id: DbAdapter.getId(req.user),
                    work_id: DbAdapter.getId(work)
                }, { transaction: t });
                await DbAdapter.increment(work, 'praise_times', { transaction: t });
            });
        } catch (createError) {
            if (createError.name === 'SequelizeUniqueConstraintError') {
                return errorResponse(res, '已经点赞过了', 400);
            }
            throw createError;
        }
        await work.reload();

        if (work.user_id != null && String(work.user_id) !== String(DbAdapter.getId(req.user))) {
            try {
                // L2: 通知去重，同一用户对同一作品的点赞通知只发一次，
                // 避免取消又点赞反复打扰作者(参照 postController.likePost 模式)
                const existNotify = await DbAdapter.findOne(Notification, {
                    where: {
                        user_id: work.user_id,
                        type: 'like',
                        related_id: DbAdapter.getId(work),
                        related_type: 'work',
                        sender_id: DbAdapter.getId(req.user)
                    }
                });
                if (!existNotify) {
                    await DbAdapter.create(Notification, {
                        user_id: work.user_id,
                        type: 'like',
                        title: '点赞了你的作品',
                        content: work.name,
                        related_id: DbAdapter.getId(work),
                        related_type: 'work',
                        sender_id: DbAdapter.getId(req.user)
                    });
                }
            } catch (notifyErr) {
                // 通知失败不应回滚点赞主流程
                console.error('Create like notification error:', notifyErr);
            }
        }

        return successResponse(res, { praise_times: work.praise_times || 0, liked: true }, '点赞成功');
    } catch (error) {
        console.error('点赞作品错误:', error);
        return errorResponse(res, '点赞失败', 500);
    }
}

/**
 * 删除作品
 */
async function deleteWork(req, res) {
    try {
        const codemaoId = req.params.codemaoId;
        const work = await DbAdapter.findOne(Work, { where: { codemao_work_id: String(codemaoId) } });

        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }

        const isOwner = work.user_id != null && String(work.user_id) === String(DbAdapter.getId(req.user));
        if (!isOwner && !isRoleAtLeast(req.user.role, 'moderator')) {
            return errorResponse(res, '无权删除此作品', 403);
        }
        // 修复: moderator 删除他人内容时需校验目标作者角色,不能删除同级或上级管理员的内容
        if (!isOwner && work.user_id) {
            const { User } = require('../models');
            const targetAuthor = await DbAdapter.findByPk(User, work.user_id, { attributes: ['id', 'role'] });
            if (targetAuthor && !canManageUser(req.user.role, targetAuthor.role)) {
                return errorResponse(res, '无权删除此用户的作品', 403);
            }
        }

        const { Like, Favorite, Comment, StudioWork, Notification, Studio } = require('../models');
        const wid = DbAdapter.getId(work);
        const authorId = work.user_id;

        // M8: 删除作品涉及多表关联数据，必须用事务包裹，任一步失败整体回滚
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
            await DbAdapter.destroy(Like, { where: { work_id: wid }, transaction: t });
            await DbAdapter.destroy(Favorite, { where: { work_id: wid }, transaction: t });
            // Comment 有 status 字段，关联清理采用软删保持历史可追溯
            await DbAdapter.update(Comment, { status: 'deleted' }, { where: { work_id: wid }, transaction: t });
            // 修复: 作品改为软删（status:'deleted'），与 adminController 保持一致。
            // 此前硬删会让软删评论的 work_id 成为指向不存在作品的死指针；统一软删保留作品行，数据可恢复
            // 报告3 #2: 同时清零 praise_times / collection_times，避免恢复后计数与已删除的 Like/Favorite
            // 记录错位（记录已硬删但计数非零 → 用户重新点赞/收藏导致计数翻倍）
            // Bug-7: 同时清零 comment_count,与 adminController.deleteWork 保持一致
            await DbAdapter.update(Work, { status: 'deleted', praise_times: 0, collection_times: 0, comment_count: 0 }, { where: { id: wid }, transaction: t });

            // M9: 重算受影响工作室的 work_count 和 total_score
            // 修复: 原先只重算 work_count 不重算 total_score,删除已评分作品后总分漂移
            for (const sid of affectedStudioIds) {
                const approvedCount = await DbAdapter.count(StudioWork, { where: { studio_id: sid, status: 'approved' }, transaction: t });
                const totalScore = await DbAdapter.sum(StudioWork, 'score', { where: { studio_id: sid, status: 'approved' }, transaction: t }) || 0;
                await DbAdapter.update(Studio, { work_count: approvedCount, total_score: totalScore }, { where: { id: sid }, transaction: t });
            }

            // M9 / 报告1 #8 / 报告3 #3: 重算作者 work_count，避免计数与实际作品数不一致
            // 修复: 仅统计 status:'published' 的作品，避免把软删(status:'deleted')/待审(status:'pending')
            // 等作品计入 work_count 导致计数永远不下降
            if (authorId != null) {
                const authorWorkCount = await DbAdapter.count(Work, { where: { user_id: authorId, status: 'published' }, transaction: t });
                await DbAdapter.update(User, { work_count: authorWorkCount }, { where: { id: authorId }, transaction: t });
            }
        });

        return successResponse(res, null, '作品已删除');
    } catch (error) {
        console.error('删除作品错误:', error);
        return errorResponse(res, '删除作品失败', 500);
    }
}

/**
 * 更新作品信息（用户只能修改自己的）
 */
async function updateWork(req, res) {
    try {
        const { codemaoId } = req.params;
        const { name, description, preview } = req.body;
        
        const work = await DbAdapter.findOne(Work, { where: { codemao_work_id: String(codemaoId) } });
        
        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }
        
        const isOwner = work.user_id != null && String(work.user_id) === String(DbAdapter.getId(req.user));
        if (!isOwner) {
            return errorResponse(res, '无权修改此作品', 403);
        }

        // [Bug5 修复] 用 !== undefined 判断字段是否传入,空字符串视为有效输入(允许清空)
        // 原代码 if (name) / if (preview) 会忽略空字符串,导致无法清空名称/预览图
        if (name !== undefined && String(name).length > 200) {
            return errorResponse(res, '名称不能超过200字', 400);
        }

        if (description !== undefined && String(description).length > 10000) {
            return errorResponse(res, '作品简介不能超过10000字', 400);
        }

        if (preview !== undefined && String(preview).length > 500) {
            return errorResponse(res, '预览图地址不能超过500字', 400);
        }

        const updateData = {};
        if (name !== undefined) updateData.name = String(name).substring(0, 200);
        if (description !== undefined) updateData.description = String(description);
        if (preview !== undefined) updateData.preview = String(preview).substring(0, 500);

        // 修复: 拒绝空/空白作品名（trim 后为空视为无效），避免落库空名
        if (updateData.name !== undefined && !String(updateData.name).trim()) {
            return errorResponse(res, '作品名不能为空', 400);
        }

        // H12: 修改描述或名称后重新审核，违规内容拦截，疑似违规回退到 pending 待人工复核
        if (updateData.description !== undefined || updateData.name !== undefined) {
            const reviewText = `${updateData.name !== undefined ? updateData.name : (work.name || '')} ${updateData.description !== undefined ? updateData.description : (work.description || '')}`;
            const reviewResult = await aiReview.fallbackReview(String(reviewText));
            if (reviewResult.recommendation === 'delete') {
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            if (reviewResult.recommendation === 'review') {
                updateData.status = 'pending';
            } else {
                // 🔴2 修复: 审核通过(pass)时,若作品此前因审核被设为 pending,恢复为 published
                // 与 postController.updatePost 行为一致:用户改正内容后不应永久待审
                if (work.status === 'pending') {
                    updateData.status = 'published';
                }
            }
        }

        await DbAdapter.update(Work, updateData, { where: { id: DbAdapter.getId(work) } });
        
        return successResponse(res, null, '作品信息已更新');
    } catch (error) {
        console.error('更新作品错误:', error);
        return errorResponse(res, '更新失败', 500);
    }
}

module.exports = {
    publishWork,
    getWorks,
    getWorkDetail,
    getWorkByCodemaoId,
    importWork,
    getFeaturedWorks,
    getSidebarRecommendedWorks,
    getMyWorks,
    getUserWorks,
    likeWork,
    deleteWork,
    updateWork,
    fetchCodemaoWork
};
