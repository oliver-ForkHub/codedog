<template>
  <div class="r-admin--page">
    <div class="r-admin--container">
      <!-- 侧边栏 -->
      <aside class="r-admin--sidebar">
        <div class="r-admin--logo">
          <span class="r-admin--logo_icon">🐕</span>
          <span class="r-admin--logo_text">后台管理</span>
        </div>
        <el-menu :default-active="activeMenu" @select="handleMenuSelect">
          <el-menu-item index="dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>数据大屏</span>
          </el-menu-item>
          <el-menu-item index="im-admin" v-if="['admin', 'superadmin'].includes(userStore.user?.role)">
            <el-icon><ChatDotRound /></el-icon>
            <span>即时通讯后台</span>
          </el-menu-item>
          <el-menu-item index="users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item v-if="userStore.user?.role !== 'moderator'" index="works">
            <el-icon><Document /></el-icon>
            <span>作品管理</span>
          </el-menu-item>
          <el-menu-item index="comments">
            <el-icon><ChatDotRound /></el-icon>
            <span>评论管理</span>
          </el-menu-item>
          <el-menu-item v-if="userStore.user?.role !== 'reviewer'" index="posts">
            <el-icon><Postcard /></el-icon>
            <span>帖子管理</span>
          </el-menu-item>
          <el-menu-item index="reports">
            <el-icon><Warning /></el-icon>
            <span>举报管理</span>
          </el-menu-item>
          <el-menu-item index="studios" v-if="['admin', 'superadmin'].includes(userStore.user?.role)">
            <el-icon><OfficeBuilding /></el-icon>
            <span>工作室管理</span>
          </el-menu-item>
          <el-menu-item index="roles" v-if="userStore.user?.role === 'superadmin'">
            <el-icon><UserFilled /></el-icon>
            <span>角色管理</span>
          </el-menu-item>
          <el-menu-item index="permissions" v-if="userStore.user?.role === 'superadmin'">
            <el-icon><Key /></el-icon>
            <span>权限设置</span>
          </el-menu-item>
          <el-menu-item index="banners">
            <el-icon><Picture /></el-icon>
            <span>轮播图管理</span>
          </el-menu-item>
          <el-menu-item index="ipbans">
            <el-icon><Lock /></el-icon>
            <span>IP封禁</span>
          </el-menu-item>
          <el-menu-item index="announcements" v-if="['admin', 'superadmin'].includes(userStore.user?.role)">
            <el-icon><Bell /></el-icon>
            <span>公告管理</span>
          </el-menu-item>
          <el-menu-item index="sensitive" v-if="['admin', 'superadmin'].includes(userStore.user?.role)">
            <el-icon><Filter /></el-icon>
            <span>敏感词管理</span>
          </el-menu-item>
          <el-menu-item index="configs" v-if="userStore.user?.role === 'superadmin'">
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </el-menu-item>
          <!-- 修复: 收紧 log:view 权限仅 superadmin, 菜单也对应收紧,避免 admin 看到但点 403 -->
          <el-menu-item index="logs" v-if="userStore.user?.role === 'superadmin'">
            <el-icon><List /></el-icon>
            <span>操作日志</span>
          </el-menu-item>
          <el-menu-item index="realtime-logs" v-if="userStore.user?.role === 'superadmin'">
            <el-icon><Monitor /></el-icon>
            <span>实时日志</span>
          </el-menu-item>
          <el-menu-item index="security" v-if="['admin', 'superadmin'].includes(userStore.user?.role)">
            <el-icon><Lock /></el-icon>
            <span>安全验证</span>
          </el-menu-item>
                    <el-menu-item index="developer-apps" v-if="['admin', 'superadmin'].includes(userStore.user?.role)">
            <el-icon><Key /></el-icon>
            <span>开发者应用</span>
          </el-menu-item>
<el-menu-item index="crawl">
            <el-icon><Download /></el-icon>
            <span>作品爬取</span>
          </el-menu-item>
        </el-menu>
      </aside>
      
      <!-- 主内容 -->
      <main class="r-admin--main">
        <!-- 数据大屏 -->
        <div v-if="activeMenu === 'dashboard'" class="r-admin--section">
          <div class="r-admin--dashboard_header">
            <h2 class="r-admin--title" style="margin: 0;">数据大屏</h2>
            <span style="font-size: 12px; color: #a08c5a;">实时数据概览</span>
          </div>
          <div class="r-admin--stats" v-loading="loadingStats">
            <div class="r-admin--stat_card r-admin--stat_card_primary">
              <div class="r-admin--stat_icon_wrap">👥</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.userCount }}</span>
                <span class="r-admin--stat_label">总用户数</span>
              </div>
              <span class="r-admin--stat_sub" v-if="stats.todayUsers">+{{ stats.todayUsers }} 今日</span>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">🎨</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.workCount }}</span>
                <span class="r-admin--stat_label">总作品数</span>
              </div>
              <span class="r-admin--stat_sub" v-if="stats.todayWorks">+{{ stats.todayWorks }} 今日</span>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">💬</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.commentCount }}</span>
                <span class="r-admin--stat_label">总评论数</span>
              </div>
              <span class="r-admin--stat_sub" v-if="stats.todayComments">+{{ stats.todayComments }} 今日</span>
            </div>
            <div class="r-admin--stat_card r-admin--stat_card_alert">
              <div class="r-admin--stat_icon_wrap">⚠️</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.pendingReports }}</span>
                <span class="r-admin--stat_label">待处理举报</span>
              </div>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">⭐</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.featuredWorks }}</span>
                <span class="r-admin--stat_label">精选作品</span>
              </div>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">🚫</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.disabledUsers }}</span>
                <span class="r-admin--stat_label">禁用用户</span>
              </div>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">📈</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.newUsersWeek }}</span>
                <span class="r-admin--stat_label">本周新增</span>
              </div>
            </div>
            <div class="r-admin--stat_card r-admin--stat_card_primary">
              <div class="r-admin--stat_icon_wrap">👁️</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.todayVisits }}</span>
                <span class="r-admin--stat_label">今日网站访问量</span>
              </div>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">🌐</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.todayUniqueIps }}</span>
                <span class="r-admin--stat_label">今日独立 IP</span>
              </div>
            </div>
            <div class="r-admin--stat_card">
              <div class="r-admin--stat_icon_wrap">🔒</div>
              <div class="r-admin--stat_info">
                <span class="r-admin--stat_num">{{ stats.activeIpBans }}</span>
                <span class="r-admin--stat_label">封禁IP</span>
              </div>
            </div>
          </div>
          
          <div class="r-admin--chart_section">
            <h3>近7天数据趋势</h3>
            <div class="r-admin--chart" ref="chartRef"></div>
          </div>
        </div>
        
        <!-- 用户管理 -->
        <div v-if="activeMenu === 'users'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">用户管理</h2>
            <div class="r-admin--filters">
              <el-input v-model="userSearch" placeholder="搜索用户名/昵称/邮箱/编程猫ID" style="width: 220px" @keyup.enter="searchUsers" clearable>
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-select v-model="userRoleFilter" placeholder="角色" style="width: 120px" clearable @change="searchUsers">
                <el-option label="全部" value="" />
                <el-option label="超级管理员" value="superadmin" />
                <el-option label="管理员" value="admin" />
                <el-option label="版主" value="moderator" />
                <el-option label="审核员" value="reviewer" />
                <el-option label="用户" value="user" />
              </el-select>
              <el-select v-model="userStatusFilter" placeholder="状态" style="width: 100px" clearable @change="searchUsers">
                <el-option label="全部" value="" />
                <el-option label="正常" value="active" />
                <el-option label="禁用" value="disabled" />
              </el-select>
              <el-button type="primary" @click="searchUsers">搜索</el-button>
              <el-button type="warning" @click="showBatchNotificationDialog">批量发信</el-button>
            </div>
          </div>
          <el-table :data="users" v-loading="loadingUsers" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="codemao_user_id" label="编程猫ID" width="100" />
            <el-table-column label="用户信息" min-width="150">
              <template #default="{ row }">
                <div class="r-admin--user_cell" @click="showUserDetail(row)" style="cursor: pointer;">
                  <img :src="row.avatar || defaultAvatar" class="r-admin--user_avatar" referrerpolicy="no-referrer" />
                  <div>
                    <div class="r-admin--user_name">{{ row.nickname || row.username }}</div>
                    <div class="r-admin--user_email">{{ row.email }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="role" label="角色" width="90">
              <template #default="{ row }">
                <el-tag :type="getRoleTagType(row.role)" size="small">
                  {{ getRoleName(row.role) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'active' ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="注册时间" width="110">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column prop="last_login_at" label="最后登录" width="110">
              <template #default="{ row }">{{ formatDate(row.last_login_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="showUserDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="r-admin--pagination">
            <el-pagination
              v-model:current-page="userPage"
              v-model:page-size="userPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="userTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="fetchUsers"
              @size-change="fetchUsers"
            />
          </div>
        </div>
        
        <!-- 用户详情弹窗 -->
        <el-dialog v-model="userDetailVisible" title="用户详情" width="800px" destroy-on-close>
          <div v-if="userDetailLoading" style="text-align: center; padding: 40px;">
            <el-icon class="is-loading" :size="40"><Loading /></el-icon>
          </div>
          <div v-else-if="userDetail" class="r-admin--user_detail">
            <div class="r-admin--user_detail_header">
              <img :src="userDetail.user.avatar || defaultAvatar" class="r-admin--user_detail_avatar" referrerpolicy="no-referrer" />
              <div class="r-admin--user_detail_info">
                <h3>{{ userDetail.user.nickname || userDetail.user.username }}</h3>
                <p>@{{ userDetail.user.username }} · {{ userDetail.user.email }}</p>
                <div class="r-admin--user_detail_tags">
                  <el-tag :type="getRoleTagType(userDetail.user.role)">{{ getRoleName(userDetail.user.role) }}</el-tag>
                  <el-tag :type="userDetail.user.status === 'active' ? 'success' : 'danger'">
                    {{ userDetail.user.status === 'active' ? '正常' : '禁用' }}
                  </el-tag>
                  <el-tag v-if="userDetail.user.codemao_user_id" type="warning">编程猫ID: {{ userDetail.user.codemao_user_id }}</el-tag>
                </div>
                <!-- 修复: superadmin 可见 - 编程猫 Token 区域(默认脱敏,点击查看完整) -->
                <div v-if="userStore.user?.role === 'superadmin' && userDetail.user.has_codemao_token" class="r-admin--token_box">
                  <div class="r-admin--token_label">编程猫 Token</div>
                  <div class="r-admin--token_content">
                    <code class="r-admin--token_value">{{ tokenRevealed ? fullToken : userDetail.user.codemao_token_mask || '••••…••••' }}</code>
                    <el-button v-if="!tokenRevealed" size="small" type="primary" plain :loading="tokenLoading" @click="revealToken">查看完整</el-button>
                    <el-button v-else size="small" @click="copyToken">复制</el-button>
                    <el-button v-if="tokenRevealed" size="small" type="danger" plain @click="tokenRevealed = false">隐藏</el-button>
                  </div>
                </div>
              </div>
              <div class="r-admin--user_detail_actions">
                <el-button type="primary" size="small" @click="showRoleDialog(userDetail.user)">修改角色</el-button>
                <el-button size="small" @click="showPasswordDialog">修改密码</el-button>
                <el-button type="warning" size="small" @click="showSendNotificationDialog">发送站内信</el-button>
                <el-button v-if="userDetail.user.id !== userStore.user?.id" type="warning" plain size="small" @click="warnUserDetail">正式警告</el-button>
                <el-button :type="userDetail.user.status === 'active' ? 'danger' : 'success'" size="small" @click="toggleUserStatus(userDetail.user)">
                  {{ userDetail.user.status === 'active' ? '禁用账户' : '启用账户' }}
                </el-button>
                <el-button v-if="userDetail.user.id !== userStore.user?.id" size="small" type="primary" plain @click="impersonateUserDetail">一键登录</el-button>
              </div>
            </div>
            <section class="r-admin--app_login_panel">
              <div class="r-admin--app_login_title">App 登录信息</div>
              <el-descriptions :column="2" border>
              <el-descriptions-item label="是否登录过 App">
                <el-tag :type="userDetail.user.app_last_login_at ? 'success' : 'info'">{{ userDetail.user.app_last_login_at ? '是' : '否' }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="最后 App 登录">{{ userDetail.user.app_last_login_at ? formatDate(userDetail.user.app_last_login_at) : '从未登录' }}</el-descriptions-item>
              <el-descriptions-item label="App 平台">{{ userDetail.user.app_last_platform || '-' }}</el-descriptions-item>
              <el-descriptions-item label="App 版本">{{ userDetail.user.app_last_version ? `${userDetail.user.app_last_version}（构建 ${userDetail.user.app_last_build || '-'}）` : '-' }}</el-descriptions-item>
              </el-descriptions>
            </section>
            
            <div class="r-admin--user_stats">
              <div class="r-admin--user_stat">
                <span class="r-admin--stat_value">{{ userDetail.stats.worksCount }}</span>
                <span class="r-admin--stat_label">作品</span>
              </div>
              <div class="r-admin--user_stat">
                <span class="r-admin--stat_value">{{ userDetail.stats.commentsCount }}</span>
                <span class="r-admin--stat_label">评论</span>
              </div>
              <div class="r-admin--user_stat">
                <span class="r-admin--stat_value">{{ userDetail.stats.favoritesCount }}</span>
                <span class="r-admin--stat_label">收藏</span>
              </div>
              <div class="r-admin--user_stat">
                <span class="r-admin--stat_value">{{ userDetail.stats.followingCount }}</span>
                <span class="r-admin--stat_label">关注</span>
              </div>
              <div class="r-admin--user_stat">
                <span class="r-admin--stat_value">{{ userDetail.stats.followersCount }}</span>
                <span class="r-admin--stat_label">粉丝</span>
              </div>
              <div class="r-admin--user_stat">
                <span class="r-admin--stat_value">{{ userDetail.stats.likesReceived }}</span>
                <span class="r-admin--stat_label">获赞</span>
              </div>
            </div>
            
            <el-tabs>
              <el-tab-pane label="最近作品">
                <el-table :data="userDetail.recentWorks" size="small" max-height="300">
                  <el-table-column prop="id" label="ID" width="60" />
                  <el-table-column prop="name" label="名称" min-width="150" />
                  <el-table-column prop="praise_times" label="点赞" width="80" />
                  <el-table-column prop="view_times" label="浏览" width="80" />
                  <el-table-column prop="created_at" label="发布时间" width="110">
                    <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!userDetail.recentWorks?.length" description="暂无作品" />
              </el-tab-pane>
              <el-tab-pane label="最近评论">
                <el-table :data="userDetail.recentComments" size="small" max-height="300">
                  <el-table-column prop="id" label="ID" width="60" />
                  <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
                  <el-table-column prop="work.name" label="作品" width="120" show-overflow-tooltip />
                  <el-table-column prop="created_at" label="时间" width="110">
                    <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!userDetail.recentComments?.length" description="暂无评论" />
              </el-tab-pane>
              <el-tab-pane :label="`警告记录 ${userDetail.warnings?.length || 0}`">
                <div v-if="userDetail.warnings?.length" class="r-admin--warning_history">
                  <article v-for="warning in userDetail.warnings" :key="warning.id" class="r-admin--warning_record">
                    <header>
                      <div><strong>警告 #{{ warning.id }}</strong><el-tag size="small" :type="warning.status === 'acknowledged' ? 'success' : 'danger'">{{ warning.status === 'acknowledged' ? '已签署保证书' : '待签署' }}</el-tag></div>
                      <time>{{ formatDateTime(warning.created_at) }}</time>
                    </header>
                    <el-descriptions :column="2" border size="small">
                      <el-descriptions-item label="发出人">{{ warning.issuer?.nickname || warning.issuer?.username || `管理员 #${warning.issued_by}` }}</el-descriptions-item>
                      <el-descriptions-item label="签署时间">{{ warning.acknowledged_at ? formatDateTime(warning.acknowledged_at) : '尚未签署' }}</el-descriptions-item>
                      <el-descriptions-item label="警告原因" :span="2"><div class="r-admin--warning_text">{{ warning.reason }}</div></el-descriptions-item>
                      <el-descriptions-item label="违规来源" :span="2">{{ warning.source_title || (warning.source_type ? `${warning.source_type} #${warning.source_id}` : '管理员直接警告') }}</el-descriptions-item>
                      <el-descriptions-item label="违规内容快照" :span="2"><div class="r-admin--warning_snapshot">{{ warning.source_content || '该警告未关联具体帖子或评论' }}</div></el-descriptions-item>
                      <el-descriptions-item label="用户保证书" :span="2"><div class="r-admin--guarantee_text">{{ warning.guarantee_text || '尚未提交保证书' }}</div></el-descriptions-item>
                    </el-descriptions>
                  </article>
                </div>
                <el-empty v-else description="该用户暂无警告记录" />
              </el-tab-pane>
              <el-tab-pane label="账户信息">
                <el-descriptions :column="2" border size="small">
                  <el-descriptions-item label="用户ID">{{ userDetail.user.id }}</el-descriptions-item>
                  <el-descriptions-item label="用户名">{{ userDetail.user.username }}</el-descriptions-item>
                  <el-descriptions-item label="邮箱">{{ userDetail.user.email }}</el-descriptions-item>
                  <el-descriptions-item label="昵称">{{ userDetail.user.nickname || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="编程猫ID">{{ userDetail.user.codemao_user_id || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="角色">{{ getRoleName(userDetail.user.role) }}</el-descriptions-item>
                  <el-descriptions-item label="注册时间">{{ formatDateTime(userDetail.user.created_at) }}</el-descriptions-item>
                  <el-descriptions-item label="最后登录">{{ formatDateTime(userDetail.user.last_login_at) }}</el-descriptions-item>
                  <el-descriptions-item label="最后登录IP">{{ userDetail.user.last_login_ip || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="个人简介">{{ userDetail.user.bio || '-' }}</el-descriptions-item>
                </el-descriptions>
              </el-tab-pane>
              <el-tab-pane label="评优专区">
                <div style="padding: 20px 0;">
                  <div style="border: 1.5px solid #e6dcc8; border-radius: 8px; padding: 18px 22px; margin-bottom: 20px; background: linear-gradient(to right, #fffdf7, #fff9ed); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: -20px; right: -10px; font-size: 80px; opacity: 0.06; pointer-events: none;">🏆</div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #f6d365, #d4a017); display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(212, 160, 23, 0.3);">🌟</div>
                        <div>
                          <div style="font-size: 15px; font-weight: 600; color: #2c3e50;">活跃大佬</div>
                          <div style="font-size: 12px; color: #8c7a5b; margin-top: 3px;">授予后在社区主页「活跃用户」栏目展示</div>
                        </div>
                      </div>
                      <div style="display: flex; align-items: center; gap: 12px;">
                        <span v-if="userDetail.user.is_active_dalao" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 12px; background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 500; border: 1px solid #a7f3d0;">● 已授予</span>
                        <span v-else style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 12px; background: #f9fafb; color: #9ca3af; font-size: 12px; border: 1px solid #e5e7eb;">○ 未授予</span>
                        <el-button 
                          :type="userDetail.user.is_active_dalao ? 'danger' : 'primary'" 
                          size="small"
                          plain
                          @click="handleToggleActiveDalao(userDetail.user, !userDetail.user.is_active_dalao)"
                        >
                          {{ userDetail.user.is_active_dalao ? '取消荣誉' : '授予荣誉' }}
                        </el-button>
                      </div>
                    </div>
                  </div>

                  <div style="border: 1px solid #ebeef5; border-radius: 8px; padding: 18px 22px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #f2f3f5;">
                      <span style="font-size: 14px; font-weight: 600; color: #303133;">管理员备注</span>
                      <span style="font-size: 11px; color: #c0c4cc; background: #fafafa; padding: 2px 8px; border-radius: 4px; border: 1px solid #ebeef5;">仅管理员可见</span>
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                      <el-input v-model="honorNote" placeholder="记录评优理由、操作说明..." style="flex: 1;" size="default" />
                      <el-button type="primary" size="default" @click="addHonorNote">添加</el-button>
                    </div>
                    <div v-if="honorNotes.length > 0" style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                      <el-timeline>
                        <el-timeline-item 
                          v-for="note in honorNotes" 
                          :key="note.time" 
                          :timestamp="formatDateTime(note.time)"
                          placement="top"
                          size="normal"
                          :color="note.content.includes('授予') ? '#10b981' : note.content.includes('取消') ? '#ef4444' : '#409eff'"
                        >
                          <div style="padding: 8px 12px; background: #fafbfc; border-radius: 6px; border: 1px solid #f0f1f3;">
                            <p style="margin: 0; font-size: 13px; color: #303133; line-height: 1.5;">{{ note.content }}</p>
                            <p style="margin: 5px 0 0; font-size: 11px; color: #a8abb2;">{{ note.operator }}</p>
                          </div>
                        </el-timeline-item>
                      </el-timeline>
                    </div>
                    <div v-else style="text-align: center; padding: 24px 0; color: #c0c4cc; font-size: 13px;">暂无备注记录</div>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-dialog>
        
        <!-- 修改密码弹窗 -->
        <el-dialog v-model="passwordDialogVisible" title="修改用户密码" width="400px">
          <el-form :model="passwordForm" label-width="80px">
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" placeholder="请输入新密码" show-password />
            </el-form-item>
            <el-form-item label="确认密码">
              <el-input v-model="passwordForm.confirmPassword" type="password" placeholder="请再次输入密码" show-password />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="passwordDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleUpdatePassword" :loading="passwordLoading">确认修改</el-button>
          </template>
        </el-dialog>
        
        <!-- 发送站内信弹窗 -->
        <el-dialog v-model="notificationDialogVisible" title="发送站内信" width="500px">
          <el-form :model="notificationForm" label-width="80px">
            <el-form-item label="接收用户">
              <span v-if="notificationForm.targetUser">{{ notificationForm.targetUser.nickname || notificationForm.targetUser.username }}</span>
              <span v-else-if="notificationForm.targetUsers">已选择 {{ notificationForm.targetUsers.length }} 个用户</span>
              <span v-else>全部用户</span>
            </el-form-item>
            <el-form-item label="标题">
              <el-input v-model="notificationForm.title" placeholder="请输入标题" maxlength="100" show-word-limit />
            </el-form-item>
            <el-form-item label="内容">
              <el-input v-model="notificationForm.content" type="textarea" :rows="4" placeholder="请输入内容" maxlength="500" show-word-limit />
            </el-form-item>
            <!-- 修复:管理员可选项——是否使用管理员头像/显示管理员名称 -->
            <el-form-item label="发送身份">
              <el-checkbox v-model="notificationForm.useAdminAvatar">使用我的头像</el-checkbox>
              <el-checkbox v-model="notificationForm.showAdminName">显示我的名称</el-checkbox>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="notificationDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleSendNotification" :loading="notificationLoading">发送</el-button>
          </template>
        </el-dialog>
        
        <!-- 批量发送站内信弹窗 -->
        <el-dialog v-model="batchNotificationDialogVisible" title="批量发送站内信" width="600px">
          <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
            选择用户后发送站内信，或点击"发送给全部用户"
          </el-alert>
          <div style="margin-bottom: 16px;">
            <el-button type="primary" @click="selectAllUsers">全选当前页</el-button>
            <el-button @click="clearSelectedUsers">清除选择</el-button>
            <el-button type="warning" @click="showAllUsersNotificationDialog">发送给全部用户</el-button>
            <span style="margin-left: 16px; color: #666;">已选择 {{ selectedUserIds.length }} 个用户</span>
          </div>
          <el-table :data="users" @selection-change="handleUserSelection" max-height="300">
            <el-table-column type="selection" width="50" />
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column label="用户信息" min-width="150">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img :src="row.avatar || defaultAvatar" style="width: 32px; height: 32px; border-radius: 50%;" referrerpolicy="no-referrer" />
                  <span>{{ row.nickname || row.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="role" label="角色" width="90">
              <template #default="{ row }">
                <el-tag :type="getRoleTagType(row.role)" size="small">{{ getRoleName(row.role) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-form :model="notificationForm" label-width="80px" style="margin-top: 16px;">
            <el-form-item label="标题">
              <el-input v-model="notificationForm.title" placeholder="请输入标题" maxlength="100" show-word-limit />
            </el-form-item>
            <el-form-item label="内容">
              <el-input v-model="notificationForm.content" type="textarea" :rows="3" placeholder="请输入内容" maxlength="500" show-word-limit />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="batchNotificationDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleBatchNotification" :loading="notificationLoading" :disabled="selectedUserIds.length === 0">发送给选中用户</el-button>
          </template>
        </el-dialog>
        
        <!-- 作品管理 -->
        <div v-if="activeMenu === 'works'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">作品管理</h2>
            <div class="r-admin--filters">
              <el-input v-model="workSearch" placeholder="搜索作品名/ID/作者" style="width: 180px" @keyup.enter="searchWorks" clearable>
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-select v-model="workTypeFilter" placeholder="类型" style="width: 100px" clearable @change="searchWorks">
                <el-option label="全部" value="" />
                <el-option label="游戏" value="游戏" />
                <el-option label="动画" value="动画" />
                <el-option label="小说" value="小说" />
                <el-option label="其他" value="其他" />
              </el-select>
              <el-select v-model="workFeaturedFilter" placeholder="精选" style="width: 100px" clearable @change="searchWorks">
                <el-option label="全部" value="" />
                <el-option label="已精选" value="true" />
                <el-option label="未精选" value="false" />
              </el-select>
              <el-button type="primary" @click="searchWorks">搜索</el-button>
              <el-button v-if="userStore.user?.role === 'superadmin'" type="warning" plain @click="recalibrateWorks" :loading="recalibrating">扫描并校准</el-button>
            </div>
          </div>
          <el-table :data="works" v-loading="loadingWorks" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="codemao_work_id" label="编程猫ID" width="100" />
            <el-table-column label="作品" min-width="200">
              <template #default="{ row }">
                <div class="r-admin--work_cell">
                  <img :src="row.preview" class="r-admin--work_cover" referrerpolicy="no-referrer" />
                  <div>
                    <div class="r-admin--work_name">{{ row.name }}</div>
                    <div class="r-admin--work_author">{{ row.author?.nickname || row.author?.username || row.codemao_author_name }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="作品类型" width="150">
              <template #default="{ row }">
                <el-tag size="small">{{ getTypeName(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="view_times" label="浏览" width="80" sortable />
            <el-table-column prop="praise_times" label="点赞" width="80" sortable />
            <el-table-column prop="is_featured" label="精选" width="80">
              <template #default="{ row }">
                <el-tag :type="row.is_featured ? 'warning' : 'info'" size="small">
                  {{ row.is_featured ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="is_sidebar_recommended" label="右栏" width="90">
              <template #default="{ row }">
                <el-tag :type="row.is_sidebar_recommended ? 'success' : 'info'" size="small">
                  {{ row.is_sidebar_recommended ? `推荐 ${row.sidebar_sort_order || 0}` : '关闭' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'published' ? 'success' : row.status === 'hidden' ? 'warning' : row.status === 'deleted' ? 'danger' : 'info'" size="small">
                  {{ row.status === 'published' ? '已发布' : row.status === 'hidden' ? '已隐藏' : row.status === 'deleted' ? '已删除' : row.status === 'pending' ? '待审核' : row.status === 'rejected' ? '已驳回' : row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="发布时间" width="110">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="showWorkDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="r-admin--pagination">
            <el-pagination
              v-model:current-page="workPage"
              v-model:page-size="workPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="workTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="fetchWorks"
              @size-change="fetchWorks"
            />
          </div>
        </div>
        
        <!-- 作品详情弹窗 -->
        <el-dialog v-model="workDetailVisible" title="作品详情" width="700px" destroy-on-close>
          <div v-if="workDetail">
            <!-- 查看模式 -->
            <template v-if="!workEditing">
              <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                <img :src="workDetail.preview" style="width: 200px; height: 150px; flex-shrink: 0; object-fit: cover; border-radius: 8px; background: #f0f0f0;" referrerpolicy="no-referrer" />
                <div style="flex: 1;">
                  <h3 style="margin: 0 0 8px;">{{ workDetail.name }}</h3>
                  <p style="color: #666; margin: 0 0 8px;">发布者: {{ workDetail.author?.nickname || workDetail.author?.username || '-' }}</p>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <el-tag>{{ getTypeName(workDetail.type) }}</el-tag>
                    <el-tag :type="workDetail.is_featured ? 'warning' : 'info'">{{ workDetail.is_featured ? '已精选' : '未精选' }}</el-tag>
                    <el-tag :type="workDetail.is_sidebar_recommended ? 'success' : 'info'">{{ workDetail.is_sidebar_recommended ? `右栏推荐 · 顺序 ${workDetail.sidebar_sort_order || 0}` : '未加入右栏' }}</el-tag>
                    <el-tag :type="workDetail.status === 'published' ? 'success' : workDetail.status === 'hidden' ? 'warning' : 'info'">{{ workDetail.status === 'published' ? '已发布' : workDetail.status === 'hidden' ? '已隐藏' : workDetail.status === 'deleted' ? '已删除' : workDetail.status === 'pending' ? '待审核' : workDetail.status === 'rejected' ? '已驳回' : workDetail.status }}</el-tag>
                  </div>
                </div>
              </div>
              <el-descriptions :column="3" border size="small">
                <el-descriptions-item label="作品ID">{{ workDetail.id }}</el-descriptions-item>
                <el-descriptions-item label="编程猫ID">{{ workDetail.codemao_work_id }}</el-descriptions-item>
                <el-descriptions-item label="作者ID">{{ workDetail.codemao_author_id }}</el-descriptions-item>
                <el-descriptions-item label="浏览量">{{ workDetail.view_times }}</el-descriptions-item>
                <el-descriptions-item label="点赞数">{{ workDetail.praise_times }}</el-descriptions-item>
                <el-descriptions-item label="收藏数">{{ workDetail.collection_times }}</el-descriptions-item>
                <el-descriptions-item label="评论数">{{ workDetail.comment_count }}</el-descriptions-item>
                <el-descriptions-item label="发布时间">{{ formatDate(workDetail.created_at) }}</el-descriptions-item>
                <el-descriptions-item label="作品链接">
                  <a :href="workDetail.work_url" target="_blank" style="color: #409eff;">查看原作品</a>
                </el-descriptions-item>
              </el-descriptions>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                <el-dropdown trigger="click" @command="(cmd) => handleWorkMoreAction(cmd, workDetail)">
                  <el-button>
                    更多操作<el-icon class="el-icon--right"><CaretBottom /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="hide" :disabled="workDetail.status === 'hidden'">
                        <el-icon><View /></el-icon>{{ workDetail.status === 'hidden' ? '已是隐藏状态' : '隐藏作品' }}
                      </el-dropdown-item>
                      <el-dropdown-item command="unhide" :disabled="workDetail.status !== 'hidden'">
                        <el-icon><View /></el-icon>取消隐藏
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" divided>
                        <span style="color: #f56c6c;"><el-icon><Delete /></el-icon>删除作品</span>
                      </el-dropdown-item>
                      <el-dropdown-item v-if="userStore.user?.role === 'superadmin'" command="purge" divided>
                        <span style="color: #c45656;"><el-icon><Delete /></el-icon>彻底删除（数据库）</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <div style="display: flex; gap: 8px;">
                  <el-button @click="workDetailVisible = false">关闭</el-button>
                  <el-button type="primary" @click="enterWorkEdit">编辑</el-button>
                </div>
              </div>
            </template>

            <!-- 编辑模式 -->
            <template v-else>
              <el-form :model="workEditForm" label-width="80px">
                <el-form-item label="封面图">
                  <div style="display: flex; gap: 12px; align-items: flex-start;">
                    <img :src="workEditForm.preview || workDetail.preview" style="width: 160px; height: 120px; flex-shrink: 0; object-fit: cover; border-radius: 6px; background: #f0f0f0;" referrerpolicy="no-referrer" />
                    <div style="flex: 1;">
                      <el-input v-model="workEditForm.preview" placeholder="输入新的封面图片URL" />
                      <p style="font-size: 12px; color: #999; margin: 4px 0 0;">留空则保持原封面</p>
                    </div>
                  </div>
                </el-form-item>
                <el-form-item label="作品名称"><el-input v-model="workEditForm.name" /></el-form-item>
                <el-form-item label="发布者">
                  <el-select
                    v-model="workEditForm.publisher_id"
                    filterable
                    remote
                    reserve-keyword
                    :remote-method="searchWorkPublishers"
                    :loading="workPublisherLoading"
                    placeholder="搜索用户名、昵称或编程猫ID"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="user in workPublisherOptions"
                      :key="user.id"
                      :label="`${user.nickname || user.username}（${user.username} · ID ${user.id}）`"
                      :value="user.id"
                    />
                  </el-select>
                  <div style="color: #999; font-size: 12px; margin-top: 4px;">修改后作品归属和作品数量统计会同步转移</div>
                </el-form-item>
                <el-row :gutter="16">
                  <el-col :span="12"><el-form-item label="具体类型">
                    <el-select v-model="workEditForm.type" filterable allow-create default-first-option style="width: 100%" placeholder="如 KITTEN3、KITTEN4、NEKO">
                      <el-option label="Kitten 3" value="KITTEN3" />
                      <el-option label="Kitten 4" value="KITTEN4" />
                      <el-option label="Nemo" value="NEMO" />
                      <el-option label="Neko（KittenN）" value="NEKO" />
                      <el-option label="CoCo" value="COCO" />
                      <el-option label="Wood（Python）" value="WOOD" />
                    </el-select>
                  </el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="IDE 系列">
                    <el-select v-model="workEditForm.ide_type" filterable allow-create default-first-option style="width: 100%" placeholder="API 返回的 ide_type">
                      <el-option label="Kitten" value="KITTEN" />
                      <el-option label="Nemo" value="NEMO" />
                      <el-option label="Neko（KittenN）" value="NEKO" />
                      <el-option label="CoCo" value="COCO" />
                      <el-option label="Wood" value="WOOD" />
                    </el-select>
                  </el-form-item></el-col>
                </el-row>
                <el-row :gutter="16">
                  <el-col :span="8"><el-form-item label="浏览量"><el-input-number v-model="workEditForm.view_times" :min="0" style="width: 100%" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="点赞数"><el-input-number v-model="workEditForm.praise_times" :min="0" style="width: 100%" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="收藏数"><el-input-number v-model="workEditForm.collection_times" :min="0" style="width: 100%" /></el-form-item></el-col>
                </el-row>
                <el-row :gutter="16">
                  <el-col :span="8"><el-form-item label="状态">
                    <el-select v-model="workEditForm.status" style="width: 100%">
                      <el-option label="已发布" value="published" />
                      <el-option label="待审核" value="pending" />
                      <el-option label="已驳回" value="rejected" />
                      <el-option label="已隐藏" value="hidden" />
                      <el-option label="已删除" value="deleted" />
                    </el-select>
                  </el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="精选"><el-switch v-model="workEditForm.is_featured" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="右栏推荐"><el-switch v-model="workEditForm.is_sidebar_recommended" /></el-form-item></el-col>
                </el-row>
                <el-form-item v-if="workEditForm.is_sidebar_recommended" label="右栏顺序">
                  <el-input-number v-model="workEditForm.sidebar_sort_order" :min="-9999" :max="9999" />
                  <span style="margin-left: 10px; color: #999; font-size: 12px;">数值越大越靠前，最多展示 8 个</span>
                </el-form-item>
                <el-form-item label="修改原因">
                  <el-input v-model="workEditReason" type="textarea" :rows="2" placeholder="请简要说明修改原因（会记录到操作日志）" />
                </el-form-item>
              </el-form>
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <el-button @click="workEditing = false">取消</el-button>
                <el-button type="primary" @click="saveWorkDetail" :loading="workDetailSaving">保存修改</el-button>
              </div>
            </template>
          </div>
        </el-dialog>

        <!-- 评论管理 -->
        <div v-if="activeMenu === 'comments'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">评论管理</h2>
            <div class="r-admin--filters">
              <el-input v-model="commentSearch" placeholder="搜索评论内容" style="width: 200px" @keyup.enter="searchComments" clearable>
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-input v-model="commentUserId" placeholder="用户ID" style="width: 100px" @keyup.enter="searchComments" clearable />
              <el-input v-model="commentWorkId" placeholder="作品ID" style="width: 100px" @keyup.enter="searchComments" clearable />
              <el-select v-model="commentStatusFilter" placeholder="状态" style="width: 100px" clearable @change="searchComments">
                <el-option label="全部" value="" />
                <el-option label="正常" value="active" />
                <el-option label="隐藏" value="hidden" />
                <el-option label="已删除" value="deleted" />
              </el-select>
              <el-button type="primary" @click="searchComments">搜索</el-button>
            </div>
          </div>
          <el-table :data="comments" v-loading="loadingComments" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column label="用户" width="120">
              <template #default="{ row }">
                <div class="r-admin--user_cell" v-if="row.user">
                  <img :src="row.user.avatar || defaultAvatar" class="r-admin--user_avatar" referrerpolicy="no-referrer" />
                  <span>{{ row.user.nickname || row.user.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="评论内容" min-width="250">
              <template #default="{ row }">
                <div class="r-admin--comment_content">{{ row.content }}</div>
              </template>
            </el-table-column>
            <el-table-column label="所属位置" min-width="200">
              <template #default="{ row }">
                <template v-if="row.work">
                  <el-tag size="small" type="warning" style="margin-right:6px;">作品</el-tag>
                  <el-link type="primary" :underline="false" :href="getCommentWorkPath(row)" target="_blank" @click.prevent="openCommentTarget(row)">{{ row.work.name }}</el-link>
                </template>
                <template v-else-if="row.post || row.post_id">
                  <el-tag size="small" type="success" style="margin-right:6px;">帖子</el-tag>
                  <el-link type="primary" :underline="false" :href="getCommentPostPath(row)" target="_blank" @click.prevent="openCommentTarget(row)">{{ row.post?.title || ('帖子 #' + row.post_id) }}</el-link>
                </template>
                <span v-else style="color:#999;">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="like_count" label="点赞" width="70" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : row.status === 'hidden' ? 'warning' : 'danger'" size="small">
                  {{ row.status === 'active' ? '正常' : row.status === 'hidden' ? '隐藏' : '已删除' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">{{ formatDateTimeSeconds(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="showCommentDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="r-admin--pagination">
            <el-pagination
              v-model:current-page="commentPage"
              v-model:page-size="commentPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="commentTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="fetchComments"
              @size-change="fetchComments"
            />
          </div>
        </div>
        
        <!-- 评论详情弹窗 -->
        <el-dialog v-model="commentDetailVisible" title="评论详情" width="720px" destroy-on-close>
          <div v-if="commentDetail" class="r-admin--comment_detail">
            <div class="r-admin--comment_detail_header">
              <div class="r-admin--comment_detail_user" v-if="commentDetail.user">
                <img :src="commentDetail.user.avatar || defaultAvatar" class="r-admin--comment_detail_avatar" referrerpolicy="no-referrer" />
                <div>
                  <div class="r-admin--comment_detail_name">{{ commentDetail.user.nickname || commentDetail.user.username }}</div>
                  <div class="r-admin--comment_detail_uid">用户ID: {{ commentDetail.user.id }}</div>
                </div>
              </div>
              <el-tag :type="commentDetail.status === 'active' ? 'success' : commentDetail.status === 'hidden' ? 'warning' : 'danger'">
                {{ commentDetail.status === 'active' ? '正常' : commentDetail.status === 'hidden' ? '隐藏' : '已删除' }}
              </el-tag>
            </div>

            <el-descriptions :column="2" border size="small" style="margin-top: 16px;">
              <el-descriptions-item label="评论ID">{{ commentDetail.id }}</el-descriptions-item>
              <el-descriptions-item label="点赞数">{{ commentDetail.like_count || 0 }}</el-descriptions-item>
              <el-descriptions-item label="发布时间" :span="2">{{ formatDateTimeSeconds(commentDetail.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间" :span="2">{{ formatDateTimeSeconds(commentDetail.updated_at) || '-' }}</el-descriptions-item>
              <el-descriptions-item label="评论位置" :span="2">
                <template v-if="commentDetail.work">
                  <el-tag size="small" type="warning" style="margin-right:6px;">作品</el-tag>
                  <el-link type="primary" :href="getCommentWorkPath(commentDetail)" target="_blank" @click.prevent="openCommentTarget(commentDetail)">{{ commentDetail.work.name }}</el-link>
                  <span style="color:#999;margin-left:8px;">(ID: {{ commentDetail.work.id }}
                    <template v-if="commentDetail.work.codemao_work_id"> / 编程猫: {{ commentDetail.work.codemao_work_id }}</template>)
                  </span>
                </template>
                <template v-else-if="commentDetail.post || commentDetail.post_id">
                  <el-tag size="small" type="success" style="margin-right:6px;">帖子</el-tag>
                  <el-link type="primary" :href="getCommentPostPath(commentDetail)" target="_blank" @click.prevent="openCommentTarget(commentDetail)">{{ commentDetail.post?.title || ('帖子 #' + commentDetail.post_id) }}</el-link>
                  <span style="color:#999;margin-left:8px;">(ID: {{ commentDetail.post?.id || commentDetail.post_id }})</span>
                </template>
                <span v-else>未知位置</span>
              </el-descriptions-item>
              <el-descriptions-item label="父评论ID">{{ commentDetail.parent_id || '无（顶层评论）' }}</el-descriptions-item>
              <el-descriptions-item label="回复对象">
                <template v-if="commentDetail.reply_to_user">
                  {{ commentDetail.reply_to_user.nickname || commentDetail.reply_to_user.username }}
                  (ID: {{ commentDetail.reply_to_user.id }})
                </template>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="评论内容" :span="2">
                <div class="r-admin--comment_detail_content">{{ commentDetail.content }}</div>
              </el-descriptions-item>
            </el-descriptions>

            <div class="r-admin--comment_detail_actions">
              <el-button
                v-if="commentDetail.status !== 'deleted'"
                :type="commentDetail.status === 'active' ? 'warning' : 'success'"
                @click="toggleCommentStatus(commentDetail)"
              >
                {{ commentDetail.status === 'active' ? '隐藏评论' : '显示评论' }}
              </el-button>
              <el-button
                v-if="commentDetail.status !== 'deleted'"
                type="danger"
                @click="handleDeleteComment(commentDetail)"
              >删除评论</el-button>
              <el-button type="primary" plain @click="openCommentTarget(commentDetail)" :disabled="!commentDetail.work && !commentDetail.post && !commentDetail.post_id">
                打开所在页面
              </el-button>
              <el-button @click="commentDetailVisible = false">关闭</el-button>
            </div>
          </div>
        </el-dialog>

        <!-- 帖子管理 -->
        <div v-if="activeMenu === 'posts'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">帖子管理</h2>
          </div>
          <Posts />
        </div>
        
        <!-- 举报管理 -->
        <div v-if="activeMenu === 'reports'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">举报管理</h2>
            <div class="r-admin--filters">
              <el-select v-model="reportTypeFilter" placeholder="类型" style="width: 100px" clearable @change="searchReports">
                <el-option label="全部" value="" />
                <el-option label="作品" value="work" />
                <el-option label="评论" value="comment" />
                <el-option label="用户" value="user" />
              </el-select>
              <el-select v-model="reportStatusFilter" placeholder="状态" style="width: 100px" clearable @change="searchReports">
                <el-option label="全部" value="" />
                <el-option label="待处理" value="pending" />
                <el-option label="处理中" value="processing" />
                <el-option label="已解决" value="resolved" />
                <el-option label="已驳回" value="rejected" />
              </el-select>
              <el-button type="primary" @click="searchReports">搜索</el-button>
              <el-button type="success" @click="batchAIReview" :loading="batchAILoading" :disabled="selectedReports.length === 0">
                <el-icon><Cpu /></el-icon> 批量AI审核 ({{ selectedReports.length }})
              </el-button>
              <el-button type="primary" @click="showDuplicateReports" :loading="loadingDuplicates">
                <el-icon><CopyDocument /></el-icon> 合并重复举报
              </el-button>
              <el-button type="warning" @click="autoHandleByAI" :loading="autoHandleLoading" :disabled="reports.filter(r => r.aiResult && r.status === 'pending').length === 0">
                一键按AI处理
              </el-button>
            </div>
          </div>
          <el-table :data="reports" v-loading="loadingReports" stripe @selection-change="handleReportSelection">
            <el-table-column type="selection" width="50" />
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="type" label="类型" width="80">
              <template #default="{ row }">
                <el-tag size="small">{{ row.type === 'work' ? '作品' : row.type === 'comment' ? '评论' : '用户' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="举报目标" min-width="150">
              <template #default="{ row }">
                <div v-if="row.target">
                  <span v-if="row.type === 'work'">{{ row.target.name }}</span>
                  <span v-else-if="row.type === 'comment'">{{ row.target.content?.substring(0, 30) }}...</span>
                  <span v-else-if="row.type === 'post'">{{ row.target.title }}</span>
                  <span v-else-if="row.type === 'user'">{{ row.target.nickname || row.target.username }}</span>
                </div>
                <!-- 修复:目标已被删除时显示占位符 -->
                <span v-else style="color: #c0c4cc; font-size: 12px;">{{ row.type === 'user' ? '用户不存在' : '内容已删除' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="举报人" width="120">
              <template #default="{ row }">
                <span v-if="row.reporter" class="r-admin--clickable_name" @click="goToUser(row.reporter)">
                  {{ row.reporter.nickname || row.reporter.username }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="被举报人" width="120">
              <template #default="{ row }">
                <span v-if="row.type === 'user' && row.target" class="r-admin--clickable_name" @click="goToUser(row.target)">
                  {{ row.target.nickname || row.target.username }}
                </span>
                <span v-else-if="row.type === 'post' && row.target" class="r-admin--clickable_name" @click="goToUserById(row.target.user_id)">
                  {{ row.target.author?.nickname || row.target.author?.username || '-' }}
                </span>
                <span v-else-if="row.type === 'work' && row.target" class="r-admin--clickable_name" @click="goToUserById(row.target.user_id)">
                  {{ row.target.author?.nickname || row.target.author?.username || '-' }}
                </span>
                <span v-else-if="row.type === 'comment' && row.target" class="r-admin--clickable_name" @click="goToUserById(row.target.user_id)">
                  {{ row.target.author?.nickname || row.target.author?.username || '-' }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" min-width="120" />
            <el-table-column label="AI审核" width="220">
              <template #default="{ row }">
                <div v-if="row.aiResult" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <el-tooltip v-if="row.aiResult.isFallback" placement="top">
                    <template #content>
                      <div>AI未配置，使用敏感词检测</div>
                      <div v-if="row.aiResult.violations?.length">命中: {{ row.aiResult.violations.join(', ') }}</div>
                      <div v-else>未命中任何敏感词</div>
                    </template>
                    <el-tag type="warning" size="small">敏感词</el-tag>
                  </el-tooltip>
                  <el-tag :type="row.aiResult.riskLevel === 'high' ? 'danger' : row.aiResult.riskLevel === 'medium' ? 'warning' : 'success'" size="small">
                    {{ row.aiResult.riskLevel === 'high' ? '高风险' : row.aiResult.riskLevel === 'medium' ? '中风险' : '低风险' }}
                  </el-tag>
                  <span v-if="row.aiResult.violations?.length" style="font-size: 11px; color: #e6a23c;">命中{{ row.aiResult.violations.length }}个</span>
                  <el-button size="small" @click="quickAIReview(row)" :loading="row.aiLoading" style="padding: 0;">重审</el-button>
                </div>
                <el-button v-else size="small" @click="quickAIReview(row)" :loading="row.aiLoading">审核</el-button>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="reportStatusMap[row.status]" size="small">
                  {{ reportStatusText[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="处理人" width="120">
              <template #default="{ row }">
                <span
                  v-if="row.handler"
                  class="r-admin--clickable_name"
                  @click="goToUser(row.handler)"
                >
                  {{ row.handler.nickname || row.handler.username }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="110">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="showReportDialog(row)">处理</el-button>
                <el-dropdown trigger="click" @command="(cmd) => quickHandle(row, cmd)">
                  <el-button size="small" link type="info">更多</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="delete">删除内容</el-dropdown-item>
                      <el-dropdown-item command="reject">驳回举报</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
          </el-table>
          <div class="r-admin--pagination">
            <el-pagination
              v-model:current-page="reportPage"
              v-model:page-size="reportPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="reportTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="fetchReports"
              @size-change="fetchReports"
            />
          </div>
        </div>
        
        <!-- 角色管理 -->
        <div v-if="activeMenu === 'roles'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">角色管理</h2>
          </div>
          
          <h3 style="margin-bottom: 16px;">角色权限说明</h3>
          <el-table :data="roles" stripe style="margin-bottom: 24px;">
            <el-table-column prop="name" label="角色名称" width="120" />
            <el-table-column prop="key" label="角色标识" width="120" />
            <el-table-column prop="level" label="等级" width="80" />
            <el-table-column label="权限列表">
              <template #default="{ row }">
                <el-tag v-for="p in row.permissions.slice(0, 5)" :key="p" size="small" style="margin-right: 4px; margin-bottom: 4px;">{{ p }}</el-tag>
                <el-tag v-if="row.permissions.length > 5" size="small" type="info">+{{ row.permissions.length - 5 }} 更多</el-tag>
              </template>
            </el-table-column>
          </el-table>
          
          <h3 style="margin-bottom: 16px;">管理员列表</h3>
          <el-table :data="adminUsers" v-loading="loadingAdminUsers" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column label="用户" min-width="150">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img :src="row.avatar || defaultAvatar" style="width: 32px; height: 32px; border-radius: 50%;" referrerpolicy="no-referrer" />
                  <span>{{ row.nickname || row.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="role" label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="getRoleTagType(row.role)">{{ getRoleName(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'active' ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button size="small" @click="showRoleDialog(row)" :disabled="row.id === userStore.user?.id">修改角色</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        
        <!-- 权限设置 -->
        <div v-if="activeMenu === 'permissions'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">权限设置</h2>
            <el-button @click="fetchRolePermissions">刷新</el-button>
          </div>
          
          <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
            超级管理员可以自定义各角色的权限。修改权限后立即生效。
          </el-alert>
          
          <el-tabs v-model="activeRoleTab" @tab-change="handleRoleTabChange">
            <el-tab-pane v-for="role in rolePermissionsList" :key="role.key" :label="role.name" :name="role.key" :disabled="role.key === 'superadmin'">
              <div v-if="role.key !== 'superadmin'" style="padding: 16px 0;">
                <div style="margin-bottom: 16px; display: flex; gap: 16px; align-items: center;">
                  <span>角色名称：</span>
                  <el-input v-model="editingRole.name" style="width: 150px;" />
                  <span>等级：</span>
                  <el-input-number v-model="editingRole.level" :min="0" :max="10" />
                  <el-button type="primary" @click="saveRolePermissions">保存修改</el-button>
                  <el-button @click="resetRolePermissions(role.key)">重置默认</el-button>
                </div>
                
                <el-divider>权限列表</el-divider>
                
                <div v-for="category in permissionCategories" :key="category" style="margin-bottom: 16px;">
                  <h4 style="margin-bottom: 8px; color: #666;">{{ category }}</h4>
                  <el-checkbox-group v-model="editingRole.permissions">
                    <el-checkbox v-for="perm in getPermissionsByCategory(category)" :key="perm.key" :label="perm.key">
                      {{ perm.name }}
                    </el-checkbox>
                  </el-checkbox-group>
                </div>
              </div>
              <div v-else style="padding: 16px 0; color: #999;">
                超级管理员拥有所有权限，无需配置。
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
        
        <!-- 轮播图管理 -->
        <div v-if="activeMenu === 'banners'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">轮播图管理</h2>
            <div>
              <el-button type="success" @click="crawlBanners" :loading="crawlingBanners">从编程猫爬取</el-button>
              <el-button type="primary" @click="showBannerDialog()">添加轮播图</el-button>
            </div>
          </div>
          <el-table :data="banners" v-loading="loadingBanners" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column label="图片" width="150">
              <template #default="{ row }">
                <img v-if="getSafeExternalUrl(row.image_url)" :src="getSafeExternalUrl(row.image_url)" style="width: 120px; height: 60px; object-fit: cover; border-radius: 4px;" referrerpolicy="no-referrer" />
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="150" />
            <el-table-column prop="link_url" label="链接" min-width="200">
              <template #default="{ row }">
                <a v-if="getSafeExternalUrl(row.link_url)" :href="getSafeExternalUrl(row.link_url)" target="_blank" rel="noopener noreferrer" style="color: #409eff;">{{ row.link_url }}</a>
                <span v-else>{{ row.link_url || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="80" />
            <el-table-column prop="is_active" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                  {{ row.is_active ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <div class="r-admin--ops">
                  <el-button size="small" type="primary" @click="showBannerDialog(row)">编辑</el-button>
                  <el-button size="small" type="danger" @click="handleDeleteBanner(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
        
        <!-- IP封禁 -->
        <div v-if="activeMenu === 'ipbans'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">IP封禁管理</h2>
            <el-button type="primary" @click="showIpBanDialog()">添加封禁</el-button>
          </div>
          <el-table :data="ipBans" v-loading="loadingIpBans" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="ip" label="IP地址" width="150" :formatter="(row) => row.ip || '未知'" />
            <el-table-column prop="reason" label="封禁原因" min-width="200" />
            <el-table-column label="操作人" width="120">
              <template #default="{ row }">
                <span v-if="row.bannedByUser">{{ row.bannedByUser.nickname || row.bannedByUser.username }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="expires_at" label="过期时间" width="150">
              <template #default="{ row }">
                {{ row.expires_at ? formatDate(row.expires_at) : '永久' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="isIpBanActive(row) ? 'danger' : 'success'" size="small">
                  {{ isIpBanActive(row) ? '生效中' : '已过期' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="110">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="danger" @click="handleRemoveIpBan(row)" :disabled="!isIpBanActive(row)">解封</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="r-admin--pagination">
            <el-pagination
              v-model:current-page="ipBanPage"
              v-model:page-size="ipBanPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="ipBanTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="fetchIpBans"
              @size-change="fetchIpBans"
            />
          </div>
        </div>
        
        <!-- 工作室管理 -->
        <div v-if="activeMenu === 'studios'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">工作室管理</h2>
          </div>
          
          <el-table :data="studios" v-loading="loadingStudios" stripe>
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column prop="owner" label="创建者" width="120">
              <template #default="{ row }">
                {{ row.owner?.nickname || row.owner?.username }}
              </template>
            </el-table-column>
            <el-table-column prop="member_count" label="成员数" width="80" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
                  {{ row.status === 'active' ? '正常' : '已禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160">
              <template #default="{ row }">
                {{ new Date(row.created_at).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="showStudioDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <el-pagination
            v-model:current-page="studiosPage"
            :page-size="20"
            :total="studiosTotal"
            layout="total, prev, pager, next"
            @current-change="fetchStudios"
            style="margin-top: 20px; justify-content: flex-end;"
          />
        </div>
        
        <!-- 工作室详情弹窗 -->
        <el-dialog v-model="studioDetailVisible" title="工作室详情" width="980px" destroy-on-close class="r-admin--studio_dialog">
          <div v-if="studioDetailLoading" style="text-align: center; padding: 40px;">
            <el-icon class="is-loading" :size="40"><Loading /></el-icon>
          </div>
          <div v-else-if="studioDetail" class="r-admin--studio_detail">
            <div class="r-admin--studio_detail_header">
              <img :src="studioDetail.studio.cover || studioDetail.studio.logo || defaultStudioCover" class="r-admin--studio_detail_logo" referrerpolicy="no-referrer" />
              <div class="r-admin--studio_detail_info">
                <h3>{{ studioDetail.studio.name }}</h3>
                <p>{{ studioDetail.studio.description || '暂无描述' }}</p>
                <div class="r-admin--studio_detail_tags">
                  <el-tag :type="studioDetail.studio.status === 'active' ? 'success' : 'danger'">
                    {{ studioDetail.studio.status === 'active' ? '正常' : '已禁用' }}
                  </el-tag>
                  <el-tag type="info">成员: {{ studioDetail.studio.member_count }}</el-tag>
                  <el-tag type="info">作品: {{ studioDetail.studio.work_count }}</el-tag>
                  <el-tag type="warning">管理积分: {{ studioDetail.studio.points || 0 }}</el-tag>
                  <el-tag type="success">作品评分: {{ studioDetail.studio.total_score || 0 }}</el-tag>
                </div>
              </div>
              <div class="r-admin--studio_detail_actions">
                <el-button type="warning" @click="openStudioPointsDialog(studioDetail.studio)">调整积分</el-button>
                <el-button @click="openStudioEditDialog(studioDetail.studio)">编辑资料</el-button>
                <el-button :type="studioDetail.studio.status === 'active' ? 'danger' : 'success'" @click="handleStudioStatus(studioDetail.studio); studioDetailVisible = false;">
                  {{ studioDetail.studio.status === 'active' ? '禁用工作室' : '启用工作室' }}
                </el-button>
                <el-button type="danger" @click="handleDeleteStudio(studioDetail.studio); studioDetailVisible = false;">删除工作室</el-button>
              </div>
            </div>
            
            <el-tabs>
              <el-tab-pane label="正式成员">
                <el-table :data="studioDetail.members" size="small" max-height="400">
                  <el-table-column prop="user.id" label="用户ID" width="80" />
                  <el-table-column prop="user.nickname" label="昵称" width="120">
                    <template #default="{ row }">{{ row.user?.nickname || row.user?.username }}</template>
                  </el-table-column>
                  <el-table-column prop="user.username" label="用户名" width="120" />
                  <el-table-column prop="role" label="角色" width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.role === 'owner' ? 'danger' : row.role === 'admin' ? 'warning' : 'info'">
                        {{ row.role === 'owner' ? '室长' : row.role === 'admin' ? '管理员' : '成员' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="joined_at" label="加入时间" width="110">
                    <template #default="{ row }">{{ formatDate(row.joined_at) }}</template>
                  </el-table-column>
                  <el-table-column label="操作" width="120" fixed="right">
                    <template #default="{ row }">
                      <el-button v-if="row.role !== 'owner'" size="small" type="primary" @click="changeMemberRole(row)">改角色</el-button>
                      <el-button v-if="row.role !== 'owner'" size="small" type="danger" @click="removeMember(row)">移除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!studioDetail.members?.length" description="暂无成员" />
              </el-tab-pane>
              <el-tab-pane :label="`待审核申请(${studioDetail.pendingMembers?.length || 0})`">
                <el-table :data="studioDetail.pendingMembers" size="small" max-height="400">
                  <el-table-column prop="user.id" label="用户ID" width="80" />
                  <el-table-column prop="user.nickname" label="昵称" width="120">
                    <template #default="{ row }">{{ row.user?.nickname || row.user?.username }}</template>
                  </el-table-column>
                  <el-table-column prop="user.username" label="用户名" width="120" />
                  <el-table-column prop="joined_at" label="申请时间" width="110">
                    <template #default="{ row }">{{ formatDate(row.joined_at) }}</template>
                  </el-table-column>
                  <el-table-column label="操作" width="150" fixed="right">
                    <template #default="{ row }">
                      <el-button size="small" type="primary" @click="handleApproveMember(row)">通过</el-button>
                      <el-button size="small" type="danger" @click="handleRejectMember(row)">拒绝</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!studioDetail.pendingMembers?.length" description="暂无待审核申请" />
              </el-tab-pane>
              <el-tab-pane label="工作室作品">
                <el-table :data="studioDetail.works" size="small" max-height="400">
                  <el-table-column prop="id" label="ID" width="60" />
                  <el-table-column prop="name" label="作品名称" min-width="150" show-overflow-tooltip />
                  <el-table-column prop="author.nickname" label="作者" width="100" />
                  <el-table-column prop="view_times" label="浏览" width="80" />
                  <el-table-column prop="praise_times" label="点赞" width="80" />
                  <el-table-column prop="studio_score" label="作品评分" width="100" />
                  <el-table-column prop="created_at" label="添加时间" width="110">
                    <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
                  </el-table-column>
                  <el-table-column label="操作" width="150">
                    <template #default="{ row }">
                      <el-button size="small" type="warning" @click="setStudioWorkScore(row)">评分</el-button>
                      <el-button size="small" type="danger" @click="removeStudioWork(row)">移除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!studioDetail.works?.length" description="暂无作品" />
              </el-tab-pane>
              <el-tab-pane :label="`积分流水(${studioDetail.pointLogs?.length || 0})`">
                <el-table :data="studioDetail.pointLogs || []" size="small" max-height="400">
                  <el-table-column prop="created_at" label="时间" width="170">
                    <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
                  </el-table-column>
                  <el-table-column label="管理员" width="130">
                    <template #default="{ row }">{{ row.admin?.nickname || row.admin?.username || `管理员#${row.admin?.id || '-'}` }}</template>
                  </el-table-column>
                  <el-table-column label="变动" width="90">
                    <template #default="{ row }"><el-tag :type="row.delta >= 0 ? 'success' : 'danger'">{{ row.delta >= 0 ? '+' : '' }}{{ row.delta }}</el-tag></template>
                  </el-table-column>
                  <el-table-column label="变动前后" width="120">
                    <template #default="{ row }">{{ row.points_before }} → {{ row.points_after }}</template>
                  </el-table-column>
                  <el-table-column prop="note" label="备注" min-width="220" />
                  <el-table-column prop="ip_address" label="操作 IP" width="150" />
                </el-table>
                <el-empty v-if="!studioDetail.pointLogs?.length" description="暂无积分变动记录" />
              </el-tab-pane>
              <el-tab-pane label="基本信息">
                <el-descriptions :column="2" border size="small">
                  <el-descriptions-item label="工作室ID">{{ studioDetail.studio.id }}</el-descriptions-item>
                  <el-descriptions-item label="名称">{{ studioDetail.studio.name }}</el-descriptions-item>
                  <el-descriptions-item label="室长">{{ studioDetail.owner?.nickname || studioDetail.owner?.username }}</el-descriptions-item>
                  <el-descriptions-item label="成员数">{{ studioDetail.studio.member_count }}</el-descriptions-item>
                  <el-descriptions-item label="作品数">{{ studioDetail.studio.work_count }}</el-descriptions-item>
                  <el-descriptions-item label="状态">{{ studioDetail.studio.status === 'active' ? '正常' : '已禁用' }}</el-descriptions-item>
                  <el-descriptions-item label="创建时间">{{ formatDateTime(studioDetail.studio.created_at) }}</el-descriptions-item>
                  <el-descriptions-item label="更新时间">{{ formatDateTime(studioDetail.studio.updated_at) }}</el-descriptions-item>
                  <el-descriptions-item label="描述" :span="2">{{ studioDetail.studio.description || '暂无描述' }}</el-descriptions-item>
                </el-descriptions>
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-dialog>

        <el-dialog v-model="studioPointsDialogVisible" title="调整工作室管理积分" width="520px" class="r-admin--studio_points_dialog">
          <el-form label-position="top">
            <el-form-item label="工作室">
              <el-input :model-value="studioPointsTarget?.name" disabled />
            </el-form-item>
            <el-form-item label="调整方式" required>
              <el-radio-group v-model="studioPointsForm.action">
                <el-radio-button label="add">加分</el-radio-button>
                <el-radio-button label="subtract">扣分</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="分值" required>
              <el-input-number v-model="studioPointsForm.points" :min="1" :max="10000" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="操作备注（必填，将永久保留）" required>
              <el-input v-model="studioPointsForm.note" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="请具体说明加分或扣分原因，至少 5 个字符" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="studioPointsDialogVisible = false">取消</el-button>
            <el-button type="warning" :loading="studioPointsSubmitting" @click="submitStudioPoints">确认调整</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="studioEditDialogVisible" title="编辑工作室资料" width="560px">
          <el-form label-position="top">
            <el-form-item label="工作室名称" required><el-input v-model="studioEditForm.name" maxlength="100" show-word-limit /></el-form-item>
            <el-form-item label="工作室介绍"><el-input v-model="studioEditForm.description" type="textarea" :rows="4" maxlength="1000" show-word-limit /></el-form-item>
            <el-form-item label="加入方式">
              <el-select v-model="studioEditForm.join_type" style="width:100%"><el-option label="自由加入" value="public" /><el-option label="申请加入" value="apply" /><el-option label="仅限邀请" value="invite" /></el-select>
            </el-form-item>
            <el-form-item label="可见性"><el-switch v-model="studioEditForm.is_public" active-text="公开" inactive-text="私密" /></el-form-item>
          </el-form>
          <template #footer><el-button @click="studioEditDialogVisible = false">取消</el-button><el-button type="primary" :loading="studioEditSubmitting" @click="submitStudioEdit">保存修改</el-button></template>
        </el-dialog>
        
        <!-- 作品爬取 -->
                <div v-if="activeMenu === 'developer-apps'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">开发者应用管理</h2>
            <div style="display:flex;gap:8px;align-items:center;">
              <el-select v-model="developerAppFilter.status" clearable placeholder="状态" style="width:120px" @change="() => { developerAppFilter.page = 1; fetchDeveloperApps() }">
                <el-option label="待审核" value="pending" />
                <el-option label="已通过" value="active" />
                <el-option label="已拒绝" value="rejected" />
                <el-option label="已停用" value="suspended" />
              </el-select>
              <el-input v-model="developerAppFilter.keyword" clearable placeholder="搜索应用名" style="width:180px" @keyup.enter="fetchDeveloperApps" />
              <el-button type="primary" @click="fetchDeveloperApps">刷新</el-button>
            </div>
          </div>
          <el-table :data="developerApps" v-loading="loadingDeveloperApps" empty-text="暂无应用">
            <el-table-column prop="name" label="应用" min-width="140" />
            <el-table-column prop="client_id" label="client_id" min-width="160">
              <template #default="{ row }"><code style="font-size:12px">{{ row.client_id }}</code></template>
            </el-table-column>
            <el-table-column label="所有者" width="140">
              <template #default="{ row }">{{ row.owner?.nickname || row.owner?.username || '-' }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="{pending:'warning',active:'success',rejected:'danger',suspended:'info'}[row.status] || 'info'">
                  {{ {pending:'待审核',active:'已通过',rejected:'已拒绝',suspended:'已停用'}[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="权限" min-width="160">
              <template #default="{ row }">
                <el-tag v-for="s in (row.scopes_requested || [])" :key="s" size="small" style="margin:0 4px 4px 0">{{ s }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="管理员备注" prop="review_note" min-width="150" show-overflow-tooltip />
            <el-table-column label="审核信息" width="180">
              <template #default="{ row }">
                <div v-if="row.reviewed_by" style="font-size:12px;line-height:1.5">
                  <div>{{ row.reviewer?.nickname || row.reviewer?.username || 'ID:' + row.reviewed_by }}</div>
                  <div style="color:#999">{{ row.reviewed_at ? formatDate(row.reviewed_at) : '' }}</div>
                </div>
                <span v-else style="color:#999">未审核</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="申请时间" width="150">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button size="small" :type="row.status === 'pending' ? 'warning' : 'primary'" @click="openDeveloperAppDetail(row)">{{ row.status === 'pending' ? '审核' : '详情' }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top:12px;display:flex;justify-content:flex-end;">
            <el-pagination
              background
              layout="total, prev, pager, next"
              :total="developerAppTotal"
              :page-size="developerAppFilter.pageSize"
              :current-page="developerAppFilter.page"
              @current-change="onDeveloperAppPageChange"
            />
          </div>
        </div>

        <el-dialog v-model="developerAppDetailVisible" title="开发者应用详情" width="820px" destroy-on-close>
          <div v-loading="loadingDeveloperAppDetail">
            <template v-if="developerAppDetail">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="应用名称">{{ developerAppDetail.name }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ developerAppStatusText(developerAppDetail.status) }}</el-descriptions-item>
                <el-descriptions-item label="所有者">{{ developerAppDetail.owner?.nickname || developerAppDetail.owner?.username || developerAppDetail.owner_user_id }}</el-descriptions-item>
                <el-descriptions-item label="Client ID"><code>{{ developerAppDetail.client_id }}</code></el-descriptions-item>
                <el-descriptions-item label="主页" :span="2">
                  <a v-if="getSafeExternalUrl(developerAppDetail.homepage_url)" :href="getSafeExternalUrl(developerAppDetail.homepage_url)" target="_blank" rel="noopener noreferrer">{{ developerAppDetail.homepage_url }}</a>
                  <span v-else-if="developerAppDetail.homepage_url">无效地址</span>
                  <span v-else>-</span>
                  <el-button v-if="developerAppDetail.homepage_url" link size="small" @click="copyText(developerAppDetail.homepage_url)" title="复制"><el-icon><CopyDocument /></el-icon></el-button>
                </el-descriptions-item>
                <el-descriptions-item label="描述" :span="2">{{ developerAppDetail.description || '-' }}</el-descriptions-item>
                <el-descriptions-item label="回调地址" :span="2">
                  <div v-if="developerAppDetail.redirect_uris && developerAppDetail.redirect_uris.length" style="display:flex;flex-direction:column;gap:4px">
                    <div v-for="uri in developerAppDetail.redirect_uris" :key="uri" style="display:flex;align-items:center;gap:6px">
                      <a :href="uri" target="_blank" rel="noopener" style="word-break:break-all">{{ uri }}</a>
                      <el-button link size="small" @click="copyText(uri)" title="复制"><el-icon><CopyDocument /></el-icon></el-button>
                    </div>
                  </div>
                  <span v-else>-</span>
                </el-descriptions-item>
                <el-descriptions-item label="申请权限" :span="2">{{ (developerAppDetail.scopes_requested || []).join(', ') || '-' }}</el-descriptions-item>
                <el-descriptions-item label="限流">{{ developerAppDetail.rate_limit_per_min }} 次/分钟</el-descriptions-item>
                <el-descriptions-item label="创建时间">{{ formatDateTime(developerAppDetail.created_at) }}</el-descriptions-item>
                <el-descriptions-item label="审核管理员">{{ developerAppDetail.reviewer?.nickname || developerAppDetail.reviewer?.username || (developerAppDetail.reviewed_by ? 'ID:' + developerAppDetail.reviewed_by : '未审核') }}</el-descriptions-item>
                <el-descriptions-item label="审核时间">{{ developerAppDetail.reviewed_at ? formatDateTime(developerAppDetail.reviewed_at) : '-' }}</el-descriptions-item>
                <el-descriptions-item label="审核备注" :span="2">{{ developerAppDetail.review_note || '-' }}</el-descriptions-item>
              </el-descriptions>
              <el-row :gutter="12" style="margin:16px 0">
                <el-col :span="6"><el-statistic title="累计授权" :value="developerAppDetail.stats?.authorizationCount || 0" /></el-col>
                <el-col :span="6"><el-statistic title="有效授权" :value="developerAppDetail.stats?.activeAuthorizationCount || 0" /></el-col>
                <el-col :span="6"><el-statistic title="有效令牌" :value="developerAppDetail.stats?.activeAccessTokenCount || 0" /></el-col>
                <el-col :span="6"><el-statistic title="API 调用" :value="developerAppDetail.stats?.callCount || 0" /></el-col>
              </el-row>
              <div style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <el-divider content-position="left" style="width:100%;margin:4px 0">审核操作</el-divider>
                <el-button size="small" type="success" :disabled="developerAppDetail.status === 'active'" @click="reviewDeveloperApp(developerAppDetail,'approve')">通过</el-button>
                <el-button size="small" type="danger" :disabled="developerAppDetail.status === 'rejected'" @click="reviewDeveloperApp(developerAppDetail,'reject')">拒绝</el-button>
                <el-button size="small" type="warning" :disabled="developerAppDetail.status === 'suspended'" @click="reviewDeveloperApp(developerAppDetail,'suspend')">停用</el-button>
                <el-divider content-position="left" style="width:100%;margin:4px 0">应用管理</el-divider>
                <el-button size="small" @click="editRateLimit(developerAppDetail)" title="修改限流"><el-icon><EditPen /></el-icon> 修改限流</el-button>
                <el-button size="small" type="warning" @click="confirmRevokeAllTokens(developerAppDetail)" title="强制撤销全部令牌"><el-icon><SwitchButton /></el-icon> 撤销全部令牌</el-button>
                <el-button size="small" type="primary" @click="confirmRegenerateSecret(developerAppDetail)" title="重新生成密钥"><el-icon><Key /></el-icon> 重新生成密钥</el-button>
                <el-button size="small" type="danger" @click="confirmDeleteApp(developerAppDetail)" title="删除应用"><el-icon><Delete /></el-icon> 删除应用</el-button>
              </div>
              <el-row :gutter="12" style="margin:12px 0">
                <el-col :span="6"><el-statistic title="总调用" :value="developerAppStats.total ?? 0" /></el-col>
                <el-col :span="6"><el-statistic title="失败调用" :value="developerAppStats.fails ?? 0" /></el-col>
                <el-col :span="6"><el-statistic title="近30日调用" :value="developerAppStats.last30d ?? 0" /></el-col>
                <el-col :span="6"><el-statistic title="审核记录" :value="developerAppDetail.stats?.auditCount ?? 0" /></el-col>
              </el-row>
              <div style="margin:8px 0 16px">
                <span style="font-size:13px;color:#666">每日调用趋势(近14日)</span>
                <div v-if="developerAppStatsDetail.perDay" style="margin-top:6px;overflow-x:auto">
                  <svg :viewBox="'0 0 ' + sparklineW + ' ' + sparklineH" preserveAspectRatio="none" style="width:100%;height:60px">
                    <polyline :points="sparklinePoints" fill="none" stroke="#409eff" stroke-width="2" />
                  </svg>
                </div>
                <span v-else style="font-size:12px;color:#999">暂无数据</span>
              </div>
              <el-tabs v-model="developerAppDetailTab">
                <el-tab-pane label="API 调用记录" name="calls">
                  <el-table :data="developerAppCalls" v-loading="loadingDeveloperAppCalls" size="small" empty-text="暂无调用记录（部署本版本后开始记录）">
                    <el-table-column type="expand" width="42">
                      <template #default="{ row }">
                        <div style="padding:8px 24px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
                          <div><b>请求内容</b><pre style="white-space:pre-wrap;word-break:break-all;background:#f6f7f9;padding:8px;border-radius:6px;max-height:220px;overflow:auto">{{ formatCallPayload(row.request) }}</pre></div>
                          <div><b>返回内容</b><pre style="white-space:pre-wrap;word-break:break-all;background:#f6f7f9;padding:8px;border-radius:6px;max-height:220px;overflow:auto">{{ formatCallPayload(row.response) }}</pre></div>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column prop="created_at" label="时间" width="170"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
                    <el-table-column prop="action" label="类型" width="100"><template #default="{ row }">{{ row.action === 'developer_api_fail' ? '失败/安全' : '成功调用' }}</template></el-table-column>
                    <el-table-column prop="method" label="方法" width="80" />
                    <el-table-column prop="path" label="接口" min-width="230" show-overflow-tooltip />
                    <el-table-column prop="status" label="状态码" width="90" />
                    <el-table-column prop="oauth_user_id" label="调用用户ID" width="110" />
                    <el-table-column prop="ip_address" label="IP" width="140" />
                  </el-table>
                  <el-pagination v-if="developerAppCallTotal > developerAppCallPageSize" layout="total, prev, pager, next" :total="developerAppCallTotal" :page-size="developerAppCallPageSize" :current-page="developerAppCallPage" @current-change="fetchDeveloperAppCalls" style="margin-top:12px;justify-content:flex-end" />
                </el-tab-pane>
                <el-tab-pane label="审核历史" name="audit">
                  <el-table :data="developerAppAuditLogs" v-loading="loadingDeveloperAppAuditLogs" size="small" empty-text="暂无审核记录">
                    <el-table-column prop="created_at" label="时间" width="170"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
                    <el-table-column prop="action" label="操作" width="140">
                      <template #default="{ row }">{{ auditActionText(row.action) }}</template>
                    </el-table-column>
                    <el-table-column prop="from_status" label="原状态" width="100">
                      <template #default="{ row }">{{ statusText(row.from_status) }}</template>
                    </el-table-column>
                    <el-table-column prop="to_status" label="新状态" width="100">
                      <template #default="{ row }">{{ statusText(row.to_status) }}</template>
                    </el-table-column>
                    <el-table-column prop="rate_limit_before" label="限流前" width="90" />
                    <el-table-column prop="rate_limit_after" label="限流后" width="90" />
                    <el-table-column prop="review_note" label="备注" min-width="160" show-overflow-tooltip />
                    <el-table-column prop="actor" label="操作人" width="140">
                      <template #default="{ row }">{{ row.actor?.nickname || row.actor?.username || '-' }}</template>
                    </el-table-column>
                  </el-table>
                  <el-pagination v-if="developerAppAuditLogsTotal > 10" layout="total, prev, pager, next" :total="developerAppAuditLogsTotal" :page-size="10" :current-page="developerAppAuditLogsPage" @current-change="fetchDeveloperAppAuditLogs" style="margin-top:12px;justify-content:flex-end" />
                </el-tab-pane>
              </el-tabs>
            </template>
          </div>
        </el-dialog>

        <div v-if="activeMenu === 'crawl'" class="r-admin--section">
          <h2 class="r-admin--title">作品爬取</h2>
          
          <div class="r-admin--crawl_section">
            <h3>单个作品爬取</h3>
            <div class="r-admin--crawl_form">
              <el-input v-model="crawlWorkId" placeholder="输入编程猫作品ID" style="width: 200px" />
              <el-button type="primary" @click="handleCrawlWork" :loading="crawling">爬取</el-button>
            </div>
          </div>
          
          <div class="r-admin--crawl_section">
            <h3>按用户ID爬取</h3>
            <p class="r-admin--crawl_desc">爬取指定用户的所有作品（最多100个）</p>
            <div class="r-admin--crawl_form">
              <el-input v-model="crawlUserId" placeholder="输入编程猫用户ID" style="width: 200px" />
              <el-button type="primary" @click="handleCrawlUser" :loading="crawlingUser">爬取用户作品</el-button>
            </div>
          </div>
          
          <div class="r-admin--crawl_section">
            <h3>批量爬取热门作品</h3>
            <p class="r-admin--crawl_desc">从编程猫热门、最新、发现板块获取作品</p>
            <div class="r-admin--crawl_form">
              <el-input-number v-model="crawlCount" :min="1" :max="100" />
              <el-button type="primary" @click="handleCrawlHot" :loading="crawlingHot">一键爬取</el-button>
            </div>
          </div>
          
          <div class="r-admin--crawl_section">
            <h3>爬取论坛帖子作品</h3>
            <p class="r-admin--crawl_desc">搜索论坛帖子，从帖子中提取作品ID并爬取</p>
            <div class="r-admin--crawl_form">
              <el-input v-model="crawlKeyword" placeholder="搜索关键词" style="width: 150px" />
              <el-button type="primary" @click="handleCrawlPosts" :loading="crawlingPosts">爬取帖子作品</el-button>
            </div>
          </div>
          
          <div v-if="crawlResult" class="r-admin--crawl_result">
            <el-alert :title="crawlResult" :type="crawlResultType" show-icon />
          </div>
          
          <div v-if="crawlLogs.length > 0" class="r-admin--crawl_logs">
            <div class="r-admin--crawl_logs_header">
              <h3>爬取日志</h3>
              <el-button size="small" @click="crawlLogs = []">清空</el-button>
            </div>
            <div class="r-admin--crawl_logs_content" ref="crawlLogsRef">
              <div v-for="(log, index) in crawlLogs" :key="index" 
                   :class="['r-admin--crawl_log_item', 'r-admin--crawl_log_' + log.type]">
                <span class="r-admin--crawl_log_time">{{ formatLogTime(log.time) }}</span>
                <span class="r-admin--crawl_log_msg">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 公告管理 -->
        <div v-if="activeMenu === 'announcements'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">公告管理</h2>
            <el-button type="primary" @click="showAnnouncementDialog()">发布公告</el-button>
          </div>
          <el-table :data="announcements" v-loading="loadingAnnouncements" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="title" label="标题" min-width="200" />
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="row.type === 'warning' ? 'danger' : row.type === 'update' ? 'warning' : 'info'">
                  {{ row.type === 'warning' ? '警告' : row.type === 'update' ? '更新' : '普通' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="颜色" width="90">
              <template #default="{ row }">
                <span class="r-admin--ann_color_dot" :style="{ background: announcementColorMap[row.color || 'blue'] }"></span>
                {{ announcementColorLabels[row.color || 'blue'] || '蓝色' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '显示' : '隐藏' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="author" label="发布者" width="120">
              <template #default="{ row }">{{ row.author?.nickname || row.author?.username }}</template>
            </el-table-column>
            <el-table-column prop="created_at" label="发布时间" width="150">
              <template #default="{ row }">{{ formatDateTimeSeconds(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <div class="r-admin--ops">
                  <el-button size="small" type="primary" @click="showAnnouncementDialog(row)">编辑</el-button>
                  <el-button size="small" type="danger" @click="handleDeleteAnnouncement(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
        
        <!-- 敏感词管理 -->
        <div v-if="activeMenu === 'sensitive'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">敏感词管理</h2>
            <div>
              <el-button @click="showSensitiveImportDialog">批量导入</el-button>
              <el-button type="primary" @click="showSensitiveDialog()">添加敏感词</el-button>
            </div>
          </div>
          <el-table :data="sensitiveWords" v-loading="loadingSensitiveWords" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="word" label="敏感词" min-width="150" />
            <el-table-column prop="category" label="分类" width="100" />
            <el-table-column prop="level" label="等级" width="100">
              <template #default="{ row }">
                <el-tag :type="row.level === 'high' ? 'danger' : (row.level === 'medium' ? 'warning' : 'info')">
                  {{ row.level === 'high' ? '高' : (row.level === 'medium' ? '中' : '低') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="replacement" label="替换词" width="100" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '禁用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <div style="display: flex; gap: 8px;">
                  <el-button size="small" type="primary" @click="showSensitiveDialog(row)">编辑</el-button>
                  <el-button size="small" type="danger" @click="handleDeleteSensitiveWord(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
            <el-pagination
              v-model:current-page="sensitivePage"
              :page-size="sensitivePageSize"
              :total="sensitiveTotal"
              layout="total, prev, pager, next"
              @current-change="handleSensitivePageChange"
            />
          </div>
        </div>
        
        <!-- 系统设置 -->
        <div v-if="activeMenu === 'configs'" class="r-admin--section r-admin--configs_page" v-loading="loadingConfigs">
          <!-- 固定顶部栏 -->
          <div class="r-admin--configs_sticky">
            <h2 class="r-admin--title">⚙️ 系统设置</h2>
            <el-button type="primary" size="large" @click="saveConfigs" :loading="savingConfigs">
              <el-icon class="el-icon--left"><Check /></el-icon>保存全部设置
            </el-button>
          </div>

          <div class="r-admin--configs_body">
            <div class="r-admin--config_section" id="config-mobile-version">
              <div class="r-admin--config_section_title"><span class="r-admin--config_section_icon">📱</span><span>App 版本管理</span></div>
              <el-form :model="configForm" label-width="110px" class="r-admin--config_form">
                <el-row :gutter="20">
                  <el-col :span="8"><el-form-item label="最低允许版本"><el-input v-model="configForm.mobile_android_min_version" placeholder="1.1.0" /><div style="font-size:12px;color:#909399;margin-top:4px">低于此版本将被强制拦截</div></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="线上最新版本"><el-input v-model="configForm.mobile_android_latest_version" placeholder="1.1.0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="APK 下载地址"><el-input v-model="configForm.mobile_android_update_url" placeholder="https://.../codedog-mobile.apk" /></el-form-item></el-col>
                </el-row>
                <el-form-item label="强制更新文案"><el-input v-model="configForm.mobile_android_update_message" maxlength="200" show-word-limit placeholder="当前版本已停止服务，请更新后继续使用。" /></el-form-item>
              </el-form>
            </div>
            <!-- AI 审核 -->
            <div class="r-admin--config_section" id="config-ai">
              <div class="r-admin--config_section_title">
                <span class="r-admin--config_section_icon">🤖</span>
                <span>AI 内容审核</span>
                <el-switch v-model="configForm.ai_enabled" active-text="开启" inactive-text="关闭" active-value="true" inactive-value="false" class="r-admin--config_section_switch" />
              </div>
              <el-form :model="configForm" label-width="90px" class="r-admin--config_form">
                <el-row :gutter="20">
                  <el-col :span="10">
                    <el-form-item label="API 地址">
                      <el-input v-model="configForm.ai_api_url" placeholder="例如 https://api.siliconflow.cn/v1" @blur="autoCompleteAiApiUrl" clearable />
                      <div style="font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4;">填到 /v1 即可（如 <code style="background:#f5f7fa;padding:0 4px;border-radius:3px;">https://api.siliconflow.cn/v1</code>），保存时自动补全 <code style="background:#f5f7fa;padding:0 4px;border-radius:3px;">/chat/completions</code>。已填完整 endpoint 不会改动。</div>
                    </el-form-item>
                  </el-col>
                  <el-col :span="6"><el-form-item label="模型"><el-input v-model="configForm.ai_model" placeholder="gpt-3.5-turbo" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="API Key"><el-input v-model="configForm.ai_api_key" show-password placeholder="sk-..." /></el-form-item></el-col>
                </el-row>
                <el-form-item label="审核提示词">
                  <div style="margin-bottom: 8px;"><el-button size="small" @click="useDefaultPrompt">填充默认提示词</el-button><el-button size="small" @click="showPromptHelp = true">查看帮助</el-button></div>
                  <el-input v-model="configForm.ai_prompt" type="textarea" :rows="8" placeholder="自定义审核提示词" />
                </el-form-item>
              </el-form>
            </div>

            <!-- 代理管理 -->
            <div class="r-admin--config_section" id="config-proxy">
              <div class="r-admin--config_section_title">
                <span class="r-admin--config_section_icon">🌐</span>
                <span>代理管理</span>
                <el-switch v-model="proxyConfig.enabled" active-text="开启" inactive-text="关闭" class="r-admin--config_section_switch" @change="saveProxyConfig" />
              </div>
              <el-form label-width="100px" class="r-admin--config_form">
                <el-form-item label="代理池API">
                  <el-input v-model="proxyConfig.poolUrl" placeholder="https://proxy.scdn.io/api/get_proxy.php?protocol=socks5&count=10" clearable />
                  <div style="font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4;">支持JSON格式(<code style="background:#f5f7fa;padding:0 4px;border-radius:3px;">data.proxies</code>、<code style="background:#f5f7fa;padding:0 4px;border-radius:3px;">data</code>、<code style="background:#f5f7fa;padding:0 4px;border-radius:3px;">proxies</code>、数组)或纯文本(每行一个)。<b style="color:#e6a23c;">填完后先点「保存配置」再抓取!</b></div>
                </el-form-item>
                <el-row :gutter="20" style="margin-bottom: 12px;">
                  <el-col :span="8">
                    <el-form-item label="代理协议">
                      <el-select v-model="proxyConfig.protocol" placeholder="自动" clearable>
                        <el-option label="HTTP" value="http" />
                        <el-option label="SOCKS5" value="socks5" />
                        <el-option label="SOCKS4" value="socks4" />
                      </el-select>
                      <div style="font-size: 12px; color: #909399; margin-top: 2px;">纯IP:端口格式时使用</div>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="自动刷新">
                      <el-select v-model="proxyConfig.autoRefresh" placeholder="关闭" @change="saveProxyAutoRefresh">
                        <el-option label="关闭" :value="0" />
                        <el-option label="每1分钟" :value="1" />
                        <el-option label="每3分钟" :value="3" />
                        <el-option label="每5分钟" :value="5" />
                        <el-option label="每10分钟" :value="10" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                  <el-button type="primary" @click="refreshProxy" :loading="proxyLoading">🔄 抓取并测试代理</el-button>
                  <el-button @click="testProxy" :loading="proxyTestLoading">🧪 测试当前代理</el-button>
                  <el-button @click="saveProxyConfig">💾 保存配置</el-button>
                </div>
                <div v-if="proxyTestResult" style="margin-bottom: 8px;">
                  <el-tag :type="proxyTestResult.ok ? 'success' : 'danger'" style="margin-right: 8px;">
                    {{ proxyTestResult.ok ? '可用' : '不可用' }}
                  </el-tag>
                  <span v-if="proxyTestResult.proxy || proxyTestResult.currentProxy" style="font-size: 13px; color: #606266; margin-right: 12px;">
                    代理: {{ proxyTestResult.proxy || proxyTestResult.currentProxy }}
                  </span>
                  <span v-if="proxyTestResult.latency" style="font-size: 13px; color: #606266;">
                    延迟: {{ proxyTestResult.latency }}ms
                  </span>
                  <span v-if="proxyTestResult.error" style="font-size: 13px; color: #f56c6c; margin-left: 8px;">
                    {{ proxyTestResult.error }}
                  </span>
                </div>
                <el-descriptions v-if="proxyConfig.enabled || proxyConfig.poolUrl" :column="3" border size="small">
                  <el-descriptions-item label="状态">
                    <el-tag :type="proxyConfig.enabled ? 'success' : 'info'" size="small">
                      {{ proxyConfig.enabled ? '已启用' : '已禁用' }}
                    </el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item label="当前代理">{{ proxyConfig.currentProxy || '未获取' }}</el-descriptions-item>
                  <el-descriptions-item label="可用数量">{{ proxyConfig.cacheCount || 0 }}</el-descriptions-item>
                </el-descriptions>
              </el-form>
            </div>

            <!-- 敏感词检测 -->
            <div class="r-admin--config_section" id="config-sensitive">
              <div class="r-admin--config_section_title">
                <span class="r-admin--config_section_icon">🛡️</span>
                <span>敏感词检测</span>
              </div>
              <el-form :model="configForm" label-width="90px" class="r-admin--config_form">
                <el-form-item label="检测模式">
                  <el-radio-group v-model="configForm.sensitive_check_mode">
                    <el-radio value="builtin">内置词库</el-radio>
                    <el-radio value="api">外部 API</el-radio>
                    <el-radio value="both">两者都用</el-radio>
                  </el-radio-group>
                  <div class="r-admin--config_hint">
                    <span v-if="configForm.sensitive_check_mode === 'builtin'">使用系统内置的 87,000+ 敏感词库</span>
                    <span v-else-if="configForm.sensitive_check_mode === 'api'">使用外部 API (wordcheck.txcxgzs.com) 进行检测</span>
                    <span v-else>同时使用内置词库和外部 API，取最高风险等级</span>
                  </div>
                </el-form-item>
                <el-form-item label="测试检测">
                  <div style="display: flex; gap: 8px;">
                    <el-input v-model="sensitiveTestText" placeholder="输入要测试的内容" />
                    <el-button type="primary" @click="testSensitiveCheck" :loading="sensitiveTestLoading">测试</el-button>
                  </div>
                  <div v-if="sensitiveTestResult" style="margin-top: 8px;">
                    <el-tag :type="sensitiveTestResult.riskLevel === 'high' ? 'danger' : sensitiveTestResult.riskLevel === 'medium' ? 'warning' : 'success'">
                      {{ sensitiveTestResult.riskLevel === 'high' ? '高风险' : sensitiveTestResult.riskLevel === 'medium' ? '中风险' : '低风险' }}
                    </el-tag>
                    <span style="margin-left: 8px; color: #909399; font-size: 12px;">
                      来源: {{ sensitiveTestResult.source === 'builtin' ? '内置词库' : sensitiveTestResult.source === 'api' ? '外部API' : '两者合并' }}
                    </span>
                    <div v-if="sensitiveTestResult.violations?.length" style="margin-top: 8px;">
                      <div style="color: #606266; font-size: 13px; margin-bottom: 4px;">命中敏感词：</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        <el-tooltip v-for="word in sensitiveTestResult.violations" :key="word" placement="top">
                          <template #content>
                            <span v-if="sensitiveTestResult.source === 'both' && sensitiveTestResult.violationSources?.[word]">
                              来源: {{ sensitiveTestResult.violationSources[word].map(s => s === 'builtin' ? '内置词库' : '外部API').join(' + ') }}
                            </span>
                            <span v-else>来源: {{ sensitiveTestResult.source === 'builtin' ? '内置词库' : '外部API' }}</span>
                          </template>
                          <el-tag
                            :type="sensitiveTestResult.source === 'both' && sensitiveTestResult.violationSources?.[word]?.length > 1 ? 'danger' : 'warning'"
                            size="small"
                            style="cursor: help;"
                          >
                            {{ word }}
                            <span v-if="sensitiveTestResult.source === 'both' && sensitiveTestResult.violationSources?.[word]?.length > 1" style="font-size: 10px;">✓✓</span>
                          </el-tag>
                        </el-tooltip>
                      </div>
                      <div v-if="sensitiveTestResult.source === 'both'" style="margin-top: 6px; font-size: 11px; color: #909399;">
                        <span style="color: #e6a23c;">✓✓</span> = 内置词库和外部API都命中
                      </div>
                    </div>
                    <div v-else style="margin-top: 4px; color: #67c23a; font-size: 13px;">✓ 未命中任何敏感词</div>
                  </div>
                </el-form-item>
              </el-form>
            </div>
            
            <el-dialog v-model="showPromptHelp" title="AI审核提示词帮助" width="700px">
              <div class="r-admin--prompt_help">
                <h4>占位符说明</h4>
                <ul>
                  <li><code>{{type}}</code> - 审核类型（作品/评论/帖子/用户）</li>
                  <li><code>{{content}}</code> - 待审核的内容文本</li>
                </ul>
                
                <h4>返回格式要求</h4>
                <p>AI必须返回JSON格式：</p>
                <pre>{
  "riskLevel": "low|medium|high",
  "violations": ["违规类型1", "违规类型2"],
  "reason": "判断理由",
  "recommendation": "pass|review|delete",
  "confidence": 0.95
}</pre>
                
                <h4>字段说明</h4>
                <ul>
                  <li><b>riskLevel</b>: low(正常), medium(轻微违规), high(严重违规)</li>
                  <li><b>violations</b>: 违规类型数组，如["广告", "辱骂"]</li>
                  <li><b>reason</b>: 判断理由说明</li>
                  <li><b>recommendation</b>: pass(通过), review(人工审核), delete(建议删除)</li>
                  <li><b>confidence</b>: 置信度 0-1</li>
                </ul>
                
                <h4>审核类型</h4>
                <ul>
                  <li>涉政、涉黄、涉暴、涉赌、诈骗、广告、辱骂、其他</li>
                </ul>
              </div>
            </el-dialog>
            
            <!-- 数据库配置 -->
            <div class="r-admin--config_section" id="config-db">
              <div class="r-admin--config_section_title">
                <span class="r-admin--config_section_icon">🗄️</span>
                <span>数据库配置</span>
              </div>
              <el-form :model="configForm" label-width="90px" class="r-admin--config_form">
                <el-form-item label="数据库类型">
                  <el-radio-group v-model="configForm.db_type">
                    <el-radio-button value="sqlite">SQLite</el-radio-button>
                    <el-radio-button value="mysql">MySQL</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <template v-if="configForm.db_type === 'mysql'">
                  <el-row :gutter="20">
                    <el-col :span="10"><el-form-item label="主机地址"><el-input v-model="configForm.mysql_host" placeholder="localhost" /></el-form-item></el-col>
                    <el-col :span="4"><el-form-item label="端口"><el-input v-model="configForm.mysql_port" placeholder="3306" /></el-form-item></el-col>
                    <el-col :span="10"><el-form-item label="数据库"><el-input v-model="configForm.mysql_database" placeholder="coding_dog" /></el-form-item></el-col>
                  </el-row>
                  <el-row :gutter="20">
                    <el-col :span="12"><el-form-item label="用户名"><el-input v-model="configForm.mysql_username" placeholder="root" /></el-form-item></el-col>
                    <el-col :span="12"><el-form-item label="密码"><el-input v-model="configForm.mysql_password" type="password" show-password placeholder="密码" /></el-form-item></el-col>
                  </el-row>
                </template>
              </el-form>
            </div>

            <!-- 数据库迁移 -->
            <div class="r-admin--config_section" id="config-migration">
              <div class="r-admin--config_section_title">
                <span class="r-admin--config_section_icon">📦</span>
                <span>数据库迁移</span>
              </div>
              <div class="r-admin--config_form">
                <el-alert type="warning" :closable="false" style="margin-bottom: 16px;">
                  <template #title>迁移会将源数据库数据复制到目标数据库。勾选"清空目标"将删除目标所有数据。完成后需手动重启服务器。</template>
                </el-alert>

                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-card shadow="hover" class="migration-card">
                      <template #header><span>📥 源数据库</span></template>
                  <el-form-item label="数据库类型">
                    <el-select v-model="migrationForm.sourceType" placeholder="选择源数据库">
                      <el-option label="SQLite" value="sqlite" />
                      <el-option label="MySQL" value="mysql" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="SQLite路径" v-if="migrationForm.sourceType === 'sqlite'">
                    <el-input v-model="migrationForm.sourceConfig.path" placeholder="./database.sqlite" />
                  </el-form-item>
                  <template v-if="migrationForm.sourceType === 'mysql'">
                    <el-form-item label="主机地址">
                      <el-input v-model="migrationForm.sourceConfig.host" placeholder="localhost" />
                    </el-form-item>
                    <el-form-item label="端口">
                      <el-input v-model="migrationForm.sourceConfig.port" placeholder="3306" />
                    </el-form-item>
                    <el-form-item label="数据库名">
                      <el-input v-model="migrationForm.sourceConfig.database" placeholder="coding_dog" />
                    </el-form-item>
                    <el-form-item label="用户名">
                      <el-input v-model="migrationForm.sourceConfig.user" placeholder="root" />
                    </el-form-item>
                    <el-form-item label="密码">
                      <el-input v-model="migrationForm.sourceConfig.password" type="password" show-password placeholder="密码" />
                    </el-form-item>
                  </template>
                  <el-button type="primary" size="small" @click="testSourceConnection" :loading="testingSource">
                    测试连接
                  </el-button>
                </el-card>
              </el-col>
              <el-col :span="12">
                <el-card shadow="hover" class="migration-card">
                  <template #header><span>📤 目标数据库</span></template>
                  <el-form-item label="数据库类型">
                    <el-select v-model="migrationForm.targetType" placeholder="选择目标数据库">
                      <el-option label="SQLite" value="sqlite" />
                      <el-option label="MySQL" value="mysql" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="SQLite路径" v-if="migrationForm.targetType === 'sqlite'">
                    <el-input v-model="migrationForm.targetConfig.path" placeholder="./database.sqlite" />
                  </el-form-item>
                  <template v-if="migrationForm.targetType === 'mysql'">
                    <el-form-item label="主机地址">
                      <el-input v-model="migrationForm.targetConfig.host" placeholder="localhost" />
                    </el-form-item>
                    <el-form-item label="端口">
                      <el-input v-model="migrationForm.targetConfig.port" placeholder="3306" />
                    </el-form-item>
                    <el-form-item label="数据库名">
                      <el-input v-model="migrationForm.targetConfig.database" placeholder="coding_dog" />
                    </el-form-item>
                    <el-form-item label="用户名">
                      <el-input v-model="migrationForm.targetConfig.user" placeholder="root" />
                    </el-form-item>
                    <el-form-item label="密码">
                      <el-input v-model="migrationForm.targetConfig.password" type="password" show-password placeholder="密码" />
                    </el-form-item>
                  </template>
                  <el-button type="primary" size="small" @click="testTargetConnection" :loading="testingTarget">
                    测试连接
                  </el-button>
                </el-card>
              </el-col>
            </el-row>
            
                <div style="margin-top: 16px; display: flex; align-items: center; gap: 16px;">
                  <el-checkbox v-model="migrationForm.clearExisting">清空目标数据库（删除所有现有数据）</el-checkbox>
                  <el-button type="danger" @click="startMigration" :loading="migrating" :disabled="!migrationForm.sourceType || !migrationForm.targetType">🚀 开始迁移</el-button>
                  <el-button @click="getMigrationStats" :loading="loadingStats">📊 查看数据统计</el-button>
                </div>

                <el-card v-if="migrationResult" shadow="hover" style="margin-top: 16px;">
                  <template #header><span>📊 迁移结果</span></template>
                  <el-descriptions :column="4" border size="small">
                    <el-descriptions-item label="用户">{{ migrationResult.users || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="作品">{{ migrationResult.works || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="评论">{{ migrationResult.comments || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="通知">{{ migrationResult.notifications || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="系统配置">{{ migrationResult.systemConfigs || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="轮播图">{{ migrationResult.banners || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="公告">{{ migrationResult.announcements || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="IP封禁">{{ migrationResult.ipBans || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="举报">{{ migrationResult.reports || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="工作室">{{ migrationResult.studios || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="工作室成员">{{ migrationResult.studioMembers || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="收藏">{{ migrationResult.favorites || 0 }}</el-descriptions-item>
                    <el-descriptions-item label="关注">{{ migrationResult.follows || 0 }}</el-descriptions-item>
                  </el-descriptions>
                </el-card>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 安全验证配置：极验与 hCaptcha 统一在此管理 -->
        <div v-if="activeMenu === 'security'" class="r-admin--section" v-loading="loadingConfigs">
          <div class="r-admin--header">
            <h2 class="r-admin--title">安全验证</h2>
            <p class="r-admin--subtitle">统一管理操作级极验验证码与全站访问 hCaptcha 验证</p>
          </div>

          <!-- 极验验证码从“系统设置”迁移至“安全验证”，配置字段与场景开关保持不变。 -->
          <div class="r-admin--config_section" id="config-geetest">
            <div class="r-admin--config_section_title">
              <span class="r-admin--config_section_icon">🔐</span>
              <span>极验验证码</span>
              <el-switch v-model="configForm.geetest_enabled" active-text="开启" inactive-text="关闭" active-value="true" inactive-value="false" class="r-admin--config_section_switch" />
            </div>
            <el-form :model="configForm" label-width="90px" class="r-admin--config_form">
              <el-row :gutter="20">
                <el-col :span="8"><el-form-item label="极验 ID"><el-input v-model="configForm.geetest_id" placeholder="后台获取" /></el-form-item></el-col>
                <el-col :span="8"><el-form-item label="极验 KEY"><el-input v-model="configForm.geetest_key" show-password placeholder="后台获取" /></el-form-item></el-col>
                <el-col :span="8"><el-form-item label="展现形式"><el-select v-model="configForm.geetest_product" style="width:100%"><el-option label="弹出式" value="popup" /><el-option label="浮动式" value="float" /><el-option label="隐藏按钮式" value="bind" /></el-select></el-form-item></el-col>
              </el-row>
              <div class="r-admin--switch_grid">
                <div class="r-admin--switch_item" v-for="item in [
                  {key:'geetest_login',label:'登录'},{key:'geetest_register',label:'注册'},{key:'geetest_like',label:'点赞'},
                  {key:'geetest_comment',label:'评论'},{key:'geetest_reply',label:'回复'},{key:'geetest_report',label:'举报'},
                  {key:'geetest_publish_work',label:'发布作品'},{key:'geetest_publish_post',label:'发布帖子'},{key:'geetest_favorite',label:'收藏'},
                  {key:'geetest_update_profile',label:'修改资料'},{key:'geetest_create_studio',label:'创建工作室'},{key:'geetest_join_studio',label:'加入工作室'},
                  {key:'geetest_submit_work',label:'投稿作品'},{key:'geetest_review_member',label:'审核成员'},{key:'geetest_studio_management',label:'工作室敏感操作'},
                  {key:'geetest_developer_app',label:'申请开发者应用'},
                  {key:'geetest_im_message',label:'IM 发消息（2分钟）'},
                  {key:'geetest_im_search',label:'IM 搜索'},
                  {key:'geetest_im_create_group',label:'IM 创建群聊'}
                ]" :key="item.key">
                  <span class="r-admin--switch_label">{{ item.label }}</span>
                  <el-switch v-model="configForm[item.key]" active-value="true" inactive-value="false" />
                </div>
              </div>
            </el-form>
          </div>

          <div class="r-admin--config_section">
            <div class="r-admin--config_section_title">
              <span class="r-admin--config_section_icon">🛡️</span>
              <span>hCaptcha 安全验证</span>
            </div>
            <p class="r-admin--subtitle">开启后，用户访问社区需先通过 hCaptcha 验证，验证过期后需重新验证</p>
          <el-form :model="configForm" label-width="120px" class="r-admin--form">
            <el-form-item label="启用hCaptcha">
              <el-switch v-model="configForm.hcaptcha_enabled" active-value="true" inactive-value="false" />
            </el-form-item>
            <el-form-item label="Site Key">
              <el-input v-model="configForm.hcaptcha_site_key" placeholder="hCaptcha Site Key" />
            </el-form-item>
            <el-form-item label="Secret Key">
              <el-input v-model="configForm.hcaptcha_secret_key" type="password" show-password placeholder="hCaptcha Secret Key" />
            </el-form-item>
            <el-form-item label="验证有效期">
              <el-input-number v-model="hcaptchaExpireMinutes" :min="1" :max="1440" />
              <span style="margin-left: 10px; color: #999;">分钟（1-1440分钟，即最长24小时）</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveSecurityConfig" :loading="savingConfigs">保存安全验证设置</el-button>
            </el-form-item>
          </el-form>
          </div>
          
          <!-- 验证码统计 -->
          <div class="r-admin--captcha-stats">
            <h3 class="r-admin--stats-title">验证码统计（近7天）</h3>
            <el-row :gutter="20" v-if="captchaStats">
              <el-col :span="12">
                <div class="r-admin--stat-card">
                  <h4>极验验证码</h4>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">展示次数</span>
                    <span class="r-admin--stat-value">{{ captchaStats.geetest?.show || 0 }}</span>
                  </div>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">通过次数</span>
                    <span class="r-admin--stat-value success">{{ captchaStats.geetest?.pass || 0 }}</span>
                  </div>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">拦截次数</span>
                    <span class="r-admin--stat-value danger">{{ captchaStats.geetest?.block || 0 }}</span>
                  </div>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">通过率</span>
                    <span class="r-admin--stat-value">{{ geetestPassRate }}%</span>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="r-admin--stat-card">
                  <h4>hCaptcha验证码</h4>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">展示次数</span>
                    <span class="r-admin--stat-value">{{ captchaStats.hcaptcha?.show || 0 }}</span>
                  </div>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">通过次数</span>
                    <span class="r-admin--stat-value success">{{ captchaStats.hcaptcha?.pass || 0 }}</span>
                  </div>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">拦截次数</span>
                    <span class="r-admin--stat-value danger">{{ captchaStats.hcaptcha?.block || 0 }}</span>
                  </div>
                  <div class="r-admin--stat-row">
                    <span class="r-admin--stat-label">通过率</span>
                    <span class="r-admin--stat-value">{{ hcaptchaPassRate }}%</span>
                  </div>
                </div>
              </el-col>
            </el-row>
          </div>
        </div>
        
        <!-- 操作日志 -->
        <div v-if="activeMenu === 'logs'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">操作日志</h2>
          </div>
          <div class="r-admin--filters r-admin--log_filters">
            <el-select v-model="logFilters.userId" clearable filterable placeholder="全部管理员">
              <el-option
                v-for="operator in logFilterOptions.operators"
                :key="operator.id"
                :label="`${operator.nickname || operator.username}（${getRoleName(operator.role)}）`"
                :value="operator.id"
              />
            </el-select>
            <el-select v-model="logFilters.action" clearable filterable placeholder="全部操作">
              <el-option
                v-for="action in logFilterOptions.actions"
                :key="action"
                :label="getActionName(action)"
                :value="action"
              />
            </el-select>
            <el-select v-model="logFilters.targetType" clearable filterable placeholder="全部目标">
              <el-option
                v-for="type in logFilterOptions.targetTypes"
                :key="type"
                :label="getTargetTypeName(type)"
                :value="type"
              />
            </el-select>
            <el-date-picker
              v-model="logFilters.dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              value-format="YYYY-MM-DDTHH:mm:ss"
            />
            <el-button type="primary" @click="applyLogFilters">筛选</el-button>
            <el-button @click="resetLogFilters">重置</el-button>
          </div>
          <el-table :data="operationLogs" v-loading="loadingOperationLogs" stripe>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="user" label="操作者" width="150">
              <template #default="{ row }">
                <span>{{ row.user?.nickname || row.user?.username || (row.action?.startsWith('developer_api_') ? '开发者 API' : '系统') }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="action" label="操作" width="140">
              <template #default="{ row }">
                <span>{{ getActionName(row.action) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="target_type" label="目标类型" width="90">
              <template #default="{ row }">
                <el-tag size="small">{{ getTargetTypeName(row.target_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="target_id" label="目标ID" width="80" />
            <el-table-column prop="ip_address" label="IP地址" width="130" />
            <el-table-column prop="created_at" label="操作时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="详情" min-width="80">
              <template #default="{ row }">
                <el-button size="small" text @click="showLogDetail(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="r-admin--pagination">
            <el-pagination
              v-model:current-page="logPage"
              v-model:page-size="logPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="logTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="fetchOperationLogs"
              @size-change="handleLogPageSizeChange"
            />
          </div>
        </div>
        
        <!-- 实时日志 -->
        <div v-if="activeMenu === 'realtime-logs'" class="r-admin--section">
          <div class="r-admin--header">
            <h2 class="r-admin--title">实时日志</h2>
            <div class="r-admin--header_actions">
              <!-- 修复: 日志来源切换,file 包含 Docker/应用全部输出 -->
              <el-radio-group v-model="logSource" size="small" @change="fetchRealtimeLogs">
                <el-radio-button label="memory">应用日志</el-radio-button>
                <el-radio-button label="file">文件日志</el-radio-button>
              </el-radio-group>
              <el-switch v-model="autoRefreshLogs" active-text="自动刷新" @change="toggleAutoRefresh" />
              <el-button @click="fetchRealtimeLogs" :loading="loadingRealtimeLogs">刷新</el-button>
              <el-button @click="clearRealtimeLogs" type="danger">清空</el-button>
            </div>
          </div>
          <div class="r-admin--realtime_logs" ref="realtimeLogsRef">
            <div v-if="realtimeLogs.length === 0" class="r-admin--realtime_logs_empty">
              暂无日志
            </div>
            <div v-for="(log, index) in realtimeLogs" :key="index" 
                 :class="['r-admin--realtime_log_item', 'r-admin--realtime_log_' + (log.level || 'info')]">
              <span class="r-admin--realtime_log_time">{{ formatLogTime(log.time) }}</span>
              <span class="r-admin--realtime_log_level">{{ (log.level || 'info').toUpperCase() }}</span>
              <span class="r-admin--realtime_log_tag" v-if="log.tag">{{ log.tag }}</span>
              <span class="r-admin--realtime_log_msg">{{ log.message }}</span>
            </div>
          </div>
          <div class="r-admin--realtime_logs_footer">
            <span>共 {{ realtimeLogs.length }} 条日志</span>
          </div>
        </div>
      </main>
    </div>
    
    <!-- 轮播图编辑对话框 -->
    <el-dialog
      v-model="bannerDialogVisible"
      :title="editingBanner ? '编辑轮播图' : '添加轮播图'"
      width="640px"
      class="r-admin--banner_dialog"
    >
      <el-form :model="bannerForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="bannerForm.title" placeholder="轮播图标题" />
        </el-form-item>
        <el-form-item label="轮播图片">
          <div class="r-admin--banner_upload">
            <div
              class="r-admin--banner_upload_preview"
              :class="{ 'is-empty': !bannerForm.image_url }"
              @click="bannerImageInput?.click()"
            >
              <img
                v-if="bannerForm.image_url"
                :src="bannerForm.image_url"
                alt="轮播图预览"
                referrerpolicy="no-referrer"
              />
              <div v-else class="r-admin--banner_upload_empty">
                <el-icon><Picture /></el-icon>
                <strong>上传轮播图片</strong>
                <span>支持 JPG、PNG、WebP、GIF</span>
              </div>
              <div class="r-admin--banner_upload_mask">
                {{ bannerUploading ? '正在上传…' : (bannerForm.image_url ? '更换图片' : '选择图片') }}
              </div>
            </div>
            <input
              ref="bannerImageInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              @change="handleBannerImageUpload"
            />
            <div class="r-admin--banner_upload_actions">
              <el-button
                type="primary"
                plain
                :loading="bannerUploading"
                @click="bannerImageInput?.click()"
              >
                {{ bannerForm.image_url ? '重新上传' : '上传至图床' }}
              </el-button>
              <span>上传成功后自动填入图片地址</span>
            </div>
            <el-input v-model="bannerForm.image_url" placeholder="也可以粘贴已有图片链接">
              <template #prepend>图片 URL</template>
            </el-input>
          </div>
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="bannerForm.link_url" placeholder="点击跳转的链接" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="bannerForm.sort" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="bannerForm.is_active" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bannerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveBanner">保存</el-button>
      </template>
    </el-dialog>
    
    <!-- IP封禁对话框 -->
    <el-dialog v-model="ipBanDialogVisible" title="添加IP封禁" width="400px">
      <el-form :model="ipBanForm" label-width="80px">
        <el-form-item label="IP地址">
          <el-input v-model="ipBanForm.ip_address" placeholder="输入要封禁的IP地址" />
        </el-form-item>
        <el-form-item label="封禁原因">
          <el-input v-model="ipBanForm.reason" type="textarea" placeholder="封禁原因" />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker v-model="ipBanForm.expires_at" type="datetime" placeholder="留空则永久封禁" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ipBanDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAddIpBan">封禁</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="reportDialogVisible" title="处理举报" width="600px">
      <el-form :model="reportForm" label-width="80px" v-if="editingReport">
        <el-form-item label="举报类型">
          <el-tag>{{ editingReport.type === 'work' ? '作品' : editingReport.type === 'comment' ? '评论' : '用户' }}</el-tag>
        </el-form-item>
        <el-form-item label="举报原因">
          <span>{{ editingReport.reason }}</span>
        </el-form-item>
        <el-form-item label="详细描述">
          <span>{{ editingReport.description || '无' }}</span>
        </el-form-item>
        
        <!-- AI审核结果 -->
        <el-divider>
          <el-button type="primary" size="small" @click="runAIReview" :loading="aiReviewLoading">
            <el-icon><Cpu /></el-icon> AI审核
          </el-button>
        </el-divider>
        <div v-if="aiReviewResult" class="r-admin--ai_result">
          <el-alert v-if="aiReviewResult.isFallback" type="warning" :closable="false" style="margin-bottom: 12px;">
            AI未配置，使用敏感词检测
          </el-alert>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="风险等级">
              <el-tag :type="aiReviewResult.riskLevel === 'high' ? 'danger' : aiReviewResult.riskLevel === 'medium' ? 'warning' : 'success'">
                {{ aiReviewResult.riskLevel === 'high' ? '高风险' : aiReviewResult.riskLevel === 'medium' ? '中风险' : '低风险' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="置信度">{{ aiReviewResult.confidence ? (aiReviewResult.confidence * 100).toFixed(0) + '%' : '-' }}</el-descriptions-item>
            <el-descriptions-item label="违规类型" :span="2">
              <el-tag v-for="v in aiReviewResult.violations" :key="v" size="small" type="danger" style="margin-right: 4px;">{{ v }}</el-tag>
              <span v-if="!aiReviewResult.violations?.length">无</span>
            </el-descriptions-item>
            <el-descriptions-item label="判定原因" :span="2">{{ aiReviewResult.reason || '无' }}</el-descriptions-item>
            <el-descriptions-item label="处理建议" :span="2">
              <el-tag :type="aiReviewResult.recommendation === 'delete' ? 'danger' : aiReviewResult.recommendation === 'review' ? 'warning' : 'success'">
                {{ aiReviewResult.recommendation === 'delete' ? '建议删除' : aiReviewResult.recommendation === 'review' ? '需人工审核' : '内容正常' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 处理记录(审计日志) -->
        <el-divider>
          <el-button type="info" size="small" @click="loadAuditLogs" :loading="auditLogsLoading">
            <el-icon><Document /></el-icon> 处理记录
          </el-button>
        </el-divider>
        <div v-if="auditLogs.length > 0" class="r-admin--audit_logs">
          <el-timeline>
            <el-timeline-item v-for="log in auditLogs" :key="log.id" :timestamp="formatDate(log.created_at)" placement="top">
              <el-card shadow="never" body-style="padding: 8px 12px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <el-tag :type="log.handler_type === 'ai' ? 'warning' : log.handler_type === 'system' ? 'info' : 'primary'" size="small">
                    {{ log.handler_type === 'ai' ? 'AI' : log.handler_type === 'system' ? '系统' : (log.handler?.nickname || log.handler?.username || '管理员') }}
                  </el-tag>
                  <el-tag size="small">{{ log.action }}</el-tag>
                </div>
                <div v-if="log.note" style="font-size: 13px; color: #606266;">{{ log.note }}</div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
        <el-empty v-else-if="auditLogsLoaded" description="暂无处理记录" />

        <el-divider>人工处理</el-divider>
        <el-form-item label="处理结果">
          <el-select v-model="reportForm.status" style="width: 100%">
            <el-option label="处理中" value="processing" />
            <el-option label="已解决" value="resolved" />
            <el-option label="驳回" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理备注">
          <el-input v-model="reportForm.handleNote" type="textarea" placeholder="处理说明" />
        </el-form-item>
        <el-form-item label="执行操作" v-if="reportForm.status === 'resolved'">
          <el-checkbox v-model="reportForm.takeAction">同时删除/封禁被举报内容</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleProcessReport">提交处理</el-button>
      </template>
    </el-dialog>

    <!-- 重复举报合并对话框 -->
    <el-dialog v-model="showDuplicateDialog" title="合并重复举报" width="700px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
        以下举报为同一目标被多次举报，合并后将保留所有举报原因，处理时会通知所有举报人。
      </el-alert>
      <el-table :data="duplicateGroups" stripe max-height="400">
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type === 'work' ? '作品' : row.type === 'comment' ? '评论' : '用户' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target_id" label="目标ID" width="80" />
        <el-table-column prop="count" label="举报数" width="80" />
        <el-table-column label="举报原因" min-width="200">
          <template #default="{ row }">
            <div style="max-height: 60px; overflow: auto;">
              <div v-for="(reason, i) in row.reasons" :key="i" style="font-size: 12px; color: #666;"># {{ reason }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleMergeDuplicates(row)">合并</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="duplicateGroups.length === 0" style="text-align: center; padding: 40px; color: #999;">
        暂无重复举报
      </div>
    </el-dialog>

    <!-- 角色修改对话框 -->
    <el-dialog v-model="roleDialogVisible" title="修改用户角色" width="400px">
      <el-form label-width="80px" v-if="editingUser">
        <el-form-item label="用户">
          <span>{{ editingUser.nickname || editingUser.username }}</span>
        </el-form-item>
        <el-form-item label="当前角色">
          <el-tag :type="getRoleTagType(editingUser.role)">{{ getRoleName(editingUser.role) }}</el-tag>
        </el-form-item>
        <el-form-item label="新角色">
          <el-select v-model="selectedRole" style="width: 100%">
            <el-option label="普通用户" value="user" />
            <el-option label="审核员" value="reviewer" />
            <el-option label="版主" value="moderator" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="updateUserRole">确认修改</el-button>
      </template>
    </el-dialog>
    
    <!-- 公告编辑对话框 -->
    <el-dialog v-model="announcementDialogVisible" :title="editingAnnouncement ? '编辑公告' : '发布公告'" width="640px">
      <el-form :model="announcementForm" label-width="110px">
        <el-form-item label="标题">
          <el-input v-model="announcementForm.title" placeholder="公告标题" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="announcementForm.content" type="textarea" :rows="5" placeholder="公告内容" maxlength="10000" show-word-limit />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="announcementForm.type">
            <el-radio label="notice">普通</el-radio>
            <el-radio label="update">更新</el-radio>
            <el-radio label="warning">警告</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="颜色">
          <el-radio-group v-model="announcementForm.color" class="r-admin--ann_color_group">
            <el-radio-button v-for="opt in announcementColorOptions" :key="opt.value" :label="opt.value">
              <span class="r-admin--ann_color_dot" :style="{ background: opt.hex }"></span>{{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="展示位置">
          <div style="display:flex;flex-direction:column;gap:6px;">
            <el-checkbox v-model="announcementForm.show_top_bar">顶部通知条</el-checkbox>
            <el-checkbox v-model="announcementForm.show_popup">弹出弹窗</el-checkbox>
            <el-checkbox v-model="announcementForm.show_community">社区页右侧公告卡片</el-checkbox>
            <div style="color:#999;font-size:12px;">可多选；至少选择一个展示位置</div>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="announcementForm.is_active">
            <el-radio :label="true">显示</el-radio>
            <el-radio :label="false">隐藏</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="announcementDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingAnnouncement" :disabled="savingAnnouncement" @click="handleSaveAnnouncement">保存</el-button>
      </template>
    </el-dialog>
    
    <!-- 敏感词编辑对话框 -->
    <el-dialog v-model="sensitiveDialogVisible" :title="editingSensitiveWord ? '编辑敏感词' : '添加敏感词'" width="450px">
      <el-form :model="sensitiveForm" label-width="80px">
        <el-form-item label="敏感词">
          <el-input v-model="sensitiveForm.word" placeholder="敏感词" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="sensitiveForm.category" style="width: 100%">
            <el-option label="政治" value="politics" />
            <el-option label="色情" value="porn" />
            <el-option label="暴力" value="violence" />
            <el-option label="广告" value="ad" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="等级">
          <el-radio-group v-model="sensitiveForm.level">
            <el-radio label="low">低</el-radio>
            <el-radio label="medium">中</el-radio>
            <el-radio label="high">高</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="替换词">
          <el-input v-model="sensitiveForm.replacement" placeholder="可选，留空则用***替换" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sensitiveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveSensitiveWord">保存</el-button>
      </template>
    </el-dialog>
    
    <!-- 批量导入敏感词对话框 -->
    <el-dialog v-model="sensitiveImportDialogVisible" title="批量导入敏感词" width="500px">
      <el-form label-width="80px">
        <el-form-item label="分类">
          <el-select v-model="importCategory" style="width: 100%">
            <el-option label="政治" value="politics" />
            <el-option label="色情" value="porn" />
            <el-option label="暴力" value="violence" />
            <el-option label="广告" value="ad" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="等级">
          <el-radio-group v-model="importLevel">
            <el-radio label="low">低</el-radio>
            <el-radio label="medium">中</el-radio>
            <el-radio label="high">高</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="敏感词">
          <el-input v-model="importWords" type="textarea" :rows="8" placeholder="每行一个敏感词" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sensitiveImportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBatchImportSensitiveWords">导入</el-button>
      </template>
    </el-dialog>
    
    <!-- 日志详情对话框 -->
    <el-dialog v-model="logDetailDialogVisible" title="完整审计详情" width="760px" class="admin-detail-dialog">
      <pre style="max-height: 65vh; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #f6f8fc; color: #182033; padding: 18px; border: 1px solid #e4e9f2; border-radius: 12px; line-height: 1.65;">{{ logDetailContent }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { adminApi } from '@/api/admin'
import { imApi } from '@/api/im'
import { uploadApi } from '@/api/upload'
import request from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataAnalysis, User, UserFilled, Document, Download, Search, Picture, ChatDotRound, Warning, Lock, Bell, Filter, Setting, List, Key, OfficeBuilding, Loading, Cpu, Postcard, Monitor, Check, CopyDocument, Plus, Delete, View, ArrowLeft, CaretBottom, ArrowDown, Back, EditPen, Star, SwitchButton } from '@element-plus/icons-vue'
import Posts from './admin/Posts.vue'

const router = useRouter()
const userStore = useUserStore()

const getSafeExternalUrl = (value) => {
  if (!value) return ''
  try {
    const url = new URL(String(value))
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

const activeMenu = ref('dashboard')
const loadingStats = ref(false)
const loadingDeveloperApps = ref(false)
const developerApps = ref([])
const developerAppTotal = ref(0)
const developerAppFilter = ref({ status: '', keyword: '', page: 1, pageSize: 20 })
const developerAppDetailVisible = ref(false)
const loadingDeveloperAppDetail = ref(false)
const developerAppDetail = ref(null)
const developerAppCalls = ref([])
const loadingDeveloperAppCalls = ref(false)
const developerAppCallTotal = ref(0)
const developerAppCallPage = ref(1)
const developerAppCallPageSize = 10
const developerAppDetailTab = ref('calls')
const developerAppAuditLogs = ref([])
const loadingDeveloperAppAuditLogs = ref(false)
const developerAppAuditLogsTotal = ref(0)
const developerAppAuditLogsPage = ref(1)
const developerAppStats = ref({})
const developerAppStatsDetail = ref({})
const sparklineW = 600
const sparklineH = 60
const loadingUsers = ref(false)
const loadingWorks = ref(false)
const loadingComments = ref(false)
const loadingReports = ref(false)
const loadingBanners = ref(false)
const loadingIpBans = ref(false)
const crawling = ref(false)
const crawlingHot = ref(false)
const crawlingUser = ref(false)
const crawlingPosts = ref(false)
const recalibrating = ref(false)

const userDetailVisible = ref(false)
const userDetailLoading = ref(false)

const workDetailVisible = ref(false)
const workDetail = ref(null)
const workDetailSaving = ref(false)
const workEditing = ref(false)
const workEditReason = ref('')
const workEditForm = ref({ name: '', publisher_id: null, preview: '', type: '', ide_type: '', view_times: 0, praise_times: 0, collection_times: 0, status: 'published', is_featured: false, is_sidebar_recommended: false, sidebar_sort_order: 0 })
const workPublisherOptions = ref([])
const workPublisherLoading = ref(false)
const userDetail = ref(null)
const passwordDialogVisible = ref(false)
const passwordLoading = ref(false)
const passwordForm = ref({ newPassword: '', confirmPassword: '' })
const notificationDialogVisible = ref(false)
const batchNotificationDialogVisible = ref(false)
const notificationLoading = ref(false)
const notificationForm = ref({ title: '', content: '', targetUser: null, targetUsers: null, isAll: false })
const selectedUserIds = ref([])

const chartRef = ref(null)

const stats = ref({ 
  userCount: 0, workCount: 0, commentCount: 0, 
  todayUsers: 0, todayWorks: 0, todayComments: 0,
  pendingReports: 0, activeIpBans: 0, featuredWorks: 0, 
  disabledUsers: 0, newUsersWeek: 0, newWorksWeek: 0,
  todayVisits: 0, todayUniqueIps: 0
})

const users = ref([])
const userSearch = ref('')
const userPage = ref(1)
const userPageSize = ref(20)
const userTotal = ref(0)
const userRoleFilter = ref('')
const userStatusFilter = ref('')

// 编程猫 Token 可见性(superadmin only)
const tokenLoading = ref(false)
const tokenRevealed = ref(false)
const fullToken = ref('')

// 查看完整 token(调用 superadmin 专用接口)
const revealToken = async () => {
  if (!userDetail.value?.user?.id) return
  tokenLoading.value = true
  try {
    const res = await adminApi.getUserCodemaoToken(userDetail.value.user.id)
    if (res.code === 200) {
      fullToken.value = res.data.codemao_token || ''
      tokenRevealed.value = true
    } else {
      ElMessage.error(res.msg || '获取失败')
    }
  } catch (e) {
    ElMessage.error('获取 Token 失败')
  } finally {
    tokenLoading.value = false
  }
}

// 复制 token
const copyToken = () => {
  navigator.clipboard.writeText(fullToken.value).then(() => {
    ElMessage.success('已复制')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

const works = ref([])
const workSearch = ref('')
const workPage = ref(1)
const workPageSize = ref(20)
const workTotal = ref(0)
const workTypeFilter = ref('')
const workFeaturedFilter = ref('')

const comments = ref([])
const commentSearch = ref('')
const commentPage = ref(1)
const commentPageSize = ref(20)
const commentTotal = ref(0)
const commentStatusFilter = ref('')
const commentUserId = ref('')
const commentWorkId = ref('')
const commentDetailVisible = ref(false)
const commentDetail = ref(null)

const reports = ref([])
const reportPage = ref(1)
const reportPageSize = ref(20)
const reportTotal = ref(0)
const reportTypeFilter = ref('')
const reportStatusFilter = ref('')
const editingReport = ref(null)
const reportDialogVisible = ref(false)
const reportForm = ref({ status: 'processing', handleNote: '', takeAction: false })
const aiReviewLoading = ref(false)
const aiReviewResult = ref(null)
const auditLogs = ref([])
const auditLogsLoading = ref(false)
const auditLogsLoaded = ref(false)
const selectedReports = ref([])
const batchAILoading = ref(false)
const autoHandleLoading = ref(false)
const proxyConfig = ref({ enabled: false, poolUrl: '', protocol: '', currentProxy: '', cacheCount: 0, autoRefresh: 0 })
const proxyLoading = ref(false)
const proxyTestLoading = ref(false)
const proxyTestResult = ref(null)

const handleReportSelection = (selection) => {
  selectedReports.value = selection
}

// 跳转到用户详情页(使用 codemao_user_id)
const goToUser = (user) => {
  if (user?.codemao_user_id) {
    router.push(`/user/${user.codemao_user_id}`)
  } else if (user?.id) {
    router.push(`/user/local/${user.id}`)
  }
}

// 通过本地 ID 查找用户并跳转(用于 work/comment 类举报)
const goToUserById = async (userId) => {
  if (!userId) return
  try {
    const res = await adminApi.getUserDetail(userId)
    if (res.code === 200 && res.data?.user?.codemao_user_id) {
      router.push(`/user/${res.data.user.codemao_user_id}`)
    } else {
      ElMessage.warning('无法获取用户信息')
    }
  } catch (e) {
    ElMessage.warning('跳转失败')
  }
}

const quickAIReview = async (row) => {
  row.aiLoading = true
  try {
    const res = await adminApi.aiReviewReport(row.id)
    if (res.code === 200) {
      row.aiResult = res.data
      if (res.data.isFallback) {
        ElMessage.warning('AI未配置，已使用敏感词检测')
      }
    } else {
      ElMessage.error(res.msg || 'AI审核失败')
    }
  } catch (e) {
    ElMessage.error('AI审核请求失败')
  } finally {
    row.aiLoading = false
  }
}

const batchAIReview = async () => {
  if (selectedReports.value.length === 0) return
  // 修复: 统计已处理举报数量,询问是否排除,避免浪费 AI 资源
  const processedCount = selectedReports.value.filter(r => r.status !== 'pending').length
  let onlyPending = false
  if (processedCount > 0) {
    try {
      await ElMessageBox.confirm(`已选择 ${selectedReports.value.length} 条举报，其中 ${processedCount} 条已处理。是否排除已处理举报，仅审核待处理？`, '确认', {
        confirmButtonText: '排除已处理',
        cancelButtonText: '全部审核',
        type: 'warning'
      })
      onlyPending = true
    } catch (e) {
      // 用户选择"全部审核",继续处理所有
    }
  }
  const targets = onlyPending
    ? selectedReports.value.filter(r => r.status === 'pending')
    : selectedReports.value
  batchAILoading.value = true
  let success = 0
  let fallbackCount = 0
  for (const row of targets) {
    try {
      const res = await adminApi.aiReviewReport(row.id)
      if (res.code === 200) {
        row.aiResult = res.data
        success++
        if (res.data.isFallback) fallbackCount++
      }
    } catch (e) {
      console.error('批量AI审核单条失败:', e)
    }
  }
  batchAILoading.value = false
  if (fallbackCount > 0) {
    ElMessage.warning(`批量审核完成，${fallbackCount}条使用敏感词检测（AI未配置）`)
  } else {
    ElMessage.success(`批量审核完成，成功 ${success}/${targets.length}`)
  }
}

const quickHandle = async (row, action) => {
  const actionText = action === 'delete' ? '删除内容' : '驳回举报'
  try {
    await ElMessageBox.confirm(`确定要${actionText}吗？`, '确认操作')
    const res = await adminApi.handleReport(row.id, {
      status: action === 'delete' ? 'resolved' : 'rejected',
      handleNote: action === 'delete' ? 'AI审核建议删除' : 'AI审核建议通过',
      takeAction: action === 'delete'
    })
    if (res.code === 200) {
      ElMessage.success('处理成功')
      fetchReports()
    } else {
      ElMessage.error(res.msg || '处理失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('处理失败')
  }
}

const autoHandleByAI = async () => {
  const pendingWithAI = reports.value.filter(r => r.aiResult && r.status === 'pending')
  if (pendingWithAI.length === 0) {
    ElMessage.warning('没有已审核且待处理的举报')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `将处理 ${pendingWithAI.length} 条举报：\n高风险/中风险 → 删除内容\n低风险 → 驳回举报`,
      '确认一键处理'
    )
    
    autoHandleLoading.value = true
    let success = 0
    
    for (const row of pendingWithAI) {
      const isHighOrMedium = row.aiResult.riskLevel === 'high' || row.aiResult.riskLevel === 'medium'
      const action = isHighOrMedium ? 'delete' : 'reject'
      
      try {
        const res = await adminApi.handleReport(row.id, {
            status: action === 'delete' ? 'resolved' : 'rejected',
            handleNote: `AI审核: ${row.aiResult.reason}`,
            takeAction: action === 'delete'
        })
        if (res.code === 200) success++
      } catch (e) {}
    }
    
    autoHandleLoading.value = false
    ElMessage.success(`处理完成，成功 ${success}/${pendingWithAI.length}`)
    fetchReports()
  } catch (e) {
    autoHandleLoading.value = false
  }
}

const runAIReview = async () => {
  if (!editingReport.value) return
  aiReviewLoading.value = true
  try {
    const res = await adminApi.aiReviewReport(editingReport.value.id)
    if (res.code === 200) {
      aiReviewResult.value = res.data
    } else {
      ElMessage.error(res.msg || 'AI审核失败')
    }
  } catch (e) {
    ElMessage.error('AI审核请求失败')
  } finally {
    aiReviewLoading.value = false
  }
}

const reportStatusMap = { pending: 'warning', processing: 'primary', resolved: 'success', rejected: 'danger' }

// 重复举报
const duplicateGroups = ref([])
const showDuplicateDialog = ref(false)
const loadingDuplicates = ref(false)
const selectedDuplicateGroup = ref(null)

const showDuplicateReports = async () => {
  loadingDuplicates.value = true
  try {
    const res = await adminApi.getDuplicateReportGroups()
    if (res.code === 200) {
      duplicateGroups.value = res.data.groups || []
      showDuplicateDialog.value = true
    }
  } catch (e) {
    ElMessage.error('获取重复举报失败')
  } finally {
    loadingDuplicates.value = false
  }
}

const handleMergeDuplicates = async (group) => {
  try {
    await ElMessageBox.confirm(
      `确定合并这 ${group.count} 条举报吗？合并后将保留所有举报原因，处理时会通知所有举报人。`,
      '确认合并',
      { type: 'warning' }
    )
    const res = await adminApi.mergeReports(group.reportIds)
    if (res.code === 200) {
      ElMessage.success(res.msg || '合并成功')
      showDuplicateDialog.value = false
      fetchReports()
    } else {
      ElMessage.error(res.msg || '合并失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('合并失败')
  }
}
const reportStatusText = { pending: '待处理', processing: '处理中', resolved: '已解决', rejected: '已驳回' }

const crawlWorkId = ref('')
const crawlUserId = ref('')
const crawlCount = ref(20)
const crawlKeyword = ref('精选')
const crawlResult = ref('')
const crawlResultType = ref('success')
const crawlLogs = ref([])
const crawlLogsRef = ref(null)
const currentTaskId = ref(null)

const studios = ref([])
const studiosPage = ref(1)
const studiosTotal = ref(0)
const loadingStudios = ref(false)
const studioDetailVisible = ref(false)
const studioDetailLoading = ref(false)
const studioDetail = ref(null)
const studioPointsDialogVisible = ref(false)
const studioPointsSubmitting = ref(false)
const studioPointsTarget = ref(null)
const studioPointsForm = ref({ action: 'add', points: 10, note: '' })
const studioEditDialogVisible = ref(false)
const studioEditSubmitting = ref(false)
const studioEditForm = ref({ id: null, name: '', description: '', join_type: 'apply', is_public: true })
const defaultStudioCover = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 260"%3E%3Cdefs%3E%3ClinearGradient id="g" x2="1" y2="1"%3E%3Cstop stop-color="%236879e6"/%3E%3Cstop offset="1" stop-color="%23845bb7"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="640" height="260" rx="28" fill="url(%23g)"/%3E%3Ccircle cx="550" cy="40" r="120" fill="white" opacity=".12"/%3E%3Cpath d="M80 180h210M80 140h130" stroke="white" stroke-width="18" stroke-linecap="round" opacity=".82"/%3E%3C/svg%3E'

const banners = ref([])
const bannerDialogVisible = ref(false)
const editingBanner = ref(null)
const crawlingBanners = ref(false)
const bannerImageInput = ref(null)
const bannerUploading = ref(false)
const bannerForm = ref({
  title: '',
  image_url: '',
  link_url: '',
  sort_order: 0,
  is_active: true
})

const ipBans = ref([])
const ipBanPage = ref(1)
const ipBanPageSize = ref(20)
const ipBanTotal = ref(0)
const ipBanDialogVisible = ref(false)
const ipBanForm = ref({ ip_address: '', reason: '', expires_at: null })

const roles = ref([])
const adminUsers = ref([])
const loadingAdminUsers = ref(false)
const roleDialogVisible = ref(false)
const editingUser = ref(null)
const selectedRole = ref('')

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0ZFQzQzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPuahijwvdGV4dD48L3N2Zz4='

const roleNames = {
  user: '普通用户',
  reviewer: '审核员',
  moderator: '版主',
  admin: '管理员',
  superadmin: '超级管理员'
}

const getRoleName = (role) => roleNames[role] || role

const getRoleTagType = (role) => {
  const types = {
    user: 'info',
    reviewer: 'primary',
    moderator: 'warning',
    admin: 'danger',
    superadmin: 'danger'
  }
  return types[role] || 'info'
}

const fetchRoles = async () => {
  try {
    const res = await adminApi.getRoles()
    if (res.code === 200) roles.value = res.data
  } catch (e) {}
}

const fetchAdminUsers = async () => {
  loadingAdminUsers.value = true
  try {
    const res = await adminApi.getAdminUsers()
    if (res.code === 200) adminUsers.value = res.data.list
  } catch (e) {}
  finally { loadingAdminUsers.value = false }
}

const showRoleDialog = (user) => {
  editingUser.value = user
  selectedRole.value = user.role
  roleDialogVisible.value = true
}

const updateUserRole = async () => {
  try {
    const res = await adminApi.updateUserRole(editingUser.value.id, selectedRole.value)
    if (res.code === 200) {
      ElMessage.success('角色更新成功')
      roleDialogVisible.value = false
      editingUser.value.role = selectedRole.value
      fetchAdminUsers()
      if (userDetail.value && userDetail.value.user.id === editingUser.value.id) {
        userDetail.value.user.role = selectedRole.value
      }
    } else {
      ElMessage.error(res.msg || '更新失败')
    }
  } catch (e) {
    ElMessage.error('更新失败')
  }
}

// 公告管理
const announcements = ref([])
const loadingAnnouncements = ref(false)
const announcementDialogVisible = ref(false)
const editingAnnouncement = ref(null)
const savingAnnouncement = ref(false)
// 修复: 模型使用 type: ENUM('notice','update','warning') + is_active: Boolean,非 status
const announcementColorOptions = [
  { value: 'blue', label: '蓝色', hex: '#409EFF' },
  { value: 'green', label: '绿色', hex: '#67C23A' },
  { value: 'orange', label: '橙色', hex: '#E6A23C' },
  { value: 'red', label: '红色', hex: '#F56C6C' },
  { value: 'purple', label: '紫色', hex: '#9B59B6' },
  { value: 'yellow', label: '黄色', hex: '#FEC433' }
]
const announcementColorMap = Object.fromEntries(announcementColorOptions.map(o => [o.value, o.hex]))
const announcementColorLabels = Object.fromEntries(announcementColorOptions.map(o => [o.value, o.label]))

const announcementForm = ref({ title: '', content: '', type: 'notice', color: 'blue', show_top_bar: true, show_popup: false, show_community: true, is_active: true })

const fetchAnnouncements = async () => {
  loadingAnnouncements.value = true
  try {
    const res = await adminApi.getAnnouncements()
    if (res.code === 200) announcements.value = res.data.list
  } catch (e) {}
  finally { loadingAnnouncements.value = false }
}

const showAnnouncementDialog = (announcement = null) => {
  editingAnnouncement.value = announcement
  if (announcement) {
    announcementForm.value = {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      type: announcement.type || 'notice',
      color: announcement.color || 'blue',
      show_top_bar: announcement.show_top_bar !== false,
      show_popup: !!announcement.show_popup,
      show_community: announcement.show_community !== false,
      is_active: announcement.is_active !== undefined ? announcement.is_active : true
    }
  } else {
    announcementForm.value = { title: '', content: '', type: 'notice', color: 'blue', show_top_bar: true, show_popup: false, show_community: true, is_active: true }
  }
  announcementDialogVisible.value = true
}

const handleSaveAnnouncement = async () => {
  if (savingAnnouncement.value) return;
  try {
    if (!announcementForm.value.title?.trim() || !announcementForm.value.content?.trim()) {
      ElMessage.warning('请填写标题和内容')
      return
    }
    if (!announcementForm.value.show_top_bar && !announcementForm.value.show_popup && !announcementForm.value.show_community) {
      ElMessage.warning('请至少选择一个展示位置')
      return
    }
    savingAnnouncement.value = true
    let res
    if (editingAnnouncement.value) {
      res = await adminApi.updateAnnouncement(editingAnnouncement.value.id, announcementForm.value)
    } else {
      res = await adminApi.createAnnouncement(announcementForm.value)
    }
    if (res.code === 200) {
      ElMessage.success('保存成功')
      announcementDialogVisible.value = false
      fetchAnnouncements()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    savingAnnouncement.value = false
  }
}

const handleDeleteAnnouncement = async (announcement) => {
  try {
    await ElMessageBox.confirm('确定删除该公告吗？', '提示', { type: 'warning' })
    const res = await adminApi.deleteAnnouncement(announcement.id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      fetchAnnouncements()
    }
  } catch (e) {}
}

// 敏感词管理
const sensitiveWords = ref([])
const loadingSensitiveWords = ref(false)
const sensitiveDialogVisible = ref(false)
const sensitiveImportDialogVisible = ref(false)
const editingSensitiveWord = ref(null)
const sensitiveForm = ref({ word: '', category: 'other', level: 'medium', replacement: '' })
const importCategory = ref('other')
const importLevel = ref('medium')
const importWords = ref('')
const sensitivePage = ref(1)
const sensitivePageSize = ref(20)
const sensitiveTotal = ref(0)

const fetchSensitiveWords = async (page = 1) => {
  loadingSensitiveWords.value = true
  sensitivePage.value = page
  try {
    const res = await adminApi.getSensitiveWords({ page, pageSize: sensitivePageSize.value })
    if (res.code === 200) {
      sensitiveWords.value = res.data.list
      sensitiveTotal.value = res.data.total
    }
  } catch (e) {}
  finally { loadingSensitiveWords.value = false }
}

const handleSensitivePageChange = (page) => {
  fetchSensitiveWords(page)
}

const showSensitiveDialog = (word = null) => {
  editingSensitiveWord.value = word
  if (word) {
    sensitiveForm.value = { ...word }
  } else {
    sensitiveForm.value = { word: '', category: 'other', level: 'medium', replacement: '' }
  }
  sensitiveDialogVisible.value = true
}

const showSensitiveImportDialog = () => {
  importWords.value = ''
  sensitiveImportDialogVisible.value = true
}

const handleSaveSensitiveWord = async () => {
  try {
    let res
    if (editingSensitiveWord.value) {
      res = await adminApi.updateSensitiveWord(editingSensitiveWord.value.id, sensitiveForm.value)
    } else {
      res = await adminApi.addSensitiveWord(sensitiveForm.value)
    }
    if (res.code === 200) {
      ElMessage.success('保存成功')
      sensitiveDialogVisible.value = false
      fetchSensitiveWords()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const handleDeleteSensitiveWord = async (word) => {
  try {
    await ElMessageBox.confirm('确定删除该敏感词吗？', '提示', { type: 'warning' })
    const res = await adminApi.deleteSensitiveWord(word.id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      fetchSensitiveWords()
    }
  } catch (e) {}
}

const handleBatchImportSensitiveWords = async () => {
  const words = importWords.value.split('\n').map(w => w.trim()).filter(w => w)
  if (words.length === 0) {
    ElMessage.warning('请输入敏感词')
    return
  }
  try {
    const res = await adminApi.batchImportSensitiveWords(words, importCategory.value, importLevel.value)
    if (res.code === 200) {
      ElMessage.success(res.msg)
      sensitiveImportDialogVisible.value = false
      fetchSensitiveWords()
    }
  } catch (e) {
    ElMessage.error('导入失败')
  }
}

// 系统设置
const showPromptHelp = ref(false)
const configForm = ref({
  ai_enabled: 'false',
  ai_api_url: '',
  ai_api_key: '',
  ai_model: 'gpt-3.5-turbo',
  ai_prompt: '',
  geetest_enabled: 'false',
  geetest_id: '',
  geetest_key: '',
  geetest_product: 'popup',
  geetest_login: 'false',
  geetest_register: 'false',
  geetest_like: 'false',
  geetest_comment: 'false',
  geetest_reply: 'false',
  geetest_report: 'false',
  geetest_publish_work: 'false',
  geetest_publish_post: 'false',
  geetest_favorite: 'false',
  geetest_update_profile: 'false',
  geetest_create_studio: 'false',
  geetest_join_studio: 'false',
  geetest_submit_work: 'false',
  geetest_review_member: 'false',
  geetest_studio_management: 'true',
  geetest_developer_app: 'false',
  geetest_im_message: 'true',
  geetest_im_search: 'true',
  geetest_im_create_group: 'true',
  hcaptcha_enabled: 'false',
  hcaptcha_site_key: '',
  hcaptcha_secret_key: '',
  hcaptcha_expire_minutes: '20',
  db_type: 'sqlite',
  mysql_host: '',
  mysql_port: '',
  mysql_database: '',
  mysql_username: '',
  mysql_password: '',
  sensitive_check_mode: 'builtin',
  mobile_android_min_version: '1.1.0',
  mobile_android_latest_version: '1.1.1',
  mobile_android_update_url: 'https://github.com/txcxgzs/codedog/releases/download/mobile-latest/codedog-mobile.apk',
  mobile_android_update_message: '当前版本已停止服务，请更新后继续使用。'
})
const loadingConfigs = ref(false)
const hcaptchaExpireMinutes = ref(20)
const captchaStats = ref(null)

// 敏感词测试
const sensitiveTestText = ref('')
const sensitiveTestLoading = ref(false)
const sensitiveTestResult = ref(null)

// 数据库迁移
const migrationForm = ref({
  sourceType: 'sqlite',
  targetType: 'mysql',
  sourceConfig: {
    path: './database.sqlite',
    host: 'localhost',
    port: '3306',
    database: 'coding_dog',
    user: 'root',
    password: ''
  },
  targetConfig: {
    path: './database_new.sqlite',
    host: 'localhost',
    port: '3306',
    database: 'coding_dog',
    user: 'root',
    password: ''
  },
  clearExisting: false
})
const testingSource = ref(false)
const testingTarget = ref(false)
const migrating = ref(false)
const migrationResult = ref(null)

// 测试源数据库连接
const testSourceConnection = async () => {
  testingSource.value = true
  try {
    const res = await request.post('/admin/db-migration/test-connection', {
      dbType: migrationForm.value.sourceType,
      config: migrationForm.value.sourceConfig
    })
    if (res.code === 200) {
      ElMessage.success('源数据库连接成功！')
    } else {
      ElMessage.error(res.msg || '连接失败')
    }
  } catch (error) {
    ElMessage.error('连接失败：' + (error.message || '未知错误'))
  } finally {
    testingSource.value = false
  }
}

// 测试目标数据库连接
const testTargetConnection = async () => {
  testingTarget.value = true
  try {
    const res = await request.post('/admin/db-migration/test-connection', {
      dbType: migrationForm.value.targetType,
      config: migrationForm.value.targetConfig
    })
    if (res.code === 200) {
      ElMessage.success('目标数据库连接成功！')
    } else {
      ElMessage.error(res.msg || '连接失败')
    }
  } catch (error) {
    ElMessage.error('连接失败：' + (error.message || '未知错误'))
  } finally {
    testingTarget.value = false
  }
}

// 开始迁移
const startMigration = async () => {
  if (!migrationForm.value.sourceType || !migrationForm.value.targetType) {
    ElMessage.warning('请选择源数据库和目标数据库')
    return
  }
  
  const confirmMsg = migrationForm.value.clearExisting 
    ? '确定要执行数据库迁移吗？目标数据库的所有数据将被删除！' 
    : '确定要执行数据库迁移吗？'
  
  try {
    await ElMessageBox.confirm(confirmMsg, '确认迁移', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  
  migrating.value = true
  migrationResult.value = null
  
  try {
    const res = await request.post('/admin/db-migration/migrate', {
      sourceType: migrationForm.value.sourceType,
      sourceConfig: migrationForm.value.sourceConfig,
      targetType: migrationForm.value.targetType,
      targetConfig: migrationForm.value.targetConfig,
      clearExisting: migrationForm.value.clearExisting
    })
    
    if (res.code === 200) {
      ElMessage.success('数据库迁移成功！')
      migrationResult.value = res.data
    } else {
      ElMessage.error(res.msg || '迁移失败')
    }
  } catch (error) {
    ElMessage.error('迁移失败：' + (error.message || '未知错误'))
  } finally {
    migrating.value = false
  }
}

// 获取迁移统计
const getMigrationStats = async () => {
  loadingStats.value = true
  try {
    const res = await request.get('/admin/db-migration/stats', {
      params: {
        dbType: migrationForm.value.sourceType,
        ...migrationForm.value.sourceConfig
      }
    })
    if (res.code === 200) {
      migrationResult.value = res.data
      ElMessage.success('获取统计成功！')
    }
  } catch (error) {
    ElMessage.error('获取统计失败')
  } finally {
    loadingStats.value = false
  }
}

const geetestPassRate = computed(() => {
  if (!captchaStats.value?.geetest) return '0.0'
  const { show = 0, pass = 0 } = captchaStats.value.geetest
  if (show === 0) return '0.0'
  return ((pass / show) * 100).toFixed(1)
})

const hcaptchaPassRate = computed(() => {
  if (!captchaStats.value?.hcaptcha) return '0.0'
  const { show = 0, pass = 0 } = captchaStats.value.hcaptcha
  if (show === 0) return '0.0'
  return ((pass / show) * 100).toFixed(1)
})
const savingConfigs = ref(false)

const fetchConfigs = async () => {
  loadingConfigs.value = true
  try {
    const res = await adminApi.getConfigs()
    if (res.code === 200 && res.data) {
      const data = res.data
      // 逐个更新表单字段
      const form = configForm.value
      form.ai_enabled = String(data.ai_enabled ?? 'false')
      form.ai_api_url = data.ai_api_url || ''
      form.ai_api_key = data.ai_api_key || ''
      form.ai_model = data.ai_model || 'gpt-3.5-turbo'
      form.ai_prompt = data.ai_prompt || ''
      form.geetest_enabled = String(data.geetest_enabled ?? 'false')
      form.geetest_id = data.geetest_id || ''
      form.geetest_key = data.geetest_key || ''
      form.geetest_product = data.geetest_product || 'popup'
      form.geetest_login = String(data.geetest_login ?? 'false')
      form.geetest_register = String(data.geetest_register ?? 'false')
      form.geetest_like = String(data.geetest_like ?? 'false')
      form.geetest_comment = String(data.geetest_comment ?? 'false')
      form.geetest_reply = String(data.geetest_reply ?? 'false')
      form.geetest_report = String(data.geetest_report ?? 'false')
      form.geetest_publish_work = String(data.geetest_publish_work ?? 'false')
      form.geetest_publish_post = String(data.geetest_publish_post ?? 'false')
      form.geetest_favorite = String(data.geetest_favorite ?? 'false')
      form.geetest_update_profile = String(data.geetest_update_profile ?? 'false')
      form.geetest_create_studio = String(data.geetest_create_studio ?? 'false')
      form.geetest_join_studio = String(data.geetest_join_studio ?? 'false')
      form.geetest_submit_work = String(data.geetest_submit_work ?? 'false')
      form.geetest_review_member = String(data.geetest_review_member ?? 'false')
      form.geetest_studio_management = String(data.geetest_studio_management ?? 'true')
      form.geetest_developer_app = String(data.geetest_developer_app ?? 'false')
      form.geetest_im_message = String(data.geetest_im_message ?? 'true')
      form.geetest_im_search = String(data.geetest_im_search ?? 'true')
      form.geetest_im_create_group = String(data.geetest_im_create_group ?? 'true')
      form.hcaptcha_enabled = String(data.hcaptcha_enabled ?? 'false')
      form.hcaptcha_site_key = data.hcaptcha_site_key || ''
      form.hcaptcha_secret_key = data.hcaptcha_secret_key || ''
      form.hcaptcha_expire_minutes = data.hcaptcha_expire_minutes || '20'
      form.db_type = data.db_type || 'sqlite'
      form.mysql_host = data.mysql_host || ''
      form.mysql_port = data.mysql_port || ''
      form.mysql_database = data.mysql_database || ''
      form.mysql_username = data.mysql_username || ''
      form.mysql_password = data.mysql_password || ''
      form.sensitive_check_mode = data.sensitive_check_mode || 'builtin'
      form.mobile_android_min_version = data.mobile_android_min_version || '1.1.0'
      form.mobile_android_latest_version = data.mobile_android_latest_version || '1.1.1'
      form.mobile_android_update_url = data.mobile_android_update_url || 'https://github.com/txcxgzs/codedog/releases/download/mobile-latest/codedog-mobile.apk'
      form.mobile_android_update_message = data.mobile_android_update_message || '当前版本已停止服务，请更新后继续使用。'
      if (data.hcaptcha_expire_minutes) {
        hcaptchaExpireMinutes.value = parseInt(data.hcaptcha_expire_minutes) || 20
      }
    }
  } catch (e) {
    console.error('加载配置失败:', e)
  } finally {
    loadingConfigs.value = false
  }
}

const fetchCaptchaStats = async () => {
  try {
    const res = await adminApi.getCaptchaStats(7)
    if (res.code === 200) {
      captchaStats.value = res.data
    }
  } catch (e) {
    console.error('获取验证码统计失败:', e)
  }
}

// 敏感词测试
const testSensitiveCheck = async () => {
  if (!sensitiveTestText.value.trim()) {
    ElMessage.warning('请输入要测试的内容')
    return
  }
  sensitiveTestLoading.value = true
  sensitiveTestResult.value = null
  try {
    const res = await adminApi.testSensitiveCheck({
      text: sensitiveTestText.value,
      mode: configForm.value.sensitive_check_mode
    })
    if (res.code === 200) {
      sensitiveTestResult.value = res.data
    } else {
      ElMessage.error(res.msg || '测试失败')
    }
  } catch (e) {
    ElMessage.error('测试请求失败')
  } finally {
    sensitiveTestLoading.value = false
  }
}

const DEFAULT_AI_PROMPT = `# 角色定义
你是一个专业的内容安全审核系统，具备以下能力：
- 识别违规内容类型
- 评估风险等级
- 提供处理建议

# 任务说明
你需要审核以下内容：

**审核类型**：{{type}}
**待审核内容**：
{{content}}

# 审核标准

| 类型 | 定义 | 示例 |
|------|------|------|
| 涉政 | 政治敏感、国家领导人、敏感事件 | 政治讨论、敏感言论 |
| 涉黄 | 色情、低俗、性暗示 | 色情描述、低俗图片 |
| 涉暴 | 暴力、血腥、恐怖 | 暴力描述、恐怖内容 |
| 涉赌 | 赌博、博彩推广 | 赌博网站、博彩信息 |
| 诈骗 | 虚假信息、欺诈诱导 | 虚假中奖、钓鱼链接 |
| 广告 | 商业推广、营销链接 | 微信推广、商业链接 |
| 辱骂 | 人身攻击、侮辱语言 | 脏话、人身攻击 |

**注意**：社区内分享自己的编程作品不算广告。

# 风险等级定义
- **low**：内容完全正常
- **medium**：轻微违规或疑似违规
- **high**：严重违规

# 处理建议定义
- **pass**：通过审核
- **review**：需人工复核
- **delete**：建议删除

# 输出格式【必须严格遵守】

你必须且只能输出一个合法的JSON对象，不要输出任何其他内容。

JSON格式如下：
\`\`\`json
{
  "riskLevel": "<low|medium|high>",
  "violations": ["<违规类型1>", "<违规类型2>"],
  "reason": "<判断理由>",
  "recommendation": "<pass|review|delete>",
  "confidence": <0.0-1.0之间的数字>
}
\`\`\`

# 审核示例

**示例1 - 正常内容**
输入内容：今天做了一个小游戏，欢迎大家来玩！
输出：
{"riskLevel":"low","violations":[],"reason":"用户分享自己的编程作品，内容正常","recommendation":"pass","confidence":0.95}

**示例2 - 广告内容**
输入内容：加微信xxx免费领取课程，限时优惠！
输出：
{"riskLevel":"medium","violations":["广告"],"reason":"包含联系方式和推广信息","recommendation":"review","confidence":0.88}

**示例3 - 辱骂内容**
输入内容：你个傻X，滚蛋！
输出：
{"riskLevel":"high","violations":["辱骂"],"reason":"包含侮辱性语言","recommendation":"delete","confidence":0.96}

**示例4 - 多种违规**
输入内容：加群xxx看黄片，免费！
输出：
{"riskLevel":"high","violations":["涉黄","广告"],"reason":"涉及色情内容和推广信息","recommendation":"delete","confidence":0.98}

# 重要提醒
1. 只输出JSON，不要有任何其他文字
2. confidence必须是0到1之间的数字
3. violations数组为空时表示无违规
4. riskLevel和recommendation必须匹配`

// 规范化 AI API URL:与后端 server/services/aiReview.js#normalizeAiApiUrl 逻辑保持一致。
// 兼容用户填到 /v1(自动补 /chat/completions)与填完整 endpoint 两种形式。
// @param {string} rawUrl
// @returns {string} 规范化后的 URL
const normalizeAiApiUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  let url
  try {
    url = new URL(rawUrl.trim())
  } catch (e) {
    return rawUrl.trim() // 解析失败原样返回,留给后端报错
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return rawUrl.trim()
  }
  const pathname = url.pathname.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(pathname)) {
    return url.toString()
  }
  if (pathname === '' || pathname === '/v1' || /\/v\d+$/.test(pathname)) {
    url.pathname = pathname + '/chat/completions'
  }
  return url.toString()
}

// 失焦时自动补全 API 地址,所见即所得,减少手动输入出错
const autoCompleteAiApiUrl = () => {
  const current = configForm.value.ai_api_url
  if (!current || !current.trim()) return
  const normalized = normalizeAiApiUrl(current)
  if (normalized && normalized !== current) {
    configForm.value.ai_api_url = normalized
  }
}

const useDefaultPrompt = () => {
  configForm.value.ai_prompt = DEFAULT_AI_PROMPT
  ElMessage.success('已填充默认提示词')
}

const MASKED_PLACEHOLDERS = ['******', '***', '']
const sensitiveConfigKeys = ['ai_api_key', 'geetest_key', 'hcaptcha_secret_key', 'mysql_password']

const saveConfigs = async () => {
  savingConfigs.value = true
  try {
    const payload = { ...configForm.value }
    sensitiveConfigKeys.forEach(key => {
      if (MASKED_PLACEHOLDERS.includes(payload[key])) {
        delete payload[key]
      }
    })
    const res = await adminApi.batchUpdateConfigs(payload)
    if (res.code === 200) {
      ElMessage.success('保存成功')
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
  finally { savingConfigs.value = false }
}

const geetestConfigKeys = [
  'geetest_enabled', 'geetest_id', 'geetest_key', 'geetest_product',
  'geetest_login', 'geetest_register', 'geetest_like', 'geetest_comment',
  'geetest_reply', 'geetest_report', 'geetest_publish_work', 'geetest_publish_post',
  'geetest_favorite', 'geetest_update_profile', 'geetest_create_studio',
  'geetest_join_studio', 'geetest_submit_work', 'geetest_review_member', 'geetest_studio_management',
  'geetest_developer_app', 'geetest_im_message', 'geetest_im_search',
  'geetest_im_create_group'
]

const saveSecurityConfig = async () => {
  savingConfigs.value = true
  try {
    configForm.value.hcaptcha_expire_minutes = String(hcaptchaExpireMinutes.value)
    const securityPayload = Object.fromEntries(
      geetestConfigKeys.map(key => [key, configForm.value[key]])
    )
    Object.assign(securityPayload, {
      hcaptcha_enabled: configForm.value.hcaptcha_enabled,
      hcaptcha_site_key: configForm.value.hcaptcha_site_key,
      hcaptcha_expire_minutes: configForm.value.hcaptcha_expire_minutes
    })
    if (MASKED_PLACEHOLDERS.includes(securityPayload.geetest_key)) {
      delete securityPayload.geetest_key
    }
    if (!MASKED_PLACEHOLDERS.includes(configForm.value.hcaptcha_secret_key)) {
      securityPayload.hcaptcha_secret_key = configForm.value.hcaptcha_secret_key
    }
    const res = await adminApi.batchUpdateConfigs(securityPayload)
    if (res.code === 200) {
      ElMessage.success('保存成功')
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
  finally { savingConfigs.value = false }
}

// 实时日志
const realtimeLogs = ref([])
const realtimeLogsRef = ref(null)
const loadingRealtimeLogs = ref(false)
const autoRefreshLogs = ref(false)
const logSource = ref('memory') // 修复: 支持切换日志来源 memory/file
let logRefreshInterval = null
// 爬取热榜日志轮询定时器提升为组件级 ref，便于 onBeforeUnmount 统一清理
const crawlLogInterval = ref(null)

const fetchRealtimeLogs = async () => {
  loadingRealtimeLogs.value = true
  try {
    // 手动刷新始终重新获取最近日志，避免来源切换后沿用另一来源时间戳导致空列表。
    const res = await adminApi.getRealtimeLogs(null, 500, logSource.value)
    if (res.code === 200) {
      const logs = Array.isArray(res.data?.logs)
        ? res.data.logs
        : (logSource.value === 'file' ? res.data?.fileLogs : res.data?.memoryLogs) || []
      realtimeLogs.value = logs.slice(-500)
      nextTick(() => {
        if (realtimeLogsRef.value) {
          realtimeLogsRef.value.scrollTop = realtimeLogsRef.value.scrollHeight
        }
      })
    }
  } catch (e) {
    console.error('获取实时日志失败:', e)
  } finally {
    loadingRealtimeLogs.value = false
  }
}

const toggleAutoRefresh = (val) => {
  if (val) {
    logRefreshInterval = setInterval(fetchRealtimeLogs, 2000)
  } else {
    if (logRefreshInterval) {
      clearInterval(logRefreshInterval)
      logRefreshInterval = null
    }
  }
}

const clearRealtimeLogs = async () => {
  try {
    const res = await adminApi.clearRealtimeLogs()
    if (res.code === 200) {
      realtimeLogs.value = []
      ElMessage.success('日志已清空')
    }
  } catch (e) {
    ElMessage.error('清空失败')
  }
}

// 操作日志
const operationLogs = ref([])
const loadingOperationLogs = ref(false)
const logPage = ref(1)
const logPageSize = ref(20)
const logTotal = ref(0)
const logDetailDialogVisible = ref(false)
const logDetailContent = ref('')
const logFilters = ref({ userId: null, action: '', targetType: '', dateRange: [] })
const logFilterOptions = ref({ operators: [], actions: [], targetTypes: [] })

const actionNames = {
  'update_user_password': '修改用户密码',
  'update_user': '更新用户信息',
  'update_user_status': '更新用户状态',
  'update_user_role': '更新用户角色',
  'update_user_level': '更新用户等级',
  'impersonate_user': '模拟登录用户',
  'delete_user': '删除用户',
  'view_user_detail': '查看用户详情',
  'update_work': '更新作品',
  'set_work_featured': '设置精选作品',
  'delete_work': '删除作品',
  'recalibrate_works': '重新校准作品',
  'create_banner': '创建轮播图',
  'update_banner': '更新轮播图',
  'delete_banner': '删除轮播图',
  'crawl_banners': '爬取轮播图',
  'update_comment_status': '更新评论状态',
  'delete_comment': '删除评论',
  'handle_report': '处理举报',
  'ai_review': 'AI审核',
  'ai_auto_handle_reports': 'AI自动处理举报',
  'add_ip_ban': '添加IP封禁',
  'remove_ip_ban': '移除IP封禁',
  'create_announcement': '创建公告',
  'update_announcement': '更新公告',
  'delete_announcement': '删除公告',
  'update_config': '更新系统配置',
  'batch_update_config': '批量更新配置',
  'add_sensitive_word': '添加敏感词',
  'update_sensitive_word': '更新敏感词',
  'delete_sensitive_word': '删除敏感词',
  'batch_import_sensitive_words': '批量导入敏感词',
  'update_role_permissions': '更新角色权限',
  'reset_role_permissions': '重置角色权限',
  'view_studio_detail': '查看工作室详情',
  'update_studio': '更新工作室',
  'update_studio_status': '更新工作室状态',
  'update_studio_points': '更新工作室积分',
  'delete_studio': '删除工作室',
  'update_studio_member': '更新工作室成员',
  'remove_studio_member': '移除工作室成员',
  'remove_studio_work': '移除工作室作品',
  'set_work_score': '设置作品分数',
  'send_notification': '发送通知',
  'send_batch_notifications': '批量发送通知',
  'send_all_notification': '全员发送通知',
  'delete_post': '删除帖子',
  'update_post': '更新帖子',
  'set_post_essence': '设置精华帖',
  'set_post_top': '设置置顶帖',
  'view_codemao_token': '查看编程猫令牌',
  'restore_from_impersonate': '恢复管理员身份',
  'crawl_work': '抓取单个作品',
  'crawl_hot_works': '抓取热门作品',
  'crawl_user_works': '抓取用户作品',
  'crawl_post_works': '按关键词抓取作品',
  'clear_realtime_logs': '清空实时日志',
  'merge_reports': '合并重复举报',
  'ai_batch_review': '批量 AI 审核',
  'review_studio_member': '审核工作室成员',
  'review_studio': '审核工作室',
  'create_developer_app': '创建开发者应用',
  'update_developer_app': '更新开发者应用',
  'rotate_developer_app_secret': '重置应用密钥',
  'rotate_developer_app_secret_admin': '管理员重置应用密钥',
  'review_developer_app': '审核开发者应用',
  'update_developer_app_rate_limit': '调整应用限流',
  'revoke_developer_app_tokens': '撤销应用令牌',
  'delete_developer_app': '删除开发者应用',
  'revoke_app_authorization': '撤销应用授权',
  'warn_user': '警告用户',
  'acknowledge_user_warning': '用户签署警告保证书',
  'im_report_disable_user': '根据即时通讯举报禁用用户',
  'preview_recalibrate_works': '预览作品校准',
  'apply_recalibrate_works': '执行作品校准',
  'assign_forum_board_moderator': '任命论坛版主',
  'update_forum_board_moderator': '更新论坛版主',
  'remove_forum_board_moderator': '移除论坛版主',
  'move_post': '移动帖子',
  'merge_posts': '合并帖子',
  'restore_post_revision': '恢复帖子历史版本',
  'create_forum_board': '创建论坛版块',
  'update_forum_board': '更新论坛版块',
  'disable_forum_board': '停用论坛版块',
  'delete_forum_board': '删除论坛版块',
  'update_forum_attention_settings': '更新论坛关注设置',
  'db_migration_start': '开始数据库迁移',
  'db_migration_success': '数据库迁移成功',
  'db_migration_failed': '数据库迁移失败',
  'db_migration_error': '数据库迁移异常',
  'member_permissions_updated': '更新成员权限',
  'invite_created': '创建工作室邀请',
  'invite_revoked': '撤销工作室邀请',
  'announcement_created': '发布工作室公告',
  'task_created': '创建工作室任务',
  'task_status_updated': '更新任务状态',
  'settings_updated': '更新工作室设置',
  'studio_work_display_updated': '更新工作室作品展示',
  'blacklist_added': '加入工作室黑名单',
  'blacklist_removed': '移出工作室黑名单',
  'discussion_deleted': '删除工作室讨论',
  'forum_post_created': '创建工作室论坛帖子',
  'forum_post_state_updated': '更新工作室帖子状态',
  'forum_post_deleted': '删除工作室论坛帖子',
  'forum_reply_deleted': '删除工作室论坛回复',
  'studio_profile_updated': '更新工作室资料',
  'member_application_approved': '批准成员申请',
  'studio_work_approved': '批准工作室作品',
  'studio_work_rejected': '拒绝工作室作品',
  'member_role_updated': '更新成员角色',
  'member_removed': '移除工作室成员'
}

const targetTypeNames = {
  'user': '用户',
  'work': '作品',
  'banner': '轮播图',
  'comment': '评论',
  'report': '举报',
  'ip_ban': 'IP封禁',
  'announcement': '公告',
  'system_config': '系统配置',
  'sensitive_word': '敏感词',
  'role': '角色',
  'studio': '工作室',
  'studio_member': '工作室成员',
  'studio_work': '工作室作品',
  'notification': '通知',
  'post': '帖子',
  'developer_app': '开发者应用',
  'user_app_authorization': '应用授权',
  'user_warning': '用户警告',
  'forum_board': '论坛版块',
  'database': '数据库',
  'system': '系统',
  'operation_log': '操作日志'
}

const actionVerbNames = {
  view: '查看', create: '创建', update: '更新', delete: '删除',
  add: '添加', remove: '移除', crawl: '抓取', batch: '批量处理',
  review: '审核', reset: '重置', clear: '清空', apply: '执行',
  preview: '预览', send: '发送', restore: '恢复', revoke: '撤销'
}
const resourceNames = {
  users: '用户', user: '用户', works: '作品', work: '作品', comments: '评论',
  posts: '帖子', post: '帖子', banners: '轮播图', banner: '轮播图',
  announcements: '公告', announcement: '公告', reports: '举报', report: '举报',
  studios: '工作室', studio: '工作室', roles: '角色', role: '角色',
  configs: '系统配置', sensitive: '敏感词', notifications: '通知',
  operation: '操作日志', logs: '日志', forum: '论坛', boards: '版块',
  proxy: '代理配置', captcha: '验证码', developer: '开发者应用',
  permissions: '权限', realtime: '实时日志', overview: '概览',
  trends: '趋势', trend: '趋势', stats: '统计数据', stat: '统计数据'
}

const getActionName = (action) => {
  if (actionNames[action]) return actionNames[action]
  if (action?.startsWith('admin_')) {
    const parts = action.slice(6).split('_')
    const verb = actionVerbNames[parts.shift()] || '操作'
    const resource = parts.map(part => resourceNames[part] || '').filter(Boolean).join('·')
    return resource ? `${verb}${resource}` : '后台操作'
  }
  return '系统操作'
}
const getTargetTypeName = (type) => targetTypeNames[type] || resourceNames[type] || '其他对象'

const detailKeyNames = {
  schema_version: '日志结构版本', log_kind: '日志类型', business_operation: '业务操作',
  operator: '操作者', id: '编号', username: '用户名', nickname: '昵称', role: '角色',
  request: '请求信息', request_id: '请求编号', method: '请求方法', path: '请求路径',
  route: '路由', params: '路径参数', query: '查询参数', body: '提交内容',
  target: '操作目标', type: '类型', before: '操作前完整数据', after: '操作后完整数据',
  business_details: '业务详情', result: '执行结果', success: '是否成功',
  http_status: 'HTTP 状态码', business_code: '业务状态码', message: '结果说明',
  response: '响应数据', change: '数据变化', context: '操作环境', ip: 'IP 地址',
  user_agent: '浏览器标识', referer: '来源页面', duration_ms: '耗时（毫秒）',
  recorded_at: '记录时间', created_at: '创建时间', updated_at: '更新时间',
  title: '标题', content: '正文内容', image_url: '图片地址', link_url: '跳转地址',
  sort: '排序', sort_order: '排序', is_active: '是否启用', color: '颜色',
  show_top_bar: '顶部显示', show_popup: '弹窗显示', show_community: '社区显示',
  author_id: '发布者编号', status: '状态', reason: '原因', note: '备注',
  name: '名称', description: '说明', details: '详情', changes: '修改内容',
  target_type: '目标类型', target_id: '目标编号', user_id: '用户编号',
  old_status: '原状态', new_status: '新状态', oldScore: '原分数',
  newScore: '新分数', oldLevel: '原等级', newLevel: '新等级',
  count: '数量', permissions: '权限列表', action: '操作'
}

const translateLogDetails = (value) => {
  if (Array.isArray(value)) return value.map(translateLogDetails)
  if (!value || typeof value !== 'object') {
    if (value === 'business_operation') return '业务操作'
    return value
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    detailKeyNames[key] || key,
    translateLogDetails(item)
  ]))
}

const fetchOperationLogs = async () => {
  loadingOperationLogs.value = true
  try {
    const [startDate, endDate] = logFilters.value.dateRange || []
    const res = await adminApi.getOperationLogs({
      page: logPage.value,
      pageSize: logPageSize.value,
      userId: logFilters.value.userId || undefined,
      action: logFilters.value.action || undefined,
      targetType: logFilters.value.targetType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    })
    if (res.code === 200) {
      operationLogs.value = res.data.list
      logTotal.value = res.data.pagination?.total || 0
    }
  } catch (e) {}
  finally { loadingOperationLogs.value = false }
}

const fetchOperationLogOptions = async () => {
  try {
    const res = await adminApi.getOperationLogOptions()
    if (res.code === 200) logFilterOptions.value = res.data
  } catch (e) {}
}

const applyLogFilters = () => {
  logPage.value = 1
  fetchOperationLogs()
}

const resetLogFilters = () => {
  logFilters.value = { userId: null, action: '', targetType: '', dateRange: [] }
  logPage.value = 1
  fetchOperationLogs()
}

const handleLogPageSizeChange = () => {
  logPage.value = 1
  fetchOperationLogs()
}

const showLogDetail = (log) => {
  let details = log.audit_details
  if (!details || typeof details !== 'object') {
    try { details = log.details ? JSON.parse(log.details) : {} } catch (e) { details = { legacy_raw_details: log.details || '' } }
  }
  logDetailContent.value = JSON.stringify(translateLogDetails({
    日志编号: log.id,
    操作者: log.user || details.operator || { id: log.user_id, name: '历史记录操作者' },
    操作: { 操作代码: log.action, 中文名称: getActionName(log.action) },
    操作目标: { 类型: getTargetTypeName(log.target_type), 编号: log.target_id },
    IP地址: log.ip_address,
    浏览器标识: log.user_agent,
    操作时间: log.created_at,
    完整审计详情: details
  }), null, 2)
  logDetailDialogVisible.value = true
}

// 权限管理
const rolePermissionsList = ref([])
const allPermissions = ref([])
const activeRoleTab = ref('reviewer')
const editingRole = ref({ name: '', level: 0, permissions: [] })

const permissionCategories = computed(() => {
  const categories = new Set()
  allPermissions.value.forEach(p => categories.add(p.category))
  return Array.from(categories)
})

const getPermissionsByCategory = (category) => {
  return allPermissions.value.filter(p => p.category === category)
}

const fetchRolePermissions = async () => {
  try {
    const [permRes, roleRes] = await Promise.all([
      adminApi.getPermissions(),
      adminApi.getRolePermissions()
    ])
    if (permRes.code === 200) allPermissions.value = permRes.data
    if (roleRes.code === 200) {
      rolePermissionsList.value = roleRes.data
      // 设置当前编辑的角色
      const currentRole = roleRes.data.find(r => r.key === activeRoleTab.value)
      if (currentRole) {
        editingRole.value = {
          name: currentRole.name,
          level: currentRole.level,
          permissions: [...currentRole.permissions]
        }
      }
    }
  } catch (e) {
    console.error('获取权限数据失败:', e)
  }
}

const handleRoleTabChange = (tabName) => {
  const role = rolePermissionsList.value.find(r => r.key === tabName)
  if (role) {
    editingRole.value = {
      name: role.name,
      level: role.level,
      permissions: [...role.permissions]
    }
  }
}

const saveRolePermissions = async () => {
  try {
    const res = await adminApi.updateRolePermissions(activeRoleTab.value, editingRole.value)
    if (res.code === 200) {
      ElMessage.success('权限保存成功')
      fetchRolePermissions()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const resetRolePermissions = async (role) => {
  try {
    await ElMessageBox.confirm('确定重置该角色的权限为默认值吗？', '提示', { type: 'warning' })
    const res = await adminApi.resetRolePermissions(role)
    if (res.code === 200) {
      ElMessage.success('权限已重置')
      fetchRolePermissions()
    }
  } catch (e) {}
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

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch (_) {
    ElMessage.warning('复制失败，请手动复制')
  }
}

const statusText = (s) => ({ pending: '待审核', active: '已通过', rejected: '已拒绝', suspended: '已停用' }[s] || s || '-')

const auditActionText = (a) => ({
  review_approve: '审核通过', review_reject: '审核拒绝', review_suspend: '停用',
  rate_limit_change: '修改限流', revoke_all_tokens: '撤销全部令牌', rotate_secret: '重置密钥', delete_app: '删除应用'
}[a] || a)

const fetchDeveloperAppAuditLogs = async (page = 1) => {
  if (!developerAppDetail.value?.id) return
  loadingDeveloperAppAuditLogs.value = true
  developerAppAuditLogsPage.value = page
  try {
    const res = await adminApi.getDeveloperAppAuditLogs(developerAppDetail.value.id, { page, pageSize: 10 })
    if (res.code === 200) {
      developerAppAuditLogs.value = res.data?.list || []
      developerAppAuditLogsTotal.value = res.data?.total ?? res.data?.pagination?.total ?? 0
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.msg || '加载审核历史失败')
  } finally {
    loadingDeveloperAppAuditLogs.value = false
  }
}

const fetchDeveloperAppStats = async () => {
  if (!developerAppDetail.value?.id) return
  try {
    const [stats, detail] = await Promise.all([
      adminApi.getDeveloperAppStats(developerAppDetail.value.id),
      adminApi.getDeveloperAppStatsDetail(developerAppDetail.value.id, { days: 14 })
    ])
    if (stats.code === 200) developerAppStats.value = stats.data || {}
    if (detail.code === 200) developerAppStatsDetail.value = detail.data || {}
  } catch (e) {
    // stats are non-critical
  }
}

const editRateLimit = async (app) => {
  try {
    const { value } = await ElMessageBox.prompt(
      '当前限流: ' + (app.rate_limit_per_min) + ' 次/分钟',
      '修改限流',
      { inputValue: String(app.rate_limit_per_min || 60), inputValidator: v => { const n = parseInt(v,10); return n >= 1 && n <= 10000 ? true : '请输入 1-10000 的整数' } }
    )
    const res = await adminApi.updateDeveloperAppRateLimit(app.id, parseInt(value, 10))
    if (res.code === 200) {
      ElMessage.success('限流已更新')
      openDeveloperAppDetail({ id: app.id })
      fetchDeveloperApps()
    } else { ElMessage.error(res.msg || '更新失败') }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e.response?.data?.msg || '更新失败')
  }
}

const confirmRevokeAllTokens = async (app) => {
  try {
    await ElMessageBox.confirm('确认强制撤销该应用的全部令牌？已授权用户需重新授权。', '撤销全部令牌', { type: 'warning' })
    const res = await adminApi.revokeAllTokens(app.id)
    if (res.code === 200) {
      ElMessage.success('已撤销 ' + (res.data?.accessCount || 0) + ' 个访问令牌, ' + (res.data?.refreshCount || 0) + ' 个刷新令牌')
      openDeveloperAppDetail({ id: app.id })
    } else { ElMessage.error(res.msg || '操作失败') }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e.response?.data?.msg || '操作失败')
  }
}

const confirmRegenerateSecret = async (app) => {
  try {
    await ElMessageBox.confirm('确认重新生成密钥？旧密钥立即失效，全部令牌将被撤销。', '重新生成密钥', { type: 'warning' })
    const res = await adminApi.regenerateSecret(app.id)
    if (res.code === 200) {
      ElMessage({ message: res.msg || '密钥已重置', type: 'success', duration: 8000 })
      ElMessageBox.alert(
        'Client ID: ' + (res.data?.client_id) + '\nClient Secret: ' + (res.data?.client_secret) + '\n\n请立即保存，关闭后无法再次查看明文。',
        '新密钥（请保存）',
        { confirmButtonText: '我已保存', dangerouslyUseHTMLString: false }
      )
      openDeveloperAppDetail({ id: app.id })
    } else { ElMessage.error(res.msg || '操作失败') }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e.response?.data?.msg || '操作失败')
  }
}

const confirmDeleteApp = async (app) => {
  try {
    await ElMessageBox.confirm('确认永久删除应用「' + app.name + '」？相关令牌、授权、审核记录将一并删除，不可恢复。', '删除应用', { type: 'warning', confirmButtonText: '确认删除' })
    const res = await adminApi.deleteDeveloperApp(app.id)
    if (res.code === 200) {
      ElMessage.success('应用已删除')
      developerAppDetailVisible.value = false
      fetchDeveloperApps()
    } else { ElMessage.error(res.msg || '删除失败') }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e.response?.data?.msg || '删除失败')
  }
}

const formatDateTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const formatDateTimeSeconds = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const isIpBanActive = (row) => {
  if (!row.expires_at) return true
  return new Date(row.expires_at) > new Date()
}



const onDeveloperAppPageChange = (p) => {
  developerAppFilter.value.page = p
  fetchDeveloperApps()
}

const fetchDeveloperApps = async () => {
  loadingDeveloperApps.value = true
  try {
    const f = developerAppFilter.value
    const res = await adminApi.getDeveloperApps({
      status: f.status || undefined,
      keyword: f.keyword || undefined,
      page: f.page,
      pageSize: f.pageSize
    })
    if (res.code === 200) {
      developerApps.value = res.data?.list || []
      developerAppTotal.value = res.data?.total ?? res.data?.pagination?.total ?? 0
    } else {
      ElMessage.error(res.msg || '加载失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.msg || '加载失败')
  } finally {
    loadingDeveloperApps.value = false
  }
}

const sparklinePoints = computed(() => {
  const dayMap = developerAppStatsDetail.value.perDay || {}
  const days = Object.keys(dayMap).sort()
  if (!days.length) return ''
  const vals = days.map(d => dayMap[d])
  const max = Math.max(...vals, 1)
  const step = sparklineW / Math.max(days.length - 1, 1)
  return vals.map((v, i) => (i * step).toFixed(1) + ',' + (sparklineH - (v / max) * (sparklineH - 4) - 2).toFixed(1)).join(' ')
})

const developerAppStatusText = (status) => ({
  pending: '待审核', active: '已通过', rejected: '已拒绝', suspended: '已停用'
}[status] || status || '-')

const fetchDeveloperAppCalls = async (page = 1) => {
  if (!developerAppDetail.value?.id) return
  loadingDeveloperAppCalls.value = true
  developerAppCallPage.value = page
  try {
    const res = await adminApi.getDeveloperAppCalls(developerAppDetail.value.id, { page, pageSize: developerAppCallPageSize })
    if (res.code === 200) {
      developerAppCalls.value = res.data?.list || []
      developerAppCallTotal.value = res.data?.total ?? res.data?.pagination?.total ?? 0
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.msg || '加载调用记录失败')
  } finally {
    loadingDeveloperAppCalls.value = false
  }
}

const openDeveloperAppDetail = async (row) => {
  developerAppDetailVisible.value = true
  loadingDeveloperAppDetail.value = true
  developerAppDetail.value = null
  developerAppCalls.value = []
  try {
    const res = await adminApi.getDeveloperApp(row.id)
    if (res.code === 200) {
      developerAppDetail.value = res.data
      await Promise.all([fetchDeveloperAppCalls(1), fetchDeveloperAppAuditLogs(1), fetchDeveloperAppStats()])
    } else {
      ElMessage.error(res.msg || '加载应用详情失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.msg || '加载应用详情失败')
  } finally {
    loadingDeveloperAppDetail.value = false
  }
}

const reviewDeveloperApp = async (row, action) => {
  const labels = { approve: '通过', reject: '拒绝', suspend: '停用' }
  try {
    const { value: note } = await ElMessageBox.prompt(
      `确认${labels[action] || action}应用「${row.name}」？可填写备注`,
      '开发者应用审核',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: action === 'reject' ? '整改建议（拒绝时必填，至少5字）' : '审核备注（可选）',
        inputValue: ''
      }
    )
    const res = await adminApi.reviewDeveloperApp(row.id, { action, note })
    if (res.code === 200) {
      ElMessage.success(res.msg || '审核完成')
      await fetchDeveloperApps()
      if (developerAppDetailVisible.value && row.id) await openDeveloperAppDetail({ id: row.id })
    } else {
      ElMessage.error(res.msg || '审核失败')
    }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e.response?.data?.msg || '审核失败')
  }
}

const handleMenuSelect = async (key) => {
  if (key === 'im-admin') {
    try {
      const popup = window.open('about:blank', '_blank')
      const res = await imApi.createSsoTicket({ action: 'admin' })
      const safeUrl = getSafeExternalUrl(res.data?.url)
      if (res.code === 200 && safeUrl) popup ? (popup.location.href = safeUrl) : window.open(safeUrl, '_blank', 'noopener,noreferrer')
      else { popup?.close(); ElMessage.warning(res.msg || '即时通讯后台暂不可用') }
    } catch (error) { ElMessage.error(error.response?.data?.msg || '无法进入即时通讯后台') }
    return
  }
  activeMenu.value = key
  if (key === 'dashboard') { fetchStats(); fetchTrends() }
  if (key === 'users') fetchUsers()
  if (key === 'works') fetchWorks()
  if (key === 'comments') fetchComments()
  if (key === 'posts') { /* Posts component handles its own data fetching */ }
  if (key === 'reports') fetchReports()
  if (key === 'banners') fetchBanners()
  if (key === 'ipbans') fetchIpBans()
  if (key === 'announcements') fetchAnnouncements()
  if (key === 'sensitive') fetchSensitiveWords()
  if (key === 'configs') fetchConfigs()
  if (key === 'logs') {
    fetchOperationLogOptions()
    fetchOperationLogs()
  }
  if (key === 'permissions') fetchRolePermissions()
  if (key === 'developer-apps') fetchDeveloperApps()
}

const fetchStats = async () => {
  loadingStats.value = true
  try {
    const res = await adminApi.getStats()
    if (res.code === 200) stats.value = res.data
  } catch (e) {}
  loadingStats.value = false
}

const fetchTrends = async () => {
  try {
    const res = await adminApi.getTrends(7)
    if (res.code === 200) {
      await nextTick()
      renderChart(res.data)
    }
  } catch (e) {}
}

const renderChart = (data) => {
  if (!chartRef.value) return
  // 修复: 不足 2 个数据点时不绘制,避免除以零导致 stepX 为 Infinity
  if (!data.dates || data.dates.length < 2) return

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(280, chartRef.value.clientWidth)
  canvas.height = window.innerWidth <= 768 ? 240 : 300
  canvas.style.width = '100%'
  canvas.style.height = `${canvas.height}px`
  chartRef.value.innerHTML = ''
  chartRef.value.appendChild(canvas)
  
  const ctx = canvas.getContext('2d')
  const padding = Math.min(50, Math.max(28, canvas.width * 0.1))
  const width = canvas.width - padding * 2
  const height = canvas.height - padding * 2
  
  const maxVal = Math.max(...data.users, ...data.works, ...data.comments, 10)
  const stepY = height / 5
  const stepX = width / (data.dates.length - 1)
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  ctx.strokeStyle = '#eee'
  ctx.lineWidth = 1
  for (let i = 0; i <= 5; i++) {
    ctx.beginPath()
    ctx.moveTo(padding, padding + stepY * i)
    ctx.lineTo(canvas.width - padding, padding + stepY * i)
    ctx.stroke()
    
    ctx.fillStyle = '#999'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(Math.round(maxVal - (maxVal / 5) * i), padding - 10, padding + stepY * i + 4)
  }
  
  ctx.textAlign = 'center'
  data.dates.forEach((date, i) => {
    const x = padding + stepX * i
    ctx.fillText(date.slice(5), x, canvas.height - 20)
  })
  
  const drawLine = (values, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    values.forEach((val, i) => {
      const x = padding + stepX * i
      const y = padding + height - (val / maxVal) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    
    values.forEach((val, i) => {
      const x = padding + stepX * i
      const y = padding + height - (val / maxVal) * height
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }
  
  drawLine(data.users, '#667eea')
  drawLine(data.works, '#f5576c')
  drawLine(data.comments, '#4facfe')
  
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#667eea'
  ctx.fillRect(canvas.width - 150, 10, 12, 12)
  ctx.fillStyle = '#333'
  ctx.textAlign = 'left'
  ctx.fillText('用户', canvas.width - 132, 20)
  
  ctx.fillStyle = '#f5576c'
  ctx.fillRect(canvas.width - 100, 10, 12, 12)
  ctx.fillStyle = '#333'
  ctx.fillText('作品', canvas.width - 82, 20)
  
  ctx.fillStyle = '#4facfe'
  ctx.fillRect(canvas.width - 50, 10, 12, 12)
  ctx.fillStyle = '#333'
  ctx.fillText('评论', canvas.width - 32, 20)
}

const searchUsers = () => { userPage.value = 1; fetchUsers() }

const loadProxyConfig = async () => {
  try {
    const res = await adminApi.getProxyConfig()
    if (res.code === 200) proxyConfig.value = { ...proxyConfig.value, ...res.data }
  } catch (_) {}
}
const saveProxyConfig = async () => {
  try {
    await adminApi.updateProxyConfig({
      enabled: proxyConfig.value.enabled,
      poolUrl: proxyConfig.value.poolUrl,
      protocol: proxyConfig.value.protocol || '',
      autoRefresh: proxyConfig.value.autoRefresh || 0
    })
    ElMessage.success('代理配置已保存')
    await loadProxyConfig()
  } catch (_) { ElMessage.error('保存失败') }
}
const testProxy = async () => {
  proxyTestLoading.value = true
  proxyTestResult.value = null
  try {
    const res = await adminApi.testProxy(proxyConfig.value.currentProxy)
    if (res.code === 200) {
      proxyTestResult.value = res.data
      if (res.data.ok) ElMessage.success(`代理可用 ${res.data.latency}ms`)
      else ElMessage.warning('代理不可用')
    }
  } catch (_) { ElMessage.error('测试失败') }
  finally { proxyTestLoading.value = false }
}
const saveProxyAutoRefresh = async (val) => {
  try {
    await adminApi.updateProxyConfig({
      enabled: proxyConfig.value.enabled,
      poolUrl: proxyConfig.value.poolUrl,
      protocol: proxyConfig.value.protocol,
      autoRefresh: val
    })
    ElMessage.success(val > 0 ? `已开启代理自动刷新(每${val}分钟)` : '已关闭代理自动刷新')
  } catch (_) { ElMessage.error('设置失败') }
}
const refreshProxy = async () => {
  if (!proxyConfig.value.poolUrl) { ElMessage.warning('请先填写代理池API地址'); return }
  proxyLoading.value = true
  proxyTestResult.value = null
  try {
    const res = await adminApi.refreshProxy()
    if (res.code === 200) {
      proxyTestResult.value = res.data
      await loadProxyConfig()
      ElMessage.success(`已获取代理: ${res.data.host}:${res.data.port}`)
    } else { ElMessage.error(res.msg || '抓取失败') }
  } catch (_) { ElMessage.error('抓取失败') }
  finally { proxyLoading.value = false }
}
const fetchUsers = async () => {
  loadingUsers.value = true
  try {
    const res = await adminApi.getUsers({ 
      page: userPage.value, pageSize: userPageSize.value,
      keyword: userSearch.value, role: userRoleFilter.value, status: userStatusFilter.value
    })
    if (res.code === 200) { users.value = res.data.list; userTotal.value = res.data.pagination?.total || res.data.total || 0 }
  } catch (e) {}
  loadingUsers.value = false
}

const toggleUserRole = async (user) => {
  // 修复: 只允许在 admin/user 之间切换,避免 reviewer/moderator/superadmin 被误提升为 admin
  if (!['admin', 'user'].includes(user.role)) {
    ElMessage.warning('请使用修改角色功能切换该用户角色')
    return
  }
  const newRole = user.role === 'admin' ? 'user' : 'admin'
  try {
    const res = await adminApi.updateUserRole(user.id, newRole)
    if (res.code === 200) { user.role = newRole; ElMessage.success('更新成功') }
  } catch (e) { ElMessage.error('更新失败') }
}

const toggleUserStatus = async (user) => {
  const newStatus = user.status === 'active' ? 'disabled' : 'active'
  try {
    const res = await adminApi.updateUserStatus(user.id, newStatus)
    if (res.code === 200) { 
      user.status = newStatus
      ElMessage.success('更新成功')
      if (userDetail.value && userDetail.value.user.id === user.id) {
        userDetail.value.user.status = newStatus
      }
    }
  } catch (e) { ElMessage.error('更新失败') }
}

const handleToggleActiveDalao = async (user, val) => {
  try {
    const res = await adminApi.updateUser(user.id, { is_active_dalao: val })
    if (res.code === 200) {
      user.is_active_dalao = val
      ElMessage.success(val ? '已授予「活跃大佬」荣誉' : '已取消「活跃大佬」荣誉')
      addHonorNoteAuto(val ? '授予「活跃大佬」荣誉' : '取消「活跃大佬」荣誉')
    } else {
      // 修复: API 失败时回滚 UI 状态,与 admin/Users.vue 保持一致
      user.is_active_dalao = !val
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    // 修复: 网络错误时也回滚
    user.is_active_dalao = !val
    ElMessage.error('操作失败')
  }
}

const honorNote = ref('')
const honorNotes = ref([])

const loadHonorNotes = () => {
  if (!userDetail.value) return
  const key = `honor_notes_${userDetail.value.user.id}`
  try {
    const stored = localStorage.getItem(key)
    honorNotes.value = stored ? JSON.parse(stored) : []
  } catch (e) {
    honorNotes.value = []
  }
}

const saveHonorNotes = () => {
  if (!userDetail.value) return
  const key = `honor_notes_${userDetail.value.user.id}`
  localStorage.setItem(key, JSON.stringify(honorNotes.value))
}

const addHonorNote = () => {
  if (!honorNote.value.trim()) {
    ElMessage.warning('请输入备注内容')
    return
  }
  honorNotes.value.unshift({
    content: honorNote.value.trim(),
    operator: userStore.user?.nickname || userStore.user?.username || '管理员',
    time: new Date().toISOString()
  })
  saveHonorNotes()
  honorNote.value = ''
  ElMessage.success('备注已添加')
}

const addHonorNoteAuto = (content) => {
  honorNotes.value.unshift({
    content,
    operator: userStore.user?.nickname || userStore.user?.username || '管理员',
    time: new Date().toISOString()
  })
  saveHonorNotes()
}

const showUserDetail = async (user) => {
  userDetailVisible.value = true
  userDetailLoading.value = true
  userDetail.value = null
  honorNotes.value = []
  honorNote.value = ''
  // 修复: 切换用户时重置 token 查看状态
  tokenRevealed.value = false
  fullToken.value = ''
  try {
    const res = await adminApi.getUserDetail(user.id)
    if (res.code === 200) {
      userDetail.value = res.data
      loadHonorNotes()
    } else {
      ElMessage.error(res.msg || '获取用户详情失败')
    }
  } catch (e) {
    ElMessage.error('获取用户详情失败')
  }
  userDetailLoading.value = false
}

const showWorkDetail = (work) => {
  workDetail.value = work
  workEditing.value = false
  workEditReason.value = ''
  workDetailVisible.value = true
}

const enterWorkEdit = () => {
  const currentPublisher = workDetail.value.author
  workPublisherOptions.value = currentPublisher ? [currentPublisher] : []
  workEditForm.value = {
    name: workDetail.value.name,
    publisher_id: workDetail.value.user_id || currentPublisher?.id || null,
    preview: workDetail.value.preview || '',
    type: workDetail.value.type || '',
    ide_type: workDetail.value.ide_type || '',
    view_times: workDetail.value.view_times || 0,
    praise_times: workDetail.value.praise_times || 0,
    collection_times: workDetail.value.collection_times || 0,
    status: workDetail.value.status || 'published',
    is_featured: workDetail.value.is_featured || false,
    is_sidebar_recommended: workDetail.value.is_sidebar_recommended || false,
    sidebar_sort_order: workDetail.value.sidebar_sort_order || 0
  }
  workEditing.value = true
  searchWorkPublishers('')
}

const searchWorkPublishers = async (keyword) => {
  workPublisherLoading.value = true
  try {
    const res = await adminApi.getUsers({ page: 1, pageSize: 20, keyword: String(keyword || '').trim(), status: 'active' })
    if (res.code === 200) {
      const current = workDetail.value?.author
      const list = res.data?.list || []
      workPublisherOptions.value = current && !list.some(user => user.id === current.id) ? [current, ...list] : list
    }
  } finally {
    workPublisherLoading.value = false
  }
}

const saveWorkDetail = async () => {
  workDetailSaving.value = true
  try {
    const payload = { ...workEditForm.value }
    if (workEditReason.value) payload._reason = workEditReason.value
    const res = await adminApi.updateWork(workDetail.value.id, payload)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      workEditing.value = false
      workDetailVisible.value = false
      fetchWorks()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
  workDetailSaving.value = false
}

const showPasswordDialog = () => {
  passwordForm.value = { newPassword: '', confirmPassword: '' }
  passwordDialogVisible.value = true
}

const handleUpdatePassword = async () => {
  if (!passwordForm.value.newPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (passwordForm.value.newPassword.length < 6) {
    ElMessage.warning('密码长度至少6位')
    return
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  passwordLoading.value = true
  try {
    const res = await adminApi.updateUserPassword(userDetail.value.user.id, passwordForm.value.newPassword)
    if (res.code === 200) {
      ElMessage.success('密码修改成功')
      passwordDialogVisible.value = false
    } else {
      ElMessage.error(res.msg || '修改失败')
    }
  } catch (e) {
    ElMessage.error('修改失败')
  }
  passwordLoading.value = false
}

const showSendNotificationDialog = () => {
  notificationForm.value = {
    title: '', content: '', targetUser: userDetail.value.user, targetUsers: null, isAll: false,
    // 修复: 管理员可选项——是否使用管理员头像/显示管理员名称(默认都勾选)
    useAdminAvatar: true, showAdminName: true
  }
  notificationDialogVisible.value = true
}

// 一键登录：从用户详情弹窗内触发
const impersonateUserDetail = async () => {
  const user = userDetail.value.user
  if (user.id === userStore.user?.id) return
  try {
    await ElMessageBox.confirm(`确定要以 ${user.nickname || user.username} 的身份登录吗？`, '一键登录', { type: 'warning' })
    const res = await adminApi.impersonateUser(user.id)
    if (res.code === 200) {
      // 修复: httpOnly cookie 模式下不再写 sessionStorage token,仅保留 admin_token 标志
      userStore.user = res.data.user
      sessionStorage.setItem('admin_token', '1')
      ElMessage.success(`正在以 ${user.nickname || user.username} 身份登录...`)
      setTimeout(() => { window.location.href = '/' }, 500)
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.msg || '一键登录失败')
  }
}

const showBatchNotificationDialog = () => {
  notificationForm.value = { title: '', content: '', targetUser: null, targetUsers: null, isAll: false }
  selectedUserIds.value = []
  batchNotificationDialogVisible.value = true
}

const showAllUsersNotificationDialog = () => {
  notificationForm.value = { title: '', content: '', targetUser: null, targetUsers: null, isAll: true }
  batchNotificationDialogVisible.value = false
  notificationDialogVisible.value = true
}

const selectAllUsers = () => {
  selectedUserIds.value = users.value.map(u => u.id)
}

const clearSelectedUsers = () => {
  selectedUserIds.value = []
}

const handleUserSelection = (selection) => {
  selectedUserIds.value = selection.map(u => u.id)
}

const handleSendNotification = async () => {
  if (!notificationForm.value.title) {
    ElMessage.warning('请输入标题')
    return
  }
  if (!notificationForm.value.content) {
    ElMessage.warning('请输入内容')
    return
  }
  
  notificationLoading.value = true
  try {
    let res
    if (notificationForm.value.isAll) {
      res = await adminApi.sendAllUsersNotification(notificationForm.value.title, notificationForm.value.content)
    } else if (notificationForm.value.targetUser) {
      res = await adminApi.sendUserNotification(notificationForm.value.targetUser.id, notificationForm.value.title, notificationForm.value.content)
    } else {
      res = await adminApi.sendBatchNotifications(selectedUserIds.value, notificationForm.value.title, notificationForm.value.content)
    }
    
    if (res.code === 200) {
      ElMessage.success(res.msg || '发送成功')
      notificationDialogVisible.value = false
      batchNotificationDialogVisible.value = false
    } else {
      ElMessage.error(res.msg || '发送失败')
    }
  } catch (e) {
    ElMessage.error('发送失败')
  }
  notificationLoading.value = false
}

const handleBatchNotification = async () => {
  if (selectedUserIds.value.length === 0) {
    ElMessage.warning('请选择用户')
    return
  }
  if (!notificationForm.value.title) {
    ElMessage.warning('请输入标题')
    return
  }
  if (!notificationForm.value.content) {
    ElMessage.warning('请输入内容')
    return
  }
  
  notificationLoading.value = true
  try {
    const res = await adminApi.sendBatchNotifications(selectedUserIds.value, notificationForm.value.title, notificationForm.value.content)
    if (res.code === 200) {
      ElMessage.success(res.msg || '发送成功')
      batchNotificationDialogVisible.value = false
    } else {
      ElMessage.error(res.msg || '发送失败')
    }
  } catch (e) {
    ElMessage.error('发送失败')
  }
  notificationLoading.value = false
}

const searchWorks = () => { workPage.value = 1; fetchWorks() }
const fetchWorks = async () => {
  loadingWorks.value = true
  try {
    const res = await adminApi.getWorks({ 
      page: workPage.value, pageSize: workPageSize.value,
      keyword: workSearch.value, type: workTypeFilter.value, isFeatured: workFeaturedFilter.value
    })
    if (res.code === 200) { works.value = res.data.list; workTotal.value = res.data.pagination?.total || res.data.total || 0 }
  } catch (e) {
    console.error('获取作品列表失败:', e)
    ElMessage.error('获取作品列表失败')
  }
  loadingWorks.value = false
}

const recalibrateWorks = async () => {
  try {
    await ElMessageBox.confirm('第一阶段只扫描并生成差异预览，不会修改数据库。是否继续？', '只读扫描', { type: 'warning', confirmButtonText: '开始扫描' })
    recalibrating.value = true
    const res = await adminApi.recalibrateWorks()
    if (res.code !== 200) throw new Error(res.msg || '启动扫描失败')
    const jobId = res.data.id
    let job = res.data
    while (job.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 1500))
      const statusRes = await adminApi.getRecalibrationJob(jobId)
      if (statusRes.code !== 200) throw new Error(statusRes.msg || '获取扫描进度失败')
      job = statusRes.data
    }
    if (job.status !== 'ready') throw new Error(job.failures?.[0]?.reason || '扫描失败')
    if (!job.changedCount) return ElMessage.success('扫描完成，没有需要更新的数据')

    const samples = (job.changes || []).slice(0, 8).map(item =>
      `${item.name || item.codemaoWorkId}: ${item.oldValues?.type || '-'} → ${item.newValues?.type || '-'}`
    ).join('\n')
    await ElMessageBox.confirm(
      `扫描 ${job.total} 个作品，发现 ${job.changedCount} 个需更新，${job.unchangedCount} 个无变化，${job.failedCount} 个读取失败。\n\n差异样例：\n${samples}\n\n确认后才会写入；扫描后被人工修改的记录会自动跳过。`,
      '校准差异预览',
      { type: 'warning', confirmButtonText: `确认更新 ${job.changedCount} 项`, cancelButtonText: '取消，不修改' }
    )
    const applyRes = await adminApi.applyRecalibrationJob(jobId)
    if (applyRes.code !== 200) throw new Error(applyRes.msg || '启动应用失败')
    job = applyRes.data
    while (job.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const statusRes = await adminApi.getRecalibrationJob(jobId)
      if (statusRes.code !== 200) throw new Error(statusRes.msg || '获取应用进度失败')
      job = statusRes.data
    }
    if (job.status !== 'completed') throw new Error(job.failures?.[0]?.reason || '校准应用失败')
    ElMessage.success(`校准完成：更新 ${job.appliedCount} 项，跳过冲突 ${job.conflictCount} 项，失败 ${job.failedCount} 项`)
    fetchWorks()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      console.error('Recalibrate Error:', e)
      ElMessage.error(e?.message || e?.response?.data?.msg || '操作失败')
    }
  } finally {
    recalibrating.value = false
  }
}

const toggleWorkFeatured = async (work) => {
  try {
    const res = await adminApi.setWorkFeatured(work.id, !work.is_featured)
    if (res.code === 200) { work.is_featured = !work.is_featured; ElMessage.success(res.msg) }
  } catch (e) { ElMessage.error('操作失败') }
}

const handleDeleteWork = async (work) => {
  try {
    await ElMessageBox.confirm('确定删除该作品？删除后前台不可见，数据保留在数据库。', '提示', { type: 'warning' })
    const res = await adminApi.deleteWork(work.id)
    if (res.code === 200) { fetchWorks(); ElMessage.success('删除成功') }
  } catch (e) {}
}

const handlePurgeWork = async (work) => {
  try {
    const reasonResult = await ElMessageBox.prompt(
      '此操作会永久删除数据库中的作品及关联数据，并保留独立审计记录。请输入删除原因（至少 5 个字符）。',
      '彻底删除作品',
      { type: 'error', confirmButtonText: '下一步', inputPlaceholder: '例如：错误爬取，需要重新导入', inputValidator: value => (value || '').trim().length >= 5 || '请输入至少 5 个字符的原因' }
    )
    const idResult = await ElMessageBox.prompt(
      `最后确认：请输入编程猫作品 ID ${work.codemao_work_id}。删除后不可恢复，但可重新爬取。`,
      '不可逆操作确认',
      { type: 'error', confirmButtonText: '彻底删除', inputPlaceholder: String(work.codemao_work_id), inputValidator: value => String(value || '').trim() === String(work.codemao_work_id) || '作品 ID 不匹配' }
    )
    const res = await adminApi.purgeWork(work.id, {
      reason: reasonResult.value.trim(),
      confirmCodemaoWorkId: idResult.value.trim()
    })
    if (res.code === 200) {
      workDetailVisible.value = false
      await fetchWorks()
      ElMessage.success('已彻底删除，现在可以重新爬取')
    }
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.response?.data?.msg || '彻底删除失败')
  }
}

// 更多操作:隐藏/取消隐藏/删除
const handleWorkMoreAction = async (cmd, work) => {
  if (cmd === 'hide') {
    try {
      await ElMessageBox.confirm('隐藏后该作品从前台列表和详情页移除,数据保留,可在编辑中恢复。', '提示', { type: 'warning' })
      const res = await adminApi.updateWork(work.id, { status: 'hidden' })
      if (res.code === 200) {
        ElMessage.success('已隐藏')
        // 同步本地状态,关闭弹窗并刷新列表
        workDetail.value.status = 'hidden'
        fetchWorks()
      }
    } catch (e) {}
  } else if (cmd === 'unhide') {
    try {
      const res = await adminApi.updateWork(work.id, { status: 'published' })
      if (res.code === 200) {
        ElMessage.success('已恢复显示')
        workDetail.value.status = 'published'
        fetchWorks()
      }
    } catch (e) {}
  } else if (cmd === 'delete') {
    handleDeleteWork(work)
  } else if (cmd === 'purge') {
    handlePurgeWork(work)
  }
}

const searchComments = () => { commentPage.value = 1; fetchComments() }
const fetchComments = async () => {
  loadingComments.value = true
  try {
    const res = await adminApi.getComments({ 
      page: commentPage.value, pageSize: commentPageSize.value,
      keyword: commentSearch.value, status: commentStatusFilter.value,
      userId: commentUserId.value, workId: commentWorkId.value
    })
    if (res.code === 200) { comments.value = res.data.list; commentTotal.value = res.data.pagination?.total || res.data.total || 0 }
  } catch (e) {
    console.error('获取评论列表失败:', e)
    ElMessage.error('获取评论列表失败')
  }
  loadingComments.value = false
}

const showCommentDetail = (comment) => {
  commentDetail.value = comment
  commentDetailVisible.value = true
}

const getCommentWorkPath = (comment) => {
  const work = comment?.work
  if (!work) return ''
  const workId = work.codemao_work_id || work.id
  if (workId === undefined || workId === null || workId === '') return ''
  return router.resolve({ name: 'WorkDetail', params: { codemaoId: String(workId) } }).href
}

const getCommentPostPath = (comment) => {
  const postId = comment?.post?.id || comment?.post_id
  if (!postId) return ''
  return router.resolve({ name: 'PostDetail', params: { id: String(postId) } }).href
}

const openCommentTarget = (comment) => {
  if (!comment) return
  const workPath = getCommentWorkPath(comment)
  if (workPath) {
    window.open(workPath, '_blank')
    return
  }
  const postPath = getCommentPostPath(comment)
  if (postPath) {
    window.open(postPath, '_blank')
    return
  }
  ElMessage.warning('未找到评论所属作品或帖子')
}

const toggleCommentStatus = async (comment) => {
  const newStatus = comment.status === 'active' ? 'hidden' : 'active'
  try {
    const res = await adminApi.updateCommentStatus(comment.id, newStatus)
    if (res.code === 200) {
      comment.status = newStatus
      const listItem = comments.value.find(c => c.id === comment.id)
      if (listItem) listItem.status = newStatus
      ElMessage.success('更新成功')
    } else {
      ElMessage.error(res.msg || '更新失败')
    }
  } catch (e) { ElMessage.error('更新失败') }
}

const handleDeleteComment = async (comment) => {
  try {
    await ElMessageBox.confirm('确定删除该评论？', '提示', { type: 'warning' })
    const res = await adminApi.deleteComment(comment.id)
    if (res.code === 200) {
      comment.status = 'deleted'
      const listItem = comments.value.find(c => c.id === comment.id)
      if (listItem) listItem.status = 'deleted'
      fetchComments()
      ElMessage.success('删除成功')
    } else {
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const searchReports = () => { reportPage.value = 1; fetchReports() }
const fetchReports = async () => {
  loadingReports.value = true
  try {
    const res = await adminApi.getReports({ 
      page: reportPage.value, pageSize: reportPageSize.value,
      type: reportTypeFilter.value, status: reportStatusFilter.value
    })
    if (res.code === 200) { reports.value = res.data.list; reportTotal.value = res.data.pagination?.total || res.data.total || 0 }
  } catch (e) {
    console.error('获取举报列表失败:', e)
    ElMessage.error('获取举报列表失败')
  }
  loadingReports.value = false
}

const showReportDialog = (report) => {
  editingReport.value = report
  reportForm.value = { status: 'processing', handleNote: '', takeAction: false }
  aiReviewResult.value = null
  auditLogs.value = []
  auditLogsLoaded.value = false
  reportDialogVisible.value = true
}

const loadAuditLogs = async () => {
  if (!editingReport.value) return
  auditLogsLoading.value = true
  auditLogsLoaded.value = true
  try {
    const res = await adminApi.getReportAuditLogs(editingReport.value.id)
    if (res.code === 200) {
      auditLogs.value = res.data || []
    }
  } catch (e) {
    ElMessage.error('加载处理记录失败')
  } finally {
    auditLogsLoading.value = false
  }
}

const handleProcessReport = async () => {
  try {
    const res = await adminApi.handleReport(editingReport.value.id, reportForm.value)
    if (res.code === 200) {
      ElMessage.success('处理成功')
      reportDialogVisible.value = false
      fetchReports()
      fetchStats()
    }
  } catch (e) { ElMessage.error('处理失败') }
}

const fetchBanners = async () => {
  loadingBanners.value = true
  try {
    const res = await adminApi.getBanners()
    if (res.code === 200) banners.value = res.data
  } catch (e) {
    console.error('获取轮播图失败:', e)
    ElMessage.error('获取轮播图失败')
  }
  loadingBanners.value = false
}

const showBannerDialog = (banner = null) => {
  editingBanner.value = banner
  if (banner) {
    bannerForm.value = { ...banner, is_active: banner.status === 'active' }
  } else {
    bannerForm.value = { title: '', image_url: '', link_url: '', sort: 0, is_active: true }
  }
  bannerDialogVisible.value = true
}

const handleBannerImageUpload = async (event) => {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    ElMessage.warning('请选择 JPG、PNG、WebP 或 GIF 图片')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('图片大小不能超过 5MB')
    return
  }
  bannerUploading.value = true
  try {
    const res = await uploadApi.image(file)
    const url = res?.data?.url || res?.data?.image_url || res?.data
    if (res.code !== 200 || typeof url !== 'string' || !url) {
      throw new Error(res.msg || '图床未返回图片地址')
    }
    bannerForm.value.image_url = url
    ElMessage.success('图片已上传至图床')
  } catch (error) {
    ElMessage.error(error?.response?.data?.msg || error?.message || '图片上传失败')
  } finally {
    bannerUploading.value = false
  }
}

const handleSaveBanner = async () => {
  try {
    const data = { ...bannerForm.value }
    let res
    if (editingBanner.value) {
      res = await adminApi.updateBanner(editingBanner.value.id, data)
    } else {
      res = await adminApi.createBanner(data)
    }
    if (res.code === 200) {
      ElMessage.success('保存成功')
      bannerDialogVisible.value = false
      fetchBanners()
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (e) { ElMessage.error('保存失败') }
}

const handleDeleteBanner = async (banner) => {
  try {
    await ElMessageBox.confirm('确定删除该轮播图？', '提示', { type: 'warning' })
    const res = await adminApi.deleteBanner(banner.id)
    if (res.code === 200) { ElMessage.success('删除成功'); fetchBanners() }
  } catch (e) {}
}

const crawlBanners = async () => {
  try {
    await ElMessageBox.confirm('确定从编程猫爬取轮播图？这将覆盖现有的轮播图数据。', '提示', { type: 'warning' })
    crawlingBanners.value = true
    const res = await adminApi.crawlBanners()
    if (res.code === 200) {
      ElMessage.success(`成功爬取 ${res.data.count || 0} 个轮播图`)
      fetchBanners()
    } else {
      ElMessage.error(res.msg || '爬取失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('爬取失败')
  } finally {
    crawlingBanners.value = false
  }
}

const fetchIpBans = async () => {
  loadingIpBans.value = true
  try {
    const res = await adminApi.getIpBans({ page: ipBanPage.value, pageSize: ipBanPageSize.value })
    if (res.code === 200) { ipBans.value = res.data.list; ipBanTotal.value = res.data.pagination?.total || res.data.total || 0 }
  } catch (e) {}
  loadingIpBans.value = false
}

const showIpBanDialog = () => {
  ipBanForm.value = { ip_address: '', reason: '', expires_at: null }
  ipBanDialogVisible.value = true
}

const handleAddIpBan = async () => {
  if (!ipBanForm.value.ip_address) {
    ElMessage.warning('请输入IP地址')
    return
  }
  try {
    const res = await adminApi.addIpBan(ipBanForm.value)
    if (res.code === 200) {
      ElMessage.success('封禁成功')
      ipBanDialogVisible.value = false
      fetchIpBans()
      fetchStats()
    } else {
      ElMessage.error(res.msg || '封禁失败')
    }
  } catch (e) { ElMessage.error('封禁失败') }
}

const handleRemoveIpBan = async (ipBan) => {
  try {
    await ElMessageBox.confirm('确定解除该IP封禁？', '提示', { type: 'warning' })
    const res = await adminApi.removeIpBan(ipBan.id)
    if (res.code === 200) { ElMessage.success('解封成功'); fetchIpBans(); fetchStats() }
  } catch (e) {}
}

const handleCrawlWork = async () => {
  if (!crawlWorkId.value) { ElMessage.warning('请输入作品ID'); return }
  crawling.value = true
  crawlResult.value = ''
  try {
    const res = await adminApi.crawlWork(parseInt(crawlWorkId.value))
    if (res.code === 200) {
      crawlResult.value = '爬取成功：' + res.data.name
      crawlResultType.value = 'success'
      ElMessage.success('爬取成功')
      crawlWorkId.value = ''
    } else {
      crawlResult.value = res.msg || '爬取失败'
      crawlResultType.value = 'error'
      ElMessage.error(res.msg)
    }
  } catch (e) {
    crawlResult.value = '爬取失败'
    crawlResultType.value = 'error'
    ElMessage.error('爬取失败')
  }
  crawling.value = false
}

const handleCrawlUser = async () => {
  if (!crawlUserId.value) { ElMessage.warning('请输入用户ID'); return }
  crawlingUser.value = true
  crawlResult.value = ''
  try {
    const res = await adminApi.crawlUserWorks(parseInt(crawlUserId.value))
    if (res.code === 200) {
      crawlResult.value = res.msg
      crawlResultType.value = res.data?.total > 0 ? 'success' : 'warning'
      ElMessage.success(res.msg)
    } else {
      crawlResult.value = res.msg || '爬取失败'
      crawlResultType.value = 'error'
      ElMessage.error(res.msg)
    }
  } catch (e) {
    crawlResult.value = '爬取失败'
    crawlResultType.value = 'error'
    ElMessage.error('爬取失败')
  }
  crawlingUser.value = false
}

const handleCrawlHot = async () => {
  crawlingHot.value = true
  crawlResult.value = ''
  crawlLogs.value = []
  // 清理上一次未结束的轮询定时器，避免多个 interval 并行
  if (crawlLogInterval.value) {
    clearInterval(crawlLogInterval.value)
    crawlLogInterval.value = null
  }
  try {
    const res = await adminApi.crawlHotWorks(crawlCount.value)
    if (res.code === 200) {
      crawlResult.value = res.msg
      crawlResultType.value = res.data?.total > 0 ? 'success' : 'warning'
      ElMessage.success(res.msg)
      if (res.data?.taskId) {
        currentTaskId.value = res.data.taskId
        crawlLogInterval.value = setInterval(async () => {
          try {
            const logRes = await adminApi.getCrawlLogs(res.data.taskId)
            if (logRes.code === 200 && logRes.data?.logs) {
              crawlLogs.value = logRes.data.logs
              nextTick(() => {
                if (crawlLogsRef.value) {
                  crawlLogsRef.value.scrollTop = crawlLogsRef.value.scrollHeight
                }
              })
              const lastLog = logRes.data.logs[logRes.data.logs.length - 1]
              if (lastLog?.type === 'complete' || lastLog?.type === 'error') {
                clearInterval(crawlLogInterval.value)
                crawlLogInterval.value = null
              }
            }
          } catch (e) {}
        }, 1000)
      }
    } else {
      crawlResult.value = res.msg || '爬取失败'
      crawlResultType.value = 'error'
      ElMessage.error(res.msg)
    }
  } catch (e) {
    crawlResult.value = '爬取失败'
    crawlResultType.value = 'error'
    ElMessage.error('爬取失败')
  }
  crawlingHot.value = false
}

const formatLogTime = (time) => {
  if (!time) return ''
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const handleCrawlPosts = async () => {
  crawlingPosts.value = true
  crawlResult.value = ''
  try {
    const res = await adminApi.crawlPostWorks(crawlKeyword.value)
    if (res.code === 200) {
      crawlResult.value = res.msg
      crawlResultType.value = res.data?.total > 0 ? 'success' : 'warning'
      ElMessage.success(res.msg)
    } else {
      crawlResult.value = res.msg || '爬取失败'
      crawlResultType.value = 'error'
      ElMessage.error(res.msg)
    }
  } catch (e) {
    crawlResult.value = '爬取失败'
    crawlResultType.value = 'error'
    ElMessage.error('爬取失败')
  }
  crawlingPosts.value = false
}

const fetchStudios = async () => {
  loadingStudios.value = true
  try {
    const res = await adminApi.getStudios({ page: studiosPage.value, pageSize: 20 })
    if (res.code === 200) {
      studios.value = res.data.list
      studiosTotal.value = res.data.total
    }
  } catch (e) {
    console.error('获取工作室列表失败:', e)
  }
  loadingStudios.value = false
}

const handleStudioStatus = async (row) => {
  const newStatus = row.status === 'active' ? 'banned' : 'active'
  try {
    const res = await adminApi.updateStudioStatus(row.id, newStatus)
    if (res.code === 200) {
      row.status = newStatus
      ElMessage.success('状态已更新')
    } else {
      ElMessage.error(res.msg || '更新失败')
    }
  } catch (e) {
    ElMessage.error('更新失败')
  }
}

const showStudioDetail = async (row) => {
  studioDetailVisible.value = true
  studioDetailLoading.value = true
  studioDetail.value = null
  
  try {
    const res = await adminApi.getStudioDetail(row.id)
    if (res.code === 200) {
      studioDetail.value = res.data
    } else {
      ElMessage.error(res.msg || '获取工作室详情失败')
      studioDetailVisible.value = false
    }
  } catch (e) {
    ElMessage.error('获取工作室详情失败')
    studioDetailVisible.value = false
  } finally {
    studioDetailLoading.value = false
  }
}

const changeMemberRole = async (member) => {
  const roles = ['member', 'admin']
  const currentRole = member.role
  const newRole = currentRole === 'member' ? 'admin' : 'member'
  
  try {
    await ElMessageBox.confirm(`确定将 ${member.user?.nickname} 的角色从 ${currentRole === 'member' ? '成员' : '管理员'} 改为 ${newRole === 'member' ? '成员' : '管理员'} 吗？`, '确认', { type: 'warning' })
    
    const res = await adminApi.updateStudioMember(member.studio_id, member.user_id, { role: newRole })
    if (res.code === 200) {
      ElMessage.success('角色已更新')
      showStudioDetail({ id: member.studio_id })
    } else {
      ElMessage.error(res.msg || '更新失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('更新失败')
    }
  }
}

const removeMember = async (member) => {
  try {
    await ElMessageBox.confirm(`确定将 ${member.user?.nickname} 移出工作室吗？`, '确认', { type: 'warning' })

    const res = await adminApi.removeStudioMember(member.studio_id, member.user_id)
    if (res.code === 200) {
      ElMessage.success('成员已移除')
      showStudioDetail({ id: member.studio_id })
    } else {
      ElMessage.error(res.msg || '移除失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('移除失败')
    }
  }
}

// 通过工作室成员申请
const handleApproveMember = async (member) => {
  try {
    await ElMessageBox.confirm(`确定通过 ${member.user?.nickname || member.user?.username} 的加入申请吗？`, '确认', { type: 'warning' })
    const res = await adminApi.reviewMember(member.studio_id, member.user_id, 'approve')
    if (res.code === 200) {
      ElMessage.success('已通过申请')
      showStudioDetail({ id: member.studio_id })
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败')
  }
}

// 拒绝工作室成员申请
const handleRejectMember = async (member) => {
  try {
    await ElMessageBox.confirm(`确定拒绝 ${member.user?.nickname || member.user?.username} 的加入申请吗？`, '确认', { type: 'warning' })
    const res = await adminApi.reviewMember(member.studio_id, member.user_id, 'reject')
    if (res.code === 200) {
      ElMessage.success('已拒绝申请')
      showStudioDetail({ id: member.studio_id })
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败')
  }
}

const removeStudioWork = async (work) => {
  try {
    await ElMessageBox.confirm(`确定将作品"${work.name}"从工作室移除吗？`, '确认', { type: 'warning' })
    
    const res = await adminApi.removeStudioWork(studioDetail.value.studio.id, work.id)
    if (res.code === 200) {
      ElMessage.success('作品已移除')
      showStudioDetail({ id: studioDetail.value.studio.id })
    } else {
      ElMessage.error(res.msg || '移除失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('移除失败')
    }
  }
}

const handleDeleteStudio = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除工作室"${row.name}"吗？此操作不可恢复。`, '警告', { type: 'warning' })
    const res = await adminApi.deleteStudio(row.id)
    if (res.code === 200) {
      ElMessage.success('工作室已删除')
      fetchStudios()
    } else {
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  const adminRoles = ['reviewer', 'moderator', 'admin', 'superadmin']
  if (!userStore.isLoggedIn || !adminRoles.includes(userStore.user?.role)) {
    ElMessage.error('需要管理员权限')
    router.push('/')
    return
  }
  fetchStats()
  fetchTrends()
  loadProxyConfig()
  if (userStore.user?.role === 'superadmin') {
    fetchRoles()
    fetchAdminUsers()
  }
})
const formatCallPayload = (value) => {
  if (value == null || value === '') return '无记录'
  try { return typeof value === 'string' ? JSON.stringify(JSON.parse(value), null, 2) : JSON.stringify(value, null, 2) } catch { return String(value) }
}

const warnUserDetail = async () => {
  const user = userDetail.value?.user
  if (!user) return
  try {
    const { value } = await ElMessageBox.prompt(
      '警告会写入审计记录、发送站内信，并强制该用户签署不再违规保证书。请填写具体违规事实。',
      `正式警告：${user.nickname || user.username}`,
      { type: 'warning', inputType: 'textarea', inputPattern: /^.{5,1000}$/, inputErrorMessage: '警告原因需为 5-1000 字', confirmButtonText: '确认发出警告' }
    )
    const res = await adminApi.warnUser(user.id, value.trim())
    if (res.code === 200) ElMessage.success(res.msg || '警告已发出')
  } catch (e) {
    if (!['cancel', 'close'].includes(e)) ElMessage.error(e.response?.data?.msg || '发出警告失败')
  }
}

const openStudioPointsDialog = (studio) => {
  studioPointsTarget.value = studio
  studioPointsForm.value = { action: 'add', points: 10, note: '' }
  studioPointsDialogVisible.value = true
}

const openStudioEditDialog = (studio) => {
  studioEditForm.value = {
    id: studio.id,
    name: studio.name || '',
    description: studio.description || '',
    join_type: studio.join_type || 'apply',
    is_public: studio.is_public !== false
  }
  studioEditDialogVisible.value = true
}

const submitStudioEdit = async () => {
  const name = studioEditForm.value.name.trim()
  if (!name) return ElMessage.warning('工作室名称不能为空')
  studioEditSubmitting.value = true
  try {
    const res = await adminApi.updateStudio(studioEditForm.value.id, { ...studioEditForm.value, name })
    if (res.code !== 200) throw new Error(res.msg || '保存失败')
    ElMessage.success('工作室资料已更新')
    studioEditDialogVisible.value = false
    await showStudioDetail({ id: studioEditForm.value.id })
    await fetchStudios()
  } catch (error) {
    ElMessage.error(error.response?.data?.msg || error.message || '保存失败')
  } finally {
    studioEditSubmitting.value = false
  }
}

const submitStudioPoints = async () => {
  const note = studioPointsForm.value.note.trim()
  if (note.length < 5) {
    ElMessage.warning('请填写至少 5 个字符的具体备注')
    return
  }
  studioPointsSubmitting.value = true
  try {
    const res = await adminApi.updateStudioPoints(studioPointsTarget.value.id, {
      action: studioPointsForm.value.action,
      points: studioPointsForm.value.points,
      note
    })
    if (res.code !== 200) throw new Error(res.msg || '积分调整失败')
    ElMessage.success('积分已调整并写入永久流水')
    studioPointsDialogVisible.value = false
    await showStudioDetail({ id: studioPointsTarget.value.id })
    await fetchStudios()
  } catch (error) {
    ElMessage.error(error.response?.data?.msg || error.message || '积分调整失败')
  } finally {
    studioPointsSubmitting.value = false
  }
}

const setStudioWorkScore = async (work) => {
  try {
    const { value } = await ElMessageBox.prompt(`为《${work.name}》设置作品评分（0-10000）`, '作品评分', {
      inputValue: String(work.studio_score || 0),
      inputPattern: /^(?:0|[1-9]\d{0,3}|10000)$/,
      inputErrorMessage: '请输入 0-10000 的整数',
      confirmButtonText: '保存评分',
      cancelButtonText: '取消'
    })
    const res = await adminApi.setWorkScore(work.studio_work_id, Number(value))
    if (res.code !== 200) throw new Error(res.msg || '评分失败')
    ElMessage.success('作品评分已更新，总分已自动重算')
    await showStudioDetail({ id: studioDetail.value.studio.id })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error.response?.data?.msg || error.message || '评分失败')
  }
}

onBeforeUnmount(() => {
  if (logRefreshInterval) {
    clearInterval(logRefreshInterval)
    logRefreshInterval = null
  }
  // 同步清理爬取热榜日志轮询定时器，避免组件卸载后定时器仍在请求导致内存泄漏
  if (crawlLogInterval.value) {
    clearInterval(crawlLogInterval.value)
    crawlLogInterval.value = null
  }
})

watch(activeMenu, (newVal) => {
  if (newVal === 'security') {
    fetchCaptchaStats()
  }
  if (newVal === 'studios') {
    fetchStudios()
  }
  if (newVal === 'developer-apps') {
    fetchDeveloperApps()
  }
})
</script>

<style lang="scss" scoped>
$primary-color: #FEC433;
$sidebar-width: 200px;

.r-admin--page {
  min-height: 100vh;
  background: #f5f5f5;
  overflow: hidden;
}

.r-admin--container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.r-admin--sidebar {
  width: $sidebar-width;
  background: #fff;
  border-right: 1px solid #eee;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  overflow-y: auto;
  z-index: 100;
  
  .r-admin--logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-bottom: 1px solid #eee;
    position: sticky;
    top: 0;
    background: #fff;
    z-index: 1;
    
    .r-admin--logo_icon { font-size: 24px; }
    .r-admin--logo_text { font-size: 16px; font-weight: 600; }
  }
  
  .el-menu { border-right: none; }
}

.r-admin--main {
  flex: 1;
  margin-left: $sidebar-width;
  height: 100vh;
  overflow-y: auto;
  padding: 24px;
}

.r-admin--section {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
}

.r-admin--header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.r-admin--filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.r-admin--log_filters {
  margin-bottom: 18px;
}

.r-admin--log_filters :deep(.el-select) {
  width: 180px;
}

.r-admin--log_filters :deep(.el-date-editor) {
  width: 390px;
}

@media (max-width: 768px) {
  .r-admin--log_filters :deep(.el-select),
  .r-admin--log_filters :deep(.el-date-editor) {
    width: 100%;
  }
}

.r-admin--title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 20px;
}

.r-admin--stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  
  @media (max-width: 1400px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.r-admin--dashboard_header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
}

.r-admin--stat_card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f0ebe0;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: linear-gradient(180deg, #c9a84c, #e8c86a);
    border-radius: 3px 0 0 3px;
  }
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(180, 140, 50, 0.1);
  }
  
  &.r-admin--stat_card_primary {
    background: linear-gradient(to right, #fffdf7, #fff9ed);
    border-color: #e6dcc8;
  }
  
  &.r-admin--stat_card_alert .r-admin--stat_num {
    color: #dc2626;
  }
  
  .r-admin--stat_icon_wrap {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: #faf6ee;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    flex-shrink: 0;
    border: 1px solid #f0ebe0;
  }
  
  .r-admin--stat_info {
    display: flex;
    flex-direction: column;
    flex: 1;
    
    .r-admin--stat_num { 
      font-size: 24px; 
      font-weight: 700; 
      color: #1a1a2e;
      letter-spacing: -0.5px;
      font-variant-numeric: tabular-nums;
    }
    .r-admin--stat_label { 
      font-size: 12px; 
      color: #8c8c9a; 
      margin-top: 2px;
    }
  }
  
  .r-admin--stat_sub { 
    font-size: 11px; 
    color: #a08c5a; 
    font-weight: 500;
    background: #faf6ee;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #f0ebe0;
    white-space: nowrap;
  }
}

.r-admin--chart_section {
  margin-top: 24px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f0ebe0;
  padding: 20px;
  
  h3 { 
    font-size: 14px; 
    margin: 0 0 16px; 
    color: #303133; 
    font-weight: 600;
  }
  
  .r-admin--chart {
    width: 100%;
    height: 260px;
    border-radius: 6px;
  }
}

.r-admin--user_cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.r-admin--user_avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.r-admin--user_name {
  font-weight: 500;
}
.r-admin--user_email {
  font-size: 12px;
  color: #999;
}
.r-admin--ai_result {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.r-admin--work_cell {
  display: flex;
  align-items: center;
  gap: 10px;
  
  .r-admin--work_cover { width: 60px; height: 36px; border-radius: 4px; object-fit: cover; }
  .r-admin--work_name { font-weight: 500; }
  .r-admin--work_author { font-size: 12px; color: #999; }
}

.r-admin--comment_content {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.r-admin--comment_detail {
  .r-admin--comment_detail_header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .r-admin--comment_detail_user {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .r-admin--comment_detail_avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    background: #f0f0f0;
  }
  .r-admin--comment_detail_name {
    font-weight: 600;
    font-size: 16px;
  }
  .r-admin--comment_detail_uid {
    color: #999;
    font-size: 13px;
    margin-top: 2px;
  }
  .r-admin--comment_detail_content {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
  }
  .r-admin--comment_detail_actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
    justify-content: flex-end;
  }
}

.r-admin--pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.r-admin--crawl_section {
  margin-bottom: 32px;
  
  h3 { font-size: 16px; margin: 0 0 12px; }
  
  .r-admin--crawl_desc { color: #666; margin: 0 0 12px; }
  
  .r-admin--crawl_form {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  
  .r-admin--crawl_result { margin-top: 16px; }
}

.r-admin--crawl_logs {
  margin-top: 24px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  
  .r-admin--crawl_logs_header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #f5f7fa;
    border-bottom: 1px solid #e4e7ed;
    
    h3 { margin: 0; font-size: 14px; }
  }
  
  .r-admin--crawl_logs_content {
    max-height: 300px;
    overflow-y: auto;
    padding: 12px;
    background: #1e1e1e;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
  }
  
  .r-admin--crawl_log_item {
    padding: 4px 0;
    display: flex;
    gap: 12px;
    color: #d4d4d4;
  }
  
  .r-admin--crawl_log_time {
    color: #6a9955;
    flex-shrink: 0;
  }
  
  .r-admin--crawl_log_msg { word-break: break-all; }
  
  .r-admin--crawl_log_success { color: #4ec9b0; }
  .r-admin--crawl_log_error { color: #f14c4c; }
  .r-admin--crawl_log_warn { color: #cca700; }
  .r-admin--crawl_log_start { color: #569cd6; }
  .r-admin--crawl_log_complete { color: #4ec9b0; font-weight: bold; }
}

.r-admin--prompt_actions {
  margin-bottom: 8px;
  display: flex;
  gap: 8px;
}

.r-admin--prompt_help {
  h4 { margin: 16px 0 8px; color: #333; font-size: 14px; }
  h4:first-child { margin-top: 0; }
  ul { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; color: #666; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; color: #e6a23c; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  p { color: #666; margin: 8px 0; }
}

.r-admin--configs_page {
  padding: 0 !important;
  background: #f5f7fa !important;
}

.r-admin--configs_sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);

  .r-admin--title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.r-admin--configs_body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.r-admin--config_section {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  overflow: hidden;
}

.r-admin--config_section_title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  background: #fafbfc;
  border-bottom: 1px solid #e4e7ed;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.r-admin--config_section_icon {
  font-size: 18px;
}

.r-admin--config_section_switch {
  margin-left: auto;
}

.r-admin--config_form {
  padding: 20px;
}

.r-admin--config_hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.r-admin--switch_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  padding: 12px 0;
}

.r-admin--switch_item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  transition: background 0.2s;

  &:hover {
    background: #ecf5ff;
  }
}

.r-admin--switch_label {
  font-size: 13px;
  color: #606266;
}

.migration-card {
  :deep(.el-card__header) {
    padding: 10px 16px;
    font-weight: 600;
  }
  :deep(.el-card__body) {
    padding: 16px;
  }
}

.r-admin--realtime_logs {
  background: #1e1e1e;
  border-radius: 8px;
  height: 500px;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  
  .r-admin--realtime_logs_empty {
    color: #666;
    text-align: center;
    padding: 40px;
  }
  
  .r-admin--realtime_log_item {
    padding: 4px 0;
    display: flex;
    gap: 12px;
    color: #d4d4d4;
    border-bottom: 1px solid #333;
    
    &:last-child { border-bottom: none; }
  }
  
  .r-admin--realtime_log_time {
    color: #6a9955;
    flex-shrink: 0;
    width: 80px;
  }
  
  .r-admin--realtime_log_level {
    flex-shrink: 0;
    width: 50px;
    font-weight: bold;
  }
  
  .r-admin--realtime_log_msg {
    word-break: break-all;
    flex: 1;
  }
  
  .r-admin--realtime_log_info { color: #d4d4d4; }
  .r-admin--realtime_log_warn { color: #cca700; }
  .r-admin--realtime_log_error { color: #f14c4c; }
}

.r-admin--realtime_logs_footer {
  margin-top: 12px;
  color: #666;
  font-size: 12px;
}

.r-admin--captcha-stats {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eee;
  
  .r-admin--stats-title {
    font-size: 16px;
    margin: 0 0 16px;
    color: #333;
  }
}

.r-admin--stat-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  
  h4 {
    margin: 0 0 12px;
    font-size: 15px;
    color: #333;
  }
  
  .r-admin--stat-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    
    &:last-child { border-bottom: none; }
  }
  
  .r-admin--stat-label { color: #666; }
  
  .r-admin--stat-value {
    font-weight: 600;
    color: #333;
    
    &.success { color: #67c23a; }
    &.danger { color: #f56c6c; }
  }
}

.r-admin--user_detail {
  .r-admin--user_detail_header {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid #eee;
  }
  
  .r-admin--user_detail_avatar {
    width: 80px;
    height: 80px;
    flex-shrink: 0;
    display: block;
    border-radius: 50%;
    object-fit: cover;
  }
  
  .r-admin--user_detail_info {
    flex: 1;
    min-width: 0;
    
    h3 {
      margin: 0 0 8px;
      font-size: 20px;
    }
    
    p {
      margin: 0 0 12px;
      color: #666;
    }
  }
  
  .r-admin--user_detail_tags {
    display: flex;
    gap: 8px;
  }
  
  .r-admin--user_detail_actions {
    display: flex;
    flex: 0 0 176px;
    align-content: flex-start;
    gap: 8px;
    flex-wrap: wrap;

    .el-button + .el-button {
      margin-left: 0;
    }
  }

  // 编程猫 Token 展示区域(superadmin only)
  .r-admin--token_box {
    margin-top: 12px;
    padding: 10px 14px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;

    .r-admin--token_label {
      font-size: 12px;
      color: #868e96;
      margin-bottom: 6px;
    }

    .r-admin--token_content {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .r-admin--token_value {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      color: #495057;
      background: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid #dee2e6;
      word-break: break-all;
      max-width: 320px;
      display: inline-block;
    }
  }

  .r-admin--app_login_panel {
    margin-bottom: 24px;
    padding: 16px;
    background: #f8f9fb;
    border: 1px solid #e6eaf0;
    border-radius: 8px;

    .r-admin--app_login_title {
      margin-bottom: 12px;
      color: #303133;
      font-size: 14px;
      font-weight: 600;
    }

    :deep(.el-descriptions__label) {
      width: 132px;
      white-space: nowrap;
    }
  }
}

.r-admin--user_stats {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.r-admin--user_stat {
  flex: 1;
  text-align: center;
  
  .r-admin--stat_value {
    display: block;
    font-size: 24px;
    font-weight: 600;
    color: #333;
  }
  
  .r-admin--stat_label {
    font-size: 12px;
    color: #999;
  }
}

.r-admin--token_info {
  margin-top: 20px;
  
  h4 {
    margin: 0 0 10px;
    font-size: 14px;
    color: #666;
  }
}

:deep(.el-table) {
  .el-button + .el-button {
    margin-left: 8px;
  }
}

.r-admin--ann_color_dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.r-admin--ann_color_group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.r-admin--ops {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  white-space: nowrap;
}
.r-admin--ops .el-button + .el-button {
  margin-left: 0;
}
.r-admin--banner_upload { width:100%; display:grid; gap:12px; }
.r-admin--banner_upload_preview { position:relative; width:100%; aspect-ratio:16/6; overflow:hidden; border:1px solid #e1e6ee; border-radius:14px; background:#f4f7fb; cursor:pointer; }
.r-admin--banner_upload_preview img { width:100%; height:100%; display:block; object-fit:cover; }
.r-admin--banner_upload_preview.is-empty { border:1px dashed #bdc7d7; }
.r-admin--banner_upload_empty { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; color:#667085; }
.r-admin--banner_upload_empty .el-icon { color:#f5af16; font-size:30px; }
.r-admin--banner_upload_empty strong { color:#263247; font-size:15px; }
.r-admin--banner_upload_empty span,.r-admin--banner_upload_actions span { color:#98a2b3; font-size:12px; }
.r-admin--banner_upload_mask { position:absolute; inset:auto 0 0; padding:9px; color:#fff; text-align:center; font-size:13px; background:linear-gradient(transparent,rgba(18,27,45,.8)); opacity:0; transform:translateY(4px); transition:.2s ease; }
.r-admin--banner_upload_preview:hover .r-admin--banner_upload_mask { opacity:1; transform:none; }
.r-admin--banner_upload_actions { display:flex; align-items:center; gap:10px; }
.r-admin--banner_dialog :deep(.el-dialog) { overflow:hidden; border-radius:20px!important; }
.r-admin--banner_dialog :deep(.el-dialog__header) { margin:0; padding:22px 26px 16px; border-bottom:1px solid #edf0f5; background:linear-gradient(90deg,#fffaf0,#f3f8ff); }
.r-admin--banner_dialog :deep(.el-dialog__title) { color:#172033; font-size:20px; font-weight:800; }
.r-admin--banner_dialog :deep(.el-dialog__body) { padding:22px 26px 12px; }
.r-admin--banner_dialog :deep(.el-dialog__footer) { padding:12px 26px 22px; }

/* 后台统一为清晰的深色导航 + 明亮管理画布 */
.r-admin--page { background:radial-gradient(circle at 18% 0,rgba(255,205,92,.16),transparent 25rem),linear-gradient(145deg,#f3f6fb,#f8faff 55%,#fffaf0); }
.r-admin--sidebar { width:224px; padding:12px; border-right:0; background:#172033; box-shadow:12px 0 36px rgba(23,32,51,.13); }
.r-admin--sidebar .r-admin--logo { height:58px; justify-content:flex-start; padding:0 12px; border:0; border-radius:14px; background:rgba(255,255,255,.07); color:#fff; }
.r-admin--sidebar .r-admin--logo .r-admin--logo_text { font-size:17px; font-weight:800; }
.r-admin--sidebar :deep(.el-menu) { margin-top:12px; background:transparent; }
.r-admin--sidebar :deep(.el-menu-item), .r-admin--sidebar :deep(.el-sub-menu__title) { height:44px; margin:4px 0; border-radius:11px; color:#aeb8c8; }
.r-admin--sidebar :deep(.el-menu-item:hover), .r-admin--sidebar :deep(.el-sub-menu__title:hover) { background:rgba(255,255,255,.07); color:#fff; }
.r-admin--sidebar :deep(.el-menu-item.is-active) { background:#fec433; color:#172033; font-weight:800; }
.r-admin--main { margin-left:224px; padding:30px; }
.r-admin--section { min-height:calc(100vh - 60px); padding:28px; border:1px solid rgba(255,255,255,.94); border-radius:20px; background:rgba(255,255,255,.84); box-shadow:0 18px 50px rgba(39,55,82,.075); }
.r-admin--title { color:#172033; font-size:25px; letter-spacing:-.025em; font-weight:800; }
.r-admin--header { padding-bottom:18px; border-bottom:1px solid #edf0f5; }
.r-admin--filters :deep(.el-input__wrapper), .r-admin--filters :deep(.el-select__wrapper) { min-height:40px; border-radius:11px!important; background:#f8faff; box-shadow:0 0 0 1px #e2e7ef inset; }
.r-admin--filters .el-button { height:40px; border-radius:11px!important; font-weight:700; }
.r-admin--stat_card { padding:20px; border-color:#e7ebf2; border-radius:15px; box-shadow:0 8px 24px rgba(39,55,82,.045); }
.r-admin--stat_card::before { width:4px; border-radius:4px 0 0 4px; }
.r-admin--stat_card .r-admin--stat_icon_wrap { width:42px; height:42px; border-radius:11px; }
.r-admin--chart_section { border-color:#e7ebf2; border-radius:16px; box-shadow:0 8px 25px rgba(39,55,82,.04); }
.r-admin--section :deep(.el-table) { overflow:hidden; border:1px solid #e7ebf2; border-radius:14px; }
.r-admin--section :deep(.el-table th.el-table__cell) { height:48px; background:#f7f9fc; color:#5f6b7d; font-weight:700; }
.r-admin--section :deep(.el-table td.el-table__cell) { height:56px; }
.r-admin--section :deep(.el-table__row:hover > td.el-table__cell) { background:#fffaf0; }
.r-admin--pagination { padding-top:20px; }
.r-admin--ops .el-button { border-radius:9px!important; }
:deep(.el-drawer) { border-radius:22px 0 0 22px; overflow:hidden; }
@media(max-width:900px){.r-admin--sidebar{width:76px;padding:8px}.r-admin--sidebar .r-admin--logo_text,.r-admin--sidebar :deep(.el-menu-item span),.r-admin--sidebar :deep(.el-sub-menu__title span){display:none}.r-admin--main{margin-left:76px;padding:16px}.r-admin--section{padding:18px}}
.r-admin--studio_dialog :deep(.el-dialog) { border-radius:22px!important; overflow:hidden; }
.r-admin--studio_dialog :deep(.el-dialog__header) { padding:24px 28px 17px; border-bottom:1px solid #edf0f5; background:linear-gradient(90deg,#fffaf0,#f3f8ff); }
.r-admin--studio_dialog :deep(.el-dialog__title) { color:#172033; font-size:21px; font-weight:800; }
.r-admin--studio_dialog :deep(.el-dialog__body) { padding:24px 28px 28px; background:#f8faff; }
.r-admin--studio_detail_header { display:grid; grid-template-columns:190px 1fr auto; gap:20px; align-items:center; margin-bottom:22px; padding:18px; border:1px solid #e5eaf1; border-radius:17px; background:#fff; box-shadow:0 9px 28px rgba(39,55,82,.06); }
.r-admin--studio_detail_logo { width:190px; height:112px; border-radius:13px; object-fit:cover; background:#eef2f7; }
.r-admin--studio_detail_info h3 { margin:0 0 7px; color:#172033; font-size:23px; font-weight:800; }
.r-admin--studio_detail_info p { margin:0 0 12px; color:#697386; line-height:1.6; }
.r-admin--studio_detail_tags { display:flex; flex-wrap:wrap; gap:7px; }
.r-admin--studio_detail_actions { display:flex; flex-direction:column; gap:8px; }
.r-admin--studio_detail_actions .el-button { width:116px; margin:0; border-radius:10px!important; }
.r-admin--studio_detail :deep(.el-tabs__header) { margin:0 0 18px; padding:0 6px; border-radius:13px; background:#fff; }
.r-admin--studio_detail :deep(.el-tabs__item) { height:50px; padding:0 18px; color:#667085; font-weight:700; }
.r-admin--studio_detail :deep(.el-tabs__item.is-active) { color:#172033; }
.r-admin--studio_detail :deep(.el-tabs__active-bar) { height:3px; border-radius:3px; background:#fec433; }
.r-admin--studio_detail :deep(.el-tabs__content) { padding:16px; border:1px solid #e5eaf1; border-radius:15px; background:#fff; }
.r-admin--studio_detail :deep(.el-descriptions) { overflow:hidden; border-radius:12px; }
.r-admin--warning_history { display:grid; gap:16px; padding:4px 0; }
.r-admin--warning_record { overflow:hidden; border:1px solid #f0d9a5; border-radius:14px; background:#fffdf8; }
.r-admin--warning_record>header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 16px; border-bottom:1px solid #f2e5c7; background:linear-gradient(90deg,#fff7e3,#fff); }
.r-admin--warning_record>header div { display:flex; align-items:center; gap:9px; color:#172033; }
.r-admin--warning_record>header time { color:#8a93a2; font-size:12px; }
.r-admin--warning_record :deep(.el-descriptions) { margin:14px; }
.r-admin--warning_text,.r-admin--warning_snapshot,.r-admin--guarantee_text { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.7; }
.r-admin--warning_snapshot { max-height:180px; overflow:auto; padding:10px 12px; border-radius:9px; background:#f6f7f9; color:#4b5565; }
.r-admin--guarantee_text { padding:10px 12px; border-left:3px solid #67c23a; border-radius:4px 9px 9px 4px; background:#f2fbef; color:#315d2d; }
@media(max-width:760px){.r-admin--studio_detail_header{grid-template-columns:1fr}.r-admin--studio_detail_logo{width:100%;height:auto;aspect-ratio:16/7}.r-admin--studio_detail_actions{flex-direction:row}.r-admin--studio_detail_actions .el-button{width:auto}}
</style>
