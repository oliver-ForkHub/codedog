const crypto = require('crypto');
const { Op } = require('sequelize');
const DbAdapter = require('../utils/dbAdapter');
const {
    Studio, StudioMember, StudioInvite, StudioOperationLog, StudioAnnouncement,
    StudioTask, StudioBlacklist, StudioDiscussion, StudioWork, Work, User, Notification, sequelize
} = require('../models');
const { successResponse, errorResponse } = require('../middleware/response');
const aiReview = require('../services/aiReview');
const { isRoleAtLeast } = require('../config/permissions');

const PERMISSIONS = Object.freeze([
    'member_review', 'member_manage', 'role_manage', 'work_review', 'work_manage',
    'profile_edit', 'announcement_manage', 'invite_manage',
    'log_view', 'analytics_view', 'im_bind'
]);
const ROLE_DEFAULTS = Object.freeze({
    owner: PERMISSIONS,
    vice_owner: PERMISSIONS.filter(item => item !== 'role_manage'),
    admin: ['member_review', 'member_manage', 'work_review', 'work_manage', 'announcement_manage', 'invite_manage', 'log_view'],
    member: []
});

function userId(req) { return DbAdapter.getId(req.user); }
function cleanReason(value, required = false) {
    const reason = String(value || '').trim().slice(0, 500);
    return required && reason.length < 2 ? null : reason;
}
function publicIp(req) { return req.ip || req.socket?.remoteAddress || null; }
function safeJson(value) { try { return JSON.stringify(value); } catch { return null; } }

async function getMembership(studioId, reqUserId, transaction) {
    return DbAdapter.findOne(StudioMember, {
        where: { studio_id: studioId, user_id: reqUserId, status: 'active' }, transaction
    });
}
function effectivePermissions(member) {
    if (!member) return [];
    if (member.role === 'owner') return [...PERMISSIONS];
    const custom = member.permissions;
    return Array.isArray(custom) ? custom.filter(item => PERMISSIONS.includes(item)) : [...(ROLE_DEFAULTS[member.role] || [])];
}
async function requirePermission(req, res, permission) {
    const member = await getMembership(req.params.id, userId(req));
    if (!member || !effectivePermissions(member).includes(permission)) {
        errorResponse(res, '您没有执行此工作室操作的权限', 403);
        return null;
    }
    return member;
}
async function logOperation(req, action, options = {}) {
    return DbAdapter.create(StudioOperationLog, {
        studio_id: Number(req.params.id || options.studioId), operator_id: userId(req), action,
        target_type: options.targetType || null, target_id: options.targetId || null,
        reason: options.reason || '', before_state: safeJson(options.before),
        after_state: safeJson(options.after), ip_address: publicIp(req), is_public: !!options.isPublic
    }, options.transaction ? { transaction: options.transaction } : undefined);
}
async function notify(targetUserId, title, content, studioId, senderId, transaction) {
    return DbAdapter.create(Notification, {
        user_id: targetUserId, type: 'system', title, content,
        related_id: Number(studioId), related_type: 'studio', sender_id: senderId
    }, transaction ? { transaction } : undefined);
}

async function getCapabilities(req, res) {
    const member = await getMembership(req.params.id, userId(req));
    return successResponse(res, {
        role: member?.role || null,
        permissions: effectivePermissions(member),
        available_permissions: PERMISSIONS
    });
}

async function setMemberPermissions(req, res) {
    try {
        const owner = await getMembership(req.params.id, userId(req));
        if (!owner || owner.role !== 'owner') return errorResponse(res, '只有室长可以配置管理权限', 403);
        const permissions = Array.isArray(req.body.permissions) ? [...new Set(req.body.permissions)] : null;
        if (permissions && permissions.some(item => !PERMISSIONS.includes(item))) return errorResponse(res, '包含无效权限', 400);
        const member = await DbAdapter.findOne(StudioMember, { where: { id: req.params.memberId, studio_id: req.params.id, status: 'active' } });
        if (!member || member.role === 'owner') return errorResponse(res, '成员不存在或不可修改', 404);
        const before = effectivePermissions(member);
        await member.update({ permissions });
        await logOperation(req, 'member_permissions_updated', { targetType: 'studio_member', targetId: member.id, before, after: effectivePermissions(member) });
        return successResponse(res, { permissions: effectivePermissions(member) }, '成员权限已更新');
    } catch (error) { console.error('设置工作室权限失败:', error); return errorResponse(res, '设置权限失败', 500); }
}

async function createInvite(req, res) {
    try {
        if (!await requirePermission(req, res, 'invite_manage')) return;
        const maxUses = Math.max(1, Math.min(100, Number(req.body.max_uses) || 1));
        const hours = Math.max(1, Math.min(24 * 30, Number(req.body.expires_in_hours) || 72));
        const targetUserId = req.body.target_user_id ? Number(req.body.target_user_id) : null;
        if (targetUserId && !await DbAdapter.findByPk(User, targetUserId)) return errorResponse(res, '指定用户不存在', 404);
        const invite = await DbAdapter.create(StudioInvite, {
            studio_id: Number(req.params.id), code: crypto.randomBytes(24).toString('base64url'),
            created_by: userId(req), target_user_id: targetUserId,
            expires_at: new Date(Date.now() + hours * 3600000), max_uses: targetUserId ? 1 : maxUses
        });
        await logOperation(req, 'invite_created', { targetType: 'studio_invite', targetId: invite.id, after: { target_user_id: targetUserId, max_uses: invite.max_uses, expires_at: invite.expires_at } });
        return successResponse(res, invite, '邀请已创建');
    } catch (error) { console.error('创建工作室邀请失败:', error); return errorResponse(res, '创建邀请失败', 500); }
}
async function listInvites(req, res) {
    try {
        if (!await requirePermission(req, res, 'invite_manage')) return;
        const list = await DbAdapter.findAll(StudioInvite, { where: { studio_id: req.params.id }, include: [{ model: User, as: 'target_user', attributes: ['id', 'nickname', 'username', 'avatar'] }], order: [['created_at', 'DESC']] });
        return successResponse(res, list);
    } catch (error) { return errorResponse(res, '获取邀请失败', 500); }
}
async function revokeInvite(req, res) {
    try {
        if (!await requirePermission(req, res, 'invite_manage')) return;
        const changed = await DbAdapter.update(StudioInvite, { status: 'revoked' }, { where: { id: req.params.inviteId, studio_id: req.params.id, status: 'active' } });
        const count = Array.isArray(changed) ? changed[0] : changed;
        if (!count) return errorResponse(res, '邀请不存在或已失效', 404);
        await logOperation(req, 'invite_revoked', { targetType: 'studio_invite', targetId: Number(req.params.inviteId) });
        return successResponse(res, null, '邀请已撤销');
    } catch (error) { return errorResponse(res, '撤销邀请失败', 500); }
}
async function acceptInvite(req, res) {
    try {
        const code = String(req.body.code || '').trim();
        if (!code) return errorResponse(res, '请提供邀请码', 400);
        const result = await sequelize.transaction(async transaction => {
            const invite = await DbAdapter.findOne(StudioInvite, { where: { code, status: 'active' }, transaction });
            if (!invite || (invite.expires_at && new Date(invite.expires_at) <= new Date()) || invite.used_count >= invite.max_uses) throw Object.assign(new Error('邀请不存在或已失效'), { statusCode: 400 });
            if (invite.target_user_id && String(invite.target_user_id) !== String(userId(req))) throw Object.assign(new Error('该邀请仅限指定用户使用'), { statusCode: 403 });
            const studio = await DbAdapter.findByPk(Studio, invite.studio_id, { transaction });
            if (!studio || studio.status !== 'active') throw Object.assign(new Error('工作室不可加入'), { statusCode: 400 });
            if (studio.recruitment_status !== 'open') throw Object.assign(new Error('工作室已暂停招募'), { statusCode: 400 });
            if (studio.member_count >= studio.member_limit && !isRoleAtLeast(req.user.role, 'admin')) throw Object.assign(new Error('工作室人数已满'), { statusCode: 400 });
            if (await DbAdapter.findOne(StudioBlacklist, { where: { studio_id: studio.id, user_id: userId(req) }, transaction })) throw Object.assign(new Error('您无法加入该工作室'), { statusCode: 403 });
            const other = await DbAdapter.findOne(StudioMember, { where: { user_id: userId(req), status: { [Op.in]: ['active', 'pending'] }, studio_id: { [Op.ne]: studio.id } }, transaction });
            if (other) throw Object.assign(new Error('您已加入或正在申请其他工作室'), { statusCode: 400 });
            const [member, created] = await StudioMember.findOrCreate({ where: { studio_id: studio.id, user_id: userId(req) }, defaults: { role: 'member', status: 'active' }, transaction });
            const wasActive = !created && member.status === 'active';
            if (!created && !wasActive) await member.update({ status: 'active', review_reason: null }, { transaction });
            if (created || !wasActive) await Studio.increment('member_count', { where: { id: studio.id }, transaction });
            const nextUsed = invite.used_count + 1;
            await invite.update({ used_count: nextUsed, last_used_at: new Date(), status: nextUsed >= invite.max_uses ? 'exhausted' : 'active' }, { transaction });
            await StudioOperationLog.create({ studio_id: studio.id, operator_id: userId(req), action: 'invite_accepted', target_type: 'studio_invite', target_id: invite.id, reason: '', ip_address: publicIp(req), is_public: true }, { transaction });
            return studio;
        });
        return successResponse(res, result, '已加入工作室');
    } catch (error) { return errorResponse(res, error.message || '使用邀请失败', error.statusCode || 500); }
}

async function transferOwnership(req, res) {
    try {
        const reason = cleanReason(req.body.reason, true);
        if (!reason) return errorResponse(res, '请填写至少 2 个字的转让原因', 400);
        if (String(req.body.confirm_name || '').trim() === '') return errorResponse(res, '请输入工作室名称确认转让', 400);
        const studio = await DbAdapter.findByPk(Studio, req.params.id);
        const current = await getMembership(req.params.id, userId(req));
        if (!studio || !current || current.role !== 'owner') return errorResponse(res, '只有室长可以转让工作室', 403);
        if (String(req.body.confirm_name).trim() !== studio.name) return errorResponse(res, '工作室名称确认不一致', 400);
        const target = await DbAdapter.findOne(StudioMember, { where: { studio_id: studio.id, user_id: Number(req.body.target_user_id), status: 'active' } });
        if (!target || target.role === 'owner') return errorResponse(res, '接任人必须是工作室的活跃成员', 400);
        await sequelize.transaction(async transaction => {
            const before = { owner_id: studio.owner_id, vice_owner_id: studio.vice_owner_id };
            await StudioMember.update({ role: 'member', permissions: null }, { where: { id: current.id }, transaction });
            await StudioMember.update({ role: 'owner', permissions: null }, { where: { id: target.id }, transaction });
            await Studio.update({ owner_id: target.user_id, owner_claim: target.user_id, vice_owner_id: String(studio.vice_owner_id) === String(target.user_id) ? null : studio.vice_owner_id }, { where: { id: studio.id }, transaction });
            await StudioOperationLog.create({ studio_id: studio.id, operator_id: userId(req), action: 'ownership_transferred', target_type: 'user', target_id: target.user_id, reason, before_state: safeJson(before), after_state: safeJson({ owner_id: target.user_id }), ip_address: publicIp(req), is_public: true }, { transaction });
            await notify(target.user_id, '工作室已转让给您', `您已成为「${studio.name}」的新室长`, studio.id, userId(req), transaction);
        });
        return successResponse(res, null, '工作室已完成转让');
    } catch (error) { console.error('转让工作室失败:', error); return errorResponse(res, '转让工作室失败', 500); }
}

async function listLogs(req, res) {
    try {
        if (!await requirePermission(req, res, 'log_view')) return;
        const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
        const logs = await DbAdapter.findAll(StudioOperationLog, { where: { studio_id: req.params.id }, include: [{ model: User, as: 'operator', attributes: ['id', 'nickname', 'username', 'avatar'] }], order: [['created_at', 'DESC']], limit });
        return successResponse(res, logs);
    } catch (error) { return errorResponse(res, '获取操作日志失败', 500); }
}

async function listAnnouncements(req, res) {
    try {
        const studio = await DbAdapter.findByPk(Studio, req.params.id);
        if (!studio || studio.status !== 'active') return errorResponse(res, '工作室不存在', 404);
        if (!studio.is_public) {
            const viewerId = req.user ? userId(req) : null;
            const member = viewerId ? await getMembership(req.params.id, viewerId) : null;
            if (!member && !(req.user && isRoleAtLeast(req.user.role, 'moderator'))) return errorResponse(res, '工作室不存在', 404);
        }
        const rows = await DbAdapter.findAll(StudioAnnouncement, { where: { studio_id: req.params.id, status: 'published' }, include: [{ model: User, as: 'author', attributes: ['id', 'nickname', 'avatar'] }], order: [['is_pinned', 'DESC'], ['published_at', 'DESC']] });
        return successResponse(res, rows);
    } catch (error) { return errorResponse(res, '获取公告失败', 500); }
}
async function createAnnouncement(req, res) {
    try {
        if (!await requirePermission(req, res, 'announcement_manage')) return;
        const title = String(req.body.title || '').trim().slice(0, 120), content = String(req.body.content || '').trim().slice(0, 10000);
        if (!title || !content) return errorResponse(res, '请填写公告标题和内容', 400);
        const review = await aiReview.fallbackReview(`${title}\n${content}`);
        if (review.recommendation !== 'pass') return errorResponse(res, `公告内容需要修改：${review.reason || '未通过内容审核'}`, 400);
        const row = await DbAdapter.create(StudioAnnouncement, { studio_id: Number(req.params.id), author_id: userId(req), title, content, is_pinned: !!req.body.is_pinned });
        await logOperation(req, 'announcement_created', { targetType: 'studio_announcement', targetId: row.id, after: { title }, isPublic: true });
        return successResponse(res, row, '公告已发布');
    } catch (error) { return errorResponse(res, '发布公告失败', 500); }
}

// 更新公告：仅持有 announcement_manage 权限的成员可操作，更新标题/内容/置顶
async function updateAnnouncement(req, res) {
    try {
        if (!await requirePermission(req, res, 'announcement_manage')) return;
        const announcement = await DbAdapter.findOne(StudioAnnouncement, { where: { id: req.params.announcementId, studio_id: Number(req.params.id) } });
        if (!announcement) return errorResponse(res, '公告不存在', 404);
        const before = { title: announcement.title, content: announcement.content, is_pinned: announcement.is_pinned };
        const title = req.body.title !== undefined ? String(req.body.title).trim().slice(0, 120) : announcement.title;
        const content = req.body.content !== undefined ? String(req.body.content).trim().slice(0, 10000) : announcement.content;
        if (!title || !content) return errorResponse(res, '公告标题和内容不能为空', 400);
        // 内容变更时重新过内容审核
        if (req.body.title !== undefined || req.body.content !== undefined) {
            const review = await aiReview.fallbackReview(`${title}\n${content}`);
            if (review.recommendation !== 'pass') return errorResponse(res, `公告内容需要修改：${review.reason || '未通过内容审核'}`, 400);
        }
        const is_pinned = req.body.is_pinned !== undefined ? !!req.body.is_pinned : announcement.is_pinned;
        await DbAdapter.update(StudioAnnouncement, { title, content, is_pinned }, { where: { id: announcement.id } });
        await logOperation(req, 'announcement_updated', { targetType: 'studio_announcement', targetId: announcement.id, before: { title: before.title }, after: { title }, isPublic: true });
        return successResponse(res, { id: announcement.id, title, content, is_pinned }, '公告已更新');
    } catch (error) { return errorResponse(res, '更新公告失败', 500); }
}

// 删除公告：仅持有 announcement_manage 权限的成员可操作
async function deleteAnnouncement(req, res) {
    try {
        if (!await requirePermission(req, res, 'announcement_manage')) return;
        const announcement = await DbAdapter.findOne(StudioAnnouncement, { where: { id: req.params.announcementId, studio_id: Number(req.params.id) } });
        if (!announcement) return errorResponse(res, '公告不存在', 404);
        await DbAdapter.destroy(StudioAnnouncement, { where: { id: announcement.id } });
        await logOperation(req, 'announcement_deleted', { targetType: 'studio_announcement', targetId: announcement.id, before: { title: announcement.title }, isPublic: true });
        return successResponse(res, null, '公告已删除');
    } catch (error) { return errorResponse(res, '删除公告失败', 500); }
}

async function listTasks(req, res) {
    try {
        const member = await getMembership(req.params.id, userId(req));
        if (!member) return errorResponse(res, '仅工作室成员可查看任务', 403);
        const rows = await DbAdapter.findAll(StudioTask, { where: { studio_id: req.params.id }, include: [{ model: User, as: 'creator', attributes: ['id', 'nickname', 'avatar'] }, { model: User, as: 'assignee', attributes: ['id', 'nickname', 'avatar'] }, { model: Work, as: 'work', attributes: ['id', 'name', 'preview'] }], order: [['created_at', 'DESC']] });
        return successResponse(res, rows);
    } catch (error) { return errorResponse(res, '获取任务失败', 500); }
}
async function createTask(req, res) {
    try {
        if (!await requirePermission(req, res, 'task_manage')) return;
        const title = String(req.body.title || '').trim().slice(0, 120);
        if (!title) return errorResponse(res, '请填写任务名称', 400);
        const task = await DbAdapter.create(StudioTask, { studio_id: Number(req.params.id), creator_id: userId(req), assignee_id: req.body.assignee_id || null, work_id: req.body.work_id || null, title, description: String(req.body.description || '').trim().slice(0, 10000), needed_role: String(req.body.needed_role || '').trim().slice(0, 80) || null, priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal', deadline: req.body.deadline || null });
        await logOperation(req, 'task_created', { targetType: 'studio_task', targetId: task.id, after: { title }, isPublic: true });
        return successResponse(res, task, '任务已创建');
    } catch (error) { return errorResponse(res, '创建任务失败', 500); }
}
async function updateTask(req, res) {
    try {
        const member = await getMembership(req.params.id, userId(req));
        const task = await DbAdapter.findOne(StudioTask, { where: { id: req.params.taskId, studio_id: req.params.id } });
        if (!member || !task) return errorResponse(res, '任务不存在', 404);
        const canManage = effectivePermissions(member).includes('task_manage');
        const isAssignee = String(task.assignee_id) === String(userId(req));
        const status = req.body.status;
        if (!['open', 'in_progress', 'completed', 'cancelled'].includes(status)) return errorResponse(res, '无效任务状态', 400);
        if (!canManage && !isAssignee && !(task.assignee_id == null && status === 'in_progress')) return errorResponse(res, '无权更新该任务', 403);
        if (!canManage && !['in_progress', 'completed'].includes(status)) return errorResponse(res, '无权设置该状态', 403);
        const values = { status };
        if (task.assignee_id == null && status === 'in_progress') values.assignee_id = userId(req);
        await task.update(values);
        await logOperation(req, 'task_status_updated', { targetType: 'studio_task', targetId: task.id, after: { status }, isPublic: true });
        return successResponse(res, task, '任务状态已更新');
    } catch (error) { return errorResponse(res, '更新任务失败', 500); }
}

async function updateSettings(req, res) {
    try {
        const member = await requirePermission(req, res, 'profile_edit'); if (!member) return;
        const studio = await DbAdapter.findByPk(Studio, req.params.id); if (!studio) return errorResponse(res, '工作室不存在', 404);
        const values = {};
        if (req.body.member_limit !== undefined) values.member_limit = Math.max(studio.member_count, Math.min(1000, Number(req.body.member_limit) || 100));
        if (['open', 'paused'].includes(req.body.recruitment_status)) values.recruitment_status = req.body.recruitment_status;
        if (req.body.application_questions !== undefined) {
            if (!Array.isArray(req.body.application_questions) || req.body.application_questions.length > 5) return errorResponse(res, '招募问题最多 5 个', 400);
            values.application_questions = req.body.application_questions.map(item => String(item || '').trim().slice(0, 120)).filter(Boolean);
        }
        if (req.body.application_cooldown_days !== undefined) values.application_cooldown_days = Math.max(0, Math.min(90, Number(req.body.application_cooldown_days) || 0));
        // 成员退出或被移除时作品投稿关系必须清除，不再允许按工作室配置保留。
        values.leave_work_policy = 'remove';
        if (req.body.im_group_id !== undefined && effectivePermissions(member).includes('im_bind')) values.im_group_id = String(req.body.im_group_id || '').trim().slice(0, 100) || null;
        const before = { member_limit: studio.member_limit, recruitment_status: studio.recruitment_status, leave_work_policy: studio.leave_work_policy, im_group_id: studio.im_group_id };
        await studio.update(values); await logOperation(req, 'settings_updated', { before, after: values });
        return successResponse(res, studio, '工作室设置已更新');
    } catch (error) { return errorResponse(res, '更新设置失败', 500); }
}

async function getAnalytics(req, res) {
    try {
        if (!await requirePermission(req, res, 'analytics_view')) return;
        const studioId = req.params.id;
        const [members, pendingMembers, works, pendingWorks] = await Promise.all([
            StudioMember.count({ where: { studio_id: studioId, status: 'active' } }), StudioMember.count({ where: { studio_id: studioId, status: 'pending' } }),
            StudioWork.count({ where: { studio_id: studioId, status: 'approved' } }), StudioWork.count({ where: { studio_id: studioId, status: 'pending' } })
        ]);
        return successResponse(res, { members, pending_members: pendingMembers, works, pending_works: pendingWorks });
    } catch (error) { return errorResponse(res, '获取数据概览失败', 500); }
}

async function updateWorkDisplay(req, res) {
    try {
        if (!await requirePermission(req, res, 'work_manage')) return;
        const work = await DbAdapter.findOne(StudioWork, { where: { id: req.params.workId, studio_id: req.params.id } });
        if (!work) return errorResponse(res, '工作室作品不存在', 404);
        const values = {};
        if (req.body.is_featured !== undefined) values.is_featured = !!req.body.is_featured;
        if (req.body.sort_order !== undefined) values.sort_order = Math.max(-9999, Math.min(9999, Number(req.body.sort_order) || 0));
        const before = { is_featured: work.is_featured, sort_order: work.sort_order };
        await work.update(values);
        await logOperation(req, 'studio_work_display_updated', { targetType: 'studio_work', targetId: work.id, before, after: values });
        return successResponse(res, work, '作品展示设置已更新');
    } catch (error) { return errorResponse(res, '更新作品展示失败', 500); }
}

async function listBlacklist(req, res) {
    try {
        if (!await requirePermission(req, res, 'member_manage')) return;
        const rows = await DbAdapter.findAll(StudioBlacklist, { where: { studio_id: req.params.id }, include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'username', 'avatar'] }], order: [['created_at', 'DESC']] });
        return successResponse(res, rows);
    } catch (error) { return errorResponse(res, '获取黑名单失败', 500); }
}
async function addBlacklist(req, res) {
    try {
        if (!await requirePermission(req, res, 'member_manage')) return;
        const targetUserId = Number(req.body.user_id), reason = cleanReason(req.body.reason, true);
        if (!targetUserId || !reason) return errorResponse(res, '请填写用户 ID 和至少 2 个字的原因', 400);
        const targetMember = await DbAdapter.findOne(StudioMember, { where: { studio_id: req.params.id, user_id: targetUserId, role: 'owner' } });
        if (targetMember) return errorResponse(res, '不能将室长加入黑名单', 400);
        const [row] = await StudioBlacklist.findOrCreate({ where: { studio_id: Number(req.params.id), user_id: targetUserId }, defaults: { added_by: userId(req), reason } });
        await row.update({ added_by: userId(req), reason });
        await logOperation(req, 'blacklist_added', { targetType: 'user', targetId: targetUserId, reason });
        return successResponse(res, row, '已加入工作室黑名单');
    } catch (error) { return errorResponse(res, '加入黑名单失败', 500); }
}
async function removeBlacklist(req, res) {
    try {
        if (!await requirePermission(req, res, 'member_manage')) return;
        const count = await StudioBlacklist.destroy({ where: { id: req.params.blacklistId, studio_id: req.params.id } });
        if (!count) return errorResponse(res, '黑名单记录不存在', 404);
        await logOperation(req, 'blacklist_removed', { targetType: 'studio_blacklist', targetId: Number(req.params.blacklistId) });
        return successResponse(res, null, '已移出黑名单');
    } catch (error) { return errorResponse(res, '移出黑名单失败', 500); }
}

async function listDiscussions(req, res) {
    try {
        if (!await getMembership(req.params.id, userId(req))) return errorResponse(res, '仅工作室成员可查看讨论', 403);
        const rows = await DbAdapter.findAll(StudioDiscussion, { where: { studio_id: req.params.id, status: 'active' }, include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'username', 'avatar'] }], order: [['created_at', 'DESC']], limit: 100 });
        return successResponse(res, rows.reverse());
    } catch (error) { return errorResponse(res, '获取讨论失败', 500); }
}
async function createDiscussion(req, res) {
    try {
        if (!await getMembership(req.params.id, userId(req))) return errorResponse(res, '仅工作室成员可参与讨论', 403);
        const content = String(req.body.content || '').trim().slice(0, 2000);
        if (!content) return errorResponse(res, '请输入讨论内容', 400);
        const review = await aiReview.fallbackReview(content);
        if (review.recommendation !== 'pass') return errorResponse(res, `内容需要修改：${review.reason || '未通过审核'}`, 400);
        const row = await DbAdapter.create(StudioDiscussion, { studio_id: Number(req.params.id), user_id: userId(req), content });
        return successResponse(res, row, '已发送');
    } catch (error) { return errorResponse(res, '发送讨论失败', 500); }
}
async function deleteDiscussion(req, res) {
    try {
        const member = await getMembership(req.params.id, userId(req));
        const row = await DbAdapter.findOne(StudioDiscussion, { where: { id: req.params.discussionId, studio_id: req.params.id, status: 'active' } });
        if (!member || !row) return errorResponse(res, '讨论不存在', 404);
        if (String(row.user_id) !== String(userId(req)) && !effectivePermissions(member).includes('member_manage')) return errorResponse(res, '无权删除该讨论', 403);
        await row.update({ status: 'deleted' });
        await logOperation(req, 'discussion_deleted', { targetType: 'studio_discussion', targetId: row.id });
        return successResponse(res, null, '讨论已删除');
    } catch (error) { return errorResponse(res, '删除讨论失败', 500); }
}

module.exports = { PERMISSIONS, effectivePermissions, logOperation, getCapabilities, setMemberPermissions, createInvite, listInvites, revokeInvite, acceptInvite, transferOwnership, listLogs, listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, listTasks, createTask, updateTask, updateSettings, getAnalytics, updateWorkDisplay, listBlacklist, addBlacklist, removeBlacklist, listDiscussions, createDiscussion, deleteDiscussion };
