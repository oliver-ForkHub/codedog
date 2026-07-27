const crypto = require('crypto');
const {
    sequelize, User, Work, Post, Comment, Studio, StudioMember, StudioWork, StudioPointLog,
    Report, ReportAuditLog, Notification, Favorite, Like, Follow, ForumBoardSubscription,
    PostSubscription, PostDraft, PostRevision, ForumModerationLog, ForumBoard, ForumBoardModerator, OperationLog, IpBan, Announcement
} = require('../server/models');
const { Op } = sequelize.constructor;

const baseUrl = (process.env.SECURITY_TEST_BASE_URL || process.argv[2] || 'http://127.0.0.1:3299').replace(/\/$/, '');
const jwtSecret = process.env.JWT_SECRET || 'development-secret-key-do-not-use-in-production';
const marker = `codex_sec_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const created = {
    boardIds: [],
    studioWorkIds: [],
    studioMemberIds: [],
    studioIds: [],
    workIds: [],
    postIds: [],
    userIds: []
};
const failures = [];

function base64url(input) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(payload) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify({
        iat: now,
        exp: now + 3600,
        iss: 'codedog-community',
        aud: 'codedog-frontend',
        ...payload
    }));
    const unsigned = `${header}.${body}`;
    const signature = base64url(crypto.createHmac('sha256', jwtSecret).update(unsigned).digest());
    return `${unsigned}.${signature}`;
}

async function http(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body !== undefined && typeof body !== 'string' && !(body instanceof Buffer)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        body = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body,
        redirect: 'manual'
    });
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (_) {
        json = null;
    }
    return { status: response.status, text, json };
}

function auth(token) {
    return { Authorization: `Bearer ${token}` };
}

function record(name, passed, detail) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name} - ${detail}`);
    if (!passed) failures.push(`${name}: ${detail}`);
}

async function createUser(role, status = 'active') {
    const user = await User.create({
        codemao_user_id: `${marker}_${role}_${status}`,
        username: `${marker}_${role}_${status}`,
        email: `${marker}_${role}_${status}@example.test`,
        password: 'not-used',
        nickname: `${role}-${status}`,
        role,
        status
    });
    created.userIds.push(user.id);
    return user;
}

async function cleanup() {
    const userIds = created.userIds;
    await ReportAuditLog.destroy({ where: { handler_id: { [Op.in]: userIds } } });
    await Report.destroy({ where: { [Op.or]: [{ reporter_id: { [Op.in]: userIds } }, { handler_id: { [Op.in]: userIds } }] } });
    await Notification.destroy({ where: { [Op.or]: [{ user_id: { [Op.in]: userIds } }, { sender_id: { [Op.in]: userIds } }] } });
    await Comment.destroy({ where: { [Op.or]: [{ user_id: { [Op.in]: userIds } }, { reply_to_user_id: { [Op.in]: userIds } }] } });
    await Like.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await Favorite.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await Follow.destroy({ where: { [Op.or]: [{ follower_id: { [Op.in]: userIds } }, { following_id: { [Op.in]: userIds } }] } });
    await ForumBoardSubscription.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await PostSubscription.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await PostDraft.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await ForumBoardModerator.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await ForumModerationLog.destroy({ where: { post_id: created.postIds } });
    await PostRevision.destroy({ where: { post_id: created.postIds } });
    await OperationLog.destroy({ where: { user_id: { [Op.in]: userIds } } });
    await StudioPointLog.destroy({ where: { admin_id: { [Op.in]: userIds } } });
    await IpBan.destroy({ where: { banned_by: { [Op.in]: userIds } } });
    await Announcement.destroy({ where: { author_id: { [Op.in]: userIds } } });
    await StudioWork.destroy({ where: { id: created.studioWorkIds } });
    await StudioMember.destroy({ where: { id: created.studioMemberIds } });
    await Studio.destroy({ where: { id: created.studioIds } });
    await Work.destroy({ where: { id: created.workIds } });
    await Post.destroy({ where: { id: created.postIds } });
    await ForumBoard.destroy({ where: { id: created.boardIds } });
    await User.destroy({ where: { id: created.userIds } });
}

async function main() {
    // 修复: 移除 sync({ alter: true }),防止误改生产数据库表结构;仅验证连接
    await sequelize.authenticate();

    const activeUser = await createUser('user');
    const disabledUser = await createUser('user', 'disabled');
    const adminUser = await createUser('admin');
    const moderatorUser = await createUser('moderator');
    const superadminUser = await createUser('superadmin');

    const activeTokenClaimingSuperadmin = signJwt({ id: activeUser.id, username: activeUser.username, role: 'superadmin' });
    const disabledToken = signJwt({ id: disabledUser.id, username: disabledUser.username, role: 'user' });
    const adminToken = signJwt({ id: adminUser.id, username: adminUser.username, role: 'admin' });
    const moderatorToken = signJwt({ id: moderatorUser.id, username: moderatorUser.username, role: 'moderator' });
    const superadminToken = signJwt({ id: superadminUser.id, username: superadminUser.username, role: 'superadmin' });

    const draftSave = await http('/api/posts/drafts/current', {
        method: 'PUT', headers: auth(activeTokenClaimingSuperadmin),
        body: { title: `${marker}_draft`, content: '<p>draft body</p>', post_type: 'discussion', tags: ['test'] }
    });
    record('authenticated user can save a forum draft', draftSave.status === 200, `status=${draftSave.status}`);
    const draftRead = await http('/api/posts/drafts/current', { headers: auth(activeTokenClaimingSuperadmin) });
    record('forum draft can be restored', draftRead.status === 200 && draftRead.text.includes(`${marker}_draft`), `status=${draftRead.status}`);
    const draftDelete = await http('/api/posts/drafts/current', { method: 'DELETE', headers: auth(activeTokenClaimingSuperadmin) });
    record('forum draft can be cleared', draftDelete.status === 200, `status=${draftDelete.status}`);

    const boardSlug = `security-${Date.now()}`;
    const boardCreate = await http('/api/admin/forum/boards', {
        method: 'POST', headers: auth(superadminToken),
        body: { name: 'Security board', slug: boardSlug, description: 'test', icon: 'T', color: '#fec433', allow_post_roles: ['user', 'superadmin'] }
    });
    if (boardCreate.json?.data?.id) created.boardIds.push(boardCreate.json.data.id);
    record('admin can create a governed forum board', boardCreate.status === 200, `status=${boardCreate.status}`);

    const forumPostCreate = await http('/api/posts', {
        method: 'POST', headers: auth(activeTokenClaimingSuperadmin),
        body: { title: `${marker}_forum_original`, content: '<p>original body</p>', board_id: boardCreate.json?.data?.id, post_type: 'discussion', tags: ['history'] }
    });
    const forumPostId = forumPostCreate.json?.data?.id;
    if (forumPostId) created.postIds.push(forumPostId);
    record('forum post creation records initial revision', forumPostCreate.status === 200 && Boolean(forumPostId), `status=${forumPostCreate.status}`);

    const editWithoutReason = await http(`/api/posts/${forumPostId}`, {
        method: 'PUT', headers: auth(activeTokenClaimingSuperadmin),
        body: { title: `${marker}_forum_edited`, content: '<p>edited body</p>' }
    });
    record('forum edit requires a change reason', editWithoutReason.status === 400, `status=${editWithoutReason.status}`);

    const editWithReason = await http(`/api/posts/${forumPostId}`, {
        method: 'PUT', headers: auth(activeTokenClaimingSuperadmin),
        body: { title: `${marker}_forum_edited`, content: '<p>edited body</p>', change_reason: 'security history edit' }
    });
    record('forum edit records a revision atomically', editWithReason.status === 200, `status=${editWithReason.status}`);

    const forumHistory = await http(`/api/admin/posts/${forumPostId}/history`, { headers: auth(superadminToken) });
    const initialRevision = forumHistory.json?.data?.revisions?.find(item => Number(item.revision_number) === 1);
    record('forum moderation history exposes revisions', forumHistory.status === 200 && forumHistory.json?.data?.revisions?.length >= 2, `status=${forumHistory.status}; revisions=${forumHistory.json?.data?.revisions?.length || 0}`);

    const rollback = await http(`/api/admin/posts/${forumPostId}/revisions/${initialRevision?.id}/restore`, {
        method: 'POST', headers: auth(superadminToken), body: { reason: 'security rollback test' }
    });
    const rolledBackPost = await Post.findByPk(forumPostId);
    const rollbackLog = await ForumModerationLog.findOne({ where: { post_id: forumPostId, action: 'restore_revision' } });
    record('forum revision rollback is audited', rollback.status === 200 && rolledBackPost?.title === `${marker}_forum_original` && Boolean(rollbackLog), `status=${rollback.status}; title=${rolledBackPost?.title}`);

    const targetBoardCreate = await http('/api/admin/forum/boards', {
        method: 'POST', headers: auth(superadminToken),
        body: { name: 'Merge target board', slug: `merge-${Date.now()}`, description: 'test', icon: 'M', color: '#fec433', allow_post_roles: ['user', 'moderator', 'superadmin'] }
    });
    const targetBoardId = targetBoardCreate.json?.data?.id;
    if (targetBoardId) created.boardIds.push(targetBoardId);
    const mergeTarget = await Post.create({ title: `${marker}_merge_target`, content: 'target', user_id: activeUser.id, status: 'published', board_id: targetBoardId, category: 'discussion' });
    created.postIds.push(mergeTarget.id);
    await Comment.create({ content: 'source reply', user_id: moderatorUser.id, post_id: forumPostId, status: 'active' });
    await Like.create({ user_id: moderatorUser.id, post_id: forumPostId });
    await Favorite.create({ user_id: moderatorUser.id, post_id: forumPostId });
    await PostSubscription.create({ user_id: moderatorUser.id, post_id: forumPostId, notify: true });

    const unassignedMerge = await http(`/api/admin/posts/${forumPostId}/merge`, {
        method: 'POST', headers: auth(moderatorToken), body: { target_post_id: mergeTarget.id, reason: 'unassigned board test' }
    });
    record('unassigned moderator cannot merge forum topics', unassignedMerge.status === 403, `status=${unassignedMerge.status}`);

    const assignSource = await http(`/api/admin/forum/boards/${boardCreate.json?.data?.id}/moderators`, {
        method: 'POST', headers: auth(superadminToken), body: { user_id: moderatorUser.id, note: 'security test source' }
    });
    const assignTarget = await http(`/api/admin/forum/boards/${targetBoardId}/moderators`, {
        method: 'POST', headers: auth(superadminToken), body: { user_id: moderatorUser.id, note: 'security test target' }
    });
    record('admin can assign scoped forum moderators', assignSource.status === 200 && assignTarget.status === 200, `source=${assignSource.status}; target=${assignTarget.status}`);

    const publicForumOverview = await http('/api/admin/forum/overview');
    record('forum operations overview requires authentication', publicForumOverview.status === 401, `status=${publicForumOverview.status}`);
    const forgedForumOverview = await http('/api/admin/forum/overview', { headers: auth(activeTokenClaimingSuperadmin) });
    record('forum operations overview rejects a forged privileged JWT role', forgedForumOverview.status === 403, `status=${forgedForumOverview.status}`);
    const moderatorForumOverview = await http('/api/admin/forum/overview', { headers: auth(moderatorToken) });
    const overviewBoardIds = (moderatorForumOverview.json?.data?.boards || []).map(board => Number(board.id));
    const assignedBoardIds = [Number(boardCreate.json?.data?.id), Number(targetBoardId)];
    record(
        'forum operations overview is usable and limited to assigned moderator boards',
        moderatorForumOverview.status === 200
            && moderatorForumOverview.json?.data?.scope === 'assigned'
            && overviewBoardIds.every(id => assignedBoardIds.includes(id))
            && moderatorForumOverview.json?.data?.trend?.length === 7
            && Number.isFinite(Number(moderatorForumOverview.json?.data?.metrics?.total_published)),
        `status=${moderatorForumOverview.status}; boards=${overviewBoardIds.join(',')}; error=${moderatorForumOverview.json?.msg || ''}`
    );
    const adminForumOverview = await http('/api/admin/forum/overview', { headers: auth(superadminToken) });
    record(
        'administrators receive a complete forum operations overview',
        adminForumOverview.status === 200 && adminForumOverview.json?.data?.scope === 'all' && adminForumOverview.json?.data?.trend?.length === 7,
        `status=${adminForumOverview.status}; scope=${adminForumOverview.json?.data?.scope}; error=${adminForumOverview.json?.msg || ''}`
    );

    const moveResult = await http(`/api/admin/posts/${forumPostId}/move`, {
        method: 'POST', headers: auth(moderatorToken), body: { board_id: targetBoardId, reason: 'move topic test' }
    });
    const movedPost = await Post.findByPk(forumPostId);
    record('scoped moderator can move a topic with audit reason', moveResult.status === 200 && Number(movedPost?.board_id) === Number(targetBoardId), `status=${moveResult.status}; board=${movedPost?.board_id}`);

    const mergeResult = await http(`/api/admin/posts/${forumPostId}/merge`, {
        method: 'POST', headers: auth(moderatorToken), body: { target_post_id: mergeTarget.id, reason: 'duplicate topic merge test' }
    });
    const [mergedCommentCount, migratedLike, migratedFavorite, migratedSubscription] = await Promise.all([
        Comment.count({ where: { post_id: mergeTarget.id, content: 'source reply' } }),
        Like.findOne({ where: { user_id: moderatorUser.id, post_id: mergeTarget.id } }),
        Favorite.findOne({ where: { user_id: moderatorUser.id, post_id: mergeTarget.id } }),
        PostSubscription.findOne({ where: { user_id: moderatorUser.id, post_id: mergeTarget.id } })
    ]);
    record('scoped moderator can safely merge topic data', mergeResult.status === 200 && mergedCommentCount === 1 && Boolean(migratedLike && migratedFavorite && migratedSubscription), `status=${mergeResult.status}; comments=${mergedCommentCount}`);
    const mergedRedirect = await http(`/api/posts/${forumPostId}`);
    record('merged topic keeps a public redirect target', mergedRedirect.status === 200 && Number(mergedRedirect.json?.data?.merged_into_post_id) === Number(mergeTarget.id), `status=${mergedRedirect.status}; target=${mergedRedirect.json?.data?.merged_into_post_id}`);

    const leaderboardBeforeReply = await http('/api/posts/forum/leaderboard?limit=10');
    const moderatorBeforeReply = await http(`/api/posts/forum/users/${moderatorUser.id}/reputation`);
    const initialReplyCount = Number(moderatorBeforeReply.json?.data?.replies_count || 0);
    const leaderboardEntry = leaderboardBeforeReply.json?.data?.list?.find(item => Number(item.user?.id) === Number(moderatorUser.id));
    record(
        'public forum leaderboard exposes ranked contribution without private fields',
        leaderboardBeforeReply.status === 200 && Boolean(leaderboardEntry) && Number(leaderboardEntry.rank) > 0 && !leaderboardBeforeReply.text.includes('@example.test'),
        `status=${leaderboardBeforeReply.status}; rank=${leaderboardEntry?.rank}; leakedEmail=${leaderboardBeforeReply.text.includes('@example.test')}`
    );
    record(
        'public user forum reputation returns contribution counters',
        moderatorBeforeReply.status === 200 && initialReplyCount >= 1 && Number(moderatorBeforeReply.json?.data?.contribution_score) >= 2,
        `status=${moderatorBeforeReply.status}; replies=${initialReplyCount}; score=${moderatorBeforeReply.json?.data?.contribution_score}`
    );
    const reputationReply = await http('/api/comments', {
        method: 'POST', headers: auth(moderatorToken), body: { post_id: mergeTarget.id, content: `@${adminUser.username} @${adminUser.username} reputation cache invalidation reply` }
    });
    const moderatorAfterReply = await http(`/api/posts/forum/users/${moderatorUser.id}/reputation`);
    record(
        'new forum reply invalidates reputation cache immediately',
        reputationReply.status === 200 && Number(moderatorAfterReply.json?.data?.replies_count) === initialReplyCount + 1,
        `create=${reputationReply.status}; error=${reputationReply.json?.msg || reputationReply.text}; before=${initialReplyCount}; after=${moderatorAfterReply.json?.data?.replies_count}`
    );
    const mentionNotifications = await Notification.count({ where: { user_id: adminUser.id, sender_id: moderatorUser.id, type: 'mention', related_id: mergeTarget.id, related_type: 'post' } });
    record('forum mentions notify each active user only once', reputationReply.status === 200 && mentionNotifications === 1, `create=${reputationReply.status}; notifications=${mentionNotifications}`);
    await mergeTarget.update({ tags: ['runtime-tag'] });
    const tagFilteredTopics = await http('/api/posts?tag=runtime-tag&pageSize=100');
    record('clickable forum tags have a working server-side filter', tagFilteredTopics.status === 200 && tagFilteredTopics.json?.data?.list?.some(item => Number(item.id) === Number(mergeTarget.id)), `status=${tagFilteredTopics.status}`);
    const unreadReply = await http('/api/comments', {
        method: 'POST', headers: auth(activeTokenClaimingSuperadmin), body: { post_id: mergeTarget.id, content: 'unread subscription cursor test' }
    });
    const subscriptionsBeforeRead = await http('/api/posts/subscriptions/mine?pageSize=100', { headers: auth(moderatorToken) });
    const unreadTopic = subscriptionsBeforeRead.json?.data?.topics?.find(item => Number(item.id) === Number(mergeTarget.id));
    record('forum subscriptions expose new replies as unread', unreadReply.status === 200 && unreadTopic?.has_unread === true, `reply=${unreadReply.status}; unread=${unreadTopic?.has_unread}`);
    const readSubscribedTopic = await http(`/api/posts/${mergeTarget.id}`, { headers: auth(moderatorToken) });
    const subscriptionsAfterRead = await http('/api/posts/subscriptions/mine?pageSize=100', { headers: auth(moderatorToken) });
    const readTopic = subscriptionsAfterRead.json?.data?.topics?.find(item => Number(item.id) === Number(mergeTarget.id));
    record('opening a subscribed topic clears its lightweight unread cursor', readSubscribedTopic.status === 200 && readTopic?.has_unread === false, `read=${readSubscribedTopic.status}; unread=${readTopic?.has_unread}`);
    record(
        'my forum center returns topics replies favorites and draft without extra endpoints',
        subscriptionsAfterRead.status === 200
            && Array.isArray(subscriptionsAfterRead.json?.data?.my_topics)
            && Array.isArray(subscriptionsAfterRead.json?.data?.my_replies)
            && Array.isArray(subscriptionsAfterRead.json?.data?.favorites)
            && Object.prototype.hasOwnProperty.call(subscriptionsAfterRead.json?.data || {}, 'draft'),
        `status=${subscriptionsAfterRead.status}`
    );
    const invalidReputationUser = await http('/api/posts/forum/users/not-a-number/reputation');
    record('forum reputation rejects invalid user ids without a server error', invalidReputationUser.status === 400, `status=${invalidReputationUser.status}`);

    const disabledMe = await http('/api/users/me', { headers: auth(disabledToken) });
    record('disabled user token is rejected', disabledMe.status === 403, `status=${disabledMe.status}`);

    const staleRoleAdmin = await http('/api/admin/stats', { headers: auth(activeTokenClaimingSuperadmin) });
    record('JWT role claim cannot override database role', staleRoleAdmin.status === 403, `status=${staleRoleAdmin.status}`);

    const impersonateSuperadmin = await http(`/api/admin/users/${superadminUser.id}/impersonate`, {
        method: 'POST',
        headers: auth(adminToken)
    });
    record('admin cannot impersonate superadmin', impersonateSuperadmin.status === 403, `status=${impersonateSuperadmin.status}`);

    const disableSuperadmin = await http(`/api/admin/users/${superadminUser.id}/status`, {
        method: 'PUT',
        headers: auth(adminToken),
        body: { status: 'disabled' }
    });
    record('admin cannot disable superadmin', disableSuperadmin.status === 403, `status=${disableSuperadmin.status}`);

    const resetSuperadminPassword = await http(`/api/admin/users/${superadminUser.id}/password`, {
        method: 'PUT',
        headers: auth(adminToken),
        body: { newPassword: 'new-password-123' }
    });
    record('admin cannot reset superadmin password', resetSuperadminPassword.status === 403, `status=${resetSuperadminPassword.status}`);

    const transferableWork = await Work.create({
        codemao_work_id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
        name: `${marker}_before_transfer`,
        user_id: activeUser.id,
        codemao_author_id: String(activeUser.id),
        codemao_author_name: activeUser.username,
        status: 'published'
    });
    created.workIds.push(transferableWork.id);
    const transferWorkResponse = await http(`/api/admin/works/${transferableWork.id}`, {
        method: 'PUT',
        headers: auth(adminToken),
        body: { name: `${marker}_after_transfer`, publisher_id: adminUser.id, _reason: 'security transfer test' }
    });
    await transferableWork.reload();
    await activeUser.reload();
    await adminUser.reload();
    record(
        'admin can change work name and publisher atomically',
        transferWorkResponse.status === 200
            && transferableWork.name === `${marker}_after_transfer`
            && Number(transferableWork.user_id) === Number(adminUser.id)
            && Number(activeUser.work_count) === 0
            && Number(adminUser.work_count) === 1,
        `status=${transferWorkResponse.status}; publisher=${transferableWork.user_id}; oldCount=${activeUser.work_count}; newCount=${adminUser.work_count}`
    );

    const pendingWork = await Work.create({
        codemao_work_id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
        name: `${marker}_pending_work`,
        user_id: activeUser.id,
        codemao_author_id: String(activeUser.id),
        codemao_author_name: activeUser.username,
        status: 'pending'
    });
    created.workIds.push(pendingWork.id);

    const publicPendingWork = await http(`/api/works/${pendingWork.codemao_work_id}`);
    record('public cannot read pending work detail', publicPendingWork.status === 404, `status=${publicPendingWork.status}`);

    const ownerPendingWork = await http(`/api/works/${pendingWork.codemao_work_id}`, { headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })) });
    record('owner can read own pending work detail', ownerPendingWork.status === 200, `status=${ownerPendingWork.status}`);

    const likePendingWork = await http(`/api/works/${pendingWork.codemao_work_id}/like`, {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' }))
    });
    record('user cannot like pending work', likePendingWork.status === 404, `status=${likePendingWork.status}`);

    const favoritePendingWork = await http('/api/favorites', {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })),
        body: { workId: pendingWork.id }
    });
    record('user cannot favorite pending work', favoritePendingWork.status === 404, `status=${favoritePendingWork.status}`);

    const commentPendingWork = await http('/api/comments', {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })),
        body: { content: 'blocked', work_id: pendingWork.id }
    });
    record('user cannot comment on pending work', commentPendingWork.status === 404, `status=${commentPendingWork.status}`);

    const reportPendingWork = await http('/api/reports', {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })),
        body: { type: 'work', target_id: pendingWork.id, reason: 'blocked' }
    });
    record('user cannot report hidden work by id oracle', reportPendingWork.status === 404, `status=${reportPendingWork.status}`);

    const missingCodemaoImport = await http(`/api/works/import/${Date.now()}123`, { method: 'POST' });
    record('anonymous codemao import is blocked before external fetch', missingCodemaoImport.status === 401, `status=${missingCodemaoImport.status}`);

    const hiddenPost = await Post.create({
        title: `${marker}_hidden_post`,
        content: 'hidden',
        user_id: activeUser.id,
        status: 'hidden'
    });
    created.postIds.push(hiddenPost.id);

    const publicForumProfilePosts = await http(`/api/posts/forum/users/${activeUser.id}/posts?page=1&pageSize=100`);
    record(
        'public forum profile lists published topics but hides non-public topics',
        publicForumProfilePosts.status === 200 && publicForumProfilePosts.text.includes(`${marker}_merge_target`) && !publicForumProfilePosts.text.includes(`${marker}_hidden_post`),
        `status=${publicForumProfilePosts.status}; published=${publicForumProfilePosts.text.includes(`${marker}_merge_target`)}; hidden=${publicForumProfilePosts.text.includes(`${marker}_hidden_post`)}`
    );
    const disabledForumProfilePosts = await http(`/api/posts/forum/users/${disabledUser.id}/posts`);
    record('disabled users do not expose a public forum profile', disabledForumProfilePosts.status === 404, `status=${disabledForumProfilePosts.status}`);

    const publicHiddenPost = await http(`/api/posts/${hiddenPost.id}`);
    record('public cannot read hidden post detail', publicHiddenPost.status === 404, `status=${publicHiddenPost.status}`);

    const likeHiddenPost = await http(`/api/posts/${hiddenPost.id}/like`, {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' }))
    });
    record('user cannot like hidden post', likeHiddenPost.status === 404, `status=${likeHiddenPost.status}`);

    const commentHiddenPost = await http('/api/comments', {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })),
        body: { content: 'blocked', post_id: hiddenPost.id }
    });
    record('user cannot comment on hidden post', commentHiddenPost.status === 404, `status=${commentHiddenPost.status}`);

    const reportHiddenPost = await http('/api/reports', {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })),
        body: { type: 'post', target_id: hiddenPost.id, reason: 'blocked' }
    });
    record('user cannot report hidden post by id oracle', reportHiddenPost.status === 404, `status=${reportHiddenPost.status}`);

    const studio = await Studio.create({
        name: `${marker}_studio`,
        owner_id: activeUser.id,
        is_public: true,
        status: 'active'
    });
    created.studioIds.push(studio.id);

    const studioMember = await StudioMember.create({
        studio_id: studio.id,
        user_id: activeUser.id,
        role: 'owner',
        status: 'active'
    });
    created.studioMemberIds.push(studioMember.id);

    const privateStudio = await Studio.create({
        name: `${marker}_private_studio`,
        owner_id: activeUser.id,
        is_public: false,
        status: 'active'
    });
    created.studioIds.push(privateStudio.id);

    const publicPrivateStudioDetail = await http(`/api/studios/${privateStudio.id}`);
    record('public cannot read private studio detail', publicPrivateStudioDetail.status === 404, `status=${publicPrivateStudioDetail.status}`);

    const ownerPrivateStudioDetail = await http(`/api/studios/${privateStudio.id}`, {
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' }))
    });
    record('owner can read private studio detail', ownerPrivateStudioDetail.status === 200, `status=${ownerPrivateStudioDetail.status}`);

    const publicPrivateStudioWorks = await http(`/api/studios/${privateStudio.id}/works`);
    record('public cannot read private studio works', publicPrivateStudioWorks.status === 404, `status=${publicPrivateStudioWorks.status}`);

    const publicStudioList = await http(`/api/studios?keyword=${encodeURIComponent(marker)}`);
    record(
        'public studio list hides private studios',
        publicStudioList.status === 200 && !publicStudioList.text.includes(`${marker}_private_studio`),
        `status=${publicStudioList.status}; containsPrivate=${publicStudioList.text.includes(`${marker}_private_studio`)}`
    );

    const joinPrivateStudio = await http(`/api/studios/${privateStudio.id}/join`, {
        method: 'POST',
        headers: auth(adminToken)
    });
    record('user cannot join private studio by id', joinPrivateStudio.status === 404, `status=${joinPrivateStudio.status}`);

    const submitPendingWork = await http(`/api/studios/${studio.id}/works`, {
        method: 'POST',
        headers: auth(signJwt({ id: activeUser.id, username: activeUser.username, role: 'user' })),
        body: { workId: pendingWork.id }
    });
    record('user cannot submit pending work to studio', submitPendingWork.status === 404, `status=${submitPendingWork.status}`);

    const studioWork = await StudioWork.create({
        studio_id: studio.id,
        work_id: pendingWork.id,
        user_id: activeUser.id,
        status: 'pending'
    });
    created.studioWorkIds.push(studioWork.id);
    // 同一工作室与作品只能有一条关联；先移除待审夹具，再验证已批准但源作品隐藏的场景。
    await studioWork.destroy();

    const approvedHiddenStudioWork = await StudioWork.create({
        studio_id: studio.id,
        work_id: pendingWork.id,
        user_id: activeUser.id,
        status: 'approved'
    });
    created.studioWorkIds.push(approvedHiddenStudioWork.id);

    const publicStudioWorks = await http(`/api/studios/${studio.id}/works?status=pending`);
    record(
        'public studio work list ignores status override and hidden works',
        publicStudioWorks.status === 200 && !publicStudioWorks.text.includes(`${marker}_pending_work`),
        `status=${publicStudioWorks.status}; containsPending=${publicStudioWorks.text.includes(`${marker}_pending_work`)}`
    );

    const badSqlitePath = await http('/api/admin/db-migration/test-connection', {
        method: 'POST',
        headers: auth(superadminToken),
        body: { dbType: 'sqlite', config: { path: '../app.js' } }
    });
    record('db migration rejects sqlite path escape with valid superadmin', badSqlitePath.status !== 200, `status=${badSqlitePath.status}`);

    if (failures.length > 0) {
        console.error('\nTargeted security test failures:');
        for (const failure of failures) {
            console.error(`- ${failure}`);
        }
        process.exitCode = 1;
    } else {
        console.log(`\nTargeted security tests passed against ${baseUrl}.`);
    }
}

main()
    .catch((error) => {
        console.error('Targeted security test crashed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await cleanup();
        } finally {
            await sequelize.close();
        }
    });
