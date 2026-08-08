const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const { Op } = require('sequelize');
const config = require('./config');
const { exchangeTicket, parseSession, requireSession } = require('./auth');
const { connectReplayStore } = require('./replayStore');
const { acceptStatusPush, assertAccountActive } = require('./accountStatus');
const { sequelize, UserProfile, Conversation, ConversationMember, Message, Group, Image, AdminAudit, Report, connectDatabase } = require('./database');
const { uploadImage } = require('./imageHost');
const { sceneConfig, registerCaptcha, validateCaptcha, requireCaptcha } = require('./captcha');

const app = express();
const socketsByUser = new Map();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin(origin, cb) {
  if (!origin || !config.publicOrigins.length || config.publicOrigins.includes(origin)) return cb(null, true);
  cb(new Error('Origin is not allowed'));
}, credentials: true }));
app.use(express.json({ limit: '64kb' }));

const ok = (res, data, msg = 'ok') => res.json({ code: 200, msg, data });
const fail = (res, status, msg) => res.status(status).json({ code: status, msg, data: null });

app.get('/health', async (req, res) => {
  try { await sequelize.authenticate(); ok(res, { status: 'healthy', database: 'up', version: '0.1.0' }); }
  catch { fail(res, 503, 'database unavailable'); }
});

app.post('/api/internal/account-status', async (req, res) => {
  try {
    const { userId, state } = await acceptStatusPush(req.body?.token);
    if (state.status !== 'active') {
      for (const socket of socketsByUser.get(userId) || []) socket.close(4001, 'account disabled');
    }
    ok(res, { user_id: userId, status: state.status }, '账号状态已同步');
  } catch (error) { fail(res, error.statusCode || 401, error.message); }
});

app.post('/api/auth/sso/exchange', async (req, res) => {
  try {
    const { session, user, peer } = await exchangeTicket(String(req.body?.ticket || ''), req);
    await UserProfile.upsert({ id: user.id, username: user.username, nickname: user.nickname || null, avatar: user.avatar || null, codemao_user_id: user.codemao_user_id || null, role: user.role || 'user' });
    if (peer?.id) await UserProfile.upsert({ id: Number(peer.id), username: peer.username, nickname: peer.nickname || null, avatar: peer.avatar || null, codemao_user_id: peer.codemao_user_id || null, role: peer.role || 'user' });
    const secure = config.production ? '; Secure' : '';
    res.append('Set-Cookie', `im_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`);
    ok(res, user, '登录成功');
  } catch (error) {
    const status = error.statusCode || 401;
    res.status(status).json({ code: status, msg: error.message || 'SSO 登录失败', data: error.publicData || null });
  }
});

app.post('/api/auth/logout', requireSession, (req, res) => {
  const secure = config.production ? '; Secure' : '';
  res.append('Set-Cookie', `im_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  ok(res, null, '已退出');
});
app.get('/api/me', requireSession, (req, res) => ok(res, req.user));
app.get('/api/captcha/config', requireSession, async (req, res, next) => {
  try { ok(res, await sceneConfig(req.user, String(req.query.scene || ''))); } catch (error) { next(error); }
});
app.get('/api/captcha/register', requireSession, async (req, res, next) => {
  try { ok(res, await registerCaptcha(req.user, String(req.query.scene || ''))); } catch (error) { next(error); }
});
app.post('/api/captcha/validate', requireSession, async (req, res, next) => {
  try { ok(res, await validateCaptcha(req.user, String(req.body?.scene || ''), req.body)); } catch (error) { next(error); }
});

const publicUser = value => value ? {
  id: Number(value.id), username: value.username, nickname: value.nickname,
  avatar: value.avatar, codemao_user_id: value.codemao_user_id, role: value.role
} : null;
const usersById = async ids => {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(Number))];
  if (!uniqueIds.length) return new Map();
  const users = await UserProfile.findAll({ where: { id: { [Op.in]: uniqueIds } } });
  return new Map(users.map(user => [Number(user.id), publicUser(user)]));
};
const enrichMessages = async rows => {
  const profiles = await usersById(rows.map(row => row.sender_id));
  return rows.map(row => {
    const data = row.toJSON();
    if (data.status === 'hidden') {
      data.content = '该消息因违规已被管理员删除';
      data.type = 'system';
    }
    return { ...data, sender: profiles.get(Number(row.sender_id)) || null };
  });
};

const requireImAdmin = (req, res) => ['admin', 'superadmin'].includes(req.user.role)
  ? true : (fail(res, 403, '无 IM 管理权限'), false);

async function communityRequest(user, method, route, data) {
  const publicBase = String(user.community_url || '').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(publicBase) || !user.status_token) throw Object.assign(new Error('编程狗管理凭证不可用，请重新从编程狗进入'), { statusCode: 401 });
  let lastError;
  for (const base of [...new Set([config.communityInternalUrl, publicBase])]) {
    try {
      const response = await axios({ method, url: `${base}${route}`, data, timeout: 8000, maxRedirects: 0,
        headers: { Authorization: `Bearer ${user.status_token}`, Host: new URL(publicBase).host }, validateStatus: () => true });
      if (response.status !== 200 || response.data?.code !== 200) throw Object.assign(new Error(response.data?.msg || '编程狗拒绝执行该操作'), { statusCode: response.status || 502 });
      return response.data.data;
    } catch (error) { lastError = error; }
  }
  throw Object.assign(new Error(lastError?.message || '无法连接编程狗'), { statusCode: lastError?.statusCode || 502 });
}

async function enrichReports(rows) {
  const messages = await Promise.all(rows.map(row => Message.findOne({ where: { id: row.message_id } })));
  const profiles = await usersById(rows.flatMap((row, index) => [row.reporter_id, messages[index]?.sender_id, row.resolved_by]));
  return rows.map((row, index) => ({ ...row.toJSON(), message: messages[index]?.toJSON() || null,
    reporter: profiles.get(Number(row.reporter_id)) || null,
    reported_user: profiles.get(Number(messages[index]?.sender_id)) || null,
    handler: profiles.get(Number(row.resolved_by)) || null }));
}

const imageTempDir = path.join(config.root, 'data/image-temp');
fs.mkdirSync(imageTempDir, { recursive: true });
const imageUpload = multer({ dest: imageTempDir, limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) });
app.post('/api/images', requireSession, imageUpload.single('image'), async (req, res, next) => {
  if (!req.file) return fail(res, 400, '请选择不超过 5 MB 的 JPG、PNG、WebP 或 GIF 图片');
  try {
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
    const url = await uploadImage(req.file);
    const image = await Image.create({ user_id: req.user.id, url, mime: req.file.mimetype, size: req.file.size, sha256, status: 'ready' });
    ok(res, image, '图片已上传到编程狗现有图床');
  } catch (error) { next(error); }
  finally { fs.promises.unlink(req.file.path).catch(() => {}); }
});

app.get('/api/conversations', requireSession, async (req, res, next) => {
  try {
    const memberships = await ConversationMember.findAll({ where: { user_id: req.user.id, state: 'active' }, order: [['updated_at', 'DESC']] });
    const ids = memberships.map(item => item.conversation_id);
    const conversations = ids.length ? await Conversation.findAll({ where: { id: { [Op.in]: ids } } }) : [];
    const byId = new Map(conversations.map(item => [String(item.id), item.toJSON()]));
    const groups = await Promise.all(conversations.filter(item => item.type === 'group').map(item => Group.findOne({ where: { conversation_id: item.id } })));
    const groupById = new Map(groups.filter(Boolean).map(item => [String(item.conversation_id), item.toJSON()]));
    const peerIds = conversations.filter(item => item.type === 'direct').map(item => String(item.direct_key).split(':').map(Number).find(id => id !== Number(req.user.id)));
    const peers = await usersById(peerIds);
    const rows = await Promise.all(memberships.map(async item => {
      const conversation = byId.get(String(item.conversation_id));
      if (!conversation) return null;
      const peerId = conversation.type === 'direct' ? String(conversation.direct_key).split(':').map(Number).find(id => id !== Number(req.user.id)) : null;
      const peer = peers.get(Number(peerId)) || null;
      const latestMessage = Number(conversation.last_sequence) > 0
        ? await Message.findOne({ where: { conversation_id: conversation.id, sequence: conversation.last_sequence } })
        : null;
      return {
        ...conversation,
        title: conversation.type === 'group' ? groupById.get(String(conversation.id))?.name : (peer?.nickname || peer?.username || `用户 ${peerId}`),
        peer_id: peerId,
        peer,
        group: groupById.get(String(conversation.id)),
        membership: item.toJSON(),
        latest_message: latestMessage ? {
          id: latestMessage.id,
          sequence: latestMessage.sequence,
          sender_id: latestMessage.sender_id,
          type: latestMessage.type,
          content: latestMessage.status === 'hidden' ? '该消息已被删除' : latestMessage.content,
          status: latestMessage.status,
          created_at: latestMessage.created_at
        } : null
      };
    }));
    ok(res, rows.filter(Boolean).sort((a, b) => new Date(b.latest_message?.created_at || b.updated_at || 0) - new Date(a.latest_message?.created_at || a.updated_at || 0)));
  } catch (error) { next(error); }
});

app.post('/api/search', requireSession, requireCaptcha('im_search'), async (req, res, next) => {
  try {
    const keyword = String(req.body?.keyword || '').trim().slice(0, 50);
    if (!keyword) return ok(res, { users: [], groups: [] });
    const where = { [Op.or]: [
      { username: { [Op.like]: `%${keyword}%` } },
      { nickname: { [Op.like]: `%${keyword}%` } },
      { codemao_user_id: { [Op.like]: `%${keyword}%` } }
    ] };
    const groupWhere = { [Op.or]: [{ name: { [Op.like]: `%${keyword}%` } }] };
    if (/^\d+$/.test(keyword)) groupWhere[Op.or].push({ conversation_id: Number(keyword) });
    const [users, groups] = await Promise.all([
      UserProfile.findAll({ where, order: [['updated_at', 'DESC']], limit: 20 }),
      Group.findAll({ where: groupWhere, order: [['updated_at', 'DESC']], limit: 20 })
    ]);
    const groupRows = await Promise.all(groups.map(async group => ({
      conversation_id: Number(group.conversation_id),
      name: group.name,
      member_count: await ConversationMember.count({ where: { conversation_id: group.conversation_id, state: 'active' } }),
      member_limit: Number(group.member_limit)
    })));
    ok(res, {
      users: users.filter(user => Number(user.id) !== Number(req.user.id)).map(publicUser),
      groups: groupRows
    });
  } catch (error) { next(error); }
});

app.get('/api/conversation-requests', requireSession, async (req, res, next) => {
  try {
    const memberships = await ConversationMember.findAll({ where: { user_id: req.user.id, state: 'pending' }, order: [['created_at', 'DESC']] });
    const rows = await Promise.all(memberships.map(async membership => {
      const conversation = await Conversation.findByPk(membership.conversation_id);
      if (!conversation || conversation.type !== 'direct') return null;
      const fromUserId = String(conversation.direct_key).split(':').map(Number).find(id => id !== Number(req.user.id));
      const profile = await UserProfile.findByPk(fromUserId);
      return { conversation_id: conversation.id, from_user_id: fromUserId, from_user: publicUser(profile), created_at: membership.created_at };
    }));
    ok(res, rows.filter(Boolean));
  } catch (error) { next(error); }
});

app.post('/api/conversation-requests/:id', requireSession, async (req, res, next) => {
  try {
    const membership = await ConversationMember.findOne({ where: { conversation_id: req.params.id, user_id: req.user.id, state: 'pending' } });
    if (!membership) return fail(res, 404, '会话申请不存在或已处理');
    const action = req.body?.action;
    if (!['accept', 'reject'].includes(action)) return fail(res, 400, 'action 必须是 accept 或 reject');
    membership.state = action === 'accept' ? 'active' : 'removed';
    await membership.save();
    ok(res, { conversation_id: membership.conversation_id, state: membership.state }, action === 'accept' ? '已接受私聊申请' : '已拒绝私聊申请');
  } catch (error) { next(error); }
});

app.post('/api/conversations/direct', requireSession, async (req, res, next) => {
  try {
    const peerId = Number(req.body?.user_id);
    if (!Number.isInteger(peerId) || peerId <= 0 || peerId === req.user.id) return fail(res, 400, '无效的私聊用户');
    const pair = [req.user.id, peerId].sort((a, b) => a - b);
    const directKey = `${pair[0]}:${pair[1]}`;
    const [conversation] = await Conversation.findOrCreate({ where: { direct_key: directKey }, defaults: { type: 'direct', direct_key: directKey } });
    await Promise.all(pair.map(userId => ConversationMember.findOrCreate({
      where: { conversation_id: conversation.id, user_id: userId },
      defaults: { role: 'member', state: userId === req.user.id ? 'active' : 'pending' }
    })));
    ok(res, conversation, '会话已创建');
  } catch (error) { next(error); }
});

app.post('/api/conversations/group', requireSession, requireCaptcha('im_create_group'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 50) return fail(res, 400, '群名称长度应为 1-50 个字符');
    const conversation = await sequelize.transaction(async transaction => {
      const row = await Conversation.create({ type: 'group' }, { transaction });
      await ConversationMember.create({ conversation_id: row.id, user_id: req.user.id, role: 'owner', state: 'active' }, { transaction });
      await Group.create({ conversation_id: row.id, name, owner_id: req.user.id, member_limit: config.groupDefaultLimit }, { transaction });
      return row;
    });
    ok(res, { ...conversation.toJSON(), name, member_limit: config.groupDefaultLimit }, '群聊已创建');
  } catch (error) { next(error); }
});

async function groupAndActor(conversationId, userId) {
  const [group, actor] = await Promise.all([
    Group.findOne({ where: { conversation_id: conversationId } }),
    ConversationMember.findOne({ where: { conversation_id: conversationId, user_id: userId, state: 'active' } })
  ]);
  return { group, actor };
}

app.get('/api/groups/:id', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在或你不是群成员');
    const members = await ConversationMember.findAll({ where: { conversation_id: req.params.id, state: 'active' }, order: [['created_at', 'ASC']] });
    // 附带成员用户资料，供前端群管理面板展示昵称/头像
    const profiles = await usersById(members.map(item => item.user_id));
    ok(res, {
      ...group.toJSON(),
      member_count: members.length,
      my_role: actor.role,
      members: members.map(item => ({ ...item.toJSON(), user: profiles.get(Number(item.user_id)) || null }))
    });
  } catch (error) { next(error); }
});

// 转让群主：仅群主可将群主身份转让给群内任一活跃成员，转让后原群主降为管理员
app.post('/api/groups/:id/transfer', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在');
    if (actor.role !== 'owner') return fail(res, 403, '只有群主可以转让群聊');
    const userId = Number(req.body?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, '无效用户 ID');
    if (Number(userId) === Number(actor.user_id)) return fail(res, 400, '不能转让给自己');
    const target = await ConversationMember.findOne({ where: { conversation_id: req.params.id, user_id: userId, state: 'active' } });
    if (!target) return fail(res, 404, '目标成员不在该群聊中');
    // 事务内完成角色互换与群主记录更新，任一步失败整体回滚
    await sequelize.transaction(async transaction => {
      actor.role = 'admin'; await actor.save({ transaction });
      target.role = 'owner'; await target.save({ transaction });
      group.owner_id = Number(userId); await group.save({ transaction });
    });
    broadcastConversation(req.params.id, 'member.updated', { user_id: Number(actor.user_id), role: 'admin' });
    broadcastConversation(req.params.id, 'member.updated', { user_id: Number(userId), role: 'owner' });
    broadcastConversation(req.params.id, 'conversation.updated', group.toJSON());
    ok(res, { owner_id: Number(userId) }, '群主已转让');
  } catch (error) { next(error); }
});

// 解散群聊：仅群主可解散；全员移除成员关系并删除群资料，群聊从此不可加入
app.post('/api/groups/:id/dissolve', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在');
    if (actor.role !== 'owner') return fail(res, 403, '只有群主可以解散群聊');
    // 状态变更前先取出全部 active 成员：
    // 解散后成员都是 removed，broadcastConversation 只能发给 active 名单，会导致在线群员收不到通知
    const beforeMembers = await ConversationMember.findAll({ where: { conversation_id: req.params.id, state: 'active' }, attributes: ['user_id'] });
    const memberUserIds = beforeMembers.map(item => Number(item.user_id));
    await sequelize.transaction(async transaction => {
      // 全员移出（消息历史保留但会话不再出现在任何成员的列表中）
      await ConversationMember.update({ state: 'removed' }, { where: { conversation_id: req.params.id, state: 'active' }, transaction });
      // 删除群资料，后续加入/查询群都会 404
      await Group.destroy({ where: { conversation_id: req.params.id }, transaction });
    });
    // 用预先保存的成员列表直接推送，确保每个在线成员（含发起者）都收到解散通知
    broadcastUsers(memberUserIds, 'conversation.dissolved', { conversation_id: Number(req.params.id) });
    ok(res, null, '群聊已解散');
  } catch (error) { next(error); }
});

app.post('/api/groups/:id/join', requireSession, async (req, res, next) => {
  try {
    const group = await Group.findOne({ where: { conversation_id: req.params.id } });
    if (!group) return fail(res, 404, '群聊不存在');
    const members = await ConversationMember.findAll({ where: { conversation_id: req.params.id, state: 'active' } });
    if (members.length >= Number(group.member_limit)) return fail(res, 409, `群成员已达到 ${group.member_limit} 人上限`);
    const existing = await ConversationMember.findOne({ where: { conversation_id: req.params.id, user_id: req.user.id } });
    if (existing) { existing.state = 'active'; if (existing.role !== 'owner') existing.role = 'member'; await existing.save(); }
    else await ConversationMember.create({ conversation_id: req.params.id, user_id: req.user.id, role: 'member', state: 'active' });
    ok(res, { conversation_id: Number(req.params.id), name: group.name }, '已加入群聊');
  } catch (error) { next(error); }
});

app.post('/api/groups/:id/members', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在');
    if (!['owner', 'admin'].includes(actor.role)) return fail(res, 403, '只有群主或管理员可以邀请成员');
    const userId = Number(req.body?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, '无效用户 ID');
    const members = await ConversationMember.findAll({ where: { conversation_id: req.params.id, state: 'active' } });
    if (members.length >= Number(group.member_limit)) return fail(res, 409, `群成员已达到 ${group.member_limit} 人上限`);
    const existing = await ConversationMember.findOne({ where: { conversation_id: req.params.id, user_id: userId } });
    if (existing) { existing.state = 'active'; existing.role = existing.role === 'owner' ? 'owner' : 'member'; await existing.save(); }
    else await ConversationMember.create({ conversation_id: req.params.id, user_id: userId, role: 'member', state: 'active' });
    broadcastConversation(req.params.id, 'member.updated', { user_id: userId, state: 'active' });
    ok(res, { user_id: userId }, '成员已加入群聊');
  } catch (error) { next(error); }
});

app.delete('/api/groups/:id/members/:userId', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在');
    const target = await ConversationMember.findOne({ where: { conversation_id: req.params.id, user_id: req.params.userId, state: 'active' } });
    if (!target) return fail(res, 404, '成员不存在');
    const selfLeave = Number(req.params.userId) === Number(req.user.id);
    if (!selfLeave && !['owner', 'admin'].includes(actor.role)) return fail(res, 403, '没有移除成员权限');
    if (target.role === 'owner') return fail(res, 409, '群主必须先转让群聊，不能直接退出或被移除');
    if (actor.role === 'admin' && target.role === 'admin') return fail(res, 403, '管理员不能移除其他管理员');
    target.state = selfLeave ? 'left' : 'removed'; await target.save();
    const targetUserId = Number(req.params.userId);
    // 通知仍在群内的 active 成员
    broadcastConversation(req.params.id, 'member.updated', { user_id: targetUserId, state: target.state });
    // 被移除者本人（非主动退出）也要收到通知立即关闭会话，否则其前端会一直残留该群
    if (!selfLeave) broadcastUsers([targetUserId], 'member.kicked', { conversation_id: Number(req.params.id), user_id: targetUserId, state: target.state });
    ok(res, null, selfLeave ? '已退出群聊' : '成员已移除');
  } catch (error) { next(error); }
});

app.patch('/api/groups/:id/members/:userId', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在');
    if (actor.role !== 'owner') return fail(res, 403, '只有群主可以设置管理员');
    const target = await ConversationMember.findOne({ where: { conversation_id: req.params.id, user_id: req.params.userId, state: 'active' } });
    if (!target || target.role === 'owner') return fail(res, 400, '目标成员不可修改');
    const role = req.body?.role; if (!['admin', 'member'].includes(role)) return fail(res, 400, 'role 必须是 admin 或 member');
    target.role = role; await target.save();
    broadcastConversation(req.params.id, 'member.updated', { user_id: Number(req.params.userId), role });
    ok(res, target, role === 'admin' ? '已设为群管理员' : '已取消群管理员');
  } catch (error) { next(error); }
});

app.patch('/api/groups/:id', requireSession, async (req, res, next) => {
  try {
    const { group, actor } = await groupAndActor(req.params.id, req.user.id);
    if (!group || !actor) return fail(res, 404, '群聊不存在');
    if (req.body?.name !== undefined) {
      if (!['owner', 'admin'].includes(actor.role)) return fail(res, 403, '没有修改群资料权限');
      const name = String(req.body.name).trim(); if (!name || name.length > 50) return fail(res, 400, '群名称长度应为 1-50 个字符'); group.name = name;
    }
    if (req.body?.member_limit !== undefined) {
      if (!['admin', 'superadmin'].includes(req.user.role)) return fail(res, 403, '只有编程狗管理员可以设置群容量例外');
      const reason = String(req.body.reason || '').trim(); if (reason.length < 2) return fail(res, 400, '设置容量例外必须填写至少 2 个字符的原因');
      const limit = Number(req.body.member_limit); if (!Number.isInteger(limit) || limit < config.groupDefaultLimit || limit > config.groupHardLimit) return fail(res, 400, `群容量必须在 ${config.groupDefaultLimit}-${config.groupHardLimit} 之间`);
      const oldLimit = Number(group.member_limit); group.member_limit = limit;
      await AdminAudit.create({ admin_id: req.user.id, action: 'group.member_limit.update', reason, filters: { conversation_id: Number(req.params.id), old_limit: oldLimit, new_limit: limit }, source_ip: req.ip });
    }
    await group.save(); broadcastConversation(req.params.id, 'conversation.updated', group.toJSON()); ok(res, group, '群资料已更新');
  } catch (error) { next(error); }
});

async function requireMember(userId, conversationId) {
  return ConversationMember.findOne({ where: { user_id: userId, conversation_id: conversationId, state: 'active' } });
}

app.get('/api/conversations/:id/messages', requireSession, async (req, res, next) => {
  try {
    if (!await requireMember(req.user.id, req.params.id)) return fail(res, 403, '你不在该会话中');
    const after = Math.max(0, Number(req.query.after_sequence || 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const rows = await Message.findAll({ where: { conversation_id: req.params.id, sequence: { [Op.gt]: after } }, order: [['sequence', 'ASC']], limit });
    ok(res, await enrichMessages(rows));
  } catch (error) { next(error); }
});

async function createMessage(user, input) {
  const conversationId = Number(input.conversation_id);
  if (!await requireMember(user.id, conversationId)) {
    const error = new Error('你不在该会话中'); error.statusCode = 403; throw error;
  }
  const type = input.type === 'image' ? 'image' : 'text';
  let content = String(input.content || '').trim();
  let image = null;
  if (type === 'image') {
    image = await Image.findOne({ where: { id: Number(input.image_id), user_id: user.id, status: 'ready' } });
    if (!image) { const error = new Error('图片不存在、已使用或无权使用'); error.statusCode = 400; throw error; }
    content = JSON.stringify({ image_id: image.id, url: image.url, mime: image.mime, size: image.size });
  }
  if (!content || content.length > 10000) {
    const error = new Error('消息长度应为 1-10000 个字符'); error.statusCode = 400; throw error;
  }
  const clientId = String(input.client_message_id || crypto.randomUUID());
  const existing = await Message.findOne({ where: { sender_id: user.id, client_message_id: clientId } });
  if (existing) return existing;
  return sequelize.transaction(async transaction => {
    const conversation = await Conversation.findByPk(conversationId, { transaction, lock: transaction.LOCK.UPDATE });
    const sequence = Number(conversation.last_sequence) + 1;
    conversation.last_sequence = sequence;
    await conversation.save({ transaction });
    const message = await Message.create({ conversation_id: conversationId, sequence, sender_id: user.id, client_message_id: clientId, type, content }, { transaction });
    if (image) { image.status = 'used'; await image.save({ transaction }); }
    return message;
  });
}

app.post('/api/reports', requireSession, async (req, res, next) => {
  try {
    const messageId = Number(req.body?.message_id), reason = String(req.body?.reason || '').trim();
    if (!Number.isInteger(messageId) || messageId <= 0 || reason.length < 2 || reason.length > 500) return fail(res, 400, '请选择消息并填写 2-500 字举报原因');
    const message = await Message.findOne({ where: { id: messageId } });
    if (!message || !await requireMember(req.user.id, message.conversation_id)) return fail(res, 404, '消息不存在');
    if (Number(message.sender_id) === Number(req.user.id)) return fail(res, 400, '不能举报自己的消息');
    const existing = await Report.findOne({ where: { reporter_id: req.user.id, message_id: messageId } });
    if (existing) return fail(res, 409, '你已举报过这条消息');
    const report = await Report.create({ reporter_id: req.user.id, message_id: messageId, conversation_id: message.conversation_id, reason, status: 'pending' });
    ok(res, report, '举报已提交');
  } catch (error) { next(error); }
});

app.post('/api/messages', requireSession, requireCaptcha('im_message'), async (req, res, next) => {
  try { const message = await createMessage(req.user, req.body || {}); const [data] = await enrichMessages([message]); broadcastConversation(message.conversation_id, 'message.new', data); ok(res, data, '消息已发送'); }
  catch (error) { next(error); }
});

app.get('/api/admin/dashboard', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [users, conversations, groups, messages, todayMessages, pendingReports, audits] = await Promise.all([
      UserProfile.count(), Conversation.count(), Group.count(), Message.count(),
      Message.count({ where: { created_at: { [Op.gte]: today } } }),
      Report.count({ where: { status: 'pending' } }), AdminAudit.count()
    ]);
    const onlineUsers = [...socketsByUser.values()].filter(set => [...set].some(socket => socket.readyState === socket.OPEN)).length;
    const recentReports = await Report.findAll({ order: [['created_at', 'DESC']], limit: 6 });
    ok(res, { users, conversations, groups, messages, today_messages: todayMessages, pending_reports: pendingReports,
      online_users: onlineUsers, audit_logs: audits, recent_reports: await enrichReports(recentReports) });
  } catch (error) { next(error); }
});

app.get('/api/admin/users', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const keyword = String(req.query.keyword || '').trim().toLowerCase();
    const profiles = await UserProfile.findAll({ order: [['updated_at', 'DESC']], limit: 500 });
    const filtered = profiles.filter(profile => !keyword || [profile.id, profile.username, profile.nickname, profile.codemao_user_id]
      .some(value => String(value || '').toLowerCase().includes(keyword))).slice(0, 100);
    const rows = await Promise.all(filtered.map(async profile => {
      const [memberships, messageCount] = await Promise.all([
        ConversationMember.count({ where: { user_id: profile.id, state: 'active' } }),
        Message.count({ where: { sender_id: profile.id } })
      ]);
      return { ...publicUser(profile), conversation_count: memberships, message_count: messageCount, updated_at: profile.updated_at };
    }));
    ok(res, rows);
  } catch (error) { next(error); }
});

app.get('/api/admin/users/:id', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const user = await UserProfile.findByPk(Number(req.params.id));
    if (!user) return fail(res, 404, 'IM 用户不存在');
    const memberships = await ConversationMember.findAll({ where: { user_id: user.id }, order: [['updated_at', 'DESC']], limit: 100 });
    const recentMessages = await Message.findAll({ where: { sender_id: user.id }, order: [['created_at', 'DESC']], limit: 20 });
    const messageIds = recentMessages.map(item => Number(item.id));
    const reports = messageIds.length ? await Report.findAll({ where: { message_id: { [Op.in]: messageIds } }, order: [['created_at', 'DESC']], limit: 20 }) : [];
    ok(res, { ...publicUser(user), updated_at: user.updated_at, memberships: memberships.map(item => item.toJSON()),
      message_count: await Message.count({ where: { sender_id: user.id } }), reports_received: reports.length });
  } catch (error) { next(error); }
});

app.get('/api/admin/conversations', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const type = String(req.query.type || 'all');
    const where = ['direct', 'group'].includes(type) ? { type } : {};
    const conversations = await Conversation.findAll({ where, order: [['updated_at', 'DESC']], limit: 100 });
    const groups = await Group.findAll();
    const groupMap = new Map(groups.map(group => [Number(group.conversation_id), group]));
    const rows = await Promise.all(conversations.map(async conversation => {
      const members = await ConversationMember.findAll({ where: { conversation_id: conversation.id, state: 'active' } });
      const profiles = await usersById(members.map(member => member.user_id));
      const group = groupMap.get(Number(conversation.id));
      return { ...conversation.toJSON(), name: group?.name || null, member_limit: group?.member_limit || null,
        member_count: members.length, members: members.slice(0, 8).map(member => profiles.get(Number(member.user_id))).filter(Boolean) };
    }));
    ok(res, rows);
  } catch (error) { next(error); }
});

app.get('/api/admin/audits', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const action = String(req.query.action || '').trim();
    const where = action ? { action } : {};
    const rows = await AdminAudit.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
    const profiles = await usersById(rows.map(row => row.admin_id));
    ok(res, rows.map(row => ({ ...row.toJSON(), admin: profiles.get(Number(row.admin_id)) || null })));
  } catch (error) { next(error); }
});

app.post('/api/admin/messages/search', requireSession, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) return fail(res, 403, '无聊天记录查看权限');
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 2) return fail(res, 400, '查看聊天记录必须填写至少 2 个字符的审计原因');
    const where = {};
    if (req.body?.conversation_id) where.conversation_id = Number(req.body.conversation_id);
    if (req.body?.user_id) where.sender_id = Number(req.body.user_id);
    if (req.body?.keyword) where.content = { [Op.like]: `%${String(req.body.keyword).slice(0, 100)}%` };
    const rows = await Message.findAll({ where, order: [['created_at', 'DESC']], limit: Math.min(100, Number(req.body?.limit || 50)) });
    const filters = { conversation_id: req.body?.conversation_id, user_id: req.body?.user_id, keyword: req.body?.keyword };
    await AdminAudit.create({ admin_id: req.user.id, action: 'messages.search', reason, filters, source_ip: req.ip });
    ok(res, rows);
  } catch (error) { next(error); }
});

app.get('/api/admin/reports', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const status = String(req.query.status || '');
    const where = ['pending', 'resolved', 'rejected'].includes(status) ? { status } : {};
    const rows = await Report.findAll({ where, order: [['created_at', 'DESC']], limit: 100 });
    ok(res, await enrichReports(rows));
  } catch (error) { next(error); }
});

app.get('/api/admin/reports/:id', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const report = await Report.findOne({ where: { id: Number(req.params.id) } });
    if (!report) return fail(res, 404, '举报不存在');
    const message = await Message.findOne({ where: { id: report.message_id } });
    const context = message ? await Message.findAll({ where: { conversation_id: report.conversation_id,
      sequence: { [Op.between]: [Math.max(1, Number(message.sequence) - 5), Number(message.sequence) + 5] } }, order: [['sequence', 'ASC']], limit: 11 }) : [];
    const [detail] = await enrichReports([report]);
    const profileMap = await usersById(context.map(item => item.sender_id));
    ok(res, { ...detail, context: context.map(item => ({ ...item.toJSON(), sender: profileMap.get(Number(item.sender_id)) || null })) });
  } catch (error) { next(error); }
});

app.patch('/api/admin/reports/:id', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const report = await Report.findOne({ where: { id: Number(req.params.id) } });
    if (!report) return fail(res, 404, '举报不存在');
    if (report.status !== 'pending') return fail(res, 409, '该举报已经处理，不能重复处置');
    const action = String(req.body?.action || ''), reason = String(req.body?.reason || '').trim();
    const actions = new Set(['reject', 'confirm', 'delete_message', 'delete_and_disable']);
    if (!actions.has(action)) return fail(res, 400, '处理动作无效');
    if (reason.length < 2 || reason.length > 500) return fail(res, 400, '处理意见应为 2-500 个字符');
    const message = await Message.findOne({ where: { id: report.message_id } });
    if (!message) return fail(res, 409, '被举报消息已不存在，请先核查审计记录');
    if (action === 'delete_and_disable') {
      if (Number(message.sender_id) === Number(req.user.id)) return fail(res, 403, '不能禁用当前管理员账号');
      await communityRequest(req.user, 'post', `/api/users/im-admin/users/${Number(message.sender_id)}/disable`, { reason, report_id: Number(report.id) });
    }
    if (['delete_message', 'delete_and_disable'].includes(action)) {
      message.status = 'hidden';
      await message.save();
      broadcastConversation(message.conversation_id, 'message.moderated', { id: Number(message.id), status: 'hidden', content: '该消息因违规已被管理员删除' });
    }
    report.status = action === 'reject' ? 'rejected' : 'resolved';
    report.resolution_reason = reason; report.resolution_action = action; report.resolved_by = req.user.id; report.resolved_at = new Date();
    await report.save();
    await AdminAudit.create({ admin_id: req.user.id, action: `report.${action}`, reason, filters: { report_id: Number(report.id), message_id: Number(report.message_id), conversation_id: Number(report.conversation_id), target_user_id: Number(message.sender_id) }, source_ip: req.ip });
    ok(res, report, action === 'reject' ? '举报已驳回' : action === 'confirm' ? '已确认违规并完成记录' : action === 'delete_message' ? '违规消息已删除' : '违规消息已删除，用户已禁用');
  } catch (error) { next(error); }
});

app.get('/api/admin/groups', requireSession, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) return fail(res, 403, '无群聊管理权限');
    const groups = await Group.findAll({ order: [['updated_at', 'DESC']] });
    const rows = await Promise.all(groups.map(async group => {
      const members = await ConversationMember.findAll({ where: { conversation_id: group.conversation_id, state: 'active' } });
      const owner = await UserProfile.findByPk(group.owner_id);
      return { ...group.toJSON(), member_count: members.length, owner: publicUser(owner) };
    }));
    ok(res, rows);
  } catch (error) { next(error); }
});

app.get('/api/admin/groups/:id', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const conversationId = Number(req.params.id);
    const [group, conversation, members, allAudits] = await Promise.all([
      Group.findOne({ where: { conversation_id: conversationId } }),
      Conversation.findByPk(conversationId),
      ConversationMember.findAll({ where: { conversation_id: conversationId }, order: [['created_at', 'ASC']] }),
      AdminAudit.findAll({ order: [['created_at', 'DESC']], limit: 500 })
    ]);
    if (!group || !conversation) return fail(res, 404, '群聊不存在');
    const profiles = await usersById(members.map(member => member.user_id));
    const owner = profiles.get(Number(group.owner_id)) || await UserProfile.findByPk(group.owner_id);
    const groupAudits = allAudits.filter(row => {
      let filters = row.filters;
      if (typeof filters === 'string') {
        try { filters = JSON.parse(filters); } catch { filters = {}; }
      }
      return Number(filters?.conversation_id) === conversationId;
    });
    const admins = await usersById(groupAudits.map(row => row.admin_id));
    ok(res, {
      ...group.toJSON(),
      owner: publicUser(owner),
      conversation: conversation.toJSON(),
      message_count: await Message.count({ where: { conversation_id: conversationId } }),
      members: members.map(member => ({ ...member.toJSON(), user: profiles.get(Number(member.user_id)) || null })),
      audits: groupAudits.map(row => ({ ...row.toJSON(), admin: admins.get(Number(row.admin_id)) || null }))
    });
  } catch (error) { next(error); }
});

app.patch('/api/admin/groups/:id', requireSession, async (req, res, next) => {
  try {
    if (!requireImAdmin(req, res)) return;
    const conversationId = Number(req.params.id);
    const group = await Group.findOne({ where: { conversation_id: conversationId } });
    if (!group) return fail(res, 404, '群聊不存在');
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 2 || reason.length > 500) return fail(res, 400, '修改群聊必须填写 2-500 字的操作原因');
    const oldValues = { name: group.name, member_limit: Number(group.member_limit) };
    const changes = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 50) return fail(res, 400, '群名称长度应为 1-50 个字符');
      if (name !== group.name) { group.name = name; changes.name = name; }
    }
    if (req.body?.member_limit !== undefined) {
      const limit = Number(req.body.member_limit);
      if (!Number.isInteger(limit) || limit < config.groupDefaultLimit || limit > config.groupHardLimit) {
        return fail(res, 400, `群容量必须在 ${config.groupDefaultLimit}-${config.groupHardLimit} 之间`);
      }
      if (limit !== Number(group.member_limit)) { group.member_limit = limit; changes.member_limit = limit; }
    }
    if (!Object.keys(changes).length) return fail(res, 400, '没有需要保存的群聊变更');
    await sequelize.transaction(async transaction => {
      await group.save({ transaction });
      await AdminAudit.create({
        admin_id: req.user.id,
        action: 'group.profile.update',
        reason,
        filters: { conversation_id: conversationId, old_values: oldValues, changes },
        source_ip: req.ip
      }, { transaction });
    });
    broadcastConversation(conversationId, 'conversation.updated', group.toJSON());
    ok(res, group, '群聊资料已更新并记录审计日志');
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return fail(res, 400, error.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5 MB' : '图片上传请求无效');
  fail(res, error.statusCode || 500, error.statusCode ? error.message : 'IM 服务内部错误');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function broadcastConversation(conversationId, event, data) {
  ConversationMember.findAll({ where: { conversation_id: conversationId, state: 'active' }, attributes: ['user_id'] }).then(members => {
    for (const member of members) for (const socket of socketsByUser.get(Number(member.user_id)) || []) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ version: 1, event, data }));
    }
  }).catch(console.error);
}

// 按用户列表直接推送。
// 用于“成员状态已变更、已不在 active 名单中但仍需收到通知”的场景（被踢、群解散等），
// 因为 broadcastConversation 只发给 state='active' 的成员，无法覆盖到他们。
function broadcastUsers(userIds, event, data) {
  const targets = new Set((userIds || []).filter(Boolean).map(Number));
  for (const userId of targets) for (const socket of socketsByUser.get(userId) || []) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ version: 1, event, data }));
  }
}

server.on('upgrade', async (req, socket, head) => {
  if (req.url !== '/ws') return socket.destroy();
  if (req.headers.origin && config.publicOrigins.length && !config.publicOrigins.includes(req.headers.origin)) return socket.destroy();
  const user = parseSession(req);
  if (!user) return socket.destroy();
  try { await assertAccountActive(user); } catch { return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, user));
});
wss.on('connection', (ws, user) => {
  const set = socketsByUser.get(Number(user.id)) || new Set(); set.add(ws); socketsByUser.set(Number(user.id), set);
  ws.send(JSON.stringify({ version: 1, event: 'auth.ok', data: { user_id: user.id } }));
  ws.on('message', async raw => {
    try {
      const frame = JSON.parse(raw.toString());
      if (frame.event === 'ping') return ws.send(JSON.stringify({ version: 1, event: 'pong', data: { at: Date.now() } }));
      if (frame.event === 'message.send') {
        const message = await createMessage(user, frame.data || {});
        const [data] = await enrichMessages([message]);
        ws.send(JSON.stringify({ version: 1, event: 'message.ack', request_id: frame.request_id, data }));
        broadcastConversation(message.conversation_id, 'message.new', data);
      }
    } catch (error) { ws.send(JSON.stringify({ version: 1, event: 'message.error', data: { message: error.message } })); }
  });
  ws.on('close', () => { set.delete(ws); if (!set.size) socketsByUser.delete(Number(user.id)); });
});

async function start() {
  await connectDatabase();
  await connectReplayStore();
  server.listen(config.port, '0.0.0.0', () => console.log(`CodeDog IM server listening on ${config.port}`));
}
if (require.main === module) start().catch(error => { console.error(error); process.exit(1); });

module.exports = { app, server, start };
