/**
 * 数据库模型定义
 * 使用Sequelize ORM，支持SQLite和MySQL
 *
 * 修复说明（H16/M3-M10/M21-M25/L8）：
 * - 所有模型改为 timestamps:true + underscored:true，由 Sequelize 自动管理 created_at/updated_at
 * - Work.user_id 改为 allowNull:false（M3）
 * - StudioMember/StudioWork 补复合唯一索引（M4/M5）
 * - Studio/StudioWork/Report/SensitiveWord.status 改为 ENUM（M7）
 * - Follow 加 beforeCreate hook 防止自关注（M8）
 * - Comment 自引用加 onDelete:'SET NULL'（M10）
 * - 高频查询字段补索引（M21/M22）
 * - Post.tags getter 返回 [] 而非 null（M24）
 * - RolePermission.permissions 加 JSON get/set（M25）
 * - User.codemao_token 标注 TODO 待加密（L8）
 */

require('dotenv').config();

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

console.log('📦 加载Sequelize模型');

// H16: 统一 timestamps 选项，供所有模型复用，由 Sequelize 自动维护 created_at/updated_at
const TIMESTAMP_OPTS = {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
};

const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codemao_user_id: { type: DataTypes.STRING(50), unique: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    nickname: { type: DataTypes.STRING(50) },
    avatar: { type: DataTypes.STRING(500) },
    profile_cover: { type: DataTypes.STRING(500) },
    show_favorites: { type: DataTypes.BOOLEAN, defaultValue: false },
    bio: { type: DataTypes.TEXT },
    doing: { type: DataTypes.STRING(200) },
    gender: { type: DataTypes.ENUM('m', 'f', 'unknown'), defaultValue: 'unknown' },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    experience: { type: DataTypes.INTEGER, defaultValue: 0 },
    follower_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    following_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    work_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    // L8 TODO: codemao_token 当前明文存储，后续需引入密钥管理（如 AES-256-GCM）加密后再落库
    codemao_token: { type: DataTypes.TEXT },
    role: { type: DataTypes.ENUM('user', 'reviewer', 'moderator', 'admin', 'superadmin'), defaultValue: 'user' },
    status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
    token_version: { type: DataTypes.INTEGER, defaultValue: 0 },
    // 密码修改时间戳，adminController 重置密码时更新此字段，用于强制旧 token 失效等场景
    password_changed_at: { type: DataTypes.DATE, allowNull: true },
    is_active_dalao: { type: DataTypes.BOOLEAN, defaultValue: false }
}, Object.assign({ tableName: 'users' }, TIMESTAMP_OPTS));

const Work = sequelize.define('Work', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codemao_work_id: { type: DataTypes.STRING(50), unique: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    description: {
        type: DataTypes.TEXT,
        validate: {
            len: {
                args: [0, 10000],
                msg: '作品简介不能超过10000字'
            }
        }
    },
    preview: { type: DataTypes.STRING(500) },
    type: { type: DataTypes.STRING(50) },
    ide_type: { type: DataTypes.STRING(50), defaultValue: 'KITTEN' },
    work_url: { type: DataTypes.STRING(500) },
    // M3: user_id 必填，作品必须归属某个用户
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    codemao_author_id: { type: DataTypes.STRING(50) },
    codemao_author_name: { type: DataTypes.STRING(100) },
    view_times: { type: DataTypes.INTEGER, defaultValue: 0 },
    praise_times: { type: DataTypes.INTEGER, defaultValue: 0 },
    collection_times: { type: DataTypes.INTEGER, defaultValue: 0 },
    comment_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    // 新增 'hidden' 状态：管理员可隐藏作品(从前台和列表移除,数据保留),与 deleted 区分
    status: { type: DataTypes.ENUM('pending', 'published', 'rejected', 'hidden', 'deleted'), defaultValue: 'published' },
    is_featured: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_sidebar_recommended: { type: DataTypes.BOOLEAN, defaultValue: false },
    sidebar_sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, Object.assign({
    tableName: 'works',
    // M21: 高频查询字段索引（status/user_id/created_at）
    indexes: [
        { fields: ['status'] },
        { fields: ['user_id'] },
        { fields: ['created_at'] }
    ]
}, TIMESTAMP_OPTS));

const Comment = sequelize.define('Comment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    work_id: { type: DataTypes.INTEGER },
    post_id: { type: DataTypes.INTEGER },
    parent_id: { type: DataTypes.INTEGER },
    reply_to_user_id: { type: DataTypes.INTEGER },
    legacy_studio_forum_reply_id: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    like_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.ENUM('active', 'hidden', 'deleted'), defaultValue: 'active' }
}, Object.assign({
    tableName: 'comments',
    // M21: 评论按 work_id/post_id/status/parent_id 高频查询
    indexes: [
        { fields: ['work_id'] },
        { fields: ['post_id'] },
        { fields: ['status'] },
        { fields: ['parent_id'] }
    ]
}, TIMESTAMP_OPTS));

const Post = sequelize.define('Post', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    view_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    like_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    comment_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    reply_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    collection_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_top: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_essence: { type: DataTypes.BOOLEAN, defaultValue: false },
    category: { type: DataTypes.STRING(50), defaultValue: 'discussion' },
    board_id: { type: DataTypes.INTEGER, allowNull: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: true },
    legacy_studio_forum_post_id: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    post_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'discussion' },
    last_reply_at: { type: DataTypes.DATE, allowNull: true },
    last_reply_user_id: { type: DataTypes.INTEGER, allowNull: true },
    last_comment_id: { type: DataTypes.INTEGER, allowNull: true },
    participant_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    is_locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    slow_mode_seconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    accepted_comment_id: { type: DataTypes.INTEGER, allowNull: true },
    merged_into_post_id: { type: DataTypes.INTEGER, allowNull: true },
    cover: { type: DataTypes.STRING(500) },
    // 中·绕过隐藏: 区分 AI 隐藏 vs 管理员手动隐藏。
    // 'ai_review' = AI 审核触发自动隐藏,编辑后审核通过可自动恢复 published;
    // 'manual' 或 null  = 管理员手动隐藏,用户编辑不能绕过
    hidden_reason: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
    // M6: status ENUM 不含 active（app.js 启动时已迁移 active→published）
    status: { type: DataTypes.ENUM('published', 'draft', 'hidden', 'deleted'), defaultValue: 'published' },
    tags: {
        type: DataTypes.TEXT,
        // M24: getter 统一返回数组，无值时返回 [] 而非 null
        get() {
            const val = this.getDataValue('tags');
            if (!val) return [];
            try {
                return JSON.parse(val);
            } catch (e) {
                console.error('解析tags JSON失败:', e);
                return [];
            }
        },
        set(val) {
            this.setDataValue('tags', val ? JSON.stringify(val) : null);
        }
    }
}, Object.assign({
    tableName: 'posts',
    // M21: 帖子按 status/user_id/category 高频查询
    indexes: [
        { fields: ['status'] },
        { fields: ['user_id'] },
        { fields: ['category'] },
        { fields: ['board_id', 'status', 'last_reply_at'] },
        { fields: ['post_type', 'status'] }
    ]
}, TIMESTAMP_OPTS));

const ForumBoard = sequelize.define('ForumBoard', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slug: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
    icon: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '💬' },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#fec433' },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    studio_recruitment_only: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allow_post_roles: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '["user","reviewer","moderator","admin","superadmin"]',
        get() { try { return JSON.parse(this.getDataValue('allow_post_roles') || '[]'); } catch { return []; } },
        set(value) { this.setDataValue('allow_post_roles', JSON.stringify(Array.isArray(value) ? value : [])); }
    }
}, Object.assign({ tableName: 'forum_boards', indexes: [{ fields: ['status', 'sort_order'] }] }, TIMESTAMP_OPTS));

const ForumBoardSubscription = sequelize.define('ForumBoardSubscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    board_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false }
}, Object.assign({ tableName: 'forum_board_subscriptions', indexes: [{ unique: true, fields: ['board_id', 'user_id'] }, { fields: ['user_id'] }] }, TIMESTAMP_OPTS));

const ForumBoardModerator = sequelize.define('ForumBoardModerator', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    board_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    assigned_by: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }
}, Object.assign({
    tableName: 'forum_board_moderators',
    indexes: [{ unique: true, fields: ['board_id', 'user_id'] }, { fields: ['user_id'] }]
}, TIMESTAMP_OPTS));

const PostSubscription = sequelize.define('PostSubscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    notify: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_read_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({ tableName: 'post_subscriptions', indexes: [{ unique: true, fields: ['post_id', 'user_id'] }, { fields: ['user_id', 'notify'] }] }, TIMESTAMP_OPTS));

const PostDraft = sequelize.define('PostDraft', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    title: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
    content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    board_id: { type: DataTypes.INTEGER, allowNull: true },
    post_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'discussion' },
    cover: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
    tags: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
        get() { try { return JSON.parse(this.getDataValue('tags') || '[]'); } catch { return []; } },
        set(value) { this.setDataValue('tags', JSON.stringify(Array.isArray(value) ? value : [])); }
    }
}, Object.assign({ tableName: 'post_drafts', indexes: [{ unique: true, fields: ['user_id'] }, { fields: ['updated_at'] }] }, TIMESTAMP_OPTS));

const PostRevision = sequelize.define('PostRevision', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
    revision_number: { type: DataTypes.INTEGER, allowNull: false },
    editor_id: { type: DataTypes.INTEGER, allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'user' },
    change_reason: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    board_id: { type: DataTypes.INTEGER, allowNull: true },
    post_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'discussion' },
    cover: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
    tags: {
        type: DataTypes.TEXT, allowNull: false, defaultValue: '[]',
        get() { try { return JSON.parse(this.getDataValue('tags') || '[]'); } catch { return []; } },
        set(value) { this.setDataValue('tags', JSON.stringify(Array.isArray(value) ? value : [])); }
    }
}, Object.assign({ tableName: 'post_revisions', indexes: [{ unique: true, fields: ['post_id', 'revision_number'] }, { fields: ['post_id', 'created_at'] }, { fields: ['editor_id'] }] }, TIMESTAMP_OPTS));

const ForumModerationLog = sequelize.define('ForumModerationLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
    operator_id: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(50), allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    before_state: { type: DataTypes.TEXT, allowNull: true },
    after_state: { type: DataTypes.TEXT, allowNull: true }
}, Object.assign({ tableName: 'forum_moderation_logs', indexes: [{ fields: ['post_id', 'created_at'] }, { fields: ['operator_id'] }, { fields: ['action'] }] }, TIMESTAMP_OPTS));

const Studio = sequelize.define('Studio', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT },
    cover: { type: DataTypes.STRING(500) },
    cover_url: { type: DataTypes.STRING(500) },
    owner_id: { type: DataTypes.INTEGER, allowNull: false },
    vice_owner_id: { type: DataTypes.INTEGER },
    member_count: { type: DataTypes.INTEGER, defaultValue: 1 },
    work_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_score: { type: DataTypes.INTEGER, defaultValue: 0 },
    points: { type: DataTypes.INTEGER, defaultValue: 0 },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    is_public: { type: DataTypes.BOOLEAN, defaultValue: true },
    join_type: { type: DataTypes.STRING(20), defaultValue: 'public' },
    member_limit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    recruitment_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    application_questions: {
        type: DataTypes.TEXT, allowNull: false, defaultValue: '[]',
        get() { try { return JSON.parse(this.getDataValue('application_questions') || '[]'); } catch { return []; } },
        set(value) { this.setDataValue('application_questions', JSON.stringify(Array.isArray(value) ? value : [])); }
    },
    application_cooldown_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
    leave_work_policy: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'remove' },
    im_group_id: { type: DataTypes.STRING(100), allowNull: true },
    // M7: status 改为 ENUM，覆盖 controller 实际使用的 active/pending/banned，预留 dissolved
    status: { type: DataTypes.ENUM('active', 'pending', 'dissolved', 'banned'), defaultValue: 'active' },
    // 修复: owner_claim 用于数据库级"每人一个工作室"并发保护
    // 当 status != 'banned' 时等于 owner_id,banned 时为 NULL
    // 唯一索引允许多个 NULL,因此被封禁的工作室不会阻止用户创建新工作室
    owner_claim: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
}, Object.assign({ tableName: 'studios', indexes: [
    { name: 'owner_claim_unique', unique: true, fields: ['owner_claim'] }
] }, TIMESTAMP_OPTS));

const StudioMember = sequelize.define('StudioMember', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    role: { type: DataTypes.ENUM('owner', 'vice_owner', 'admin', 'member'), defaultValue: 'member' },
    status: { type: DataTypes.ENUM('active', 'pending', 'rejected'), defaultValue: 'active' },
    permissions: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() { try { return JSON.parse(this.getDataValue('permissions') || 'null'); } catch { return null; } },
        set(value) { this.setDataValue('permissions', value == null ? null : JSON.stringify(value)); }
    },
    application_message: { type: DataTypes.STRING(500), allowNull: true },
    application_answers: {
        type: DataTypes.TEXT, allowNull: true,
        get() { try { return JSON.parse(this.getDataValue('application_answers') || '[]'); } catch { return []; } },
        set(value) { this.setDataValue('application_answers', value == null ? null : JSON.stringify(Array.isArray(value) ? value : [])); }
    },
    review_reason: { type: DataTypes.STRING(500), allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, Object.assign({
    tableName: 'studio_members',
    // M4: (studio_id, user_id) 复合唯一索引，防止同一用户重复加入同一工作室
    // 注意：旧库若已存在重复数据，SQLite sync 不会强制检查，需另行去重
    indexes: [
        { unique: true, fields: ['studio_id', 'user_id'], name: 'unique_studio_member' }
    ]
}, TIMESTAMP_OPTS));

const StudioWork = sequelize.define('StudioWork', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    work_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    score: { type: DataTypes.INTEGER, defaultValue: 0 },
    // M7: status 改为 ENUM，覆盖 controller 实际使用的 pending/approved/rejected/down
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected', 'down'), defaultValue: 'pending' },
    reviewed_by: { type: DataTypes.INTEGER },
    reviewed_at: { type: DataTypes.DATE },
    review_reason: { type: DataTypes.STRING(500), allowNull: true },
    is_featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    added_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, Object.assign({
    tableName: 'studio_works',
    // M5: (studio_id, work_id) 复合唯一索引，防止同一作品重复加入同一工作室
    indexes: [
        { unique: true, fields: ['studio_id', 'work_id'], name: 'unique_studio_work' }
    ]
}, TIMESTAMP_OPTS));

const StudioPointLog = sequelize.define('StudioPointLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    admin_id: { type: DataTypes.INTEGER, allowNull: false },
    delta: { type: DataTypes.INTEGER, allowNull: false },
    points_before: { type: DataTypes.INTEGER, allowNull: false },
    points_after: { type: DataTypes.INTEGER, allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: false },
    ip_address: { type: DataTypes.STRING(50) }
}, Object.assign({
    tableName: 'studio_point_logs',
    indexes: [
        { fields: ['studio_id', 'created_at'] },
        { fields: ['admin_id'] }
    ]
}, TIMESTAMP_OPTS));

const StudioInvite = sequelize.define('StudioInvite', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    created_by: { type: DataTypes.INTEGER, allowNull: false },
    target_user_id: { type: DataTypes.INTEGER, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    max_uses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    used_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    last_used_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({ tableName: 'studio_invites', indexes: [{ fields: ['studio_id', 'status'] }, { fields: ['target_user_id'] }] }, TIMESTAMP_OPTS));

const StudioOperationLog = sequelize.define('StudioOperationLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    operator_id: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    target_type: { type: DataTypes.STRING(50), allowNull: true },
    target_id: { type: DataTypes.INTEGER, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    before_state: { type: DataTypes.TEXT, allowNull: true },
    after_state: { type: DataTypes.TEXT, allowNull: true },
    ip_address: { type: DataTypes.STRING(50), allowNull: true },
    is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, Object.assign({ tableName: 'studio_operation_logs', indexes: [{ fields: ['studio_id', 'created_at'] }, { fields: ['operator_id'] }] }, TIMESTAMP_OPTS));

const StudioAnnouncement = sequelize.define('StudioAnnouncement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    author_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    is_pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'published' },
    published_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, Object.assign({ tableName: 'studio_announcements', indexes: [{ fields: ['studio_id', 'status', 'published_at'] }] }, TIMESTAMP_OPTS));

const StudioTask = sequelize.define('StudioTask', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    creator_id: { type: DataTypes.INTEGER, allowNull: false },
    assignee_id: { type: DataTypes.INTEGER, allowNull: true },
    work_id: { type: DataTypes.INTEGER, allowNull: true },
    title: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    needed_role: { type: DataTypes.STRING(80), allowNull: true },
    priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'normal' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    deadline: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({ tableName: 'studio_tasks', indexes: [{ fields: ['studio_id', 'status'] }, { fields: ['assignee_id'] }] }, TIMESTAMP_OPTS));

const StudioBlacklist = sequelize.define('StudioBlacklist', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    added_by: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' }
}, Object.assign({ tableName: 'studio_blacklists', indexes: [{ unique: true, fields: ['studio_id', 'user_id'] }] }, TIMESTAMP_OPTS));

const StudioDiscussion = sequelize.define('StudioDiscussion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' }
}, Object.assign({ tableName: 'studio_discussions', indexes: [{ fields: ['studio_id', 'created_at'] }, { fields: ['user_id'] }] }, TIMESTAMP_OPTS));

// 工作室独立论坛：不进入主论坛 Post/Comment 表，公开可读、仅本工作室成员可写。
const StudioForumPost = sequelize.define('StudioForumPost', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    view_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reply_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    last_reply_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({ tableName: 'studio_forum_posts', indexes: [{ fields: ['studio_id', 'status', 'is_pinned', 'last_reply_at'] }, { fields: ['user_id'] }] }, TIMESTAMP_OPTS));

const StudioForumReply = sequelize.define('StudioForumReply', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' }
}, Object.assign({ tableName: 'studio_forum_replies', indexes: [{ fields: ['post_id', 'status', 'created_at'] }, { fields: ['user_id'] }] }, TIMESTAMP_OPTS));

const Report = sequelize.define('Report', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING(20), allowNull: false },
    // M9: target_id 为多态外键（可指向 Work/Comment/Post），故不建数据库级 FK 约束
    // 删除目标对象时需由 controller 层同步清理 Report（已在 controller 修复）
    target_id: { type: DataTypes.INTEGER, allowNull: false },
    reporter_id: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT },
    // M7: status 改为 ENUM，覆盖 controller 实际使用的 pending/resolved/rejected，预留 merged
    status: { type: DataTypes.ENUM('pending', 'processing', 'resolved', 'rejected', 'merged'), defaultValue: 'pending' },
    handler_id: { type: DataTypes.INTEGER },
    handle_note: { type: DataTypes.TEXT },
    ai_result: { type: DataTypes.TEXT },
    // 修复: 合并重复举报时记录被合并的举报 ID 列表(改 TEXT 避免多条 ID 拼接截断)
    merged_from_ids: { type: DataTypes.TEXT, allowNull: true, defaultValue: null }
}, Object.assign({
    tableName: 'reports',
    // M21: 举报按 status/reporter_id 高频查询
    indexes: [
        { fields: ['status'] },
        { fields: ['reporter_id'] }
    ]
}, TIMESTAMP_OPTS));

const ReportAuditLog = sequelize.define('ReportAuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    report_id: { type: DataTypes.INTEGER, allowNull: false },
    handler_id: { type: DataTypes.INTEGER, allowNull: true },
    handler_type: { type: DataTypes.ENUM('human', 'ai', 'system'), allowNull: false, defaultValue: 'human' },
    action: { type: DataTypes.STRING(50), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true }
}, Object.assign({
    tableName: 'report_audit_logs',
    indexes: [
        { fields: ['report_id'] },
        { fields: ['handler_id'] },
        { fields: ['handler_type'] }
    ]
}, TIMESTAMP_OPTS));

const Like = sequelize.define('Like', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    work_id: { type: DataTypes.INTEGER },
    post_id: { type: DataTypes.INTEGER },
    comment_id: { type: DataTypes.INTEGER }
}, Object.assign({
    tableName: 'likes',
    validate: {
        hasTarget() {
            const targets = [this.work_id, this.post_id, this.comment_id].filter(Boolean);
            if (targets.length !== 1) {
                throw new Error('点赞记录必须且只能关联一个目标');
            }
        }
    },
    indexes: [
        { unique: true, fields: ['user_id', 'work_id'], name: 'unique_like_user_work' },
        { unique: true, fields: ['user_id', 'post_id'], name: 'unique_like_user_post' },
        { unique: true, fields: ['user_id', 'comment_id'], name: 'unique_like_user_comment' },
        // M22: 反向查询索引（按 work_id/post_id/comment_id 查点赞列表）
        { fields: ['work_id'] },
        { fields: ['post_id'] },
        { fields: ['comment_id'] }
    ]
}, TIMESTAMP_OPTS));

const Favorite = sequelize.define('Favorite', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    work_id: { type: DataTypes.INTEGER },
    post_id: { type: DataTypes.INTEGER }
}, Object.assign({
    tableName: 'favorites',
    validate: {
        hasTarget() {
            const targets = [this.work_id, this.post_id].filter(Boolean);
            if (targets.length !== 1) {
                throw new Error('收藏记录必须且只能关联一个目标');
            }
        }
    },
    indexes: [
        { unique: true, fields: ['user_id', 'work_id'], name: 'unique_favorite_user_work' },
        { unique: true, fields: ['user_id', 'post_id'], name: 'unique_favorite_user_post' },
        // M22: 反向查询索引（按 work_id/post_id 查收藏列表）
        { fields: ['work_id'] },
        { fields: ['post_id'] }
    ]
}, TIMESTAMP_OPTS));

const Follow = sequelize.define('Follow', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    follower_id: { type: DataTypes.INTEGER, allowNull: false },
    following_id: { type: DataTypes.INTEGER, allowNull: false }
}, Object.assign({
    tableName: 'follows',
    indexes: [
        { unique: true, fields: ['follower_id', 'following_id'], name: 'unique_follow_pair' },
        // M22: 反向查询索引（按 following_id 查"谁关注了我"）
        { fields: ['following_id'] }
    ]
}, TIMESTAMP_OPTS));

// M8: Follow 模型级校验，禁止自关注（follower_id === following_id）
Follow.addHook('beforeCreate', async (follow, options) => {
    if (follow.follower_id === follow.following_id) {
        throw new Error('不能关注自己');
    }
});

const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT },
    related_id: { type: DataTypes.INTEGER },
    related_type: { type: DataTypes.STRING(50) },
    sender_id: { type: DataTypes.INTEGER },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
    // 修复: 站内信管理员选项(是否使用头像/显示名称)JSON 存储
    meta: { type: DataTypes.TEXT, allowNull: true, defaultValue: null }
}, Object.assign({
    tableName: 'notifications',
    // M21: 通知按 user_id/is_read 高频查询
    indexes: [
        { fields: ['user_id'] },
        { fields: ['is_read'] }
    ]
}, TIMESTAMP_OPTS));

const Announcement = sequelize.define('Announcement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.ENUM('notice', 'update', 'warning'), defaultValue: 'notice' },
    // 展示颜色预设: blue/green/orange/red/purple/yellow
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'blue' },
    // 展示位置: 可多选
    show_top_bar: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    show_popup: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    show_community: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    author_id: { type: DataTypes.INTEGER, allowNull: true }
}, Object.assign({ tableName: 'announcements' }, TIMESTAMP_OPTS));

const Banner = sequelize.define('Banner', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    image_url: { type: DataTypes.STRING(500), allowNull: false },
    link_url: { type: DataTypes.STRING(500) },
    sort: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    // 来源标识：'codemao' 表示编程猫爬取，'manual' 或 null 表示手工创建
    // 用于爬取轮播图时只清理爬取来源数据，避免误删手工创建的轮播图
    source: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null }
}, Object.assign({ tableName: 'banners' }, TIMESTAMP_OPTS));

const IpBan = sequelize.define('IpBan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ip: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    reason: { type: DataTypes.STRING(500) },
    banned_by: { type: DataTypes.INTEGER },
    expires_at: { type: DataTypes.DATE }
}, Object.assign({
    tableName: 'ip_bans',
    // M21: IP 封禁按 expires_at 查询过期记录
    indexes: [
        { fields: ['expires_at'] }
    ]
}, TIMESTAMP_OPTS));

const CaptchaStats = sequelize.define('CaptchaStats', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING(20), allowNull: false },
    scene: { type: DataTypes.STRING(50) },
    action: { type: DataTypes.STRING(20) },
    ip: { type: DataTypes.STRING(50), allowNull: false },
    user_agent: { type: DataTypes.TEXT }
}, Object.assign({
    tableName: 'captcha_stats',
    // M21: 验证码统计按 created_at 查询（如按天聚合）
    indexes: [
        { fields: ['created_at'] }
    ]
}, TIMESTAMP_OPTS));

const SystemConfig = sequelize.define('SystemConfig', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    config_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    config_value: { type: DataTypes.TEXT }
}, Object.assign({ tableName: 'system_configs' }, TIMESTAMP_OPTS));

const OperationLog = sequelize.define('OperationLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER },
    action: { type: DataTypes.STRING(100), allowNull: false },
    target_type: { type: DataTypes.STRING(50) },
    target_id: { type: DataTypes.INTEGER },
    details: { type: DataTypes.TEXT },
    ip_address: { type: DataTypes.STRING(50) },
    user_agent: { type: DataTypes.TEXT }
}, Object.assign({
    tableName: 'operation_logs',
    // M21: 操作日志按 user_id/created_at 高频查询
    indexes: [
        { fields: ['user_id'] },
        { fields: ['created_at'] }
    ]
}, TIMESTAMP_OPTS));

const RolePermission = sequelize.define('RolePermission', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    role: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100) },
    level: { type: DataTypes.INTEGER, defaultValue: 0 },
    // M25: permissions 加 JSON get/set，自动序列化/反序列化
    permissions: {
        type: DataTypes.TEXT,
        get() {
            const v = this.getDataValue('permissions');
            // getter 自动把存储的 JSON 字符串解析成数组返回；空值返回空数组
            // （默认值用 [] 而非 {}，因为上层用 .includes 数组方法）
            // 修复双重 JSON.parse bug：getter 始终返回数组，业务层禁止再次 parse
            if (!v) return [];
            if (Array.isArray(v)) return v;
            try {
                let parsed = JSON.parse(v);
                // 兼容历史更新路径产生的双重 JSON 编码，避免已保存权限显示为空。
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                console.error('RolePermission.permissions JSON.parse 失败，回退为空数组:', e.message);
                return [];
            }
        },
        set(v) {
            // setter 把传入的数组序列化为 JSON 字符串存储；空值兜底为空数组
            this.setDataValue('permissions', JSON.stringify(v || []));
        }
    }
}, Object.assign({ tableName: 'role_permissions' }, TIMESTAMP_OPTS));

const Statistics = sequelize.define('Statistics', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    stat_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    stat_value: { type: DataTypes.BIGINT, defaultValue: 0 },
    stat_date: { type: DataTypes.DATE }
}, Object.assign({ tableName: 'statistics' }, TIMESTAMP_OPTS));

const UserWarning = sequelize.define('UserWarning', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    issued_by: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    source_type: { type: DataTypes.STRING(30), allowNull: true },
    source_id: { type: DataTypes.INTEGER, allowNull: true },
    source_title: { type: DataTypes.STRING(255), allowNull: true },
    source_content: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'acknowledged'), allowNull: false, defaultValue: 'pending' },
    guarantee_text: { type: DataTypes.TEXT, allowNull: true },
    acknowledged_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({
    tableName: 'user_warnings',
    indexes: [{ fields: ['user_id', 'status'] }, { fields: ['issued_by'] }, { fields: ['created_at'] }]
}, TIMESTAMP_OPTS));

const SensitiveWord = sequelize.define('SensitiveWord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    word: { type: DataTypes.STRING(200), allowNull: false },
    category: { type: DataTypes.STRING(50) },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    replacement: { type: DataTypes.STRING(200) },
    // M7: status 改为 ENUM，覆盖 controller 实际使用的 active，预留 disabled
    status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' }
}, Object.assign({ tableName: 'sensitive_words' }, TIMESTAMP_OPTS));

User.hasMany(Work, { foreignKey: 'user_id', as: 'works' });
Work.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
Post.belongsTo(User, { foreignKey: 'last_reply_user_id', as: 'last_reply_user', constraints: false });
Post.belongsTo(ForumBoard, { foreignKey: 'board_id', as: 'board', constraints: false });
ForumBoard.hasMany(Post, { foreignKey: 'board_id', as: 'posts', constraints: false });
Post.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', constraints: false });
Studio.hasMany(Post, { foreignKey: 'studio_id', as: 'recruitment_posts', constraints: false });
ForumBoardSubscription.belongsTo(ForumBoard, { foreignKey: 'board_id', as: 'board', onDelete: 'CASCADE' });
ForumBoardSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });
ForumBoard.hasMany(ForumBoardSubscription, { foreignKey: 'board_id', as: 'subscriptions', onDelete: 'CASCADE' });
User.hasMany(ForumBoardSubscription, { foreignKey: 'user_id', as: 'forum_board_subscriptions', onDelete: 'CASCADE' });
ForumBoardModerator.belongsTo(ForumBoard, { foreignKey: 'board_id', as: 'board', onDelete: 'CASCADE' });
ForumBoardModerator.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });
ForumBoardModerator.belongsTo(User, { foreignKey: 'assigned_by', as: 'assigner', constraints: false });
ForumBoard.hasMany(ForumBoardModerator, { foreignKey: 'board_id', as: 'moderators', onDelete: 'CASCADE' });
User.hasMany(ForumBoardModerator, { foreignKey: 'user_id', as: 'moderated_forum_boards', onDelete: 'CASCADE' });
PostSubscription.belongsTo(Post, { foreignKey: 'post_id', as: 'post', onDelete: 'CASCADE' });
PostSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });
Post.hasMany(PostSubscription, { foreignKey: 'post_id', as: 'subscriptions', onDelete: 'CASCADE' });
User.hasMany(PostSubscription, { foreignKey: 'user_id', as: 'post_subscriptions', onDelete: 'CASCADE' });
PostDraft.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });
PostDraft.belongsTo(ForumBoard, { foreignKey: 'board_id', as: 'board', constraints: false });
User.hasOne(PostDraft, { foreignKey: 'user_id', as: 'post_draft', onDelete: 'CASCADE' });
PostRevision.belongsTo(Post, { foreignKey: 'post_id', as: 'post', onDelete: 'CASCADE' });
PostRevision.belongsTo(User, { foreignKey: 'editor_id', as: 'editor', constraints: false });
Post.hasMany(PostRevision, { foreignKey: 'post_id', as: 'revisions', onDelete: 'CASCADE' });
ForumModerationLog.belongsTo(Post, { foreignKey: 'post_id', as: 'post', onDelete: 'CASCADE' });
ForumModerationLog.belongsTo(User, { foreignKey: 'operator_id', as: 'operator', constraints: false });
Post.hasMany(ForumModerationLog, { foreignKey: 'post_id', as: 'moderation_logs', onDelete: 'CASCADE' });
User.hasMany(Comment, { foreignKey: 'user_id', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Comment.belongsTo(User, { foreignKey: 'reply_to_user_id', as: 'reply_to_user' });
Comment.belongsTo(Work, { foreignKey: 'work_id', as: 'work' });
Work.hasMany(Comment, { foreignKey: 'work_id', as: 'comments' });
Comment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Post.hasMany(Comment, { foreignKey: 'post_id', as: 'comments' });
User.hasMany(Studio, { foreignKey: 'owner_id', as: 'owned_studios' });
Studio.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
StudioMember.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio' });
StudioMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Studio.hasMany(StudioMember, { foreignKey: 'studio_id', as: 'members' });
StudioWork.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio' });
StudioWork.belongsTo(Work, { foreignKey: 'work_id', as: 'work' });
StudioWork.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Studio.hasMany(StudioPointLog, { foreignKey: 'studio_id', as: 'point_logs', constraints: false });
StudioPointLog.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', constraints: false });
StudioPointLog.belongsTo(User, { foreignKey: 'admin_id', as: 'admin', constraints: false });
StudioInvite.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioInvite.belongsTo(User, { foreignKey: 'created_by', as: 'creator', constraints: false });
StudioInvite.belongsTo(User, { foreignKey: 'target_user_id', as: 'target_user', constraints: false });
Studio.hasMany(StudioInvite, { foreignKey: 'studio_id', as: 'invites', onDelete: 'CASCADE' });
StudioOperationLog.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioOperationLog.belongsTo(User, { foreignKey: 'operator_id', as: 'operator', constraints: false });
Studio.hasMany(StudioOperationLog, { foreignKey: 'studio_id', as: 'operation_logs', onDelete: 'CASCADE' });
StudioAnnouncement.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioAnnouncement.belongsTo(User, { foreignKey: 'author_id', as: 'author', constraints: false });
Studio.hasMany(StudioAnnouncement, { foreignKey: 'studio_id', as: 'announcements', onDelete: 'CASCADE' });
StudioTask.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioTask.belongsTo(User, { foreignKey: 'creator_id', as: 'creator', constraints: false });
StudioTask.belongsTo(User, { foreignKey: 'assignee_id', as: 'assignee', constraints: false });
StudioTask.belongsTo(Work, { foreignKey: 'work_id', as: 'work', constraints: false });
Studio.hasMany(StudioTask, { foreignKey: 'studio_id', as: 'tasks', onDelete: 'CASCADE' });
StudioBlacklist.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioBlacklist.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });
StudioBlacklist.belongsTo(User, { foreignKey: 'added_by', as: 'adder', constraints: false });
Studio.hasMany(StudioBlacklist, { foreignKey: 'studio_id', as: 'blacklist', onDelete: 'CASCADE' });
StudioDiscussion.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioDiscussion.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });
Studio.hasMany(StudioDiscussion, { foreignKey: 'studio_id', as: 'discussions', onDelete: 'CASCADE' });
StudioForumPost.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio', onDelete: 'CASCADE' });
StudioForumPost.belongsTo(User, { foreignKey: 'user_id', as: 'author', constraints: false });
Studio.hasMany(StudioForumPost, { foreignKey: 'studio_id', as: 'forum_posts', onDelete: 'CASCADE' });
StudioForumReply.belongsTo(StudioForumPost, { foreignKey: 'post_id', as: 'post', onDelete: 'CASCADE' });
StudioForumReply.belongsTo(User, { foreignKey: 'user_id', as: 'author', constraints: false });
StudioForumPost.hasMany(StudioForumReply, { foreignKey: 'post_id', as: 'replies', onDelete: 'CASCADE' });
Report.belongsTo(User, { foreignKey: 'reporter_id', as: 'reporter' });
Report.belongsTo(User, { foreignKey: 'handler_id', as: 'handler' });
Report.hasMany(ReportAuditLog, { foreignKey: 'report_id', as: 'audit_logs' });
ReportAuditLog.belongsTo(Report, { foreignKey: 'report_id', as: 'report' });
ReportAuditLog.belongsTo(User, { foreignKey: 'handler_id', as: 'handler' });
// M9: 以下四条为多态关联，target_id 可指向不同表，故 constraints:false 不建 FK
// 删除目标对象时需 controller 层同步清理 Report
Report.belongsTo(Work, { foreignKey: 'target_id', as: 'work', constraints: false });
Report.belongsTo(Comment, { foreignKey: 'target_id', as: 'comment', constraints: false });
Report.belongsTo(Post, { foreignKey: 'target_id', as: 'post', constraints: false });
// P3-10: type='user' 举报的目标用户，target_id 指向 User 本地主键；polymorphic 故 constraints:false
Report.belongsTo(User, { foreignKey: 'target_id', as: 'targetUser', constraints: false });
User.hasMany(Report, { foreignKey: 'reporter_id', as: 'reports' });
User.hasMany(Report, { foreignKey: 'handler_id', as: 'handled_reports' });
Favorite.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Favorite.belongsTo(Work, { foreignKey: 'work_id', as: 'work' });
Favorite.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
User.hasMany(Favorite, { foreignKey: 'user_id', as: 'favorites' });
Work.hasMany(Favorite, { foreignKey: 'work_id', as: 'favorites' });
Post.hasMany(Favorite, { foreignKey: 'post_id', as: 'favorites' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Notification.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
IpBan.belongsTo(User, { foreignKey: 'banned_by', as: 'bannedByUser' });
User.hasMany(IpBan, { foreignKey: 'banned_by', as: 'ipBans' });
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
OperationLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(OperationLog, { foreignKey: 'user_id', as: 'operation_logs' });
UserWarning.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });
UserWarning.belongsTo(User, { foreignKey: 'issued_by', as: 'issuer', constraints: false });
User.hasMany(UserWarning, { foreignKey: 'user_id', as: 'warnings', onDelete: 'CASCADE' });
Announcement.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

Like.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Like.belongsTo(Work, { foreignKey: 'work_id', as: 'work' });
Like.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Like.belongsTo(Comment, { foreignKey: 'comment_id', as: 'comment' });
User.hasMany(Like, { foreignKey: 'user_id', as: 'likes' });
Work.hasMany(Like, { foreignKey: 'work_id', as: 'likes' });
Post.hasMany(Like, { foreignKey: 'post_id', as: 'likes' });
Comment.hasMany(Like, { foreignKey: 'comment_id', as: 'likes' });

Follow.belongsTo(User, { foreignKey: 'follower_id', as: 'follower' });
Follow.belongsTo(User, { foreignKey: 'following_id', as: 'following' });
User.hasMany(Follow, { foreignKey: 'follower_id', as: 'following_list' });
User.hasMany(Follow, { foreignKey: 'following_id', as: 'follower_list' });

// M10: 自引用关联加 onDelete:'SET NULL'，父评论删除时子评论 parent_id 置空（保留子评论）
// 注意：SQLite 需开启外键支持（PRAGMA foreign_keys=ON），由 database.js 配置

// ==================== 开发者平台 / OAuth2 ====================
const DeveloperApp = sequelize.define('DeveloperApp', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    owner_user_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    homepage_url: { type: DataTypes.STRING(500), allowNull: true },
    logo_url: { type: DataTypes.STRING(500), allowNull: true },
    client_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    client_secret_hash: { type: DataTypes.STRING(255), allowNull: false },
    redirect_uris: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    scopes_requested: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    status: { type: DataTypes.ENUM('pending', 'active', 'rejected', 'suspended'), allowNull: false, defaultValue: 'pending' },
    review_note: { type: DataTypes.TEXT, allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    rate_limit_per_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 }
}, Object.assign({
    tableName: 'developer_apps',
    indexes: [
        { fields: ['owner_user_id'] },
        { fields: ['client_id'], unique: true },
        { fields: ['status'] }
    ]
}, TIMESTAMP_OPTS));


const DeveloperAppAuditLog = sequelize.define('DeveloperAppAuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    app_id: { type: DataTypes.INTEGER, allowNull: false },
    actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(50), allowNull: false },
    from_status: { type: DataTypes.STRING(20), allowNull: true },
    to_status: { type: DataTypes.STRING(20), allowNull: true },
    review_note: { type: DataTypes.TEXT, allowNull: true },
    rate_limit_before: { type: DataTypes.INTEGER, allowNull: true },
    rate_limit_after: { type: DataTypes.INTEGER, allowNull: true },
    meta: { type: DataTypes.TEXT, allowNull: true }
}, Object.assign({
    tableName: 'developer_app_audit_logs',
    indexes: [
        { fields: ['app_id'] },
        { fields: ['created_at'] }
    ]
}, TIMESTAMP_OPTS));

const OAuthAuthCode = sequelize.define('OAuthAuthCode', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    app_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    redirect_uri: { type: DataTypes.STRING(500), allowNull: false },
    scopes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    code_challenge: { type: DataTypes.STRING(128), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({
    tableName: 'oauth_auth_codes',
    indexes: [
        { fields: ['code'], unique: true },
        { fields: ['app_id'] },
        { fields: ['user_id'] }
    ]
}, TIMESTAMP_OPTS));

const OAuthAccessToken = sequelize.define('OAuthAccessToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    app_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    scopes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({
    tableName: 'oauth_access_tokens',
    indexes: [
        { fields: ['token_hash'], unique: true },
        { fields: ['app_id'] },
        { fields: ['user_id'] }
    ]
}, TIMESTAMP_OPTS));

const OAuthRefreshToken = sequelize.define('OAuthRefreshToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    app_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    scopes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    replaced_by: { type: DataTypes.INTEGER, allowNull: true }
}, Object.assign({
    tableName: 'oauth_refresh_tokens',
    indexes: [
        { fields: ['token_hash'], unique: true },
        { fields: ['app_id'] },
        { fields: ['user_id'] }
    ]
}, TIMESTAMP_OPTS));

const UserAppAuthorization = sequelize.define('UserAppAuthorization', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    app_id: { type: DataTypes.INTEGER, allowNull: false },
    scopes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    authorized_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true }
}, Object.assign({
    tableName: 'user_app_authorizations',
    indexes: [
        { fields: ['user_id', 'app_id'] },
        { fields: ['app_id'] }
    ]
}, TIMESTAMP_OPTS));

DeveloperApp.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });
DeveloperApp.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });
User.hasMany(DeveloperApp, { foreignKey: 'owner_user_id', as: 'developer_apps' });
OAuthAuthCode.belongsTo(DeveloperApp, { foreignKey: 'app_id', as: 'app' });
OAuthAuthCode.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
OAuthAccessToken.belongsTo(DeveloperApp, { foreignKey: 'app_id', as: 'app' });
OAuthAccessToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
OAuthRefreshToken.belongsTo(DeveloperApp, { foreignKey: 'app_id', as: 'app' });
OAuthRefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserAppAuthorization.belongsTo(DeveloperApp, { foreignKey: 'app_id', as: 'app' });
UserAppAuthorization.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
DeveloperApp.hasMany(UserAppAuthorization, { foreignKey: 'app_id', as: 'authorizations' });
DeveloperApp.hasMany(DeveloperAppAuditLog, { foreignKey: 'app_id', as: 'audit_logs', onDelete: 'CASCADE' });
DeveloperAppAuditLog.belongsTo(DeveloperApp, { foreignKey: 'app_id', as: 'app' });
DeveloperAppAuditLog.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor', constraints: false });


Comment.hasMany(Comment, { foreignKey: 'parent_id', as: 'replies', onDelete: 'SET NULL' });
Comment.belongsTo(Comment, { foreignKey: 'parent_id', as: 'parent' });

module.exports = {
    sequelize,
    User, Work, Comment, Post, ForumBoard, ForumBoardSubscription, ForumBoardModerator, PostSubscription, PostDraft, PostRevision, ForumModerationLog, Studio, StudioMember, StudioWork, StudioPointLog, StudioInvite, StudioOperationLog, StudioAnnouncement, StudioTask, StudioBlacklist, StudioDiscussion, StudioForumPost, StudioForumReply,
    Report, ReportAuditLog, DeveloperApp, DeveloperAppAuditLog, OAuthAuthCode, OAuthAccessToken, OAuthRefreshToken, UserAppAuthorization, Like, Favorite, Follow, Notification, Announcement, Banner, IpBan, CaptchaStats,
    SystemConfig, OperationLog, RolePermission, Statistics, UserWarning, SensitiveWord
};
