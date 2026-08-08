<template>
  <main class="terminal-shell" :class="{ 'mobile-layout': mobileLayout, 'mobile-channel-open': mobileChannelOpen }">
    <aside class="rail">
      <div class="brand"><span class="brand-mark">狗</span><div><b>编程狗消息</b><small>即时通讯</small></div><a class="back-link" :href="communityUrl">返回编程狗</a></div>
      <button type="button" class="search-launcher" @click="openSearchDialog">
        <span>⌕</span><span>搜索用户或群聊</span><kbd>搜索</kbd>
      </button>
      <div class="rail-actions">
        <button type="button" @click="openSearchDialog"><span class="rail-action-icon">私</span><b>发起私聊</b><small>查找用户</small></button>
        <button type="button" class="primary" @click="openGroupWizard"><span class="rail-action-icon">群</span><b>创建群聊</b><small>邀请成员</small></button>
      </div>
      <div class="rail-title"><span>消息列表</span></div>
      <div v-if="requests.length" class="requests"><small>私聊申请</small><div v-for="request in requests" :key="request.conversation_id"><span class="user-link" @click="openUser(request.from_user)">{{ displayName(request.from_user, request.from_user_id) }}</span><button @click="handleRequest(request, 'accept')">接受</button><button class="ghost" @click="handleRequest(request, 'reject')">拒绝</button></div></div>
      <div class="conversation-list">
        <button v-for="item in filteredConversations" :key="item.id" class="conversation" :class="{ active: selected?.id === item.id }" @click="selectConversation(item)">
          <span class="avatar"><img v-if="item.type === 'direct' && item.peer?.avatar" :src="item.peer.avatar" alt="" referrerpolicy="no-referrer" @error="$event.currentTarget.remove()" />{{ item.type === 'group' ? '群' : avatarLetter(item.peer, '友') }}</span>
          <span class="conversation-copy"><b :class="{ 'user-link': item.type === 'direct' }" @click.stop="item.type === 'direct' && openUser(item.peer)">{{ item.title || `会话 #${item.id}` }}</b><small>{{ conversationPreview(item) }}</small></span>
          <span class="conversation-side"><time>{{ conversationTime(item) }}</time><em v-if="unreadCount(item)">{{ unreadCount(item) > 99 ? '99+' : unreadCount(item) }}</em></span>
        </button>
        <div v-if="!conversations.length" class="empty">还没有会话<br><small>从编程狗用户主页发起私聊</small></div>
      </div>
      <div class="account">
        <span class="avatar user">
          <img
            v-if="me?.avatar && !avatarFailed"
            :src="me.avatar"
            :alt="`${me?.nickname || me?.username || '当前用户'}的头像`"
            referrerpolicy="no-referrer"
            @error="avatarFailed = true"
          />
          <template v-else>{{ initials }}</template>
        </span>
        <div><b class="user-link" @click="openUser(me)">{{ me?.nickname || me?.username || '连接中' }}</b><small><em></em> 安全在线</small></div>
      </div>
    </aside>

    <section class="channel">
      <header><button class="mobile-back" type="button" aria-label="返回会话列表" @click="mobileChannelOpen = false">‹</button><div><small>即时消息</small><h1>{{ selected ? (selected.title || `会话 #${selected.id}`) : '选择一个会话' }}</h1><button v-if="selected?.type === 'group'" type="button" class="group-info-link" @click="openGroupManage">群号 {{ selected.group?.conversation_id }} · 群管理 ›</button></div><div class="signal"><span></span><span></span><span></span></div></header>
      <div ref="timeline" class="timeline">
        <div v-if="loading" class="center-state">正在加载消息…</div>
        <div v-else-if="initialLoginError" class="welcome auth-failure"><div class="orb">!</div><h2>无法完成安全登录</h2><p>{{ initialLoginError }}</p><div v-if="initialLoginDiagnostic" class="auth-diagnostic"><b>诊断编号 {{ initialLoginDiagnostic.diagnostic_id }}</b><span>网络地址：{{ initialLoginDiagnostic.ip_match ? '一致' : '不一致' }}</span><span>浏览器标识：{{ initialLoginDiagnostic.browser_match ? '一致' : '不一致' }}</span><small>将诊断编号提供给管理员，可在 IM 服务日志中查找对应记录。</small></div><a class="reauth-button" :href="communityUrl">返回编程狗重新进入</a></div>
        <div v-else-if="!selected" class="welcome"><div class="orb">聊</div><h2>欢迎使用编程狗消息</h2><p>选择左侧会话，开始安全、可靠的即时交流。</p></div>
        <article v-for="message in messages" :key="message.id" class="message" :class="{ mine: Number(message.sender_id) === Number(me?.id) }">
          <span class="avatar"><img v-if="message.sender?.avatar" :src="message.sender.avatar" alt="" referrerpolicy="no-referrer" @error="$event.currentTarget.remove()" />{{ Number(message.sender_id) === Number(me?.id) ? initials : avatarLetter(message.sender, '友') }}</span>
          <div><div class="message-meta"><b class="user-link" @click="openUser(message.sender || (Number(message.sender_id) === Number(me?.id) ? me : null))">{{ Number(message.sender_id) === Number(me?.id) ? '我' : displayName(message.sender, message.sender_id) }}</b><time>{{ formatTime(message.created_at) }}</time><code>#{{ message.sequence }}</code><button v-if="Number(message.sender_id) !== Number(me?.id)" class="report-message" @click="openReport(message)">举报</button></div><a v-if="message.type === 'image'" :href="imageData(message).url" target="_blank" rel="noopener"><img class="message-image" :src="imageData(message).url" alt="聊天图片" referrerpolicy="no-referrer" /></a><p v-else>{{ message.content }}</p></div>
        </article>
      </div>
      <form class="composer" @submit.prevent="sendMessage">
        <textarea v-model="draft" :disabled="!selected" maxlength="10000" placeholder="输入消息，Enter 发送，Shift + Enter 换行" @keydown.enter.exact.prevent="sendMessage"></textarea>
        <footer><span>{{ socketState }}</span><div><label class="image-button">图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" :disabled="!selected || sending" @change="sendImage" /></label><button :disabled="!selected || !draft.trim() || sending">{{ sending ? '发送中' : '发送' }} <b>↗</b></button></div></footer>
      </form>
    </section>

    <aside class="intel">
      <div class="radar"><span></span></div><small>服务状态</small><h3>{{ selected ? '连接正常' : '等待会话' }}</h3>
      <dl><div><dt>安全传输</dt><dd>已开启</dd></div><div><dt>消息数量</dt><dd>{{ selected?.last_sequence || 0 }}</dd></div><div><dt>实时连接</dt><dd>正常</dd></div></dl>
      <div class="notice"><b>安全提示</b><p>请勿在聊天中发送密码、令牌或其他敏感凭据。</p></div>
    </aside>
    <div v-if="searchDialog.open" class="modal-mask" @click.self="closeSearchDialog">
      <section class="im-dialog discovery-dialog" role="dialog" aria-modal="true" aria-labelledby="discovery-title">
        <header><div><small>发现联系人</small><h2 id="discovery-title">搜索用户或群聊</h2></div><button aria-label="关闭" @click="closeSearchDialog">×</button></header>
        <form class="dialog-search" @submit.prevent="searchDirectory">
          <span>⌕</span><input v-model="searchDialog.keyword" autofocus maxlength="50" placeholder="输入昵称、用户名、编程猫 ID 或群名称" /><button :disabled="searchDialog.loading">{{ searchDialog.loading ? '搜索中' : '搜索' }}</button>
        </form>
        <nav class="result-tabs">
          <button :class="{ active: searchDialog.tab === 'users' }" @click="searchDialog.tab = 'users'">用户 <em>{{ searchDialog.users.length }}</em></button>
          <button :class="{ active: searchDialog.tab === 'groups' }" @click="searchDialog.tab = 'groups'">群聊 <em>{{ searchDialog.groups.length }}</em></button>
        </nav>
        <div class="directory-results">
          <template v-if="searchDialog.tab === 'users'">
            <article v-for="user in searchDialog.users" :key="user.id">
              <span class="avatar"><img v-if="user.avatar" :src="user.avatar" alt="" referrerpolicy="no-referrer" />{{ avatarLetter(user) }}</span>
              <div><b>{{ displayName(user, user.id) }}</b><small>@{{ user.username }} · ID {{ user.id }}</small></div>
              <button @click="startDirect(user)">发起私聊</button>
            </article>
          </template>
          <template v-else>
            <article v-for="group in searchDialog.groups" :key="group.conversation_id">
              <span class="avatar group-avatar">群</span>
              <div><b>{{ group.name }}</b><small>群号 {{ group.conversation_id }} · {{ group.member_count }} 人</small></div>
              <button @click="joinSearchedGroup(group)">加入群聊</button>
            </article>
          </template>
          <div v-if="searchDialog.searched && !(searchDialog.tab === 'users' ? searchDialog.users : searchDialog.groups).length" class="dialog-empty">没有找到匹配结果，换个关键词试试</div>
          <div v-else-if="!searchDialog.searched" class="dialog-empty">输入关键词开始查找</div>
        </div>
      </section>
    </div>
    <div v-if="groupWizard.open" class="modal-mask">
      <section class="im-dialog group-wizard" role="dialog" aria-modal="true" aria-labelledby="group-wizard-title">
        <header><div><small>第 {{ groupWizard.step }} 步，共 3 步</small><h2 id="group-wizard-title">{{ groupStepTitle }}</h2></div><button aria-label="关闭" @click="closeGroupWizard">×</button></header>
        <div class="wizard-progress"><i v-for="step in 3" :key="step" :class="{ active: step <= groupWizard.step }"></i></div>
        <div v-if="groupWizard.step === 1" class="wizard-page">
          <label>群聊名称<input v-model="groupWizard.name" maxlength="50" autofocus placeholder="给群聊取一个清晰的名称" /><span>{{ groupWizard.name.trim().length }}/50</span></label>
          <div class="wizard-note"><b>创建后你将成为群主</b><p>可继续邀请成员、调整群资料与管理成员。</p></div>
        </div>
        <div v-else-if="groupWizard.step === 2" class="wizard-page">
          <form class="dialog-search" @submit.prevent="searchWizardMembers"><span>⌕</span><input v-model="groupWizard.keyword" maxlength="50" placeholder="搜索要邀请的用户" /><button :disabled="groupWizard.searching">{{ groupWizard.searching ? '搜索中' : '搜索' }}</button></form>
          <div v-if="groupWizard.selected.length" class="selected-members"><button v-for="user in groupWizard.selected" :key="user.id" @click="toggleWizardMember(user)">{{ displayName(user, user.id) }} ×</button></div>
          <div class="directory-results compact">
            <article v-for="user in groupWizard.results" :key="user.id">
              <span class="avatar"><img v-if="user.avatar" :src="user.avatar" alt="" referrerpolicy="no-referrer" />{{ avatarLetter(user) }}</span>
              <div><b>{{ displayName(user, user.id) }}</b><small>@{{ user.username }}</small></div>
              <button :class="{ selected: isWizardMemberSelected(user) }" @click="toggleWizardMember(user)">{{ isWizardMemberSelected(user) ? '已选择' : '选择' }}</button>
            </article>
            <div v-if="!groupWizard.results.length" class="dialog-empty">可跳过此步，创建后再邀请成员</div>
          </div>
        </div>
        <div v-else class="wizard-page confirm-page">
          <div class="group-preview"><span>群</span><div><b>{{ groupWizard.name.trim() }}</b><small>{{ groupWizard.selected.length + 1 }} 位初始成员</small></div></div>
          <div class="confirm-members"><span>群主</span><b>{{ displayName(me, me?.id) }}</b><span>邀请成员</span><b>{{ groupWizard.selected.length ? groupWizard.selected.map(user => displayName(user, user.id)).join('、') : '暂不邀请' }}</b></div>
        </div>
        <div v-if="groupWizard.error" class="dialog-error">{{ groupWizard.error }}</div>
        <footer><button class="ghost" @click="groupWizard.step === 1 ? closeGroupWizard() : groupWizard.step--">{{ groupWizard.step === 1 ? '取消' : '上一步' }}</button><button :disabled="groupWizard.submitting || (groupWizard.step === 1 && !groupWizard.name.trim())" @click="nextGroupStep">{{ groupWizard.step === 3 ? (groupWizard.submitting ? '创建中' : '确认创建') : '下一步' }}</button></footer>
      </section>
    </div>
    <div v-if="groupManage.open" class="modal-mask" @click.self="closeGroupManage">
      <section class="im-dialog group-manage" role="dialog" aria-modal="true" aria-labelledby="group-manage-title">
        <header><div><small>群聊管理</small><h2 id="group-manage-title">{{ groupManage.data?.name || selected?.title }}</h2></div><button aria-label="关闭" @click="closeGroupManage">×</button></header>
        <p class="group-manage-meta">群号 {{ groupManage.data?.conversation_id }} · {{ groupManage.data?.member_count }} 人 · 我的身份：{{ roleText(groupManage.data?.my_role) }}</p>
        <form v-if="isGroupManager" class="dialog-search group-rename" @submit.prevent="renameGroup">
          <span>改</span><input v-model="groupManage.rename" maxlength="50" placeholder="修改群名称" /><button :disabled="groupManage.submitting || !groupManage.rename.trim()">保存</button>
        </form>
        <div v-if="isGroupManager" class="group-invite">
          <small>邀请成员（按昵称 / 用户名 / 编程猫 ID 搜索）</small>
          <form class="dialog-search" @submit.prevent="searchGroupMembers"><span>⌕</span><input v-model="groupManage.keyword" maxlength="50" placeholder="搜索用户加入群聊" /><button :disabled="groupManage.searching">{{ groupManage.searching ? '搜索中' : '搜索' }}</button></form>
          <div v-if="groupManage.results.length" class="invite-results">
            <article v-for="user in groupManage.results" :key="user.id">
              <span class="avatar"><img v-if="user.avatar" :src="user.avatar" alt="" referrerpolicy="no-referrer" />{{ avatarLetter(user) }}</span>
              <div><b>{{ displayName(user, user.id) }}</b><small>@{{ user.username }}</small></div>
              <button @click="inviteGroupMember(user)">邀请</button>
            </article>
          </div>
        </div>
        <div class="member-list">
          <div v-if="groupManage.loading" class="dialog-empty">正在加载成员…</div>
          <template v-else>
            <article v-for="member in groupManage.data?.members || []" :key="member.user_id" class="member-row">
              <span class="avatar"><img v-if="member.user?.avatar" :src="member.user.avatar" alt="" referrerpolicy="no-referrer" />{{ Number(member.user_id) === Number(me?.id) ? initials : avatarLetter(member.user, '员') }}</span>
              <div class="member-main"><b>{{ Number(member.user_id) === Number(me?.id) ? '我' : displayName(member.user, member.user_id) }}</b><small>{{ roleText(member.role) }}</small></div>
              <div class="member-actions">
                <button v-if="canSetAdmin(member)" @click="setGroupAdmin(member, member.role === 'member' ? 'admin' : 'member')">{{ member.role === 'member' ? '设管理员' : '取消管理员' }}</button>
                <button v-if="canTransfer(member)" @click="transferGroup(member)">转让群主</button>
                <button v-if="canKick(member)" class="danger" @click="kickMember(member)">移除</button>
              </div>
            </article>
            <div v-if="!groupManage.data?.members?.length" class="dialog-empty">没有成员</div>
          </template>
        </div>
        <div v-if="groupManage.error" class="dialog-error">{{ groupManage.error }}</div>
        <footer>
          <button class="ghost danger" :disabled="groupManage.submitting" @click="leaveGroup">退出群聊</button>
          <button v-if="isGroupOwner" class="danger" :disabled="groupManage.submitting" @click="dissolveGroup">解散群聊</button>
        </footer>
      </section>
    </div>
    <div v-if="reportDialog.open" class="modal-mask" @click.self="closeReport">
      <section class="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <header><div><small>内容安全</small><h2 id="report-title">举报这条消息</h2></div><button aria-label="关闭" @click="closeReport">×</button></header>
        <p>请说明举报原因，管理员会结合聊天上下文进行审核。请勿重复提交。</p>
        <label>举报原因 <span>{{ reportDialog.reason.length }}/500</span><textarea v-model="reportDialog.reason" maxlength="500" autofocus placeholder="例如：包含辱骂、骚扰、诈骗或违规内容"></textarea></label>
        <div v-if="reportDialog.error" class="dialog-error">{{ reportDialog.error }}</div>
        <footer><button class="ghost" @click="closeReport">取消</button><button :disabled="reportDialog.reason.trim().length < 2 || reportDialog.submitting" @click="submitReport">{{ reportDialog.submitting ? '提交中' : '提交举报' }}</button></footer>
      </section>
    </div>
    <div v-if="captchaDialog.open" class="modal-mask">
      <section class="report-dialog captcha-dialog" role="dialog" aria-modal="true">
        <header><div><small>防刷验证</small><h2>请完成极验安全验证</h2></div><button aria-label="关闭" @click="cancelCaptcha">×</button></header>
        <p>{{ captchaDialog.scene === 'im_message' ? '验证通过后 2 分钟内发送消息无需重复验证。' : '本次操作完成验证后才会继续。' }}</p>
        <div ref="captchaBox" class="captcha-box"></div>
        <div v-if="captchaDialog.error" class="dialog-error">{{ captchaDialog.error }}</div>
      </section>
    </div>
    <div v-if="toast.message" :class="['toast', toast.type]">{{ toast.message }}</div>
    <div v-if="sessionExpired" class="modal-mask session-expired">
      <section class="report-dialog" role="alertdialog" aria-modal="true">
        <header><div><small>安全会话</small><h2>请从编程狗重新进入</h2></div></header>
        <p>即时通讯登录每 30 分钟失效一次，以防登录链接或会话被他人冒用。返回编程狗后再次点击“即时通讯”即可继续。</p>
        <footer><a class="reauth-button" :href="communityUrl">返回编程狗</a></footer>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

const me = ref(null), conversations = ref([]), requests = ref([]), selected = ref(null), messages = ref([])
const filter = ref(''), draft = ref(''), loading = ref(false), sending = ref(false), socketState = ref('正在连接'), timeline = ref(null)
const mobileChannelOpen = ref(false)
const mobileLayout = ref(false)
const avatarFailed = ref(false)
const sessionExpired = ref(false)
const initialLoginError = ref('')
const initialLoginDiagnostic = ref(null)
const captchaBox = ref(null)
const searchDialog = reactive({ open: false, keyword: '', tab: 'users', users: [], groups: [], searched: false, loading: false })
const groupWizard = reactive({ open: false, step: 1, name: '', keyword: '', results: [], selected: [], searching: false, submitting: false, error: '' })
const groupStepTitle = computed(() => ['设置群资料', '邀请初始成员', '确认创建群聊'][groupWizard.step - 1])
const captchaDialog = reactive({ open: false, scene: '', error: '', resolve: null })
const captchaGrants = new Map()
const groupManage = reactive({ open: false, loading: false, data: null, rename: '', keyword: '', results: [], searching: false, submitting: false, error: '' })
const reportDialog = reactive({ open: false, message: null, reason: '', error: '', submitting: false })
const toast = reactive({ message: '', type: 'success' })
const readSequences = reactive({})
let socket = null
const initials = computed(() => String(me.value?.nickname || me.value?.username || '犬').slice(0, 1))
const communityUrl = computed(() => String(me.value?.community_url || 'https://54188.xyz').replace(/\/$/, ''))
const displayName = (user, fallbackId) => user?.nickname || user?.username || `用户 ${fallbackId}`
const avatarLetter = (user, fallback = '友') => String(user?.nickname || user?.username || fallback).slice(0, 1)
const showToast = (message, type = 'success') => { toast.message = message; toast.type = type; window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => { toast.message = '' }, 3200) }
const openUser = user => { if (!user?.codemao_user_id) return showToast('该用户的主页资料尚未同步，请稍后重试', 'warning'); window.open(`${communityUrl.value}/user/${encodeURIComponent(user.codemao_user_id)}`, '_blank', 'noopener') }
const filteredConversations = computed(() => {
  const keyword = filter.value.trim().toLowerCase()
  return conversations.value.filter(item => !keyword || String(item.id).includes(keyword) || String(item.title || '').toLowerCase().includes(keyword))
})
const api = async (url, options = {}) => {
  const { captchaGrant, ...requestOptions } = options
  const response = await fetch(`/im/api${url}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(captchaGrant ? { 'X-IM-Captcha-Grant': captchaGrant } : {}), ...(requestOptions.headers || {}) }, ...requestOptions })
  const body = await response.json()
  // SSO exchange itself may return 401 for configuration or binding errors.
  // Only an already established IM session should be presented as expired.
  if (response.status === 401 && me.value) sessionExpired.value = true
  if (!response.ok) { const error = new Error(body.msg || '请求失败'); error.data = body.data; throw error }
  return body.data
}
const exchangeSso = async () => {
  const params = new URLSearchParams(location.search), ticket = params.get('ticket')
  if (!ticket) return null
  const action = params.get('action'), userId = Number(params.get('user_id')), groupId = Number(params.get('group_id'))
  await api('/auth/sso/exchange', { method: 'POST', body: JSON.stringify({ ticket }) })
  history.replaceState({}, '', location.pathname)
  return { action, userId, groupId }
}
const readStorageKey = () => `codedog-im-read-sequences:${me.value?.id || 'guest'}`
const persistReadSequences = () => localStorage.setItem(readStorageKey(), JSON.stringify(readSequences))
const loadReadSequences = items => {
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(readStorageKey()) || 'null') } catch {}
  if (stored && typeof stored === 'object') Object.assign(readSequences, stored)
  else {
    for (const item of items) readSequences[item.id] = Number(item.last_sequence) || 0
    persistReadSequences()
  }
}
const markConversationRead = item => {
  if (!item) return
  readSequences[item.id] = Math.max(Number(readSequences[item.id]) || 0, Number(item.last_sequence) || 0)
  persistReadSequences()
}
const unreadCount = item => Math.max(0, Number(item.last_sequence || 0) - Number(readSequences[item.id] || 0))
const conversationPreview = item => {
  const message = item.latest_message
  if (!message) return '还没有消息'
  if (message.status === 'hidden') return '该消息已被删除'
  if (message.type === 'image') return `${Number(message.sender_id) === Number(me.value?.id) ? '我：' : ''}[图片]`
  if (message.type === 'system') return `[系统消息] ${message.content || ''}`
  return `${Number(message.sender_id) === Number(me.value?.id) ? '我：' : ''}${message.content || '消息内容为空'}`
}
const conversationTime = item => {
  const value = item.latest_message?.created_at || item.updated_at
  if (!value) return ''
  const date = new Date(value), now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}/${date.getDate()}`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}
const refreshSidebar = async () => {
  const [items, pendingRequests] = await Promise.all([api('/conversations'), api('/conversation-requests')])
  conversations.value = items
  requests.value = pendingRequests
  loadReadSequences(items)
}
const loadGeetestScript = () => new Promise((resolve, reject) => {
  if (window.initGeetest) return resolve()
  const existing = document.querySelector('script[data-codedog-geetest]')
  if (existing) { existing.addEventListener('load', resolve, { once:true }); existing.addEventListener('error', reject, { once:true }); return }
  const script = document.createElement('script'); script.dataset.codedogGeetest = '1'; script.src = 'https://static.geetest.com/static/js/gt.0.5.0.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script)
})
const cancelCaptcha = () => { const resolve = captchaDialog.resolve; captchaDialog.open = false; captchaDialog.resolve = null; resolve?.(null) }
const getCaptchaGrant = async scene => {
  const cached = captchaGrants.get(scene)
  if (scene === 'im_message' && cached?.expiresAt > Date.now()) return cached.token
  const config = await api(`/captcha/config?scene=${encodeURIComponent(scene)}`)
  if (!config.enabled) return ''
  const registration = await api(`/captcha/register?scene=${encodeURIComponent(scene)}`)
  await loadGeetestScript()
  const validation = await new Promise(async resolve => {
    captchaDialog.open = true; captchaDialog.scene = scene; captchaDialog.error = ''; captchaDialog.resolve = resolve
    await nextTick()
    window.initGeetest({ gt:registration.gt, challenge:registration.challenge, offline:!registration.success, new_captcha:registration.new_captcha, product:registration.product || 'popup', width:'100%' }, captcha => {
      captcha.appendTo(captchaBox.value)
      captcha.onReady(() => { if ((registration.product || 'popup') === 'bind') captcha.verify() })
      captcha.onSuccess(() => resolve(captcha.getValidate()))
      captcha.onError(() => { captchaDialog.error = '极验加载失败，请重试' })
    })
  })
  captchaDialog.open = false; captchaDialog.resolve = null
  if (!validation) throw new Error('已取消安全验证')
  const result = await api('/captcha/validate', { method:'POST', body:JSON.stringify({ scene, ...validation }) })
  const token = result.grant || ''
  if (scene === 'im_message' && token) captchaGrants.set(scene, { token, expiresAt:Date.now() + 115000 })
  return token
}
const load = async () => {
  const intent = await exchangeSso()
  if (intent?.action === 'admin') return location.replace('/im/admin/')
  me.value = await api('/me')
  const expiresIn = Number(me.value?.exp || 0) * 1000 - Date.now()
  if (expiresIn > 0) window.setTimeout(() => { sessionExpired.value = true; socket?.close() }, expiresIn)
  if (intent?.action === 'direct' && intent.userId) await api('/conversations/direct', { method:'POST', body:JSON.stringify({ user_id:intent.userId }) })
  if (intent?.action === 'group' && intent.groupId) await api(`/groups/${intent.groupId}/join`, { method:'POST' })
  await refreshSidebar(); connectSocket()
  const target = intent?.action === 'direct' ? conversations.value.find(item => Number(item.peer_id) === intent.userId) : conversations.value.find(item => Number(item.id) === intent?.groupId)
  if (target) await selectConversation(target)
}
const openSearchDialog = () => { searchDialog.open = true; searchDialog.keyword = ''; searchDialog.users = []; searchDialog.groups = []; searchDialog.searched = false; searchDialog.tab = 'users' }
const closeSearchDialog = () => { if (!searchDialog.loading) searchDialog.open = false }
const searchDirectory = async () => {
  const keyword = searchDialog.keyword.trim()
  if (!keyword || searchDialog.loading) return
  searchDialog.loading = true
  try {
    const captchaGrant = await getCaptchaGrant('im_search')
    const data = await api('/search', { method:'POST', captchaGrant, body:JSON.stringify({ keyword }) })
    searchDialog.users = data.users || []
    searchDialog.groups = data.groups || []
    searchDialog.searched = true
  } catch (error) { showToast(error.message, 'error') } finally { searchDialog.loading = false }
}
const startDirect = async user => {
  try {
    await api('/conversations/direct', { method:'POST', body:JSON.stringify({ user_id:Number(user.id) }) })
    searchDialog.open = false
    await refreshSidebar()
    const target = conversations.value.find(item => Number(item.peer_id) === Number(user.id))
    if (target) await selectConversation(target)
  } catch (error) { showToast(error.message, 'error') }
}
const joinSearchedGroup = async group => {
  try {
    await api(`/groups/${group.conversation_id}/join`, { method:'POST' })
    searchDialog.open = false
    await refreshSidebar()
    const target = conversations.value.find(item => Number(item.id) === Number(group.conversation_id))
    if (target) await selectConversation(target)
  } catch (error) { showToast(error.message, 'error') }
}
const openGroupWizard = () => Object.assign(groupWizard, { open: true, step: 1, name: '', keyword: '', results: [], selected: [], searching: false, submitting: false, error: '' })
const closeGroupWizard = () => { if (!groupWizard.submitting) groupWizard.open = false }
const isWizardMemberSelected = user => groupWizard.selected.some(item => Number(item.id) === Number(user.id))
const toggleWizardMember = user => {
  const index = groupWizard.selected.findIndex(item => Number(item.id) === Number(user.id))
  if (index >= 0) groupWizard.selected.splice(index, 1)
  else groupWizard.selected.push(user)
}
const searchWizardMembers = async () => {
  const keyword = groupWizard.keyword.trim()
  if (!keyword || groupWizard.searching) return
  groupWizard.searching = true
  try {
    const captchaGrant = await getCaptchaGrant('im_search')
    const data = await api('/search', { method:'POST', captchaGrant, body:JSON.stringify({ keyword }) })
    groupWizard.results = data.users || []
  } catch (error) { groupWizard.error = error.message } finally { groupWizard.searching = false }
}
const createGroupFromWizard = async () => {
  groupWizard.submitting = true; groupWizard.error = ''
  try {
    const captchaGrant = await getCaptchaGrant('im_create_group')
    const group = await api('/conversations/group', { method:'POST', captchaGrant, body:JSON.stringify({ name:groupWizard.name.trim() }) })
    const failures = []
    for (const user of groupWizard.selected) {
      try { await api(`/groups/${group.id}/members`, { method:'POST', body:JSON.stringify({ user_id:Number(user.id) }) }) }
      catch { failures.push(displayName(user, user.id)) }
    }
    groupWizard.open = false
    await refreshSidebar()
    const target = conversations.value.find(item => Number(item.id) === Number(group.id))
    if (target) await selectConversation(target)
    showToast(failures.length ? `群聊已创建，${failures.join('、')} 邀请失败` : '群聊创建成功', failures.length ? 'warning' : 'success')
  } catch (error) { groupWizard.error = error.message } finally { groupWizard.submitting = false }
}
const nextGroupStep = () => {
  groupWizard.error = ''
  if (groupWizard.step === 1 && !groupWizard.name.trim()) return
  if (groupWizard.step < 3) groupWizard.step++
  else createGroupFromWizard()
}
const handleRequest = async (request, action) => { await api(`/conversation-requests/${request.conversation_id}`, { method:'POST', body:JSON.stringify({ action }) }); await refreshSidebar() }
const roleText = role => ({ owner: '群主', admin: '管理员', member: '成员' }[role] || role || '成员')
const isGroupOwner = computed(() => groupManage.data?.my_role === 'owner')
const isGroupManager = computed(() => ['owner', 'admin'].includes(groupManage.data?.my_role))
const openGroupManage = async () => {
  if (selected.value?.type !== 'group') return
  groupManage.open = true; groupManage.error = ''
  await refreshGroupManage()
}
const closeGroupManage = () => { if (!groupManage.submitting) groupManage.open = false }
const refreshGroupManage = async () => {
  groupManage.loading = true; groupManage.error = ''
  try {
    groupManage.data = await api(`/groups/${selected.value.id}`)
    groupManage.results = []; groupManage.keyword = ''; groupManage.rename = ''
  } catch (error) { groupManage.data = null; groupManage.error = error.message }
  finally { groupManage.loading = false }
}
const canSetAdmin = member => isGroupOwner.value && member.role !== 'owner' && Number(member.user_id) !== Number(me.value?.id)
const canTransfer = member => isGroupOwner.value && member.role !== 'owner' && Number(member.user_id) !== Number(me.value?.id)
const canKick = member => {
  if (Number(member.user_id) === Number(me.value?.id)) return false
  if (member.role === 'owner') return false
  if (isGroupOwner.value) return true
  return isGroupManager.value && member.role !== 'admin'
}
const renameGroup = async () => {
  const name = groupManage.rename.trim(); if (!name || groupManage.submitting) return
  groupManage.submitting = true; groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
    showToast('群名称已更新')
    await Promise.all([refreshGroupManage(), refreshSidebar()])
  } catch (error) { groupManage.error = error.message } finally { groupManage.submitting = false }
}
const searchGroupMembers = async () => {
  const keyword = groupManage.keyword.trim(); if (!keyword || groupManage.searching) return
  groupManage.searching = true; groupManage.error = ''
  try {
    const captchaGrant = await getCaptchaGrant('im_search')
    const data = await api('/search', { method: 'POST', captchaGrant, body: JSON.stringify({ keyword }) })
    const existingIds = new Set((groupManage.data?.members || []).map(member => Number(member.user_id)))
    groupManage.results = (data.users || []).filter(user => !existingIds.has(Number(user.id)))
  } catch (error) { groupManage.error = error.message } finally { groupManage.searching = false }
}
const inviteGroupMember = async user => {
  if (groupManage.submitting) return
  groupManage.submitting = true; groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: Number(user.id) }) })
    showToast(`已邀请 ${displayName(user, user.id)}`)
    await refreshGroupManage()
  } catch (error) { groupManage.error = error.message } finally { groupManage.submitting = false }
}
const setGroupAdmin = async (member, role) => {
  groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}/members/${member.user_id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    showToast(role === 'admin' ? `已将 ${displayName(member.user, member.user_id)} 设为管理员` : '已取消管理员')
    await refreshGroupManage()
  } catch (error) { groupManage.error = error.message }
}
const kickMember = async member => {
  if (!window.confirm(`确定将 ${displayName(member.user, member.user_id)} 移出群聊吗？`)) return
  groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}/members/${member.user_id}`, { method: 'DELETE' })
    showToast('成员已移除')
    await refreshGroupManage()
  } catch (error) { groupManage.error = error.message }
}
const transferGroup = async member => {
  if (!window.confirm(`确定将群主转让给 ${displayName(member.user, member.user_id)} 吗？转让后你将降为管理员。`)) return
  groupManage.submitting = true; groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}/transfer`, { method: 'POST', body: JSON.stringify({ user_id: Number(member.user_id) }) })
    showToast('群主已转让')
    await refreshGroupManage()
  } catch (error) { groupManage.error = error.message } finally { groupManage.submitting = false }
}
const leaveGroup = async () => {
  if (!window.confirm('确定退出该群聊吗？')) return
  groupManage.submitting = true; groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}/members/${me.value.id}`, { method: 'DELETE' })
    groupManage.open = false
    selected.value = null; messages.value = []
    await refreshSidebar(); showToast('已退出群聊')
  } catch (error) { groupManage.error = error.message } finally { groupManage.submitting = false }
}
const dissolveGroup = async () => {
  const name = groupManage.data?.name || ''
  const typed = window.prompt(`解散后所有成员都会被移出且无法重新加入。如确认，请输入群名称「${name}」：`, '')
  if (typed === null) return
  if (typed.trim() !== name) { groupManage.error = '群名称输入不一致，已取消解散'; return }
  groupManage.submitting = true; groupManage.error = ''
  try {
    await api(`/groups/${selected.value.id}/dissolve`, { method: 'POST' })
    groupManage.open = false
    selected.value = null; messages.value = []
    await refreshSidebar(); showToast('群聊已解散', 'warning')
  } catch (error) { groupManage.error = error.message } finally { groupManage.submitting = false }
}
const selectConversation = async item => { selected.value = item; mobileChannelOpen.value = true; loading.value = true; markConversationRead(item); try { messages.value = await api(`/conversations/${item.id}/messages`); await nextTick(); timeline.value?.scrollTo(0, timeline.value.scrollHeight) } finally { loading.value = false } }
const sendMessage = async () => {
  if (!selected.value || !draft.value.trim() || sending.value) return
  const content = draft.value.trim(); draft.value = ''; sending.value = true
  try { const captchaGrant = await getCaptchaGrant('im_message'); await api('/messages', { method: 'POST', captchaGrant, body: JSON.stringify({ conversation_id: selected.value.id, client_message_id: crypto.randomUUID(), content }) }) }
  catch (error) { draft.value = content; showToast(error.message, 'error') } finally { sending.value = false }
}
const sendImage = async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file || !selected.value || sending.value) return
  sending.value = true
  try {
    const data = new FormData(); data.append('image', file)
    const uploadResponse = await fetch('/im/api/images', { method: 'POST', credentials: 'include', body: data })
    const upload = await uploadResponse.json(); if (!uploadResponse.ok) throw new Error(upload.msg || '图片上传失败')
    const captchaGrant = await getCaptchaGrant('im_message')
    await api('/messages', { method: 'POST', captchaGrant, body: JSON.stringify({ conversation_id: selected.value.id, client_message_id: crypto.randomUUID(), type: 'image', image_id: upload.data.id }) })
  } catch (error) { showToast(error.message, 'error') } finally { sending.value = false }
}
const openReport = message => { reportDialog.open = true; reportDialog.message = message; reportDialog.reason = ''; reportDialog.error = '' }
const closeReport = () => { if (!reportDialog.submitting) reportDialog.open = false }
const submitReport = async () => { reportDialog.error = ''; reportDialog.submitting = true; try { await api('/reports', { method:'POST', body:JSON.stringify({ message_id:reportDialog.message.id, reason:reportDialog.reason.trim() }) }); reportDialog.open = false; showToast('举报已提交，管理员会尽快处理') } catch (error) { reportDialog.error = error.message } finally { reportDialog.submitting = false } }
const connectSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(`${protocol}//${location.host}/im/ws`)
  socket.onopen = () => { socketState.value = '实时链路在线' }
  socket.onclose = event => {
    socketState.value = '链路已断开'
    if (event.code === 4001 || Number(me.value?.exp || 0) * 1000 <= Date.now()) {
      sessionExpired.value = true
      return
    }
    if (!sessionExpired.value) setTimeout(connectSocket, 2000)
  }
  socket.onmessage = async event => {
    const frame = JSON.parse(event.data)
    if (frame.event === 'message.new') {
      const conversationId = Number(frame.data.conversation_id)
      let item = conversations.value.find(value => Number(value.id) === conversationId)
      if (!item) {
        await refreshSidebar()
        item = conversations.value.find(value => Number(value.id) === conversationId)
      }
      if (item) {
        item.last_sequence = Math.max(Number(item.last_sequence) || 0, Number(frame.data.sequence) || 0)
        item.latest_message = frame.data
        conversations.value = [...conversations.value].sort((a, b) => new Date(b.latest_message?.created_at || b.updated_at || 0) - new Date(a.latest_message?.created_at || a.updated_at || 0))
      }
      if (conversationId === Number(selected.value?.id)) {
        if (!messages.value.some(value => String(value.id) === String(frame.data.id))) messages.value.push(frame.data)
        markConversationRead(item)
        await nextTick()
        timeline.value?.scrollTo(0, timeline.value.scrollHeight)
      }
      return
    }
    // 群聊被解散：关闭当前会话并刷新列表
    if (frame.event === 'conversation.dissolved') {
      const conversationId = Number(frame.data.conversation_id)
      if (Number(selected.value?.id) === conversationId) { selected.value = null; messages.value = [] }
      if (groupManage.open && Number(groupManage.data?.conversation_id) === conversationId) { groupManage.open = false; groupManage.data = null }
      await refreshSidebar()
      showToast('群聊已解散', 'warning')
      return
    }
    // 群资料更新（群名等）：同步会话标题与群管理面板
    if (frame.event === 'conversation.updated') {
      const conversationId = Number(frame.data.conversation_id)
      const item = conversations.value.find(value => Number(value.id) === conversationId)
      if (item) { item.group = frame.data; item.title = frame.data.name }
      if (groupManage.open && Number(groupManage.data?.conversation_id) === conversationId) groupManage.data = { ...groupManage.data, ...frame.data }
      return
    }
    // 成员变动（加入/移除/角色变更）
    if (frame.event === 'member.updated') {
      const conversationId = Number(frame.data.conversation_id)
      // 兜底：若自己因其他端操作（如被管理员移除后重新同步）变成 removed/left，立即关闭会话
      if (['removed', 'left'].includes(frame.data.state) && Number(frame.data.user_id) === Number(me.value?.id)) {
        if (Number(selected.value?.id) === conversationId) { selected.value = null; messages.value = [] }
        if (groupManage.open && Number(groupManage.data?.conversation_id) === conversationId) { groupManage.open = false; groupManage.data = null }
        await refreshSidebar()
        showToast('你已退出该群聊', 'warning')
        return
      }
      if (groupManage.open) await refreshGroupManage()
      return
    }
    // 自己被移出群聊（后端在成员状态变更前保存了目标用户并单独推送）：立即关闭会话
    if (frame.event === 'member.kicked') {
      const conversationId = Number(frame.data.conversation_id)
      if (Number(frame.data.user_id) === Number(me.value?.id)) {
        if (Number(selected.value?.id) === conversationId) { selected.value = null; messages.value = [] }
        if (groupManage.open && Number(groupManage.data?.conversation_id) === conversationId) { groupManage.open = false; groupManage.data = null }
        await refreshSidebar()
        showToast('你已被移出群聊', 'warning')
      }
    }
  }
}
const formatTime = value => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
const imageData = message => { try { return JSON.parse(message.content) } catch { return { url: '' } } }
const syncMobileLayout = () => {
  const widths = [window.innerWidth, window.outerWidth, window.visualViewport?.width, document.documentElement.clientWidth, window.screen?.width, window.screen?.availWidth]
    .map(Number).filter(value => Number.isFinite(value) && value > 0)
  const narrowViewport = Math.min(...widths) <= 820
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || '')
  const compactTouchDevice = navigator.maxTouchPoints > 1 && Math.min(Number(screen.width) || 9999, Number(screen.height) || 9999) <= 1024
  mobileLayout.value = narrowViewport || mobileUserAgent || compactTouchDevice || window.matchMedia('(max-device-width: 820px)').matches
  document.body.classList.toggle('im-mobile', mobileLayout.value)
  document.documentElement.style.setProperty('--im-viewport-height', `${Math.round(window.visualViewport?.height || window.innerHeight)}px`)
}
onMounted(() => {
  syncMobileLayout()
  window.addEventListener('resize', syncMobileLayout, { passive: true })
  window.addEventListener('orientationchange', syncMobileLayout, { passive: true })
  window.visualViewport?.addEventListener('resize', syncMobileLayout, { passive: true })
load().catch(error => { initialLoginError.value = error.message; initialLoginDiagnostic.value = error.data || null; socketState.value = error.message })
})
onUnmounted(() => {
  socket?.close()
  window.removeEventListener('resize', syncMobileLayout)
  window.removeEventListener('orientationchange', syncMobileLayout)
  window.visualViewport?.removeEventListener('resize', syncMobileLayout)
  document.body.classList.remove('im-mobile')
})
</script>
<style scoped>
.timeline { padding:24px clamp(16px,2vw,28px); }
.message-image { display:block; max-width:min(420px,60vw); max-height:360px; margin-top:8px; border:1px solid #e2e4e8; border-radius:5px 15px 15px 15px; object-fit:contain; background:#fff; }
.composer footer > div { display:flex; gap:8px; }
.image-button { display:inline-flex; align-items:center; border:1px solid #dfe2e8; border-radius:9px; padding:8px 12px; color:#666b73; background:#fafafa; cursor:pointer; }
.image-button input { display:none; }
.create-panel { display:grid; gap:8px; padding:0 6px 10px; }
.create-panel form { display:flex; gap:6px; }
.create-panel input { min-width:0; flex:1; height:32px; border:1px solid #dfe2e8; border-radius:7px; background:#fafafa; color:#30343a; padding:0 9px; }
.create-panel button,.requests button { border:0; border-radius:7px; background:#ffc43d; color:#111820; font-weight:700; padding:0 9px; cursor:pointer; }
.search button{border:0;background:transparent;color:#b47b00;font-size:11px;cursor:pointer}.search-results{display:grid;gap:4px;margin:0 6px 10px}.search-results>button{display:flex;align-items:center;gap:8px;padding:7px;border:0;border-radius:9px;background:#fff9e8;text-align:left;cursor:pointer}.search-results .avatar{width:28px;height:28px}.search-results b,.search-results small{display:block}.search-results small{color:#979ca5;font-size:10px}
.requests { margin:4px 6px 10px; padding:10px; border:1px solid #f0d27c; border-radius:9px; background:#fff9e6; }
.requests > small { color:#b77a00; }
.requests > div { display:grid; grid-template-columns:1fr auto auto; gap:5px; align-items:center; margin-top:8px; font-size:11px; }
.requests button { height:25px; font-size:10px; }
.requests button.ghost { background:#fff; color:#7d828a; border:1px solid #dfe2e8; }
.report-message { border:0; background:transparent; color:#a0a4ad; padding:0; font-size:11px; cursor:pointer; }.report-message:hover{color:#f56c6c}
.avatar { position:relative; overflow:hidden; }
.avatar img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:cover; }
.back-link { margin-left:auto; color:#a86f00; font-size:11px; text-decoration:none; white-space:nowrap; }.back-link:hover,.user-link:hover{color:#d28c00;text-decoration:underline}.user-link{display:inline-block;width:fit-content;max-width:100%;cursor:pointer}.conversation-copy b.user-link{display:block;width:fit-content;max-width:100%}
.conversation-copy small{max-width:170px;color:#a0a4ad;line-height:1.35}.conversation-side{align-self:stretch;display:flex;min-width:38px;flex-direction:column;align-items:flex-end;justify-content:space-between;padding:2px 0}.conversation-side time{color:#aeb2b9;font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap}.conversation-side em{display:grid;min-width:19px;height:19px;padding:0 5px;place-items:center;border-radius:10px;background:#ef4d4d;color:#fff;font-size:10px;font-style:normal;font-weight:800;box-shadow:0 3px 9px rgba(239,77,77,.24)}.conversation.active .conversation-side em{background:#e34949}
.modal-mask{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(25,29,35,.42);backdrop-filter:blur(3px)}
.report-dialog{width:min(500px,100%);padding:22px;border:1px solid #e3e5e9;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(20,25,32,.22)}
.report-dialog header{display:flex;justify-content:space-between;align-items:flex-start}.report-dialog header small{color:#c88700}.report-dialog h2{margin:5px 0 0}.report-dialog header button{border:0;background:transparent;color:#8c929b;font-size:26px;cursor:pointer}.report-dialog>p{color:#7f858e;font-size:13px;line-height:1.7}
.report-dialog label{display:grid;grid-template-columns:1fr auto;gap:8px;color:#4f555d;font-size:13px}.report-dialog label span{color:#a0a5ad}.report-dialog textarea{grid-column:1/-1;min-height:120px;resize:vertical;padding:12px;border:1px solid #dfe2e7;border-radius:10px;outline:none}.report-dialog textarea:focus{border-color:#fec433;box-shadow:0 0 0 3px #fff5d6}.report-dialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.report-dialog footer button{height:38px;padding:0 17px;border:0;border-radius:9px;background:#fec433;font-weight:700;cursor:pointer}.report-dialog footer button.ghost{border:1px solid #dfe2e7;background:#fff;color:#666}.report-dialog footer button:disabled{opacity:.5}.dialog-error{margin-top:10px;padding:9px 11px;border-radius:8px;background:#fff1f1;color:#d34b4b;font-size:12px}
.toast{position:fixed;z-index:1100;top:24px;left:50%;transform:translateX(-50%);padding:11px 18px;border:1px solid #dce7d8;border-radius:10px;background:#f2fbef;color:#38823b;box-shadow:0 10px 30px rgba(31,35,41,.16)}.toast.error{border-color:#f3c1c1;background:#fff2f2;color:#c74343}.toast.warning{border-color:#f0d27c;background:#fff9e6;color:#a86f00}
.session-expired{z-index:1200}.reauth-button{display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:9px;background:#fec433;color:#20242a;font-weight:700;text-decoration:none}
.captcha-dialog{width:min(420px,100%)}.captcha-box{min-height:44px;margin-top:16px}
.auth-failure .orb{background:#fff0f0;color:#d84b4b}.auth-failure p{max-width:520px}.auth-failure .reauth-button{margin-top:10px}.auth-diagnostic{display:grid;grid-template-columns:repeat(2,auto);gap:7px 16px;margin-top:8px;padding:13px 16px;border:1px solid #eadfca;border-radius:11px;background:#fffaf0;color:#6f6552;font-size:11px;text-align:left}.auth-diagnostic b,.auth-diagnostic small{grid-column:1/-1}.auth-diagnostic b{color:#3b352b}.auth-diagnostic small{color:#948a78;line-height:1.55}
.conversation-list{min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain}.mobile-back{display:none}
.search-launcher{width:100%;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border:1px solid #dfe3eb;border-radius:12px;background:#fafbfc;color:#737d8e;text-align:left;cursor:pointer;transition:.18s}.search-launcher:hover{border-color:#fec433;background:#fff}.search-launcher>span:nth-child(2){flex:1}.search-launcher kbd{border:0;background:transparent;color:#b47b00;font:600 11px inherit}.rail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.rail-actions>button{display:grid;grid-template-columns:30px 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;padding:10px;border:1px solid #e4e7ed;border-radius:12px;background:#fff;color:#222c3d;text-align:left;cursor:pointer;transition:.18s}.rail-actions>button:hover{transform:translateY(-1px);border-color:#d7dce6;box-shadow:0 8px 20px rgba(27,39,65,.08)}.rail-actions>button.primary{border-color:#f3c451;background:#fff9e8}.rail-action-icon{grid-row:1/3;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#f0f3f8;color:#59657a;font-size:12px;font-weight:800}.primary .rail-action-icon{background:#fec433;color:#242936}.rail-actions b{font-size:12px}.rail-actions small{margin-top:2px;color:#9aa1ad;font-size:9px}
.im-dialog{width:min(680px,100%);max-height:calc(100dvh - 36px);overflow:auto;border:1px solid rgba(226,230,238,.95);border-radius:24px;background:#fff;box-shadow:0 28px 90px rgba(20,28,44,.25)}.im-dialog>header{display:flex;align-items:flex-start;justify-content:space-between;padding:24px 26px 18px}.im-dialog>header small{color:#b47b00;font-size:11px;font-weight:700}.im-dialog h2{margin:5px 0 0;color:#172033;font-size:24px}.im-dialog>header>button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:#f5f6f8;color:#737c8c;font-size:23px;cursor:pointer}.dialog-search{display:flex;align-items:center;gap:10px;margin:0 26px;padding:6px 7px 6px 14px;border:1px solid #dfe3ea;border-radius:14px;background:#fafbfc}.dialog-search:focus-within{border-color:#fec433;box-shadow:0 0 0 3px rgba(254,196,51,.14);background:#fff}.dialog-search input{min-width:0;flex:1;height:34px;border:0;outline:0;background:transparent;color:#222b3c}.dialog-search button,.directory-results article>button{height:36px;padding:0 14px;border:0;border-radius:10px;background:#172033;color:#fff;font-weight:700;cursor:pointer}.dialog-search button:disabled{opacity:.5}.result-tabs{display:flex;gap:4px;margin:18px 26px 0;border-bottom:1px solid #eaedf2}.result-tabs button{position:relative;padding:12px 15px;border:0;background:transparent;color:#778194;font-weight:700;cursor:pointer}.result-tabs button.active{color:#172033}.result-tabs button.active:after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:3px;border-radius:3px;background:#fec433}.result-tabs em{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:4px;border-radius:10px;background:#f0f2f6;color:#7c8492;font-size:10px;font-style:normal}.directory-results{min-height:250px;max-height:390px;overflow:auto;padding:12px 26px 24px}.directory-results article{display:flex;align-items:center;gap:12px;padding:11px 10px;border-radius:14px;transition:.16s}.directory-results article:hover{background:#f7f8fb}.directory-results article>div{min-width:0;flex:1}.directory-results article b,.directory-results article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.directory-results article b{color:#263044;font-size:14px}.directory-results article small{margin-top:4px;color:#989fac;font-size:11px}.directory-results article>button{height:34px;background:#fff4ce;color:#9a6900}.directory-results article>button:hover,.directory-results article>button.selected{background:#fec433;color:#20242a}.group-avatar{background:#172033;color:#fff}.dialog-empty{display:grid;place-items:center;min-height:190px;color:#a0a7b2;font-size:13px}
.group-wizard{width:min(640px,100%)}.wizard-progress{display:flex;gap:7px;padding:0 26px}.wizard-progress i{height:4px;flex:1;border-radius:4px;background:#edf0f4}.wizard-progress i.active{background:linear-gradient(90deg,#fec433,#ffd76a)}.wizard-page{min-height:290px;padding:30px 26px 20px}.wizard-page>label{position:relative;display:block;color:#4c576a;font-size:12px;font-weight:700}.wizard-page>label input{display:block;width:100%;height:50px;margin-top:10px;padding:0 48px 0 15px;border:1px solid #dfe3ea;border-radius:13px;outline:0;background:#fafbfc;color:#202a3c;font-size:15px}.wizard-page>label input:focus{border-color:#fec433;box-shadow:0 0 0 3px rgba(254,196,51,.14);background:#fff}.wizard-page>label>span{position:absolute;right:14px;bottom:17px;color:#a1a7b1;font-weight:400}.wizard-note{margin-top:18px;padding:18px;border-radius:14px;background:linear-gradient(135deg,#fff9e8,#fffdf7)}.wizard-note b{color:#403718}.wizard-note p{margin:6px 0 0;color:#8d8368;font-size:12px}.wizard-page .dialog-search{margin:0}.selected-members{display:flex;gap:7px;flex-wrap:wrap;padding:14px 0 4px}.selected-members button{padding:7px 10px;border:0;border-radius:9px;background:#fff3c9;color:#8f6500;font-size:11px;cursor:pointer}.directory-results.compact{min-height:160px;max-height:210px;padding:8px 0}.confirm-page{display:grid;align-content:start;gap:18px}.group-preview{display:flex;align-items:center;gap:14px;padding:18px;border:1px solid #e6e9ef;border-radius:16px;background:#fafbfc}.group-preview>span{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#fec433;font-weight:900}.group-preview b,.group-preview small{display:block}.group-preview small{margin-top:5px;color:#9299a6}.confirm-members{display:grid;grid-template-columns:90px 1fr;gap:12px;padding:18px;border-radius:15px;background:#f7f8fa;font-size:12px}.confirm-members span{color:#9299a6}.confirm-members b{color:#404a5d}.im-dialog>footer{display:flex;justify-content:flex-end;gap:10px;padding:17px 26px 22px;border-top:1px solid #edf0f4}.im-dialog>footer button{height:42px;padding:0 20px;border:0;border-radius:11px;background:#fec433;color:#20242a;font-weight:800;cursor:pointer}.im-dialog>footer button.ghost{border:1px solid #dfe3ea;background:#fff;color:#657084}.im-dialog>footer button:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:820px), (max-device-width:820px){
  .terminal-shell{display:block;width:100%;height:100vh;height:100dvh;min-height:0;padding:0;overflow:hidden;background:#fff}
  .rail,.channel{width:100%;height:100%;min-height:0;border:0;border-radius:0;box-shadow:none}
  .rail{display:flex;padding:max(14px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom))}
  .brand{padding:0 4px 12px}.brand-mark{width:38px;height:38px;border-radius:11px}.brand b{font-size:16px}.brand small{letter-spacing:.08em}.back-link{min-height:40px;display:inline-flex;align-items:center;font-size:12px}
  .search{height:46px}.search button{min-width:48px;min-height:42px}.rail-title{margin-top:13px}.rail-title button{width:40px;height:40px}.conversation{min-height:64px;padding:10px}.conversation .avatar{width:44px;height:44px}.conversation-copy b{font-size:15px}.conversation-copy small{font-size:11px}
  .account{padding:11px 5px 0;background:#fff}.account .avatar{width:40px;height:40px}
  .channel{display:none;grid-template-rows:62px minmax(0,1fr) auto;background:#fafafa}
  .mobile-channel-open .rail{display:none}.mobile-channel-open .channel{display:grid}
  .channel>header{position:relative;padding:max(9px,env(safe-area-inset-top)) 52px 9px;min-height:62px}.channel h1{max-width:calc(100vw - 120px);margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.channel header small{font-size:9px}.signal{position:absolute;right:16px}
  .mobile-back{position:absolute;left:10px;top:50%;display:grid;place-items:center;width:36px;height:36px;padding:0;transform:translateY(-50%);border:1px solid #e1e4e9;border-radius:50%;background:#fff;color:#555;font-size:29px;line-height:1;cursor:pointer}
  .timeline{min-height:0;padding:14px 12px 8px}.welcome .orb{width:64px;height:64px;border-radius:19px;font-size:29px}.welcome h2{font-size:20px;margin-top:16px}.welcome p{padding:0 20px;font-size:13px;line-height:1.6}
  .message{max-width:94%;gap:8px;margin-bottom:14px}.message>.avatar{width:34px;height:34px}.message-meta{gap:6px;flex-wrap:wrap}.message p{margin-top:5px;padding:9px 11px;line-height:1.55}.message-image{max-width:min(72vw,320px);max-height:300px}
  .composer{margin:6px 8px max(8px,env(safe-area-inset-bottom));border-radius:12px}.composer textarea{height:56px;padding:10px 11px;font-size:16px}.composer footer{padding:6px 7px}.composer footer>span{max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.image-button{min-height:40px;padding:8px 11px}.composer button{min-height:40px;padding:8px 14px}
  .modal-mask{padding:0;align-items:end}.report-dialog{max-height:calc(100dvh - 24px);overflow-y:auto;padding:18px;border-radius:15px}.report-dialog textarea{min-height:100px}.im-dialog{width:100%;max-height:92dvh;border-radius:24px 24px 0 0}.im-dialog>header{padding:20px 18px 15px}.im-dialog h2{font-size:21px}.dialog-search{margin:0 18px}.result-tabs{margin:14px 18px 0}.directory-results{padding:10px 12px 20px}.wizard-progress{padding:0 18px}.wizard-page{min-height:300px;padding:24px 18px 18px}.im-dialog>footer{position:sticky;bottom:0;padding:14px 18px max(14px,env(safe-area-inset-bottom));background:#fff}.rail-actions>button{padding:9px 8px}
  .toast{top:max(12px,env(safe-area-inset-top));width:calc(100% - 24px);text-align:center}
}
.terminal-shell.mobile-layout{display:block;width:100%;height:100vh;height:100dvh;height:var(--im-viewport-height,100dvh);min-height:0;padding:0;overflow:hidden;background:#fff}
.mobile-layout .rail,.mobile-layout .channel{width:100%;height:100%;min-height:0;border:0;border-radius:0;box-shadow:none}
.mobile-layout .rail{display:flex;padding:max(14px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom));overscroll-behavior:none}
.mobile-layout .brand{padding:0 4px 12px}.mobile-layout .brand-mark{width:38px;height:38px;border-radius:11px}.mobile-layout .brand b{font-size:16px}.mobile-layout .brand small{letter-spacing:.08em}.mobile-layout .back-link{min-height:40px;display:inline-flex;align-items:center;font-size:12px}
.mobile-layout .search{height:46px}.mobile-layout .search button{min-width:48px;min-height:42px}.mobile-layout .rail-title{margin-top:13px}.mobile-layout .rail-title button{width:40px;height:40px}.mobile-layout .conversation{min-height:64px;padding:10px}.mobile-layout .conversation .avatar{width:44px;height:44px}.mobile-layout .conversation-copy b{font-size:15px}.mobile-layout .conversation-copy small{font-size:11px}
.mobile-layout .account{padding:11px 5px 0;background:#fff}.mobile-layout .account .avatar{width:40px;height:40px}
.mobile-layout .channel{display:none;grid-template-rows:62px minmax(0,1fr) auto;background:#fafafa}.mobile-layout.mobile-channel-open .rail{display:none}.mobile-layout.mobile-channel-open .channel{display:grid}
.mobile-layout .channel>header{position:relative;padding:max(9px,env(safe-area-inset-top)) 52px 9px;min-height:62px}.mobile-layout .channel h1{max-width:calc(100vw - 120px);margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mobile-layout .channel header small{font-size:9px}.mobile-layout .signal{position:absolute;right:16px}
.mobile-layout .mobile-back{position:absolute;left:10px;top:50%;display:grid;place-items:center;width:36px;height:36px;padding:0;transform:translateY(-50%);border:1px solid #e1e4e9;border-radius:50%;background:#fff;color:#555;font-size:29px;line-height:1;cursor:pointer}
.mobile-layout .timeline{min-height:0;padding:14px 12px 8px;overscroll-behavior:contain}.mobile-layout .welcome .orb{width:64px;height:64px;border-radius:19px;font-size:29px}.mobile-layout .welcome h2{font-size:20px;margin-top:16px}.mobile-layout .welcome p{padding:0 20px;font-size:13px;line-height:1.6}
.mobile-layout .message{max-width:94%;gap:8px;margin-bottom:14px}.mobile-layout .message>.avatar{width:34px;height:34px}.mobile-layout .message-meta{gap:6px;flex-wrap:wrap}.mobile-layout .message p{margin-top:5px;padding:9px 11px;line-height:1.55}.mobile-layout .message-image{max-width:min(72vw,320px);max-height:300px}
.mobile-layout .composer{margin:6px 8px max(8px,env(safe-area-inset-bottom));border-radius:12px}.mobile-layout .composer textarea{height:56px;padding:10px 11px;font-size:16px}.mobile-layout .composer footer{padding:6px 7px}.mobile-layout .composer footer>span{max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mobile-layout .image-button{min-height:40px;padding:8px 11px}.mobile-layout .composer button{min-height:40px;padding:8px 14px}
.group-info-link{border:0;background:transparent;padding:0;margin-top:3px;color:#b47b00;font-size:11px;cursor:pointer;white-space:nowrap}.group-info-link:hover{color:#d28c00;text-decoration:underline}
.group-manage{width:min(560px,100%)}.group-manage-meta{margin:0 26px 14px;padding:11px 14px;border-radius:10px;background:#f7f8fa;color:#5f6876;font-size:12px}
.group-rename{margin-bottom:14px}.group-rename>span{color:#b47b00;font-weight:700}.group-rename button{height:34px;padding:0 14px;border:0;border-radius:10px;background:#fec433;color:#20242a;font-weight:800;cursor:pointer}.group-rename button:disabled{opacity:.45}
.group-invite{margin:0 26px 16px}.group-invite>small{display:block;margin-bottom:8px;color:#9aa1ad;font-size:11px}.group-invite .dialog-search{margin:0}.invite-results{max-height:180px;overflow:auto;margin-top:8px;border:1px solid #edf0f4;border-radius:12px}.invite-results article{display:flex;align-items:center;gap:10px;padding:9px 12px}.invite-results article+article{border-top:1px solid #f0f2f5}.invite-results article>div{min-width:0;flex:1}.invite-results article b,.invite-results article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.invite-results article b{font-size:13px}.invite-results article small{margin-top:3px;color:#9aa1ad;font-size:11px}.invite-results article>button{height:30px;padding:0 12px;border:0;border-radius:8px;background:#fff4ce;color:#9a6900;font-size:12px;font-weight:700;cursor:pointer}.invite-results article>button:hover{background:#fec433;color:#20242a}
.member-list{min-height:120px;max-height:300px;overflow:auto;margin:0 26px;border:1px solid #edf0f4;border-radius:14px}.member-row{display:flex;align-items:center;gap:12px;padding:11px 14px}.member-row+.member-row{border-top:1px solid #f0f2f5}.member-row .avatar{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#f0f2f6;color:#59657a;font-weight:800}.member-main{min-width:0;flex:1}.member-main b{display:block;color:#263044;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-main small{display:block;margin-top:3px;color:#989fac;font-size:11px}.member-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.member-actions button{height:28px;padding:0 10px;border:1px solid #e3e6ec;border-radius:8px;background:#fff;color:#4a5468;font-size:11px;cursor:pointer}.member-actions button:hover{border-color:#fec433;color:#8f6500}.member-actions button.danger{color:#d04b4b}.member-actions button.danger:hover{border-color:#f3c1c1;background:#fff2f2;color:#c74343}
.im-dialog>footer button.danger{background:#e5484d;color:#fff}.im-dialog>footer button.ghost.danger{background:#fff;border-color:#f0c0c0;color:#d04b4b}
@media(max-width:820px), (max-device-width:820px){
  .group-manage-meta{margin:0 18px 12px}.group-invite{margin:0 18px 14px}.member-list{margin:0 18px}
}
.mobile-layout .intel{display:none}.mobile-layout .modal-mask{padding:0;align-items:end}.mobile-layout .report-dialog{max-height:calc(100dvh - 24px);overflow-y:auto;padding:18px;border-radius:15px}.mobile-layout .report-dialog textarea{min-height:100px}.mobile-layout .im-dialog{width:100%;max-height:92dvh;border-radius:24px 24px 0 0}.mobile-layout .im-dialog>header{padding:20px 18px 15px}.mobile-layout .dialog-search{margin:0 18px}.mobile-layout .result-tabs{margin:14px 18px 0}.mobile-layout .directory-results{padding:10px 12px 20px}.mobile-layout .wizard-progress{padding:0 18px}.mobile-layout .wizard-page{padding:24px 18px 18px}.mobile-layout .im-dialog>footer{position:sticky;bottom:0;padding:14px 18px max(14px,env(safe-area-inset-bottom));background:#fff}.mobile-layout .toast{top:max(12px,env(safe-area-inset-top));width:calc(100% - 24px);text-align:center}
</style>
