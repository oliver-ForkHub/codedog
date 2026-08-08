const { PostRevision, ForumModerationLog, Notification, Report, Like, Favorite, Comment, Post, sequelize } = require('../models');
const DbAdapter = require('../utils/dbAdapter');

function snapshotPost(post) {
    const plain = post?.toJSON ? post.toJSON() : post || {};
    return {
        title: plain.title || '',
        content: plain.content || '',
        board_id: plain.board_id || null,
        post_type: plain.post_type || plain.category || 'discussion',
        cover: plain.cover || '',
        tags: Array.isArray(plain.tags) ? plain.tags : []
    };
}

async function recordPostRevision(post, editorId, source = 'user', changeReason = '', options = {}) {
    const postId = Number(post.id);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const maxRevision = Number(await PostRevision.max('revision_number', { where: { post_id: postId }, transaction: options.transaction }) || 0);
        try {
            return await PostRevision.create({
                post_id: postId,
                revision_number: maxRevision + 1,
                editor_id: editorId ? Number(editorId) : null,
                source,
                change_reason: String(changeReason || '').trim().slice(0, 500),
                ...snapshotPost(post)
            }, { transaction: options.transaction });
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError' || attempt === 2) throw error;
        }
    }
    return null;
}

async function recordModerationLog(postId, operatorId, action, reason, beforeState, afterState, options = {}) {
    return ForumModerationLog.create({
        post_id: Number(postId),
        operator_id: operatorId ? Number(operatorId) : null,
        action: String(action || '').slice(0, 50),
        reason: String(reason || '').trim().slice(0, 500),
        before_state: beforeState ? JSON.stringify(beforeState) : null,
        after_state: afterState ? JSON.stringify(afterState) : null
    }, { transaction: options.transaction });
}

/**
 * 软删除帖子核心逻辑（用户删帖/管理员删帖/敏感词待审删除共用）
 * 在一个事务内完成：审计日志、通知/举报/点赞/收藏清理、评论软删、帖子软删与计数清零
 * @param {Object} post 帖子实例（需含 id/status/hidden_reason）
 * @param {number} operatorId 操作者 ID
 * @param {string} reason 删除原因（写入审计日志）
 * @param {Object} options { action, transaction, afterInside }
 *   - action: 审计 action，默认 'delete_post'
 *   - transaction: 传入时在外部事务内执行（不自行提交）
 *   - afterInside: 在事务内删帖完成后追加执行的异步回调
 */
async function softDeletePost(post, operatorId, reason, options = {}) {
    const pid = Number(post.id);
    const run = async (t) => {
        await recordModerationLog(pid, operatorId, options.action || 'delete_post', reason,
            { status: post.status, hidden_reason: post.hidden_reason }, { status: 'deleted' }, { transaction: t });
        await DbAdapter.destroy(Notification, { where: { related_id: pid, related_type: 'post' }, transaction: t });
        await DbAdapter.destroy(Report, { where: { target_id: pid, type: 'post' }, transaction: t });
        await DbAdapter.destroy(Like, { where: { post_id: pid }, transaction: t });
        await DbAdapter.destroy(Favorite, { where: { post_id: pid }, transaction: t });
        // Comment 有 status 字段，软删保留历史，避免死指针
        await DbAdapter.update(Comment, { status: 'deleted' }, { where: { post_id: pid }, transaction: t });
        // 软删帖子并清零计数字段，保持与关联数据一致
        await DbAdapter.update(Post, { status: 'deleted', like_count: 0, collection_count: 0, comment_count: 0 }, { where: { id: pid }, transaction: t });
        if (options.afterInside) await options.afterInside(t);
    };
    if (options.transaction) {
        await run(options.transaction);
        return;
    }
    await sequelize.transaction(run);
}

module.exports = { snapshotPost, recordPostRevision, recordModerationLog, softDeletePost };
