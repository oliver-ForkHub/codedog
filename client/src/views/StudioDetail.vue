<template>
  <div class="r-studio-detail--page">
    <div class="r-studio-detail--container" v-loading="loading">
      <div class="r-studio-detail--header" v-if="studio">
        <!-- 修复: 默认封面用工作室名称首字艺术字,而非 emoji -->
        <div class="r-studio-detail--cover" :style="{ backgroundImage: (studio.cover || studio.cover_url) ? `url(${studio.cover || studio.cover_url})` : 'none' }">
          <div v-if="!studio.cover && !studio.cover_url" class="r-studio-detail--cover_placeholder">封面生成中</div>
        </div>
        <div class="r-studio-detail--info">
          <div class="r-studio-detail--title_row">
            <h1 class="r-studio-detail--name">{{ studio.name }}</h1>
            <span class="r-studio-detail--level">Lv.{{ studio.level || 1 }}</span>
          </div>
          <p class="r-studio-detail--desc">{{ studio.description || '暂无简介' }}</p>
          <div class="r-studio-detail--stats">
            <span><i>👥</i> {{ studio.member_count }} 成员</span>
            <span><i>📁</i> {{ studio.work_count }} 作品</span>
            <span><i>⭐</i> {{ studio.points || 0 }} 管理积分</span>
            <span><i>🏆</i> {{ studio.total_score || 0 }} 作品评分</span>
          </div>
          <div class="r-studio-detail--actions">
            <template v-if="userStore.isLoggedIn">
              <template v-if="userRole && userMemberStatus === 'active'">
                <el-dropdown trigger="click" @command="handleCommand">
                  <el-button type="primary">工作室操作 ▾</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="manage" v-if="capabilities.length">管理工作室</el-dropdown-item>
                      <el-dropdown-item command="edit" v-if="userRole === 'owner'">编辑信息</el-dropdown-item>
                      <el-dropdown-item command="submit">投稿作品</el-dropdown-item>
                      <el-dropdown-item command="im_group" divided v-if="studio.im_group_id">加入工作室群聊</el-dropdown-item>
                      <el-dropdown-item command="leave" divided v-if="userRole !== 'owner'">退出工作室</el-dropdown-item>
                      <el-dropdown-item command="dissolve" divided v-if="userRole === 'owner'">解散工作室</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
              <template v-else-if="userMemberStatus === 'pending'">
                <el-button disabled>申请审核中</el-button>
              </template>
              <template v-else>
                <el-tooltip v-if="joinBlockedReason" :content="joinBlockedReason" placement="top">
                  <span><el-button type="primary" disabled>不可加入</el-button></span>
                </el-tooltip>
                <el-button v-else type="primary" @click="handleJoin">{{ joinText }}</el-button>
              </template>
            </template>
            <template v-else>
              <el-button type="primary" @click="$router.push('/login')">登录后加入</el-button>
            </template>
          </div>
        </div>
      </div>
      
      <el-tabs v-model="activeTab" class="r-studio-detail--tabs">
        <el-tab-pane label="作品" name="works">
          <div class="r-studio-detail--works">
            <div class="r-studio-detail--work_grid" v-if="works.length > 0">
              <div v-for="studioWork in works" :key="studioWork.id" class="r-studio-detail--work_card">
                <div class="r-studio-detail--work_preview" :style="{ backgroundImage: `url(${studioWork.preview || defaultWorkCover})` }" @click="goWork(studioWork)">
                  <span class="r-studio-detail--work_ide" v-if="studioWork.ide_type">{{ getIdeTypeName(studioWork.ide_type) }}</span>
                </div>
                <div class="r-studio-detail--work_info">
                  <div class="r-studio-detail--work_title_row">
                    <h4 @click="goWork(studioWork)">{{ studioWork.name || '未知作品' }}</h4>
                    <el-dropdown v-if="canManageWork(studioWork)" trigger="click" @command="(cmd) => handleWorkAction(cmd, studioWork)">
                      <span class="r-studio-detail--work_more" @click.stop>•••</span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item :command="studioWork.status === 'down' ? 'up' : 'down'">
                            {{ studioWork.status === 'down' ? '上架' : '下架' }}
                          </el-dropdown-item>
                          <el-dropdown-item :command="studioWork.is_featured ? 'unfeature' : 'feature'">{{ studioWork.is_featured ? '取消推荐' : '设为推荐' }}</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                  <div class="r-studio-detail--work_bottom">
                    <span class="r-studio-detail--work_author" @click.stop="goUser(studioWork.submitUser)">{{ studioWork.submitUser?.nickname || studioWork.submitUser?.username || '未知' }}</span>
                    <div class="r-studio-detail--work_stats">
                      <span>❤️ {{ formatNum(studioWork.praise_times) }}</span>
                      <span>👁️ {{ formatNum(studioWork.view_times) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无作品" />
            <el-pagination
              v-if="worksTotal > worksPageSize"
              v-model:current-page="worksPage"
              :page-size="worksPageSize"
              :total="worksTotal"
              layout="prev, pager, next"
              @current-change="fetchWorks"
              style="margin-top: 20px; justify-content: center;"
            />
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="工作室论坛" name="forum">
          <div class="r-studio-detail--forum_portal"><span>论</span><div><h2>{{ studio?.name }}论坛</h2><p>这是主论坛“工作室论坛”版块的一部分，使用与主论坛完全相同的发帖、编辑和回复功能。</p></div><el-button type="primary" @click="$router.push(`/community?board=studios&studio_id=${studio.id}`)">进入论坛版块</el-button></div>
        </el-tab-pane>

        <el-tab-pane label="成员" name="members">
          <div class="r-studio-detail--members">
            <div class="r-studio-detail--member_list">
              <div
                v-for="member in members"
                :key="member.id"
                class="r-studio-detail--member_item"
                role="link"
                tabindex="0"
                @click="goUser(member.user || member)"
                @keydown.enter="goUser(member.user || member)"
              >
                <AppImage :src="member.user?.avatar || member.avatar || defaultAvatar" :fallback="defaultAvatar" class="r-studio-detail--member_avatar" />
                <div class="r-studio-detail--member_info">
                  <span class="r-studio-detail--member_name">{{ member.user?.nickname || member.user?.username || member.nickname || member.username }}</span>
                  <el-tag size="small" :type="member.memberRole === 'owner' ? 'danger' : member.memberRole === 'vice_owner' ? 'success' : member.memberRole === 'admin' ? 'warning' : 'info'">
                    {{ roleText(member.memberRole) }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane v-if="studio?.is_public || userMemberStatus === 'active'" label="公告" name="announcements">
          <div class="r-studio-detail--feed">
            <div v-for="item in announcements" :key="item.id" class="r-studio-detail--feed_item">
              <div><b>{{ item.title }}</b><el-tag v-if="item.is_pinned" size="small" type="warning">置顶</el-tag></div>
              <p>{{ item.content }}</p>
              <small>{{ item.author?.nickname || '工作室' }} · {{ formatDate(item.published_at) }}</small>
            </div>
            <el-empty v-if="!announcements.length" description="当前没有公告" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <el-dialog v-model="editDialogVisible" title="编辑工作室" width="500px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="editForm.description" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
        <el-form-item label="封面">
          <div class="r-studio-detail--cover_upload" @click="editCoverInput?.click()">
            <img v-if="editForm.cover" :src="editForm.cover" alt="工作室封面" />
            <span v-else>选择工作室封面图片</span>
            <el-button size="small" :loading="editCoverUploading">{{ editForm.cover ? '更换图片' : '上传图片' }}</el-button>
          </div>
          <input ref="editCoverInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden @change="uploadEditCover" />
        </el-form-item>
        <el-form-item label="加入方式">
          <el-radio-group v-model="editForm.join_type">
            <el-radio label="public">自由加入</el-radio>
            <el-radio label="apply">申请加入</el-radio>
            <el-radio label="invite">仅限邀请</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEdit" :loading="editLoading">保存</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="manageDialogVisible" title="工作室管理" width="800px">
      <el-tabs>
        <el-tab-pane label="成员申请">
          <el-table :data="pendingMembers" size="small">
            <el-table-column label="用户" min-width="150">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <AppImage :src="row.user?.avatar || defaultAvatar" :fallback="defaultAvatar" style="width: 32px; height: 32px; border-radius: 50%;" />
                  <span>{{ row.user?.nickname || row.user?.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="joined_at" label="申请时间" width="160">
              <template #default="{ row }">{{ formatDate(row.joined_at) }}</template>
            </el-table-column>
            <el-table-column prop="application_message" label="申请说明" min-width="180" show-overflow-tooltip />
            <el-table-column label="招募问答" min-width="240">
              <template #default="{ row }">
                <div v-for="(item, index) in (row.application_answers || [])" :key="index" class="r-studio-detail--application_answer">
                  <b>{{ item.question }}</b><span>{{ item.answer }}</span>
                </div>
                <span v-if="!row.application_answers?.length">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="300">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="handleReviewMember(row.id, 'approve')">通过</el-button>
                <el-button size="small" type="danger" @click="handleReviewMember(row.id, 'reject')">拒绝</el-button>
                <el-button size="small" type="danger" plain @click="handleReviewMember(row.id, 'reject_blacklist')">拒绝并拉黑</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!pendingMembers.length" description="暂无待审核申请" />
        </el-tab-pane>
        
        <el-tab-pane label="作品审核">
          <el-table :data="pendingWorks" size="small">
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
            <el-table-column prop="created_at" label="投稿时间" width="160">
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
        
        <el-tab-pane label="成员管理">
          <el-table :data="activeMembers" size="small">
            <el-table-column label="成员" min-width="150">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <AppImage :src="row.avatar || defaultAvatar" :fallback="defaultAvatar" style="width: 32px; height: 32px; border-radius: 50%;" />
                  <span>{{ row.nickname || row.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="memberRole" label="角色" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.memberRole === 'owner' ? 'danger' : row.memberRole === 'vice_owner' ? 'success' : row.memberRole === 'admin' ? 'warning' : 'info'">
                  {{ roleText(row.memberRole) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220">
              <template #default="{ row }">
                <template v-if="row.memberRole !== 'owner'">
                  <el-button v-if="userRole === 'owner'" size="small" :class="['r-studio-detail--role_button', `role-${row.memberRole}`]" @click="showRoleDialog(row)">角色管理</el-button>
                  <el-button size="small" type="danger" @click="handleKickMember(row.id)">移除</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="邀请管理" v-if="can('invite_manage')">
          <div class="r-studio-detail--manage_explainer"><div><h4>邀请链接</h4><p>邀请码可发给指定用户，对方使用后可直接加入工作室，无需经过成员申请审核。请只发给可信的人。</p></div><el-button type="primary" @click="inviteCreateVisible=true">＋ 创建邀请</el-button></div>
          <el-table :data="invites" size="small"><el-table-column prop="code" label="邀请码" min-width="230" /><el-table-column label="使用" width="90"><template #default="{ row }">{{ row.used_count }}/{{ row.max_uses }}</template></el-table-column><el-table-column prop="status" label="状态" width="100" /><el-table-column label="操作" width="100"><template #default="{ row }"><el-button v-if="row.status === 'active'" size="small" type="danger" plain @click="handleRevokeInvite(row)">撤销</el-button></template></el-table-column></el-table>
        </el-tab-pane>
        <el-tab-pane label="公告" v-if="can('announcement_manage')">
          <div class="r-studio-detail--manage_explainer"><div><h4>当前公告</h4><p>公告会展示给所有访问工作室的人。</p></div><el-button type="primary" @click="openAnnouncementCreate()">＋ 新增公告</el-button></div>
          <div class="r-studio-detail--feed"><div v-for="item in announcements" :key="item.id" class="r-studio-detail--feed_item"><div><b>{{ item.title }}</b><el-tag v-if="item.is_pinned" size="small" type="warning">置顶</el-tag><span class="r-studio-detail--feed_actions"><el-button size="small" text type="primary" @click="openAnnouncementEdit(item)">编辑</el-button><el-button size="small" text type="danger" @click="handleDeleteAnnouncement(item)">删除</el-button></span></div><p>{{ item.content }}</p><small>{{ item.author?.nickname || '工作室' }} · {{ formatDate(item.published_at) }}</small></div><el-empty v-if="!announcements.length" description="当前没有公告" /></div>
        </el-tab-pane>
        <el-tab-pane label="设置" v-if="can('profile_edit')">
          <el-form label-width="120px"><el-form-item label="人数上限"><el-input-number v-model="settingsForm.member_limit" :min="studio?.member_count || 1" :max="1000" /></el-form-item><el-form-item label="招募状态"><el-radio-group v-model="settingsForm.recruitment_status"><el-radio label="open">开放</el-radio><el-radio label="paused">暂停</el-radio></el-radio-group></el-form-item><el-form-item label="退出作品规则"><el-tag type="danger">成员退出或被移除时，强制清除其全部工作室作品</el-tag></el-form-item><el-form-item label="重申冷却（天）"><el-input-number v-model="settingsForm.application_cooldown_days" :min="0" :max="90" /></el-form-item><el-form-item label="招募问题"><el-input v-model="settingsForm.questions_text" type="textarea" :rows="4" placeholder="每行一个问题，最多 5 个" /></el-form-item><el-form-item v-if="can('im_bind')" label="IM 群 ID"><el-input v-model="settingsForm.im_group_id" maxlength="100" placeholder="绑定编程狗 IM 群聊 ID（纯数字）" /><div class="r-studio-detail--hint">在 IM 中创建群聊后，群号会显示在群聊搜索结果或管理后台；填写后成员可通过"工作室操作 → 加入工作室群聊"一键入群</div></el-form-item><el-form-item><el-button type="primary" @click="handleSaveSettings">保存设置</el-button></el-form-item></el-form>
        </el-tab-pane>
        <el-tab-pane label="成员黑名单" v-if="can('member_manage')">
          <div class="r-studio-detail--manage_explainer"><div><h4>成员黑名单</h4><p>黑名单用户不能申请或通过邀请加入工作室。审核申请时可直接“拒绝并拉黑”；本页用于查看、解除，也可手动添加。</p></div><el-button type="danger" @click="blacklistCreateVisible=true">＋ 手动添加</el-button></div>
          <el-table :data="blacklist" size="small">
            <el-table-column label="用户" min-width="160"><template #default="{ row }">{{ row.user?.nickname || row.user?.username || row.user_id }}</template></el-table-column>
            <el-table-column prop="reason" label="原因" min-width="220" />
            <el-table-column label="操作" width="110"><template #default="{ row }"><el-button size="small" type="danger" plain @click="handleRemoveBlacklist(row)">移出</el-button></template></el-table-column>
          </el-table>
          <el-empty v-if="!blacklist.length" description="暂无黑名单用户" />
        </el-tab-pane>
        <el-tab-pane label="日志与数据" v-if="can('log_view') || can('analytics_view')">
          <div v-if="analytics" class="r-studio-detail--analytics"><span>成员 <b>{{ analytics.members }}</b></span><span>待审成员 <b>{{ analytics.pending_members }}</b></span><span>作品 <b>{{ analytics.works }}</b></span><span>待审作品 <b>{{ analytics.pending_works }}</b></span></div>
          <el-table v-if="can('log_view')" :data="operationLogs" size="small"><el-table-column prop="created_at" label="时间" width="170" /><el-table-column prop="operator.nickname" label="操作者" width="120" /><el-table-column label="操作" min-width="180"><template #default="{ row }">{{ studioLogActionName(row.action) }}</template></el-table-column><el-table-column prop="reason" label="原因" min-width="160" /></el-table>
        </el-tab-pane>
        <el-tab-pane label="转让工作室" v-if="userRole === 'owner'">
          <el-alert title="转让后您将降为普通成员，新室长会立即获得全部权限。此操作需要再次完成安全验证。" type="warning" :closable="false" />
          <el-form label-width="100px" style="margin-top:16px"><el-form-item label="接任成员"><el-select v-model="transferForm.target_user_id" style="width:100%"><el-option v-for="m in members.filter(item => item.memberRole !== 'owner')" :key="m.id" :label="m.user?.nickname || m.user?.username" :value="m.user_id" /></el-select></el-form-item><el-form-item label="转让原因"><el-input v-model="transferForm.reason" maxlength="500" /></el-form-item><el-form-item label="输入名称确认"><el-input v-model="transferForm.confirm_name" :placeholder="studio?.name" /></el-form-item><el-form-item><el-button type="danger" @click="handleTransfer">确认转让</el-button></el-form-item></el-form>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <el-dialog v-model="permissionDialogVisible" title="角色管理" width="620px" :close-on-click-modal="false">
      <div class="r-studio-detail--role_intro"><AppImage :src="roleTarget?.avatar || defaultAvatar" :fallback="defaultAvatar" /><span><b>{{ roleTarget?.nickname || roleTarget?.username }}</b><small>在这里统一设置成员、副室长、管理员及其附加权限</small></span></div>
      <el-form label-position="top"><el-form-item label="工作室角色"><el-radio-group v-model="permissionForm.role" class="r-studio-detail--role_options"><el-radio-button label="member">成员</el-radio-button><el-radio-button label="admin">管理员</el-radio-button><el-radio-button label="vice_owner">副室长</el-radio-button></el-radio-group></el-form-item><el-form-item label="附加管理权限"><el-checkbox-group v-model="permissionForm.permissions" class="r-studio-detail--permission_grid"><el-checkbox v-for="item in permissionOptions" :key="item.value" :label="item.value">{{ item.label }}</el-checkbox></el-checkbox-group></el-form-item></el-form>
      <template #footer><el-button @click="permissionDialogVisible = false">取消</el-button><el-button type="primary" @click="handleSaveRole">保存角色</el-button></template>
    </el-dialog>

    <el-dialog v-model="inviteCreateVisible" title="创建工作室邀请" width="480px" :close-on-click-modal="false">
      <el-alert title="邀请码可让收到的人绕过申请审核直接加入，请勿公开分享。" type="warning" :closable="false" />
      <el-form label-width="110px" style="margin-top:18px"><el-form-item label="可用次数"><el-input-number v-model="inviteForm.max_uses" :min="1" :max="100" /></el-form-item><el-form-item label="有效小时"><el-input-number v-model="inviteForm.expires_in_hours" :min="1" :max="720" /></el-form-item></el-form>
      <template #footer><el-button @click="inviteCreateVisible=false">取消</el-button><el-button type="primary" @click="handleCreateInvite">创建邀请</el-button></template>
    </el-dialog>

    <el-dialog v-model="announcementCreateVisible" :title="announcementForm.id ? '编辑工作室公告' : '新增工作室公告'" width="620px" :close-on-click-modal="false">
      <el-form label-position="top"><el-form-item label="公告标题"><el-input v-model="announcementForm.title" maxlength="120" show-word-limit /></el-form-item><el-form-item label="公告内容"><el-input v-model="announcementForm.content" type="textarea" :rows="7" maxlength="10000" show-word-limit /></el-form-item><el-form-item label="置顶"><el-switch v-model="announcementForm.is_pinned" /></el-form-item></el-form>
      <template #footer><el-button @click="announcementCreateVisible=false">取消</el-button><el-button type="primary" @click="handleSaveAnnouncement">{{ announcementForm.id ? '保存修改' : '发布公告' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="blacklistCreateVisible" title="手动加入黑名单" width="520px" :close-on-click-modal="false">
      <el-alert title="加入后该用户不能申请，也不能通过邀请码加入此工作室。" type="error" :closable="false" />
      <el-form label-position="top" style="margin-top:18px"><el-form-item label="用户 ID"><el-input-number v-model="blacklistForm.user_id" :min="1" controls-position="right" style="width:100%" /></el-form-item><el-form-item label="拉黑原因"><el-input v-model="blacklistForm.reason" maxlength="500" show-word-limit /></el-form-item></el-form>
      <template #footer><el-button @click="blacklistCreateVisible=false">取消</el-button><el-button type="danger" @click="handleAddBlacklist">确认加入黑名单</el-button></template>
    </el-dialog>

    <el-dialog v-model="submitWorkDialogVisible" title="投稿作品" width="600px">
      <div class="r-studio-detail--my_works" v-loading="myWorksLoading">
        <template v-if="myWorks.length > 0">
          <div v-for="work in myWorks" :key="work.id" class="r-studio-detail--my_work_item" @click="handleSubmitWork(work.codemao_work_id)">
            <img :src="work.preview || defaultWorkCover" referrerpolicy="no-referrer" />
            <div class="r-studio-detail--my_work_name">{{ work.name }}</div>
          </div>
        </template>
        <!-- 修复: empty 状态居中显示(不被 grid 挤到左边) -->
        <div v-else class="r-studio-detail--empty_wrap">
          <el-empty description="您还没有发布作品">
            <el-button type="primary" @click="$router.push('/publish')">去发布作品</el-button>
          </el-empty>
        </div>
      </div>
    </el-dialog>
    
    <GeetestDialog ref="geetestDialog" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { studioApi } from '@/api/studio'
import { workApi } from '@/api/work'
import { imApi } from '@/api/im'
import { ElMessage, ElMessageBox } from 'element-plus'
import GeetestDialog from '@/components/GeetestDialog.vue'
import { useGeetestConfig } from '@/composables/useGeetestConfig'
import { uploadApi } from '@/api/upload'
import AppImage from '@/components/AppImage.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const loading = ref(true)
const studio = ref(null)
const members = ref([])
const works = ref([])
const announcements = ref([])
const userRole = ref(null)
const userMemberStatus = ref(null)
const joinBlockedReason = ref(null)

const activeTab = ref('works')
const worksPage = ref(1)
const worksPageSize = ref(12)
const worksTotal = ref(0)

const editDialogVisible = ref(false)
const editLoading = ref(false)
const editCoverInput = ref(null)
const editCoverUploading = ref(false)
const editForm = reactive({ name: '', description: '', cover: '', join_type: 'apply' })

const uploadEditCover = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) return ElMessage.warning('封面不能超过 5MB')
  editCoverUploading.value = true
  try {
    const res = await uploadApi.image(file)
    editForm.cover = res.data?.url || ''
    if (!editForm.cover) throw new Error('图床未返回地址')
    ElMessage.success('封面上传成功')
  } catch (e) { ElMessage.error(e.response?.data?.msg || '封面上传失败') }
  finally { editCoverUploading.value = false }
}

const manageDialogVisible = ref(false)
const inviteCreateVisible = ref(false)
const announcementCreateVisible = ref(false)
const blacklistCreateVisible = ref(false)
const pendingMembers = ref([])
const pendingWorks = ref([])
const capabilities = ref([])
const invites = ref([])
const operationLogs = ref([])
const studioLogActionNames = {
  member_permissions_updated: '更新成员权限', invite_created: '创建邀请', invite_revoked: '撤销邀请',
  announcement_created: '发布公告', task_created: '创建任务', task_status_updated: '更新任务状态',
  settings_updated: '更新工作室设置', studio_work_display_updated: '更新作品展示',
  blacklist_added: '加入黑名单', blacklist_removed: '移出黑名单', discussion_deleted: '删除讨论',
  forum_post_created: '创建论坛帖子', forum_post_state_updated: '更新帖子状态',
  forum_post_deleted: '删除论坛帖子', forum_reply_deleted: '删除论坛回复',
  studio_profile_updated: '更新工作室资料', member_application_approved: '批准成员申请',
  member_application_rejected: '拒绝成员申请', member_application_rejected_blacklisted: '拒绝并拉黑申请人',
  studio_work_approved: '批准工作室作品', studio_work_rejected: '拒绝工作室作品',
  member_role_updated: '更新成员角色', member_removed: '移除成员'
}
const studioLogActionName = action => studioLogActionNames[action] || '工作室管理操作'
const analytics = ref(null)
const blacklist = ref([])
const blacklistForm = reactive({ user_id: null, reason: '' })
const inviteForm = reactive({ max_uses: 1, expires_in_hours: 72 })
const announcementForm = reactive({ id: null, title: '', content: '', is_pinned: false })
const settingsForm = reactive({ member_limit: 100, recruitment_status: 'open', application_cooldown_days: 7, questions_text: '', im_group_id: '' })
const transferForm = reactive({ target_user_id: null, reason: '', confirm_name: '' })
const permissionDialogVisible = ref(false)
const roleTarget = ref(null)
const permissionForm = reactive({ memberId: null, role: 'member', permissions: [] })
const permissionOptions = [
  ['member_review','审核成员'],['member_manage','管理成员'],['role_manage','管理角色'],['work_review','审核作品'],['work_manage','管理作品'],['profile_edit','编辑资料'],['announcement_manage','发布公告'],['invite_manage','管理邀请'],['log_view','查看日志'],['analytics_view','查看数据'],['im_bind','绑定 IM 群']
].map(([value, label]) => ({ value, label }))
const can = permission => capabilities.value.includes(permission)

const submitWorkDialogVisible = ref(false)
const myWorks = ref([])
const myWorksLoading = ref(false)
const geetestDialog = ref(null)
const { geetestEnabled, fetchGeetestConfig } = useGeetestConfig()
const verifyScene = async (scene) => {
  if (!geetestEnabled(scene)) return {}
  return await geetestDialog.value?.show(scene)
}

// 默认封面已改为模板中动态渲染首字艺术字
const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzk5OSIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgM3MtMS4zNCAzLTMgMy0zLTEuMzQtMy0zIDEuMzQtMyAzLTN6bTAgMTQuMmMtMi41IDAtNC43MS0xLjI4LTYtMy4yMi4wMy0xLjk5IDQtMy4wOCA2LTMuMDggMS45OSAwIDUuOTcgMS4wOSA2IDMuMDgtMS4yOSAxLjk0LTMuNSAzLjIyLTYgMy4yMnoiLz48L3N2Zz4='
const defaultWorkCover = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2NjYyIgZD0iTTE5IDNINWMtMS4xIDAtMiAuOS0yIDJ2MTRjMCAxLjEuOSAyIDIgMmgxNGMxLjEgMCAyLS45IDItMlY1YzAtMS4xLS45LTItMi0yem0wIDE2SDVWNWgxNHYxNHptLTctMmgydi00aDR2LTJoLTRWN2gtMnY0SDd2Mmg0djR6Ii8+PC9zdmc+'

const joinText = computed(() => {
  if (!studio.value) return '加入'
  // 统一使用 free/apply/invite，兼容历史 public 数据
  const map = { free: '加入工作室', public: '加入工作室', apply: '申请加入', invite: '仅限邀请' }
  return map[studio.value.join_type] || '加入'
})

const activeMembers = computed(() => members.value)

const roleText = (role) => {
  const map = { owner: '创建者', vice_owner: '副室长', admin: '管理员', member: '成员' }
  return map[role] || ''
}

const formatNum = (n) => {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

const getIdeTypeName = (ideType) => {
  if (!ideType) return ''
  const type = ideType.toUpperCase()
  const ideMap = {
    'KITTEN': 'Kitten',
    'KITTEN4': 'Kitten 4',
    'KITTEN3': 'Kitten 3',
    'NEMO': 'Nemo',
    'BOX': 'Box',
    'BOX2': 'Box 2',
    'WOOD': 'Wood',
    'COCO': 'Coco',
    'NEKO': 'Neko',
    'CODE_BLOCK': '代码岛',
    'PYTHON': 'Python',
    'SCRATCH': 'Scratch'
  }
  return ideMap[type] || ideType
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}

const formatForumTime = (date) => {
  if (!date) return '-'
  const value = new Date(date)
  const diff = Date.now() - value.getTime()
  if (diff >= 0 && diff < 60000) return '刚刚'
  if (diff >= 0 && diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff >= 0 && diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return value.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const goWork = (work) => {
  if (!work) return
  if (work.codemao_work_id) {
    router.push(`/work/${work.codemao_work_id}`)
  } else {
    router.push(`/work/${work.id}`)
  }
}

const goUser = (user) => {
  if (!user) return
  if (user.codemao_user_id) {
    router.push(`/user/${user.codemao_user_id}`)
  } else if (user.id) {
    router.push(`/user/${user.id}`)
  }
}

const fetchStudio = async () => {
  loading.value = true
  try {
    const res = await studioApi.getStudio(route.params.id)
    if (res.code === 200) {
      studio.value = res.data.studio
      members.value = res.data.members
      works.value = res.data.works
      worksTotal.value = res.data.works?.length || 0
      userRole.value = res.data.userRole
      userMemberStatus.value = res.data.userMemberStatus
      joinBlockedReason.value = res.data.joinBlockedReason || null
      settingsForm.member_limit = Number(studio.value.member_limit || 100)
      settingsForm.recruitment_status = studio.value.recruitment_status || 'open'
      settingsForm.application_cooldown_days = Number(studio.value.application_cooldown_days || 0)
      settingsForm.questions_text = Array.isArray(studio.value.application_questions) ? studio.value.application_questions.join('\n') : ''
      settingsForm.im_group_id = studio.value.im_group_id || ''
      if (userMemberStatus.value === 'active') {
        studioApi.getCapabilities(route.params.id).then(result => { if (result.code === 200) capabilities.value = result.data.permissions || [] }).catch(() => {})
      } else capabilities.value = []
      // 公告仅对公开工作室访问者与活跃成员可见；接口报错时明确提示，不再静默吞错
      if (studio.value?.is_public || userMemberStatus.value === 'active') {
        studioApi.getAnnouncements(route.params.id).then(result => {
          if (result.code === 200) announcements.value = result.data || []
          else { announcements.value = []; ElMessage.error(result.msg || '加载公告失败') }
        }).catch(() => { announcements.value = []; ElMessage.error('加载公告失败，请稍后重试') })
      } else {
        announcements.value = []
      }
    } else {
      ElMessage.error(res.msg || '获取工作室失败')
    }
  } catch (e) {
    ElMessage.error('获取工作室失败')
  }
  loading.value = false
}

// 切换不同工作室时重置状态，避免上一个工作室的残留数据短暂闪现
const resetState = () => {
  studio.value = null
  members.value = []
  works.value = []
  worksTotal.value = 0
  announcements.value = [] // 公告请求是异步的，切换工作室时必须清空，防止残留上一工作室公告
  userRole.value = null
  userMemberStatus.value = null
  activeTab.value = 'works'
  worksPage.value = 1
}

// 监听路由参数变化（在不同工作室间跳转时重新加载数据）
watch(() => route.params.id, (newId) => {
  if (newId) {
    resetState()
    fetchStudio()
  }
})

const fetchWorks = async () => {
  try {
    const res = await studioApi.getStudioWorks(route.params.id, { page: worksPage.value, pageSize: worksPageSize.value })
    if (res.code === 200) {
      works.value = res.data.list
      worksTotal.value = res.data.total
    }
  } catch (e) { ElMessage.error('加载作品失败') }
}

const canManageWork = (studioWork) => {
  if (!userStore.user) return false
  return can('work_manage') || (studioWork.submitUser?.id === userStore.user.id && userRole.value === 'admin')
}


const handleWorkAction = (action, studioWork) => {
  if (action === 'up' || action === 'down') {
    toggleWorkStatus(studioWork, action)
  } else if (action === 'feature' || action === 'unfeature') {
    updateWorkDisplay(studioWork, action === 'feature')
  }
}

const updateWorkDisplay = async (studioWork, featured) => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try { const res = await studioApi.updateWorkDisplay(route.params.id, studioWork.studioWorkId || studioWork.id, { is_featured: featured, ...geetestData }); if (res.code === 200) { studioWork.is_featured = featured; ElMessage.success(featured ? '已设为推荐' : '已取消推荐') } } catch (e) { ElMessage.error(e.response?.data?.msg || '更新展示设置失败') }
}

const toggleWorkStatus = async (studioWork, action) => {
  const geetestData = await verifyScene('studio_management')
  if (!geetestData) return
  try {
    const res = await studioApi.toggleWorkStatus(route.params.id, studioWork.id, action, geetestData)
    if (res.code === 200) {
      studioWork.status = action === 'up' ? 'approved' : 'down'
      ElMessage.success(res.msg)
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const handleJoin = async () => {
  if (studio.value.join_type === 'invite') {
    let code = ''
    try { code = (await ElMessageBox.prompt('请输入室长发给您的邀请码', '邀请加入工作室', { inputValidator: value => String(value || '').trim().length >= 10 || '邀请码格式不正确' })).value.trim() } catch { return }
    const inviteGeetest = await verifyScene('studio_management'); if (!inviteGeetest) return
    try { const res = await studioApi.acceptInvite(code, inviteGeetest); if (res.code === 200) { ElMessage.success('已加入工作室'); await fetchStudio() } } catch (e) { ElMessage.error(e.response?.data?.msg || '邀请码无效') }
    return
  }
  let applicationMessage = ''
  const applicationAnswers = []
  if (studio.value.join_type === 'apply') {
    try { applicationMessage = (await ElMessageBox.prompt('简单介绍一下自己和想加入的原因', '申请加入工作室', { inputPlaceholder: '最多 500 字', inputValidator: value => String(value || '').trim().length >= 2 || '至少填写 2 个字' })).value.trim() } catch { return }
    for (const question of (studio.value.application_questions || [])) {
      try {
        const answer = (await ElMessageBox.prompt(question, '工作室招募问题', { inputPlaceholder: '请认真填写回答', inputValidator: value => String(value || '').trim().length >= 1 || '请填写回答' })).value.trim()
        applicationAnswers.push({ question, answer })
      } catch { return }
    }
  }
  const geetestData = await geetestDialog.value?.show('join_studio')
  if (!geetestData) return
  try {
    const res = await studioApi.joinStudio(route.params.id, { application_message: applicationMessage, application_answers: applicationAnswers, ...geetestData })
    if (res.code === 200) {
      ElMessage.success(res.msg)
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const handleLeave = async () => {
  try {
    await ElMessageBox.confirm('确定退出该工作室吗？', '提示', { type: 'warning' })
    const geetestData = await verifyScene('studio_management')
    if (!geetestData) return
    const res = await studioApi.leaveStudio(route.params.id, geetestData)
    if (res.code === 200) {
      ElMessage.success('已退出工作室')
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const showEditDialog = () => {
  editForm.name = studio.value.name
  editForm.description = studio.value.description || ''
  editForm.cover = studio.value.cover || ''
  editForm.join_type = studio.value.join_type
  editDialogVisible.value = true
}

const handleEdit = async () => {
  editLoading.value = true
  try {
    const geetestData = await verifyScene('studio_management')
    if (!geetestData) return
    const res = await studioApi.updateStudio(route.params.id, { ...editForm, ...geetestData })
    if (res.code === 200) {
      ElMessage.success('保存成功')
      editDialogVisible.value = false
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
  editLoading.value = false
}

const showManageDialog = async () => {
  manageDialogVisible.value = true
  try {
    const jobs = []
    if (can('member_review')) jobs.push(studioApi.getPendingMembers(route.params.id).then(r => { if (r.code === 200) pendingMembers.value = r.data }))
    if (can('work_review')) jobs.push(studioApi.getPendingWorks(route.params.id).then(r => { if (r.code === 200) pendingWorks.value = r.data }))
    if (can('invite_manage')) jobs.push(studioApi.getInvites(route.params.id).then(r => { if (r.code === 200) invites.value = r.data }))
    if (can('log_view')) jobs.push(studioApi.getLogs(route.params.id).then(r => { if (r.code === 200) operationLogs.value = r.data }))
    if (can('analytics_view')) jobs.push(studioApi.getAnalytics(route.params.id).then(r => { if (r.code === 200) analytics.value = r.data }))
    if (can('member_manage')) jobs.push(studioApi.getBlacklist(route.params.id).then(r => { if (r.code === 200) blacklist.value = r.data || [] }))
    await Promise.all(jobs)
  } catch (e) { ElMessage.error('加载管理数据失败') }
}

const handleCreateInvite = async () => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try { const res = await studioApi.createInvite(route.params.id, { ...inviteForm, ...geetestData }); if (res.code === 200) { ElMessage.success('邀请已创建'); inviteCreateVisible.value = false; await showManageDialog() } } catch (e) { ElMessage.error(e.response?.data?.msg || '创建邀请失败') }
}
const showRoleDialog = row => { roleTarget.value = row; permissionForm.memberId = row.id; permissionForm.role = row.memberRole || 'member'; permissionForm.permissions = Array.isArray(row.permissions) ? [...row.permissions] : []; permissionDialogVisible.value = true }
const handleSaveRole = async () => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try {
    const roleRes = await studioApi.setMemberRole(route.params.id, permissionForm.memberId, permissionForm.role, geetestData)
    if (roleRes.code !== 200) return ElMessage.error(roleRes.msg || '保存角色失败')
    const permissionVerify = await verifyScene('studio_management'); if (!permissionVerify) return
    const permissionRes = await studioApi.setMemberPermissions(route.params.id, permissionForm.memberId, permissionForm.permissions, permissionVerify)
    if (permissionRes.code === 200) { ElMessage.success('角色与权限已保存'); permissionDialogVisible.value = false; await fetchStudio() }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '保存角色失败') }
}
const handleRevokeInvite = async row => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try { const res = await studioApi.revokeInvite(route.params.id, row.id, geetestData); if (res.code === 200) { ElMessage.success('邀请已撤销'); await showManageDialog() } } catch (e) { ElMessage.error(e.response?.data?.msg || '撤销失败') }
}
// 打开新增公告对话框（清空表单）
const openAnnouncementCreate = () => {
  Object.assign(announcementForm, { id: null, title: '', content: '', is_pinned: false })
  announcementCreateVisible.value = true
}
// 打开编辑公告对话框（填充表单）
const openAnnouncementEdit = (item) => {
  Object.assign(announcementForm, { id: item.id, title: item.title, content: item.content, is_pinned: !!item.is_pinned })
  announcementCreateVisible.value = true
}
// 新增或更新公告
const handleSaveAnnouncement = async () => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try {
    const payload = { ...announcementForm, ...geetestData }
    let res
    if (announcementForm.id) res = await studioApi.updateAnnouncement(route.params.id, announcementForm.id, payload)
    else res = await studioApi.createAnnouncement(route.params.id, payload)
    if (res.code === 200) {
      ElMessage.success(announcementForm.id ? '公告已更新' : '公告已发布')
      announcementCreateVisible.value = false
      const refreshed = await studioApi.getAnnouncements(route.params.id)
      if (refreshed.code === 200) announcements.value = refreshed.data || []
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || (announcementForm.id ? '更新失败' : '发布失败')) }
}
// 删除公告
const handleDeleteAnnouncement = async (item) => {
  try {
    await ElMessageBox.confirm(`确定删除公告「${item.title}」吗？此操作不可恢复。`, '删除公告', { type: 'warning', confirmButtonText: '确认删除' })
  } catch { return }
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try {
    const res = await studioApi.deleteAnnouncement(route.params.id, item.id, geetestData)
    if (res.code === 200) {
      ElMessage.success('公告已删除')
      const refreshed = await studioApi.getAnnouncements(route.params.id)
      if (refreshed.code === 200) announcements.value = refreshed.data || []
    }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '删除失败') }
}
const handleSaveSettings = async () => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  const applicationQuestions = settingsForm.questions_text.split('\n').map(item => item.trim()).filter(Boolean)
  if (applicationQuestions.length > 5) return ElMessage.warning('招募问题最多 5 个')
  try { const res = await studioApi.updateSettings(route.params.id, { ...settingsForm, application_questions: applicationQuestions, ...geetestData }); if (res.code === 200) { ElMessage.success('设置已保存'); await fetchStudio() } } catch (e) { ElMessage.error(e.response?.data?.msg || '保存设置失败') }
}
const handleAddBlacklist = async () => {
  if (!blacklistForm.user_id || blacklistForm.reason.trim().length < 2) return ElMessage.warning('请填写用户 ID 和至少 2 个字的原因')
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try { const res = await studioApi.addBlacklist(route.params.id, { ...blacklistForm, ...geetestData }); if (res.code === 200) { ElMessage.success(res.msg); blacklistForm.user_id = null; blacklistForm.reason = ''; blacklistCreateVisible.value = false; await showManageDialog() } } catch (e) { ElMessage.error(e.response?.data?.msg || '加入黑名单失败') }
}
const handleRemoveBlacklist = async row => {
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try { const res = await studioApi.removeBlacklist(route.params.id, row.id, geetestData); if (res.code === 200) { ElMessage.success(res.msg); await showManageDialog() } } catch (e) { ElMessage.error(e.response?.data?.msg || '移出黑名单失败') }
}
const handleTransfer = async () => {
  if (!transferForm.target_user_id || transferForm.reason.trim().length < 2 || transferForm.confirm_name !== studio.value?.name) return ElMessage.warning('请完整填写接任成员、原因，并准确输入工作室名称')
  try { await ElMessageBox.confirm('确认将工作室永久转让给该成员吗？', '高风险操作', { type: 'warning' }) } catch { return }
  const geetestData = await verifyScene('studio_management'); if (!geetestData) return
  try { const res = await studioApi.transferOwnership(route.params.id, { ...transferForm, ...geetestData }); if (res.code === 200) { ElMessage.success('工作室已转让'); manageDialogVisible.value = false; await fetchStudio() } } catch (e) { ElMessage.error(e.response?.data?.msg || '转让失败') }
}

const handleDissolve = async () => {
  try {
    await ElMessageBox.confirm('确定解散该工作室吗？此操作不可恢复！', '警告', { type: 'warning', confirmButtonText: '确定解散', cancelButtonText: '取消' })
    const geetestData = await verifyScene('studio_management')
    if (!geetestData) return
    const res = await studioApi.dissolveStudio(route.params.id, geetestData)
    if (res.code === 200) {
      ElMessage.success('工作室已解散')
      // 修复：工作室列表路由为 /work_shop，原 /studios 路由不存在会触发 NotFound 重定向
      router.push('/work_shop')
    } else {
      ElMessage.error(res.msg || '解散失败')
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const handleCommand = (command) => {
  switch (command) {
    case 'manage': showManageDialog(); break
    case 'edit': showEditDialog(); break
    case 'submit': showSubmitWorkDialog(); break
    case 'im_group': handleEnterImGroup(); break
    case 'leave': handleLeave(); break
    case 'dissolve': handleDissolve(); break
  }
}

// 校验外部链接：仅允许 http/https，且若后端返回 IM origin 则严格限制到该域名，防 open redirect / 钓鱼跳转
const getSafeExternalUrl = (value, expectedOrigin = '') => {
  if (!value) return ''
  try {
    const url = new URL(String(value))
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    if (expectedOrigin && url.origin !== String(expectedOrigin)) return ''
    return url.href
  } catch { return '' }
}

// 跳转到 IM 并自动加入工作室绑定的群聊
// 后端 createImSsoTicket 已支持 action=group + group_id,
// IM web 端 load() 收到 intent.action==='group' 会自动 POST /groups/:id/join
// 先 window.open('about:blank') 保留用户点击产生的 popup 手势，避免 Safari/严格弹窗设置拦截
const handleEnterImGroup = async () => {
  const groupId = Number(studio.value?.im_group_id)
  if (!Number.isInteger(groupId) || groupId <= 0) {
    ElMessage.warning('该工作室尚未绑定 IM 群聊，请联系室长在设置中填写群聊 ID')
    return
  }
  const popup = window.open('about:blank', '_blank')
  try {
    const res = await imApi.createSsoTicket({ action: 'group', group_id: groupId })
    // 白名单：只允许跳转到后端返回的 IM 自身域名
    const safeUrl = getSafeExternalUrl(res.data?.url, res.data?.origin)
    if (res.code !== 200 || !safeUrl) throw new Error(res.msg || '无法进入即时通讯，请确认 IM 系统已启用')
    if (popup) {
      popup.opener = null // 防 tabnabbing：新窗口禁止通过 window.opener 访问本页面
      popup.location.href = safeUrl
    } else window.open(safeUrl, '_blank', 'noopener,noreferrer')
  } catch (e) {
    popup?.close()
    ElMessage.error(e.response?.data?.msg || e.message || '进入即时通讯失败')
  }
}

const handleReviewMember = async (memberId, action) => {
  let reason = ''
  if (action === 'reject' || action === 'reject_blacklist') {
    try {
      reason = (await ElMessageBox.prompt(action === 'reject_blacklist' ? '请填写拒绝并拉黑原因。加入黑名单后，该用户不能再次申请或使用邀请码加入。' : '请填写拒绝原因，申请人会收到通知', action === 'reject_blacklist' ? '拒绝并加入黑名单' : '拒绝成员申请', { inputValidator: value => String(value || '').trim().length >= 2 || '至少填写 2 个字' })).value.trim()
    } catch { return }
  }
  let geetestData = {}
  if (geetestEnabled('review_member')) {
    geetestData = await geetestDialog.value?.show('review_member')
    if (!geetestData) return
  }
  try {
    const res = await studioApi.reviewMember(route.params.id, memberId, action, reason, geetestData)
    if (res.code === 200) {
      ElMessage.success(res.msg)
      showManageDialog()
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const handleReviewWork = async (workId, action) => {
  let reason = ''
  if (action === 'reject') {
    try {
      reason = (await ElMessageBox.prompt('请填写拒绝原因，投稿人会收到通知', '拒绝作品投稿', { inputValidator: value => String(value || '').trim().length >= 2 || '至少填写 2 个字' })).value.trim()
    } catch { return }
  }
  const geetestData = await verifyScene('studio_management')
  if (!geetestData) return
  try {
    const res = await studioApi.reviewWork(route.params.id, workId, action, reason, geetestData)
    if (res.code === 200) {
      ElMessage.success(res.msg)
      showManageDialog()
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const handleSetRole = async (memberId, role) => {
  const geetestData = await verifyScene('studio_management')
  if (!geetestData) return
  try {
    const res = await studioApi.setMemberRole(route.params.id, memberId, role, geetestData)
    if (res.code === 200) {
      ElMessage.success('角色已更新')
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const handleKickMember = async (memberId) => {
  try {
    await ElMessageBox.confirm('确定移除该成员吗？', '提示', { type: 'warning' })
    const geetestData = await verifyScene('studio_management')
    if (!geetestData) return
    const res = await studioApi.kickMember(route.params.id, memberId, geetestData)
    if (res.code === 200) {
      ElMessage.success('成员已移除')
      fetchStudio()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const showSubmitWorkDialog = async () => {
  submitWorkDialogVisible.value = true
  myWorksLoading.value = true
  try {
    const res = await workApi.getMyWorks()
    if (res.code === 200) {
      myWorks.value = res.data.list || res.data || []
    }
  } catch (e) { ElMessage.error('加载作品列表失败') }
  myWorksLoading.value = false
}

const handleSubmitWork = async (workId) => {
  const geetestData = await geetestDialog.value?.show('submit_work')
  if (!geetestData) return
  try {
    const res = await studioApi.submitWork(route.params.id, workId, geetestData)
    if (res.code === 200) {
      ElMessage.success(res.msg)
      submitWorkDialogVisible.value = false
    } else {
      ElMessage.error(res.msg || '投稿失败')
    }
  } catch (e) {
    ElMessage.error('投稿失败')
  }
}

onMounted(() => {
  fetchGeetestConfig()
  fetchStudio()
})
</script>

<style lang="scss" scoped>
$primary-color: #FEC433;
$primary-hover: #FFD700;
$text-color: #333;
$text-secondary: #666;
$text-muted: #999;
$white: #fff;
$border-color: #eee;

.r-studio-detail--manage_toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.r-studio-detail--manage_section { display: grid; gap: 10px; padding: 14px; margin-bottom: 14px; border: 1px solid #f0e5c7; border-radius: 12px; background: #fffaf0; }
.r-studio-detail--manage_section h4 { margin: 0; color: #182033; }
.r-studio-detail--analytics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
.r-studio-detail--analytics span { padding: 12px; border: 1px solid #eee3c8; border-radius: 10px; background: #fffaf0; }
.r-studio-detail--feed { display: grid; gap: 12px; }
.r-studio-detail--feed_item { padding: 16px; border: 1px solid rgba(254,196,51,.32); border-radius: 14px; background: rgba(255,255,255,.86); }
.r-studio-detail--feed_item > div { display: flex; align-items: center; gap: 8px; }
.r-studio-detail--feed_actions { margin-left: auto; display: inline-flex; gap: 2px; }
.r-studio-detail--feed_item p { white-space: pre-wrap; color: #505a6b; }
.r-studio-detail--feed_item small { color: #8b95a7; }
.r-studio-detail--permission_grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.r-studio-detail--manage_explainer { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:16px; margin-bottom:14px; border:1px solid #f0dfb4; border-radius:14px; background:linear-gradient(135deg,#fffaf0,#fff); }
.r-studio-detail--manage_explainer h4,.r-studio-detail--manage_explainer p { margin:0; }
.r-studio-detail--manage_explainer p { margin-top:5px; color:#7d8797; line-height:1.6; }
.r-studio-detail--hint { margin-top:6px; color:#98a2b3; font-size:12px; line-height:1.6; }
.r-studio-detail--role_button { border:0; font-weight:700; }
.r-studio-detail--role_button.role-member { background:#eef2f6; color:#475467; }
.r-studio-detail--role_button.role-admin { background:#fff0c2; color:#a15c00; }
.r-studio-detail--role_button.role-vice_owner { background:#dcf7e8; color:#087443; }
.r-studio-detail--role_intro { display:flex; align-items:center; gap:12px; padding:14px; margin-bottom:18px; border-radius:14px; background:#fff8e8; }
.r-studio-detail--role_intro img { width:46px; height:46px; border-radius:50%; }
.r-studio-detail--role_intro span { display:grid; gap:4px; }
.r-studio-detail--role_intro small { color:#7d8797; }
.r-studio-detail--role_options { display:flex; width:100%; }
.r-studio-detail--role_options :deep(.el-radio-button) { flex:1; }
.r-studio-detail--role_options :deep(.el-radio-button__inner) { width:100%; font-weight:700; }
.r-studio-detail--forum_portal { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:18px; padding:24px; border:1px solid rgba(254,196,51,.42); border-radius:18px; background:linear-gradient(135deg,rgba(255,248,226,.95),rgba(241,247,255,.9)); }
.r-studio-detail--forum_portal>span { display:grid; width:58px; height:58px; place-items:center; border-radius:17px; background:#172033; color:#fec433; font-size:25px; font-weight:900; box-shadow:0 12px 26px rgba(23,32,51,.16); }
.r-studio-detail--forum_portal h2,.r-studio-detail--forum_portal p { margin:0; }
.r-studio-detail--forum_portal p { margin-top:6px; color:#6f7a8c; }

.r-studio-detail--page {
  padding: 24px;
  min-height: calc(100vh - 60px);
  background: #f5f5f5;
}

.r-studio-detail--container {
  max-width: 1200px;
  margin: 0 auto;
}

.r-studio-detail--header {
  display: flex;
  gap: 20px;
  background: $white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  
  .r-studio-detail--cover {
    width: 160px;
    height: 100px;
    border-radius: 6px;
    background-size: cover;
    background-position: center;
    background-color: #6978dc;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;

    .r-studio-detail--cover_placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;

      .r-studio-detail--cover_initial {
        font-size: 42px;
        font-weight: 700;
        color: rgba(255,255,255,0.9);
        text-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-family: 'Georgia', 'Times New Roman', serif;
        user-select: none;
      }
    }
  }
  
  .r-studio-detail--info {
    flex: 1;
    min-width: 0;
    
    .r-studio-detail--title_row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    
    .r-studio-detail--name {
      font-size: 20px;
      font-weight: 600;
      color: $text-color;
      margin: 0;
    }
    
    .r-studio-detail--level {
      padding: 2px 10px;
      background: linear-gradient(135deg, $primary-color, $primary-hover);
      color: $text-color;
      font-size: 12px;
      font-weight: 600;
      border-radius: 10px;
    }
    
    .r-studio-detail--desc {
      font-size: 13px;
      color: $text-secondary;
      margin: 0 0 10px;
      line-height: 1.5;
    }
    
    .r-studio-detail--stats {
      display: flex;
      gap: 20px;
      margin-bottom: 12px;
      
      span {
        font-size: 13px;
        color: $text-muted;
        
        i {
          font-style: normal;
          margin-right: 4px;
        }
      }
    }
    
    .r-studio-detail--actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      
      .el-button {
        border-radius: 6px;
        margin: 0;
      }
    }
  }
}

.r-studio-detail--tabs {
  background: $white;
  border-radius: 12px;
  padding: 24px;
}

.r-studio-detail--works {
  min-height: 200px;
}

.r-studio-detail--work_grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  
  @media (max-width: 1200px) { grid-template-columns: repeat(4, 1fr); }
  @media (max-width: 992px) { grid-template-columns: repeat(3, 1fr); }
  @media (max-width: 768px) { grid-template-columns: repeat(2, 1fr); }
}

.r-studio-detail--work_card {
  background: $white;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid #eee;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    border-color: $primary-color;
  }
  
  .r-studio-detail--work_preview {
    width: 100%;
    padding-top: 100%;
    background-size: cover;
    background-position: center;
    position: relative;
    
    .r-studio-detail--work_ide {
      position: absolute;
      top: 6px;
      right: 6px;
      padding: 1px 6px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 10px;
      border-radius: 3px;
    }
  }
  
  .r-studio-detail--work_info {
    padding: 8px;
    
    .r-studio-detail--work_title_row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
      
      h4 {
        flex: 1;
        font-size: 12px;
        font-weight: 500;
        color: $text-color;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.2;
        
        &:hover {
          color: $primary-color;
        }
      }
      
      .r-studio-detail--work_more {
        padding: 0 4px;
        color: $text-muted;
        cursor: pointer;
        font-size: 10px;
        letter-spacing: 1px;
        flex-shrink: 0;
        
        &:hover {
          color: $primary-color;
        }
      }
    }
    
    .r-studio-detail--work_bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      
      .r-studio-detail--work_author {
        font-size: 10px;
        color: $text-muted;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 60%;
        cursor: pointer;
        
        &:hover {
          color: $primary-color;
          text-decoration: underline;
        }
      }
      
      .r-studio-detail--work_stats {
        display: flex;
        gap: 6px;
        font-size: 10px;
        color: $text-muted;
        flex-shrink: 0;
      }
    }
  }
}

.r-studio-detail--members {
  min-height: 200px;
}

.r-studio-detail--member_list {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.r-studio-detail--member_item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f9f9f9;
  border-radius: 8px;
  min-width: 180px;
  
  .r-studio-detail--member_avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }
  
  .r-studio-detail--member_info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    .r-studio-detail--member_name {
      font-size: 14px;
      color: $text-color;
    }
  }
}

.r-studio-detail--my_works {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  min-height: 200px;
}

// 投稿作品弹窗:empty 状态居中
.r-studio-detail--empty_wrap {
  grid-column: 1 / -1;  // 占满所有列
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.r-studio-detail--my_work_item {
  display: flex;
  flex-direction: column;
  border: 1px solid $border-color;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    border-color: $primary-color;
  }
  
  img {
    width: 100%;
    height: 80px;
    object-fit: cover;
  }
  
  .r-studio-detail--my_work_name {
    padding: 8px;
    font-size: 13px;
    color: $text-color;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

:deep(.el-table) {
  .el-button + .el-button {
    margin-left: 8px;
  }
}

/* 工作室详情：开放式资料头 + 单一内容工作区 */
.r-studio-detail--page { position:relative; overflow:hidden; padding:34px 24px 80px; background:radial-gradient(circle at 8% 6%,rgba(255,205,92,.31),transparent 28rem),radial-gradient(circle at 92% 13%,rgba(108,190,255,.25),transparent 32rem),linear-gradient(145deg,#f5f8ff 0%,#fafbff 50%,#fff8eb 100%); }
.r-studio-detail--page::before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.5; background-image:linear-gradient(rgba(95,125,170,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(95,125,170,.055) 1px,transparent 1px); background-size:44px 44px; mask-image:linear-gradient(to bottom,#000,transparent 82%); }
.r-studio-detail--container { position:relative; z-index:1; max-width:1220px; }
.r-studio-detail--header { position:relative; gap:28px; align-items:center; margin-bottom:20px; padding:28px; border:1px solid rgba(255,255,255,.94); border-radius:22px; background:linear-gradient(135deg,rgba(255,250,235,.9),rgba(255,255,255,.78) 48%,rgba(239,248,255,.88)); backdrop-filter:blur(18px); box-shadow:0 20px 55px rgba(39,55,82,.09); }
.r-studio-detail--header .r-studio-detail--cover { width:230px; height:142px; border-radius:16px; box-shadow:0 14px 32px rgba(35,48,70,.16); }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--title_row { margin-bottom:10px; }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--name { color:#172033; font-size:clamp(28px,3vw,38px); line-height:1.12; letter-spacing:-.04em; font-weight:800; }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--level { padding:4px 9px; border-radius:7px; }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--desc { max-width:680px; margin-bottom:15px; color:#667085; font-size:14px; }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--stats { gap:10px; flex-wrap:wrap; margin-bottom:18px; }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--stats span { padding:7px 10px; border:1px solid rgba(222,227,235,.78); border-radius:9px; background:rgba(255,255,255,.62); color:#5f6b7d; font-weight:600; }
.r-studio-detail--header .r-studio-detail--info .r-studio-detail--actions .el-button { height:40px; padding:0 17px; border-radius:11px!important; font-weight:700; }
.r-studio-detail--tabs { padding:0 24px 28px; border:1px solid rgba(255,255,255,.94); border-radius:20px; background:rgba(255,255,255,.8); backdrop-filter:blur(18px); box-shadow:0 20px 55px rgba(39,55,82,.08); }
.r-studio-detail--tabs :deep(.el-tabs__header) { margin:0 0 24px; }
.r-studio-detail--tabs :deep(.el-tabs__nav-wrap::after) { height:1px; background:#edf0f5; }
.r-studio-detail--tabs :deep(.el-tabs__item) { height:62px; padding:0 22px; color:#667085; font-size:15px; font-weight:700; }
.r-studio-detail--tabs :deep(.el-tabs__item.is-active) { color:#172033; }
.r-studio-detail--tabs :deep(.el-tabs__active-bar) { height:3px; border-radius:3px; background:#fec433; }
.r-studio-detail--work_grid { grid-template-columns:repeat(5,1fr); gap:18px; }
.r-studio-detail--work_card { border:1px solid #e8ecf2; border-radius:15px; box-shadow:0 7px 22px rgba(39,55,82,.055); }
.r-studio-detail--work_card:hover { transform:translateY(-5px); border-color:transparent; box-shadow:0 17px 36px rgba(39,55,82,.13); }
.r-studio-detail--work_card .r-studio-detail--work_preview .r-studio-detail--work_ide { top:8px; right:8px; padding:3px 7px; border-radius:6px; backdrop-filter:blur(8px); }
.r-studio-detail--work_card .r-studio-detail--work_info { padding:12px; }
.r-studio-detail--work_card .r-studio-detail--work_info .r-studio-detail--work_title_row h4 { color:#1b2436; font-size:13px; font-weight:700; }
.r-studio-detail--member_list { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
.r-studio-detail--member_item { min-width:0; padding:14px; border:1px solid #e8ecf2; border-radius:14px; background:linear-gradient(145deg,#fff,#f8faff); box-shadow:0 6px 20px rgba(39,55,82,.045); }
.r-studio-detail--member_item { cursor:pointer; transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease; }
.r-studio-detail--member_item:hover,.r-studio-detail--member_item:focus-visible { transform:translateY(-3px); border-color:#f2c54a; box-shadow:0 12px 28px rgba(39,55,82,.1); outline:none; }
.r-studio-detail--member_item .r-studio-detail--member_avatar { box-shadow:0 0 0 3px #fff,0 5px 13px rgba(35,48,70,.12); }
.r-studio-detail--forum { max-width:1040px; margin:0 auto; }
.r-studio-detail--forum_hero { display:flex; align-items:center; justify-content:space-between; gap:24px; margin:4px 0 20px; padding:22px 24px; overflow:hidden; border:1px solid #f0e5c7; border-radius:18px; background:radial-gradient(circle at 92% 12%,rgba(255,210,91,.34),transparent 15rem),linear-gradient(125deg,#fffdf7,#f7faff); }
.r-studio-detail--forum_hero_copy { display:flex; align-items:center; gap:15px; min-width:0; }
.r-studio-detail--forum_mark { display:grid; width:48px; height:48px; flex:none; place-items:center; border-radius:14px; background:#172033; color:#fec433; font-size:22px; font-weight:900; box-shadow:0 9px 20px rgba(23,32,51,.17); }
.r-studio-detail--forum_hero h2 { margin:0 0 5px; color:#172033; font-size:22px; font-weight:850; letter-spacing:-.02em; }
.r-studio-detail--forum_hero p { margin:0; color:#7a8598; font-size:13px; }
.r-studio-detail--forum_summary { display:flex; align-items:center; gap:17px; flex:none; }
.r-studio-detail--forum_summary span { display:flex; flex-direction:column; color:#98a2b3; font-size:11px; }
.r-studio-detail--forum_summary b { color:#172033; font-size:20px; line-height:1.2; }
.r-studio-detail--forum_summary i { width:1px; height:30px; background:#dfe4ec; }
.r-studio-detail--forum_toolbar { display:flex; align-items:center; gap:14px; margin-bottom:12px; }
.r-studio-detail--forum_search { width:280px; }
.r-studio-detail--forum_toolbar_spacer { flex:1; }
.r-studio-detail--forum_search :deep(.el-input__wrapper) { height:40px; border-radius:11px; box-shadow:0 0 0 1px #e4e8ef inset; }
.r-studio-detail--forum_rule { flex:1; color:#98a2b3; font-size:12px; text-align:right; }
.r-studio-detail--forum_toolbar .el-button { height:40px; border-radius:11px; font-weight:750; }
.r-studio-detail--forum_list { min-height:220px; overflow:hidden; border:1px solid #e8ecf2; border-radius:17px; background:rgba(255,255,255,.84); box-shadow:0 12px 34px rgba(39,55,82,.055); }
.r-studio-detail--forum_item { display:flex; width:100%; align-items:center; gap:15px; padding:20px 21px; border:0; border-bottom:1px solid #edf0f5; background:transparent; color:inherit; text-align:left; cursor:pointer; transition:background .2s,transform .2s; }
.r-studio-detail--forum_item:last-child { border-bottom:0; }
.r-studio-detail--forum_item:hover { background:linear-gradient(90deg,rgba(255,248,228,.75),rgba(247,250,255,.92)); transform:translateX(3px); }
.r-studio-detail--forum_item_avatar { width:43px; height:43px; flex:none; border-radius:50%; object-fit:cover; box-shadow:0 0 0 3px #fff,0 5px 14px rgba(35,48,70,.12); }
.r-studio-detail--forum_item_main { display:flex; min-width:0; flex:1; flex-direction:column; gap:7px; }
.r-studio-detail--forum_item_title { display:flex; align-items:center; min-width:0; gap:7px; }
.r-studio-detail--forum_item_title b { overflow:hidden; color:#1b2436; font-size:16px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.r-studio-detail--forum_item_title em,.r-studio-detail--forum_post_badges span { padding:2px 7px; flex:none; border:1px solid #ffd168; border-radius:6px; background:#fff7dc; color:#c17700; font-size:10px; font-style:normal; font-weight:750; }
.r-studio-detail--forum_item_title em.locked,.r-studio-detail--forum_post_badges span.locked { border-color:#dce2ea; background:#f2f4f7; color:#667085; }
.r-studio-detail--forum_excerpt { overflow:hidden; color:#7d8899; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.r-studio-detail--forum_item_main small { display:flex; align-items:center; gap:12px; color:#98a2b3; }
.r-studio-detail--forum_item_main small strong { color:#e59a00; font-weight:650; }
.r-studio-detail--forum_item_main small i { font-style:normal; }
.r-studio-detail--forum_counts { display:grid; grid-template-columns:repeat(2,52px) 14px; align-items:center; gap:7px; flex:none; color:#98a2b3; font-size:10px; text-align:center; }
.r-studio-detail--forum_counts span { display:flex; flex-direction:column; }
.r-studio-detail--forum_counts b { color:#344054; font-size:14px; }
.r-studio-detail--forum_counts > i { color:#c1c7d0; font-size:23px; font-style:normal; }
.r-studio-detail--forum_detail_head { display:flex; align-items:center; justify-content:space-between; gap:20px; margin:0 0 14px; }
.r-studio-detail--forum_back { border-color:#e3e7ed; border-radius:10px; color:#475467; font-weight:650; }
.r-studio-detail--forum_manage { display:flex; gap:8px; }
.r-studio-detail--forum_post { padding:30px 32px 22px; border:1px solid #e8ecf2; border-radius:18px; background:rgba(255,255,255,.93); box-shadow:0 14px 40px rgba(39,55,82,.065); }
.r-studio-detail--forum_post_badges { display:flex; gap:7px; min-height:4px; margin-bottom:10px; }
.r-studio-detail--forum_post h1 { margin:0 0 17px; color:#172033; font-size:28px; line-height:1.28; letter-spacing:-.025em; }
.r-studio-detail--forum_post_author { display:flex; align-items:center; gap:11px; padding-bottom:20px; border-bottom:1px solid #edf0f5; cursor:pointer; }
.r-studio-detail--forum_post_author img { width:39px; height:39px; border-radius:50%; object-fit:cover; }
.r-studio-detail--forum_post_author span { display:flex; flex-direction:column; gap:2px; }
.r-studio-detail--forum_post_author b { color:#344054; font-size:13px; }
.r-studio-detail--forum_post_author:hover b,
.r-studio-detail--forum_reply_meta b[role="link"]:hover { color:#d98d00; }
.r-studio-detail--forum_post_author small { color:#98a2b3; }
.r-studio-detail--forum_post_content { min-height:130px; padding:26px 0 32px; color:#344054; font-size:15px; line-height:1.9; white-space:pre-wrap; word-break:break-word; }
.r-studio-detail--forum_post_footer { display:flex; align-items:center; justify-content:space-between; padding-top:14px; border-top:1px solid #edf0f5; color:#98a2b3; font-size:11px; }
.r-studio-detail--forum_replies { margin-top:24px; padding:24px 28px; border:1px solid #e8ecf2; border-radius:18px; background:rgba(255,255,255,.87); }
.r-studio-detail--forum_replies_head { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; border-bottom:1px solid #edf0f5; }
.r-studio-detail--forum_replies_head h2 { margin:0; color:#172033; font-size:19px; }
.r-studio-detail--forum_replies_head h2 small { margin-left:4px; color:#e59a00; font-size:14px; }
.r-studio-detail--forum_replies_head > span { color:#98a2b3; font-size:11px; }
.r-studio-detail--forum_reply { display:flex; gap:14px; padding:20px 2px; border-bottom:1px solid #edf0f5; }
.r-studio-detail--forum_reply > img { width:42px; height:42px; flex:none; border-radius:50%; object-fit:cover; box-shadow:0 0 0 3px #fff,0 4px 12px rgba(35,48,70,.1); }
.r-studio-detail--forum_reply_body { min-width:0; flex:1; }
.r-studio-detail--forum_reply_meta { display:flex; align-items:center; justify-content:space-between; }
.r-studio-detail--forum_reply_meta span { display:flex; align-items:baseline; gap:9px; }
.r-studio-detail--forum_reply_meta b { color:#344054; font-size:13px; }
.r-studio-detail--forum_reply_meta b[role="link"] { cursor:pointer; transition:color .18s ease; }
.r-studio-detail--forum_reply_meta small,.r-studio-detail--forum_reply_meta em { color:#98a2b3; font-size:11px; font-style:normal; }
.r-studio-detail--forum_reply p { margin:10px 0 4px; color:#475467; font-size:14px; line-height:1.75; white-space:pre-wrap; word-break:break-word; }
.r-studio-detail--forum_reply_actions { min-height:20px; text-align:right; }
.r-studio-detail--forum_reply_box { margin-top:22px; padding:18px; border:1px solid #f0dfb4; border-radius:16px; background:linear-gradient(135deg,#fffaf0,#fff); }
.r-studio-detail--forum_reply_box_head { display:flex; align-items:center; gap:10px; margin-bottom:13px; }
.r-studio-detail--forum_reply_box_head img { width:36px; height:36px; border-radius:50%; object-fit:cover; }
.r-studio-detail--forum_reply_box_head span { display:flex; flex-direction:column; }
.r-studio-detail--forum_reply_box_head b { color:#344054; font-size:13px; }
.r-studio-detail--forum_reply_box_head small,.r-studio-detail--forum_reply_box_footer small { color:#98a2b3; font-size:11px; }
.r-studio-detail--forum_reply_box :deep(.el-textarea__inner) { border:0; border-radius:12px; box-shadow:0 0 0 1px #e4e8ef inset; }
.r-studio-detail--forum_reply_box_footer { display:flex; align-items:center; justify-content:space-between; margin-top:12px; }
.r-studio-detail--forum_reply_box_footer .el-button { border-radius:10px; font-weight:750; }
.r-studio-detail--forum_compose_note { display:flex; align-items:center; gap:12px; margin-bottom:20px; padding:14px 16px; border:1px solid #f0dfb4; border-radius:14px; background:linear-gradient(135deg,#fff8e7,#f8fbff); }
.r-studio-detail--forum_compose_note > span { display:grid; width:38px; height:38px; flex:none; place-items:center; border-radius:11px; background:#172033; color:#fec433; font-weight:850; }
.r-studio-detail--forum_compose_note > div { display:flex; flex-direction:column; gap:3px; }
.r-studio-detail--forum_compose_note b { color:#344054; }
.r-studio-detail--forum_compose_note small { color:#8590a3; }
.r-studio-detail--forum_compose :deep(.el-form-item__label) { color:#344054; font-weight:750; }
.r-studio-detail--forum_compose :deep(.el-input__wrapper),.r-studio-detail--forum_compose :deep(.el-textarea__inner) { border-radius:11px; box-shadow:0 0 0 1px #e1e6ed inset; }
.r-studio-detail--my_work_item { border-color:#e5eaf1; border-radius:14px; }
.r-studio-detail--my_work_item:hover { transform:translateY(-3px); box-shadow:0 10px 24px rgba(39,55,82,.1); }
:deep(.el-dialog) { border-radius:20px!important; }
:deep(.el-dialog__header) { padding:22px 24px 16px; }
:deep(.el-dialog__body) { padding:20px 24px; }
@media(max-width:800px){.r-studio-detail--page{padding:20px 14px 56px}.r-studio-detail--header{align-items:flex-start;flex-direction:column;padding:20px}.r-studio-detail--header .r-studio-detail--cover{width:100%;height:auto;aspect-ratio:16/7}.r-studio-detail--header .r-studio-detail--info .r-studio-detail--stats{gap:7px}.r-studio-detail--tabs{padding:0 14px 20px}.r-studio-detail--member_list{grid-template-columns:repeat(2,1fr)}.r-studio-detail--forum_hero{align-items:flex-start;flex-direction:column;padding:17px}.r-studio-detail--forum_summary{align-self:stretch;justify-content:flex-end}.r-studio-detail--forum_toolbar{align-items:stretch;flex-direction:column}.r-studio-detail--forum_search{width:100%}.r-studio-detail--forum_rule{text-align:left}.r-studio-detail--forum_item{align-items:flex-start;padding:16px 12px}.r-studio-detail--forum_item_avatar{width:38px;height:38px}.r-studio-detail--forum_excerpt,.r-studio-detail--forum_item_main small i:last-child{display:none}.r-studio-detail--forum_counts{grid-template-columns:42px}.r-studio-detail--forum_counts span:nth-child(2),.r-studio-detail--forum_counts>i{display:none}.r-studio-detail--forum_post{padding:22px 18px}.r-studio-detail--forum_post h1{font-size:23px}.r-studio-detail--forum_replies{padding:20px 16px}.r-studio-detail--forum_reply_box_footer{align-items:stretch;flex-direction:column;gap:10px}.r-studio-detail--forum_reply_box_footer .el-button{width:100%}}
.r-studio-detail--cover_upload { width:100%; min-height:96px; padding:12px; display:flex; align-items:center; gap:12px; border:1px dashed #cad2df; border-radius:14px; background:#f8faff; cursor:pointer; }
.r-studio-detail--cover_upload:hover { border-color:#fec433; background:#fffaf0; }
.r-studio-detail--cover_upload img { width:136px; height:76px; object-fit:cover; border-radius:10px; }
.r-studio-detail--cover_upload > span { flex:1; color:#667085; }
</style>
