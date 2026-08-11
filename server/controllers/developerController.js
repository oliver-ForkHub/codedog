/**
 * Developer platform + OAuth2 controller
 */
const { Op } = require('sequelize');
const {
    User, Work, Comment, Post, DeveloperApp, DeveloperAppAuditLog, OAuthAuthCode, OAuthAccessToken,
    OAuthRefreshToken, UserAppAuthorization, sequelize,
    StudioMember, Studio, StudioWork, Follow, Favorite, Like, Notification, OperationLog
} = require('../models');
const DbAdapter = require('../utils/dbAdapter');
const { successResponse, errorResponse, paginateResponse } = require('../middleware/response');
const { logOperation } = require('../middleware/operationLog');
const oauth = require('../utils/oauth');
const { getDeveloperApiLogger } = require('../services/developerApiLogger');
const { DEFAULT_RATE_LIMIT_PER_MIN } = require('../middleware/developerOpenApi');
const { hasPermission } = require('../config/permissions');
const commentController = require('./commentController');
const postController = require('./postController');
const workController = require('./workController');
const adminController = require('./adminController');
const { createNotification } = require('./notificationController');
const fs = require('fs');
const crypto = require('crypto');
const { uploadToImageHost } = require('../services/imageHost');
const { normalizeHttpUrl } = require('../utils/urlSafety');

function validateDeveloperUrl(value, label) {
    const result = normalizeHttpUrl(value, { allowEmpty: true, maxLength: 500 });
    return result.ok ? result : { ...result, msg: `${label}${result.msg}` };
}

function getOwnerId(req) {
    return DbAdapter.getId(req.user);
}

function serializeApp(app, extra = {}) {
    return Object.assign(oauth.publicAppView(app), extra);
}

async function listMyApps(req, res) {
    try {
        const apps = await DbAdapter.findAll(DeveloperApp, {
            where: { owner_user_id: getOwnerId(req) },
            order: [['created_at', 'DESC']]
        });
        return successResponse(res, apps.map(a => serializeApp(a)));
    } catch (e) {
        console.error('listMyApps', e);
        return errorResponse(res, '获取应用列表失败', 500);
    }
}

async function getMyApp(req, res) {
    try {
        const app = await DbAdapter.findOne(DeveloperApp, {
            where: { id: req.params.id, owner_user_id: getOwnerId(req) }
        });
        if (!app) return errorResponse(res, '应用不存在', 404);
        return successResponse(res, serializeApp(app));
    } catch (e) {
        console.error('getMyApp', e);
        return errorResponse(res, '获取应用失败', 500);
    }
}

async function createApp(req, res) {
    try {
        const { name, description, homepage_url, logo_url, redirect_uris, scopes } = req.body || {};
        const trimmedName = name != null ? String(name).trim() : '';
        if (!trimmedName) return errorResponse(res, '应用名称不能为空', 400);
        if (trimmedName.length > 100) return errorResponse(res, '应用名称不能超过100字', 400);

        let scopeList = oauth.normalizeScopes(scopes);
        if (scopeList.length === 0) scopeList = [...oauth.DEFAULT_SCOPES];
        const hasUserScopes = scopeList.some(key => !oauth.APPLICATION_SCOPES.includes(key));
        const uris = hasUserScopes || (Array.isArray(redirect_uris) && redirect_uris.length)
            ? oauth.normalizeRedirectUris(redirect_uris)
            : { ok: true, list: [] };
        if (!uris.ok) return errorResponse(res, uris.msg, 400);
        const homepageResult = validateDeveloperUrl(homepage_url, '主页');
        if (!homepageResult.ok) return errorResponse(res, homepageResult.msg, 400);
        const logoResult = validateDeveloperUrl(logo_url, 'Logo');
        if (!logoResult.ok) return errorResponse(res, logoResult.msg, 400);

        const clientId = oauth.randomToken('app_', 16);
        const clientSecret = oauth.randomToken('sk_', 24);
        const clientSecretHash = await oauth.hashSecret(clientSecret);

        const app = await DbAdapter.create(DeveloperApp, {
            owner_user_id: getOwnerId(req),
            name: trimmedName,
            description: description != null ? String(description).trim() : null,
            homepage_url: homepageResult.value,
            logo_url: logoResult.value,
            client_id: clientId,
            client_secret_hash: clientSecretHash,
            redirect_uris: oauth.stringifyJsonField(uris.list),
            scopes_requested: oauth.stringifyJsonField(scopeList),
            status: 'pending',
            rate_limit_per_min: 60
        });

        logOperation(req, 'create_developer_app', 'developer_app', DbAdapter.getId(app), { name: trimmedName });
        return successResponse(res, serializeApp(app, {
            client_secret: clientSecret,
            client_secret_notice: '请立即保存 client_secret，关闭后无法再次查看明文'
        }), '创建成功，等待审核');
    } catch (e) {
        console.error('createApp', e);
        return errorResponse(res, '创建应用失败', 500);
    }
}

async function updateApp(req, res) {
    try {
        const app = await DbAdapter.findOne(DeveloperApp, {
            where: { id: req.params.id, owner_user_id: getOwnerId(req) }
        });
        if (!app) return errorResponse(res, '应用不存在', 404);
        if (app.status === 'suspended') return errorResponse(res, '应用已被停用，无法修改', 400);

        const { name, description, homepage_url, logo_url, redirect_uris, scopes } = req.body || {};
        const updateData = {};
        let sensitiveChanged = false;
        let userAuthorizationChanged = false;
        let applicationAuthorizationChanged = false;
        let nextScopeList = null;
        let addedScopes = [];
        let addedUserScopes = [];

        if (name !== undefined) {
            const n = String(name).trim();
            if (!n) return errorResponse(res, '应用名称不能为空', 400);
            if (n.length > 100) return errorResponse(res, '应用名称不能超过100字', 400);
            updateData.name = n;
        }
        if (description !== undefined) updateData.description = description == null ? null : String(description).trim();
        if (homepage_url !== undefined) {
            const result = validateDeveloperUrl(homepage_url, '主页');
            if (!result.ok) return errorResponse(res, result.msg, 400);
            updateData.homepage_url = result.value;
        }
        if (logo_url !== undefined) {
            const result = validateDeveloperUrl(logo_url, 'Logo');
            if (!result.ok) return errorResponse(res, result.msg, 400);
            updateData.logo_url = result.value;
        }

        if (redirect_uris !== undefined) {
            const effectiveScopes = scopes !== undefined
                ? oauth.normalizeScopes(scopes)
                : oauth.parseJsonField(app.scopes_requested, []);
            const hasUserScopes = effectiveScopes.some(key => !oauth.APPLICATION_SCOPES.includes(key));
            const uris = hasUserScopes || (Array.isArray(redirect_uris) && redirect_uris.length)
                ? oauth.normalizeRedirectUris(redirect_uris)
                : { ok: true, list: [] };
            if (!uris.ok) return errorResponse(res, uris.msg, 400);
            const previousUris = oauth.parseJsonField(app.redirect_uris, []);
            if (JSON.stringify(previousUris) !== JSON.stringify(uris.list)) {
                updateData.redirect_uris = oauth.stringifyJsonField(uris.list);
                sensitiveChanged = true;
                userAuthorizationChanged = true;
            }
        }
        if (scopes !== undefined) {
            let scopeList = oauth.normalizeScopes(scopes);
            if (scopeList.length === 0) return errorResponse(res, '至少选择一个权限范围', 400);
            nextScopeList = scopeList;
            const previousScopes = oauth.parseJsonField(app.scopes_requested, []);
            addedScopes = scopeList.filter(key => !previousScopes.includes(key));
            addedUserScopes = addedScopes.filter(key => !oauth.APPLICATION_SCOPES.includes(key));
            const previousUserScopes = previousScopes.filter(key => !oauth.APPLICATION_SCOPES.includes(key)).sort();
            const nextUserScopes = scopeList.filter(key => !oauth.APPLICATION_SCOPES.includes(key)).sort();
            const previousApplicationScopes = previousScopes.filter(key => oauth.APPLICATION_SCOPES.includes(key)).sort();
            const nextApplicationScopes = scopeList.filter(key => oauth.APPLICATION_SCOPES.includes(key)).sort();
            const userScopesChanged = JSON.stringify(previousUserScopes) !== JSON.stringify(nextUserScopes);
            userAuthorizationChanged = userAuthorizationChanged || userScopesChanged;
            applicationAuthorizationChanged = JSON.stringify(previousApplicationScopes) !== JSON.stringify(nextApplicationScopes);
            if (userAuthorizationChanged || applicationAuthorizationChanged) {
                updateData.scopes_requested = oauth.stringifyJsonField(scopeList);
                sensitiveChanged = true;
            }
        }

        if (sensitiveChanged && (app.status === 'active' || app.status === 'rejected')) {
            updateData.status = 'pending';
            updateData.review_note = null;
            updateData.reviewed_by = null;
            updateData.reviewed_at = null;
        }

        await sequelize.transaction(async (t) => {
            await DbAdapter.update(DeveloperApp, updateData, { where: { id: app.id }, transaction: t });

            if (userAuthorizationChanged) {
                const now = new Date();
                // 回调地址或权限发生变化后，旧授权码/令牌不能在重新审核通过后恢复使用。
                await DbAdapter.destroy(OAuthAuthCode, { where: { app_id: app.id }, transaction: t });
                await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, {
                    where: { app_id: app.id, revoked_at: null }, transaction: t
                });
                await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, {
                    where: { app_id: app.id, revoked_at: null }, transaction: t
                });

                // 应用缩减权限时，同步收缩用户历史授权，避免后续授权合并时恢复已删除 scope。
                if (nextScopeList) {
                    const authorizations = await DbAdapter.findAll(UserAppAuthorization, {
                        where: { app_id: app.id, revoked_at: null }, transaction: t
                    });
                    for (const authorization of authorizations) {
                        const narrowed = oauth.intersectScopes(
                            oauth.parseJsonField(authorization.scopes, []),
                            nextScopeList
                        ).filter(key => !oauth.APPLICATION_SCOPES.includes(key));
                        const authorizationId = DbAdapter.getId(authorization);
                        if (narrowed.length === 0) {
                            await DbAdapter.update(UserAppAuthorization, { revoked_at: now }, {
                                where: { id: authorizationId }, transaction: t
                            });
                        } else {
                            await DbAdapter.update(UserAppAuthorization, {
                                scopes: oauth.stringifyJsonField(narrowed)
                            }, { where: { id: authorizationId }, transaction: t });
                        }
                    }
                }
            } else if (applicationAuthorizationChanged) {
                // 应用级 Scope 变化只撤销应用令牌，不影响已经由用户同意的用户令牌。
                const activeTokens = await DbAdapter.findAll(OAuthAccessToken, {
                    where: { app_id: app.id, revoked_at: null }, transaction: t
                });
                const applicationTokenIds = activeTokens
                    .filter(token => oauth.parseJsonField(token.scopes, []).includes(oauth.APPLICATION_TOKEN_MARKER))
                    .map(token => DbAdapter.getId(token));
                if (applicationTokenIds.length) {
                    await DbAdapter.update(OAuthAccessToken, { revoked_at: new Date() }, {
                        where: { id: { [Op.in]: applicationTokenIds } }, transaction: t
                    });
                }
            }
        });
        const updated = await DbAdapter.findByPk(DeveloperApp, app.id);
        logOperation(req, 'update_developer_app', 'developer_app', app.id, updateData);
        return successResponse(res, serializeApp(updated, {
            added_scopes: addedScopes,
            user_reauthorization_required: addedUserScopes.length > 0
        }), addedUserScopes.length
            ? '已提交新增权限审核；审核通过后，用户必须重新授权才会获得新权限'
            : (addedScopes.length ? '已提交应用级权限审核；公开数据权限不需要用户授权' : (sensitiveChanged ? '已保存，敏感变更需重新审核' : '保存成功')));
    } catch (e) {
        console.error('updateApp', e);
        return errorResponse(res, '更新应用失败', 500);
    }
}

async function rotateSecret(req, res) {
    try {
        const app = await DbAdapter.findOne(DeveloperApp, {
            where: { id: req.params.id, owner_user_id: getOwnerId(req) }
        });
        if (!app) return errorResponse(res, '应用不存在', 404);
        if (app.status !== 'active') return errorResponse(res, '仅已通过审核的应用可重置密钥', 400);

        const clientSecret = oauth.randomToken('sk_', 24);
        const clientSecretHash = await oauth.hashSecret(clientSecret);
        await DbAdapter.update(DeveloperApp, { client_secret_hash: clientSecretHash }, { where: { id: app.id } });

        // revoke existing tokens for safety
        const now = new Date();
        await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
        await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });

        logOperation(req, 'rotate_developer_app_secret', 'developer_app', app.id, {});
        return successResponse(res, {
            client_id: app.client_id,
            client_secret: clientSecret,
            client_secret_notice: '请立即保存 client_secret，关闭后无法再次查看明文'
        }, '密钥已重置，旧 token 已失效');
    } catch (e) {
        console.error('rotateSecret', e);
        return errorResponse(res, '重置密钥失败', 500);
    }
}

async function getScopeDocs(req, res) {
    return successResponse(res, {
        scopes: oauth.scopeCatalog(),
        token: {
            access_token_ttl: '2h',
            refresh_token_ttl: '30d',
            auth_code_ttl: '10m'
        },
        endpoints: {
            authorize: '/oauth/authorize',
            token: '/api/oauth/token',
            revoke: '/api/oauth/revoke',
            userinfo: '/api/oauth/userinfo',
            open_api_base: '/api/open/v1'
        }
    });
}

// -------- Admin --------
async function adminListApps(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = {};
        if (req.query.status) where.status = req.query.status;
        if (req.query.keyword) {
            where.name = { [Op.like]: `%${String(req.query.keyword).trim()}%` };
        }
        const { count, rows } = await DbAdapter.findAndCountAll(DeveloperApp, {
            where,
            include: [
                { model: User, as: 'owner', attributes: ['id', 'username', 'nickname', 'avatar'] },
                { model: User, as: 'reviewer', attributes: ['id', 'username', 'nickname'], required: false }
            ],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        const list = rows.map(r => {
            const json = r.toJSON ? r.toJSON() : r;
            return {
                ...serializeApp(json),
                owner: json.owner || null,
                reviewer: json.reviewer || null,
                reviewed_by: json.reviewed_by,
                owner_user_id: json.owner_user_id
            };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error('adminListApps', e);
        return errorResponse(res, '获取开发者应用失败', 500);
    }
}

async function adminGetApp(req, res) {
    try {
        const app = await DeveloperApp.findByPk(req.params.id, {
            include: [
                { model: User, as: 'owner', attributes: ['id', 'username', 'nickname', 'avatar'] },
                { model: User, as: 'reviewer', attributes: ['id', 'username', 'nickname'], required: false }
            ]
        });
        if (!app) return errorResponse(res, '应用不存在', 404);
        const appId = DbAdapter.getId(app);
        const now = new Date();
        const [authorizationCount, activeAuthorizationCount, accessTokenCount, activeAccessTokenCount, callCount, auditCount] = await Promise.all([
            DbAdapter.count(UserAppAuthorization, { where: { app_id: appId } }),
            DbAdapter.count(UserAppAuthorization, { where: { app_id: appId, revoked_at: null } }),
            DbAdapter.count(OAuthAccessToken, { where: { app_id: appId } }),
            DbAdapter.count(OAuthAccessToken, { where: { app_id: appId, revoked_at: null, expires_at: { [Op.gt]: now } } }),
            DbAdapter.count(OperationLog, { where: { action: 'developer_api_call', target_type: 'developer_app', target_id: appId } }),
            DbAdapter.count(DeveloperAppAuditLog, { where: { app_id: appId } })
        ]);
        const json = app.toJSON();
        return successResponse(res, {
            ...serializeApp(json),
            owner: json.owner || null,
            reviewer: json.reviewer || null,
            reviewed_by: json.reviewed_by,
            owner_user_id: json.owner_user_id,
            stats: { authorizationCount, activeAuthorizationCount, accessTokenCount, activeAccessTokenCount, callCount, auditCount }
        });
    } catch (e) {
        console.error('adminGetApp', e);
        return errorResponse(res, '获取开发者应用详情失败', 500);
    }
}

async function uploadAppLogo(req, res) {
    try {
        const app = await DbAdapter.findOne(DeveloperApp, { where: { id: req.params.id, owner_user_id: getOwnerId(req) } });
        if (!app || !req.file) return errorResponse(res, '应用或图标不存在', 404);
        const logoUrl = await uploadToImageHost(req.file);
        await DbAdapter.update(DeveloperApp, { logo_url: logoUrl }, { where: { id: app.id } });
        return successResponse(res, { logo_url: logoUrl }, '图标上传成功');
    } catch (e) { console.error('uploadAppLogo', e); return errorResponse(res, '上传应用图标失败', 500); }
    finally { if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {}); }
}

async function listMyAppCalls(req, res) {
    try {
        const app = await DbAdapter.findOne(DeveloperApp, { where: { id: req.params.id, owner_user_id: getOwnerId(req) } });
        if (!app) return errorResponse(res, '应用不存在', 404);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(OperationLog, {
            where: { action: { [Op.in]: ['developer_api_call', 'developer_api_fail'] }, target_type: 'developer_app', target_id: DbAdapter.getId(app) },
            order: [['created_at', 'DESC']], limit: pageSize, offset
        });
        const list = rows.map(row => {
            const json = row.toJSON ? row.toJSON() : row;
            let details = {}; try { details = json.details ? JSON.parse(json.details) : {}; } catch (_) {}
            return { id: json.id, action: json.action, ...details, ip_address: json.ip_address, user_agent: json.user_agent, created_at: json.created_at };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) { console.error('listMyAppCalls', e); return errorResponse(res, '获取调用记录失败', 500); }
}

async function adminListAppCalls(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(OperationLog, {
            where: { action: { [Op.in]: ['developer_api_call', 'developer_api_fail'] }, target_type: 'developer_app', target_id: DbAdapter.getId(app) },
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        const list = rows.map(row => {
            const json = row.toJSON ? row.toJSON() : row;
            let details = {};
            try { details = json.details ? JSON.parse(json.details) : {}; } catch (_) { details = {}; }
            return { id: json.id, ...details, ip_address: json.ip_address, user_agent: json.user_agent, created_at: json.created_at };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error('adminListAppCalls', e);
        return errorResponse(res, '获取应用调用记录失败', 500);
    }
}

async function adminReviewApp(req, res) {
    try {
        const { action, note } = req.body || {};
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);

        const map = {
            approve: 'active',
            reject: 'rejected',
            suspend: 'suspended'
        };
        if (!map[action]) return errorResponse(res, '无效的审核操作', 400);
        const cleanNote = note != null ? String(note).trim() : '';
        if (action === 'reject' && cleanNote.length < 5) return errorResponse(res, '拒绝审核必须填写至少5字的整改建议', 400);

        await DbAdapter.update(DeveloperApp, {
            status: map[action],
            review_note: cleanNote || app.review_note,
            reviewed_by: getOwnerId(req),
            reviewed_at: new Date()
        }, { where: { id: app.id } });

        if (action === 'suspend' || action === 'reject') {
            const now = new Date();
            await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
            await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
        }

        logOperation(req, 'review_developer_app', 'developer_app', app.id, { action, note });
        await recordAppAudit(app.id, getOwnerId(req), { action: 'review_' + action, fromStatus: app.status, toStatus: map[action], reviewNote: note != null ? String(note).trim() : null });
        // 每一种审核结果都必须通知应用所有者，不能只有拒绝才发消息。
        const reviewNotification = {
            approve: {
                title: '开发者应用审核通过',
                content: `应用「${app.name}」已通过审核，现在可以在开发者平台中使用。`
            },
            reject: {
                title: '开发者应用审核未通过',
                content: `应用「${app.name}」未通过审核。整改建议：${cleanNote}`
            },
            suspend: {
                title: '开发者应用已停用',
                content: `应用「${app.name}」已被停用。${cleanNote ? `说明：${cleanNote}` : '如有疑问，请联系管理员。'}`
            }
        }[action];
        await createNotification({
            user_id: app.owner_user_id,
            type: 'developer_app_review',
            title: reviewNotification.title,
            content: reviewNotification.content,
            related_id: app.id,
            related_type: 'developer_app',
            sender_id: getOwnerId(req),
            meta: JSON.stringify({ action, app_id: app.id })
        });
        const updated = await DbAdapter.findByPk(DeveloperApp, app.id);
        return successResponse(res, serializeApp(updated), '审核完成');
    } catch (e) {
        console.error('adminReviewApp', e);
        return errorResponse(res, '审核失败', 500);
    }
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function recordAppAudit(appId, actorUserId, fields) {
  try {
    await DeveloperAppAuditLog.create({
      app_id: appId,
      actor_user_id: actorUserId || null,
      action: fields.action,
      from_status: fields.fromStatus || null,
      to_status: fields.toStatus || null,
      review_note: fields.reviewNote || null,
      rate_limit_before: fields.rateLimitBefore ?? null,
      rate_limit_after: fields.rateLimitAfter ?? null,
      meta: fields.meta ? JSON.stringify(fields.meta) : null
    });
  } catch (err) {
    console.error('[DeveloperController] audit log write failed:', err.message);
  }
}

async function adminUpdateAppRateLimit(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        if (!req.body || req.body.rate_limit_per_min === undefined) return errorResponse(res, '缺少 rate_limit_per_min', 400);
        const newLimit = clampInt(req.body.rate_limit_per_min, 1, 10000, app.rate_limit_per_min);
        const before = app.rate_limit_per_min;
        await DbAdapter.update(DeveloperApp, { rate_limit_per_min: newLimit }, { where: { id: app.id } });
        await recordAppAudit(app.id, getOwnerId(req), { action: 'rate_limit_change', rateLimitBefore: before, rateLimitAfter: newLimit });
        logOperation(req, 'update_developer_app_rate_limit', 'developer_app', app.id, { before, after: newLimit });
        const updated = await DbAdapter.findByPk(DeveloperApp, app.id);
        return successResponse(res, serializeApp(updated), '限流已更新');
    } catch (e) {
        console.error('adminUpdateAppRateLimit', e);
        return errorResponse(res, '更新限流失败', 500);
    }
}

async function adminRevokeAllTokens(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const now = new Date();
        const [accessCount] = await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
        const [refreshCount] = await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
        await recordAppAudit(app.id, getOwnerId(req), { action: 'revoke_all_tokens', meta: { accessCount, refreshCount } });
        logOperation(req, 'revoke_developer_app_tokens', 'developer_app', app.id, { accessCount, refreshCount });
        return successResponse(res, { accessCount, refreshCount }, '令牌已撤销');
    } catch (e) {
        console.error('adminRevokeAllTokens', e);
        return errorResponse(res, '撤销令牌失败', 500);
    }
}

async function adminRegenerateSecret(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const plainSecret = oauth.randomToken('sk_', 24);
        const clientSecretHash = await oauth.hashSecret(plainSecret);
        await DbAdapter.update(DeveloperApp, { client_secret_hash: clientSecretHash }, { where: { id: app.id } });
        const now = new Date();
        await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
        await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, { where: { app_id: app.id, revoked_at: null } });
        await recordAppAudit(app.id, getOwnerId(req), { action: 'rotate_secret' });
        logOperation(req, 'rotate_developer_app_secret_admin', 'developer_app', app.id, {});
        return successResponse(res, {
            client_id: app.client_id,
            client_secret: plainSecret,
            client_secret_notice: '请立即保存 client_secret，关闭后无法再次查看明文'
        }, '密钥已重置，旧令牌已失效');
    } catch (e) {
        console.error('adminRegenerateSecret', e);
        return errorResponse(res, '重置密钥失败', 500);
    }
}

async function adminDeleteApp(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const appId = DbAdapter.getId(app);
        await recordAppAudit(appId, getOwnerId(req), { action: 'delete_app', fromStatus: app.status });
        await OAuthAccessToken.destroy({ where: { app_id: appId } });
        await OAuthRefreshToken.destroy({ where: { app_id: appId } });
        await OAuthAuthCode.destroy({ where: { app_id: appId } });
        await UserAppAuthorization.destroy({ where: { app_id: appId } });
        await DeveloperAppAuditLog.destroy({ where: { app_id: appId } });
        await app.destroy();
        logOperation(req, 'delete_developer_app', 'developer_app', appId, {});
        return successResponse(res, null, '应用已删除');
    } catch (e) {
        console.error('adminDeleteApp', e);
        return errorResponse(res, '删除应用失败', 500);
    }
}

async function adminListAuditLogs(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const appId = DbAdapter.getId(app);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = { app_id: appId };
        if (req.query.action) where.action = String(req.query.action).trim();
        const { count, rows } = await DbAdapter.findAndCountAll(DeveloperAppAuditLog, {
            where,
            order: [['id', 'DESC']],
            limit: pageSize,
            offset,
            include: [{ model: User, as: 'actor', attributes: ['id', 'username', 'nickname'], required: false }]
        });
        const list = rows.map(row => {
            const json = row.toJSON ? row.toJSON() : row;
            let meta = null;
            try { meta = json.meta ? JSON.parse(json.meta) : null; } catch (_) { meta = null; }
            return {
                id: json.id, action: json.action,
                from_status: json.from_status, to_status: json.to_status,
                review_note: json.review_note,
                rate_limit_before: json.rate_limit_before, rate_limit_after: json.rate_limit_after,
                actor: json.actor || null, meta,
                created_at: json.created_at
            };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error('adminListAuditLogs', e);
        return errorResponse(res, '获取审核历史失败', 500);
    }
}

async function adminCallLogStats(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const appId = DbAdapter.getId(app);
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [total, fails, last30d] = await Promise.all([
            DbAdapter.count(OperationLog, { where: { action: 'developer_api_call', target_type: 'developer_app', target_id: appId } }),
            DbAdapter.count(OperationLog, { where: { action: 'developer_api_fail', target_type: 'developer_app', target_id: appId } }),
            DbAdapter.count(OperationLog, { where: { action: 'developer_api_call', target_type: 'developer_app', target_id: appId, created_at: { [Op.gte]: since30 } } })
        ]);
        return successResponse(res, { total, fails, last30d });
    } catch (e) {
        console.error('adminCallLogStats', e);
        return errorResponse(res, '获取调用统计失败', 500);
    }
}

async function adminCallLogStatsDetail(req, res) {
    try {
        const app = await DbAdapter.findByPk(DeveloperApp, req.params.id);
        if (!app) return errorResponse(res, '应用不存在', 404);
        const appId = DbAdapter.getId(app);
        const days = clampInt(req.query && req.query.days, 1, 90, 14);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await OperationLog.findAll({
            where: { action: 'developer_api_call', target_type: 'developer_app', target_id: appId, created_at: { [Op.gte]: since } },
            attributes: ['id', 'details', 'created_at'],
            order: [['created_at', 'ASC']]
        });
        const perDay = {};
        const perPath = {};
        const perStatus = {};
        for (const row of rows) {
            const day = new Date(row.created_at).toISOString().slice(0, 10);
            perDay[day] = (perDay[day] || 0) + 1;
            let path = '-';
            let status = 0;
            try {
                const meta = row.details ? JSON.parse(row.details) : {};
                path = meta.path || '-';
                status = meta.status || 0;
            } catch (_) {}
            perPath[path] = (perPath[path] || 0) + 1;
            perStatus[String(status)] = (perStatus[String(status)] || 0) + 1;
        }
        return successResponse(res, { days, perDay, perPath, perStatus });
    } catch (e) {
        console.error('adminCallLogStatsDetail', e);
        return errorResponse(res, '获取调用分布失败', 500);
    }
}

// -------- OAuth --------
async function getAuthorizeInfo(req, res) {
    try {
        const { client_id, redirect_uri, scope, state, response_type } = req.query;
        if (response_type && response_type !== 'code') {
            return errorResponse(res, '仅支持 response_type=code', 400);
        }
        if (!client_id) return errorResponse(res, '缺少 client_id', 400);
        if (!redirect_uri) return errorResponse(res, '缺少 redirect_uri', 400);

        const app = await DbAdapter.findOne(DeveloperApp, { where: { client_id: String(client_id) } });
        if (!app || app.status !== 'active') return errorResponse(res, '应用不存在或未通过审核', 400);
        if (!oauth.matchRedirectUri(app.redirect_uris, redirect_uri)) {
            return errorResponse(res, 'redirect_uri 未登记', 400);
        }

        const normalizedRequested = oauth.normalizeScopes(scope);
        const requested = normalizedRequested.filter(key => !oauth.APPLICATION_SCOPES.includes(key));
        const appUserScopes = oauth.parseJsonField(app.scopes_requested, []).filter(key => !oauth.APPLICATION_SCOPES.includes(key));
        const allowed = oauth.intersectScopes(normalizedRequested.length ? requested : appUserScopes, appUserScopes);
        if (allowed.length === 0) return errorResponse(res, '无效的 scope', 400);

        let previouslyAuthorized = [];
        if (req.user) {
            const existingAuthorization = await DbAdapter.findOne(UserAppAuthorization, {
                where: { user_id: getOwnerId(req), app_id: app.id, revoked_at: null }
            });
            previouslyAuthorized = existingAuthorization
                ? oauth.intersectScopes(oauth.parseJsonField(existingAuthorization.scopes, []), allowed)
                : [];
        }
        const newScopes = allowed.filter(key => !previouslyAuthorized.includes(key));

        return successResponse(res, {
            app: {
                id: app.id,
                name: app.name,
                description: app.description,
                logo_url: app.logo_url,
                homepage_url: app.homepage_url,
                client_id: app.client_id
            },
            scopes: allowed.map(key => ({
                key,
                ...(oauth.ALL_SCOPES[key] || { name: key, description: '' }),
                is_new: newScopes.includes(key)
            })),
            previously_authorized_scopes: previouslyAuthorized,
            new_scopes: newScopes,
            reauthorization_required: previouslyAuthorized.length > 0 && newScopes.length > 0,
            redirect_uri: String(redirect_uri),
            state: state || null
        });
    } catch (e) {
        console.error('getAuthorizeInfo', e);
        return errorResponse(res, '获取授权信息失败', 500);
    }
}

async function approveAuthorize(req, res) {
    try {
        const { client_id, redirect_uri, scope, state, approved } = req.body || {};
        if (!client_id || !redirect_uri) return errorResponse(res, '参数不完整', 400);

        const app = await DbAdapter.findOne(DeveloperApp, { where: { client_id: String(client_id) } });
        if (!app || app.status !== 'active') return errorResponse(res, '应用不存在或未通过审核', 400);
        if (!oauth.matchRedirectUri(app.redirect_uris, redirect_uri)) {
            return errorResponse(res, 'redirect_uri 未登记', 400);
        }

        if (approved === false || approved === 'false' || approved === 0) {
            const denyUrl = oauth.buildRedirectWithParams(redirect_uri, {
                error: 'access_denied',
                error_description: 'user_denied',
                state: state || undefined
            });
            return successResponse(res, { redirect_to: denyUrl }, '已拒绝');
        }

        const normalizedRequested = oauth.normalizeScopes(scope);
        const requested = normalizedRequested.filter(key => !oauth.APPLICATION_SCOPES.includes(key));
        const appUserScopes = oauth.parseJsonField(app.scopes_requested, []).filter(key => !oauth.APPLICATION_SCOPES.includes(key));
        const allowed = oauth.intersectScopes(normalizedRequested.length ? requested : appUserScopes, appUserScopes);
        if (allowed.length === 0) return errorResponse(res, '无效的 scope', 400);

        const userId = getOwnerId(req);
        const code = oauth.randomToken('ac_', 24);
        const expiresAt = new Date(Date.now() + oauth.AUTH_CODE_TTL_MS);

        await sequelize.transaction(async (t) => {
            await DbAdapter.create(OAuthAuthCode, {
                code,
                app_id: app.id,
                user_id: userId,
                redirect_uri: String(redirect_uri),
                scopes: oauth.stringifyJsonField(allowed),
                expires_at: expiresAt
            }, { transaction: t });

            const existing = await DbAdapter.findOne(UserAppAuthorization, {
                where: { user_id: userId, app_id: app.id, revoked_at: null },
                transaction: t
            });
            if (existing) {
                const merged = oauth.intersectScopes(oauth.normalizeScopes([
                    ...oauth.parseJsonField(existing.scopes, []).filter(key => !oauth.APPLICATION_SCOPES.includes(key)),
                    ...allowed
                ]), oauth.parseJsonField(app.scopes_requested, []));
                await DbAdapter.update(UserAppAuthorization, {
                    scopes: oauth.stringifyJsonField(merged),
                    authorized_at: new Date()
                }, { where: { id: existing.id }, transaction: t });
            } else {
                await DbAdapter.create(UserAppAuthorization, {
                    user_id: userId,
                    app_id: app.id,
                    scopes: oauth.stringifyJsonField(allowed),
                    authorized_at: new Date()
                }, { transaction: t });
            }
        });

        const redirectTo = oauth.buildRedirectWithParams(redirect_uri, {
            code,
            state: state || undefined
        });
        return successResponse(res, { redirect_to: redirectTo, code_expires_in: 600 });
    } catch (e) {
        console.error('approveAuthorize', e);
        return errorResponse(res, '授权失败', 500);
    }
}

function extractClientCredentials(req) {
    const header = req.headers.authorization || '';
    const basic = String(header).match(/^Basic\s+(.+)$/i);
    if (basic) {
        try {
            const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
            const idx = decoded.indexOf(':');
            if (idx >= 0) {
                return {
                    client_id: decoded.slice(0, idx),
                    client_secret: decoded.slice(idx + 1)
                };
            }
        } catch (e) { /* ignore */ }
    }
    return {
        client_id: req.body?.client_id,
        client_secret: req.body?.client_secret
    };
}

async function issueTokens(app, userId, scopes, transaction) {
    const accessToken = oauth.randomToken('atk_', 24);
    const refreshToken = oauth.randomToken('rtk_', 24);
    const now = Date.now();
    await DbAdapter.create(OAuthAccessToken, {
        token_hash: oauth.hashToken(accessToken),
        app_id: app.id,
        user_id: userId,
        scopes: oauth.stringifyJsonField(scopes),
        expires_at: new Date(now + oauth.ACCESS_TOKEN_TTL_MS)
    }, transaction ? { transaction } : {});
    await DbAdapter.create(OAuthRefreshToken, {
        token_hash: oauth.hashToken(refreshToken),
        app_id: app.id,
        user_id: userId,
        scopes: oauth.stringifyJsonField(scopes),
        expires_at: new Date(now + oauth.REFRESH_TOKEN_TTL_MS)
    }, transaction ? { transaction } : {});
    return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(oauth.ACCESS_TOKEN_TTL_MS / 1000),
        refresh_token: refreshToken,
        scope: scopes.join(' ')
    };
}

async function tokenEndpoint(req, res) {
    try {
        const grantType = req.body?.grant_type;
        const { client_id, client_secret } = extractClientCredentials(req);
        if (!client_id || !client_secret) return errorResponse(res, '缺少客户端凭证', 401, 'invalid_client');

        const app = await DbAdapter.findOne(DeveloperApp, { where: { client_id: String(client_id) } });
        if (!app || app.status !== 'active') return errorResponse(res, '客户端无效', 401, 'invalid_client');
        const secretOk = await oauth.verifySecret(client_secret, app.client_secret_hash);
        if (!secretOk) return errorResponse(res, '客户端密钥错误', 401, 'invalid_client');

        if (grantType === 'client_credentials') {
            const approvedApplicationScopes = oauth.intersectScopes(
                oauth.parseJsonField(app.scopes_requested, []),
                oauth.APPLICATION_SCOPES
            );
            const requestedScopes = oauth.normalizeScopes(req.body?.scope);
            const scopes = oauth.intersectScopes(
                requestedScopes.length ? requestedScopes : approvedApplicationScopes,
                approvedApplicationScopes
            );
            if (scopes.length === 0) {
                return errorResponse(res, '应用未获批所请求的应用级 scope', 400, 'invalid_scope');
            }
            const accessToken = oauth.randomToken('aat_', 24);
            await DbAdapter.create(OAuthAccessToken, {
                token_hash: oauth.hashToken(accessToken),
                app_id: app.id,
                // 兼容现有数据库非空约束；应用令牌通过内部 marker 与用户令牌严格区分。
                user_id: app.owner_user_id,
                scopes: oauth.stringifyJsonField([oauth.APPLICATION_TOKEN_MARKER, ...scopes]),
                expires_at: new Date(Date.now() + oauth.ACCESS_TOKEN_TTL_MS)
            });
            return successResponse(res, {
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: Math.floor(oauth.ACCESS_TOKEN_TTL_MS / 1000),
                scope: scopes.join(' ')
            }, 'ok');
        }

        if (grantType === 'authorization_code') {
            const { code, redirect_uri } = req.body || {};
            if (!code || !redirect_uri) return errorResponse(res, '缺少 code 或 redirect_uri', 400, 'invalid_request');

            const authCode = await DbAdapter.findOne(OAuthAuthCode, { where: { code: String(code) } });
            if (!authCode || authCode.app_id !== app.id) return errorResponse(res, '授权码无效', 400, 'invalid_grant');
            if (authCode.used_at) return errorResponse(res, '授权码已使用', 400, 'invalid_grant');
            if (new Date(authCode.expires_at).getTime() <= Date.now()) return errorResponse(res, '授权码已过期', 400, 'invalid_grant');
            if (authCode.redirect_uri !== String(redirect_uri)) return errorResponse(res, 'redirect_uri 不匹配', 400, 'invalid_grant');

            const activeAuthorization = await DbAdapter.findOne(UserAppAuthorization, {
                where: { user_id: authCode.user_id, app_id: app.id, revoked_at: null }
            });
            if (!activeAuthorization) {
                return errorResponse(res, '用户授权已撤销，请重新授权', 400, 'invalid_grant');
            }
            const scopes = oauth.intersectScopes(
                oauth.intersectScopes(
                    oauth.parseJsonField(authCode.scopes, []),
                    oauth.parseJsonField(app.scopes_requested, [])
                ),
                oauth.parseJsonField(activeAuthorization.scopes, [])
            );
            if (scopes.length === 0) {
                return errorResponse(res, '授权权限已失效，请重新授权', 400, 'invalid_grant');
            }
            const tokens = await sequelize.transaction(async (t) => {
                const claimed = await DbAdapter.update(OAuthAuthCode, { used_at: new Date() }, { where: { id: authCode.id, used_at: null }, transaction: t });
                const claimedCount = Array.isArray(claimed) ? claimed[0] : claimed;
                if (!claimedCount) throw Object.assign(new Error('授权码已使用'), { code: 'OAUTH_CREDENTIAL_ALREADY_USED' });
                return issueTokens(app, authCode.user_id, scopes, t);
            });
            return successResponse(res, tokens, 'ok');
        }

        if (grantType === 'refresh_token') {
            const { refresh_token } = req.body || {};
            if (!refresh_token) return errorResponse(res, '缺少 refresh_token', 400, 'invalid_request');
            const hash = oauth.hashToken(refresh_token);
            const old = await DbAdapter.findOne(OAuthRefreshToken, {
                where: {
                    token_hash: hash,
                    app_id: app.id,
                    revoked_at: null,
                    expires_at: { [Op.gt]: new Date() }
                }
            });
            if (!old) return errorResponse(res, 'refresh_token 无效', 400, 'invalid_grant');

            const activeAuthorization = await DbAdapter.findOne(UserAppAuthorization, {
                where: { user_id: old.user_id, app_id: app.id, revoked_at: null }
            });
            if (!activeAuthorization) {
                await DbAdapter.update(OAuthRefreshToken, { revoked_at: new Date() }, { where: { id: old.id } });
                return errorResponse(res, '用户授权已撤销，请重新授权', 400, 'invalid_grant');
            }
            const scopes = oauth.intersectScopes(
                oauth.intersectScopes(
                    oauth.parseJsonField(old.scopes, []),
                    oauth.parseJsonField(app.scopes_requested, [])
                ),
                oauth.parseJsonField(activeAuthorization.scopes, [])
            );
            if (scopes.length === 0) {
                await DbAdapter.update(OAuthRefreshToken, { revoked_at: new Date() }, { where: { id: old.id } });
                return errorResponse(res, '授权权限已失效，请重新授权', 400, 'invalid_grant');
            }
            const tokens = await sequelize.transaction(async (t) => {
                const claimed = await DbAdapter.update(OAuthRefreshToken, { revoked_at: new Date() }, {
                    where: { id: old.id, revoked_at: null, expires_at: { [Op.gt]: new Date() } }, transaction: t
                });
                const claimedCount = Array.isArray(claimed) ? claimed[0] : claimed;
                if (!claimedCount) throw Object.assign(new Error('refresh_token 已使用'), { code: 'OAUTH_CREDENTIAL_ALREADY_USED' });
                const issued = await issueTokens(app, old.user_id, scopes, t);
                // mark old refresh revoked; store replaced_by if we can find new one
                const newHash = oauth.hashToken(issued.refresh_token);
                const newRow = await DbAdapter.findOne(OAuthRefreshToken, { where: { token_hash: newHash }, transaction: t });
                await DbAdapter.update(OAuthRefreshToken, { replaced_by: newRow ? newRow.id : null }, { where: { id: old.id }, transaction: t });
                // optional: revoke access tokens for this app+user older ones? keep short-lived access
                return issued;
            });
            return successResponse(res, tokens, 'ok');
        }

        return errorResponse(res, '不支持的 grant_type', 400, 'unsupported_grant_type');
    } catch (e) {
        if (e.code === 'OAUTH_CREDENTIAL_ALREADY_USED') return errorResponse(res, e.message, 400, 'invalid_grant');
        console.error('tokenEndpoint', e);
        return errorResponse(res, '换取 token 失败', 500);
    }
}

async function revokeToken(req, res) {
    try {
        const token = req.body?.token || req.body?.access_token || req.body?.refresh_token;
        if (!token) return errorResponse(res, '缺少 token', 400);
        const hash = oauth.hashToken(token);
        const now = new Date();
        await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, { where: { token_hash: hash, revoked_at: null } });
        await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, { where: { token_hash: hash, revoked_at: null } });
        return successResponse(res, null, '已撤销');
    } catch (e) {
        console.error('revokeToken', e);
        return errorResponse(res, '撤销失败', 500);
    }
}

async function userinfo(req, res) {
    try {
        const user = req.oauth.user;
        const result = {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            bio: user.bio,
            level: user.level,
            follower_count: user.follower_count,
            following_count: user.following_count,
            work_count: user.work_count
        };
        const scopes = oauth.parseJsonField(req.oauth?.scopes, req.oauth?.scopes || []);
        if (Array.isArray(scopes) && scopes.includes('profile:email:read')) result.email = user.email || null;
        return successResponse(res, result);
    } catch (e) {
        return errorResponse(res, '获取用户信息失败', 500);
    }
}

// Open API
async function openMe(req, res) {
    return userinfo(req, res);
}

async function openMyWorks(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where: { user_id: req.oauth.userId, status: 'published' },
            attributes: ['id', 'codemao_work_id', 'name', 'description', 'preview', 'type', 'ide_type', 'view_times', 'praise_times', 'collection_times', 'comment_count', 'created_at'],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openMyWorks', e);
        return errorResponse(res, '获取作品失败', 500);
    }
}

async function openMyWorkDetail(req, res) {
    try {
        const work = await DbAdapter.findOne(Work, {
            where: {
                user_id: req.oauth.userId,
                status: 'published',
                [Op.or]: [
                    { id: req.params.id },
                    { codemao_work_id: String(req.params.id) }
                ]
            },
            attributes: ['id', 'codemao_work_id', 'name', 'description', 'preview', 'type', 'ide_type', 'work_url', 'view_times', 'praise_times', 'collection_times', 'comment_count', 'created_at', 'updated_at']
        });
        if (!work) return errorResponse(res, '作品不存在', 404);
        return successResponse(res, work);
    } catch (e) {
        console.error('openMyWorkDetail', e);
        return errorResponse(res, '获取作品失败', 500);
    }
}

async function openMyComments(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Comment, {
            where: { user_id: req.oauth.userId, status: 'active' },
            attributes: ['id', 'content', 'work_id', 'post_id', 'parent_id', 'like_count', 'created_at'],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openMyComments', e);
        return errorResponse(res, '获取评论失败', 500);
    }
}

async function openMyPosts(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Post, {
            where: {
                user_id: req.oauth.userId,
                status: { [Op.in]: ['published', 'active'] }
            },
            attributes: ['id', 'title', 'content', 'view_count', 'like_count', 'comment_count', 'is_top', 'is_essence', 'created_at'],
            order: [['created_at', 'DESC']],
            limit: pageSize,
            offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openMyPosts', e);
        return errorResponse(res, '获取帖子失败', 500);
    }
}

async function openMyPostDetail(req, res) {
    try {
        const post = await DbAdapter.findOne(Post, {
            where: {
                id: req.params.id,
                user_id: req.oauth.userId,
                status: { [Op.in]: ['published', 'active'] }
            },
            attributes: ['id', 'title', 'content', 'view_count', 'like_count', 'comment_count', 'is_top', 'is_essence', 'created_at', 'updated_at']
        });
        if (!post) return errorResponse(res, '帖子不存在', 404);
        return successResponse(res, post);
    } catch (e) {
        console.error('openMyPostDetail', e);
        return errorResponse(res, '获取帖子失败', 500);
    }
}


// -------- Studios (studios:read / studios:review) --------
async function openMyStudios(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(StudioMember, {
            where: { user_id: req.oauth.userId, status: "active" },
            include: [{
                model: Studio,
                as: "studio",
                where: req.query.status ? { status: String(req.query.status) } : undefined,
                required: true,
                include: [
                    { model: User, as: "owner", attributes: ["id", "username", "nickname", "avatar"] }
                ]
            }],
            order: [["created_at", "DESC"]],
            limit: pageSize,
            offset
        });
        const list = rows.map(r => {
            const json = r.toJSON ? r.toJSON() : r;
            const s = json.studio || {};
            return {
                member_id: json.id,
                member_role: json.role,
                member_status: json.status,
                member_joined_at: json.created_at,
                studio: {
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    logo_url: s.logo_url,
                    cover_url: s.cover_url,
                    status: s.status,
                    member_count: s.member_count,
                    work_count: s.work_count,
                    owner: s.owner || null,
                    created_at: s.created_at,
                    updated_at: s.updated_at
                }
            };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error("openMyStudios", e);
        return errorResponse(res, "Failed to get studios", 500);
    }
}

async function openMyStudioDetail(req, res) {
    try {
        const member = await DbAdapter.findOne(StudioMember, {
            where: { user_id: req.oauth.userId, studio_id: req.params.id, status: "active" },
            include: [{
                model: Studio,
                as: "studio",
                include: [
                    { model: User, as: "owner", attributes: ["id", "username", "nickname", "avatar"] }
                ]
            }]
        });
        if (!member) return errorResponse(res, "Not found", 404);
        const json = member.toJSON ? member.toJSON() : member;
        const s = json.studio || {};
        const members = await DbAdapter.count(StudioMember, { where: { studio_id: s.id, status: "active" } });
        const works = await DbAdapter.count(StudioWork, { where: { studio_id: s.id, status: "approved" } });
        return successResponse(res, {
            id: s.id, name: s.name, description: s.description,
            logo_url: s.logo_url, cover_url: s.cover_url, status: s.status,
            member_count: members, work_count: works,
            owner: s.owner || null, my_role: json.role,
            created_at: s.created_at, updated_at: s.updated_at
        });
    } catch (e) {
        console.error("openMyStudioDetail", e);
        return errorResponse(res, "Failed to get studio", 500);
    }
}

async function openMyFollowers(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Follow, {
            where: { following_id: req.oauth.userId },
            include: [{ model: User, as: "follower", attributes: ["id", "username", "nickname", "avatar", "bio", "level"] }],
            order: [["created_at", "DESC"]],
            limit: pageSize, offset
        });
        const list = rows.map(r => {
            const json = r.toJSON ? r.toJSON() : r;
            return { ...(json.follower || {}), followed_at: json.created_at };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error("openMyFollowers", e);
        return errorResponse(res, "Failed to get followers", 500);
    }
}

async function openMyFollowing(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Follow, {
            where: { follower_id: req.oauth.userId },
            include: [{ model: User, as: "following", attributes: ["id", "username", "nickname", "avatar", "bio", "level"] }],
            order: [["created_at", "DESC"]],
            limit: pageSize, offset
        });
        const list = rows.map(r => {
            const json = r.toJSON ? r.toJSON() : r;
            return { ...(json.following || {}), followed_at: json.created_at };
        });
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error("openMyFollowing", e);
        return errorResponse(res, "Failed to get following", 500);
    }
}

async function openMyFavorites(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Favorite, {
            where: { user_id: req.oauth.userId },
            order: [["created_at", "DESC"]],
            limit: pageSize, offset
        });
        const workIds = rows.map(r => r.work_id).filter(Boolean);
        const postIds = rows.map(r => r.post_id).filter(Boolean);
        const works = workIds.length
            ? await DbAdapter.findAll(Work, { where: { id: { [Op.in]: workIds }, status: "published" }, attributes: ["id", "name", "preview", "user_id", "created_at"] })
            : [];
        const posts = postIds.length
            ? await DbAdapter.findAll(Post, { where: { id: { [Op.in]: postIds }, status: { [Op.in]: ["published", "active"] } }, attributes: ["id", "title", "user_id", "created_at"] })
            : [];
        const workMap = new Map(works.map(w => [DbAdapter.getId(w), w]));
        const postMap = new Map(posts.map(p => [DbAdapter.getId(p), p]));
        const list = rows.map(r => {
            if (r.work_id) { const w = workMap.get(r.work_id); return w ? { type: "work", target_id: r.work_id, created_at: r.created_at, target: w } : null; }
            if (r.post_id) { const p = postMap.get(r.post_id); return p ? { type: "post", target_id: r.post_id, created_at: r.created_at, target: p } : null; }
            return null;
        }).filter(Boolean);
        return paginateResponse(res, list, count, page, pageSize);
    } catch (e) {
        console.error("openMyFavorites", e);
        return errorResponse(res, "Failed to get favorites", 500);
    }
}

async function openMyLikes(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Like, {
            where: { user_id: req.oauth.userId },
            order: [["created_at", "DESC"]],
            limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error("openMyLikes", e);
        return errorResponse(res, "Failed to get likes", 500);
    }
}

// -------- Extended read/write scopes --------
function attachOAuthUser(req) {
    req.user = req.oauth.user;
    return req;
}

async function openMyNotifications(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = { user_id: req.oauth.userId };
        if (req.query.unread === 'true' || req.query.unread === '1') where.is_read = false;
        const { count, rows } = await DbAdapter.findAndCountAll(Notification, {
            where,
            attributes: ['id', 'type', 'title', 'content', 'related_id', 'related_type', 'sender_id', 'is_read', 'created_at'],
            order: [['created_at', 'DESC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openMyNotifications', e);
        return errorResponse(res, '获取通知失败', 500);
    }
}

async function openSendNotification(req, res) {
    try {
        const title = req.body && req.body.title != null ? String(req.body.title).trim() : '';
        const content = req.body && req.body.content != null ? String(req.body.content).trim() : '';
        if (!title) return errorResponse(res, '通知标题不能为空', 400);
        if (title.length > 200) return errorResponse(res, '通知标题不能超过200字', 400);
        if (content.length > 5000) return errorResponse(res, '通知内容不能超过5000字', 400);
        const notification = await DbAdapter.create(Notification, {
            user_id: req.oauth.userId,
            sender_id: req.oauth.userId,
            type: 'developer_app',
            title,
            content: content || null,
            related_type: 'developer_app',
            related_id: req.oauth.appId,
            meta: JSON.stringify({ app_id: req.oauth.appId, app_name: req.oauth.app && req.oauth.app.name })
        });
        return successResponse(res, notification, '通知已发送');
    } catch (e) {
        console.error('openSendNotification', e);
        return errorResponse(res, '发送通知失败', 500);
    }
}

async function openMyWorkStats(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = { user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } };
        if (req.params.id) where.id = req.params.id;
        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where,
            attributes: ['id', 'codemao_work_id', 'name', 'status', 'view_times', 'praise_times', 'collection_times', 'comment_count', 'created_at', 'updated_at'],
            order: [['created_at', 'DESC']],
            limit: req.params.id ? 1 : pageSize,
            offset: req.params.id ? 0 : offset
        });
        if (req.params.id) {
            if (!rows.length) return errorResponse(res, '作品不存在', 404);
            return successResponse(res, rows[0]);
        }
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openMyWorkStats', e);
        return errorResponse(res, '获取作品统计失败', 500);
    }
}

async function openMyActivity(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const fetchLimit = Math.min(offset + pageSize, 500);
        const [works, posts, comments, workCount, postCount, commentCount] = await Promise.all([
            DbAdapter.findAll(Work, { where: { user_id: req.oauth.userId, status: 'published' }, attributes: ['id', 'name', 'preview', 'created_at'], order: [['created_at', 'DESC']], limit: fetchLimit }),
            DbAdapter.findAll(Post, { where: { user_id: req.oauth.userId, status: 'published' }, attributes: ['id', 'title', 'category', 'created_at'], order: [['created_at', 'DESC']], limit: fetchLimit }),
            DbAdapter.findAll(Comment, { where: { user_id: req.oauth.userId, status: 'active' }, attributes: ['id', 'content', 'work_id', 'post_id', 'created_at'], order: [['created_at', 'DESC']], limit: fetchLimit }),
            DbAdapter.count(Work, { where: { user_id: req.oauth.userId, status: 'published' } }),
            DbAdapter.count(Post, { where: { user_id: req.oauth.userId, status: 'published' } }),
            DbAdapter.count(Comment, { where: { user_id: req.oauth.userId, status: 'active' } })
        ]);
        const activity = [
            ...works.map(row => ({ type: 'work', created_at: row.created_at, data: row })),
            ...posts.map(row => ({ type: 'post', created_at: row.created_at, data: row })),
            ...comments.map(row => ({ type: 'comment', created_at: row.created_at, data: row }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(offset, offset + pageSize);
        // 活动聚合最多回溯 500 条，避免高页码导致一次加载大量三表数据。
        const total = Math.min(workCount + postCount + commentCount, 500);
        return paginateResponse(res, activity, total, page, pageSize);
    } catch (e) {
        console.error('openMyActivity', e);
        return errorResponse(res, '获取社区动态失败', 500);
    }
}

// -------- Low-risk public data and analytics scopes --------
const PUBLIC_USER_ATTRIBUTES = [
    'id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'profile_cover',
    'bio', 'doing', 'level', 'follower_count', 'following_count', 'work_count', 'created_at'
];
const PUBLIC_WORK_ATTRIBUTES = [
    'id', 'codemao_work_id', 'name', 'description', 'preview', 'type', 'ide_type',
    'user_id', 'view_times', 'praise_times', 'collection_times', 'comment_count',
    'is_featured', 'created_at', 'updated_at'
];
const PUBLIC_POST_ATTRIBUTES = [
    'id', 'title', 'content', 'user_id', 'view_count', 'like_count', 'comment_count',
    'collection_count', 'is_top', 'is_essence', 'category', 'cover', 'tags',
    'created_at', 'updated_at'
];
const PUBLIC_STUDIO_ATTRIBUTES = [
    'id', 'name', 'description', 'cover', 'cover_url', 'owner_id', 'member_count',
    'work_count', 'level', 'join_type', 'created_at', 'updated_at'
];
const PUBLIC_AUTHOR_INCLUDE = [{
    model: User,
    as: 'author',
    attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'level']
}];
const PUBLIC_COMMENT_AUTHOR_INCLUDE = [{
    model: User,
    as: 'user',
    attributes: ['id', 'codemao_user_id', 'username', 'nickname', 'avatar', 'level']
}];

async function openAppOpenId(req, res) {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
    if (!secret) return errorResponse(res, '服务器未配置用户标识密钥', 503);
    const openid = crypto.createHmac('sha256', secret)
        .update(`${req.oauth.appId}:${req.oauth.userId}`)
        .digest('hex');
    return successResponse(res, { openid });
}

async function openPublicUser(req, res) {
    try {
        const id = String(req.params.id);
        const user = await DbAdapter.findOne(User, {
            where: { status: 'active', [Op.or]: [{ id }, { codemao_user_id: id }, { username: id }] },
            attributes: PUBLIC_USER_ATTRIBUTES
        });
        if (!user) return errorResponse(res, '用户不存在', 404);
        return successResponse(res, user);
    } catch (e) {
        console.error('openPublicUser', e);
        return errorResponse(res, '获取公开用户失败', 500);
    }
}

async function openPublicWorks(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = { status: 'published' };
        if (req.query.user_id) where.user_id = req.query.user_id;
        if (req.query.featured === 'true' || req.query.featured === '1') where.is_featured = true;
        const order = req.query.sort === 'popular'
            ? [['view_times', 'DESC'], ['created_at', 'DESC']]
            : [['created_at', 'DESC']];
        const { count, rows } = await DbAdapter.findAndCountAll(Work, {
            where, attributes: PUBLIC_WORK_ATTRIBUTES, include: PUBLIC_AUTHOR_INCLUDE,
            order, limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openPublicWorks', e);
        return errorResponse(res, '获取公开作品失败', 500);
    }
}

async function openPublicWorkDetail(req, res) {
    try {
        const id = String(req.params.id);
        const work = await DbAdapter.findOne(Work, {
            where: { status: 'published', [Op.or]: [{ id }, { codemao_work_id: id }] },
            attributes: PUBLIC_WORK_ATTRIBUTES,
            include: PUBLIC_AUTHOR_INCLUDE
        });
        if (!work) return errorResponse(res, '作品不存在', 404);
        return successResponse(res, work);
    } catch (e) {
        console.error('openPublicWorkDetail', e);
        return errorResponse(res, '获取公开作品失败', 500);
    }
}

async function openPublicPosts(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = { status: 'published' };
        if (req.query.user_id) where.user_id = req.query.user_id;
        if (req.query.category) where.category = String(req.query.category);
        const order = req.query.sort === 'popular'
            ? [['view_count', 'DESC'], ['created_at', 'DESC']]
            : [['is_top', 'DESC'], ['created_at', 'DESC']];
        const { count, rows } = await DbAdapter.findAndCountAll(Post, {
            where, attributes: PUBLIC_POST_ATTRIBUTES, include: PUBLIC_AUTHOR_INCLUDE,
            order, limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openPublicPosts', e);
        return errorResponse(res, '获取公开帖子失败', 500);
    }
}

async function openPublicPostDetail(req, res) {
    try {
        const post = await DbAdapter.findOne(Post, {
            where: { id: req.params.id, status: 'published' },
            attributes: PUBLIC_POST_ATTRIBUTES,
            include: PUBLIC_AUTHOR_INCLUDE
        });
        if (!post) return errorResponse(res, '帖子不存在', 404);
        return successResponse(res, post);
    } catch (e) {
        console.error('openPublicPostDetail', e);
        return errorResponse(res, '获取公开帖子失败', 500);
    }
}

async function openPublicStudios(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(Studio, {
            where: { status: 'active', is_public: true },
            attributes: PUBLIC_STUDIO_ATTRIBUTES,
            include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'nickname', 'avatar'] }],
            order: [['created_at', 'DESC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openPublicStudios', e);
        return errorResponse(res, '获取公开工作室失败', 500);
    }
}

async function openPublicStudioDetail(req, res) {
    try {
        const studio = await DbAdapter.findOne(Studio, {
            where: { id: req.params.id, status: 'active', is_public: true },
            attributes: PUBLIC_STUDIO_ATTRIBUTES,
            include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'nickname', 'avatar'] }]
        });
        if (!studio) return errorResponse(res, '工作室不存在', 404);
        return successResponse(res, studio);
    } catch (e) {
        console.error('openPublicStudioDetail', e);
        return errorResponse(res, '获取公开工作室失败', 500);
    }
}

async function openSearch(req, res) {
    try {
        const q = String(req.query.q || '').trim();
        if (q.replace(/[%_\\]/g, '').trim().length < 2) return errorResponse(res, '搜索关键词至少2个有效字符', 400);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 20);
        const like = { [Op.like]: `%${q}%` };
        const [users, works, posts, studios] = await Promise.all([
            DbAdapter.findAll(User, { where: { status: 'active', [Op.or]: [{ nickname: like }, { username: like }] }, attributes: PUBLIC_USER_ATTRIBUTES, limit }),
            DbAdapter.findAll(Work, { where: { status: 'published', name: like }, attributes: PUBLIC_WORK_ATTRIBUTES, limit }),
            DbAdapter.findAll(Post, { where: { status: 'published', [Op.or]: [{ title: like }, { content: like }] }, attributes: PUBLIC_POST_ATTRIBUTES, limit }),
            DbAdapter.findAll(Studio, { where: { status: 'active', is_public: true, name: like }, attributes: PUBLIC_STUDIO_ATTRIBUTES, limit })
        ]);
        return successResponse(res, { users, works, posts, studios });
    } catch (e) {
        console.error('openSearch', e);
        return errorResponse(res, '搜索失败', 500);
    }
}

async function openCommunityFeed(req, res) {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
        const mode = ['latest', 'popular', 'featured'].includes(req.query.mode) ? req.query.mode : 'latest';
        const workWhere = { status: 'published' };
        const postWhere = { status: 'published' };
        if (mode === 'featured') { workWhere.is_featured = true; postWhere.is_essence = true; }
        const workOrder = mode === 'popular' ? [['view_times', 'DESC']] : [['created_at', 'DESC']];
        const postOrder = mode === 'popular' ? [['view_count', 'DESC']] : [['created_at', 'DESC']];
        const [works, posts] = await Promise.all([
            DbAdapter.findAll(Work, { where: workWhere, attributes: PUBLIC_WORK_ATTRIBUTES, order: workOrder, limit }),
            DbAdapter.findAll(Post, { where: postWhere, attributes: PUBLIC_POST_ATTRIBUTES, order: postOrder, limit })
        ]);
        const items = [
            ...works.map(data => ({ type: 'work', created_at: data.created_at, data })),
            ...posts.map(data => ({ type: 'post', created_at: data.created_at, data }))
        ];
        if (mode === 'latest') items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return successResponse(res, items.slice(0, limit));
    } catch (e) {
        console.error('openCommunityFeed', e);
        return errorResponse(res, '获取社区内容流失败', 500);
    }
}

async function openCommunityStats(req, res) {
    try {
        const [users, works, posts, studios] = await Promise.all([
            DbAdapter.count(User, { where: { status: 'active' } }),
            DbAdapter.count(Work, { where: { status: 'published' } }),
            DbAdapter.count(Post, { where: { status: 'published' } }),
            DbAdapter.count(Studio, { where: { status: 'active', is_public: true } })
        ]);
        return successResponse(res, { users, works, posts, studios });
    } catch (e) {
        console.error('openCommunityStats', e);
        return errorResponse(res, '获取社区统计失败', 500);
    }
}

async function openMyWorksAnalytics(req, res) {
    try {
        const where = { user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } };
        const fields = ['view_times', 'praise_times', 'collection_times', 'comment_count'];
        const [total, rows, ...sums] = await Promise.all([
            DbAdapter.count(Work, { where }),
            DbAdapter.findAll(Work, {
            where,
            attributes: ['id', 'codemao_work_id', 'name', 'status', 'view_times', 'praise_times', 'collection_times', 'comment_count', 'created_at']
            , order: [['created_at', 'DESC']], limit: 100
            }),
            ...fields.map(field => DbAdapter.sum(Work, field, { where }))
        ]);
        return successResponse(res, { total, totals: Object.fromEntries(fields.map((field, index) => [field, Number(sums[index] || 0)])), items: rows, items_limited: total > rows.length });
    } catch (e) {
        console.error('openMyWorksAnalytics', e);
        return errorResponse(res, '获取作品分析失败', 500);
    }
}

async function openMyPostsAnalytics(req, res) {
    try {
        const where = { user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } };
        const fields = ['view_count', 'like_count', 'collection_count', 'comment_count'];
        const [total, rows, ...sums] = await Promise.all([
            DbAdapter.count(Post, { where }),
            DbAdapter.findAll(Post, {
            where,
            attributes: ['id', 'title', 'status', 'view_count', 'like_count', 'collection_count', 'comment_count', 'created_at']
            , order: [['created_at', 'DESC']], limit: 100
            }),
            ...fields.map(field => DbAdapter.sum(Post, field, { where }))
        ]);
        return successResponse(res, { total, totals: Object.fromEntries(fields.map((field, index) => [field, Number(sums[index] || 0)])), items: rows, items_limited: total > rows.length });
    } catch (e) {
        console.error('openMyPostsAnalytics', e);
        return errorResponse(res, '获取帖子分析失败', 500);
    }
}

async function openMyAccountAnalytics(req, res) {
    try {
        const workWhere = { user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } };
        const postWhere = { user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } };
        const workFields = ['view_times', 'praise_times', 'collection_times', 'comment_count'];
        const postFields = ['view_count', 'like_count', 'collection_count', 'comment_count'];
        const [workCount, postCount, comments, ...sums] = await Promise.all([
            DbAdapter.count(Work, { where: workWhere }),
            DbAdapter.count(Post, { where: postWhere }),
            DbAdapter.count(Comment, { where: { user_id: req.oauth.userId, status: 'active' } }),
            ...workFields.map(field => DbAdapter.sum(Work, field, { where: workWhere })),
            ...postFields.map(field => DbAdapter.sum(Post, field, { where: postWhere }))
        ]);
        return successResponse(res, {
            works: { count: workCount, ...Object.fromEntries(workFields.map((field, index) => [field, Number(sums[index] || 0)])) },
            posts: { count: postCount, ...Object.fromEntries(postFields.map((field, index) => [field, Number(sums[workFields.length + index] || 0)])) },
            comments: { count: comments },
            followers: Number(req.oauth.user.follower_count || 0),
            following: Number(req.oauth.user.following_count || 0)
        });
    } catch (e) {
        console.error('openMyAccountAnalytics', e);
        return errorResponse(res, '获取账号分析失败', 500);
    }
}

async function openCommentsReceived(req, res) {
    try {
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const [works, posts] = await Promise.all([
            DbAdapter.findAll(Work, { where: { user_id: req.oauth.userId }, attributes: ['id'] }),
            DbAdapter.findAll(Post, { where: { user_id: req.oauth.userId }, attributes: ['id'] })
        ]);
        const workIds = works.map(row => DbAdapter.getId(row));
        const postIds = posts.map(row => DbAdapter.getId(row));
        if (!workIds.length && !postIds.length) return paginateResponse(res, [], 0, page, pageSize);
        const targets = [];
        if (workIds.length) targets.push({ work_id: { [Op.in]: workIds } });
        if (postIds.length) targets.push({ post_id: { [Op.in]: postIds } });
        const { count, rows } = await DbAdapter.findAndCountAll(Comment, {
            where: { status: 'active', user_id: { [Op.ne]: req.oauth.userId }, [Op.or]: targets },
            attributes: ['id', 'content', 'work_id', 'post_id', 'parent_id', 'like_count', 'created_at'],
            include: PUBLIC_COMMENT_AUTHOR_INCLUDE, order: [['created_at', 'DESC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openCommentsReceived', e);
        return errorResponse(res, '获取收到的评论失败', 500);
    }
}

async function requireManagedStudio(req, res) {
    const member = await DbAdapter.findOne(StudioMember, {
        where: {
            studio_id: req.params.id,
            user_id: req.oauth.userId,
            status: 'active',
            role: { [Op.in]: ['owner', 'vice_owner', 'admin'] }
        }
    });
    if (!member) {
        errorResponse(res, '仅工作室管理成员可以读取此数据', 403, 'oauth_forbidden_studio_role');
        return null;
    }
    return member;
}

async function openStudioApplications(req, res) {
    try {
        if (!await requireManagedStudio(req, res)) return;
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(StudioMember, {
            where: { studio_id: req.params.id, status: 'pending' },
            attributes: ['id', 'role', 'status', 'created_at'],
            include: [{ model: User, as: 'user', attributes: PUBLIC_USER_ATTRIBUTES }],
            order: [['created_at', 'ASC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openStudioApplications', e);
        return errorResponse(res, '获取工作室申请失败', 500);
    }
}

async function openStudioSubmissions(req, res) {
    try {
        if (!await requireManagedStudio(req, res)) return;
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(StudioWork, {
            where: { studio_id: req.params.id },
            attributes: ['id', 'user_id', 'score', 'status', 'reviewed_by', 'reviewed_at', 'added_at'],
            include: [{ model: Work, as: 'work', attributes: PUBLIC_WORK_ATTRIBUTES }],
            order: [['added_at', 'DESC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openStudioSubmissions', e);
        return errorResponse(res, '获取工作室投稿失败', 500);
    }
}

async function openStudioAnalytics(req, res) {
    try {
        if (!await requireManagedStudio(req, res)) return;
        const [studio, activeMembers, pendingMembers, approvedWorks, pendingWorks] = await Promise.all([
            DbAdapter.findByPk(Studio, req.params.id, { attributes: PUBLIC_STUDIO_ATTRIBUTES }),
            DbAdapter.count(StudioMember, { where: { studio_id: req.params.id, status: 'active' } }),
            DbAdapter.count(StudioMember, { where: { studio_id: req.params.id, status: 'pending' } }),
            DbAdapter.count(StudioWork, { where: { studio_id: req.params.id, status: 'approved' } }),
            DbAdapter.count(StudioWork, { where: { studio_id: req.params.id, status: 'pending' } })
        ]);
        return successResponse(res, { studio, members: { active: activeMembers, pending: pendingMembers }, works: { approved: approvedWorks, pending: pendingWorks } });
    } catch (e) {
        console.error('openStudioAnalytics', e);
        return errorResponse(res, '获取工作室分析失败', 500);
    }
}

async function openStudioLogs(req, res) {
    try {
        if (!await requireManagedStudio(req, res)) return;
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(OperationLog, {
            where: { target_type: 'studio', target_id: req.params.id },
            // 操作详情可能包含管理备注或内部字段，开放平台仅返回必要的审计元数据。
            attributes: ['id', 'user_id', 'action', 'created_at'],
            order: [['created_at', 'DESC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openStudioLogs', e);
        return errorResponse(res, '获取工作室日志失败', 500);
    }
}

async function openDeveloperUsage(req, res) {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
        const since = new Date(Date.now() - days * 86400000);
        const rows = await DbAdapter.findAll(OperationLog, {
            where: { action: 'developer_api_call', target_type: 'developer_app', target_id: req.oauth.appId, created_at: { [Op.gte]: since } },
            attributes: ['details', 'created_at'], order: [['created_at', 'DESC']], limit: 5000
        });
        const perDay = {}, perPath = {}, perStatus = {};
        rows.forEach(row => {
            const day = new Date(row.created_at).toISOString().slice(0, 10);
            perDay[day] = (perDay[day] || 0) + 1;
            try {
                const details = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
                const path = details.path || '-';
                const status = String(details.status || 0);
                perPath[path] = (perPath[path] || 0) + 1;
                perStatus[status] = (perStatus[status] || 0) + 1;
            } catch (_) {}
        });
        return successResponse(res, { days, total: rows.length, truncated: rows.length === 5000, perDay, perPath, perStatus });
    } catch (e) {
        console.error('openDeveloperUsage', e);
        return errorResponse(res, '获取应用调用统计失败', 500);
    }
}

async function openMyStudioMembers(req, res) {
    try {
        const mine = await DbAdapter.findOne(StudioMember, {
            where: { studio_id: req.params.id, user_id: req.oauth.userId, status: 'active' }
        });
        if (!mine) return errorResponse(res, '工作室不存在或无权查看', 404);
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const { count, rows } = await DbAdapter.findAndCountAll(StudioMember, {
            where: { studio_id: req.params.id, status: 'active' },
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'nickname', 'avatar', 'bio', 'level'] }],
            attributes: ['id', 'role', 'joined_at'],
            order: [['joined_at', 'ASC']], limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error('openMyStudioMembers', e);
        return errorResponse(res, '获取工作室成员失败', 500);
    }
}

function requireOAuthAdminPermission(permission) {
    return async (req, res, callback) => {
        const role = req.oauth && req.oauth.user && req.oauth.user.role;
        if (!role || !hasPermission(role, permission)) {
            return errorResponse(res, `授权用户缺少后台权限: ${permission}`, 403, 'oauth_forbidden_role');
        }
        attachOAuthUser(req);
        return callback(req, res);
    };
}

const openReports = (req, res) => requireOAuthAdminPermission('report:view')(req, res, adminController.getReports);
const openHandleReport = (req, res) => {
    req.params.reportId = req.params.id;
    return requireOAuthAdminPermission('report:handle')(req, res, adminController.handleReport);
};

async function withOwnedResource(req, res, model, where, label, callback) {
    try {
        const owned = await DbAdapter.findOne(model, { where });
        if (!owned) return errorResponse(res, `${label}不存在`, 404);
        return callback();
    } catch (e) {
        console.error(`open owned ${label} operation`, e);
        return errorResponse(res, `${label}操作失败`, 500);
    }
}

const openCreateComment = (req, res) => commentController.createComment(attachOAuthUser(req), res);
const openDeleteComment = (req, res) => withOwnedResource(
    req, res, Comment, { id: req.params.id, user_id: req.oauth.userId }, '评论',
    () => commentController.deleteComment(attachOAuthUser(req), res)
);
const openCreatePost = (req, res) => postController.createPost(attachOAuthUser(req), res);
const openUpdatePost = (req, res) => withOwnedResource(
    req, res, Post, { id: req.params.id, user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } }, '帖子',
    () => postController.updatePost(attachOAuthUser(req), res)
);
const openDeletePost = (req, res) => withOwnedResource(
    req, res, Post, { id: req.params.id, user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } }, '帖子',
    () => postController.deletePost(attachOAuthUser(req), res)
);
const openPublishWork = (req, res) => workController.publishWork(attachOAuthUser(req), res);
const openUpdateWork = (req, res) => withOwnedResource(
    req, res, Work,
    { codemao_work_id: String(req.params.id), user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } },
    '作品', () => { req.params.codemaoId = req.params.id; return workController.updateWork(attachOAuthUser(req), res); }
);
const openDeleteWork = (req, res) => withOwnedResource(
    req, res, Work,
    { codemao_work_id: String(req.params.id), user_id: req.oauth.userId, status: { [Op.ne]: 'deleted' } },
    '作品', () => { req.params.codemaoId = req.params.id; return workController.deleteWork(attachOAuthUser(req), res); }
);

async function assertCanReview(req, res) {
    const role = req.oauth && req.oauth.user ? req.oauth.user.role : null;
    if (!["admin", "superadmin"].includes(role)) {
        return errorResponse(res, "Admin role required", 403, "oauth_forbidden_role");
    }
    return null;
}

async function openStudiosPendingReview(req, res) {
    try {
        const denied = await assertCanReview(req, res);
        if (denied) return denied;
        const { page, pageSize, offset } = DbAdapter.parsePagination(req.query);
        const where = { status: "pending" };
        if (req.query.keyword) where.name = { [Op.like]: "%" + String(req.query.keyword).trim() + "%" };
        const { count, rows } = await DbAdapter.findAndCountAll(Studio, {
            where,
            include: [{ model: User, as: "owner", attributes: ["id", "username", "nickname", "avatar"] }],
            order: [["created_at", "ASC"]],
            limit: pageSize, offset
        });
        return paginateResponse(res, rows, count, page, pageSize);
    } catch (e) {
        console.error("openStudiosPendingReview", e);
        return errorResponse(res, "Failed to get pending studios", 500);
    }
}

async function openReviewStudio(req, res) {
    try {
        const denied = await assertCanReview(req, res);
        if (denied) return denied;
        const { action, note } = req.body || {};
        if (!["approve", "reject", "ban"].includes(action)) return errorResponse(res, "Invalid action", 400);
        const statusMap = { approve: "active", reject: "rejected", ban: "banned" };
        const studio = await DbAdapter.findByPk(Studio, req.params.id);
        if (!studio) return errorResponse(res, "Not found", 404);
        if (studio.status !== "pending") return errorResponse(res, "Only pending studios can be reviewed", 400);
        await DbAdapter.update(Studio, {
            status: statusMap[action],
            review_note: note != null ? String(note).trim() : null,
            reviewed_by: req.oauth.userId,
            reviewed_at: new Date()
        }, { where: { id: studio.id } });
        logOperation(req, "review_studio", "studio", studio.id, { action, note });
        const updated = await DbAdapter.findByPk(Studio, studio.id);
        return successResponse(res, {
            id: updated.id, name: updated.name, status: updated.status,
            review_note: updated.review_note, reviewed_at: updated.reviewed_at
        }, "Review done");
    } catch (e) {
        console.error("openReviewStudio", e);
        return errorResponse(res, "Review failed", 500);
    }
}

// User authorized apps
async function listMyAuthorizations(req, res) {
    try {
        const rows = await DbAdapter.findAll(UserAppAuthorization, {
            where: { user_id: getOwnerId(req), revoked_at: null },
            include: [{ model: DeveloperApp, as: 'app' }],
            order: [['authorized_at', 'DESC']]
        });
        const list = rows.map(r => {
            const json = r.toJSON ? r.toJSON() : r;
            return {
                id: json.id,
                scopes: oauth.parseJsonField(json.scopes, []).filter(key => !oauth.APPLICATION_SCOPES.includes(key)),
                authorized_at: json.authorized_at,
                app: json.app ? {
                    id: json.app.id,
                    name: json.app.name,
                    description: json.app.description,
                    logo_url: json.app.logo_url,
                    homepage_url: json.app.homepage_url,
                    client_id: json.app.client_id,
                    status: json.app.status
                } : null
            };
        }).filter(x => x.app);
        return successResponse(res, list);
    } catch (e) {
        console.error('listMyAuthorizations', e);
        return errorResponse(res, '获取授权列表失败', 500);
    }
}

async function revokeMyAuthorization(req, res) {
    try {
        const auth = await DbAdapter.findOne(UserAppAuthorization, {
            where: { id: req.params.id, user_id: getOwnerId(req), revoked_at: null }
        });
        if (!auth) return errorResponse(res, '授权记录不存在', 404);
        const now = new Date();
        await sequelize.transaction(async (t) => {
            await DbAdapter.update(UserAppAuthorization, { revoked_at: now }, { where: { id: auth.id }, transaction: t });
            await DbAdapter.destroy(OAuthAuthCode, {
                where: { user_id: auth.user_id, app_id: auth.app_id, used_at: null },
                transaction: t
            });
            await DbAdapter.update(OAuthAccessToken, { revoked_at: now }, {
                where: { user_id: auth.user_id, app_id: auth.app_id, revoked_at: null },
                transaction: t
            });
            await DbAdapter.update(OAuthRefreshToken, { revoked_at: now }, {
                where: { user_id: auth.user_id, app_id: auth.app_id, revoked_at: null },
                transaction: t
            });
        });
        logOperation(req, 'revoke_app_authorization', 'user_app_authorization', auth.id, { app_id: auth.app_id });
        return successResponse(res, null, '已撤销授权');
    } catch (e) {
        console.error('revokeMyAuthorization', e);
        return errorResponse(res, '撤销失败', 500);
    }
}

module.exports = {
    listMyApps,
    getMyApp,
    listMyAppCalls,
    createApp,
    updateApp,
    uploadAppLogo,
    rotateSecret,
    getScopeDocs,
    adminListApps,
    adminGetApp,
    adminListAppCalls,
    adminReviewApp,
    getAuthorizeInfo,
    approveAuthorize,
    tokenEndpoint,
    revokeToken,
    userinfo,
    openMe,
    openMyWorks,
    openMyWorkDetail,
    openMyComments,
    openMyPosts,
    openMyPostDetail,
    listMyAuthorizations,
    revokeMyAuthorization,
    openMyStudios,
    openMyStudioDetail,
    openMyFollowers,
    openMyFollowing,
    openMyFavorites,
    openMyLikes,
    openMyNotifications,
    openSendNotification,
    openMyWorkStats,
    openMyActivity,
    openMyStudioMembers,
    openAppOpenId,
    openPublicUser,
    openPublicWorks,
    openPublicWorkDetail,
    openPublicPosts,
    openPublicPostDetail,
    openPublicStudios,
    openPublicStudioDetail,
    openSearch,
    openCommunityFeed,
    openCommunityStats,
    openMyWorksAnalytics,
    openMyPostsAnalytics,
    openMyAccountAnalytics,
    openCommentsReceived,
    openStudioApplications,
    openStudioSubmissions,
    openStudioAnalytics,
    openStudioLogs,
    openDeveloperUsage,
    openCreateComment,
    openDeleteComment,
    openCreatePost,
    openUpdatePost,
    openDeletePost,
    openPublishWork,
    openUpdateWork,
    openDeleteWork,
    adminUpdateAppRateLimit,
    adminRevokeAllTokens,
    adminRegenerateSecret,
    adminDeleteApp,
    adminListAuditLogs,
    adminCallLogStats,
    adminCallLogStatsDetail,
};
