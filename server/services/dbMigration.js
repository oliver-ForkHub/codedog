/**
 * 数据库迁移服务
 * 用于在SQLite和MySQL之间复制数据
 * 只有手动触发才会执行，系统不会自动迁移
 *
 * 可靠性约束：生产模型自动派生迁移 schema；模型清单缺失即失败；源库使用一致性快照；
 * 目标库在同一事务中清空、分批写入并逐表核数，失败时完整回滚。
 */

require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// 批量读取大小（M14：分批读取避免 OOM）
const BATCH_SIZE = 500;

// 父表在前、关联/审计/token 表在后。写入按此顺序，清空时反向执行。
// 该清单同时用于覆盖检查；models/index.js 新增模型后未加入这里会直接拒绝迁移。
const MODEL_ORDER = [
    'User', 'Work', 'ForumBoard', 'Post', 'ForumBoardSubscription', 'ForumBoardModerator', 'PostSubscription', 'PostDraft',
    'PostRevision', 'ForumModerationLog',
    'Comment', 'Notification', 'SystemConfig', 'Banner',
    'Announcement', 'IpBan', 'Report', 'Studio', 'StudioMember', 'StudioWork',
    'StudioPointLog', 'ReportAuditLog', 'Like', 'Favorite', 'Follow', 'CaptchaStats',
    'OperationLog', 'RolePermission', 'Statistics', 'SensitiveWord', 'DeveloperApp',
    'DeveloperAppAuditLog', 'OAuthAuthCode', 'OAuthAccessToken', 'OAuthRefreshToken',
    'UserAppAuthorization'
];

class DatabaseMigration {
    constructor() {
        this.sourceDb = null;
        this.targetDb = null;
        this.sourceType = null;
        this.targetType = null;
        this.models = require('../models');
    }

    getCanonicalModelEntries() {
        const entries = Object.entries(this.models)
            .filter(([, model]) => model && model.rawAttributes && typeof model.getTableName === 'function');
        const byName = new Map(entries.map(([name, model]) => [name, model]));
        const missingFromOrder = entries.map(([name]) => name).filter(name => !MODEL_ORDER.includes(name));
        const missingFromModels = MODEL_ORDER.filter(name => !byName.has(name));
        if (missingFromOrder.length || missingFromModels.length) {
            throw new Error(`迁移模型清单不一致: 未编排=${missingFromOrder.join(',') || '无'}, 不存在=${missingFromModels.join(',') || '无'}`);
        }
        return MODEL_ORDER.map(name => [name, byName.get(name)]);
    }

    /**
     * 从生产模型动态复制字段定义，避免维护第二套易漂移的迁移 schema。
     * 只复制定义模型所需的公开属性，连接和关联由目标 Sequelize 实例自行管理。
     */
    getCanonicalModels(sequelize) {
        const result = {};
        const entries = this.getCanonicalModelEntries();
        for (const [name, sourceModel] of entries) {
            const attributes = {};
            for (const [attributeName, attribute] of Object.entries(sourceModel.rawAttributes)) {
                const cloned = { type: attribute.type };
                for (const key of [
                    'allowNull', 'defaultValue', 'primaryKey', 'autoIncrement', 'unique',
                    'field', 'get', 'set', 'validate', 'references', 'onUpdate', 'onDelete'
                ]) {
                    if (attribute[key] !== undefined) cloned[key] = attribute[key];
                }
                attributes[attributeName] = cloned;
            }
            result[name] = sequelize.define(name, attributes, {
                tableName: sourceModel.getTableName(),
                timestamps: sourceModel.options.timestamps,
                underscored: sourceModel.options.underscored,
                paranoid: sourceModel.options.paranoid,
                createdAt: sourceModel.options.createdAt,
                updatedAt: sourceModel.options.updatedAt,
                deletedAt: sourceModel.options.deletedAt,
                indexes: (sourceModel.options.indexes || []).map(index => ({ ...index }))
            });
        }

        // 复制 belongsTo 关联即可恢复建表所需的外键；hasMany/hasOne 不重复定义约束。
        const sourceNameByModel = new Map(entries.map(([name, model]) => [model, name]));
        for (const [name, sourceModel] of entries) {
            for (const association of Object.values(sourceModel.associations || {})) {
                if (association.associationType !== 'BelongsTo') continue;
                const targetName = sourceNameByModel.get(association.target);
                if (!targetName) continue;
                result[name].belongsTo(result[targetName], {
                    as: association.as,
                    foreignKey: association.foreignKey,
                    targetKey: association.targetKey,
                    constraints: association.options?.constraints !== false
                });
            }
        }
        return result;
    }

    /**
     * 获取数据库连接
     * M26: MySQL 分支添加 utf8mb4 字符集，支持 emoji 等 4 字节字符
     */
    async getConnection(dbType, config) {
        // 修复: 显式处理 null,ES6 默认参数对 null 不生效
        config = config || {};
        if (dbType === 'mysql') {
            const sequelize = new Sequelize(
                config.database || process.env.DB_NAME,
                config.user || process.env.DB_USER,
                config.password || process.env.DB_PASSWORD,
                {
                    host: config.host || process.env.DB_HOST,
                    port: config.port || process.env.DB_PORT || 3306,
                    dialect: 'mysql',
                    logging: false,
                    // M26: utf8mb4 支持完整 Unicode（含 emoji），collate 用 unicode_ci 支持不区分大小写比较
                    charset: 'utf8mb4',
                    collate: 'utf8mb4_unicode_ci',
                    define: {
                        charset: 'utf8mb4',
                        collate: 'utf8mb4_unicode_ci'
                    }
                }
            );
            await sequelize.authenticate();
            return { type: 'mysql', connection: sequelize };
        } else {
            const dbPath = config.path || path.join(__dirname, '../migration_temp.sqlite');
            const sequelize = new Sequelize({
                dialect: 'sqlite',
                storage: dbPath,
                logging: false
            });
            await sequelize.authenticate();
            return { type: 'sqlite', connection: sequelize };
        }
    }

    /**
     * 获取SQL模型
     * H3/H4: 补齐所有 indexes、validate、get/set，与 models/index.js 保持一致
     * 迁移模型用 STRING(20)+validate 替代 ENUM，避免源库旧数据被 ENUM 拒绝
     */
    getSqlModels(sequelize) {
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
            gender: { type: DataTypes.STRING(20), defaultValue: 'unknown', validate: { isIn: [['m', 'f', 'unknown']] } },
            level: { type: DataTypes.INTEGER, defaultValue: 1 },
            experience: { type: DataTypes.INTEGER, defaultValue: 0 },
            follower_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            following_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            work_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            codemao_token: DataTypes.TEXT,
            role: { type: DataTypes.STRING(20), defaultValue: 'user', validate: { isIn: [['user', 'reviewer', 'moderator', 'admin', 'superadmin']] } },
            status: { type: DataTypes.STRING(20), defaultValue: 'active', validate: { isIn: [['active', 'disabled']] } },
            is_active_dalao: { type: DataTypes.BOOLEAN, defaultValue: false },
            // 修复: 补齐与 models/index.js 一致的字段,避免迁移后生产报"列不存在"
            token_version: { type: DataTypes.INTEGER, defaultValue: 0 },
            password_changed_at: { type: DataTypes.DATE, allowNull: true }
        }, {
            tableName: 'users',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const Work = sequelize.define('Work', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            codemao_work_id: { type: DataTypes.STRING(50), unique: true },
            name: { type: DataTypes.STRING(200), allowNull: false },
            description: DataTypes.TEXT,
            preview: { type: DataTypes.STRING(500) },
            type: { type: DataTypes.STRING(50) },
            ide_type: { type: DataTypes.STRING(50), defaultValue: 'KITTEN' },
            work_url: { type: DataTypes.STRING(500) },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            codemao_author_id: { type: DataTypes.STRING(50) },
            codemao_author_name: { type: DataTypes.STRING(100) },
            view_times: { type: DataTypes.INTEGER, defaultValue: 0 },
            praise_times: { type: DataTypes.INTEGER, defaultValue: 0 },
            collection_times: { type: DataTypes.INTEGER, defaultValue: 0 },
            comment_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            is_featured: { type: DataTypes.BOOLEAN, defaultValue: false },
            status: { type: DataTypes.STRING(20), defaultValue: 'published', validate: { isIn: [['pending', 'published', 'rejected', 'hidden', 'deleted']] } }
        }, {
            tableName: 'works',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['status'] },
                { fields: ['user_id'] },
                { fields: ['created_at'] }
            ]
        });

        const Post = sequelize.define('Post', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            title: { type: DataTypes.STRING(200), allowNull: false },
            content: { type: DataTypes.TEXT, allowNull: false },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            view_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            like_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            comment_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            collection_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            is_top: { type: DataTypes.BOOLEAN, defaultValue: false },
            is_essence: { type: DataTypes.BOOLEAN, defaultValue: false },
            category: { type: DataTypes.STRING(50), defaultValue: 'discussion' },
            cover: { type: DataTypes.STRING(500) },
            status: { type: DataTypes.STRING(20), defaultValue: 'published', validate: { isIn: [['published', 'draft', 'hidden', 'deleted']] } },
            // 修复: 补齐 hidden_reason,与 models/index.js 一致,迁移时保留 AI隐藏/人工隐藏 的区分
            hidden_reason: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
            // H4: Post.tags 补 get/set，与主模型一致（返回 [] 而非 null）
            tags: {
                type: DataTypes.TEXT,
                get() {
                    const val = this.getDataValue('tags');
                    if (!val) return [];
                    try { return JSON.parse(val); } catch (e) { return []; }
                },
                set(val) {
                    this.setDataValue('tags', val ? JSON.stringify(val) : null);
                }
            }
        }, {
            tableName: 'posts',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['status'] },
                { fields: ['user_id'] },
                { fields: ['category'] }
            ]
        });

        const Comment = sequelize.define('Comment', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            content: { type: DataTypes.TEXT, allowNull: false },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            work_id: DataTypes.INTEGER,
            post_id: DataTypes.INTEGER,
            parent_id: DataTypes.INTEGER,
            reply_to_user_id: DataTypes.INTEGER,
            like_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            status: { type: DataTypes.STRING(20), defaultValue: 'active', validate: { isIn: [['active', 'hidden', 'deleted']] } }
        }, {
            tableName: 'comments',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['work_id'] },
                { fields: ['post_id'] },
                { fields: ['status'] },
                { fields: ['parent_id'] }
            ]
        });

        const Notification = sequelize.define('Notification', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            type: { type: DataTypes.STRING(50), allowNull: false },
            title: { type: DataTypes.STRING(200), allowNull: false },
            content: DataTypes.TEXT,
            related_id: DataTypes.INTEGER,
            related_type: { type: DataTypes.STRING(50) },
            sender_id: DataTypes.INTEGER,
            is_read: { type: DataTypes.BOOLEAN, defaultValue: false }
        }, {
            tableName: 'notifications',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['user_id'] },
                { fields: ['is_read'] }
            ]
        });

        const SystemConfig = sequelize.define('SystemConfig', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            config_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
            config_value: DataTypes.TEXT
        }, {
            tableName: 'system_configs',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const Banner = sequelize.define('Banner', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            title: { type: DataTypes.STRING(200), allowNull: false },
            image_url: { type: DataTypes.STRING(500), allowNull: false },
            link_url: { type: DataTypes.STRING(500) },
            sort: { type: DataTypes.INTEGER, defaultValue: 0 },
            is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
            // 修复: 补齐 source 字段,与 models/index.js 一致,迁移时保留轮播图来源标识
            source: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null }
        }, {
            tableName: 'banners',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const Announcement = sequelize.define('Announcement', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            title: { type: DataTypes.STRING(200), allowNull: false },
            content: { type: DataTypes.TEXT, allowNull: false },
            type: { type: DataTypes.STRING(20), defaultValue: 'notice', validate: { isIn: [['notice', 'update', 'warning']] } },
            is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
        }, {
            tableName: 'announcements',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const IpBan = sequelize.define('IpBan', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            ip: { type: DataTypes.STRING(50), allowNull: false, unique: true },
            reason: { type: DataTypes.STRING(500) },
            banned_by: DataTypes.INTEGER,
            expires_at: DataTypes.DATE
        }, {
            tableName: 'ip_bans',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['expires_at'] }
            ]
        });

        const Report = sequelize.define('Report', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            type: { type: DataTypes.STRING(20), allowNull: false },
            target_id: { type: DataTypes.INTEGER, allowNull: false },
            reporter_id: { type: DataTypes.INTEGER, allowNull: false },
            reason: { type: DataTypes.TEXT },
            description: DataTypes.TEXT,
            // 修复: 加 merged 状态 + merged_from_ids,与主模型保持一致
            status: { type: DataTypes.STRING(20), defaultValue: 'pending', validate: { isIn: [['pending', 'processing', 'resolved', 'rejected', 'merged']] } },
            handler_id: DataTypes.INTEGER,
            handle_note: DataTypes.TEXT,
            ai_result: DataTypes.TEXT,
            merged_from_ids: DataTypes.TEXT
        }, {
            tableName: 'reports',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['status'] },
                { fields: ['reporter_id'] }
            ]
        });

        const Studio = sequelize.define('Studio', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
            description: DataTypes.TEXT,
            cover: { type: DataTypes.STRING(500) },
            cover_url: { type: DataTypes.STRING(500) },
            owner_id: { type: DataTypes.INTEGER, allowNull: false },
            vice_owner_id: DataTypes.INTEGER,
            member_count: { type: DataTypes.INTEGER, defaultValue: 1 },
            work_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            total_score: { type: DataTypes.INTEGER, defaultValue: 0 },
            points: { type: DataTypes.INTEGER, defaultValue: 0 },
            level: { type: DataTypes.INTEGER, defaultValue: 1 },
            is_public: { type: DataTypes.BOOLEAN, defaultValue: true },
            join_type: { type: DataTypes.STRING(20), defaultValue: 'public' },
            status: { type: DataTypes.STRING(20), defaultValue: 'active', validate: { isIn: [['active', 'pending', 'dissolved', 'banned']] } },
            // 修复: 补 owner_claim,与主模型一致
            owner_claim: DataTypes.INTEGER
        }, {
            tableName: 'studios',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const StudioMember = sequelize.define('StudioMember', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            studio_id: { type: DataTypes.INTEGER, allowNull: false },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            role: { type: DataTypes.STRING(20), defaultValue: 'member', validate: { isIn: [['owner', 'vice_owner', 'admin', 'member']] } },
            status: { type: DataTypes.STRING(20), defaultValue: 'active', validate: { isIn: [['active', 'pending', 'rejected']] } },
            joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }, {
            tableName: 'studio_members',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { unique: true, fields: ['studio_id', 'user_id'], name: 'unique_studio_member' }
            ]
        });

        const StudioWork = sequelize.define('StudioWork', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            studio_id: { type: DataTypes.INTEGER, allowNull: false },
            work_id: { type: DataTypes.INTEGER, allowNull: false },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            score: { type: DataTypes.INTEGER, defaultValue: 0 },
            status: { type: DataTypes.STRING(20), defaultValue: 'pending', validate: { isIn: [['pending', 'approved', 'rejected', 'down']] } },
            reviewed_by: DataTypes.INTEGER,
            reviewed_at: DataTypes.DATE,
            added_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }, {
            tableName: 'studio_works',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { unique: true, fields: ['studio_id', 'work_id'], name: 'unique_studio_work' }
            ]
        });

        // H4: Like 补 validate hasTarget + indexes
        const Like = sequelize.define('Like', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            work_id: DataTypes.INTEGER,
            post_id: DataTypes.INTEGER,
            comment_id: DataTypes.INTEGER
        }, {
            tableName: 'likes',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
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
                { fields: ['work_id'] },
                { fields: ['post_id'] },
                { fields: ['comment_id'] }
            ]
        });

        // H4: Favorite 补 validate hasTarget + indexes
        const Favorite = sequelize.define('Favorite', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            work_id: DataTypes.INTEGER,
            post_id: DataTypes.INTEGER
        }, {
            tableName: 'favorites',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
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
                { fields: ['work_id'] },
                { fields: ['post_id'] }
            ]
        });

        const Follow = sequelize.define('Follow', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            follower_id: { type: DataTypes.INTEGER, allowNull: false },
            following_id: { type: DataTypes.INTEGER, allowNull: false }
        }, {
            tableName: 'follows',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { unique: true, fields: ['follower_id', 'following_id'], name: 'unique_follow_pair' },
                { fields: ['following_id'] }
            ]
        });

        const CaptchaStats = sequelize.define('CaptchaStats', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            type: { type: DataTypes.STRING(20), allowNull: false },
            scene: { type: DataTypes.STRING(50) },
            action: { type: DataTypes.STRING(20) },
            ip: { type: DataTypes.STRING(50), allowNull: false },
            user_agent: DataTypes.TEXT
        }, {
            tableName: 'captcha_stats',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['created_at'] }
            ]
        });

        const OperationLog = sequelize.define('OperationLog', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            user_id: DataTypes.INTEGER,
            action: { type: DataTypes.STRING(100), allowNull: false },
            target_type: { type: DataTypes.STRING(50) },
            target_id: DataTypes.INTEGER,
            details: DataTypes.TEXT,
            ip_address: { type: DataTypes.STRING(50) },
            user_agent: DataTypes.TEXT
        }, {
            tableName: 'operation_logs',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['user_id'] },
                { fields: ['created_at'] }
            ]
        });

        // H4: RolePermission.permissions 补 JSON get/set
        const RolePermission = sequelize.define('RolePermission', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            role: { type: DataTypes.STRING(50), allowNull: false, unique: true },
            name: { type: DataTypes.STRING(100) },
            level: { type: DataTypes.INTEGER, defaultValue: 0 },
            permissions: {
                type: DataTypes.TEXT,
                get() {
                    const v = this.getDataValue('permissions');
                    // 修复双重 JSON.parse bug：与 models/index.js 一致，getter 始终返回数组
                    if (!v) return [];
                    if (Array.isArray(v)) return v;
                    try {
                        let parsed = JSON.parse(v);
                        // 兼容旧版本 RolePermission 更新路径产生的双重 JSON 编码。
                        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.error('RolePermission(migration).permissions JSON.parse 失败，回退为空数组:', e.message);
                        return [];
                    }
                },
                set(v) {
                    this.setDataValue('permissions', JSON.stringify(Array.isArray(v) ? v : (v ? [].concat(v) : [])));
                }
            }
        }, {
            tableName: 'role_permissions',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const Statistics = sequelize.define('Statistics', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            stat_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
            stat_value: { type: DataTypes.BIGINT, defaultValue: 0 },
            stat_date: DataTypes.DATE
        }, {
            tableName: 'statistics',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        const SensitiveWord = sequelize.define('SensitiveWord', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            word: { type: DataTypes.STRING(200), allowNull: false },
            category: { type: DataTypes.STRING(50) },
            level: { type: DataTypes.INTEGER, defaultValue: 1 },
            replacement: { type: DataTypes.STRING(200) },
            status: { type: DataTypes.STRING(20), defaultValue: 'active', validate: { isIn: [['active', 'disabled']] } }
        }, {
            tableName: 'sensitive_words',
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        });

        return {
            User, Work, Post, Comment, Notification, SystemConfig,
            Banner, Announcement, IpBan, Report, Studio,
            StudioMember, StudioWork, Like, Favorite, Follow,
            CaptchaStats, OperationLog, RolePermission, Statistics, SensitiveWord
        };
    }

    /**
     * M14: 分批读取表数据，避免全表读入内存导致 OOM
     * @param {Model} model - Sequelize 模型
     * @param {Transaction} [transaction] - 可选事务
     * @returns {Promise<Array>} 全部记录（raw 格式）
     */
    async batchFindAll(model, transaction = null, attributes = null) {
        const allRows = [];
        let offset = 0;
        const primaryKey = model.primaryKeyAttribute;
        if (!primaryKey) throw new Error(`表 ${model.getTableName()} 缺少主键，无法稳定分页迁移`);
        while (true) {
            const findOpts = { limit: BATCH_SIZE, offset, raw: true, order: [[primaryKey, 'ASC']] };
            if (attributes) findOpts.attributes = attributes;
            if (transaction) findOpts.transaction = transaction;
            const rows = await model.findAll(findOpts);
            if (rows.length === 0) break;
            allRows.push(...rows);
            if (rows.length < BATCH_SIZE) break;
            offset += BATCH_SIZE;
        }
        return allRows;
    }

    /**
     * 判断源数据库和目标数据库是否指向同一个物理库
     * 防止用户把 sqlite -> sqlite 且路径相同,或 mysql 库相同,导致自迁自并清空全库
     */
    isSameDatabase(sourceType, sourceConfig, targetType, targetConfig) {
        if (sourceType !== targetType) return false;

        if (sourceType === 'sqlite') {
            const sourcePath = path.resolve(sourceConfig?.path || path.join(__dirname, '../migration_temp.sqlite'));
            const targetPath = path.resolve(targetConfig?.path || path.join(__dirname, '../migration_temp.sqlite'));
            return sourcePath === targetPath;
        }

        if (sourceType === 'mysql') {
            const sHost = sourceConfig?.host || process.env.DB_HOST || 'localhost';
            const tHost = targetConfig?.host || process.env.DB_HOST || 'localhost';
            const sPort = sourceConfig?.port || process.env.DB_PORT || 3306;
            const tPort = targetConfig?.port || process.env.DB_PORT || 3306;
            const sDb = sourceConfig?.database || process.env.DB_NAME;
            const tDb = targetConfig?.database || process.env.DB_NAME;
            return sHost === tHost && String(sPort) === String(tPort) && sDb === tDb;
        }

        return false;
    }

    /**
     * 从源数据库读取数据
     * M16: 删除多余的 sync() 调用（源库表应已存在，不应有写副作用）
     * M14: 改用分批读取
     */
    async readFromSource(sourceType, sourceConfig) {
        console.log(`📖 从 ${sourceType} 读取数据...`);
        const data = {};

        const { connection } = await this.getConnection(sourceType, sourceConfig);
        try {
            const sqlModels = this.getCanonicalModels(connection);
            // M16: 已删除 connection.sync()，源库表应已存在，避免写副作用

            // 每批固定 500 行并按主键排序，限制单次查询压力并保证分页稳定。
            const transaction = await connection.transaction({
                isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
                readOnly: true
            });
            try {
                const queryInterface = connection.getQueryInterface();
                const existingTables = new Set((await queryInterface.showAllTables()).map(String));
                for (const name of MODEL_ORDER) {
                    const model = sqlModels[name];
                    const tableName = String(model.getTableName());
                    if (!existingTables.has(tableName)) {
                        data[name] = [];
                        continue;
                    }
                    const description = await queryInterface.describeTable(tableName);
                    const readableAttributes = Object.entries(model.rawAttributes)
                        .filter(([, attribute]) => description[attribute.field])
                        .map(([attributeName]) => attributeName);
                    if (!readableAttributes.includes(model.primaryKeyAttribute)) {
                        throw new Error(`源表 ${tableName} 缺少主键 ${model.primaryKeyAttribute}`);
                    }
                    data[name] = await this.batchFindAll(model, transaction, readableAttributes);
                }
                await transaction.commit();
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } finally {
            await connection.close();
        }

        console.log(`✅ 读取完成: 用户 ${data.User.length}, 作品 ${data.Work.length}, 评论 ${data.Comment.length}`);
        return data;
    }

    /**
     * 写入数据到目标数据库
     * clearExisting 也在写事务中执行，任一失败都会恢复目标库原数据。
     *
     * @param {string} targetType - 目标数据库类型
     * @param {object} targetConfig - 目标数据库配置
     * @param {object} data - 待写入数据
     * @param {boolean} clearExisting - 是否清空目标数据库
     */
    async writeToTarget(targetType, targetConfig, data, clearExisting = false) {
        console.log(`📝 写入数据到 ${targetType}...`);

        const { connection } = await this.getConnection(targetType, targetConfig);
        try {
            const sqlModels = this.getCanonicalModels(connection);

            // 只创建缺失表，绝不在事务外 force/alter 现有表。随后逐表校验 schema；
            // 目标库结构过旧时直接中止，避免删完数据后才发现缺列。
            await connection.sync();
            const queryInterface = connection.getQueryInterface();
            for (const name of MODEL_ORDER) {
                const model = sqlModels[name];
                const description = await queryInterface.describeTable(model.getTableName());
                const missingColumns = Object.values(model.rawAttributes)
                    .map(attribute => attribute.field)
                    .filter(field => !description[field]);
                if (missingColumns.length) {
                    throw new Error(`目标表 ${model.getTableName()} 缺少字段: ${missingColumns.join(', ')}`);
                }
            }

            // M15: 用事务包裹所有写入，保证原子性（全部成功或全部回滚）
            const t = await connection.transaction();

            try {
                if (clearExisting) {
                    for (const name of [...MODEL_ORDER].reverse()) {
                        await sqlModels[name].destroy({ where: {}, force: true, transaction: t });
                    }
                }

                // 辅助函数——批量写入数据
                // Report4 #17: 必须「保留原始 id」,不能 delete r.id 后让目标库自增。
                // 关系型外键(user_id / work_id / parent_id / studio_id / comment_id 等)存的是源库的 id,
                // 若导入行获得新的自增 id,所有外键引用将全部错位断裂。
                // 修复:把源行的 id 一并写入 insert payload(bulkCreate 显式指定 id 即使用该值,
                //   SQLite/MySQL 均允许显式插入主键;SQLite 在显式插入更大 ROWID 后会自动把
                //   sqlite_sequence 推进到 max(id),后续自增不会回退冲突)。
                // 去重仍由 ignoreDuplicates 承担(SQLite → INSERT OR IGNORE,MySQL → INSERT IGNORE),
                //   按「唯一索引/主键」冲突时跳过,不会因显式 id 重复而报错。
                const bulkInsert = async (model, rows, name) => {
                    if (!rows || rows.length === 0) return;
                    const cleanedRows = rows.map(row => {
                        const r = { ...row };
                        // Report4 #17: 显式保留原始 id,保证外键引用可解析(不再 delete r.id)
                        // row 来自 raw:true 读取,id 字段一定存在;此处显式赋值便于阅读与防御性。
                        if (row.id !== undefined && row.id !== null) {
                            r.id = row.id;
                        }
                        // 中-1: readFromSource 使用 raw:true 读取，permissions/tags 这类带 setter 的
                        // JSON 字段返回的是原始 JSON 字符串（如 '["a","b"]'），bulkCreate 会再触发
                        // setter 的 JSON.stringify 一次 → 双重编码，导致权限/标签损坏丢失。
                        // 写入前把字符串预解析回数组，使 setter 仅编码一次（单层编码）。
                        // 仅 Post.tags 和 RolePermission.permissions 拥有 setter，其它表无此字段会被跳过。
                        for (const field of ['permissions', 'tags']) {
                            if (typeof r[field] === 'string') {
                                try {
                                    r[field] = JSON.parse(r[field]);
                                } catch (e) {
                                    // 解析失败兜底为空数组，与 getter 回退行为一致，避免 setter 再次 stringify 损坏
                                    r[field] = [];
                                }
                            }
                        }
                        return r;
                    });
                    // 修复: 补充 validate:true,确保模型级校验不被跳过,避免无效数据入库
                    for (let offset = 0; offset < cleanedRows.length; offset += BATCH_SIZE) {
                        await model.bulkCreate(cleanedRows.slice(offset, offset + BATCH_SIZE), {
                            ignoreDuplicates: false,
                            validate: true,
                            transaction: t
                        });
                    }
                    console.log(`  ${name}: ${cleanedRows.length} 条`);
                };

                for (const name of MODEL_ORDER) {
                    await bulkInsert(sqlModels[name], data[name], sqlModels[name].getTableName());
                }

                // 在提交前逐表核对目标行数。任何静默丢行都会触发整体回滚。
                const verifiedStats = {};
                for (const name of MODEL_ORDER) {
                    const sourceCount = data[name]?.length || 0;
                    const targetCount = await sqlModels[name].count({ transaction: t });
                    if (targetCount !== sourceCount) {
                        throw new Error(`迁移校验失败: ${sqlModels[name].getTableName()} 源=${sourceCount}, 目标=${targetCount}`);
                    }
                    verifiedStats[name.charAt(0).toLowerCase() + name.slice(1)] = targetCount;
                }
                if (targetType === 'sqlite') {
                    const foreignKeyErrors = await connection.query('PRAGMA foreign_key_check', {
                        type: Sequelize.QueryTypes.SELECT,
                        transaction: t
                    });
                    if (foreignKeyErrors.length) {
                        throw new Error(`迁移外键校验失败: ${JSON.stringify(foreignKeyErrors.slice(0, 10))}`);
                    }
                }

                await t.commit();
                return verifiedStats;
            } catch (err) {
                await t.rollback();
                throw err;
            }
        } finally {
            await connection.close();
        }

        console.log(`✅ 写入完成!`);
    }

    /**
     * 执行数据库迁移
     * @param {string} sourceType - 源数据库类型 (sqlite/mysql)
     * @param {object} sourceConfig - 源数据库配置
     * @param {string} targetType - 目标数据库类型 (sqlite/mysql)
     * @param {object} targetConfig - 目标数据库配置
     * @param {boolean} clearExisting - 是否清空目标数据库
     */
    /**
     * 执行数据库迁移
     * 修复: 只允许迁移到空目标库,防止外键错链污染数据
     */
    async migrate(sourceType, sourceConfig, targetType, targetConfig, clearExisting = false) {
        console.log(`\n🚀 开始数据库迁移: ${sourceType} -> ${targetType}`);
        console.log('=====================================');

        // 源库和目标库不能是同一个物理库,否则会先读后写覆盖自身,造成数据丢失
        if (this.isSameDatabase(sourceType, sourceConfig, targetType, targetConfig)) {
            const msg = '源数据库和目标数据库不能是同一个物理库,请检查迁移配置';
            console.error(`❌ ${msg}`);
            return { success: false, message: msg };
        }

        // 修复: 非 clearExisting 时,检查目标库是否为空,防止外键错链污染数据
        if (!clearExisting) {
            const { connection } = await this.getConnection(targetType, targetConfig);
            try {
                const sqlModels = this.getCanonicalModels(connection);
                const existingTables = new Set((await connection.getQueryInterface().showAllTables()).map(String));
                for (const name of MODEL_ORDER) {
                    if (!existingTables.has(String(sqlModels[name].getTableName()))) continue;
                    const count = await sqlModels[name].count();
                    if (count > 0) {
                        const msg = `目标库 ${name} 表已有 ${count} 条数据,迁移只允许到空目标库(clearExisting=true),防止外键错链`;
                        console.error(`❌ ${msg}`);
                        return { success: false, message: msg };
                    }
                }
            } finally {
                await connection.close();
            }
        }

        try {
            const data = await this.readFromSource(sourceType, sourceConfig);

            const verifiedStats = await this.writeToTarget(targetType, targetConfig, data, clearExisting);

            console.log('=====================================');
            console.log('🎉 数据库迁移完成!');

            return {
                success: true,
                message: '数据库迁移成功',
                stats: verifiedStats
            };
        } catch (error) {
            console.error('❌ 数据库迁移失败:', error);
            return {
                success: false,
                message: `数据库迁移失败: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * 获取数据库统计信息
     */
    async getStats(dbType, config) {
        try {
            const data = await this.readFromSource(dbType, config);
            return {
                success: true,
                stats: Object.fromEntries(MODEL_ORDER.map(name => [
                    name.charAt(0).toLowerCase() + name.slice(1),
                    data[name].length
                ]))
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = new DatabaseMigration();
