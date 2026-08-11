const DbAdapter = require('../utils/dbAdapter');
const { Comment, User, Work, Post, Studio, StudioMember, Notification, PostSubscription, sequelize } = require('../models');
const { successResponse, errorResponse, paginateResponse } = require('../middleware/response');
const { isRoleAtLeast, canManageUser } = require('../config/permissions');
// H12: 引入内容审核服务，落库前做敏感词检查
const aiReview = require('../services/aiReview');
const { invalidateForumReputation } = require('../services/forumReputation');
const { Op } = require('sequelize');
const SOCIAL_CARD_PREFIX = '[[codedog-social-card]]';

function extractMentionUsernames(content) {
    const usernames = [];
    const seen = new Set();
    const pattern = /(^|[\s，。！？、(（])@([A-Za-z0-9_.-]{2,50})/g;
    for (const match of String(content || '').matchAll(pattern)) {
        const username = match[2];
        const key = username.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            usernames.push(username);
        }
        if (usernames.length >= 5) break;
    }
    return usernames;
}

async function buildSocialCard(input, userId) {
    if (!input) return null;
    if (input.type === 'user') return { type: 'user', target_id: Number(userId) };
    if (input.type === 'group') {
        const groupId = Number(input.target_id);
        if (!Number.isInteger(groupId) || groupId <= 0) return false;
        return { type: 'group', target_id: groupId };
    }
    if (input.type === 'studio') {
        const studioId = Number(input.target_id);
        if (!Number.isInteger(studioId) || studioId <= 0) return false;
        const studio = await DbAdapter.findByPk(Studio, studioId, { attributes: ['id', 'name', 'status'] });
        if (!studio || studio.status !== 'active') return false;
        return { type: 'studio', target_id: studioId, target_name: studio.name };
    }
    return false;
}

async function getCommentReplies(req, res) {
    try {
        const parent = await Comment.findOne({ where: { id: Number(req.params.id), parent_id: null, status: 'active' } });
        if (!parent) return errorResponse(res, '评论不存在', 404);
        if (parent.post_id) {
            const post = await Post.findOne({ where: { id: parent.post_id, status: 'published' } });
            if (!post) return errorResponse(res, '评论不存在', 404);
        } else if (parent.work_id) {
            const work = await Work.findOne({ where: { id: parent.work_id, status: 'published' } });
            if (!work) return errorResponse(res, '评论不存在', 404);
        } else return errorResponse(res, '评论不存在', 404);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await Comment.findAndCountAll({
            where: { parent_id: parent.id, status: 'active' },
            include: [{ model: User, as: 'user', required: false, where: { status: 'active' }, attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar'] },
                { model: User, as: 'reply_to_user', required: false, where: { status: 'active' }, attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar'] }],
            order: [['created_at', 'ASC']], limit: pageSize, offset, distinct: true
        });
        const result = rows.map(row => row.toJSON());
        if (req.user && result.length) {
            const { Like } = require('../models');
            const { Op } = require('sequelize');
            const liked = await Like.findAll({ where: { user_id: DbAdapter.getId(req.user), comment_id: { [Op.in]: result.map(row => row.id) } }, attributes: ['comment_id'] });
            const likedIds = new Set(liked.map(row => Number(row.comment_id)));
            result.forEach(row => { row.liked = likedIds.has(Number(row.id)); });
        }
        return paginateResponse(res, result, count, page, pageSize);
    } catch (error) {
        console.error('获取评论回复失败:', error);
        return errorResponse(res, '获取回复失败', 500);
    }
}

function sameId(a, b) {
    return String(a) === String(b);
}

/**
 * 通过本地主键查找已发布作品
 * 注意：comment.work_id 是本地主键，与"通过编程猫 ID 查找"的工具分开
 */
async function resolvePublishedWorkByLocalId(workId) {
    if (!workId) return null;
    const work = await DbAdapter.findByPk(Work, workId);
    return work && work.status === 'published' ? work : null;
}

async function resolvePublishedWork(workId) {
    if (workId == null || workId === '') return null;
    // 前端统一使用编程猫作品 ID，因此优先按 codemao_work_id 精确匹配；
    // 仅当查不到且入参为纯数字时，才回退按本地主键查找（兼容历史调用）。
    let work = await DbAdapter.findOne(Work, { where: { codemao_work_id: String(workId) } });
    if (!work && /^\d+$/.test(String(workId))) {
        work = await DbAdapter.findByPk(Work, workId);
    }
    return work && work.status === 'published' ? work : null;
}

async function resolvePublishedPost(postId) {
    const post = await DbAdapter.findByPk(Post, postId);
    return post && post.status === 'published' ? post : null;
}

async function createComment(req, res) {
    try {
        const { content, work_id, post_id, parent_id, reply_to_user_id, social_card } = req.body;
        const card = await buildSocialCard(social_card, DbAdapter.getId(req.user));
        if (card === false) return errorResponse(res, '社交卡片无效', 400);

        if ((!content || !String(content).trim()) && !card) {
            return errorResponse(res, '请输入评论内容', 400);
        }

        if (String(content).length > 2000) {
            return errorResponse(res, '评论内容不能超过2000字', 400);
        }

        const hasWorkTarget = work_id !== undefined && work_id !== null && work_id !== '';
        const hasPostTarget = post_id !== undefined && post_id !== null && post_id !== '';
        if (hasWorkTarget === hasPostTarget) {
            return errorResponse(res, '请选择一个评论目标', 400);
        }

        const work = hasWorkTarget ? await resolvePublishedWork(work_id) : null;
        const post = hasPostTarget ? await resolvePublishedPost(post_id) : null;
        if ((hasWorkTarget && !work) || (hasPostTarget && !post)) {
            return errorResponse(res, 'Comment target not found', 404);
        }
        if (post?.studio_id && post.category === 'studios') {
            const membership = await StudioMember.findOne({
                where: { studio_id: post.studio_id, user_id: DbAdapter.getId(req.user), status: 'active' },
                attributes: ['id']
            });
            if (!membership) return errorResponse(res, '只有该工作室的正式成员可以回复此主题', 403);
        }
        if (post?.is_locked && !['moderator', 'admin', 'superadmin'].includes(req.user.role)) {
            return errorResponse(res, '该帖子已锁定，不能继续回复', 403);
        }
        if (post && Number(post.slow_mode_seconds || 0) > 0 && !['moderator', 'admin', 'superadmin'].includes(req.user.role)) {
            const latestOwnReply = await Comment.findOne({
                where: { post_id: DbAdapter.getId(post), user_id: DbAdapter.getId(req.user), status: 'active' },
                order: [['created_at', 'DESC']],
                attributes: ['created_at']
            });
            if (latestOwnReply) {
                const remaining = Number(post.slow_mode_seconds) - Math.floor((Date.now() - new Date(latestOwnReply.created_at).getTime()) / 1000);
                if (remaining > 0) return errorResponse(res, `该帖子已开启慢速模式，请在 ${remaining} 秒后再回复`, 429);
            }
        }

        const localWorkId = work ? DbAdapter.getId(work) : null;
        const localPostId = post ? DbAdapter.getId(post) : null;
        // 修复 P1-12: 通知 related_id 用 codemao ID(前端路由用)
        const codemaoWorkId = work?.codemao_work_id || localWorkId;
        const codemaoPostId = post?.id || localPostId;
        // 修复: 不从 req.body 取 reply_to_user_id,防止前端任意传参伪造通知接收者
        // 统一从 parent comment 的 user_id 推导
        let replyToUserId = null;

        let parentComment = null;
        if (parent_id) {
            parentComment = await DbAdapter.findByPk(Comment, parent_id);
            const parentMatchesTarget = parentComment
                && parentComment.status === 'active'
                && sameId(parentComment.work_id || '', localWorkId || '')
                && sameId(parentComment.post_id || '', localPostId || '');

            if (!parentMatchesTarget) {
                return errorResponse(res, 'Parent comment not found', 404);
            }
            // M18: 仅允许回复顶层评论，禁止对子回复再回复，避免层级过深
            if (parentComment.parent_id != null) {
                return errorResponse(res, '只能回复顶层评论', 400);
            }
            // 从 parent comment 推导被回复者,忽略前端传入的 reply_to_user_id
            replyToUserId = parentComment.user_id;
        }

        // H12: 落库前进行内容审核（敏感词/违规检查）
        // fallbackReview 返回 recommendation: pass / review / delete
        // delete 表示严重违规应拒绝，review 表示需人工复核，pass 表示通过
        const rawContent = String(content || '').trim();
        if (rawContent.startsWith(SOCIAL_CARD_PREFIX)) return errorResponse(res, '评论格式无效', 400);
        const reviewResult = await aiReview.fallbackReview(rawContent || '分享即时通讯卡片');
        if (reviewResult.recommendation === 'delete') {
            return errorResponse(res, `内容包含违规信息:${reviewResult.reason}`, 400);
        }
        // Comment 模型 status 无 pending 枚举，用 hidden 表示待人工复核
        const commentStatus = reviewResult.recommendation === 'review' ? 'hidden' : 'active';

        // 修复: 评论落库与计数递增放入事务,但通知创建放在事务外
        // 通知表异常不应导致评论失败,用 outbox 模式避免通知写入错误回滚评论
        let comment;
        const isVisible = commentStatus === 'active';
        await sequelize.transaction(async (t) => {
            comment = await DbAdapter.create(Comment, {
                content: card ? `${SOCIAL_CARD_PREFIX}${JSON.stringify(card)}` : rawContent,
                user_id: DbAdapter.getId(req.user),
                work_id: localWorkId,
                post_id: localPostId,
                parent_id: parent_id || null,
                reply_to_user_id: replyToUserId,
                status: commentStatus
            }, { transaction: t });

            if (work && isVisible) {
                if (!parent_id) {
                    await DbAdapter.increment(work, 'comment_count', { transaction: t });
                }
            }

            if (post && isVisible) {
                await DbAdapter.increment(post, 'reply_count', { transaction: t });
                if (!parent_id) {
                    await DbAdapter.increment(post, 'comment_count', { transaction: t });
                }
                await DbAdapter.update(Post, {
                    last_reply_at: new Date(),
                    last_reply_user_id: DbAdapter.getId(req.user),
                    last_comment_id: DbAdapter.getId(comment)
                }, { where: { id: localPostId }, transaction: t });
            }
        });

        if (post && isVisible) {
            const participantCount = await Comment.count({ where: { post_id: localPostId, status: 'active' }, distinct: true, col: 'user_id' });
            await DbAdapter.update(Post, { participant_count: Math.max(1, participantCount + (await Comment.count({ where: { post_id: localPostId, status: 'active', user_id: post.user_id } }) ? 0 : 1)) }, { where: { id: localPostId } });
            // 发表评论不等于订阅整帖。只有用户主动点击“订阅回复”时才创建
            // PostSubscription，避免评论后按钮无提示地变成“已订阅回复”。
        }

        // 通知创建放在事务外,失败不影响评论落库
        if (isVisible) {
            try {
                const notificationContent = card ? (card.type === 'user' ? '分享了一张私聊名片' : `分享了群聊 #${card.target_id}`) : rawContent;
                const notificationPromises = [];
                // 作品顶层评论通知作品作者
                if (work && !parent_id && work.user_id != null && !sameId(work.user_id, DbAdapter.getId(req.user))) {
                    notificationPromises.push(DbAdapter.create(Notification, {
                        user_id: work.user_id,
                        type: 'comment',
                        title: '评论了你的作品',
                        content: notificationContent.substring(0, 100),
                        related_id: codemaoWorkId,
                        related_type: 'work',
                        sender_id: DbAdapter.getId(req.user)
                    }));
                }
                // 帖子顶层评论通知帖子作者
                if (post && !parent_id && !sameId(post.user_id, DbAdapter.getId(req.user))) {
                    notificationPromises.push(DbAdapter.create(Notification, {
                        user_id: post.user_id,
                        type: 'comment',
                        title: '评论了你的帖子',
                        content: notificationContent.substring(0, 100),
                        related_id: codemaoPostId,
                        related_type: 'post',
                        sender_id: DbAdapter.getId(req.user)
                    }));
                }
                // 回复通知: 仅回复(有 parent_id)时发给被回复者,且避免自我通知
                if (parent_id && replyToUserId && !sameId(replyToUserId, DbAdapter.getId(req.user))) {
                    notificationPromises.push(DbAdapter.create(Notification, {
                        user_id: replyToUserId,
                        type: 'reply',
                        title: '回复了你的评论',
                        content: notificationContent.substring(0, 100),
                        related_id: codemaoWorkId || codemaoPostId,
                        related_type: codemaoWorkId ? 'work' : 'post',
                        sender_id: DbAdapter.getId(req.user)
                    }));
                }
                if (post) {
                    const excluded = new Set([String(DbAdapter.getId(req.user)), String(post.user_id || ''), String(replyToUserId || '')]);
                    const mentionUsernames = extractMentionUsernames(rawContent);
                    if (mentionUsernames.length) {
                        const mentionedUsers = await User.findAll({
                            where: { username: { [Op.in]: mentionUsernames }, status: 'active' },
                            attributes: ['id']
                        });
                        for (const mentionedUser of mentionedUsers) {
                            const mentionedId = String(DbAdapter.getId(mentionedUser));
                            if (excluded.has(mentionedId)) continue;
                            excluded.add(mentionedId);
                            notificationPromises.push(DbAdapter.create(Notification, {
                                user_id: DbAdapter.getId(mentionedUser),
                                type: 'mention',
                                title: '在论坛回复中提到了你',
                                content: notificationContent.substring(0, 100),
                                related_id: codemaoPostId,
                                related_type: 'post',
                                sender_id: DbAdapter.getId(req.user)
                            }));
                        }
                    }
                    const subscribers = await PostSubscription.findAll({ where: { post_id: localPostId, notify: true }, attributes: ['user_id'] });
                    for (const subscription of subscribers) {
                        if (excluded.has(String(subscription.user_id))) continue;
                        excluded.add(String(subscription.user_id));
                        notificationPromises.push(DbAdapter.create(Notification, {
                            user_id: subscription.user_id,
                            type: 'reply',
                            title: '你关注的帖子有新回复',
                            content: notificationContent.substring(0, 100),
                            related_id: codemaoPostId,
                            related_type: 'post',
                            sender_id: DbAdapter.getId(req.user)
                        }));
                    }
                }
                await Promise.allSettled(notificationPromises);
            } catch (notifyErr) {
                console.error('Create comment notification error (non-critical):', notifyErr);
            }
        }

        const result = await DbAdapter.findByPk(Comment, DbAdapter.getId(comment), {
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, {
                model: User,
                as: 'reply_to_user',
                attributes: ['id', 'codemao_user_id', 'username', 'nickname'],
                required: false
            }]
        });

        if (post && isVisible) invalidateForumReputation();
        return successResponse(res, result, '评论成功');
    } catch (error) {
        console.error('Create comment error:', error);
        return errorResponse(res, 'Failed to create comment', 500);
    }
}

async function getWorkComments(req, res) {
    try {
        const { workId } = req.params;
        // M3: 统一使用 parsePagination 限制 pageSize 上限
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const work = await resolvePublishedWork(workId);

        // L7: 作品不存在应返回 404，而非空列表
        if (!work) {
            return errorResponse(res, '作品不存在', 404);
        }

        const { count, rows } = await DbAdapter.findAndCountAll(Comment, {
            where: { work_id: DbAdapter.getId(work), status: 'active', parent_id: null },
            distinct: true,
            include: [{
                model: User,
                as: 'user',
                // 修复: 过滤禁用用户的作者信息,与 followController 公开资料策略一致
                // 使用 required: false 使评论仍可见但 user 为 null,避免历史评论凭空消失
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar']
            }, {
                model: User,
                as: 'reply_to_user',
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'codemao_user_id', 'username', 'nickname']
            }, {
                // 报告4 #22: 评论回复递归深度限制
                // 此处 replies include 故意只展开一层,内部仅包含 User(replies 作者/被回复者),
                // 不再嵌套 Comment.replies,避免自引用关联导致无限递归 → 栈溢出 → 服务崩溃。
                // 业务规则: 仅允许回复顶层评论(createComment 中 parent.parent_id != null 拦截),
                // 因此最多两级(顶层评论 + 一层回复),单层 include 即可覆盖。
                model: Comment,
                as: 'replies',
                where: { status: 'active' },
                required: false,
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
                    attributes: ['id', 'codemao_user_id', 'username', 'nickname']
                }]
            }],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset: offset
        });

        const { Like } = require('../models');
        const { Op } = require('sequelize');

        const commentIds = rows.flatMap(c => [
            DbAdapter.getId(c),
            ...(c.replies || []).map(r => DbAdapter.getId(r))
        ]);

        let likedSet = new Set();
        if (req.user && commentIds.length > 0) {
            const likedRows = await DbAdapter.findAll(Like, {
                where: { user_id: DbAdapter.getId(req.user), comment_id: { [Op.in]: commentIds } }
            });
            likedSet = new Set(likedRows.map(l => String(l.comment_id)));
        }

        const list = rows.map(c => {
            const json = c.toJSON ? c.toJSON() : c;
            json.liked = likedSet.has(String(json.id));
            if (json.replies) json.replies.forEach(r => { r.liked = likedSet.has(String(r.id)); });
            return json;
        });

        // L1: 统一使用 paginateResponse 返回分页结构
        return paginateResponse(res, list, count, page, pageSize);
    } catch (error) {
        console.error('Get comments error:', error);
        return errorResponse(res, 'Failed to get comments', 500);
    }
}

async function deleteComment(req, res) {
    try {
        const { id } = req.params;
        const comment = await DbAdapter.findByPk(Comment, id);

        if (!comment) {
            return errorResponse(res, '评论不存在', 404);
        }

        if (!sameId(comment.user_id, DbAdapter.getId(req.user))) {
            return errorResponse(res, '无权删除此评论', 403);
        }
        // 修复: moderator 删除他人评论时需校验目标作者角色,不能删除同级或上级管理员的评论
        if (!sameId(comment.user_id, DbAdapter.getId(req.user)) && comment.user_id) {
            const targetAuthor = await DbAdapter.findByPk(User, comment.user_id, { attributes: ['id', 'role'] });
            if (targetAuthor && !canManageUser(req.user.role, targetAuthor.role)) {
                return errorResponse(res, '无权删除此用户的评论', 403);
            }
        }

        if (comment.status === 'deleted') {
            return successResponse(res, null, '评论已删除');
        }

        const wasActive = comment.status === 'active';
        const { Op } = require('sequelize');
        const { Like } = require('../models');
        await sequelize.transaction(async (t) => {
            await DbAdapter.update(Comment, { status: 'deleted' }, { where: { id }, transaction: t });

            // 级联软删所有多级子回复(不只直接子回复),避免深层回复残留
            let currentParentIds = [id];
            let totalDeleted = 1;
            const maxDepth = 100; // 提高上限覆盖异常多级回复,while 内按实际子节点数自然终止
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
                totalDeleted += childIds.length;
                currentParentIds = childIds;
            }

            // 清理父评论自身的 Like 记录 + 清零 like_count
            await DbAdapter.destroy(Like, { where: { comment_id: id }, transaction: t });
            await DbAdapter.update(Comment, { like_count: 0 }, { where: { id }, transaction: t });

            // 仅在旧状态为 active 且顶层评论时才递减 comment_count，避免 hidden→deleted 重复扣减
            // 修复(报告1 #9): 移除 in-memory (count > 0) 旧实例判断，改用原子条件 decrement
            // 仅当 comment_count > 0 时才执行减 1，避免并发导致负数（与 likeComment/unlikeComment 同模式）
            if (wasActive && !comment.parent_id) {
                if (comment.work_id) {
                    const work = await DbAdapter.findByPk(Work, comment.work_id, { transaction: t });
                    if (work) {
                        await DbAdapter.decrement(work, 'comment_count', {
                            where: { comment_count: { [Op.gt]: 0 } },
                            transaction: t
                        });
                    }
                }
                if (comment.post_id) {
                    const post = await DbAdapter.findByPk(Post, comment.post_id, { transaction: t });
                    if (post) {
                        await DbAdapter.decrement(post, 'comment_count', {
                            where: { comment_count: { [Op.gt]: 0 } },
                            transaction: t
                        });
                    }
                }
            }
        });

        if (comment.post_id) {
            const [replyCount, participantCount, latestReply] = await Promise.all([
                Comment.count({ where: { post_id: comment.post_id, status: 'active' } }),
                Comment.count({ where: { post_id: comment.post_id, status: 'active' }, distinct: true, col: 'user_id' }),
                Comment.findOne({ where: { post_id: comment.post_id, status: 'active' }, order: [['created_at', 'DESC']], attributes: ['id', 'user_id', 'created_at'] })
            ]);
            const targetPost = await Post.findByPk(comment.post_id, { attributes: ['id', 'user_id', 'accepted_comment_id', 'created_at'] });
            if (targetPost) await Post.update({
                reply_count: replyCount,
                participant_count: Math.max(1, participantCount + (await Comment.count({ where: { post_id: comment.post_id, status: 'active', user_id: targetPost.user_id } }) ? 0 : 1)),
                last_reply_at: latestReply?.created_at || targetPost.created_at,
                last_reply_user_id: latestReply?.user_id || targetPost.user_id,
                last_comment_id: latestReply?.id || null,
                accepted_comment_id: Number(targetPost.accepted_comment_id) === Number(id) ? null : targetPost.accepted_comment_id
            }, { where: { id: comment.post_id } });
        }

        if (comment.post_id) invalidateForumReputation();
        return successResponse(res, null, '评论已删除');
    } catch (error) {
        console.error('删除评论错误:', error);
        return errorResponse(res, '删除评论失败', 500);
    }
}

async function likeComment(req, res) {
    try {
        const { id } = req.params;
        const userId = DbAdapter.getId(req.user);
        const comment = await DbAdapter.findByPk(Comment, id);

        if (!comment || comment.status !== 'active') {
            return errorResponse(res, '评论不存在', 404);
        }
        if (comment.work_id && !await resolvePublishedWorkByLocalId(comment.work_id)) {
            return errorResponse(res, '评论不存在', 404);
        }
        if (comment.post_id && !await resolvePublishedPost(comment.post_id)) {
            return errorResponse(res, '评论不存在', 404);
        }

        const { Like } = require('../models');
        const { Op } = require('sequelize');
        const existing = await DbAdapter.findOne(Like, {
            where: { user_id: userId, comment_id: DbAdapter.getId(comment) }
        });

        if (existing) {
            // 已点赞 → 取消点赞（toggle）
            // 修复 bug3: destroy Like + decrement like_count 用事务包裹,保证一致性
            // 修复 bug4: 不再用旧实例 like_count > 0 判断,改用原子 decrement 带 where 条件避免负数
            await sequelize.transaction(async (t) => {
                const removed = await DbAdapter.destroy(Like, {
                    where: { id: DbAdapter.getId(existing) },
                    transaction: t
                });
                if (removed) {
                    // 原子 decrement: 仅当 like_count > 0 时才执行减 1,避免并发导致负数
                    await DbAdapter.decrement(comment, 'like_count', {
                        where: { like_count: { [Op.gt]: 0 } },
                        transaction: t
                    });
                }
            });
            await comment.reload();
            const newCount = Math.max(0, comment.like_count || 0);
            if (comment.post_id) invalidateForumReputation();
            return successResponse(res, { like_count: newCount, liked: false }, '已取消点赞');
        }

        // 修复 bug3: create Like + increment like_count 用事务包裹,中途失败回滚避免不一致
        try {
            await sequelize.transaction(async (t) => {
                await DbAdapter.create(Like, {
                    user_id: userId,
                    comment_id: DbAdapter.getId(comment)
                }, { transaction: t });
                await DbAdapter.increment(comment, 'like_count', { transaction: t });
            });
        } catch (createError) {
            if (createError.name === 'SequelizeUniqueConstraintError') {
                return errorResponse(res, '已经点赞过了', 400);
            }
            throw createError;
        }

        await comment.reload();

        const likeCount = Math.max(0, comment.like_count || 0);
        if (comment.post_id) invalidateForumReputation();
        return successResponse(res, { like_count: likeCount, liked: true }, '点赞成功');
    } catch (error) {
        console.error('点赞评论错误:', error);
        return errorResponse(res, '点赞失败', 500);
    }
}

module.exports = {
    createComment,
    getWorkComments,
    getCommentReplies,
    deleteComment,
    likeComment
};
