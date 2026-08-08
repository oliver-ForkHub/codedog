<template>
  <div class="r-admin-posts--page">
    <section class="r-admin-posts--overview" v-loading="overviewLoading">
      <div class="r-admin-posts--overview_head">
        <div><h2>论坛运营总览</h2><p>{{ overview.scope === 'assigned' ? '仅统计您负责的版块' : '全站论坛内容与活跃情况' }}</p></div>
        <div class="r-admin-posts--overview_actions">
          <el-button v-if="overview.can_configure_attention" plain @click="openAttentionSettings">关注规则</el-button>
          <el-button text @click="fetchOverview">刷新数据</el-button>
        </div>
      </div>
      <div class="r-admin-posts--metrics">
        <div class="r-admin-posts--metric"><span>已发布主题</span><strong>{{ overview.metrics.total_published }}</strong><small>累计 {{ overview.metrics.total_replies }} 条回复</small></div>
        <div class="r-admin-posts--metric is-accent"><span>今日互动</span><strong>{{ overview.metrics.today_topics + overview.metrics.today_replies }}</strong><small>{{ overview.metrics.today_topics }} 主题 · {{ overview.metrics.today_replies }} 回复</small></div>
        <div class="r-admin-posts--metric"><span>30 天活跃作者</span><strong>{{ overview.metrics.active_authors_30d }}</strong><small>发帖或参与回复</small></div>
        <div class="r-admin-posts--metric is-warning"><span>待回答问题</span><strong>{{ overview.metrics.unanswered_questions }}</strong><small>其中 {{ overview.metrics.stale_questions }} 条超过 72 小时</small></div>
        <div class="r-admin-posts--metric"><span>内容状态</span><strong>{{ overview.metrics.hidden_topics + overview.metrics.locked_topics }}</strong><small>{{ overview.metrics.hidden_topics }} 隐藏 · {{ overview.metrics.locked_topics }} 锁定</small></div>
        <div class="r-admin-posts--metric"><span>精华主题</span><strong>{{ overview.metrics.essence_topics }}</strong><small>优质内容沉淀</small></div>
      </div>
      <div class="r-admin-posts--overview_grid">
        <div class="r-admin-posts--panel">
          <div class="r-admin-posts--panel_title"><b>近 7 天趋势</b><span>主题 / 回复</span></div>
          <div class="r-admin-posts--trend">
            <div v-for="item in overview.trend" :key="item.day" class="r-admin-posts--trend_item">
              <div class="r-admin-posts--trend_bars"><i class="is-topic" :style="{ height: trendHeight(item.topics) }" :title="`${item.topics} 个主题`" /><i class="is-reply" :style="{ height: trendHeight(item.replies) }" :title="`${item.replies} 条回复`" /></div>
              <span>{{ item.day.slice(5) }}</span>
            </div>
          </div>
        </div>
        <div class="r-admin-posts--panel">
          <div class="r-admin-posts--panel_title"><b>需要关注</b><span>{{ overview.attention.length }} 项</span></div>
          <div v-if="overview.attention.length" class="r-admin-posts--attention">
            <button v-for="item in overview.attention" :key="item.id" type="button" @click="chooseAttentionAction(item)">
              <span class="r-admin-posts--attention_title">{{ item.title }}</span><span>{{ item.board?.icon }} {{ item.board?.name || '未分区' }}</span>
              <el-tag size="small" :type="attentionReason(item.reason).type">{{ attentionReason(item.reason, item.signal_count).label }}</el-tag>
            </button>
          </div>
          <el-empty v-else description="当前没有待关注内容" :image-size="48" />
        </div>
      </div>
      <div v-if="overview.boards.length" class="r-admin-posts--boards_summary">
        <span v-for="board in overview.boards" :key="board.id"><i :style="{ background: board.color }" />{{ board.icon }} {{ board.name }} <b>{{ board.post_count }}</b></span>
      </div>
    </section>

    <!-- 待审查专区：命中敏感词但已发布的帖子，等待人工二次审核 -->
    <section class="r-admin-posts--pending_review" v-loading="pendingReviewLoading">
      <div class="r-admin-posts--pending_head">
        <div>
          <h2>敏感词待审查 <el-badge :value="pendingReviewTotal" :hidden="pendingReviewTotal === 0" type="warning" /></h2>
          <p>用户发帖命中敏感词后已直接发布，但被标记为待人工二次审核。审核后记录完整审计日志。</p>
        </div>
        <el-button text @click="fetchPendingReviewPosts">刷新</el-button>
      </div>
      <el-empty v-if="!pendingReviewPosts.length && !pendingReviewLoading" description="当前没有待审查内容" :image-size="48" />
      <el-table v-else :data="pendingReviewPosts" stripe size="small">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="作者" width="120">
          <template #default="{ row }">{{ row.author?.nickname || row.author?.username }}</template>
        </el-table-column>
        <el-table-column label="命中词" min-width="180">
          <template #default="{ row }">
            <el-tag v-for="word in (row.sensitive_info?.violations || [])" :key="word" size="small" type="warning" style="margin-right:4px">{{ word }}</el-tag>
            <el-tag size="small" type="info">{{ riskLevelText(row.sensitive_info?.riskLevel) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="板块" width="120">
          <template #default="{ row }">{{ row.board ? `${row.board.icon} ${row.board.name}` : '未分区' }}</template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openPendingReview(row)">审核</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="pendingReviewTotal > pendingReviewPageSize" class="r-admin-posts--pagination">
        <el-pagination v-model:current-page="pendingReviewPage" :page-size="pendingReviewPageSize" :total="pendingReviewTotal" layout="total, prev, pager, next" @current-change="fetchPendingReviewPosts" />
      </div>
    </section>

    <!-- 待审查审核对话框 -->
    <el-dialog v-model="pendingReviewDetailVisible" title="敏感词审核" width="min(560px, 92vw)" append-to-body>
      <div v-if="pendingReviewTarget">
        <el-descriptions :column="1" border size="small" style="margin-bottom:16px">
          <el-descriptions-item label="帖子">{{ pendingReviewTarget.title }} (#{{ pendingReviewTarget.id }})</el-descriptions-item>
          <el-descriptions-item label="作者">{{ pendingReviewTarget.author?.nickname || pendingReviewTarget.author?.username }}</el-descriptions-item>
          <el-descriptions-item label="命中词">
            <el-tag v-for="word in (pendingReviewTarget.sensitive_info?.violations || [])" :key="word" size="small" type="warning" style="margin-right:4px">{{ word }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="风险等级">{{ riskLevelText(pendingReviewTarget.sensitive_info?.riskLevel) }}</el-descriptions-item>
          <el-descriptions-item label="内容预览"><div style="max-height:160px;overflow:auto;white-space:pre-wrap">{{ pendingReviewTarget.content }}</div></el-descriptions-item>
        </el-descriptions>
        <el-form label-width="90px">
          <el-form-item label="审核原因"><el-input v-model="pendingReviewReason" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="删除操作必填，其他操作可选" /></el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="pendingReviewDetailVisible = false">取消</el-button>
        <el-button type="info" plain @click="submitPendingReview('ignore')">忽略</el-button>
        <el-button type="success" @click="submitPendingReview('pass')">通过</el-button>
        <el-button type="danger" @click="submitPendingReview('delete')">删除</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="attentionSettingsVisible" title="需要关注 · 预警规则" width="min(500px, 92vw)" append-to-body>
      <p class="r-admin-posts--settings_intro">达到任一条件的帖子会进入“需要关注”。浏览和点赞统计窗口固定为近 2 小时。</p>
      <el-form label-width="150px">
        <el-form-item label="浏览激增阈值"><el-input-number v-model="attentionSettingsForm.view_threshold" :min="1" :max="100000" /><span class="r-admin-posts--hint">次 / 2 小时</span></el-form-item>
        <el-form-item label="点赞激增阈值"><el-input-number v-model="attentionSettingsForm.like_threshold" :min="1" :max="100000" /><span class="r-admin-posts--hint">次 / 2 小时</span></el-form-item>
        <el-form-item label="未处理举报阈值"><el-input-number v-model="attentionSettingsForm.report_threshold" :min="1" :max="100000" /><span class="r-admin-posts--hint">条</span></el-form-item>
      </el-form>
      <template #footer><el-button @click="attentionSettingsVisible = false">取消</el-button><el-button type="primary" :loading="attentionSettingsSaving" @click="saveAttentionSettings">保存规则</el-button></template>
    </el-dialog>

    <div class="r-admin-posts--toolbar">
      <el-input v-model="searchKeyword" placeholder="搜索帖子" clearable class="r-admin-posts--search" @keyup.enter="handleSearch">
        <template #append><el-button @click="handleSearch">搜索</el-button></template>
      </el-input>
      <el-button type="primary" @click="refreshAll">刷新</el-button>
      <el-button @click="openBoardManager">板块管理</el-button>
    </div>

    <el-table :data="posts" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="作者" width="120">
        <template #default="{ row }">{{ row.author?.nickname || row.author?.username }}</template>
      </el-table-column>
      <el-table-column prop="category" label="分类" width="100">
        <template #default="{ row }">{{ row.board ? `${row.board.icon} ${row.board.name}` : (categoryMap[row.category] || row.category) }}</template>
      </el-table-column>
      <el-table-column prop="view_count" label="浏览" width="80" />
      <el-table-column prop="like_count" label="点赞" width="80" />
      <el-table-column prop="comment_count" label="评论" width="80" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'published' ? 'success' : row.status === 'hidden' ? 'warning' : 'info'">
            {{ row.status === 'published' ? '正常' : row.status === 'hidden' ? '隐藏' : row.status === 'draft' ? '草稿' : row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="待审查" width="100">
        <template #default="{ row }">
          <el-tag v-if="postPendingFlag(row)" type="danger" effect="dark" size="small" @click="openPendingReview(row)" style="cursor:pointer">命中敏感词</el-tag>
          <span v-else style="color:#98a2b3">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="r-admin-posts--pagination">
      <el-pagination v-model:current-page="currentPage" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="fetchPosts" />
    </div>

    <el-dialog v-model="boardManagerVisible" title="论坛板块管理" width="860px" destroy-on-close>
      <div class="r-admin-posts--board_toolbar">
        <span>板块停用后不会丢失历史帖子；有内容的板块删除时会自动改为停用。</span>
        <el-button type="primary" @click="openBoardEditor()">新增板块</el-button>
      </div>
      <el-table :data="boards" v-loading="boardsLoading" border>
        <el-table-column label="板块" min-width="180"><template #default="{ row }"><b>{{ row.icon }} {{ row.name }}</b><div class="r-admin-posts--board_slug">{{ row.slug }}</div></template></el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="post_count" label="帖子" width="70" />
        <el-table-column prop="sort_order" label="排序" width="70" />
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="220"><template #default="{ row }"><el-button size="small" @click="openModeratorManager(row)">版主</el-button><el-button size="small" @click="openBoardEditor(row)">编辑</el-button><el-button size="small" type="danger" plain @click="removeBoard(row)">删除</el-button></template></el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="moderatorVisible" :title="`${moderatorBoard?.name || ''} · 分区版主`" width="620px" append-to-body>
      <el-alert title="分区版主只能管理被分配板块中的主题；管理员和超级管理员不受分区限制。" type="info" :closable="false" style="margin-bottom:14px" />
      <div class="r-admin-posts--moderator_add">
        <el-input-number v-model="moderatorForm.user_id" :min="1" :controls="false" placeholder="版主用户 ID" />
        <el-input v-model="moderatorForm.note" maxlength="300" placeholder="分配备注（可选）" />
        <el-button type="primary" :loading="moderatorSaving" @click="assignModerator">添加版主</el-button>
      </div>
      <el-table :data="moderators" v-loading="moderatorsLoading" border>
        <el-table-column label="用户" min-width="180"><template #default="{ row }"><b>{{ row.user?.nickname || row.user?.username }}</b><div class="r-admin-posts--board_slug">ID {{ row.user_id }} · {{ row.user?.role }}</div></template></el-table-column>
        <el-table-column prop="note" label="备注" min-width="180" />
        <el-table-column label="操作" width="90"><template #default="{ row }"><el-button size="small" type="danger" plain @click="removeModerator(row)">移除</el-button></template></el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="boardEditorVisible" :title="boardForm.id ? '编辑板块' : '新增板块'" width="560px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="boardForm.name" maxlength="50" /></el-form-item>
        <el-form-item label="标识"><el-input v-model="boardForm.slug" placeholder="例如 qa-help" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="boardForm.description" type="textarea" :rows="3" maxlength="300" show-word-limit /></el-form-item>
        <el-form-item label="图标/颜色"><el-input v-model="boardForm.icon" style="width:100px" /><el-color-picker v-model="boardForm.color" style="margin-left:12px" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="boardForm.sort_order" :min="0" :max="9999" /></el-form-item>
        <el-form-item label="状态"><el-radio-group v-model="boardForm.status"><el-radio label="active">启用</el-radio><el-radio label="disabled">停用</el-radio></el-radio-group></el-form-item>
        <el-form-item label="允许发帖"><el-checkbox-group v-model="boardForm.allow_post_roles"><el-checkbox v-for="role in roleOptions" :key="role.value" :label="role.value">{{ role.label }}</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item label="工作室招募"><el-switch v-model="boardForm.studio_recruitment_only" /><span style="margin-left:10px;color:#8b95a7">开启后仅活跃工作室的室长可发帖，并自动关联工作室</span></el-form-item>
      </el-form>
      <template #footer><el-button @click="boardEditorVisible = false">取消</el-button><el-button type="primary" :loading="boardSaving" @click="saveBoard">保存</el-button></template>
    </el-dialog>

    <!-- 帖子详情弹窗(编辑+操作) -->
    <el-dialog v-model="detailVisible" title="帖子详情" width="min(680px, 92vw)" destroy-on-close>
      <div v-if="editingPost">
        <el-descriptions :column="2" border size="small" style="margin-bottom: 16px;">
          <el-descriptions-item label="ID">{{ editingPost.id }}</el-descriptions-item>
          <el-descriptions-item label="作者">{{ editingPost.author?.nickname || editingPost.author?.username }}</el-descriptions-item>
          <el-descriptions-item label="浏览">{{ editingPost.view_count }}</el-descriptions-item>
          <el-descriptions-item label="点赞">{{ editingPost.like_count }}</el-descriptions-item>
          <el-descriptions-item label="评论">{{ editingPost.comment_count }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="editingPost.status === 'published' ? 'success' : editingPost.status === 'hidden' ? 'warning' : 'info'">{{ editingPost.status === 'published' ? '正常' : editingPost.status === 'hidden' ? '隐藏' : editingPost.status === 'draft' ? '草稿' : editingPost.status === 'deleted' ? '已删除' : editingPost.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(editingPost.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDate(editingPost.updated_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-form label-width="80px">
          <el-form-item label="标题">
            <el-input v-model="editForm.title" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="editForm.board_id" style="width: 100%">
              <el-option v-for="board in boards" :key="board.id" :label="`${board.icon} ${board.name}`" :value="board.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="帖子类型">
            <el-select v-model="editForm.post_type" style="width:100%"><el-option label="普通讨论" value="discussion" /><el-option label="问答求助" value="question" /><el-option label="分享" value="share" /><el-option label="教程" value="tutorial" /><el-option label="公告" value="news" /></el-select>
          </el-form-item>
          <el-form-item label="精选">
            <el-switch v-model="editForm.is_essence" />
          </el-form-item>
          <el-form-item label="置顶">
            <el-switch v-model="editForm.is_top" />
          </el-form-item>
          <el-form-item label="锁定回复"><el-switch v-model="editForm.is_locked" /></el-form-item>
          <el-form-item label="慢速模式">
            <el-input-number v-model="editForm.slow_mode_seconds" :min="0" :max="86400" :step="30" />
            <span class="r-admin-posts--hint">秒，0 表示关闭</span>
          </el-form-item>
          <el-form-item label="操作原因" required>
            <el-input v-model="editForm.moderation_reason" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="移动、锁定、置顶或修改帖子时必须填写，记录到版务日志" />
          </el-form-item>
        </el-form>

        <div class="r-admin-posts--detail_actions">
          <el-button type="danger" @click="handleDeletePost">删除帖子</el-button>
          <div class="r-admin-posts--detail_actions_main">
            <el-button v-if="editingPost.author?.id" type="warning" plain @click="warnPostAuthor">警告作者</el-button>
            <el-button @click="openMovePost">移动主题</el-button>
            <el-button type="warning" plain @click="openMergePost">合并主题</el-button>
            <el-button @click="openPostHistory">历史与日志</el-button>
            <el-button @click="detailVisible = false">取消</el-button>
            <el-button type="primary" @click="handleSavePost">保存修改</el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="historyVisible" title="帖子历史与版务日志" width="900px" destroy-on-close>
      <el-tabs v-model="historyTab" v-loading="historyLoading">
        <el-tab-pane label="修订历史" name="revisions">
          <el-timeline v-if="postHistory.revisions.length">
            <el-timeline-item v-for="revision in postHistory.revisions" :key="revision.id" :timestamp="formatDate(revision.created_at)" placement="top">
              <div class="r-admin-posts--history_card">
                <div><b>版本 #{{ revision.revision_number }}</b><el-tag size="small" style="margin-left:8px">{{ revision.source }}</el-tag><span>{{ revision.editor?.nickname || revision.editor?.username || '系统' }}</span></div>
                <strong>{{ revision.title }}</strong>
                <p>{{ revision.change_reason || '未填写修改说明' }}</p>
                <el-button size="small" type="warning" plain @click="restoreRevision(revision)">回滚到此版本</el-button>
              </div>
            </el-timeline-item>
          </el-timeline><el-empty v-else description="暂无修订历史" />
        </el-tab-pane>
        <el-tab-pane label="版务日志" name="moderation">
          <el-timeline v-if="postHistory.moderation_logs.length">
            <el-timeline-item v-for="log in postHistory.moderation_logs" :key="log.id" :timestamp="formatDate(log.created_at)" placement="top">
              <div class="r-admin-posts--history_card"><div><b>{{ log.action }}</b><span>{{ log.operator?.nickname || log.operator?.username || '系统' }}</span></div><p>{{ log.reason }}</p></div>
            </el-timeline-item>
          </el-timeline><el-empty v-else description="暂无版务操作" />
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const loading = ref(false)
const posts = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const searchKeyword = ref('')
const overviewLoading = ref(false)

// 待审查专区数据：命中敏感词但已发布的帖子，等待人工二次审核
const pendingReviewLoading = ref(false)
const pendingReviewPosts = ref([])
const pendingReviewTotal = ref(0)
const pendingReviewPage = ref(1)
const pendingReviewPageSize = ref(5)
const pendingReviewDetailVisible = ref(false)
const pendingReviewTarget = ref(null)
const pendingReviewReason = ref('')
const overview = reactive({
  scope: 'all',
  metrics: { total_published: 0, total_replies: 0, today_topics: 0, today_replies: 0, active_authors_30d: 0, unanswered_questions: 0, stale_questions: 0, locked_topics: 0, hidden_topics: 0, essence_topics: 0 },
  trend: [], boards: [], attention: []
})
const attentionSettingsVisible = ref(false)
const attentionSettingsSaving = ref(false)
const attentionSettingsForm = reactive({ view_threshold: 20, like_threshold: 8, report_threshold: 3 })
const boards = ref([])
const boardsLoading = ref(false)
const boardManagerVisible = ref(false)
const boardEditorVisible = ref(false)
const boardSaving = ref(false)
const moderatorVisible = ref(false)
const moderatorBoard = ref(null)
const moderators = ref([])
const moderatorsLoading = ref(false)
const moderatorSaving = ref(false)
const moderatorForm = reactive({ user_id: null, note: '' })
const roleOptions = [
  { value: 'user', label: '普通用户' }, { value: 'reviewer', label: '审核员' },
  { value: 'moderator', label: '版主' }, { value: 'admin', label: '管理员' }, { value: 'superadmin', label: '超级管理员' }
]
const boardForm = reactive({ id: null, name: '', slug: '', description: '', icon: '💬', color: '#fec433', sort_order: 0, status: 'active', studio_recruitment_only: false, allow_post_roles: ['user', 'reviewer', 'moderator', 'admin', 'superadmin'] })

// 帖子详情弹窗
const detailVisible = ref(false)
const editingPost = ref(null)
const editForm = reactive({ title: '', board_id: null, post_type: 'discussion', is_essence: false, is_top: false, is_locked: false, slow_mode_seconds: 0, moderation_reason: '' })
const historyVisible = ref(false)
const historyLoading = ref(false)
const historyTab = ref('revisions')
const postHistory = reactive({ revisions: [], moderation_logs: [] })

const categoryMap = { discussion: '讨论', question: '问答', share: '分享', tutorial: '教程', news: '公告' }

const trendMax = computed(() => Math.max(1, ...overview.trend.flatMap(item => [item.topics, item.replies])))
const trendHeight = value => `${Math.max(value ? 8 : 2, Math.round((Number(value || 0) / trendMax.value) * 76))}px`
const attentionReason = (reason, count) => ({
  hidden: { label: '待复核隐藏内容', type: 'warning' },
  stale_question: { label: '超过 72 小时未解答', type: 'info' },
  rapid_views: { label: `2 小时浏览激增${count ? ` · ${count}` : ''}`, type: 'danger' },
  rapid_likes: { label: `2 小时点赞激增${count ? ` · ${count}` : ''}`, type: 'danger' },
  many_reports: { label: `集中举报${count ? ` · ${count}` : ''}`, type: 'danger' }
}[reason] || { label: '需要关注', type: 'info' })

const fetchOverview = async () => {
  overviewLoading.value = true
  try {
    const res = await adminApi.getForumOverview()
    if (res.code === 200) Object.assign(overview, res.data)
  } catch (e) { ElMessage.error(e.response?.data?.msg || '获取论坛运营数据失败') }
  finally { overviewLoading.value = false }
}

const openAttentionSettings = () => {
  Object.assign(attentionSettingsForm, overview.attention_settings || { view_threshold: 20, like_threshold: 8, report_threshold: 3 })
  attentionSettingsVisible.value = true
}

const saveAttentionSettings = async () => {
  attentionSettingsSaving.value = true
  try {
    const res = await adminApi.updateForumAttentionSettings({ ...attentionSettingsForm })
    if (res.code === 200) {
      ElMessage.success(res.msg || '关注规则已保存')
      attentionSettingsVisible.value = false
      await fetchOverview()
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '保存关注规则失败') }
  finally { attentionSettingsSaving.value = false }
}

const refreshAll = () => Promise.all([fetchPosts(), fetchOverview(), fetchPendingReviewPosts()])

const fetchPosts = async () => {
  loading.value = true
  try {
    const res = await adminApi.getPosts({ page: currentPage.value, pageSize: pageSize.value, keyword: searchKeyword.value })
    if (res.code === 200) { posts.value = res.data.list; total.value = res.data.total }
  } catch (e) { ElMessage.error('获取帖子列表失败') } finally { loading.value = false }
}

// 获取待审查帖子（命中敏感词的帖子）
const fetchPendingReviewPosts = async () => {
  pendingReviewLoading.value = true
  try {
    const res = await adminApi.getPendingReviewPosts({ page: pendingReviewPage.value, pageSize: pendingReviewPageSize.value })
    if (res.code === 200) { pendingReviewPosts.value = res.data.list; pendingReviewTotal.value = res.data.total }
  } catch (e) { ElMessage.error('获取待审查帖子失败') } finally { pendingReviewLoading.value = false }
}

// 打开审核对话框
// 列表行可能只有 moderation_logs 数组，专区行有 sensitive_info 字段，统一兼容
const openPendingReview = (post) => {
  let target = post
  // 如果传入的是列表行（有 moderation_logs 无 sensitive_info），构造 sensitive_info
  if (!post.sensitive_info && post.moderation_logs) {
    const log = post.moderation_logs.find(item => item.action === 'sensitive_detected')
    if (log) {
      let state = null
      try { state = JSON.parse(log.after_state || '{}') } catch { state = {} }
      target = { ...post, sensitive_info: state }
    }
  }
  pendingReviewTarget.value = target
  pendingReviewReason.value = ''
  pendingReviewDetailVisible.value = true
}

// 提交审核操作：pass/delete/ignore
const submitPendingReview = async (action) => {
  if (!pendingReviewTarget.value) return
  // delete 操作必须填写原因
  if (action === 'delete' && !pendingReviewReason.value.trim()) {
    ElMessage.warning('删除操作必须填写原因')
    return
  }
  try {
    const res = await adminApi.reviewPendingPost(pendingReviewTarget.value.id, action, pendingReviewReason.value.trim())
    if (res.code === 200) {
      ElMessage.success(res.msg || '审核完成')
      pendingReviewDetailVisible.value = false
      // refreshAll 已包含 fetchPendingReviewPosts，避免重复请求
      await refreshAll()
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '审核失败') }
}

// 判断帖子是否处于待审查状态（命中敏感词但未审核）
const postPendingFlag = (row) => {
  if (!row?.moderation_logs) return null
  const sensitiveLog = row.moderation_logs.find(log => log.action === 'sensitive_detected')
  if (!sensitiveLog) return null
  let state = null
  try { state = JSON.parse(sensitiveLog.after_state || '{}') } catch { state = {} }
  return state && state.reviewed !== true ? sensitiveLog : null
}

// 风险等级汉化：low → 低，medium → 中等，high → 高（与发帖提示“中等风险”文案一致）
const riskLevelText = level => ({ low: '低', medium: '中等', high: '高' }[level] || level || '未知')

const handleSearch = () => { currentPage.value = 1; fetchPosts() }

const loadBoards = async () => {
  boardsLoading.value = true
  try {
    const res = await adminApi.getForumBoards()
    if (res.code === 200) boards.value = res.data || []
  } catch (e) { ElMessage.error('获取论坛板块失败') }
  finally { boardsLoading.value = false }
}

const openBoardManager = async () => {
  boardManagerVisible.value = true
  await loadBoards()
}

const openBoardEditor = (board = null) => {
  Object.assign(boardForm, board ? {
    id: board.id, name: board.name, slug: board.slug, description: board.description || '', icon: board.icon || '💬',
    color: board.color || '#fec433', sort_order: Number(board.sort_order || 0), status: board.status || 'active',
    studio_recruitment_only: !!board.studio_recruitment_only,
    allow_post_roles: Array.isArray(board.allow_post_roles) ? [...board.allow_post_roles] : []
  } : { id: null, name: '', slug: '', description: '', icon: '💬', color: '#fec433', sort_order: 0, status: 'active', studio_recruitment_only: false, allow_post_roles: ['user', 'reviewer', 'moderator', 'admin', 'superadmin'] })
  boardEditorVisible.value = true
}

const saveBoard = async () => {
  if (!boardForm.name.trim() || !boardForm.slug.trim()) return ElMessage.warning('请填写板块名称和标识')
  boardSaving.value = true
  try {
    const payload = { ...boardForm }
    delete payload.id
    const res = boardForm.id ? await adminApi.updateForumBoard(boardForm.id, payload) : await adminApi.createForumBoard(payload)
    if (res.code === 200) {
      ElMessage.success(res.msg || '保存成功')
      boardEditorVisible.value = false
      await loadBoards()
      refreshAll()
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '保存板块失败') }
  finally { boardSaving.value = false }
}

const removeBoard = async board => {
  try {
    await ElMessageBox.confirm(`确定处理板块“${board.name}”吗？已有帖子时只会安全停用。`, '删除板块', { type: 'warning' })
    const res = await adminApi.deleteForumBoard(board.id)
    if (res.code === 200) { ElMessage.success(res.msg); await loadBoards(); refreshAll() }
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.response?.data?.msg || '操作失败') }
}

const loadModerators = async () => {
  if (!moderatorBoard.value) return
  moderatorsLoading.value = true
  try {
    const res = await adminApi.getForumBoardModerators(moderatorBoard.value.id)
    if (res.code === 200) moderators.value = res.data || []
  } catch (e) { ElMessage.error(e.response?.data?.msg || '获取分区版主失败') }
  finally { moderatorsLoading.value = false }
}

const openModeratorManager = async board => {
  moderatorBoard.value = board
  moderatorForm.user_id = null
  moderatorForm.note = ''
  moderatorVisible.value = true
  await loadModerators()
}

const assignModerator = async () => {
  if (!moderatorForm.user_id) return ElMessage.warning('请输入版主用户 ID')
  moderatorSaving.value = true
  try {
    const res = await adminApi.assignForumBoardModerator(moderatorBoard.value.id, { user_id: moderatorForm.user_id, note: moderatorForm.note.trim() })
    if (res.code === 200) {
      ElMessage.success(res.msg || '分配成功')
      moderatorForm.user_id = null
      moderatorForm.note = ''
      await loadModerators()
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '分配版主失败') }
  finally { moderatorSaving.value = false }
}

const removeModerator = async assignment => {
  try {
    await ElMessageBox.confirm(`确定移除“${assignment.user?.nickname || assignment.user?.username}”的分区版主权限吗？`, '移除版主', { type: 'warning' })
    const res = await adminApi.removeForumBoardModerator(moderatorBoard.value.id, assignment.user_id)
    if (res.code === 200) { ElMessage.success(res.msg || '已移除'); await loadModerators() }
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.response?.data?.msg || '移除失败') }
}

const openDetail = async (post) => {
  if (!boards.value.length) await loadBoards()
  editingPost.value = post
  editForm.title = post.title || ''
  editForm.board_id = post.board_id || null
  editForm.post_type = post.post_type || post.category || 'discussion'
  editForm.is_essence = !!post.is_essence
  editForm.is_top = !!post.is_top
  editForm.is_locked = !!post.is_locked
  editForm.slow_mode_seconds = Number(post.slow_mode_seconds || 0)
  editForm.moderation_reason = ''
  detailVisible.value = true
}

const chooseAttentionAction = async post => {
  try {
    await ElMessageBox.confirm(`帖子“${post.title}”需要关注，请选择要打开的位置。`, '查看关注帖子', {
      type: 'warning',
      confirmButtonText: '打开原帖',
      cancelButtonText: '打开管理页',
      distinguishCancelAndClose: true
    })
    router.push(`/post/${post.id}`)
  } catch (action) {
    if (action === 'cancel') await openDetail(post)
  }
}

const warnPostAuthor = async () => {
  if (!editingPost.value?.author?.id) return
  try {
    const { value } = await ElMessageBox.prompt('请填写该用户在本板块中的具体违规事实。警告将强制用户签署保证书。', '正式警告帖子作者', { type: 'warning', inputType: 'textarea', inputPattern: /^.{5,1000}$/, inputErrorMessage: '警告原因需为 5-1000 字', confirmButtonText: '发出警告' })
    const res = await adminApi.warnUser(editingPost.value.author.id, value.trim(), { source_type: 'post', source_id: editingPost.value.id })
    if (res.code === 200) ElMessage.success(res.msg || '警告已发出')
  } catch (e) { if (!['cancel', 'close'].includes(e)) ElMessage.error(e.response?.data?.msg || '警告失败') }
}

const handleSavePost = async () => {
  if (editForm.moderation_reason.trim().length < 3) return ElMessage.warning('请填写至少 3 个字的操作原因')
  try {
    const res = await adminApi.updatePost(editingPost.value.id, {
      title: editForm.title.trim(),
      board_id: editForm.board_id,
      post_type: editForm.post_type,
      is_essence: editForm.is_essence,
      is_top: editForm.is_top,
      is_locked: editForm.is_locked,
      slow_mode_seconds: editForm.slow_mode_seconds,
      moderation_reason: editForm.moderation_reason.trim()
    })
    if (res.code === 200) {
      ElMessage.success('保存成功')
      detailVisible.value = false
      refreshAll()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) { ElMessage.error('保存失败') }
}

const openMovePost = async () => {
  try {
    const { value: boardId } = await ElMessageBox.prompt('请输入目标板块 ID', '移动主题', { inputPattern: /^\d+$/, inputErrorMessage: '请输入有效板块 ID' })
    const { value: reason } = await ElMessageBox.prompt('请说明移动原因，该说明会写入版务日志', '移动主题', { inputPattern: /^.{3,500}$/, inputErrorMessage: '原因需要 3-500 个字' })
    const res = await adminApi.movePost(editingPost.value.id, Number(boardId), reason.trim())
    if (res.code === 200) { ElMessage.success(res.msg || '主题已移动'); detailVisible.value = false; await refreshAll() }
  } catch (e) { if (!['cancel', 'close'].includes(e)) ElMessage.error(e.response?.data?.msg || '移动主题失败') }
}

const openMergePost = async () => {
  try {
    const { value: targetId } = await ElMessageBox.prompt('源主题的回复、点赞、收藏和订阅将迁移到目标主题，源主题会保留合并跳转。请输入目标帖子 ID。', '合并主题', { inputPattern: /^\d+$/, inputErrorMessage: '请输入有效帖子 ID', type: 'warning' })
    const { value: reason } = await ElMessageBox.prompt('请说明合并原因，该操作会完整写入审计日志', '确认合并主题', { inputPattern: /^.{3,500}$/, inputErrorMessage: '原因需要 3-500 个字', type: 'warning' })
    await ElMessageBox.confirm(`确定将帖子 #${editingPost.value.id} 合并到 #${targetId} 吗？此操作不可直接撤销。`, '最终确认', { type: 'warning', confirmButtonText: '确认合并' })
    const res = await adminApi.mergePosts(editingPost.value.id, Number(targetId), reason.trim())
    if (res.code === 200) { ElMessage.success(res.msg || '主题已合并'); detailVisible.value = false; await refreshAll() }
  } catch (e) { if (!['cancel', 'close'].includes(e)) ElMessage.error(e.response?.data?.msg || '合并主题失败') }
}

const openPostHistory = async () => {
  if (!editingPost.value) return
  historyVisible.value = true
  historyLoading.value = true
  try {
    const res = await adminApi.getPostHistory(editingPost.value.id)
    if (res.code === 200) {
      postHistory.revisions = res.data?.revisions || []
      postHistory.moderation_logs = res.data?.moderation_logs || []
    }
  } catch (e) { ElMessage.error('获取帖子历史失败') }
  finally { historyLoading.value = false }
}

const restoreRevision = async revision => {
  try {
    const { value } = await ElMessageBox.prompt(`将帖子回滚到版本 #${revision.revision_number}，请填写原因`, '回滚帖子', { inputPattern: /^.{3,500}$/, inputErrorMessage: '原因需为 3-500 字', type: 'warning' })
    const res = await adminApi.restorePostRevision(editingPost.value.id, revision.id, value.trim())
    if (res.code === 200) {
      ElMessage.success(res.msg || '回滚成功')
      await Promise.all([openPostHistory(), refreshAll()])
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.response?.data?.msg || '回滚失败') }
}

const handleDeletePost = async () => {
  try {
    const { value } = await ElMessageBox.prompt('删除后帖子会保留审计证据但不再公开，请填写处理原因。', '删除帖子', { inputPattern: /^.{3,500}$/, inputErrorMessage: '原因需为 3-500 字', type: 'warning', confirmButtonText: '确认删除' })
    const res = await adminApi.deletePost(editingPost.value.id, value.trim())
    if (res.code === 200) {
      ElMessage.success('删除成功')
      detailVisible.value = false
      refreshAll()
    } else { ElMessage.error(res.msg || '删除失败') }
  } catch (e) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

const formatDate = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(refreshAll)
</script>

<style lang="scss" scoped>
.r-admin-posts--page { background: #fff; border-radius: 12px; padding: 24px; }
.r-admin-posts--overview { margin-bottom:24px; padding:20px; border:1px solid #edf0f5; border-radius:16px; background:linear-gradient(145deg,#fff 60%,#fff9e8); }
.r-admin-posts--pending_review { margin-bottom:24px; padding:20px; border:1px solid #ffe3a3; border-radius:16px; background:linear-gradient(145deg,#fffdf7,#fff); }
.r-admin-posts--pending_head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:14px; }
.r-admin-posts--pending_head h2 { margin:0; color:#202a3d; font-size:18px; }
.r-admin-posts--pending_head p { margin:5px 0 0; color:#98a2b3; font-size:12px; }
.r-admin-posts--overview_head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; }
.r-admin-posts--overview_head h2 { margin:0; color:#202a3d; font-size:20px; }
.r-admin-posts--overview_head p { margin:5px 0 0; color:#98a2b3; font-size:12px; }
.r-admin-posts--overview_actions { display:flex; align-items:center; gap:8px; }
.r-admin-posts--settings_intro { margin:0 0 18px; padding:11px 13px; border-radius:10px; background:#fff8e7; color:#7a641f; font-size:13px; line-height:1.6; }
.r-admin-posts--metrics { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; }
.r-admin-posts--metric { display:flex; flex-direction:column; min-width:0; padding:14px; border:1px solid #edf0f5; border-radius:12px; background:#fff; }
.r-admin-posts--metric span { color:#667085; font-size:12px; }
.r-admin-posts--metric strong { margin:6px 0 3px; color:#202a3d; font-size:25px; line-height:1; }
.r-admin-posts--metric small { overflow:hidden; color:#98a2b3; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.r-admin-posts--metric.is-accent { border-color:#ffe19a; background:#fffaf0; }
.r-admin-posts--metric.is-warning strong { color:#e09100; }
.r-admin-posts--overview_grid { display:grid; grid-template-columns:minmax(360px,1fr) minmax(360px,1fr); gap:12px; margin-top:12px; }
.r-admin-posts--panel { min-height:150px; padding:14px 16px; border:1px solid #edf0f5; border-radius:12px; background:#fff; }
.r-admin-posts--panel_title { display:flex; justify-content:space-between; align-items:center; color:#98a2b3; font-size:11px; }
.r-admin-posts--panel_title b { color:#344054; font-size:14px; }
.r-admin-posts--trend { display:flex; height:105px; align-items:flex-end; justify-content:space-around; gap:8px; padding-top:12px; }
.r-admin-posts--trend_item { display:flex; flex:1; flex-direction:column; align-items:center; gap:5px; color:#98a2b3; font-size:10px; }
.r-admin-posts--trend_bars { display:flex; height:78px; align-items:flex-end; gap:3px; }
.r-admin-posts--trend_bars i { display:block; width:8px; min-height:2px; border-radius:5px 5px 2px 2px; transition:height .2s ease; }
.r-admin-posts--trend_bars .is-topic { background:#fec433; }
.r-admin-posts--trend_bars .is-reply { background:#7ea1e8; }
.r-admin-posts--attention { margin-top:8px; }
.r-admin-posts--attention button { display:grid; width:100%; grid-template-columns:minmax(0,1fr) 110px 128px; align-items:center; gap:8px; padding:8px 0; border:0; border-bottom:1px solid #f0f2f5; background:none; color:#667085; text-align:left; cursor:pointer; }
.r-admin-posts--attention button:hover .r-admin-posts--attention_title { color:#e79b00; }
.r-admin-posts--attention_title { overflow:hidden; color:#344054; text-overflow:ellipsis; white-space:nowrap; }
.r-admin-posts--boards_summary { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.r-admin-posts--boards_summary span { display:inline-flex; align-items:center; gap:5px; padding:6px 9px; border-radius:8px; background:#f7f8fa; color:#667085; font-size:11px; }
.r-admin-posts--boards_summary i { width:6px; height:6px; border-radius:50%; }
.r-admin-posts--boards_summary b { color:#344054; }
.r-admin-posts--toolbar { display: flex; gap: 12px; margin-bottom: 20px; .r-admin-posts--search { width: 300px; } }
.r-admin-posts--pagination { display: flex; justify-content: flex-end; margin-top: 20px; }
.r-admin-posts--hint { margin-left: 10px; color: #999; font-size: 12px; }
.r-admin-posts--board_toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; color:#7c8799; font-size:13px; }
.r-admin-posts--board_slug { margin-top:3px; color:#98a2b3; font-size:11px; }
.r-admin-posts--history_card { padding:12px 14px; border:1px solid #e8ebf0; border-radius:12px; background:#fafbfc; }
.r-admin-posts--history_card > div { display:flex; align-items:center; gap:10px; }
.r-admin-posts--history_card > div span:last-child { margin-left:auto; color:#7c8799; font-size:12px; }
.r-admin-posts--history_card strong { display:block; margin:9px 0 4px; color:#273247; }
.r-admin-posts--history_card p { margin:5px 0 10px; color:#667085; font-size:13px; }
.r-admin-posts--moderator_add { display:grid; grid-template-columns:140px minmax(180px,1fr) auto; gap:10px; margin-bottom:14px; }
.r-admin-posts--detail_actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:16px; padding:0 8px 4px; }
.r-admin-posts--detail_actions_main { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; }
.r-admin-posts--detail_actions_main :deep(.el-button) { margin-left:0; }
@media (max-width: 1200px) {
  .r-admin-posts--metrics { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .r-admin-posts--overview_grid { grid-template-columns:1fr; }
}
</style>
