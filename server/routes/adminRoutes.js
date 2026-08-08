/**
 * 后台管理路由
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const warningController = require('../controllers/warningController');
const developerController = require('../controllers/developerController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { requireRole, requirePermission } = require('../middleware/permission');
const { requireForumPostPermission, requireScopedCommentPermission } = require('../middleware/forumModeration');
const { auditAdminRequest } = require('../middleware/operationLog');
const denyModerator = (req, res, next) => req.user?.role === 'moderator'
    ? res.status(403).json({ code: 403, msg: '版主不能管理作品，只能管理被分配板块的帖子与评论', data: null })
    : next();

/**
 * 以下路由需要管理员权限
 * 注意：第一个使用编程猫登录的用户将自动成为超级管理员
 */
router.use(authMiddleware);
router.use(adminMiddleware);
// 所有后台请求统一审计，避免各控制器手工埋点造成漏记。
router.use(auditAdminRequest());

/**
 * 统计数据
 * 修复: 补充 requirePermission,配合 adminMiddleware 放宽至 reviewer+
 */
router.get('/stats', requirePermission('statistics:view'), adminController.getStats);
router.get('/trends', requirePermission('statistics:view'), adminController.getTrends);
router.get('/captcha-stats', requirePermission('statistics:view'), adminController.getCaptchaStats);

/**
 * 角色管理（仅超级管理员）
 */
router.get('/roles', requireRole('superadmin'), adminController.getRoles);
router.get('/admin-users', requireRole('admin'), adminController.getAdminUsers);

/**
 * 用户管理
 */
router.get('/users', requirePermission('user:view'), adminController.getUsers);
router.get('/users/:userId', requirePermission('user:view'), adminController.getUserDetail);
// 修复: superadmin 专用 - 查看完整编程猫 Token(审计日志)
router.get('/users/:userId/codemao-token', requireRole('superadmin'), adminController.getUserCodemaoToken);
router.put('/users/:userId', requirePermission('user:edit'), adminController.updateUser);
router.post('/users/:userId/impersonate', requireRole('admin'), adminController.impersonateUser);
// 修复: restore-from-impersonate 移到 userRoutes(不走 adminMiddleware)
// 原因: impersonate 后当前用户是被模拟的普通用户,通不过 adminMiddleware(reviewer+)
router.put('/users/:userId/password', requireRole('admin'), adminController.updateUserPassword);
router.put('/users/:userId/status', requirePermission('user:disable'), adminController.updateUserStatus);
router.post('/users/:userId/warnings', requirePermission('user:warn'), warningController.issueWarning);
router.put('/users/:userId/role', requireRole('admin'), adminController.updateUserRole);
router.delete('/users/:userId', requireRole('superadmin'), adminController.deleteUser);
router.post('/users/:userId/notification', requireRole('admin'), adminController.sendUserNotification);
router.post('/users/batch-notification', requireRole('admin'), adminController.sendBatchNotifications);
router.post('/users/all-notification', requireRole('admin'), adminController.sendAllUsersNotification);
router.put('/users/:userId/level', requireRole('admin'), adminController.updateUserLevel);

/**
 * 作品管理
 */
router.get('/works', denyModerator, requirePermission('work:review'), adminController.getWorks);
router.put('/works/:workId', denyModerator, requirePermission('work:edit'), adminController.updateWork);
router.put('/works/:workId/featured', denyModerator, requirePermission('work:feature'), adminController.setWorkFeatured);
router.delete('/works/:workId', denyModerator, requirePermission('work:delete'), adminController.deleteWork);
router.delete('/works/:workId/purge', requireRole('superadmin'), adminController.purgeWork);
// 全站校准属于高风险操作：仅超级管理员可先扫描预览，再显式确认应用。
router.post('/works/recalibrate', requireRole('superadmin'), adminController.recalibrateAllWorks);
router.get('/works/recalibrate/:jobId', requireRole('superadmin'), adminController.getRecalibrationJob);
router.post('/works/recalibrate/:jobId/apply', requireRole('superadmin'), adminController.applyRecalibrationJob);

/**
 * 评论管理
 */
router.get('/comments', requirePermission('comment:review'), adminController.getComments);
router.put('/comments/:commentId/status', requireScopedCommentPermission('comment:review'), adminController.updateCommentStatus);
router.delete('/comments/:commentId', requireScopedCommentPermission('comment:delete'), adminController.deleteComment);

/**
 * 帖子管理
 */
router.get('/posts', requireRole('moderator'), requirePermission('post:review'), adminController.getPosts);
router.get('/posts/pending-review', requireRole('moderator'), requirePermission('post:review'), adminController.getPendingReviewPosts);
router.post('/posts/:postId/review', requireRole('moderator'), requirePermission('post:review'), adminController.reviewPendingPost);
router.get('/forum/overview', requireRole('moderator'), requirePermission('post:review'), adminController.getForumOverview);
router.get('/forum/attention-settings', requireRole('admin'), adminController.getForumAttentionSettings);
router.put('/forum/attention-settings', requireRole('admin'), adminController.updateForumAttentionSettings);
router.get('/posts/:postId/history', requireForumPostPermission('post:review'), adminController.getPostHistory);
router.post('/posts/:postId/revisions/:revisionId/restore', requireForumPostPermission('post:edit'), adminController.restorePostRevision);
router.get('/forum/boards', requirePermission('post:review'), adminController.getForumBoards);
router.post('/forum/boards', requireRole('admin'), adminController.createForumBoard);
router.put('/forum/boards/:boardId', requireRole('admin'), adminController.updateForumBoard);
router.delete('/forum/boards/:boardId', requireRole('admin'), adminController.deleteForumBoard);
router.get('/forum/boards/:boardId/moderators', requireRole('admin'), adminController.getForumBoardModerators);
router.post('/forum/boards/:boardId/moderators', requireRole('admin'), adminController.assignForumBoardModerator);
router.delete('/forum/boards/:boardId/moderators/:userId', requireRole('admin'), adminController.removeForumBoardModerator);
router.post('/posts/:postId/move', requireForumPostPermission('post:edit'), adminController.movePost);
router.post('/posts/:postId/merge', requireForumPostPermission('post:edit'), adminController.mergePosts);
router.put('/posts/:postId/essence', requireForumPostPermission('post:edit'), adminController.setPostEssence);
router.put('/posts/:postId/top', requireForumPostPermission('post:sticky'), adminController.setPostTop);
router.put('/posts/:postId', requireForumPostPermission('post:edit'), adminController.updatePost);
router.delete('/posts/:postId', requireForumPostPermission('post:delete'), adminController.deletePost);

/**
 * 轮播图管理
 */
router.get('/banners', requirePermission('banner:view'), adminController.getBanners);
router.post('/banners', requirePermission('banner:create'), adminController.createBanner);
router.put('/banners/:bannerId', requirePermission('banner:edit'), adminController.updateBanner);
router.delete('/banners/:bannerId', requirePermission('banner:delete'), adminController.deleteBanner);

/**
 * 举报管理
 */
router.get('/reports', requirePermission('report:view'), adminController.getReports);
router.put('/reports/:reportId', requirePermission('report:handle'), adminController.handleReport);
router.get('/reports/:reportId/audit-logs', requirePermission('report:view'), adminController.getReportAuditLogs);

// 代理管理
router.get('/proxy/config', requireRole('superadmin'), adminController.getProxyConfig);
router.post('/proxy/config', requireRole('superadmin'), adminController.updateProxyConfig);
router.post('/proxy/test', requireRole('superadmin'), adminController.testProxy);
router.post('/proxy/refresh', requireRole('superadmin'), adminController.refreshProxy);
// 修复: 重复举报检测与合并
router.get('/reports/duplicates', requirePermission('report:view'), adminController.getDuplicateReportGroups);
router.post('/reports/merge', requirePermission('report:handle'), adminController.mergeReports);

/**
 * IP封禁管理
 */
router.get('/ip-bans', requireRole('admin'), adminController.getIpBans);
router.post('/ip-bans', requireRole('admin'), adminController.addIpBan);
router.delete('/ip-bans/:ipBanId', requireRole('admin'), adminController.removeIpBan);

/**
 * 爬取功能
 */
router.post('/crawl/work', requirePermission('crawl:works'), adminController.crawlWork);
router.post('/crawl/hot', requirePermission('crawl:works'), adminController.crawlHotWorks);
router.post('/crawl/user', requirePermission('crawl:works'), adminController.crawlUserWorks);
router.post('/crawl/posts', requirePermission('crawl:works'), adminController.crawlPostWorks);
router.post('/crawl/banners', requirePermission('crawl:works'), adminController.crawlBanners);
router.get('/crawl/logs', requirePermission('crawl:works'), adminController.getCrawlLogs);

/**
 * 实时日志
 */
router.get('/logs/realtime', requirePermission('log:view'), adminController.getRealtimeLogs);
router.delete('/logs/realtime', requirePermission('log:view'), adminController.clearRealtimeLogs);

/**
 * 公告管理
 */
router.get('/announcements', requirePermission('announcement:view'), adminController.getAnnouncements);
router.post('/announcements', requirePermission('announcement:create'), adminController.createAnnouncement);
router.put('/announcements/:announcementId', requirePermission('announcement:edit'), adminController.updateAnnouncement);
router.delete('/announcements/:announcementId', requirePermission('announcement:delete'), adminController.deleteAnnouncement);

/**
 * 系统设置
 */
router.get('/configs', requireRole('superadmin'), adminController.getSystemConfigs);
router.put('/configs/:key', requireRole('superadmin'), adminController.updateSystemConfig);
router.post('/configs/batch', requireRole('superadmin'), adminController.batchUpdateConfigs);

/**
 * 操作日志
 */
router.get('/operation-logs/options', requirePermission('log:view'), adminController.getOperationLogOptions);
router.get('/operation-logs', requirePermission('log:view'), adminController.getOperationLogs);

/**
 * 敏感词管理
 */
router.get('/sensitive-words', requirePermission('sensitive:manage'), adminController.getSensitiveWords);
router.post('/sensitive-words', requirePermission('sensitive:manage'), adminController.addSensitiveWord);
router.post('/sensitive-words/test', requireRole('admin'), adminController.testSensitiveCheck);
router.put('/sensitive-words/:wordId', requirePermission('sensitive:manage'), adminController.updateSensitiveWord);
router.delete('/sensitive-words/:wordId', requirePermission('sensitive:manage'), adminController.deleteSensitiveWord);
router.post('/sensitive-words/batch-import', requirePermission('sensitive:manage'), adminController.batchImportSensitiveWords);

/**
 * AI审核
 */
router.post('/ai/review/:reportId', requirePermission('report:handle'), adminController.aiReviewReport);
router.post('/ai/batch-review', requirePermission('report:handle'), adminController.aiBatchReviewReports);
router.post('/ai/auto-handle', requirePermission('report:handle'), adminController.aiAutoHandleReports);

/**
 * 权限管理（仅超级管理员）
 */
router.get('/permissions', requireRole('superadmin'), adminController.getPermissions);
router.get('/role-permissions', requireRole('superadmin'), adminController.getRolePermissionsList);
router.put('/role-permissions/:role', requireRole('superadmin'), adminController.updateRolePermissions);
router.post('/role-permissions/:role/reset', requireRole('superadmin'), adminController.resetRolePermissions);

/**
 * 工作室管理
 */
router.get('/studios', requireRole('admin'), adminController.getStudios);
router.get('/studios/:id', requireRole('admin'), adminController.getStudioDetail);
router.put('/studios/:id', requireRole('admin'), adminController.updateStudio);
router.put('/studios/:id/status', requireRole('admin'), adminController.updateStudioStatus);
router.put('/studios/:id/points', requireRole('admin'), adminController.updateStudioPoints);
router.put('/studios/:studioId/members/:userId', requireRole('admin'), adminController.updateStudioMember);
router.put('/studios/:studioId/members/:userId/review', requireRole('admin'), adminController.reviewStudioMember);
router.delete('/studios/:studioId/members/:userId', requireRole('admin'), adminController.removeStudioMember);
router.delete('/studios/:studioId/works/:workId', requireRole('admin'), adminController.removeStudioWork);
router.delete('/studios/:id', requireRole('admin'), adminController.deleteStudio);

/**
 * 工作室作品管理
 */
router.put('/studio-works/:id/score', requireRole('admin'), adminController.setWorkScore);

/**
 * Developer app review
 */
router.get('/developer-apps', requirePermission('developer:review'), developerController.adminListApps);
router.get('/developer-apps/:id', requirePermission('developer:review'), developerController.adminGetApp);
router.get('/developer-apps/:id/calls', requirePermission('developer:review'), developerController.adminListAppCalls);
router.post('/developer-apps/:id/review', requirePermission('developer:review'), developerController.adminReviewApp);


/**
 * Developer app management (developer:manage)
 */
router.put('/developer-apps/:id/rate-limit', requirePermission('developer:manage'), developerController.adminUpdateAppRateLimit);
router.post('/developer-apps/:id/revoke-all-tokens', requirePermission('developer:manage'), developerController.adminRevokeAllTokens);
router.post('/developer-apps/:id/regenerate-secret', requirePermission('developer:manage'), developerController.adminRegenerateSecret);
router.delete('/developer-apps/:id', requirePermission('developer:manage'), developerController.adminDeleteApp);
router.get('/developer-apps/:id/audit-logs', requirePermission('developer:review'), developerController.adminListAuditLogs);
router.get('/developer-apps/:id/stats', requirePermission('developer:review'), developerController.adminCallLogStats);
router.get('/developer-apps/:id/stats/detail', requirePermission('developer:review'), developerController.adminCallLogStatsDetail);






module.exports = router;
