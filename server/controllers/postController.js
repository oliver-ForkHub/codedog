const DbAdapter = require('../utils/dbAdapter');
/**
 * 社区帖子控制器
 */

const { Post, User, Comment, Notification, ForumBoard, ForumBoardSubscription, PostSubscription, PostDraft, Favorite, Statistics, Studio, StudioMember, sequelize } = require('../models');
const { successResponse, errorResponse, paginateResponse } = require('../middleware/response');
const { Op } = require('sequelize');
const { isRoleAtLeast, canManageUser } = require('../config/permissions');
const { likeContains } = require('../utils/security');
// H12: 引入内容审核服务，落库前做敏感词检查
const aiReview = require('../services/aiReview');
const { recordPostRevision, recordModerationLog, softDeletePost } = require('../services/forumHistory');
const { getForumLeaderboard, getUserForumReputation, invalidateForumReputation } = require('../services/forumReputation');

function canInteractWithPost(post) {
    return post && post.status === 'published';
}

// 浏览趋势按“帖子 + 小时”聚合，并循环复用 3 个时段槽位。
// 这样后台可以识别短时间流量激增，同时不会为每次浏览永久新增一条日志。
async function recordPostViewMetric(postId, viewedAt = new Date()) {
    const bucket = new Date(viewedAt);
    bucket.setMinutes(0, 0, 0);
    const hourNumber = Math.floor(bucket.getTime() / (60 * 60 * 1000));
    const statKey = `forum_post_view:${postId}:${hourNumber % 3}`;
    const [row, created] = await Statistics.findOrCreate({
        where: { stat_key: statKey },
        defaults: { stat_value: 1, stat_date: bucket }
    });
    if (created) return;
    const rowBucket = row.stat_date ? new Date(row.stat_date).getTime() : 0;
    if (rowBucket !== bucket.getTime()) {
        await row.update({ stat_value: 1, stat_date: bucket });
    } else {
        await row.increment('stat_value');
    }
}

async function getLeaderboard(req, res) {
    try {
        return successResponse(res, await getForumLeaderboard(req.query.limit));
    } catch (error) {
        console.error('获取论坛贡献榜失败:', error);
        return errorResponse(res, '获取论坛贡献榜失败', 500);
    }
}

async function getUserReputation(req, res) {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isSafeInteger(userId) || userId <= 0) return errorResponse(res, '无效的用户 ID', 400);
        const reputation = await getUserForumReputation(userId);
        if (!reputation) return errorResponse(res, '用户不存在', 404);
        return successResponse(res, reputation);
    } catch (error) {
        console.error('获取用户论坛档案失败:', error);
        return errorResponse(res, '获取用户论坛档案失败', 500);
    }
}

async function getUserForumPosts(req, res) {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isSafeInteger(userId) || userId <= 0) return errorResponse(res, '无效的用户 ID', 400);
        const user = await User.findOne({ where: { id: userId, status: 'active' }, attributes: ['id'] });
        if (!user) return errorResponse(res, '用户不存在', 404);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await Post.findAndCountAll({
            where: { user_id: userId, status: 'published' },
            include: [{ model: ForumBoard, as: 'board', required: false, attributes: ['id', 'slug', 'name', 'icon', 'color'] }],
            order: [['is_top', 'DESC'], ['last_reply_at', 'DESC'], ['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        return paginateResponse(res, rows.map(normalizePostOutput), count, page, pageSize);
    } catch (error) {
        console.error('获取用户论坛主题失败:', error);
        return errorResponse(res, '获取用户论坛主题失败', 500);
    }
}

async function getCodemaoUserForumPosts(req, res) {
    try {
        const codemaoId = String(req.params.codemaoId || '').trim();
        if (!/^\d+$/.test(codemaoId)) return errorResponse(res, '无效的编程猫用户 ID', 400);
        const user = await User.findOne({ where: { codemao_user_id: codemaoId, status: 'active' }, attributes: ['id'] });
        if (!user) return errorResponse(res, '用户不存在', 404);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await Post.findAndCountAll({
            where: { user_id: DbAdapter.getId(user), status: 'published' },
            include: [{ model: ForumBoard, as: 'board', required: false, attributes: ['id', 'slug', 'name', 'icon', 'color'] }],
            order: [['is_top', 'DESC'], ['last_reply_at', 'DESC'], ['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        return paginateResponse(res, rows.map(normalizePostOutput), count, page, pageSize);
    } catch (error) {
        console.error('按编程猫用户 ID 获取论坛主题失败:', error);
        return errorResponse(res, '获取用户论坛主题失败', 500);
    }
}

const POST_TYPES = new Set(['discussion', 'question', 'tutorial']);

async function resolveBoard(boardId, legacyCategory, role = 'user') {
    const where = boardId ? { id: Number(boardId), status: 'active' } : { slug: legacyCategory || 'discussion', status: 'active' };
    const board = await ForumBoard.findOne({ where });
    if (!board) return { error: '所选论坛版块不存在或已停用' };
    const roles = Array.isArray(board.allow_post_roles) ? board.allow_post_roles : [];
    if (roles.length && !roles.includes(role)) return { error: '当前账号无权在该版块发帖' };
    return { board };
}

async function resolveRecruitmentStudio(board, reqUser, transaction) {
    if (!board.studio_recruitment_only) return { studioId: null };
    const studio = await Studio.findOne({
        where: { owner_id: DbAdapter.getId(reqUser), status: 'active' }, transaction
    });
    if (!studio) return { error: '该板块仅允许活跃工作室的室长发布招募帖' };
    if (studio.recruitment_status !== 'open') return { error: '您的工作室已暂停招募，请先在工作室设置中开启招募' };
    const ownerMember = await StudioMember.findOne({
        where: { studio_id: studio.id, user_id: DbAdapter.getId(reqUser), role: 'owner', status: 'active' }, transaction
    });
    if (!ownerMember) return { error: '只有工作室室长可以发布招募帖' };
    return { studioId: studio.id };
}

async function resolveStudioForumTarget(board, requestedStudioId, reqUser, transaction) {
    if (board.slug !== 'studios') return { studioId: null };
    const studioId = Number(requestedStudioId);
    if (!Number.isSafeInteger(studioId) || studioId <= 0) return { error: '请选择要发布到的工作室' };
    const membership = await StudioMember.findOne({
        where: { studio_id: studioId, user_id: DbAdapter.getId(reqUser), status: 'active' },
        include: [{ model: Studio, as: 'studio', required: true, where: { status: 'active' }, attributes: ['id'] }],
        transaction
    });
    if (!membership) return { error: '只有该工作室的正式成员可以在此发布主题' };
    return { studioId };
}

async function getBoards(req, res) {
    try {
        const boards = await ForumBoard.findAll({ where: { status: 'active' }, order: [['sort_order', 'ASC'], ['id', 'ASC']] });
        const subscribed = req.user ? await ForumBoardSubscription.findAll({ where: { user_id: DbAdapter.getId(req.user) }, attributes: ['board_id'] }) : [];
        const subscribedIds = new Set(subscribed.map(item => Number(item.board_id)));
        const data = await Promise.all(boards.map(async board => ({
            ...board.toJSON(),
            post_count: await Post.count({ where: { board_id: board.id, status: 'published' } }),
            subscribed: subscribedIds.has(Number(board.id))
        })));
        return successResponse(res, data);
    } catch (error) {
        console.error('获取论坛版块失败:', error);
        return errorResponse(res, '获取论坛版块失败', 500);
    }
}

async function toggleBoardSubscription(req, res) {
    try {
        const board = await ForumBoard.findOne({ where: { id: Number(req.params.boardId), status: 'active' } });
        if (!board) return errorResponse(res, '论坛版块不存在', 404);
        const where = { board_id: board.id, user_id: DbAdapter.getId(req.user) };
        const existing = await ForumBoardSubscription.findOne({ where });
        if (existing) {
            await existing.destroy();
            return successResponse(res, { subscribed: false }, '已取消关注版块');
        }
        await ForumBoardSubscription.create(where);
        return successResponse(res, { subscribed: true }, '已关注版块');
    } catch (error) {
        console.error('关注论坛版块失败:', error);
        return errorResponse(res, '操作失败', 500);
    }
}

async function togglePostSubscription(req, res) {
    try {
        const post = await Post.findOne({ where: { id: Number(req.params.id), status: 'published' } });
        if (!post) return errorResponse(res, '帖子不存在', 404);
        const where = { post_id: post.id, user_id: DbAdapter.getId(req.user) };
        const existing = await PostSubscription.findOne({ where });
        if (existing) {
            await existing.destroy();
            return successResponse(res, { subscribed: false }, '已取消关注帖子');
        }
        await PostSubscription.create({ ...where, notify: true, last_read_at: new Date() });
        return successResponse(res, { subscribed: true }, '已关注帖子，有新回复时会通知你');
    } catch (error) {
        console.error('关注帖子失败:', error);
        return errorResponse(res, '操作失败', 500);
    }
}

async function getMyForumSubscriptions(req, res) {
    try {
        const userId = DbAdapter.getId(req.user);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const [topicResult, boardSubscriptions, myTopics, myReplies, myFavorites, draft] = await Promise.all([
            PostSubscription.findAndCountAll({
                where: { user_id: userId },
                include: [{
                    model: Post, as: 'post', required: true, where: { status: 'published' },
                    include: [
                        { model: User, as: 'author', required: false, attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar'] },
                        { model: ForumBoard, as: 'board', required: false, attributes: ['id', 'slug', 'name', 'icon', 'color'] }
                    ]
                }],
                order: [['updated_at', 'DESC']], limit: pageSize, offset, distinct: true
            }),
            ForumBoardSubscription.findAll({
                where: { user_id: userId },
                include: [{ model: ForumBoard, as: 'board', required: true, where: { status: 'active' }, attributes: ['id', 'slug', 'name', 'description', 'icon', 'color'] }],
                order: [['updated_at', 'DESC']]
            }),
            Post.findAll({ where: { user_id: userId, status: { [Op.ne]: 'deleted' } }, attributes: ['id', 'title', 'status', 'reply_count', 'comment_count', 'updated_at'], order: [['updated_at', 'DESC']], limit: 30 }),
            Comment.findAll({
                where: { user_id: userId, status: 'active', post_id: { [Op.ne]: null } },
                attributes: ['id', 'post_id', 'content', 'created_at'],
                include: [{ model: Post, as: 'post', required: true, where: { status: 'published' }, attributes: ['id', 'title'] }],
                order: [['created_at', 'DESC']], limit: 30
            }),
            Favorite.findAll({
                where: { user_id: userId, post_id: { [Op.ne]: null } }, attributes: ['id', 'created_at'],
                include: [{ model: Post, as: 'post', required: true, where: { status: 'published' }, attributes: ['id', 'title', 'reply_count', 'comment_count', 'updated_at'] }],
                order: [['created_at', 'DESC']], limit: 30
            }),
            PostDraft.findOne({ where: { user_id: userId }, attributes: ['id', 'title', 'updated_at'] })
        ]);
        const topics = topicResult.rows.map(row => {
            const topic = row.post;
            if (!topic) return null;
            const json = normalizePostOutput(topic);
            const lastReadAt = row.last_read_at ? new Date(row.last_read_at).getTime() : 0;
            const lastReplyAt = topic.last_reply_at ? new Date(topic.last_reply_at).getTime() : 0;
            json.has_unread = lastReplyAt > lastReadAt && Number(topic.last_reply_user_id) !== Number(userId);
            return json;
        }).filter(Boolean);
        return successResponse(res, {
            topics,
            topic_total: topicResult.count,
            boards: boardSubscriptions.map(row => row.board).filter(Boolean),
            my_topics: myTopics.map(normalizePostOutput),
            my_replies: myReplies.map(row => ({ id: row.id, post_id: row.post_id, content: row.content, created_at: row.created_at, post: row.post })),
            favorites: myFavorites.map(row => row.post).filter(Boolean).map(normalizePostOutput),
            draft,
            pagination: { page, pageSize, total: topicResult.count }
        });
    } catch (error) {
        console.error('获取论坛关注失败:', error);
        return errorResponse(res, '获取论坛关注失败', 500);
    }
}

async function acceptAnswer(req, res) {
    try {
        const post = await Post.findOne({ where: { id: Number(req.params.id), status: 'published' } });
        if (!post) return errorResponse(res, '帖子不存在', 404);
        if (post.post_type !== 'question') return errorResponse(res, '只有问答帖可以采纳回答', 400);
        if (Number(post.user_id) !== Number(DbAdapter.getId(req.user))) return errorResponse(res, '只有提问者可以采纳回答', 403);
        const comment = await Comment.findOne({ where: { id: Number(req.params.commentId), post_id: post.id, parent_id: null, status: 'active' } });
        if (!comment) return errorResponse(res, '回答不存在或不能被采纳', 404);
        post.accepted_comment_id = comment.id;
        await post.save();
        if (Number(comment.user_id) !== Number(DbAdapter.getId(req.user))) {
            await Notification.create({ user_id: comment.user_id, sender_id: DbAdapter.getId(req.user), type: 'system', title: '你的回答已被采纳', content: post.title, related_id: post.id, related_type: 'post' });
        }
        invalidateForumReputation();
        return successResponse(res, { accepted_comment_id: comment.id }, '回答已采纳');
    } catch (error) {
        console.error('采纳回答失败:', error);
        return errorResponse(res, '采纳回答失败', 500);
    }
}

async function getDraft(req, res) {
    try {
        const draft = await PostDraft.findOne({
            where: { user_id: DbAdapter.getId(req.user) },
            include: [{ model: ForumBoard, as: 'board', required: false, attributes: ['id', 'slug', 'name', 'icon'] }]
        });
        return successResponse(res, draft);
    } catch (error) {
        console.error('获取帖子草稿失败:', error);
        return errorResponse(res, '获取草稿失败', 500);
    }
}

async function saveDraft(req, res) {
    try {
        const { title = '', content = '', board_id = null, post_type = 'discussion', cover = '', tags = [] } = req.body || {};
        if (String(title).length > 200) return errorResponse(res, '草稿标题不能超过 200 字', 400);
        if (String(content).length > 100000) return errorResponse(res, '草稿内容过长', 400);
        const tagError = validateTags(tags);
        if (tagError) return errorResponse(res, tagError, 400);
        if (board_id !== null) {
            const board = await ForumBoard.findOne({ where: { id: Number(board_id), status: 'active' } });
            if (!board) return errorResponse(res, '论坛板块不存在', 400);
        }
        const values = {
            title: String(title), content: String(content), board_id: board_id ? Number(board_id) : null,
            post_type: POST_TYPES.has(post_type) ? post_type : 'discussion', cover: String(cover || ''), tags
        };
        const where = { user_id: DbAdapter.getId(req.user) };
        let draft = await PostDraft.findOne({ where });
        if (draft) await draft.update(values);
        else draft = await PostDraft.create({ ...where, ...values });
        return successResponse(res, draft, '草稿已保存');
    } catch (error) {
        console.error('保存帖子草稿失败:', error);
        return errorResponse(res, '保存草稿失败', 500);
    }
}

async function deleteDraft(req, res) {
    try {
        await PostDraft.destroy({ where: { user_id: DbAdapter.getId(req.user) } });
        return successResponse(res, null, '草稿已清除');
    } catch (error) {
        console.error('清除帖子草稿失败:', error);
        return errorResponse(res, '清除草稿失败', 500);
    }
}

/**
 * 校验 tags 参数：必须是数组、元素个数不超过 20、每个元素为长度 <= 30 的字符串。
 * 防止攻击者发送庞大嵌套数组触发 JSON.stringify OOM 崩溃。
 */
function validateTags(tags) {
    if (tags === undefined || tags === null) return null; // 不传则跳过
    if (!Array.isArray(tags)) return 'tags 必须为数组';
    if (tags.length > 20) return '标签数量不能超过 20 个';
    for (const tag of tags) {
        if (typeof tag !== 'string') return '每个标签必须是字符串';
        if (tag.length > 30) return '单个标签不能超过 30 字';
    }
    return null;
}

/**
 * 规范化帖子输出：tags 字段统一转换为数组
 * （Sequelize 自定义 setter 仅在通过实例写时生效；
 *  通过 findAll/raw 拿到的 records 仍可能为字符串）
 */
function normalizePostOutput(post) {
    if (!post) return post;
    const json = post.toJSON ? post.toJSON() : post;
    if (typeof json.tags === 'string') {
        try {
            const parsed = JSON.parse(json.tags);
            json.tags = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            json.tags = [];
        }
    }
    if (!Array.isArray(json.tags)) {
        json.tags = [];
    }
    return json;
}

/**
 * 发布帖子
 */
async function createPost(req, res) {
    try {
        const { title, content, category, board_id, studio_id, post_type, tags, cover } = req.body;
        
        // 修复: null/undefined 先拦截,避免 String(null)=="null" 绕过校验
        if (title == null || content == null || !String(title).trim() || !String(content).trim()) {
            return errorResponse(res, '请填写标题和内容', 400);
        }

        if (String(title).length > 200) {
            return errorResponse(res, '标题不能超过200字', 400);
        }

        if (String(content).length > 50000) {
            return errorResponse(res, '内容不能超过50000字', 400);
        }

        // OOM 防御: 校验 tags 数组长度/深度,防止恶意嵌套数组打爆 JSON.stringify
        const tagsError = validateTags(tags);
        if (tagsError) {
            return errorResponse(res, tagsError, 400);
        }

        // H12: 落库前审核标题+内容（敏感词/违规检查）
        // fallbackReview 返回 recommendation: pass / review / delete
        const reviewResult = await aiReview.fallbackReview(`${title}\n${content}`);
        if (reviewResult.recommendation === 'delete') {
            return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
        }
        // 敏感词策略：
        // - review 且命中具体敏感词 → 不静默拦截，直接发布并提示可能遭人工二次审核与限流，写入后台待审队列
        // - review 但无命中词（检测服务故障/兜底）→ 禁止 fail-open，隐藏转人工审核并写入待审记录
        // - pass 命中低级别词 → 仅提示命中词，不拦截、不进待审队列
        const reviewViolations = reviewResult.violations || [];
        const reviewNeedsHuman = reviewResult.recommendation === 'review';
        let postStatus = 'published';
        let postHiddenReason = null;
        let reviewLogAfter = null; // review 状态下需要写入待审记录时的 after_state
        if (reviewNeedsHuman) {
            if (reviewViolations.length > 0) {
                reviewLogAfter = { violations: reviewViolations, riskLevel: reviewResult.riskLevel || 'medium', source: reviewResult.source || 'builtin', reviewed: false };
            } else {
                // 检测服务不可用：不允许默认放行，转人工审核（隐藏帖子并进入待审队列）
                postStatus = 'hidden';
                postHiddenReason = 'ai_review';
                reviewLogAfter = { violations: [], riskLevel: reviewResult.riskLevel || 'unknown', source: 'fallback', serviceError: true, reviewed: false };
            }
        }
        const boardResult = await resolveBoard(board_id, category, req.user.role);
        if (boardResult.error) return errorResponse(res, boardResult.error, 400);
        const normalizedType = POST_TYPES.has(post_type) ? post_type : (boardResult.board.slug === 'question' ? 'question' : boardResult.board.slug === 'tutorial' ? 'tutorial' : 'discussion');

        const recruitmentResult = await resolveRecruitmentStudio(boardResult.board, req.user);
        if (recruitmentResult.error) return errorResponse(res, recruitmentResult.error, 403);
        const studioForumResult = await resolveStudioForumTarget(boardResult.board, studio_id, req.user);
        if (studioForumResult.error) return errorResponse(res, studioForumResult.error, 403);

        const post = await sequelize.transaction(async transaction => {
            const created = await DbAdapter.create(Post, {
                title,
                content,
                user_id: DbAdapter.getId(req.user),
                category: boardResult.board.slug,
                board_id: boardResult.board.id,
                studio_id: studioForumResult.studioId || recruitmentResult.studioId,
                post_type: normalizedType,
                tags,
                cover,
                status: postStatus,
                hidden_reason: postHiddenReason,
                last_reply_at: new Date(),
                last_reply_user_id: DbAdapter.getId(req.user),
                participant_count: 1
            }, { transaction });
            await recordPostRevision(created, DbAdapter.getId(req.user), 'user', 'initial', { transaction });
            // 待审记录必须与帖子同一事务：任何一步失败整体回滚，避免“孤儿帖子”
            // （例如帖子已公开但待审日志未写入 → 后台无感知；或帖子已隐藏但待审日志未写入 → 永久卡隐藏）
            if (reviewLogAfter) {
                await recordModerationLog(created.id, DbAdapter.getId(req.user), 'sensitive_detected',
                    reviewViolations.length > 0 ? `命中敏感词: ${reviewViolations.join(', ')} (风险等级: ${reviewResult.riskLevel})` : '敏感词检测服务暂不可用，转人工审核',
                    null,
                    reviewLogAfter,
                    { transaction });
            }
            await PostDraft.destroy({ where: { user_id: DbAdapter.getId(req.user) }, transaction });
            return created;
        });
        
        const result = await DbAdapter.findByPk(Post, post.id, {
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, { model: ForumBoard, as: 'board' }, { model: Studio, as: 'studio', attributes: ['id', 'name', 'cover', 'member_count', 'member_limit', 'recruitment_status'] }]
        });

        invalidateForumReputation();

        // 敏感词命中时向用户返回具体命中词+提示（不拦截，直接发布）
        // 同时记录审计日志，供后台待审专区展示
        let publishMessage = '发布成功';
        if (postStatus === 'hidden') {
            // 检测服务故障被转人工审核：明确告知用户内容未公开，而不是误导为“发布成功”
            publishMessage = '内容已提交人工审核，暂未公开，请耐心等待审核结果。';
        } else if (reviewViolations.length > 0) {
            if (reviewNeedsHuman) {
                // 中等风险：提示可能遭人工二次审核与限流
                publishMessage = `发布成功，检测到敏感词: ${reviewViolations.join(', ')}。该内容可能会遭到人工二次审核与限流，请规范发言。`;
            } else {
                // 低风险：仅提示命中词，不进待审队列
                publishMessage = `发布成功，检测到敏感词: ${reviewViolations.join(', ')}。请规范发言。`;
            }
        }
        // 待审日志已在上方同一事务内写入，此处不再重复记录
        return successResponse(res, result, publishMessage);
    } catch (error) {
        console.error('发布帖子错误:', error);
        return errorResponse(res, '发布失败', 500);
    }
}

/**
 * 获取帖子列表
 */
async function getPosts(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const category = req.query.category || '';
        const boardId = Number(req.query.board_id || 0);
        const studioId = Number(req.query.studio_id || 0);
        const keyword = req.query.keyword || '';
        const tag = String(req.query.tag || '').trim();
        const sortBy = req.query.sortBy || 'latest';
        // 规范化 isTop 参数：统一转小写字符串，兼容 'true'/'1'/'yes' 等多种写法，避免布尔/数字类型差异导致判断失效
        const isTopVal = String(req.query.isTop || '').toLowerCase();
        
        // 统一使用 'published' 状态
        const where = { status: 'published' };
        if (boardId > 0) where.board_id = boardId;
        if (studioId > 0) where.studio_id = studioId;
        
        if (category === 'essence') {
            where.is_essence = true;
        } else if (category === 'official') {
            where.category = 'news'; // 或者直接使用 category=news
        } else if (category) {
            where.category = category;
        }

        if (isTopVal === 'true' || isTopVal === '1' || isTopVal === 'yes') {
            where.is_top = true;
        }
        
        if (keyword) {
            const keywordWhere = likeContains(sequelize, ['title', 'content', 'tags'], keyword);
            if (keywordWhere) Object.assign(where, keywordWhere);
        }
        if (tag) {
            const tagWhere = likeContains(sequelize, ['tags'], tag);
            if (tagWhere) where[Op.and] = [...(where[Op.and] || []), tagWhere];
        }
        
        let order = [['is_top', 'DESC'], ['created_at', 'DESC']];
        if (sortBy === 'hot') {
            order = [['is_top', 'DESC'], [sequelize.literal('(like_count * 4 + comment_count * 6 + view_count * 0.08)'), 'DESC'], ['last_reply_at', 'DESC']];
        } else if (sortBy === 'active') {
            order = [['is_top', 'DESC'], ['last_reply_at', 'DESC'], ['created_at', 'DESC']];
        } else if (sortBy === 'unanswered') {
            where.post_type = 'question';
            where.accepted_comment_id = null;
            order = [['created_at', 'DESC']];
        } else if (sortBy === 'essence') {
            where.is_essence = true;
            order = [['is_top', 'DESC'], ['created_at', 'DESC']];
        }
        
        const { count, rows } = await DbAdapter.findAndCountAll(Post, {
            where,
            include: [{
                model: User,
                as: 'author',
                // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                // 使用 required: false 使帖子仍可见但 author 为 null,避免历史内容凭空消失
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, {
                model: User,
                as: 'last_reply_user',
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, {
                model: ForumBoard,
                as: 'board',
                required: false,
                attributes: ['id', 'slug', 'name', 'icon', 'color']
            }, {
                model: Studio,
                as: 'studio',
                required: false,
                attributes: ['id', 'name', 'cover', 'member_count', 'member_limit', 'recruitment_status']
            }],
            order,
            limit: pageSize,
            offset
        });

        return paginateResponse(res, rows.map(normalizePostOutput), count, page, pageSize);
    } catch (error) {
        console.error('获取帖子列表错误:', error);
        return errorResponse(res, '获取帖子列表失败', 500);
    }
}

/**
 * 获取帖子详情
 */
async function getPostDetail(req, res) {
    try {
        const { id } = req.params;
        
        const post = await DbAdapter.findByPk(Post, id, {
            include: [{
                model: User,
                as: 'author',
                // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'bio']
            }, {
                model: User,
                as: 'last_reply_user',
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, {
                model: ForumBoard,
                as: 'board',
                required: false,
                attributes: ['id', 'slug', 'name', 'description', 'icon', 'color']
            }, {
                model: Studio,
                as: 'studio',
                required: false,
                attributes: ['id', 'name', 'cover', 'member_count', 'member_limit', 'recruitment_status']
            }]
        });
        
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        if (post.status === 'deleted' && post.merged_into_post_id) {
            return successResponse(res, {
                merged: true,
                merged_into_post_id: Number(post.merged_into_post_id)
            }, '该主题已合并，正在跳转到目标主题');
        }
        
        if (post.status !== 'published') {
            return errorResponse(res, '帖子不存在', 404);
        }

        // 基于会话的浏览数去重，同一会话短时间内不重复计数
        const viewKey = `post_view_${id}`;
        const sessionViews = (req.session && req.session.postViews) || {};
        const now = Date.now();
        const lastView = sessionViews[viewKey];
        const VIEW_COOLDOWN = 5 * 60 * 1000; // 5分钟内不重复计数

        let viewIncremented = false;
        if (!lastView || (now - lastView) > VIEW_COOLDOWN) {
            // 原子 +1 避免 read-modify-write 竞态
            await DbAdapter.increment(post, 'view_count');
            try {
                await recordPostViewMetric(id, new Date(now));
            } catch (metricError) {
                // 趋势统计失败不能影响用户正常查看帖子。
                console.warn('记录帖子浏览趋势失败:', metricError.message);
            }
            // M17: reload 使实例 view_count 与数据库一致，避免下方手动 +1 不准
            await post.reload();
            if (req.session) {
                if (!req.session.postViews) req.session.postViews = {};
                req.session.postViews[viewKey] = now;
            }
            viewIncremented = true;
        }

        const { Like, Favorite } = require('../models');

        let liked = false;
        let favorited = false;
        let subscribed = false;
        if (req.user) {
            const [existingLike, existingFav, existingSubscription] = await Promise.all([
                DbAdapter.findOne(Like, { where: { user_id: DbAdapter.getId(req.user), post_id: DbAdapter.getId(post) } }),
                DbAdapter.findOne(Favorite, { where: { user_id: DbAdapter.getId(req.user), post_id: DbAdapter.getId(post) } }),
                PostSubscription.findOne({ where: { user_id: DbAdapter.getId(req.user), post_id: DbAdapter.getId(post) } })
            ]);
            liked = !!existingLike;
            favorited = !!existingFav;
            subscribed = !!existingSubscription;
            if (existingSubscription) {
                // 打开主题即推进未读游标；不记录逐条回执，保持实现轻量。
                await existingSubscription.update({ last_read_at: new Date() });
            }
        }

        // 评论分页：使用 parsePagination 控制评论加载量,避免大帖卡死/超慢
        const { page: commentPage, pageSize: commentPageSize, offset: commentOffset } = DbAdapter.parsePagination(req.query);
        const commentSort = ['oldest', 'newest', 'hot'].includes(req.query.comment_sort) ? req.query.comment_sort : 'oldest';
        const commentOrder = commentSort === 'hot'
            ? [['like_count', 'DESC'], ['created_at', 'ASC']]
            : [['created_at', commentSort === 'newest' ? 'DESC' : 'ASC']];

        // 独立 count 查询避免 include(JOIN) 导致 count 不准;
        // findAndCountAll + distinct 在 include 带 separate 时可能忽略 distinct 导致计数虚高
        const [totalComments, comments] = await Promise.all([
            DbAdapter.count(Comment, { where: { post_id: id, status: 'active', parent_id: null } }),
            DbAdapter.findAll(Comment, {
                where: { post_id: id, status: 'active', parent_id: null },
                include: [{
                    model: User,
                    as: 'user',
                    // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                    where: { status: 'active' },
                    required: false,
                    attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
                }, {
                    model: Comment,
                    as: 'replies',
                    where: { status: 'active' },
                    required: false,
                    separate: true,
                    limit: 20,
                    order: [['created_at', 'ASC']],
                    include: [{
                        model: User,
                        as: 'user',
                        where: { status: 'active' },
                        required: false,
                        attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
                    }, {
                        model: User,
                        as: 'reply_to_user',
                        where: { status: 'active' },
                        required: false,
                        attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
                    }]
                }],
                order: commentOrder,
                limit: commentPageSize,
                offset: commentOffset
            })
        ]);

        // 先将评论及回复转换为普通 JSON 对象，否则给 Sequelize 实例挂 liked
        // 不会进入响应（实例的 toJSON 只输出 dataValues）
        const visibleParentIds = comments.map(comment => DbAdapter.getId(comment));
        const replyCountRows = visibleParentIds.length ? await Comment.findAll({
            attributes: ['parent_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            where: { parent_id: { [Op.in]: visibleParentIds }, status: 'active' },
            group: ['parent_id'], raw: true
        }) : [];
        const replyCountMap = new Map(replyCountRows.map(row => [Number(row.parent_id), Number(row.count || 0)]));

        const commentsJson = comments.map((c, index) => {
            const json = c.toJSON ? c.toJSON() : c;
            json.reply_total = replyCountMap.get(Number(json.id)) || 0;
            if (commentSort === 'oldest') json.floor_number = commentOffset + index + 1;
            else if (commentSort === 'newest') json.floor_number = totalComments - commentOffset - index;
            if (Array.isArray(json.replies)) {
                json.replies = json.replies.map(r => (r && r.toJSON ? r.toJSON() : r));
            }
            return json;
        });

        // M17: 去掉无条件 +1，直接使用 reload 后的实际 view_count（冷却期内不重复计数）
        const postJson = normalizePostOutput({ ...post.toJSON(), comments: commentsJson, liked, favorited, subscribed });

        const commentIds = commentsJson.flatMap(c => [
            c.id,
            ...(c.replies || []).map(r => r.id)
        ]);
        if (req.user && commentIds.length > 0) {
            const likedRows = await DbAdapter.findAll(Like, {
                where: { user_id: DbAdapter.getId(req.user), comment_id: { [Op.in]: commentIds } }
            });
            const likedSet = new Set(likedRows.map(l => String(l.comment_id)));
            if (postJson.comments) {
                postJson.comments.forEach(c => {
                    c.liked = likedSet.has(String(c.id));
                    if (c.replies) c.replies.forEach(r => { r.liked = likedSet.has(String(r.id)); });
                });
            }
        }

        // 评论分页信息
        postJson.commentPagination = {
            page: commentPage,
            pageSize: commentPageSize,
            total: totalComments,
            sort: commentSort
        };

        return successResponse(res, postJson);
    } catch (error) {
        console.error('获取帖子详情错误:', error);
        return errorResponse(res, '获取帖子详情失败', 500);
    }
}

/**
 * 更新帖子
 */
async function updatePost(req, res) {
    try {
        const { id } = req.params;
        const { title, content, category, board_id, post_type, tags, cover, change_reason } = req.body;
        
        const post = await DbAdapter.findByPk(Post, id);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }

        if (post.status === 'deleted') {
            return errorResponse(res, '已删除帖子不能编辑', 409);
        }
        
        if (post.user_id !== DbAdapter.getId(req.user)) {
            return errorResponse(res, '无权修改此帖子', 403);
        }

        const changeReason = String(change_reason || '').trim();
        if (changeReason.length < 3 || changeReason.length > 500) {
            return errorResponse(res, '修改说明需要 3-500 个字', 400);
        }

        // 修复: 明确拒绝 title/content 为 null,避免 String(null) 写入 "null" 脏数据
        // 空字符串视为有效输入(允许清空),但空标题/空正文 trim 后为空需返回 400
        if (title === null) {
            return errorResponse(res, '标题不能为空', 400);
        }
        if (content === null) {
            return errorResponse(res, '内容不能为空', 400);
        }
        if (title != null) {
            const trimmedTitle = String(title).trim();
            if (trimmedTitle.length === 0) {
                return errorResponse(res, '标题不能为空', 400);
            }
            if (trimmedTitle.length > 200) {
                return errorResponse(res, '标题不能超过200字', 400);
            }
        }
        if (content != null) {
            const trimmedContent = String(content).trim();
            if (trimmedContent.length === 0) {
                return errorResponse(res, '内容不能为空', 400);
            }
            if (trimmedContent.length > 50000) {
                return errorResponse(res, '内容不能超过50000字', 400);
            }
        }

        // OOM 防御: 校验 tags 数组长度/深度
        const tagsError = validateTags(tags);
        if (tagsError) {
            return errorResponse(res, tagsError, 400);
        }

        // 计算最终落库的标题和正文(传入用新值,未传入用旧值),统一 trim 后入库避免纯空格
        let finalTitle = title !== undefined ? (title === null ? null : String(title).trim()) : post.title;
        let finalContent = content !== undefined ? (content === null ? null : String(content).trim()) : post.content;

        // 统一构建 updateData:全部字段用 !== undefined 判断,避免 falsy 判断忽略空字符串
        const updateData = {
            title: finalTitle,
            content: finalContent,
            category: category !== undefined ? category : post.category,
            tags: tags !== undefined ? tags : post.tags,
            cover: cover !== undefined ? cover : post.cover
        };
        if (board_id !== undefined || category !== undefined) {
            const boardResult = await resolveBoard(board_id, category || post.category, req.user.role);
            if (boardResult.error) return errorResponse(res, boardResult.error, 400);
            updateData.board_id = boardResult.board.id;
            updateData.category = boardResult.board.slug;
            const recruitmentResult = await resolveRecruitmentStudio(boardResult.board, req.user);
            if (recruitmentResult.error) return errorResponse(res, recruitmentResult.error, 403);
            updateData.studio_id = recruitmentResult.studioId;
        }
        if (post_type !== undefined) {
            if (!POST_TYPES.has(post_type)) return errorResponse(res, '帖子类型无效', 400);
            updateData.post_type = post_type;
        }

        // 编辑时的敏感词策略与发帖保持一致：
        // - review 且命中具体敏感词 → 不隐藏（并恢复 AI 隐藏态），写待审记录
        // - review 但无命中词（检测服务故障/兜底）→ 禁止 fail-open，隐藏转人工审核，写待审记录
        // - pass 命中低级别词 → 正常保存，不进待审队列
        let reviewLogAfter = null;
        let reviewLogReason = '';
        if (title !== undefined || content !== undefined) {
            const reviewResult = await aiReview.fallbackReview(`${(finalTitle || '')}\n${(finalContent || '')}`);
            if (reviewResult.recommendation === 'delete') {
                return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
            }
            const reviewViolations = reviewResult.violations || [];
            if (reviewResult.recommendation === 'review') {
                if (reviewViolations.length > 0) {
                    // 中等命中：不隐藏帖子；若帖子此前因 AI 审核被隐藏则恢复发布
                    if (post.status === 'hidden' && post.hidden_reason === 'ai_review') {
                        updateData.status = 'published';
                        updateData.hidden_reason = null;
                    }
                    reviewLogAfter = { violations: reviewViolations, riskLevel: reviewResult.riskLevel || 'medium', source: reviewResult.source || 'builtin', reviewed: false };
                    reviewLogReason = `命中敏感词: ${reviewViolations.join(', ')} (风险等级: ${reviewResult.riskLevel})`;
                } else {
                    // 检测服务不可用：禁止默认放行，隐藏转人工审核
                    updateData.status = 'hidden';
                    updateData.hidden_reason = 'ai_review';
                    reviewLogAfter = { violations: [], riskLevel: reviewResult.riskLevel || 'unknown', source: 'fallback', serviceError: true, reviewed: false };
                    reviewLogReason = '敏感词检测服务暂不可用，转人工审核';
                }
            } else {
                // 审核通过(pass): 仅恢复因 AI 审核被 hidden 的帖子,不复活管理员手动隐藏的帖子
                if (post.status === 'hidden' && post.hidden_reason === 'ai_review') {
                    updateData.status = 'published';
                    updateData.hidden_reason = null;
                }
            }
        }

        await sequelize.transaction(async transaction => {
            await DbAdapter.update(Post, updateData, { where: { id }, transaction });
            await post.reload({ transaction });
            await recordPostRevision(post, DbAdapter.getId(req.user), 'user', changeReason, { transaction });
            // 编辑命中敏感词时写待审记录，保证与发帖行为一致。
            // 不吞异常：帖子状态修改与待审日志必须同事务同生共死，避免“孤儿帖子”
            if (reviewLogAfter) {
                await recordModerationLog(id, DbAdapter.getId(req.user), 'sensitive_detected',
                    reviewLogReason,
                    null,
                    reviewLogAfter,
                    { transaction });
            }
        });

        const updatedPost = await DbAdapter.findByPk(Post, id, {
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, { model: ForumBoard, as: 'board' }]
        });
        
        let updateMessage = '帖子已更新';
        if (reviewLogAfter?.serviceError) {
            // 检测服务故障被转人工审核：明确告知用户内容未公开
            updateMessage = '内容已提交人工审核，暂未公开，请耐心等待审核结果。';
        }
        return successResponse(res, updatedPost, updateMessage);
    } catch (error) {
        console.error('更新帖子错误:', error);
        return errorResponse(res, '更新帖子失败', 500);
    }
}

/**
 * 删除帖子
 */
async function deletePost(req, res) {
    try {
        const { id } = req.params;
        
        const post = await DbAdapter.findByPk(Post, id);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        
        if (post.user_id !== DbAdapter.getId(req.user)) {
            return errorResponse(res, '无权删除此帖子', 403);
        }
        // 修复: moderator 删除他人帖子时需校验目标作者角色,不能删除同级或上级管理员的内容
        if (post.user_id !== DbAdapter.getId(req.user) && post.user_id) {
            const { User } = require('../models');
            const targetAuthor = await DbAdapter.findByPk(User, post.user_id, { attributes: ['id', 'role'] });
            if (targetAuthor && !canManageUser(req.user.role, targetAuthor.role)) {
                return errorResponse(res, '无权删除此用户的帖子', 403);
            }
        }

        // L5: 删除帖子涉及多表关联数据，必须用事务包裹；Like/Favorite 无 status 字段保留物理删，Comment/Post 软删保留历史
        // 复用 softDeletePost 统一删除逻辑（通知/举报/点赞/收藏清理、评论软删、计数清零、审计日志，事务内完成）
        await softDeletePost(post, DbAdapter.getId(req.user), '用户删除帖子', { action: 'delete_post' });

        invalidateForumReputation();
        return successResponse(res, null, '帖子已删除');
    } catch (error) {
        console.error('删除帖子错误:', error);
        return errorResponse(res, '删除帖子失败', 500);
    }
}

/**
 * 点赞帖子
 */
async function likePost(req, res) {
    try {
        const { id } = req.params;
        const { Like } = require('../models');
        const userId = DbAdapter.getId(req.user);
        
        const post = await DbAdapter.findByPk(Post, id);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        
        if (!canInteractWithPost(post)) {
            return errorResponse(res, 'Post not found', 404);
        }

        const existingLike = await DbAdapter.findOne(Like, {
            where: { user_id: userId, post_id: DbAdapter.getId(post) }
        });
        
        if (existingLike) {
            // 修复: destroy Like + decrement like_count 用事务包裹,保证一致性
            // 不再用旧实例 like_count > 0 判断,改用原子 decrement 带 where 条件避免负数
            await sequelize.transaction(async (t) => {
                const removed = await DbAdapter.destroy(Like, {
                    where: { id: DbAdapter.getId(existingLike) },
                    transaction: t
                });
                if (removed) {
                    // 原子 decrement: 仅当 like_count > 0 时才执行减 1,避免并发导致负数
                    await DbAdapter.decrement(post, 'like_count', {
                        where: { like_count: { [Op.gt]: 0 } },
                        transaction: t
                    });
                }
            });
            await post.reload();
            const newCount = Math.max(0, post.like_count || 0);
            invalidateForumReputation();
            return successResponse(res, { like_count: newCount, liked: false }, '已取消点赞');
        }

        // 修复: create Like + increment like_count 用事务包裹,中途失败回滚避免不一致
        try {
            await sequelize.transaction(async (t) => {
                await DbAdapter.create(Like, {
                    user_id: userId,
                    post_id: DbAdapter.getId(post)
                }, { transaction: t });
                await DbAdapter.increment(post, 'like_count', { transaction: t });
            });
        } catch (createError) {
            if (createError.name === 'SequelizeUniqueConstraintError') {
                return errorResponse(res, '已经点赞过了', 400);
            }
            throw createError;
        }

        await post.reload();

        // 通知帖子作者（与 work like 行为保持一致）
        if (post.user_id != null && String(post.user_id) !== String(userId)) {
            try {
                const { Notification } = require('../models');
                // L2: 避免重复点赞发送多条通知，已有同类通知则跳过
                const existingNotify = await DbAdapter.findOne(Notification, {
                    where: {
                        user_id: post.user_id,
                        type: 'like',
                        related_id: DbAdapter.getId(post),
                        related_type: 'post',
                        sender_id: userId
                    }
                });
                if (!existingNotify) {
                    await DbAdapter.create(Notification, {
                        user_id: post.user_id,
                        type: 'like',
                        title: '点赞了你的帖子',
                        content: post.title,
                        related_id: DbAdapter.getId(post),
                        related_type: 'post',
                        sender_id: userId
                    });
                }
            } catch (notifyErr) {
                // 通知失败不应回滚点赞主流程
                console.error('Create post like notification error:', notifyErr);
            }
        }

        invalidateForumReputation();
        return successResponse(res, { like_count: post.like_count || 0, liked: true }, '点赞成功');
    } catch (error) {
        console.error('点赞错误:', error);
        return errorResponse(res, '点赞失败', 500);
    }
}

/**
 * 收藏帖子
 */
async function favoritePost(req, res) {
    try {
        const { id } = req.params;
        const { Favorite } = require('../models');
        const userId = DbAdapter.getId(req.user);
        
        const post = await DbAdapter.findByPk(Post, id);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        
        if (!canInteractWithPost(post)) {
            return errorResponse(res, 'Post not found', 404);
        }

        const existing = await DbAdapter.findOne(Favorite, {
            where: { user_id: userId, post_id: DbAdapter.getId(post) }
        });
        
        if (existing) {
            return errorResponse(res, '已收藏该帖子', 400);
        }

        // 修复(报告1 #4): create Favorite + increment collection_count 用事务包裹,中途失败回滚避免不一致
        try {
            await sequelize.transaction(async (t) => {
                await DbAdapter.create(Favorite, {
                    user_id: userId,
                    post_id: DbAdapter.getId(post)
                }, { transaction: t });
                await DbAdapter.increment(post, 'collection_count', { transaction: t });
            });
        } catch (createError) {
            if (createError.name === 'SequelizeUniqueConstraintError') {
                return errorResponse(res, '已收藏该帖子', 400);
            }
            throw createError;
        }

        await post.reload();

        return successResponse(res, { collection_count: post.collection_count || 0, favorited: true }, '收藏成功');
    } catch (error) {
        console.error('收藏错误:', error);
        return errorResponse(res, '收藏失败', 500);
    }
}

/**
 * 取消收藏帖子
 */
async function unfavoritePost(req, res) {
    try {
        const { id } = req.params;
        const { Favorite } = require('../models');
        const userId = DbAdapter.getId(req.user);
        
        const post = await DbAdapter.findByPk(Post, id);
        if (!post) {
            return errorResponse(res, '帖子不存在', 404);
        }
        
        if (!canInteractWithPost(post)) {
            return errorResponse(res, 'Post not found', 404);
        }

        const existing = await DbAdapter.findOne(Favorite, {
            where: { user_id: userId, post_id: DbAdapter.getId(post) }
        });
        
        if (!existing) {
            return errorResponse(res, '未收藏该帖子', 400);
        }

        // 修复(报告1 #4/#5): destroy Favorite + decrement collection_count 用事务包裹,保证一致性
        // 不再用旧实例 collection_count > 0 判断,改用原子 decrement 带 where 条件避免负数
        await sequelize.transaction(async (t) => {
            const removed = await DbAdapter.destroy(Favorite, {
                where: { id: DbAdapter.getId(existing) },
                transaction: t
            });
            if (removed) {
                // 原子 decrement: 仅当 collection_count > 0 时才执行减 1,避免并发导致负数
                await DbAdapter.decrement(post, 'collection_count', {
                    where: { collection_count: { [Op.gt]: 0 } },
                    transaction: t
                });
            }
        });
        await post.reload();
        const newCount = Math.max(0, post.collection_count || 0);

        return successResponse(res, { collection_count: newCount, favorited: false }, '已取消收藏');
    } catch (error) {
        console.error('取消收藏错误:', error);
        return errorResponse(res, '取消收藏失败', 500);
    }
}

/**
 * 获取我的帖子
 */
async function getMyPosts(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);

        // 过滤 deleted/hidden,"我的帖子"不显示已删除/审核隐藏的帖子
        const { count, rows } = await DbAdapter.findAndCountAll(Post, {
            where: { user_id: DbAdapter.getId(req.user), status: { [Op.ne]: 'deleted' } },
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        
        return paginateResponse(res, rows.map(normalizePostOutput), count, page, pageSize);
    } catch (error) {
        console.error('获取我的帖子错误:', error);
        return errorResponse(res, '获取我的帖子失败', 500);
    }
}

module.exports = {
    getLeaderboard,
    getUserReputation,
    getUserForumPosts,
    getCodemaoUserForumPosts,
    getBoards,
    toggleBoardSubscription,
    togglePostSubscription,
    getMyForumSubscriptions,
    acceptAnswer,
    getDraft,
    saveDraft,
    deleteDraft,
    createPost,
    getPosts,
    getPostDetail,
    updatePost,
    deletePost,
    likePost,
    favoritePost,
    unfavoritePost,
    getMyPosts
};
