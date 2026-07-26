<template>
  <p v-if="!card" class="social-card-text"><template v-for="(segment,index) in textSegments" :key="index"><mark v-if="segment.mention">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></p>
  <button v-else class="social-card" type="button" @click="openCard">
    <span class="social-card__mark">狗</span>
    <span class="social-card__body">
      <small>{{ card.type === 'user' ? '编程狗私聊名片' : card.type === 'studio' ? '编程狗工作室' : '编程狗群聊邀请' }}</small>
      <b>{{ card.type === 'user' ? (author?.nickname || author?.username || `用户 ${card.target_id}`) : card.type === 'studio' ? (card.target_name || `工作室 #${card.target_id}`) : `群聊 #${card.target_id}` }}</b>
      <span>{{ card.type === 'user' ? '点击卡片快速发起私聊' : card.type === 'studio' ? '点击查看工作室主页和作品' : '点击卡片加入群聊，一起交流吧' }}</span>
    </span>
    <strong>{{ card.type === 'user' ? '发起私聊' : card.type === 'studio' ? '查看工作室' : '加入群聊' }} ›</strong>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { imApi } from '@/api/im'
const props = defineProps({ content: { type:String, default:'' }, author: { type:Object, default:null } })
const prefix = '[[codedog-social-card]]'
const getSafeExternalUrl = (value) => {
  if (!value) return ''
  try {
    const url = new URL(String(value))
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const card = computed(() => {
  if (!props.content.startsWith(prefix)) return null
  try { const value=JSON.parse(props.content.slice(prefix.length)); return ['user','group','studio'].includes(value.type) && Number(value.target_id)>0 ? value : null } catch { return null }
})
const textSegments = computed(() => {
  const parts = []
  const pattern = /(^|[\s，。！？、(（])@([A-Za-z0-9_.-]{2,50})/g
  let cursor = 0
  for (const match of props.content.matchAll(pattern)) {
    const mentionStart = match.index + match[1].length
    if (mentionStart > cursor) parts.push({ text: props.content.slice(cursor, mentionStart), mention: false })
    parts.push({ text: `@${match[2]}`, mention: true })
    cursor = match.index + match[0].length
  }
  if (cursor < props.content.length) parts.push({ text: props.content.slice(cursor), mention: false })
  return parts.length ? parts : [{ text: props.content, mention: false }]
})
const openCard = async () => {
  if (card.value.type === 'studio') { window.open(`/studio/${Number(card.value.target_id)}`, '_blank', 'noopener,noreferrer'); return }
  const popup = window.open('about:blank', '_blank')
  try {
    const action = card.value.type === 'user' ? { action:'direct', user_id:Number(card.value.target_id) } : { action:'group', group_id:Number(card.value.target_id) }
    const res = await imApi.createSsoTicket(action)
    const safeUrl = getSafeExternalUrl(res.data?.url)
    if (res.code !== 200 || !safeUrl) throw new Error(res.msg || '即时通讯暂不可用')
    if (popup) popup.location.href = safeUrl
    else window.open(safeUrl, '_blank', 'noopener,noreferrer')
  } catch (error) { popup?.close(); ElMessage.error(error.response?.data?.msg || error.message || '无法打开卡片') }
}
</script>

<style scoped>
.social-card-text mark{padding:1px 3px;border-radius:4px;background:#fff1bd;color:#9a6800;font-weight:700}
.social-card-text{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.social-card{width:min(100%,440px);display:flex;align-items:center;gap:12px;margin:9px 0;padding:14px;border:1px solid #f0d27c;border-radius:14px;background:linear-gradient(135deg,#fffdf7,#fff7d8);color:#30343a;text-align:left;cursor:pointer;box-shadow:0 7px 20px rgba(120,92,20,.08);transition:.18s}.social-card:hover{transform:translateY(-1px);border-color:#fec433;box-shadow:0 10px 24px rgba(120,92,20,.14)}.social-card__mark{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:#fec433;color:#292929;font-size:20px;font-weight:900}.social-card__body{min-width:0;display:grid;gap:2px;flex:1}.social-card__body small{color:#b27a00}.social-card__body b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.social-card__body span{color:#8a7d5d;font-size:12px}.social-card>strong{flex:none;color:#b77800;font-size:12px}
</style>
