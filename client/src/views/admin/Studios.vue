<template>
  <div class="r-admin-studios--page">
    <div class="r-admin-studios--toolbar">
      <el-input v-model="searchKeyword" placeholder="搜索工作室" clearable class="r-admin-studios--search" @keyup.enter="handleSearch">
        <template #append><el-button @click="handleSearch">搜索</el-button></template>
      </el-input>
      <el-button type="primary" @click="fetchStudios">刷新</el-button>
    </div>
    
    <el-table :data="studios" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column label="创建者" width="120">
        <template #default="{ row }">{{ row.owner?.nickname || row.owner?.username }}</template>
      </el-table-column>
      <el-table-column label="等级" width="80">
        <template #default="{ row }">
          <el-tag type="warning">Lv.{{ row.level || 1 }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="points" label="积分" width="80">
        <template #default="{ row }">{{ row.points || 0 }}</template>
      </el-table-column>
      <el-table-column prop="member_count" label="成员" width="80" />
      <el-table-column prop="work_count" label="作品" width="80" />
      <el-table-column label="加入方式" width="100">
        <template #default="{ row }">
          <el-tag>{{ { free: '自由', apply: '申请', invite: '邀请' }[row.join_type] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '正常' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="showDetailDialog(row)">详情</el-button>
          <el-button size="small" @click="showPointsDialog(row)">积分</el-button>
          <el-button size="small" type="danger" @click="deleteStudio(row)">解散</el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <div class="r-admin-studios--pagination">
      <el-pagination v-model:current-page="currentPage" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="fetchStudios" />
    </div>
    
    <el-dialog v-model="detailDialogVisible" title="工作室详情" width="900px" top="5vh">
      <div v-if="detailLoading" style="text-align: center; padding: 40px;">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      </div>
      <div v-else-if="studioDetail" class="r-admin-studios--detail">
        <div class="r-admin-studios--detail_header">
          <div class="r-admin-studios--detail_cover" :style="{ backgroundImage: `url(${studioDetail.cover || defaultCover})` }">
            <div class="r-admin-studios--detail_level">Lv.{{ studioDetail.level || 1 }}</div>
          </div>
          <div class="r-admin-studios--detail_info">
            <h2>{{ studioDetail.name }}</h2>
            <p class="r-admin-studios--detail_desc">{{ studioDetail.description || '暂无简介' }}</p>
            <div class="r-admin-studios--detail_stats">
              <span><strong>{{ studioDetail.member_count }}</strong> 成员</span>
              <span><strong>{{ studioDetail.work_count }}</strong> 作品</span>
              <span><strong>{{ studioDetail.points || 0 }}</strong> 积分</span>
              <span>加入方式: <el-tag size="small">{{ { free: '自由', apply: '申请', invite: '邀请' }[studioDetail.join_type] }}</el-tag></span>
            </div>
            <div class="r-admin-studios--detail_meta">
              <span>创建者: {{ studioDetail.owner?.nickname || studioDetail.owner?.username }}</span>
              <span>创建时间: {{ formatDate(studioDetail.created_at) }}</span>
            </div>
          </div>
        </div>
        
        <el-tabs v-model="detailTab">
          <el-tab-pane label="成员列表" name="members">
            <el-table :data="studioMembers" size="small" max-height="300">
              <el-table-column label="成员" min-width="150">
                <template #default="{ row }">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <img :src="row.avatar || row.user?.avatar || defaultAvatar" style="width: 32px; height: 32px; border-radius: 50%;" referrerpolicy="no-referrer" />
                    <span>{{ row.nickname || row.user?.nickname || row.username || row.user?.username }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="角色" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.memberRole === 'owner' ? 'danger' : row.memberRole === 'vice_owner' ? 'success' : row.memberRole === 'admin' ? 'warning' : 'info'">
                    {{ { owner: '创建者', vice_owner: '副室长', admin: '管理员', member: '成员' }[row.memberRole] || row.memberRole }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="加入时间" width="160">
                <template #default="{ row }">{{ formatDate(row.joined_at) }}</template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          
          <el-tab-pane label="作品列表" name="works">
            <el-table :data="studioWorks" size="small" max-height="300">
              <el-table-column label="作品" min-width="200">
                <template #default="{ row }">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <img :src="row.preview || defaultWorkCover" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" referrerpolicy="no-referrer" />
                    <div>
                      <div>{{ row.name }}</div>
                      <div style="font-size: 12px; color: #999;">by {{ row.submitUser?.nickname || row.submitUser?.username }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="数据" width="120">
                <template #default="{ row }">
                  <span>❤️ {{ row.praise_times }} 👁️ {{ row.view_times }}</span>
                </template>
              </el-table-column>
              <el-table-column label="积分" width="100">
                <template #default="{ row }">
                  <el-tag size="small" type="warning">{{ row.score || 0 }}分</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="投稿时间" width="160">
                <template #default="{ row }">{{ formatDate(row.submittedAt) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" @click="showWorkScoreDialog(row)">设置积分</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          
          <el-tab-pane label="待审核申请" name="pending">
            <el-table :data="pendingMembers" size="small" max-height="300">
              <el-table-column label="用户" min-width="150">
                <template #default="{ row }">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <img :src="row.avatar || row.user?.avatar || defaultAvatar" style="width: 32px; height: 32px; border-radius: 50%;" referrerpolicy="no-referrer" />
                    <span>{{ row.nickname || row.user?.nickname || row.username || row.user?.username }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="申请时间" width="160">
                <template #default="{ row }">{{ formatDate(row.joined_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="150">
                <template #default="{ row }">
                  <el-button size="small" type="primary" @click="handleReviewMember(row.id, 'approve')">通过</el-button>
                  <el-button size="small" type="danger" @click="handleReviewMember(row.id, 'reject')">拒绝</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!pendingMembers.length" description="暂无待审核申请" />
          </el-tab-pane>
          
          <el-tab-pane label="待审核作品" name="pendingWorks">
            <el-table :data="pendingWorks" size="small" max-height="300">
              <el-table-column label="作品" min-width="200">
                <template #default="{ row }">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <img :src="row.work?.preview || defaultWorkCover" style="width: 48px; height: 36px; border-radius: 4px; object-fit: cover;" referrerpolicy="no-referrer" />
                    <div>
                      <div>{{ row.work?.name }}</div>
                      <div style="font-size: 12px; color: #999;">by {{ row.user?.nickname || row.user?.username }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="投稿时间" width="160">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="150">
                <template #default="{ row }">
                  <el-button size="small" type="primary" @click="handleReviewWork(row.id, 'approve')">通过</el-button>
                  <el-button size="small" type="danger" @click="handleReviewWork(row.id, 'reject')">拒绝</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!pendingWorks.length" description="暂无待审核作品" />
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <!-- 修复: studioDetail 在对话框关闭动画期间可能为 null,加 v-if 防止点击报错 -->
        <el-button v-if="studioDetail" type="primary" @click="showEditDialog(studioDetail)">编辑工作室</el-button>
        <el-button v-if="studioDetail" type="danger" @click="deleteStudio(studioDetail)">解散工作室</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="editDialogVisible" title="编辑工作室" width="500px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="editForm.description" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
        <el-form-item label="封面">
          <el-input v-model="editForm.cover" placeholder="封面图片URL" />
        </el-form-item>
        <el-form-item label="加入方式">
          <el-select v-model="editForm.join_type">
            <el-option label="自由加入" value="free" />
            <el-option label="申请加入" value="apply" />
            <el-option label="邀请加入" value="invite" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status">
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="banned" />
          </el-select>
        </el-form-item>
        <el-form-item label="副市长">
          <el-select v-model="editForm.vice_owner_id" clearable placeholder="选择副市长" filterable>
            <el-option v-for="m in studioMembers.filter(m => m.memberRole !== 'owner')" :key="m.id" :label="m.user?.nickname || m.user?.username" :value="m.user_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="editLoading">保存</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="workScoreDialogVisible" title="设置作品积分" width="400px">
      <el-form :model="workScoreForm" label-width="80px">
        <el-form-item label="作品">
          <span>{{ workScoreForm.workName }}</span>
        </el-form-item>
        <el-form-item label="当前积分">
          <span>{{ workScoreForm.currentScore }}分</span>
        </el-form-item>
        <el-form-item label="积分">
          <el-input-number v-model="workScoreForm.score" :min="0" :max="1000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="workScoreDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveWorkScore" :loading="workScoreLoading">保存</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="pointsDialogVisible" title="编辑工作室积分" width="400px">
      <el-form :model="pointsForm" label-width="80px">
        <el-form-item label="工作室">
          <span>{{ pointsForm.name }}</span>
        </el-form-item>
        <el-form-item label="当前等级">
          <el-tag type="warning">Lv.{{ pointsForm.level }}</el-tag>
        </el-form-item>
        <el-form-item label="当前积分">
          <span>{{ pointsForm.currentPoints }}</span>
        </el-form-item>
        <el-form-item label="积分变更">
          <el-input-number v-model="pointsForm.points" :min="-1000" :max="10000" />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-radio-group v-model="pointsForm.action">
            <el-radio label="add">增加</el-radio>
            <el-radio label="set">设置为</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pointsForm.note" type="textarea" :rows="2" placeholder="积分变更原因（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pointsDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="updatePoints" :loading="pointsLoading">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '@/api/admin'
import { studioApi } from '@/api/studio'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

const loading = ref(false)
const studios = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const searchKeyword = ref('')

const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const detailTab = ref('members')
const studioDetail = ref(null)
const studioMembers = ref([])
const studioWorks = ref([])
const pendingMembers = ref([])
const pendingWorks = ref([])

const pointsDialogVisible = ref(false)
const pointsLoading = ref(false)
const pointsForm = reactive({
  id: null,
  name: '',
  level: 1,
  currentPoints: 0,
  points: 0,
  action: 'add',
  note: ''
})

const editDialogVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive({
  id: null,
  name: '',
  description: '',
  cover: '',
  join_type: 'apply',
  status: 'active',
  vice_owner_id: null
})

const workScoreDialogVisible = ref(false)
const workScoreLoading = ref(false)
const workScoreForm = reactive({
  studioWorkId: null,
  workId: null,
  workName: '',
  currentScore: 0,
  score: 0
})

const defaultCover = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMTUwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iNzUiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPuWbvueJh+WKoOi9veWksei0pTwvdGV4dD48L3N2Zz4='
const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzk5OSIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgM3MtMS4zNCAzLTMgMy0zLTEuMzQtMy0zIDEuMzQtMyAzLTN6bTAgMTQuMmMtMi41IDAtNC43MS0xLjI4LTYtMy4yMi4wMy0xLjk5IDQtMy4wOCA2LTMuMDggMS45OSAwIDUuOTcgMS4wOSA2IDMuMDgtMS4yOSAxLjk0LTMuNSAzLjIyLTYgMy4yMnoiLz48L3N2Zz4='
const defaultWorkCover = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2NjYyIgZD0iTTE5IDNINWMtMS4xIDAtMiAuOS0yIDJ2MTRjMCAxLjEuOSAyIDIgMmgxNGMxLjEgMCAyLS45IDItMlY1YzAtMS4xLS45LTItMi0yem0wIDE2SDVWNWgxNHYxNHptLTctMmgydi00aDR2LTJoLTRWN2gtMnY0SDd2Mmg0djR6Ii8+PC9zdmc+'

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}

const fetchStudios = async () => {
  loading.value = true
  try {
    const res = await adminApi.getStudios({ page: currentPage.value, pageSize: pageSize.value, keyword: searchKeyword.value })
    if (res.code === 200) { studios.value = res.data.list; total.value = res.data.total }
  } catch (e) { ElMessage.error('获取工作室列表失败') } finally { loading.value = false }
}

const handleSearch = () => { currentPage.value = 1; fetchStudios() }

const showDetailDialog = async (studio) => {
  studioDetail.value = studio
  detailDialogVisible.value = true
  detailLoading.value = true
  detailTab.value = 'members'
  
  try {
    const [detailRes, pendingMembersRes, pendingWorksRes] = await Promise.all([
      adminApi.getStudioDetail(studio.id),
      studioApi.getPendingMembers(studio.id),
      studioApi.getPendingWorks(studio.id)
    ])
    
    if (detailRes.code === 200) {
      studioDetail.value = detailRes.data.studio
      studioMembers.value = detailRes.data.members
      studioWorks.value = detailRes.data.works
    }
    if (pendingMembersRes.code === 200) {
      pendingMembers.value = pendingMembersRes.data
    }
    if (pendingWorksRes.code === 200) {
      pendingWorks.value = pendingWorksRes.data
    }
  } catch (e) {
    ElMessage.error('获取详情失败')
  } finally {
    detailLoading.value = false
  }
}

const handleReviewMember = async (memberId, action) => {
  try {
    // 修复 M15：后台审核改用 admin 别名接口（/admin/studios/.../review，requireRole('admin')，无极验），
    // 此前调用普通 studioApi（走 /studios/.../review，受 review_member/studio_management 极验保护），
    // 但后台审核页未拉起极验弹窗，开启对应场景后审核必然失败。
    const res = await adminApi.reviewStudioMember(studioDetail.value.id, memberId, action)
    if (res.code === 200) {
      ElMessage.success(res.msg)
      showDetailDialog(studioDetail.value)
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const handleReviewWork = async (workId, action) => {
  try {
    // 修复 M15：同上，改用 admin 别名接口避免极验场景冲突
    const res = await adminApi.reviewStudioWork(studioDetail.value.id, workId, action)
    if (res.code === 200) {
      ElMessage.success(res.msg)
      showDetailDialog(studioDetail.value)
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const showPointsDialog = (studio) => {
  pointsForm.id = studio.id
  pointsForm.name = studio.name
  pointsForm.level = studio.level || 1
  pointsForm.currentPoints = studio.points || 0
  pointsForm.points = 0
  pointsForm.action = 'add'
  pointsForm.note = ''
  pointsDialogVisible.value = true
}

const updatePoints = async () => {
  pointsLoading.value = true
  try {
    const res = await adminApi.updateStudioPoints(pointsForm.id, {
      points: pointsForm.points,
      action: pointsForm.action,
      note: pointsForm.note
    })
    if (res.code === 200) {
      ElMessage.success('积分已更新')
      pointsDialogVisible.value = false
      fetchStudios()
      if (studioDetail.value?.id === pointsForm.id) {
        studioDetail.value = { ...studioDetail.value, points: res.data.points, level: res.data.level }
      }
    } else {
      ElMessage.error(res.msg || '更新失败')
    }
  } catch (e) {
    ElMessage.error('更新失败')
  } finally {
    pointsLoading.value = false
  }
}

const deleteStudio = async (studio) => {
  try {
    await ElMessageBox.confirm('确定解散该工作室？此操作不可恢复！', '警告', { type: 'warning' })
    const res = await adminApi.deleteStudio(studio.id)
    if (res.code === 200) {
      ElMessage.success('已解散')
      detailDialogVisible.value = false
      // 修复: 清理详情状态,避免残留已删除工作室的数据
      studioDetail.value = null
      studioMembers.value = []
      studioWorks.value = []
      pendingMembers.value = []
      pendingWorks.value = []
      fetchStudios()
    } else {
      // 修复: 补充失败反馈,避免用户点击无响应
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

const showEditDialog = (studio) => {
  editForm.id = studio.id
  editForm.name = studio.name
  editForm.description = studio.description || ''
  editForm.cover = studio.cover || ''
  editForm.join_type = studio.join_type || 'apply'
  editForm.status = studio.status || 'active'
  editForm.vice_owner_id = studio.vice_owner_id || null
  editDialogVisible.value = true
}

const saveEdit = async () => {
  editLoading.value = true
  try {
    const res = await adminApi.updateStudio(editForm.id, editForm)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      editDialogVisible.value = false
      fetchStudios()
      if (studioDetail.value?.id === editForm.id) {
        studioDetail.value = { ...studioDetail.value, ...editForm }
      }
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    editLoading.value = false
  }
}

const showWorkScoreDialog = (work) => {
  workScoreForm.studioWorkId = work.studioWorkId
  workScoreForm.workId = work.id
  workScoreForm.workName = work.name
  workScoreForm.currentScore = work.score || 0
  workScoreForm.score = work.score || 0
  workScoreDialogVisible.value = true
}

const saveWorkScore = async () => {
  workScoreLoading.value = true
  try {
    const res = await adminApi.setWorkScore(workScoreForm.studioWorkId, workScoreForm.score)
    if (res.code === 200) {
      ElMessage.success('积分已更新')
      workScoreDialogVisible.value = false
      if (studioDetail.value) {
        showDetailDialog(studioDetail.value)
      }
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    workScoreLoading.value = false
  }
}

onMounted(fetchStudios)
</script>

<style lang="scss" scoped>
.r-admin-studios--page { background: #fff; border-radius: 12px; padding: 24px; }
.r-admin-studios--toolbar { display: flex; gap: 12px; margin-bottom: 20px; .r-admin-studios--search { width: 300px; } }
.r-admin-studios--pagination { display: flex; justify-content: flex-end; margin-top: 20px; }

:deep(.el-table) {
  .el-button + .el-button {
    margin-left: 8px;
  }
}

.r-admin-studios--detail_header {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.r-admin-studios--detail_cover {
  width: 180px;
  height: 100px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  background-color: #f5f5f5;
  position: relative;
  flex-shrink: 0;
  
  .r-admin-studios--detail_level {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 4px 12px;
    background: linear-gradient(135deg, #FEC433, #FFD700);
    color: #333;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
  }
}

.r-admin-studios--detail_info {
  flex: 1;
  
  h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }
  
  .r-admin-studios--detail_desc {
    color: #666;
    margin: 0 0 12px;
    font-size: 14px;
  }
  
  .r-admin-studios--detail_stats {
    display: flex;
    gap: 20px;
    margin-bottom: 8px;
    
    span {
      font-size: 14px;
      color: #666;
      
      strong {
        color: #333;
        font-size: 18px;
        margin-right: 4px;
      }
    }
  }
  
  .r-admin-studios--detail_meta {
    display: flex;
    gap: 20px;
    font-size: 13px;
    color: #999;
  }
}
</style>
