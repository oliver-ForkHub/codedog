<template>
  <div class="r-work--page" v-loading="loading">
    <div class="r-work--container" v-if="work">
      <!-- 作品预览区 -->
      <div class="r-work--preview_section">
        <div class="r-work--preview_wrapper">
          <iframe 
            v-if="playerUrl"
            :src="playerUrl"
            class="r-work--player"
            ref="playerFrameRef"
            @focus="setPlayerFocused(true)"
            @blur="setPlayerFocused(false)"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerpolicy="no-referrer"
            allowfullscreen
          ></iframe>
          <div v-else class="r-work--no_preview">
            <span class="r-work--no_preview_icon"></span>
            <p>暂无预览</p>
          </div>
        </div>
      </div>
      
      <!-- 作品信息区 -->
      <div class="r-work--info_section">
        <div class="r-work--main_info">
          <h1 class="r-work--title">{{ work.name }}</h1>
          <div
            class="r-work--description_wrapper"
            :class="{ 'is-collapsed': shouldCollapseDescription && !descriptionExpanded }"
          >
            <div class="r-work--desc markdown-body" v-html="renderedDescription"></div>
          </div>
          <button
            v-if="shouldCollapseDescription"
            type="button"
            class="r-work--description_toggle"
            :aria-expanded="descriptionExpanded"
            @click="descriptionExpanded = !descriptionExpanded"
          >
            {{ descriptionExpanded ? '收起简介' : '展开完整简介' }}
          </button>
          
          <div class="r-work--meta">
            <div class="r-work--author" @click="goToAuthor">
              <AppImage :src="work.author?.avatar || defaultAvatar" :fallback="defaultAvatar" class="r-work--author_avatar" />
              <div class="r-work--author_info">
                <span class="r-work--author_name">{{ work.author?.nickname || work.author?.username || work.codemao_author_name }}</span>
                <span class="r-work--publish_time">发布于 {{ formatTime(work.created_at) }}</span>
              </div>
            </div>
            
            <div class="r-work--stats">
              <span class="r-work--stat_item">
                <span class="r-work--stat_icon r-work--stat_icon_view"></span>
                {{ work.view_times || 0 }}
              </span>
              <span class="r-work--stat_item">
                <span class="r-work--stat_icon r-work--stat_icon_like"></span>
                {{ work.praise_times || 0 }}
              </span>
              <span class="r-work--stat_item">
                <span class="r-work--stat_icon r-work--stat_icon_comment"></span>
                {{ work.comment_count || 0 }}
              </span>
            </div>
          </div>
          
          <div class="r-work--tags" v-if="work.type || work.ide_type">
            <el-tag class="r-work--tag" effect="dark">{{ getTypeName(work.type || work.ide_type) }}</el-tag>
          </div>
          
          <div class="r-work--actions">
            <el-button
              :type="work.liked ? 'danger' : 'primary'"
              class="r-work--action_btn r-work--action_btn_like"
              @click="likeWork"
              :loading="likeLoading"
              :style="{ width: 'auto' }"
            >
              <el-icon class="el-icon--left" v-if="!work.liked && !likeLoading"><Pointer /></el-icon>
              <el-icon class="el-icon--left" v-else-if="work.liked && !likeLoading"><Pointer /></el-icon>
              {{ work.liked ? '已点赞' : '点赞' }}
            </el-button>
            <el-button 
              :type="isFavorited ? 'warning' : 'default'" 
              class="r-work--action_btn" 
              @click="toggleFavorite"
              :loading="favoriteLoading"
            >
              <el-icon class="el-icon--left" v-if="!isFavorited"><Star /></el-icon>
              <el-icon class="el-icon--left" v-else><StarFilled /></el-icon>
              {{ isFavorited ? '已收藏' : '收藏' }}
            </el-button>
            <el-button class="r-work--action_btn" @click="showShareDialog">
              <el-icon class="el-icon--left"><Share /></el-icon>
              分享
            </el-button>
            <el-dropdown trigger="click" @command="handleMoreAction">
              <el-button class="r-work--action_btn">
                <el-icon class="el-icon--left"><More /></el-icon>
                更多
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit" v-if="work.user_id === userStore.user?.id"><el-icon><Edit /></el-icon>编辑作品</el-dropdown-item>
                  <el-dropdown-item command="report"><el-icon><Warning /></el-icon>举报作品</el-dropdown-item>
                  <el-dropdown-item command="copyLink"><el-icon><CopyDocument /></el-icon>复制链接</el-dropdown-item>
                  <el-dropdown-item command="openOriginal" v-if="work.codemao_work_id"><el-icon><Link /></el-icon>查看原作品</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          
          <!-- 评论区 -->
          <div class="r-work--comments_section">
            <h3 class="r-work--comments_title">
              评论 <span class="r-work--comments_count">({{ work.comment_count || 0 }})</span>
            </h3>
            
            <!-- 发表评论 -->
            <div class="r-work--comment_form" v-if="userStore.isLoggedIn">
              <div v-if="replyingTo" class="r-work--replying_to">
                回复 @{{ replyingTo.user?.nickname || replyingTo.user?.username }}
                <span class="r-work--cancel_reply" @click="cancelReply">取消</span>
              </div>
              <el-input
                v-model="commentContent"
                type="textarea"
                :rows="3"
                :placeholder="replyingTo ? '写下你的回复...' : '写下你的评论...'"
                maxlength="500"
                show-word-limit
              />
              <SocialCardPicker :selected="selectedSocialCard" @select="selectSocialCard" @clear="selectedSocialCard = null" />
              <el-button type="primary" :loading="submitting" @click="submitComment">
                {{ replyingTo ? '回复' : '发表评论' }}
              </el-button>
            </div>
            <div class="r-work--login_tip" v-else>
              <router-link to="/login">登录</router-link> 后参与讨论
            </div>
            
            <!-- 评论列表 -->
            <div class="r-work--comment_list" v-loading="loadingComments">
              <div v-for="comment in comments" :key="comment.id" class="r-work--comment_item">
                <AppImage :src="comment.user?.avatar || defaultAvatar" :fallback="defaultAvatar" class="r-work--comment_avatar" @click="goUser(comment.user)" style="cursor: pointer;" />
                <div class="r-work--comment_body">
                  <div class="r-work--comment_header">
                    <span class="r-work--comment_name" @click="goUser(comment.user)" style="cursor: pointer;">{{ comment.user?.nickname || comment.user?.username }}</span>
                    <span class="r-work--comment_time">{{ formatTime(comment.created_at) }}</span>
                  </div>
                  <SocialCommentCard :content="comment.content" :author="comment.user" />
                  <div class="r-work--comment_actions">
                    <span @click="likeComment(comment)" :class="{ 'r-work--comment_liked': comment.liked }">
                      <span class="r-work--comment_icon r-work--comment_icon_like"></span>
                      {{ comment.like_count || 0 }}
                    </span>
                    <span @click="replyTo(comment)">
                      <span class="r-work--comment_icon r-work--comment_icon_reply"></span>
                      回复
                    </span>
                    <span v-if="comment.user_id === userStore.user?.id" @click="deleteComment(comment)" class="r-work--comment_delete">
                      删除
                    </span>
                    <span v-else @click="reportComment(comment)" class="r-work--comment_report">
                      举报
                    </span>
                  </div>
                  
                  <!-- 回复列表 -->
                  <div class="r-work--replies" v-if="comment.replies && comment.replies.length > 0">
                    <template v-for="(reply, index) in getVisibleReplies(comment)" :key="reply.id">
                      <div class="r-work--reply_item">
                        <AppImage :src="reply.user?.avatar || defaultAvatar" :fallback="defaultAvatar" class="r-work--reply_avatar" @click="goUser(reply.user)" style="cursor: pointer;" />
                        <div class="r-work--reply_body">
                          <div class="r-work--reply_header">
                            <span class="r-work--reply_name" @click="goUser(reply.user)" style="cursor: pointer;">{{ reply.user?.nickname || reply.user?.username }}</span>
                            <span class="r-work--reply_time">{{ formatTime(reply.created_at) }}</span>
                          </div>
                          <div class="r-work--reply_content">
                            <span v-if="reply.reply_to_user_id" class="r-work--reply_to" @click="goUserById(reply.reply_to_user_id)" style="cursor: pointer;">
                              回复 @{{ getReplyToName(reply) }}：
                            </span>
                            <SocialCommentCard :content="reply.content" :author="reply.user" />
                          </div>
                          <div class="r-work--reply_actions">
                            <span @click="likeComment(reply)" :class="{ 'r-work--comment_liked': reply.liked }">
                              <span class="r-work--comment_icon r-work--comment_icon_like"></span>
                              {{ reply.like_count || 0 }}
                            </span>
                            <span @click="replyTo(reply)">
                              <span class="r-work--comment_icon r-work--comment_icon_reply"></span>
                              回复
                            </span>
                            <span v-if="reply.user_id === userStore.user?.id" @click="deleteComment(reply)" class="r-work--comment_delete">
                              删除
                            </span>
                            <span v-else @click="reportComment(reply)" class="r-work--comment_report">
                              举报
                            </span>
                          </div>
                        </div>
                      </div>
                    </template>
                    <div class="r-work--reply_more" v-if="comment.replies.length > 3">
                      <span v-if="!expandedComments.has(comment.id)" @click="expandReplies(comment.id)">
                                展开更多回复 ({{ comment.replies.length - 3 }}条)
                              </span>
                              <span v-else @click="collapseReplies(comment.id)">
                                收起回复
                              </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <el-empty v-if="!loadingComments && comments.length === 0" description="暂无评论，快来抢沙发吧~" />
            </div>
          </div>
        </div>
        
        <!-- 侧边栏 -->
        <aside class="r-work--sidebar">
          <div class="r-work--side_card">
            <h4 class="r-work--card_title">作品信息</h4>
            <ul class="r-work--info_list">
              <li>
                <span class="r-work--info_label">作品ID</span>
                <span class="r-work--info_value">{{ work.codemao_work_id }}</span>
              </li>
              <li>
                <span class="r-work--info_label">作品类型</span>
                <span class="r-work--info_value">{{ getTypeName(work.type || work.ide_type) }}</span>
              </li>
              <li>
                <span class="r-work--info_label">来源</span>
                <span class="r-work--info_value">编程猫</span>
              </li>
            </ul>
          </div>
          
          <div class="r-work--side_card">
            <h4 class="r-work--card_title">相关推荐</h4>
            <div class="r-work--related_list" v-loading="loadingRelated">
              <a 
                v-for="item in relatedWorks" 
                :key="item.id"
                class="r-work--related_item"
                @click="$router.push(`/work/${item.codemao_work_id}`)"
              >
                <div class="r-work--related_cover" :style="{ backgroundImage: `url(${item.preview})` }"></div>
                <div class="r-work--related_info">
                  <p class="r-work--related_title">{{ item.name }}</p>
                  <p class="r-work--related_author">{{ item.author?.nickname }}</p>
                </div>
              </a>
              <el-empty v-if="!loadingRelated && relatedWorks.length === 0" description="暂无推荐" :image-size="60" />
            </div>
          </div>
        </aside>
      </div>
    </div>
    
    <el-empty v-else-if="!loading" description="作品不存在" />
    
    <!-- 分享对话框 -->
    <el-dialog v-model="shareDialogVisible" title="分享作品" width="400px">
      <div class="r-work--share_content">
        <div class="r-work--share_qrcode">
          <img :src="qrcodeUrl" alt="二维码" v-if="qrcodeUrl" />
          <p>扫码查看作品</p>
        </div>
        <div class="r-work--share_link">
          <el-input v-model="shareLink" readonly>
            <template #append>
              <el-button @click="copyShareLink">复制</el-button>
            </template>
          </el-input>
        </div>
        <div class="r-work--share_platforms">
          <span class="r-work--share_label">分享到：</span>
          <el-button circle size="small" @click="shareToWeibo" title="微博">
            <span class="r-work--share_icon r-work--share_icon_weibo"></span>
          </el-button>
          <el-button circle size="small" @click="shareToQQ" title="QQ">
            <span class="r-work--share_icon r-work--share_icon_qq"></span>
          </el-button>
        </div>
      </div>
    </el-dialog>
    
    <!-- 举报对话框 -->
    <el-dialog v-model="reportDialogVisible" title="举报作品" width="450px">
      <el-form :model="reportForm" label-width="80px">
        <el-form-item label="举报原因">
          <el-select v-model="reportForm.reason" placeholder="请选择举报原因" style="width: 100%">
            <el-option label="内容违规" value="内容违规" />
            <el-option label="侵权内容" value="侵权内容" />
            <el-option label="垃圾广告" value="垃圾广告" />
            <el-option label="恶意刷屏" value="恶意刷屏" />
            <el-option label="其他原因" value="其他原因" />
          </el-select>
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="reportForm.description" type="textarea" :rows="4" placeholder="请详细描述举报原因（选填）" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReport" :loading="reportSubmitting">提交举报</el-button>
      </template>
    </el-dialog>
    
    <!-- 编辑作品对话框 -->
    <el-dialog v-model="editWorkVisible" title="编辑作品信息" width="500px">
      <el-form :model="editWorkForm" label-width="80px">
        <el-form-item label="作品名称">
          <el-input v-model="editWorkForm.name" placeholder="请输入作品名称" />
        </el-form-item>
        <el-form-item label="作品描述">
          <el-input v-model="editWorkForm.description" type="textarea" :rows="4" placeholder="请输入作品描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editWorkVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEditWork" :loading="editWorkSubmitting">保存</el-button>
      </template>
    </el-dialog>
    
    <!-- 验证码弹窗 -->
    <GeetestDialog ref="geetestDialogRef" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { workApi } from '@/api/work'
import { commentApi } from '@/api/comment'
import GeetestDialog from '@/components/GeetestDialog.vue'
import { geetestApi } from '@/api/geetest'
import { favoriteApi } from '@/api/favorite'
import { reportApi } from '@/api/report'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Pointer, Star, StarFilled, Share, More, Warning, CopyDocument, Link, Edit } from '@element-plus/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import AppImage from '@/components/AppImage.vue'
import SocialCommentCard from '@/components/SocialCommentCard.vue'
import SocialCardPicker from '@/components/SocialCardPicker.vue'

// 配置 marked
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true
})

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const loading = ref(true)
const playerFrameRef = ref(null)
const descriptionExpanded = ref(false)
const WORK_DESCRIPTION_MAX_LENGTH = 10000

const descriptionSource = computed(() => String(work.value?.description || '').slice(0, WORK_DESCRIPTION_MAX_LENGTH))
const shouldCollapseDescription = computed(() => {
  const source = descriptionSource.value
  return source.length > 600 || (source.match(/\n/g)?.length || 0) > 8
})

const renderedDescription = computed(() => {
  if (!work.value?.description) return '暂无描述'
  // Markdown 本身不负责安全过滤；仅保留简介排版所需标签和链接属性。
  // 图片明确禁止，事件、样式、表单和嵌入内容因不在白名单中一并移除。
  return DOMPurify.sanitize(marked(descriptionSource.value), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'hr'],
    ALLOWED_ATTR: ['href', 'title'],
    FORBID_TAGS: ['img'],
    SANITIZE_NAMED_PROPS: true
  })
})
const loadingRelated = ref(false)
const loadingComments = ref(false)
const submitting = ref(false)
const favoriteLoading = ref(false)
const likeLoading = ref(false)
const isFavorited = ref(false)
const work = ref(null)
const allowedPlayerHosts = new Set([
  'player.codemao.cn',
  'nemo.codemao.cn',
  'python.codemao.cn',
  'coco.codemao.cn',
  'block.codemao.cn',
  'kn.codemao.cn',
  'turtle.codemao.cn',
  'box.codemao.cn',
  'box2.codemao.cn'
])

const getSafePlayerUrl = (value) => {
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (!allowedPlayerHosts.has(url.hostname)) return null
    return url.href
  } catch (error) {
    return null
  }
}

const playerUrl = computed(() => {
  if (!work.value) return null
  const workId = work.value.codemao_work_id
  if (!workId) return null

  /**
   * 编程猫播放器选择规则：
   * Kitten3、Kitten4、Neko（KittenN）和 Wood（Python）都属于 Kitten 系列，
   * 但具体 URL 取决于具体型号；Nemo 与 Neko 是两个不同的编辑器，不能混用。
   * creation-tools/v1/works API 返回的 player_url 已由后端保存为 work_url，
   * 必须优先使用 API 给出的地址，只有 API 未返回时才按型号兜底生成。
   */
  const safeWorkUrl = getSafePlayerUrl(work.value.work_url)
  if (safeWorkUrl) return safeWorkUrl

  // type 通常比 ide_type 更具体（例如 KITTEN3/KITTEN4，而 ide_type 可能只有 KITTEN）。
  const rawType = work.value.type || work.value.ide_type || ''
  const type = rawType.toUpperCase()

  // 仅在 API 没有 player_url 时使用的兜底地址。
  const playerMap = {
    'KITTEN3': `https://player.codemao.cn/old/${workId}`,
    'KITTEN4': `https://player.codemao.cn/new/${workId}`,
    'KITTEN': `https://player.codemao.cn/new/${workId}`,
    'NEMO': `https://nemo.codemao.cn/player/${workId}`,
    'NEKO': `https://kn.codemao.cn/editor/player/${workId}`,
    'KITTENN': `https://kn.codemao.cn/editor/player/${workId}`,
    'KITTEN_N': `https://kn.codemao.cn/editor/player/${workId}`,
    'WOOD': `https://turtle.codemao.cn/player/h5/${workId}`,
    'PYTHON': `https://turtle.codemao.cn/player/h5/${workId}`,
    'COCO': `https://coco.codemao.cn/editor/player/${workId}`,
    'CODE_BLOCK': `https://block.codemao.cn/player/${workId}`,
    'BOX': `https://box.codemao.cn/w/${workId}`,
    'BOX2': `https://box2.codemao.cn/w/${workId}`
  }
  
  if (playerMap[type]) {
    return playerMap[type]
  }
  
  // 无法识别的历史数据最后按 Kitten4 兜底。
  return `https://player.codemao.cn/new/${workId}`
})
const relatedWorks = ref([])
const comments = ref([])
const commentContent = ref('')
const selectedSocialCard = ref(null)
const replyingTo = ref(null)
const replyingComment = ref(null)
const expandedComments = ref(new Set())

const shareDialogVisible = ref(false)
const reportDialogVisible = ref(false)
const reportSubmitting = ref(false)
const reportForm = ref({ reason: '', description: '' })
const qrcodeUrl = ref('')

const editWorkVisible = ref(false)
const editWorkSubmitting = ref(false)
const editWorkForm = ref({ name: '', description: '' })

const shareLink = computed(() => {
  if (!work.value) return ''
  return `${window.location.origin}/work/${work.value.codemao_work_id}`
})

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZFQzQzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPuahijwvdGV4dD48L3N2Zz4='

const formatTime = (time) => {
  if (!time) return '未知'
  const d = new Date(time)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const getTypeName = (workType) => {
  if (!workType) return '未分类'
  const type = workType.toUpperCase()
  const typeMap = {
    'KITTEN': 'Kitten',
    'KITTEN3': 'Kitten 3',
    'KITTEN4': 'Kitten 4',
    'NEMO': 'Nemo',
    'COCO': 'Coco',
    'WOOD': 'Wood',
    'BOX': 'Box',
    'BOX2': 'Box 2',
    'CODE_BLOCK': '代码岛',
    'PYTHON': 'Python',
    'SCRATCH': 'Scratch',
    'NEKO': 'Neko（KittenN）',
    'KITTENN': 'KittenN',
    'KITTEN_N': 'KittenN'
  }
  return typeMap[type] || workType
}

const isValidCodemaoWorkId = (value) => /^\d{1,20}$/.test(String(value || ''))

const fetchWork = async () => {
  const codemaoId = String(route.params.codemaoId || '')
  descriptionExpanded.value = false
  work.value = null
  comments.value = []
  relatedWorks.value = []

  if (!codemaoId) {
    loading.value = false
    return
  }

  if (!isValidCodemaoWorkId(codemaoId)) {
    loading.value = false
    ElMessage.error('作品ID格式不正确')
    return
  }
  
  loading.value = true
  try {
    const res = await workApi.getDetail(codemaoId)
    if (res.code === 200) {
      work.value = res.data
      fetchRelatedWorks()
      fetchComments()
      checkFavorite()
    }
  } catch (error) {
    console.error('获取作品失败:', error)
  } finally {
    loading.value = false
  }
}

const goUser = (user) => {
  // 后端用户页只认 codemao_user_id,缺该字段时不做跳转,避免使用本地 id 触发 404
  if (!user) {
    ElMessage.warning('该用户信息缺失,无法跳转')
    return
  }
  if (user.codemao_user_id) {
    router.push(`/user/${user.codemao_user_id}`)
    return
  }
  // 缺少 codemao_user_id,提示并放弃跳转(评论/回复的 user 应由后端 include 携带 codemao_user_id)
  ElMessage.warning('该用户缺少编程猫用户信息,无法跳转')
}

const goUserById = (userId) => {
  // 尝试在评论/回复中找到该用户的 codemao_user_id
  if (!userId) return
  // 先在回复的 reply_to_user 关联中查找
  for (const comment of comments.value) {
    if (comment.reply_to_user && String(comment.reply_to_user.id) === String(userId)) {
      if (comment.reply_to_user.codemao_user_id) {
        router.push(`/user/${comment.reply_to_user.codemao_user_id}`)
        return
      }
    }
    if (comment.replies) {
      for (const reply of comment.replies) {
        if (reply.reply_to_user && String(reply.reply_to_user.id) === String(userId)) {
          if (reply.reply_to_user.codemao_user_id) {
            router.push(`/user/${reply.reply_to_user.codemao_user_id}`)
            return
          }
        }
      }
    }
  }
  // 缺少 codemao_user_id 时不做跳转，避免使用本地 id 触发后端 404
  ElMessage.warning('无法跳转：缺少用户标识')
}

const fetchRelatedWorks = async () => {
  loadingRelated.value = true
  try {
    const res = await workApi.getList({ page: 1, pageSize: 5 })
    if (res.code === 200) {
      relatedWorks.value = res.data.list.filter(w => w.codemao_work_id !== work.value?.codemao_work_id).slice(0, 4)
    }
  } catch (error) {
    console.error('获取推荐失败:', error)
  } finally {
    loadingRelated.value = false
  }
}

const fetchComments = async () => {
  if (!work.value?.id) {
    comments.value = []
    return
  }
  loadingComments.value = true
  try {
    const res = await commentApi.getWorkComments(work.value.codemao_work_id)
    if (res.code === 200) {
      comments.value = res.data.list || []
    }
  } catch (error) {
    console.error('获取评论失败:', error)
  } finally {
    loadingComments.value = false
  }
}

const checkFavorite = async () => {
  if (!userStore.isLoggedIn) return
  if (!work.value?.codemao_work_id) {
    isFavorited.value = false
    return
  }
  try {
    const res = await favoriteApi.check(work.value.codemao_work_id)
    if (res.code === 200) {
      isFavorited.value = res.data.isFavorited
    }
  } catch (error) {
    console.error('检查收藏失败:', error)
  }
}

const geetestDialogRef = ref(null)
const geetestConfig = ref(null)

const fetchGeetestConfig = async () => {
  try {
    const res = await geetestApi.getConfig()
    if (res.code === 200) {
      geetestConfig.value = res.data
    }
  } catch (e) {
    console.error('获取验证码配置失败:', e)
  }
}

const likeWork = async () => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }

  // 防止重复点击
  if (likeLoading.value) return
  likeLoading.value = true

  let geetestData = {}

  // 检查是否需要验证码
  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.like) {
    geetestData = await geetestDialogRef.value.show('like')
    if (!geetestData) {
      likeLoading.value = false
      return
    }
  }

  try {
    const res = await workApi.like(work.value.codemao_work_id, geetestData)
    if (res.code === 200) {
      work.value.praise_times = res.data.praise_times
      work.value.liked = res.data.liked
      ElMessage.success(res.msg)
    }
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    likeLoading.value = false
  }
}

const toggleFavorite = async () => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }
  
  if (favoriteLoading.value) return

  favoriteLoading.value = true
  let geetestData = {}
  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.favorite) {
    geetestData = await geetestDialogRef.value.show('favorite')
    if (!geetestData) {
      favoriteLoading.value = false
      return
    }
  }
  try {
    if (isFavorited.value) {
      const res = await favoriteApi.remove(work.value.codemao_work_id, geetestData)
      if (res.code === 200) {
        isFavorited.value = false
        work.value.collection_times = res.data.collection_times
        ElMessage.success('已取消收藏')
      }
    } else {
      const res = await favoriteApi.add(work.value.codemao_work_id, geetestData)
      if (res.code === 200) {
        isFavorited.value = true
        work.value.collection_times = res.data.collection_times
        ElMessage.success('收藏成功')
      }
    }
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    favoriteLoading.value = false
  }
}

const goToAuthor = () => {
  if (work.value?.author?.codemao_user_id) {
    router.push(`/user/${work.value.author.codemao_user_id}`)
  }
}

const submitComment = async () => {
  if (!commentContent.value.trim() && !selectedSocialCard.value) {
    ElMessage.warning('请输入评论内容')
    return
  }
  
  let geetestData = {}
  
  // 检查是否需要验证码
  const commentScene = replyingTo.value ? 'reply' : 'comment'
  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.[commentScene]) {
    geetestData = await geetestDialogRef.value.show(commentScene)
    if (!geetestData) return
  }
  
  submitting.value = true
  try {
    const res = await commentApi.createComment({
      content: commentContent.value,
      work_id: work.value.codemao_work_id,
      parent_id: replyingTo.value ? (replyingTo.value.parent_id || replyingTo.value.id) : null,
      reply_to_user_id: replyingTo.value?.user?.id || null,
      social_card: selectedSocialCard.value,
      ...geetestData
    })
    if (res.code === 200) {
      // 修复: 新建评论补 liked=false 默认值
      // 后端 createComment 返回的对象无 liked 字段,导致点赞前 comment.liked 是 undefined
      // 虽然后端 toggle 正常,但前端视觉状态初始不明确,显式置 false
      const newComment = res.data
      newComment.liked = false
      newComment.like_count = newComment.like_count || 0
      if (replyingTo.value) {
        // 确定顶层父评论：如果 replyingTo 是回复(有 parent_id)则用其 parent_id，否则用 replyingTo.id
        const topLevelId = replyingTo.value.parent_id || replyingTo.value.id
        const parentComment = comments.value.find(c => c.id === topLevelId)
        if (parentComment) {
          if (!parentComment.replies) parentComment.replies = []
          parentComment.replies.push(newComment)
        }
        // 回复不增加顶层评论数
      } else {
        comments.value.unshift(newComment)
        // 仅顶层评论增加计数
        work.value.comment_count = (work.value.comment_count || 0) + 1
      }
      commentContent.value = ''
      selectedSocialCard.value = null
      cancelReply()
      ElMessage.success('评论成功')
    } else {
      ElMessage.error(res.msg || '评论失败')
    }
  } catch (error) {
    ElMessage.error('评论失败')
  } finally {
    submitting.value = false
  }
}

const cancelReply = () => {
  replyingTo.value = null
  replyingComment.value = null
  commentContent.value = ''
}

const getReplyToName = (reply) => {
  if (!reply || !reply.reply_to_user_id) return ''
  // 后端已通过 reply_to_user 关联塞入"被回复者"信息
  const target = reply.reply_to_user
  return target?.nickname || target?.username || ''
}

const getVisibleReplies = (comment) => {
  if (expandedComments.value.has(comment.id)) {
    return comment.replies
  }
  return comment.replies.slice(0, 3)
}

const expandReplies = (commentId) => {
  expandedComments.value.add(commentId)
}

const collapseReplies = (commentId) => {
  expandedComments.value.delete(commentId)
}

const likingComments = ref(new Set())

const likeComment = async (comment) => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }

  // 防止重复点击
  if (likingComments.value.has(comment.id)) return
  likingComments.value.add(comment.id)

  let geetestData = {}

  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.like) {
    geetestData = await geetestDialogRef.value.show('like')
    if (!geetestData) {
      likingComments.value.delete(comment.id)
      return
    }
  }

  try {
    const res = await commentApi.likeComment(comment.id, geetestData)
    if (res.code === 200) {
      // 使用服务端返回的真实状态/计数，避免与服务端长期错位
      comment.like_count = res.data.like_count
      comment.liked = !!res.data.liked
    }
  } catch (error) {
    console.error('点赞失败:', error)
  } finally {
    likingComments.value.delete(comment.id)
  }
}

const replyTo = (comment) => {
  replyingTo.value = comment
  replyingComment.value = comment
  commentContent.value = ''
  document.querySelector('.r-work--comment_form textarea')?.focus()
}

const deleteComment = async (comment) => {
  try {
    await ElMessageBox.confirm('确定删除这条评论吗？', '提示', { type: 'warning' })
    const res = await commentApi.deleteComment(comment.id)
    if (res.code === 200) {
      // 先在顶层评论中查找
      const index = comments.value.findIndex(c => c.id === comment.id)
      if (index > -1) {
        comments.value.splice(index, 1)
        work.value.comment_count = Math.max(0, (work.value.comment_count || 0) - 1)
      } else {
        // 在回复列表中查找
        for (const parent of comments.value) {
          if (parent.replies) {
            const replyIndex = parent.replies.findIndex(r => r.id === comment.id)
            if (replyIndex > -1) {
              parent.replies.splice(replyIndex, 1)
              break
            }
          }
        }
      }
      ElMessage.success('删除成功')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const showShareDialog = () => {
  shareDialogVisible.value = true
  generateQrcode()
}

const generateQrcode = async () => {
  try {
    const QRCode = (await import('qrcode')).default
    qrcodeUrl.value = await QRCode.toDataURL(shareLink.value, { width: 150, margin: 2 })
  } catch (e) {
    console.error('生成二维码失败:', e)
  }
}

const copyShareLink = async () => {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    ElMessage.success('链接已复制')
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

const shareToWeibo = () => {
  const url = encodeURIComponent(shareLink.value)
  const title = encodeURIComponent(work.value?.name || '分享作品')
  window.open(`https://service.weibo.com/share/share.php?url=${url}&title=${title}`, '_blank')
}

const shareToQQ = () => {
  const url = encodeURIComponent(shareLink.value)
  const title = encodeURIComponent(work.value?.name || '分享作品')
  const desc = encodeURIComponent(work.value?.description || '')
  window.open(`https://connect.qq.com/widget/shareqq/index.html?url=${url}&title=${title}&desc=${desc}`, '_blank')
}

const handleMoreAction = (command) => {
  if (command === 'report') {
    if (!userStore.isLoggedIn) {
      ElMessage.warning('请先登录')
      return
    }
    reportForm.value = { reason: '', description: '' }
    reportDialogVisible.value = true
  } else if (command === 'edit') {
    editWorkForm.value = { 
      name: work.value.name, 
      description: work.value.description || '' 
    }
    editWorkVisible.value = true
  } else if (command === 'copyLink') {
    copyShareLink()
  } else if (command === 'openOriginal') {
    window.open(`https://creation.codemao.cn/${work.value.codemao_work_id}`, '_blank')
  }
}

const submitEditWork = async () => {
  if (!String(editWorkForm.value.name).trim()) {
    ElMessage.warning('作品名不能为空')
    return
  }
  
  editWorkSubmitting.value = true
  try {
    const res = await workApi.update(work.value.codemao_work_id, {
      name: editWorkForm.value.name,
      description: editWorkForm.value.description
    })
    if (res.code === 200) {
      ElMessage.success('保存成功')
      work.value.name = editWorkForm.value.name
      work.value.description = editWorkForm.value.description
      editWorkVisible.value = false
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    editWorkSubmitting.value = false
  }
}

const submitReport = async () => {
  if (!reportForm.value.reason) {
    ElMessage.warning('请选择举报原因')
    return
  }
  
  let geetestData = {}
  
  // 检查是否需要验证码
  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.report) {
    geetestData = await geetestDialogRef.value.show('report')
    if (!geetestData) return
  }
  
  reportSubmitting.value = true
  try {
    const res = await reportApi.create({
      type: 'work',
      target_id: work.value.id,
      reason: reportForm.value.reason,
      description: reportForm.value.description,
      ...geetestData
    })
    if (res.code === 200) {
      ElMessage.success('举报成功，我们会尽快处理')
      reportDialogVisible.value = false
    } else {
      ElMessage.error(res.msg || '举报失败')
    }
  } catch (e) {
    ElMessage.error('举报失败')
  } finally {
    reportSubmitting.value = false
  }
}

const reportComment = async (comment) => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }
  
  let geetestData = {}
  
  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.report) {
    geetestData = await geetestDialogRef.value.show('report')
    if (!geetestData) return
  }
  
  ElMessageBox.prompt('请输入举报原因', '举报评论', {
    confirmButtonText: '提交',
    cancelButtonText: '取消',
    inputPattern: /\S+/,
    inputErrorMessage: '请输入举报原因'
  }).then(async ({ value }) => {
    try {
      const res = await reportApi.create({
        type: 'comment',
        target_id: comment.id,
        reason: value,
        description: `评论内容: ${comment.content}`
      }, geetestData)
      if (res.code === 200) {
        ElMessage.success('举报成功，我们会尽快处理')
      } else {
        ElMessage.error(res.msg || '举报失败')
      }
    } catch (e) {
      ElMessage.error('举报失败')
    }
  }).catch(() => {})
}

const preventScroll = (e) => {
  // 允许在输入框等元素内正常使用上下键
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return
  
  // 阻止上下键滚动页面，以便能正常游玩作品
  if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
  }
}

let playerFocused = false
let previousDocumentOverflow = ''

const setPlayerFocused = (focused) => {
  if (playerFocused === focused) return
  playerFocused = focused

  if (focused) {
    previousDocumentOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return
  }

  document.documentElement.style.overflow = previousDocumentOverflow
}

const detectPlayerFocus = () => {
  // 跨域 iframe 内的 keydown 不会冒泡到父页面；窗口失焦后检查 activeElement，
  // 确认焦点进入播放器时锁住外层滚动，让方向键只作用于游戏。
  window.setTimeout(() => {
    setPlayerFocused(document.activeElement === playerFrameRef.value)
  }, 0)
}

const releasePlayerFocus = () => {
  setPlayerFocused(false)
}

watch(() => route.params.codemaoId, () => {
  releasePlayerFocus()
  fetchWork()
})
onMounted(() => {
  fetchWork()
  fetchGeetestConfig()
  window.addEventListener('keydown', preventScroll, { passive: false })
  window.addEventListener('blur', detectPlayerFocus)
  window.addEventListener('focus', detectPlayerFocus)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', preventScroll)
  window.removeEventListener('blur', detectPlayerFocus)
  window.removeEventListener('focus', detectPlayerFocus)
  releasePlayerFocus()
})
const selectSocialCard = async type => {
  if (type === 'user') { selectedSocialCard.value = { type:'user' }; return }
  try {
    const studio = type === 'studio'
    const { value } = await ElMessageBox.prompt(studio ? '请输入要分享的编程狗工作室 ID' : '请输入创建好的 IM 群聊 ID', studio ? '发送工作室卡片' : '发送群聊邀请卡片', { inputPattern:/^\d+$/, inputErrorMessage:studio ? '请输入正确的工作室 ID' : '请输入正确的群聊 ID' })
    selectedSocialCard.value = { type, target_id:Number(value) }
  } catch (error) { if (!['cancel','close'].includes(error)) ElMessage.error('无法选择社交卡片') }
}
</script>

<style lang="scss" scoped>
$primary-color: #FEC433;
$primary-hover: #FFD700;
$primary-light: #FFF9E6;
$text-color: #333;
$text-secondary: #666;
$text-muted: #999;
$white: #fff;
$border-color: #eee;

.r-work--page {
  min-height: calc(100vh - 60px);
  padding: 24px;
  background: #f5f5f5;
}

.r-work--container {
  max-width: 1200px;
  margin: 0 auto;
}

.r-work--preview_section {
  background: $white;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 20px;
  
  .r-work--preview_wrapper {
    max-width: 900px;
    margin: 0 auto;
    aspect-ratio: 16 / 9;
    
    .r-work--player {
      width: 100%;
      height: 100%;
      border: none;
    }
    
    .r-work--no_preview {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #f0f0f0;
      color: $text-muted;
      
      .r-work--no_preview_icon {
        width: 64px;
        height: 64px;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
        margin-bottom: 12px;
      }
    }
  }
}

.r-work--info_section {
  display: flex;
  gap: 20px;
  
  @media (max-width: 992px) {
    flex-direction: column;
  }
}

.r-work--main_info {
  flex: 1;
  background: $white;
  border-radius: 12px;
  padding: 24px;
  
  .r-work--title {
    font-size: 24px;
    font-weight: 600;
    color: $text-color;
    margin: 0 0 12px;
  }
  
  .r-work--desc {
    font-size: 15px;
    color: $text-secondary;
    line-height: 1.8;
    overflow-wrap: anywhere;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
      line-height: 1.35;
      margin: 18px 0 8px;
    }

    :deep(h1) { font-size: 1.55em; }
    :deep(h2) { font-size: 1.35em; }
    :deep(h3) { font-size: 1.2em; }
    :deep(h4) { font-size: 1.08em; }

    :deep(pre) {
      max-width: 100%;
      padding: 12px;
      overflow-x: auto;
      border-radius: 8px;
      background: #f6f8fa;
    }

    :deep(a) {
      color: $primary-color;
      word-break: break-all;
    }
  }

  .r-work--description_wrapper {
    position: relative;
    margin-bottom: 8px;

    &.is-collapsed {
      max-height: 250px;
      overflow: hidden;

      &::after {
        content: '';
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 72px;
        pointer-events: none;
        background: linear-gradient(transparent, $white);
      }
    }
  }

  .r-work--description_toggle {
    margin: 0 0 20px;
    padding: 4px 0;
    border: 0;
    color: $primary-color;
    background: transparent;
    cursor: pointer;
    font: inherit;

    &:hover,
    &:focus-visible {
      text-decoration: underline;
    }
  }
  
  .r-work--meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 20px;
    border-bottom: 1px solid $border-color;
    margin-bottom: 20px;
    
    @media (max-width: 576px) {
      flex-direction: column;
      gap: 16px;
    }
  }
  
  .r-work--author {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    
    &:hover .r-work--author_name {
      color: $primary-color;
    }
    
    .r-work--author_avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .r-work--author_info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      
      .r-work--author_name {
        font-size: 15px;
        font-weight: 500;
        color: $text-color;
      }
      
      .r-work--publish_time {
        font-size: 13px;
        color: $text-muted;
      }
    }
  }
  
  .r-work--stats {
    display: flex;
    gap: 24px;
    
    .r-work--stat_item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: $text-secondary;
    }
    
    .r-work--stat_icon {
      width: 18px;
      height: 18px;
      
      &.r-work--stat_icon_view {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
      
      &.r-work--stat_icon_like {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
      
      &.r-work--stat_icon_comment {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
    }
  }
  
  .r-work--tags {
    margin-bottom: 20px;
    
    .r-work--tag {
      background: $primary-light;
      color: $primary-color;
      border: none;
      border-radius: 16px;
    }
  }
  
  .r-work--actions {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    
    .r-work--action_btn {
      border-radius: 8px;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      
      &.r-work--action_btn_like {
        background: $primary-color;
        border-color: $primary-color;
        color: $text-color;
        
        &:hover {
          background: $primary-hover;
          border-color: $primary-hover;
        }
      }
    }
  }
}

// 评论区样式
.r-work--comments_section {
  border-top: 1px solid $border-color;
  padding-top: 24px;
  
  .r-work--comments_title {
    font-size: 18px;
    font-weight: 600;
    color: $text-color;
    margin: 0 0 20px;
    
    .r-work--comments_count {
      font-size: 14px;
      color: $text-muted;
      font-weight: normal;
    }
  }
}

.r-work--comment_form {
  margin-bottom: 24px;
  
  .r-work--replying_to {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: $primary-light;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    color: $text-secondary;
    
    .r-work--cancel_reply {
      color: $primary-color;
      cursor: pointer;
      font-weight: 500;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
  
  .el-textarea {
    margin-bottom: 12px;
  }
  
  .el-button {
    border-radius: 8px;
    background: $primary-color;
    border-color: $primary-color;
    color: $text-color;
    
    &:hover {
      background: $primary-hover;
      border-color: $primary-hover;
    }
  }
}

.r-work--login_tip {
  text-align: center;
  padding: 24px;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 24px;
  
  a {
    color: $primary-color;
    font-weight: 500;
  }
}

.r-work--comment_list {
  min-height: 100px;
}

.r-work--comment_item {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid $border-color;
  
  .r-work--comment_avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .r-work--comment_body {
    flex: 1;
  }
  
  .r-work--comment_header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    
    .r-work--comment_name {
      font-size: 14px;
      font-weight: 500;
      color: $text-color;
    }
    
    .r-work--comment_time {
      font-size: 12px;
      color: $text-muted;
    }
  }
  
  .r-work--comment_content {
    font-size: 14px;
    color: $text-secondary;
    margin: 0 0 8px;
    line-height: 1.6;
  }
  
  .r-work--comment_actions {
    display: flex;
    gap: 16px;
    
    span {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: $text-muted;
      cursor: pointer;
      
      &:hover {
        color: $primary-color;
      }
      
      &.r-work--comment_delete:hover {
        color: #f56c6c;
      }
      
      &.r-work--comment_report:hover {
        color: #e6a23c;
      }
    }
    
    .r-work--comment_icon {
      width: 14px;
      height: 14px;
      
      &.r-work--comment_icon_like {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }

      // 已点赞: 图标变红,让用户看到当前是否已点赞
      // 修复: 此前点赞图标是静态灰色,无法看出 liked 状态,导致用户以为点赞没生效反复点击
      .r-work--comment_liked > &.r-work--comment_icon_like {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23f56c6c'%3E%3Cpath d='M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
      
      &.r-work--comment_icon_reply {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
    }

    // 已点赞的文字也变红,与图标呼应
    .r-work--comment_liked {
      color: #f56c6c;
    }
  }
}

.r-work--replies {
  margin-top: 12px;
  padding-left: 16px;
  border-left: 2px solid $border-color;
  
  .r-work--reply_item {
    display: flex;
    gap: 10px;
    padding: 10px 0;
    font-size: 13px;
    
    .r-work--reply_avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    
    .r-work--reply_body {
      flex: 1;
    }
    
    .r-work--reply_header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      
      .r-work--reply_name {
        color: $primary-color;
        font-weight: 500;
        font-size: 13px;
      }
      
      .r-work--reply_time {
        color: $text-muted;
        font-size: 12px;
      }
    }
    
    .r-work--reply_content {
      color: $text-secondary;
      margin: 0 0 6px;
      line-height: 1.5;
      font-size: 13px;
      
      .r-work--reply_to {
        color: $primary-color;
        font-weight: 500;
      }
    }
    
    .r-work--reply_actions {
      display: flex;
      gap: 12px;
      
      span {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: $text-muted;
        cursor: pointer;
        
        &:hover {
          color: $primary-color;
        }
      }
    }
  }
  
  .r-work--reply_more {
    padding: 8px 0;
    text-align: center;
    
    span {
      color: $primary-color;
      font-size: 13px;
      cursor: pointer;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
}

.r-work--sidebar {
  width: 300px;
  flex-shrink: 0;
  
  @media (max-width: 992px) {
    width: 100%;
  }
}

.r-work--side_card {
  background: $white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  
  .r-work--card_title {
    font-size: 16px;
    font-weight: 600;
    color: $text-color;
    margin: 0 0 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid $border-color;
  }
}

.r-work--info_list {
  list-style: none;
  padding: 0;
  margin: 0;
  
  li {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 14px;
    
    .r-work--info_label {
      color: $text-muted;
    }
    
    .r-work--info_value {
      color: $text-color;
    }
  }
}

.r-work--related_list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.r-work--related_item {
  display: flex;
  gap: 12px;
  cursor: pointer;
  text-decoration: none;
  
  &:hover .r-work--related_title {
    color: $primary-color;
  }
  
  .r-work--related_cover {
    width: 80px;
    height: 50px;
    border-radius: 6px;
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
  }
  
  .r-work--related_info {
    flex: 1;
    min-width: 0;
    
    .r-work--related_title {
      font-size: 14px;
      color: $text-color;
      margin: 0 0 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color 0.2s;
    }
    
    .r-work--related_author {
      font-size: 12px;
      color: $text-muted;
      margin: 0;
    }
  }
}

.r-work--share_content {
  text-align: center;
  
  .r-work--share_qrcode {
    margin-bottom: 20px;
    
    img {
      width: 150px;
      height: 150px;
      border-radius: 8px;
    }
    
    p {
      margin-top: 8px;
      font-size: 14px;
      color: $text-muted;
    }
  }
  
  .r-work--share_link {
    margin-bottom: 16px;
  }
  
  .r-work--share_platforms {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    
    .r-work--share_label {
      font-size: 14px;
      color: $text-muted;
    }
  }
  
  .r-work--share_icon {
    display: inline-block;
    width: 20px;
    height: 20px;
    
    &.r-work--share_icon_weibo {
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23E6162D'%3E%3Cpath d='M10.098 20c-4.612 0-8.363-2.222-8.363-4.958 0-1.428.93-3.08 2.527-4.648 2.126-2.09 4.604-3.038 5.528-2.118.406.404.49 1.096.25 1.9-.166.55.26.384.26.384 1.59-.612 3.038-.578 3.576.204.28.408.312.912.098 1.468-.124.322-.01.376.194.332 1.062-.226 1.906-.092 2.33.424.46.56.398 1.434-.094 2.416-.026.052-.004.118.052.138.284.102.616.322.816.628.424.642.316 1.524-.282 2.304-1.068 1.428-3.58 2.526-6.892 2.526zm-2.2-8.06c-2.264.168-3.976 1.406-3.824 2.764.152 1.358 2.104 2.324 4.368 2.156 2.264-.168 3.976-1.406 3.824-2.764-.152-1.358-2.104-2.324-4.368-2.156zm1.646 3.19c-.59.206-1.276-.016-1.534-.494-.256-.478.016-1.024.606-1.23.602-.208 1.3.014 1.56.494.258.48-.028 1.028-.632 1.23zm1.046-1.186c-.166.058-.36-.004-.43-.138-.07-.134.01-.286.176-.344.168-.058.36.004.43.138.07.134-.01.286-.176.344zm8.03-5.298c-.38-2.242-2.452-3.762-4.748-3.506-.424.046-.728.426-.682.85.046.422.426.726.85.68 1.49-.168 2.834.82 3.08 2.27.244 1.45-.728 2.828-2.218 3.126-.42.088-.69.498-.602.918.088.42.498.69.918.602 2.264-.454 3.782-2.6 3.402-4.94zm-1.652.28c-.19-1.122-1.226-1.882-2.374-1.754-.424.046-.728.426-.682.85.046.422.426.726.85.68.548-.06 1.048.326 1.144.876.096.55-.266 1.072-.814 1.186-.42.088-.69.498-.602.918.088.42.498.69.918.602 1.138-.24 1.95-1.336 1.76-2.558z'/%3E%3C/svg%3E") no-repeat center;
      background-size: contain;
    }
    
    &.r-work--share_icon_qq {
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2312B7F5'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 13.19c-.22.63-.76 1.17-1.37 1.37-.36.12-.73.19-1.1.19-.58 0-1.15-.15-1.67-.44-.25.14-.53.22-.82.22-.29 0-.57-.08-.82-.22-.52.29-1.09.44-1.67.44-.37 0-.74-.07-1.1-.19-.61-.2-1.15-.74-1.37-1.37-.14-.4-.14-.82-.02-1.22.12-.4.36-.76.68-1.02-.08-.28-.12-.58-.12-.88 0-1.93 1.57-3.5 3.5-3.5s3.5 1.57 3.5 3.5c0 .3-.04.6-.12.88.32.26.56.62.68 1.02.12.4.12.82-.02 1.22z'/%3E%3C/svg%3E") no-repeat center;
      background-size: contain;
    }
  }
}

/* 作品详情升级：沉浸式预览与统一内容工作区 */
.r-work--page { position:relative; overflow:hidden; padding:30px 24px 80px; background:radial-gradient(circle at 8% 6%,rgba(255,205,92,.3),transparent 28rem),radial-gradient(circle at 92% 14%,rgba(108,190,255,.25),transparent 32rem),linear-gradient(145deg,#f5f8ff 0%,#fafbff 50%,#fff8eb 100%); }
.r-work--page::before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.5; background-image:linear-gradient(rgba(95,125,170,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(95,125,170,.055) 1px,transparent 1px); background-size:44px 44px; mask-image:linear-gradient(to bottom,#000,transparent 84%); }
.r-work--container { position:relative; z-index:1; max-width:1220px; }
.r-work--preview_section { padding:18px; border:1px solid rgba(255,255,255,.94); border-radius:22px; background:rgba(255,255,255,.78); backdrop-filter:blur(18px); box-shadow:0 20px 55px rgba(39,55,82,.1); }
.r-work--preview_section .r-work--preview_wrapper { overflow:hidden; border-radius:16px; background:#172033; box-shadow:0 12px 34px rgba(23,32,51,.18); }
.r-work--info_section { gap:22px; align-items:flex-start; }
.r-work--main_info { padding:32px; border:1px solid rgba(255,255,255,.94); border-radius:20px; background:rgba(255,255,255,.84); backdrop-filter:blur(18px); box-shadow:0 18px 50px rgba(39,55,82,.085); }
.r-work--main_info .r-work--title { color:#172033; font-size:clamp(28px,3vw,38px); line-height:1.18; letter-spacing:-.04em; font-weight:800; }
.r-work--main_info .r-work--desc { color:#667085; font-size:15px; }
.r-work--main_info .r-work--meta { border-bottom-color:#edf0f5; }
.r-work--main_info .r-work--author .r-work--author_avatar { width:52px; height:52px; box-shadow:0 0 0 3px #fff,0 6px 16px rgba(35,48,70,.13); }
.r-work--main_info .r-work--author .r-work--author_info .r-work--author_name { color:#344054; font-weight:700; }
.r-work--main_info .r-work--stats .r-work--stat_item { padding:7px 10px; border-radius:9px; background:#f6f8fb; color:#5f6b7d; font-weight:600; }
.r-work--main_info .r-work--actions { gap:9px; flex-wrap:wrap; }
.r-work--main_info .r-work--actions .r-work--action_btn { height:40px; margin:0; padding:0 16px; border-radius:11px!important; font-weight:700; }
.r-work--comments_section { border-top-color:#edf0f5; }
.r-work--comments_section .r-work--comments_title { color:#172033; font-size:21px; font-weight:800; }
.r-work--comment_form { padding:16px; border:1px solid #e7ebf2; border-radius:16px; background:linear-gradient(145deg,#fbfcff,#fffaf0); }
.r-work--comment_form :deep(.el-textarea__inner) { border-radius:12px!important; background:#fff; box-shadow:0 0 0 1px #e2e7ef inset; }
.r-work--comment_item { border-bottom-color:#edf0f5; }
.r-work--sidebar { width:300px; }
.r-work--sidebar > * { border:1px solid rgba(255,255,255,.94)!important; border-radius:18px!important; background:rgba(255,255,255,.8)!important; backdrop-filter:blur(17px); box-shadow:0 15px 42px rgba(39,55,82,.075)!important; }
.r-work--related_item { border-radius:12px; transition:transform .2s,background .2s; }
.r-work--related_item:hover { transform:translateX(4px); background:#f8faff; }
@media(max-width:768px){.r-work--page{padding:16px 14px 56px}.r-work--preview_section{padding:10px;border-radius:17px}.r-work--main_info{padding:22px 18px}.r-work--main_info .r-work--stats{gap:7px;flex-wrap:wrap}}
</style>
