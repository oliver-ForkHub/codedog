<template>
  <div class="r-community--page">
    <div class="r-community--container">
      <div class="r-community--header">
        <div class="r-community--heading">
          <h2 class="r-community--title">一起聊点有趣的</h2>
          <p>分享灵感、解决问题，也记录每一次创造。</p>
        </div>
        <el-button type="primary" @click="showPostDialog" v-if="userStore.isLoggedIn">
          <span class="r-community--post_icon"></span>
          发布帖子
        </el-button>
      </div>
      
      <div class="r-community--main">
        <!-- 左侧内容 -->
        <div class="r-community--content">
          <div class="r-community--tabs">
            <span class="r-community--tabs_label">{{ activeBoard ? activeBoard.name : '全部帖子' }}</span>
            <el-tag v-if="activeStudioId" closable type="warning" @close="clearStudioFilter">{{ activeStudioName || '指定工作室' }}</el-tag>
            <el-input v-model="searchKeyword" clearable placeholder="搜索标题、正文或标签" class="r-community--forum_search" @keyup.enter="handleSearch" @clear="handleSearch" />
            <el-tag v-if="activeTag" closable type="warning" @close="clearTag">#{{ activeTag }}</el-tag>
            <el-radio-group v-model="sortBy" @change="changeSort">
              <el-radio-button label="active">最新回复</el-radio-button>
              <el-radio-button label="latest">最新发布</el-radio-button>
              <el-radio-button label="hot">热门</el-radio-button>
              <el-radio-button label="essence">精华</el-radio-button>
              <el-radio-button label="unanswered">待解决</el-radio-button>
            </el-radio-group>
          </div>
          
          <div class="r-community--list" v-loading="loading">
            <div v-for="post in posts" :key="post.id" class="r-community--item" @click="$router.push(`/post/${post.id}`)">
              <div class="r-community--item_main">
                <div class="r-community--item_header">
                  <AppImage :src="post.author?.avatar || defaultAvatar" :fallback="defaultAvatar" class="r-community--item_avatar" />
                  <div class="r-community--item_author">
                    <span class="r-community--item_name">{{ post.author?.nickname || post.author?.username }}</span>
                    <span class="r-community--author_meta">
                      <span class="r-community--item_time">{{ formatTime(post.created_at) }}</span>
                      <span v-if="post.board" class="r-community--topic_meta" :style="{ color: post.board.color }">{{ post.board.icon }} {{ post.board.name }}</span>
                      <span v-if="post.studio" class="r-community--topic_meta">🏠 {{ post.studio.name }} · {{ post.studio.member_count }}/{{ post.studio.member_limit }} 人</span>
                      <span v-if="post.post_type === 'question'" :class="['r-community--question_state', { solved: post.accepted_comment_id }]">{{ post.accepted_comment_id ? '已解决' : '待解决' }}</span>
                    </span>
                  </div>
                  <el-tag v-if="post.is_top" type="danger" size="small">置顶</el-tag>
                  <el-tag v-if="post.is_essence" type="warning" size="small">精华</el-tag>
                  <el-tag v-if="post.is_locked" type="info" size="small">已锁定</el-tag>
                </div>
                <h4 class="r-community--item_title">{{ post.title }}</h4>
                <p class="r-community--item_content">{{ stripMarkdown(post.content) }}...</p>
                <div v-if="post.tags?.length" class="r-community--item_tags"><button v-for="tag in post.tags.slice(0, 4)" :key="tag" @click.stop="selectTag(tag)">#{{ tag }}</button></div>
                <div class="r-community--item_footer">
                  <span><span class="r-community--stat_icon r-community--stat_icon_view"></span>{{ post.view_count }}</span>
                  <span><span class="r-community--stat_icon r-community--stat_icon_like"></span>{{ post.like_count }}</span>
                  <span><span class="r-community--stat_icon r-community--stat_icon_comment"></span>{{ post.reply_count || post.comment_count }}</span>
                  <span class="r-community--last_reply" v-if="post.last_reply_user">最后回复 {{ post.last_reply_user.nickname || post.last_reply_user.username }} · {{ formatTime(post.last_reply_at) }}</span>
                </div>
              </div>
              <img v-if="post.cover" :src="post.cover" class="r-community--item_cover" referrerpolicy="no-referrer" />
            </div>
            
            <el-empty v-if="!loading && posts.length === 0" description="暂无帖子" />
          </div>
          
          <div class="r-community--pagination" v-if="total > pageSize">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :total="total"
              layout="prev, pager, next"
              @current-change="fetchPosts"
            />
          </div>
        </div>
        
        <!-- 右侧边栏 -->
        <aside class="r-community--sidebar">
          <div class="r-community--side_card r-community--announcement_card">
            <h4 class="r-community--card_title">社区公告</h4>
            <div v-if="communityAnnouncements.length" class="r-community--ann_list">
              <div v-for="item in communityAnnouncements" :key="item.id" class="r-community--ann_item" :style="communityAnnStyle(item)">
                <div class="r-community--ann_title">{{ item.title }}</div>
                <div class="r-community--ann_content">{{ item.content }}</div>
              </div>
            </div>
            <p v-else>欢迎来到编程狗社区！请遵守社区规范，文明交流。</p>
          </div>

          <div class="r-community--side_card r-community--rules_card">
            <h4 class="r-community--card_title">发帖须知</h4>
            <ul><li>禁止发布违法违规内容</li><li>禁止恶意攻击他人</li><li>鼓励分享原创内容</li><li>提问前请先搜索</li></ul>
          </div>

          <div class="r-community--side_card r-community--boards_card">
            <div class="r-community--side_heading"><h4 class="r-community--card_title">论坛版块</h4><button v-if="activeBoardId" @click="selectBoard(null)">查看全部</button></div>
            <div v-for="board in boards" :key="board.id" class="r-community--board_row">
              <button :class="['r-community--board_item', { active: Number(activeBoardId) === Number(board.id) }]" @click="selectBoard(board)">
                <span class="r-community--board_icon" :style="{ background: `${board.color}18`, color: board.color }">{{ board.icon }}</span>
                <span><b>{{ board.name }}</b><small>{{ board.description }}</small></span>
                <em>{{ board.post_count }}</em>
              </button>
              <button v-if="userStore.isLoggedIn" class="r-community--board_follow" :class="{ active: board.subscribed }" :title="board.subscribed ? '取消关注板块' : '关注板块'" @click="toggleBoardFollow(board)">{{ board.subscribed ? '★' : '☆' }}</button>
            </div>
          </div>

          <div v-if="userStore.isLoggedIn" class="r-community--side_card r-community--following_card">
            <div class="r-community--side_heading"><h4 class="r-community--card_title">我的论坛</h4><button @click="openMySubscriptions">管理关注</button></div>
            <p>集中查看关注的板块和主题，新回复不会错过。</p>
          </div>

          <div class="r-community--side_card r-community--leaderboard_card">
            <div class="r-community--side_heading"><h4 class="r-community--card_title">论坛贡献榜</h4><span>近实时</span></div>
            <button v-for="(entry, index) in forumLeaderboard" :key="entry.user.id" class="r-community--leader_row" @click="$router.push(`/user/${entry.user.codemao_user_id}`)">
              <em :class="{ top: index < 3 }">{{ index + 1 }}</em>
              <AppImage :src="entry.user.avatar || defaultAvatar" :fallback="defaultAvatar" />
              <span><b>{{ entry.user.nickname || entry.user.username }}</b><small>{{ entry.title }} · {{ entry.contribution_score }} 贡献</small></span>
              <i v-if="entry.badges?.length" :style="{ color: entry.badges[0].color }" :title="entry.badges.map(item => item.name).join('、')">{{ entry.badges[0].icon }}</i>
            </button>
            <el-empty v-if="!forumLeaderboard.length" description="暂无贡献记录" :image-size="48" />
          </div>

        </aside>
      </div>
    </div>
    
    <!-- 发帖对话框 -->
    <el-dialog v-model="postDialogVisible" title="创作新帖子" width="min(1180px, 96vw)" top="3vh" class="r-community--compose_dialog" :close-on-click-modal="false" :before-close="confirmCloseComposer">
      <div class="r-community--compose_intro">像写文档一样组织你的内容，支持排版、链接、代码和图床图片。</div>
      <el-form :model="postForm" :rules="postRules" ref="postFormRef" label-position="top">
        <el-form-item label="标题" prop="title">
          <el-input v-model="postForm.title" placeholder="请输入标题" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="postForm.board_id" placeholder="选择发布版块" style="width: 100%">
            <el-option v-for="board in boards" :key="board.id" :label="`${board.icon} ${board.name}`" :value="board.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="selectedComposeBoard?.slug === 'studios'" label="工作室" prop="studio_id">
          <el-select v-model="postForm.studio_id" placeholder="选择你已加入的工作室" style="width: 100%" :loading="myStudiosLoading">
            <el-option v-for="studio in myStudios" :key="studio.id" :label="studio.name" :value="studio.id" />
          </el-select>
          <div v-if="!myStudiosLoading && !myStudios.length" class="r-community--studio_hint">你尚未加入任何工作室，暂时不能在此版块发帖。</div>
        </el-form-item>

        <el-form-item label="内容" prop="content">
          <!-- 修复: 替换分屏编辑器为 WYSIWYG Word 式编辑器 -->
          <WysiwygEditor v-model="postForm.content" ref="wysiwygRef" />
        </el-form-item>
        <el-form-item label="封面" prop="cover">
          <div class="r-community--cover_upload" @click="coverInput?.click()">
            <img v-if="postForm.cover" :src="postForm.cover" alt="帖子封面" />
            <div v-else><b>上传封面图片</b><span>JPG、PNG、WebP，最大 5MB（可选）</span></div>
            <el-button :loading="coverUploading" size="small">{{ postForm.cover ? '更换封面' : '选择图片' }}</el-button>
          </div>
          <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden @change="uploadCover" />
        </el-form-item>
        <el-form-item label="标签" prop="tags">
          <el-input v-model="postForm.tags" placeholder="标签，用逗号分隔（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="r-community--draft_status">{{ draftStatus }}</span>
        <el-button @click="requestCloseComposer">取消</el-button>
        <el-button type="primary" :loading="postLoading" @click="createPost">发布</el-button>
      </template>
    </el-dialog>
    
    <GeetestDialog ref="geetestDialogRef" />
    <el-dialog v-model="subscriptionsVisible" title="我的论坛关注" width="min(760px, 94vw)">
      <el-tabs v-model="subscriptionsTab" v-loading="subscriptionsLoading">
        <el-tab-pane :label="`关注主题 ${mySubscriptions.topic_total || 0}`" name="topics">
          <button v-for="topic in mySubscriptions.topics" :key="topic.id" class="r-community--subscription_topic" @click="$router.push(`/post/${topic.id}`); subscriptionsVisible = false">
            <span><b>{{ topic.title }} <i v-if="topic.has_unread" class="r-community--unread_dot">新回复</i></b><small>{{ topic.board?.icon }} {{ topic.board?.name }} · {{ topic.reply_count || topic.comment_count }} 条回复</small></span><em>{{ formatTime(topic.last_reply_at || topic.updated_at) }}</em>
          </button>
          <el-empty v-if="!mySubscriptions.topics.length" description="还没有关注主题" />
        </el-tab-pane>
        <el-tab-pane :label="`关注板块 ${mySubscriptions.boards.length}`" name="boards">
          <button v-for="board in mySubscriptions.boards" :key="board.id" class="r-community--subscription_board" @click="selectBoard(board); subscriptionsVisible = false"><span :style="{ color: board.color }">{{ board.icon }}</span><b>{{ board.name }}</b><small>{{ board.description }}</small></button>
          <el-empty v-if="!mySubscriptions.boards.length" description="还没有关注板块" />
        </el-tab-pane>
        <el-tab-pane :label="`我的主题 ${mySubscriptions.my_topics.length}`" name="mine">
          <button v-for="topic in mySubscriptions.my_topics" :key="topic.id" class="r-community--subscription_topic" @click="$router.push(`/post/${topic.id}`); subscriptionsVisible = false"><span><b>{{ topic.title }}</b><small>{{ topic.status === 'published' ? '已发布' : topic.status === 'draft' ? '草稿' : '已隐藏' }} · {{ topic.reply_count || topic.comment_count }} 条回复</small></span><em>{{ formatTime(topic.updated_at) }}</em></button>
          <el-empty v-if="!mySubscriptions.my_topics.length" description="还没有发布主题" />
        </el-tab-pane>
        <el-tab-pane :label="`我的回复 ${mySubscriptions.my_replies.length}`" name="replies">
          <button v-for="reply in mySubscriptions.my_replies" :key="reply.id" class="r-community--subscription_topic" @click="$router.push(`/post/${reply.post_id}`); subscriptionsVisible = false"><span><b>{{ reply.post?.title }}</b><small>{{ stripMarkdown(reply.content).slice(0, 80) }}</small></span><em>{{ formatTime(reply.created_at) }}</em></button>
          <el-empty v-if="!mySubscriptions.my_replies.length" description="还没有参与回复" />
        </el-tab-pane>
        <el-tab-pane :label="`帖子收藏 ${mySubscriptions.favorites.length}`" name="favorites">
          <button v-for="topic in mySubscriptions.favorites" :key="topic.id" class="r-community--subscription_topic" @click="$router.push(`/post/${topic.id}`); subscriptionsVisible = false"><span><b>{{ topic.title }}</b><small>{{ topic.reply_count || topic.comment_count }} 条回复</small></span><em>{{ formatTime(topic.updated_at) }}</em></button>
          <el-empty v-if="!mySubscriptions.favorites.length" description="还没有收藏帖子" />
        </el-tab-pane>
        <el-tab-pane label="草稿" name="draft">
          <button v-if="mySubscriptions.draft" class="r-community--subscription_topic" @click="continueDraft"><span><b>{{ mySubscriptions.draft.title || '未命名草稿' }}</b><small>继续编辑草稿</small></span><em>{{ formatTime(mySubscriptions.draft.updated_at) }}</em></button>
          <el-empty v-else description="当前没有草稿" />
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useUserStore } from '@/stores/user'
import { postApi } from '@/api/post'
import { publicApi } from '@/api/public'
import { geetestApi } from '@/api/geetest'
import { ElMessage, ElMessageBox } from 'element-plus'
import GeetestDialog from '@/components/GeetestDialog.vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import AppImage from '@/components/AppImage.vue'
import WysiwygEditor from '@/components/WysiwygEditor.vue'
import { uploadApi } from '@/api/upload'
import { studioApi } from '@/api/studio'
import { useRoute, useRouter } from 'vue-router'

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

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const loading = ref(false)
const postLoading = ref(false)
const communityAnnouncements = ref([])
const communityColorMap = {
  blue: { bg: '#ecf5ff', border: '#409EFF' },
  green: { bg: '#f0f9eb', border: '#67C23A' },
  orange: { bg: '#fdf6ec', border: '#E6A23C' },
  red: { bg: '#fef0f0', border: '#F56C6C' },
  purple: { bg: '#f5eef8', border: '#9B59B6' },
  yellow: { bg: '#fff9e6', border: '#FEC433' }
}
const communityAnnStyle = (item) => {
  const theme = communityColorMap[item?.color] || communityColorMap.blue
  return { background: theme.bg, color: theme.border }
}
const loadCommunityAnnouncements = async () => {
  try {
    const res = await publicApi.getAnnouncements()
    if (res.code === 200) {
      const list = Array.isArray(res.data) ? res.data : []
      communityAnnouncements.value = list.filter(a => a.show_community !== false)
    }
  } catch (e) {}
}

const boards = ref([])
const activeBoardId = ref(null)
const sortBy = ref('active')
const searchKeyword = ref('')
const activeTag = ref('')
const activeBoard = computed(() => boards.value.find(board => Number(board.id) === Number(activeBoardId.value)) || null)
const selectedComposeBoard = computed(() => boards.value.find(board => Number(board.id) === Number(postForm.board_id)) || null)

watch(() => postForm.board_id, (newVal) => {
  if (restoringDraft.value) return
  const board = boards.value.find(b => Number(b.id) === Number(newVal))
  if (board) {
    if (board.slug === 'question') {
      postForm.post_type = 'question'
    } else if (board.slug === 'tutorial') {
      postForm.post_type = 'tutorial'
    } else {
      postForm.post_type = 'discussion'
    }
  }
})
const activeStudioId = ref(null)
const myStudios = ref([])
const myStudiosLoading = ref(false)
const activeStudioName = computed(() => posts.value.find(post => Number(post.studio?.id) === Number(activeStudioId.value))?.studio?.name || '')
const posts = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const postDialogVisible = ref(false)
const postFormRef = ref(null)
const geetestDialogRef = ref(null)
const geetestConfig = ref(null)
const wysiwygRef = ref(null)
const coverInput = ref(null)
const coverUploading = ref(false)
const draftStatus = ref('')
const subscriptionsVisible = ref(false)
const subscriptionsLoading = ref(false)
const subscriptionsTab = ref('topics')
const mySubscriptions = reactive({ topics: [], topic_total: 0, boards: [], my_topics: [], my_replies: [], favorites: [], draft: null })
const forumLeaderboard = ref([])
const restoringDraft = ref(false)
let draftTimer = null

const uploadCover = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) return ElMessage.warning('封面不能超过 5MB')
  coverUploading.value = true
  try {
    const res = await uploadApi.image(file)
    postForm.cover = res.data?.url || ''
    if (!postForm.cover) throw new Error('图床未返回地址')
    ElMessage.success('封面上传成功')
  } catch (e) { ElMessage.error(e.response?.data?.msg || '封面上传失败') }
  finally { coverUploading.value = false }
}

const loadForumLeaderboard = async () => {
  try {
    const res = await postApi.getLeaderboard(8)
    if (res.code === 200) forumLeaderboard.value = res.data?.list || []
  } catch (e) { forumLeaderboard.value = [] }
}

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZFQzQzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPuahijwvdGV4dD48L3N2Zz4='

const postForm = reactive({
  title: '',
  content: '',
  board_id: null,
  studio_id: null,
  post_type: 'discussion',
  cover: '',
  tags: ''
})

// 修复: WYSIWYG 输出 HTML,不再用 string required 校验;改为 createPost 内二次检查
const postRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }]
}

const stripMarkdown = (text) => {
  if (!text) return ''
  return text
    .replace(/<[^>]+>/g, '') // 去掉HTML
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // 去掉粗体
    .replace(/(\*|_)(.*?)\1/g, '$2') // 去掉斜体
    .replace(/`{3,}[\s\S]*?`{3,}/g, '[代码块]') // 去掉多行代码
    .replace(/`(.+?)`/g, '$1') // 去掉行内代码
    .replace(/!\[.*?\]\(.*?\)/g, '[图片]') // 去掉图片
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 去掉链接
    .replace(/#+\s+(.*)/g, '$1') // 去掉标题
    .replace(/>\s+(.*)/g, '$1') // 去掉引用
    .substring(0, 150)
}

const formatTime = (time) => {
  if (!time) return ''
  const d = new Date(time)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  return `${d.getMonth() + 1}-${d.getDate()}`
}

const fetchPosts = async () => {
  loading.value = true
  try {
    const res = await postApi.getPosts({
      page: currentPage.value,
      pageSize: pageSize.value,
      board_id: activeBoardId.value || undefined,
      studio_id: activeStudioId.value || undefined,
      sortBy: sortBy.value,
      keyword: searchKeyword.value.trim() || undefined,
      tag: activeTag.value || undefined
    })
    if (res.code === 200) {
      posts.value = res.data.list
      total.value = res.data.total
    }
  } catch (e) {
    console.error('获取帖子失败:', e)
  } finally {
    loading.value = false
  }
}

const loadBoards = async () => {
  try {
    const res = await postApi.getBoards()
    if (res.code === 200) {
      boards.value = Array.isArray(res.data) ? res.data : []
      const requestedBoard = String(route.query.board || '')
      const boardFromRoute = boards.value.find(board => board.slug === requestedBoard)
      if (boardFromRoute) activeBoardId.value = boardFromRoute.id
      const requestedStudio = Number(route.query.studio_id || 0)
      activeStudioId.value = requestedStudio > 0 ? requestedStudio : null
      if (!postForm.board_id && boards.value.length) postForm.board_id = boards.value[0].id
    }
  } catch (e) {
    console.error('获取论坛板块失败:', e)
  }
}

const selectBoard = (board) => {
  activeBoardId.value = board?.id || null
  activeStudioId.value = null
  router.replace({ query: board ? { board: board.slug } : {} })
  currentPage.value = 1
  fetchPosts()
}

const clearStudioFilter = () => {
  activeStudioId.value = null
  router.replace({ query: activeBoard.value ? { board: activeBoard.value.slug } : {} })
  currentPage.value = 1
  fetchPosts()
}

const loadMyStudios = async () => {
  if (!userStore.isLoggedIn) return
  myStudiosLoading.value = true
  try {
    const res = await studioApi.getMyStudios()
    myStudios.value = (Array.isArray(res.data) ? res.data : []).filter(studio => studio.status === 'active' && studio.memberStatus === 'active')
  } catch (e) { myStudios.value = [] }
  finally { myStudiosLoading.value = false }
}

const selectTag = tag => {
  activeTag.value = String(tag || '').trim()
  currentPage.value = 1
  fetchPosts()
}

const clearTag = () => {
  activeTag.value = ''
  currentPage.value = 1
  fetchPosts()
}

const toggleBoardFollow = async board => {
  try {
    const res = await postApi.toggleBoardSubscription(board.id)
    if (res.code === 200) {
      board.subscribed = !!res.data?.subscribed
      ElMessage.success(board.subscribed ? '已关注板块' : '已取消关注')
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '操作失败') }
}

const openMySubscriptions = async () => {
  subscriptionsVisible.value = true
  subscriptionsLoading.value = true
  try {
    const res = await postApi.getMySubscriptions({ page: 1, pageSize: 50 })
    if (res.code === 200) {
      mySubscriptions.topics = res.data?.topics || []
      mySubscriptions.topic_total = Number(res.data?.topic_total || 0)
      mySubscriptions.boards = res.data?.boards || []
      mySubscriptions.my_topics = res.data?.my_topics || []
      mySubscriptions.my_replies = res.data?.my_replies || []
      mySubscriptions.favorites = res.data?.favorites || []
      mySubscriptions.draft = res.data?.draft || null
    }
  } catch (e) { ElMessage.error('获取论坛关注失败') }
  finally { subscriptionsLoading.value = false }
}

const continueDraft = async () => {
  subscriptionsVisible.value = false
  await showPostDialog()
}

const changeSort = () => {
  currentPage.value = 1
  fetchPosts()
}

const handleSearch = () => {
  currentPage.value = 1
  fetchPosts()
}

const fetchGeetestConfig = async () => {
  try {
    const res = await geetestApi.getConfig()
    if (res.code === 200) {
      geetestConfig.value = res.data
    }
  } catch (e) {
    console.error('获取极验配置失败:', e)
  }
}

const showPostDialog = async () => {
  postForm.title = ''
  postForm.content = ''
  postForm.board_id = activeBoardId.value || boards.value[0]?.id || null
  postForm.studio_id = activeBoard.value?.slug === 'studios' ? (activeStudioId.value || myStudios.value[0]?.id || null) : null
  postForm.post_type = activeBoard.value?.slug === 'question'
    ? 'question'
    : activeBoard.value?.slug === 'tutorial' ? 'tutorial' : 'discussion'
  postForm.cover = ''
  postForm.tags = ''
  postDialogVisible.value = true
  draftStatus.value = ''
  try {
    const res = await postApi.getDraft()
    const draft = res.data
    if (draft && (draft.title || draft.content || draft.cover)) {
      await ElMessageBox.confirm('检测到上次未发布的帖子草稿，是否恢复？', '恢复草稿', {
        confirmButtonText: '恢复', cancelButtonText: '舍弃草稿', distinguishCancelAndClose: true
      })
      restoringDraft.value = true
      postForm.title = draft.title || ''
      postForm.content = draft.content || ''
      postForm.board_id = draft.board_id || postForm.board_id
      postForm.studio_id = activeBoard.value?.slug === 'studios' ? postForm.studio_id : null
      postForm.post_type = draft.post_type || 'discussion'
      postForm.cover = draft.cover || ''
      postForm.tags = Array.isArray(draft.tags) ? draft.tags.join(', ') : ''
      draftStatus.value = `已恢复 ${new Date(draft.updated_at).toLocaleString()} 的草稿`
      restoringDraft.value = false
    }
  } catch (e) {
    if (e === 'cancel') await postApi.deleteDraft().catch(() => {})
  }
}

const hasDraftContent = () => Boolean(postForm.title.trim() || postForm.content.replace(/<[^>]+>/g, '').trim() || postForm.cover || postForm.tags.trim())

const saveDraftNow = async () => {
  if (!postDialogVisible.value || restoringDraft.value || !hasDraftContent()) return true
  draftStatus.value = '正在保存草稿…'
  try {
    await postApi.saveDraft({
      ...postForm,
      tags: postForm.tags ? postForm.tags.split(',').map(tag => tag.trim()).filter(Boolean) : []
    })
    draftStatus.value = `草稿已自动保存 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    return true
  } catch (e) {
    draftStatus.value = '草稿保存失败，将稍后重试'
    return false
  }
}

watch(postForm, () => {
  if (!postDialogVisible.value || restoringDraft.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraftNow, 1200)
}, { deep: true })

const confirmCloseComposer = async done => {
  if (!hasDraftContent()) return done()
  const saved = await saveDraftNow()
  try {
    await ElMessageBox.confirm(saved ? '内容已保存为草稿。确定暂时离开编辑器吗？' : '草稿保存失败，立即离开可能丢失本次内容。仍要离开吗？', '离开发帖', { confirmButtonText: saved ? '离开' : '仍要离开', cancelButtonText: '继续编辑', type: saved ? 'info' : 'warning' })
    done()
  } catch (e) {}
}

const requestCloseComposer = () => confirmCloseComposer(() => { postDialogVisible.value = false })

const createPost = async () => {
  const valid = await postFormRef.value.validate().catch(() => false)
  if (!valid) return
  if (selectedComposeBoard.value?.slug === 'studios' && !postForm.studio_id) {
    ElMessage.error('请选择要发布到的工作室')
    return
  }

  // 封面 URL 校验：如填写则必须以 http:// 或 https:// 开头
  if (postForm.cover && !/^https?:\/\//i.test(postForm.cover)) {
    ElMessage.error('封面地址需以 http:// 或 https:// 开头')
    return
  }

  let geetestData = {}
  
  if (geetestConfig.value?.enabled && geetestConfig.value?.scenes?.publish_post) {
    geetestData = await geetestDialogRef.value.show('publish_post')
    if (!geetestData) {
      postLoading.value = false
      return
    }
  }
  
  postLoading.value = true
  try {
    // 修复: WYSIWYG 编辑器输出 HTML,存储时直接保存;tags 从逗号分隔转为数组
    const html = wysiwygRef.value?.getSanitizedHtml() || ''
    if (!html.replace(/<[^>]+>/g, '').trim()) {
      ElMessage.error('请输入内容')
      postLoading.value = false
      return
    }
    const payload = {
      ...postForm,
      content: html,
      tags: postForm.tags
        ? postForm.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []
    }
    const res = await postApi.createPost({ ...payload, ...geetestData })
    if (res.code === 200) {
      // 使用后端返回的 msg：敏感词命中/转人工审核时有具体提示，避免用户看到“发布成功”但帖子实际未公开
      ElMessage.success(res.msg || '发布成功')
      postDialogVisible.value = false
      draftStatus.value = ''
      currentPage.value = 1
      fetchPosts()
    } else {
      ElMessage.error(res.msg || '发布失败')
    }
  } catch (e) {
    ElMessage.error('发布失败')
  } finally {
    postLoading.value = false
  }
}

onMounted(async () => {
  loadCommunityAnnouncements()
  loadForumLeaderboard()
  await loadBoards()
  await loadMyStudios()
  fetchPosts()
  fetchGeetestConfig()
})

onBeforeUnmount(() => clearTimeout(draftTimer))
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

.rich-editor-toolbar {
  margin-bottom: 8px;
}

.r-community--page {
  padding: 24px;
  min-height: calc(100vh - 60px);
  background: #f5f5f5;
}

.r-community--container {
  max-width: 1200px;
  margin: 0 auto;
}

.r-community--header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  
  .r-community--title {
    font-size: 24px;
    font-weight: 600;
    color: $text-color;
    margin: 0;
  }
  
  .el-button {
    background: $primary-color;
    border-color: $primary-color;
    color: $text-color;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    
    &:hover {
      background: $primary-hover;
      border-color: $primary-hover;
    }
  }
  
  .r-community--post_icon {
    width: 14px;
    height: 14px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/%3E%3C/svg%3E") no-repeat center;
    background-size: contain;
  }
}

.r-community--main {
  display: flex;
  gap: 20px;
}

.r-community--content {
  flex: 1;
  min-width: 0;
}

.r-community--tabs {
  background: $white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;

  :deep(.el-radio-group) {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  :deep(.el-radio-button) {
    margin: 0;
  }

  :deep(.el-radio-button__inner) {
    border-radius: 16px;
    border: none;
    padding: 8px 20px;
    margin: 0;
    border-left: none;
  }

  :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-left: none;
  }
  
  :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
    background: $primary-color;
    color: $text-color;
    box-shadow: none;
  }
}

.r-community--list {
  background: $white;
  border-radius: 12px;
}

.r-community--item {
  display: flex;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid $border-color;
  cursor: pointer;
  transition: background 0.2s;
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    background: #fafafa;
  }
  
  .r-community--item_main {
    flex: 1;
    min-width: 0;
  }
  
  .r-community--item_header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    
    .r-community--item_avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }
    
    .r-community--item_author {
      flex: 1;
      display: flex;
      flex-direction: column;
      
      .r-community--item_name {
        font-size: 14px;
        font-weight: 500;
        color: $text-color;
      }
      
      .r-community--item_time {
        font-size: 12px;
        color: $text-muted;
      }
    }
  }
  
  .r-community--item_title {
    font-size: 16px;
    font-weight: 600;
    color: $text-color;
    margin: 0 0 8px;
  }
  
  .r-community--item_content {
    font-size: 14px;
    color: $text-secondary;
    margin: 0 0 12px;
    line-height: 1.6;
  }
  
  .r-community--item_footer {
    display: flex;
    gap: 20px;
    
    span {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: $text-muted;
    }
    
    .r-community--stat_icon {
      width: 14px;
      height: 14px;
      
      &.r-community--stat_icon_view {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
      
      &.r-community--stat_icon_like {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
      
      &.r-community--stat_icon_comment {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
      }
    }
  }
  
  .r-community--item_cover {
    width: 120px;
    height: 80px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }
}

.r-community--sidebar {
  width: 280px;
  flex-shrink: 0;
  
  @media (max-width: 992px) {
    display: none;
  }
}

.r-community--side_card {
  background: $white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  
  .r-community--card_title {
    font-size: 15px;
    font-weight: 600;
    color: $text-color;
    margin: 0 0 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid $border-color;
  }
  
  p {
    font-size: 13px;
    color: $text-secondary;
    margin: 0;
    line-height: 1.6;
  }
  
  ul {
    margin: 0;
    padding-left: 16px;
    
    li {
      font-size: 13px;
      color: $text-secondary;
      line-height: 2;
    }
  }
}

.r-community--pagination {
  display: flex;
  justify-content: center;
  padding: 20px;
  background: $white;
  border-radius: 0 0 12px 12px;
}

/* 首页同源的社区视觉：柔和渐变背景 + 开放式内容流 */
.r-community--page {
  position: relative;
  padding: 46px 24px 80px;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 5%, rgba(255, 205, 92, .34), transparent 25rem),
    radial-gradient(circle at 92% 14%, rgba(112, 184, 255, .26), transparent 30rem),
    linear-gradient(145deg, #f5f8ff 0%, #fafbff 50%, #fff8eb 100%);
}
.r-community--page::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .55;
  background-image: linear-gradient(rgba(95, 125, 170, .055) 1px, transparent 1px), linear-gradient(90deg, rgba(95, 125, 170, .055) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, #000, transparent 75%);
}
.r-community--container { position: relative; z-index: 1; max-width: 1220px; }
.r-community--header { margin-bottom: 28px; align-items: flex-end; }
.r-community--heading p { margin: 10px 0 0; color: #667085; font-size: 15px; }
.r-community--header .r-community--title { font-size: clamp(30px, 3vw, 42px); line-height: 1.15; letter-spacing: -.04em; color: #172033; font-weight: 800; }
.r-community--header .el-button { height: 44px; padding: 0 20px; border: 0; border-radius: 13px; font-weight: 700; box-shadow: 0 10px 24px rgba(220, 159, 24, .24); }
.r-community--main { gap: 24px; align-items: flex-start; }
.r-community--tabs { display: flex; align-items: center; gap: 18px; padding: 13px 16px; border: 1px solid rgba(255,255,255,.9); border-radius: 16px; background: rgba(255,255,255,.72); backdrop-filter: blur(16px); box-shadow: 0 10px 32px rgba(45, 63, 91, .06); }
.r-community--tabs_label { padding-left: 4px; font-size: 13px; font-weight: 700; color: #344054; white-space: nowrap; }
.r-community--forum_search { width:220px; }
.r-community--forum_search :deep(.el-input__wrapper) { border-radius:10px; box-shadow:0 0 0 1px #e4e8ef inset; }
.r-community--tabs :deep(.el-radio-button__inner) { background: transparent; color: #667085; font-weight: 600; border-radius: 10px; padding: 8px 17px; }
.r-community--tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) { background: #172033; color: #fff; box-shadow: 0 5px 12px rgba(23,32,51,.16); }
.r-community--list { overflow: hidden; border: 1px solid rgba(255,255,255,.92); border-radius: 20px; background: rgba(255,255,255,.82); backdrop-filter: blur(18px); box-shadow: 0 18px 50px rgba(39, 55, 82, .08); }
.r-community--item { padding: 24px 26px; border-color: #edf0f5; transition: background .2s, transform .2s; }
.r-community--item:hover { background: linear-gradient(90deg, rgba(255,247,224,.72), rgba(246,249,255,.88)); transform: translateX(3px); }
.r-community--item .r-community--item_header { margin-bottom: 14px; }
.r-community--item .r-community--item_header .r-community--item_avatar { width: 40px; height: 40px; box-shadow: 0 0 0 3px #fff, 0 4px 12px rgba(35,48,70,.12); }
.r-community--item .r-community--item_title { margin-bottom: 8px; color: #1b2436; font-size: 18px; letter-spacing: -.01em; }
.r-community--item .r-community--item_content { color: #697386; line-height: 1.7; }
.r-community--item .r-community--item_footer { gap: 18px; }
.r-community--item .r-community--item_cover { width: 148px; height: 96px; border-radius: 13px; box-shadow: 0 7px 18px rgba(35,48,70,.12); }
.r-community--sidebar { width: 292px; position: sticky; top: 82px; }
.r-community--side_card { padding: 20px; border: 1px solid rgba(255,255,255,.9); border-radius: 18px; background: rgba(255,255,255,.76); backdrop-filter: blur(16px); box-shadow: 0 14px 40px rgba(39,55,82,.07); }
.r-community--boards_card { background: linear-gradient(145deg, rgba(255,250,232,.94), rgba(255,255,255,.82)); }
.r-community--ann_item { padding:12px 14px; border:0!important; border-radius:11px; }
.r-community--ann_title { color:#9f2f35; font-weight:700; }
.r-community--ann_content { margin-top:3px; color:#8b4a4e; line-height:1.55; }
.r-community--side_card .r-community--card_title { color: #1b2436; font-size: 16px; border-bottom-color: rgba(219,164,37,.18); }
.r-community--side_card ul { padding-left: 18px; }
.r-community--side_card ul li { color: #697386; line-height: 2.15; }
.r-community--pagination { margin-top: -18px; padding-top: 38px; border-radius: 0 0 20px 20px; background: rgba(255,255,255,.82); }
@media (max-width: 768px) {
  .r-community--page { padding: 28px 14px 56px; }
  .r-community--header { align-items: flex-start; }
  .r-community--heading p { max-width: 230px; }
  .r-community--tabs { align-items: flex-start; flex-direction: column; gap: 10px; }
  .r-community--item { padding: 20px 18px; }
  .r-community--item .r-community--item_cover { display: none; }
}
.r-community--compose_dialog :deep(.el-dialog) { border-radius:22px!important; }
.r-community--compose_dialog :deep(.el-dialog__header) { padding:25px 28px 16px; border-bottom:1px solid #edf0f5; }
.r-community--compose_dialog :deep(.el-dialog__title) { color:#172033; font-size:22px; font-weight:800; }
.r-community--compose_dialog :deep(.el-dialog__body) { padding:18px 28px 10px; }
.r-community--compose_dialog :deep(.el-dialog) { max-height:94vh; display:flex; flex-direction:column; overflow:hidden; }
.r-community--compose_dialog :deep(.el-dialog__body) { overflow-y:auto; }
.r-community--compose_dialog :deep(.el-dialog__footer) { padding:16px 28px 24px; }
.r-community--compose_dialog :deep(.el-dialog__footer) { display:flex; align-items:center; justify-content:flex-end; gap:10px; }
.r-community--draft_status { margin-right:auto; color:#7c8799; font-size:12px; }
.r-community--compose_intro { margin-bottom:20px; padding:12px 14px; border-radius:12px; background:linear-gradient(90deg,#fff8e5,#f2f8ff); color:#667085; }
.r-community--compose_dialog :deep(.el-form-item__label) { color:#344054; font-weight:700; }
.r-community--compose_dialog :deep(.el-input__wrapper) { min-height:42px; border-radius:11px!important; }
.r-community--cover_upload { width:100%; min-height:96px; padding:12px; display:flex; align-items:center; gap:14px; border:1px dashed #cad2df; border-radius:14px; background:#f8faff; cursor:pointer; transition:border-color .2s,background .2s; }
.r-community--cover_upload:hover { border-color:#fec433; background:#fffaf0; }
.r-community--cover_upload img { width:126px; height:72px; object-fit:cover; border-radius:10px; }
.r-community--cover_upload > div { flex:1; display:flex; flex-direction:column; gap:4px; color:#344054; }
.r-community--cover_upload > div span { color:#98a2b3; font-size:12px; }
.r-community--side_heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.r-community--side_heading .r-community--card_title { margin:0; padding:0; border:0; }
.r-community--side_heading button { border:0; background:transparent; color:#b77908; font-size:12px; cursor:pointer; }
.r-community--board_row { position:relative; }
.r-community--board_item { width:100%; display:grid; grid-template-columns:36px 1fr auto; align-items:center; gap:10px; padding:10px 34px 10px 10px; margin-top:6px; border:1px solid transparent; border-radius:12px; background:transparent; text-align:left; cursor:pointer; transition:.2s; }
.r-community--board_item:hover,.r-community--board_item.active { border-color:#f1d687; background:#fff9e8; }
.r-community--board_icon { width:36px; height:36px; display:grid; place-items:center; border-radius:11px; font-size:17px; }
.r-community--board_item b,.r-community--board_item small { display:block; }
.r-community--board_item b { color:#273247; font-size:13px; }
.r-community--board_item small { margin-top:2px; color:#98a2b3; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:158px; }
.r-community--board_item em { color:#98a2b3; font-size:11px; font-style:normal; }
.r-community--board_follow { position:absolute; right:8px; top:50%; transform:translateY(-50%); width:25px; height:25px; padding:0; border:0; border-radius:8px; background:transparent; color:#aab2c0; font-size:18px; cursor:pointer; }
.r-community--board_follow:hover,.r-community--board_follow.active { background:#fff2c7; color:#d89a00; }
.r-community--subscription_topic,.r-community--subscription_board { width:100%; display:flex; align-items:center; gap:12px; padding:13px 12px; border:0; border-bottom:1px solid #edf0f5; background:transparent; text-align:left; cursor:pointer; }
.r-community--subscription_topic:hover,.r-community--subscription_board:hover { background:#fffaf0; }
.r-community--subscription_topic > span { flex:1; min-width:0; }
.r-community--subscription_topic b,.r-community--subscription_topic small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.r-community--subscription_topic b { color:#273247; font-size:14px; }
.r-community--subscription_topic small,.r-community--subscription_topic em,.r-community--subscription_board small { margin-top:4px; color:#8a94a5; font-size:12px; font-style:normal; }
.r-community--subscription_board > span { width:34px; font-size:20px; text-align:center; }
.r-community--subscription_board b { min-width:100px; color:#273247; }
.r-community--subscription_board small { flex:1; }
.r-community--author_meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px 10px; }
.r-community--topic_meta { flex:none; font-size:12px; font-weight:700; white-space:nowrap; }
.r-community--question_state { padding:2px 7px; border-radius:999px; color:#b54708; background:#fff3df; }
.r-community--question_state.solved { color:#087443; background:#e9f8ef; }
.r-community--item_tags { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:11px; color:#8a6a1c; font-size:12px; }
.r-community--item_tags button { padding:0; border:0; background:transparent; color:inherit; cursor:pointer; }
.r-community--item_tags button:hover { color:#d18b00; text-decoration:underline; }
.r-community--unread_dot { display:inline-flex; margin-left:6px; padding:2px 6px; border-radius:8px; background:#fec433; color:#5c4100; font-size:10px; font-style:normal; }
.r-community--item_footer .r-community--last_reply { margin-left:auto; color:#7c8799; }
.r-community--leaderboard_card .r-community--side_heading > span { color:#a4acb9; font-size:11px; }
.r-community--leader_row { width:100%; display:grid; grid-template-columns:24px 36px minmax(0,1fr) 22px; align-items:center; gap:9px; padding:9px 7px; border:0; border-radius:11px; background:transparent; color:#344054; text-align:left; cursor:pointer; transition:.18s; }
.r-community--leader_row:hover { background:#fff9e8; transform:translateX(2px); }
.r-community--leader_row > em { display:grid; place-items:center; width:22px; height:22px; border-radius:7px; background:#f1f3f6; color:#8992a3; font-size:11px; font-style:normal; font-weight:800; }
.r-community--leader_row > em.top { background:#fff0b8; color:#b87800; }
.r-community--leader_row > :deep(.app-image),.r-community--leader_row > img { width:36px; height:36px; border-radius:50%; object-fit:cover; }
.r-community--leader_row > span { min-width:0; }
.r-community--leader_row b,.r-community--leader_row small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.r-community--leader_row b { font-size:13px; }
.r-community--leader_row small { margin-top:3px; color:#98a2b3; font-size:10px; }
.r-community--leader_row > i { font-style:normal; font-weight:800; text-align:center; }
@media (max-width: 768px) {
  .r-community--tabs :deep(.el-radio-group) { display:flex; width:100%; overflow-x:auto; padding-bottom:3px; }
  .r-community--forum_search { width:100%; }
  .r-community--item_footer .r-community--last_reply { display:none; }
}
</style>
