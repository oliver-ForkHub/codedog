/**
 * 后台管理API
 */

import request from './request'

export const adminApi = {
  getDeveloperApps(params = {}) {
    return request.get('/admin/developer-apps', { params })
  },
  getDeveloperApp(id) {
    return request.get(`/admin/developer-apps/${id}`)
  },
  getDeveloperAppCalls(id, params = {}) {
    return request.get(`/admin/developer-apps/${id}/calls`, { params })
  },
  reviewDeveloperApp(id, data) {
    return request.post(`/admin/developer-apps/${id}/review`, data)
  },
  updateDeveloperAppRateLimit(id, rate_limit_per_min) {
    return request.put(`/admin/developer-apps/${id}/rate-limit`, { rate_limit_per_min })
  },
  revokeAllTokens(id) {
    return request.post(`/admin/developer-apps/${id}/revoke-all-tokens`)
  },
  regenerateSecret(id) {
    return request.post(`/admin/developer-apps/${id}/regenerate-secret`)
  },
  deleteDeveloperApp(id) {
    return request.delete(`/admin/developer-apps/${id}`)
  },
  getDeveloperAppAuditLogs(id, params = {}) {
    return request.get(`/admin/developer-apps/${id}/audit-logs`, { params })
  },
  getDeveloperAppStats(id) {
    return request.get(`/admin/developer-apps/${id}/stats`)
  },
  getDeveloperAppStatsDetail(id, params = {}) {
    return request.get(`/admin/developer-apps/${id}/stats/detail`, { params })
  },
  /**
   * 统计数据
   */
  getStats() {
    return request.get('/admin/stats')
  },
  
  /**
   * 数据趋势
   */
  getTrends(days = 7) {
    return request.get('/admin/trends', { params: { days } })
  },
  
  /**
   * 用户管理
   */
  getUsers(params = {}) {
    return request.get('/admin/users', { params })
  },
  
  getUserDetail(userId) {
    return request.get(`/admin/users/${userId}`)
  },

  // 修复: superadmin 专用 - 查看完整编程猫 Token
  getUserCodemaoToken(userId) {
    return request.get(`/admin/users/${userId}/codemao-token`)
  },
  
  updateUserStatus(userId, status) {
    return request.put(`/admin/users/${userId}/status`, { status })
  },

  warnUser(userId, reason, source = {}) {
    return request.post(`/admin/users/${userId}/warnings`, { reason, ...source })
  },
  
  updateUserRole(userId, role) {
    return request.put(`/admin/users/${userId}/role`, { role })
  },
  
  updateUser(userId, data) {
    return request.put(`/admin/users/${userId}`, data)
  },
  
  impersonateUser(userId) {
    return request.post(`/admin/users/${userId}/impersonate`)
  },

  // 修复: 恢复管理员身份接口, 不需要角色校验(被模拟用户任何角色都可调用), 内部通过 JWT.impersonatedBy 校验
  restoreFromImpersonate() {
    return request.post(`/users/restore-from-impersonate`)
  },

  updateUserPassword(userId, newPassword) {
    return request.put(`/admin/users/${userId}/password`, { newPassword })
  },
  
  sendUserNotification(userId, title, content) {
    return request.post(`/admin/users/${userId}/notification`, { title, content })
  },
  
  sendBatchNotifications(userIds, title, content) {
    return request.post('/admin/users/batch-notification', { userIds, title, content })
  },
  
  sendAllUsersNotification(title, content) {
    return request.post('/admin/users/all-notification', { title, content })
  },
  
  deleteUser(userId) {
    return request.delete(`/admin/users/${userId}`)
  },
  
  /**
   * 作品管理
   */
  getWorks(params = {}) {
    return request.get('/admin/works', { params })
  },
  
  updateWork(workId, data) {
    return request.put(`/admin/works/${workId}`, data)
  },
  
  setWorkFeatured(workId, isFeatured) {
    return request.put(`/admin/works/${workId}/featured`, { isFeatured })
  },
  
  deleteWork(workId) {
    return request.delete(`/admin/works/${workId}`)
  },

  purgeWork(workId, data) {
    return request.delete(`/admin/works/${workId}/purge`, { data })
  },
  
  recalibrateWorks() {
    return request.post('/admin/works/recalibrate')
  },
  getRecalibrationJob(jobId) {
    return request.get(`/admin/works/recalibrate/${jobId}`)
  },
  applyRecalibrationJob(jobId) {
    return request.post(`/admin/works/recalibrate/${jobId}/apply`)
  },
  
  /**
   * 评论管理
   */
  getComments(params = {}) {
    return request.get('/admin/comments', { params })
  },
  
  updateCommentStatus(commentId, status) {
    return request.put(`/admin/comments/${commentId}/status`, { status })
  },
  
  deleteComment(commentId) {
    return request.delete(`/admin/comments/${commentId}`)
  },
  
  /**
   * 帖子管理
   */
  getPosts(params = {}) {
    return request.get('/admin/posts', { params })
  },

  // 获取待审查帖子（命中敏感词的帖子）
  getPendingReviewPosts(params = {}) {
    return request.get('/admin/posts/pending-review', { params })
  },

  // 审核待审查帖子（pass/delete/ignore）
  reviewPendingPost(postId, action, reason) {
    return request.post(`/admin/posts/${postId}/review`, { action, reason })
  },

  getForumOverview() {
    return request.get('/admin/forum/overview')
  },

  getForumAttentionSettings() {
    return request.get('/admin/forum/attention-settings')
  },

  updateForumAttentionSettings(data) {
    return request.put('/admin/forum/attention-settings', data)
  },

  getPostHistory(postId) {
    return request.get(`/admin/posts/${postId}/history`)
  },

  restorePostRevision(postId, revisionId, reason) {
    return request.post(`/admin/posts/${postId}/revisions/${revisionId}/restore`, { reason })
  },

  getForumBoards() {
    return request.get('/admin/forum/boards')
  },

  createForumBoard(data) {
    return request.post('/admin/forum/boards', data)
  },

  updateForumBoard(boardId, data) {
    return request.put(`/admin/forum/boards/${boardId}`, data)
  },

  deleteForumBoard(boardId) {
    return request.delete(`/admin/forum/boards/${boardId}`)
  },

  getForumBoardModerators(boardId) {
    return request.get(`/admin/forum/boards/${boardId}/moderators`)
  },

  assignForumBoardModerator(boardId, data) {
    return request.post(`/admin/forum/boards/${boardId}/moderators`, data)
  },

  removeForumBoardModerator(boardId, userId) {
    return request.delete(`/admin/forum/boards/${boardId}/moderators/${userId}`)
  },

  movePost(postId, boardId, reason) {
    return request.post(`/admin/posts/${postId}/move`, { board_id: boardId, reason })
  },

  mergePosts(postId, targetPostId, reason) {
    return request.post(`/admin/posts/${postId}/merge`, { target_post_id: targetPostId, reason })
  },
  
  setPostEssence(postId, isEssence, reason) {
    return request.put(`/admin/posts/${postId}/essence`, { isEssence, reason })
  },
  
  setPostTop(postId, isTop, reason) {
    return request.put(`/admin/posts/${postId}/top`, { isTop, reason })
  },
  
  updatePost(postId, data) {
    return request.put(`/admin/posts/${postId}`, data)
  },
  
  deletePost(postId, reason) {
    return request.delete(`/admin/posts/${postId}`, { data: { reason } })
  },
  
  /**
   * 轮播图管理
   */
  getBanners() {
    return request.get('/admin/banners')
  },
  
  createBanner(data) {
    return request.post('/admin/banners', data)
  },
  
  updateBanner(bannerId, data) {
    return request.put(`/admin/banners/${bannerId}`, data)
  },
  
  deleteBanner(bannerId) {
    return request.delete(`/admin/banners/${bannerId}`)
  },
  
  crawlBanners() {
    return request.post('/admin/crawl/banners')
  },
  
  /**
   * 举报管理
   */
  getReports(params = {}) {
    return request.get('/admin/reports', { params })
  },
  
  handleReport(reportId, data) {
    return request.put(`/admin/reports/${reportId}`, data)
  },

  getReportAuditLogs(reportId) {
    return request.get(`/admin/reports/${reportId}/audit-logs`)
  },

  getProxyConfig() {
    return request.get('/admin/proxy/config')
  },

  updateProxyConfig(data) {
    return request.post('/admin/proxy/config', data)
  },

  testProxy(proxyUrl) {
    return request.post('/admin/proxy/test', proxyUrl ? { proxyUrl } : {})
  },

  refreshProxy() {
    return request.post('/admin/proxy/refresh')
  },
  
  /**
   * IP封禁管理
   */
  getIpBans(params = {}) {
    return request.get('/admin/ip-bans', { params })
  },
  
  addIpBan(data) {
    return request.post('/admin/ip-bans', data)
  },
  
  removeIpBan(ipBanId) {
    return request.delete(`/admin/ip-bans/${ipBanId}`)
  },
  
  /**
   * 爬取功能
   */
  crawlWork(workId) {
    return request.post('/admin/crawl/work', { workId })
  },
  
  crawlHotWorks(count = 20) {
    return request.post('/admin/crawl/hot', { count }, { timeout: 180000 })
  },
  
  crawlUserWorks(userId, limit = 100) {
    return request.post('/admin/crawl/user', { userId, limit }, { timeout: 180000 })
  },
  
  crawlPostWorks(keyword, limit = 20) {
    return request.post('/admin/crawl/posts', { keyword, limit }, { timeout: 180000 })
  },
  
  getCrawlLogs(taskId) {
    return request.get('/admin/crawl/logs', { params: { taskId } })
  },
  
  /**
   * 实时日志
   * @param {string} lastTime - 上次最后一条日志时间(ISO)
   * @param {number} limit - 返回条数上限
   * @param {string} source - 日志来源: memory(应用日志) | file(文件日志,含Docker输出) | all(全部)
   */
  getRealtimeLogs(lastTime, limit = 100, source = 'all') {
    const params = { limit, source };
    if (lastTime) params.lastTime = lastTime;
    return request.get('/admin/logs/realtime', { params })
  },
  
  clearRealtimeLogs() {
    return request.delete('/admin/logs/realtime')
  },
  
  /**
   * 角色管理
   */
  getRoles() {
    return request.get('/admin/roles')
  },
  
  getAdminUsers(params = {}) {
    return request.get('/admin/admin-users', { params })
  },
  
  /**
   * 公告管理
   */
  getAnnouncements(params = {}) {
    return request.get('/admin/announcements', { params })
  },
  
  createAnnouncement(data) {
    return request.post('/admin/announcements', data)
  },
  
  updateAnnouncement(announcementId, data) {
    return request.put(`/admin/announcements/${announcementId}`, data)
  },
  
  deleteAnnouncement(announcementId) {
    return request.delete(`/admin/announcements/${announcementId}`)
  },
  
  /**
   * 系统设置
   */
  getConfigs() {
    return request.get('/admin/configs')
  },
  
  updateConfig(key, data) {
    return request.put(`/admin/configs/${key}`, data)
  },
  
  batchUpdateConfigs(configs) {
    return request.post('/admin/configs/batch', { configs })
  },
  
  /**
   * 操作日志
   */
  getOperationLogs(params = {}) {
    return request.get('/admin/operation-logs', { params })
  },

  getOperationLogOptions() {
    return request.get('/admin/operation-logs/options')
  },
  
  /**
   * 敏感词管理
   */
  getSensitiveWords(params = {}) {
    return request.get('/admin/sensitive-words', { params })
  },
  
  addSensitiveWord(data) {
    return request.post('/admin/sensitive-words', data)
  },
  
  updateSensitiveWord(wordId, data) {
    return request.put(`/admin/sensitive-words/${wordId}`, data)
  },
  
  deleteSensitiveWord(wordId) {
    return request.delete(`/admin/sensitive-words/${wordId}`)
  },
  
  batchImportSensitiveWords(words, category, level) {
    return request.post('/admin/sensitive-words/batch-import', { words, category, level })
  },
  
  /**
   * AI审核
   */
  aiReviewReport(reportId) {
    // 修复: AI 审核调用外部 API 可能耗时 30s+,单独覆盖超时
    return request.post(`/admin/ai/review/${reportId}`, {}, { timeout: 120000 })
  },

  /**
   * 获取重复举报分组
   * @param {string} type - 类型过滤(可选)
   */
  getDuplicateReportGroups(type) {
    const params = {};
    if (type) params.type = type;
    return request.get('/admin/reports/duplicates', { params })
  },

  /**
   * 合并重复举报
   * @param {number[]} reportIds - 要合并的举报ID列表
   */
  mergeReports(reportIds) {
    return request.post('/admin/reports/merge', { reportIds })
  },

  /**
   * 获取实时日志
   * @param {string} lastTime - 上次最后一条日志时间(ISO)
   * @param {number} limit - 返回条数上限
   * @param {string} source - 日志来源: memory(应用日志) | file(文件日志,含Docker输出)
   */

  aiBatchReviewReports(reportIds) {
    return request.post('/admin/ai/batch-review', { reportIds })
  },

  aiAutoHandleReports(reportIds) {
    return request.post('/admin/ai/auto-handle', { reportIds })
  },

  /**
   * 敏感词测试
   */
  testSensitiveCheck(data) {
    return request.post('/admin/sensitive-words/test', data)
  },

  /**
   * 权限管理
   */
  getPermissions() {
    return request.get('/admin/permissions')
  },
  
  getRolePermissions() {
    return request.get('/admin/role-permissions')
  },
  
  updateRolePermissions(role, data) {
    return request.put(`/admin/role-permissions/${role}`, data)
  },
  
  resetRolePermissions(role) {
    return request.post(`/admin/role-permissions/${role}/reset`)
  },
  
  getCaptchaStats(days = 7) {
    return request.get('/admin/captcha-stats', { params: { days } })
  },
  
  getStudios(params = {}) {
    return request.get('/admin/studios', { params })
  },
  
  getStudioDetail(studioId) {
    return request.get(`/admin/studios/${studioId}`)
  },
  
  updateStudio(id, data) {
    return request.put(`/admin/studios/${id}`, data)
  },
  
  updateStudioStatus(id, status) {
    return request.put(`/admin/studios/${id}/status`, { status })
  },
  
  updateStudioPoints(id, data) {
    return request.put(`/admin/studios/${id}/points`, data)
  },
  
  updateStudioMember(studioId, userId, data) {
    return request.put(`/admin/studios/${studioId}/members/${userId}`, data)
  },
  
  removeStudioMember(studioId, userId) {
    return request.delete(`/admin/studios/${studioId}/members/${userId}`)
  },
  
  removeStudioWork(studioId, workId) {
    return request.delete(`/admin/studios/${studioId}/works/${workId}`)
  },
  
  setWorkScore(studioWorkId, score) {
    return request.put(`/admin/studio-works/${studioWorkId}/score`, { score })
  },
  
  deleteStudio(id) {
    return request.delete(`/admin/studios/${id}`)
  },

  getStudioMembers(studioId) {
    return request.get(`/admin/studios/${studioId}/members`)
  },

  getStudioPendingMembers(studioId) {
    return request.get(`/admin/studios/${studioId}/pending-members`)
  },

  getStudioPendingWorks(studioId) {
    return request.get(`/admin/studios/${studioId}/pending-works`)
  },

  reviewStudioMember(studioId, memberId, action) {
    return request.put(`/admin/studios/${studioId}/members/${memberId}/review`, { action })
  },
  // 别名(与模板中的 handleApproveMember/handleRejectMember 对应)
  reviewMember(studioId, memberId, action) {
    return this.reviewStudioMember(studioId, memberId, action)
  },

  reviewStudioWork(studioId, workId, action) {
    return request.put(`/admin/studios/${studioId}/works/${workId}/review`, { action })
  },

  updateUserLevel(userId, level) {
    return request.put(`/admin/users/${userId}/level`, { level })
  }
}
