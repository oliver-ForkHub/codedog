'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { validateAndReencodeImage, cleanupUploadedFile, safeImageFilename, MAX_IMAGE_DIMENSION } = require('../utils/imageUpload');
const { sanitizeSecrets } = require('../utils/logger');

const root = path.resolve(__dirname, '../..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function testAuthorizationAndStateBoundaries() {
    const work = source('server/controllers/workController.js');
    const comment = source('server/controllers/commentController.js');
    const post = source('server/controllers/postController.js');
    assert.match(work, /if \(!isOwner\) \{\s*return errorResponse\(res,/);
    assert.doesNotMatch(work, /!isOwner && !isRoleAtLeast\(req\.user\.role, 'moderator'\)/);
    assert.doesNotMatch(comment, /!sameId\([^\n]+moderator/);
    assert.match(post, /只有提问者可以采纳回答/);
    assert.match(post, /post\.status === 'deleted'[\s\S]{0,120}已删除帖子不能编辑/);
}

function testAtomicClaimsPresent() {
    const studio = source('server/controllers/studioManagementController.js');
    const oauth = source('server/controllers/developerController.js');
    assert.match(studio, /used_count: \{ \[Op\.lt\]: sequelize\.col\('max_uses'\) \}/);
    assert.match(studio, /owner_id: userId\(req\)/);
    assert.match(studio, /role: 'owner', id: \{ \[Op\.ne\]: target\.id \}/);
    assert.match(oauth, /where: \{ id: authCode\.id, used_at: null \}/);
    assert.match(oauth, /where: \{ id: old\.id, revoked_at: null, expires_at:/);
}

function testResourceAndDeploymentBoundaries() {
    const user = source('server/controllers/userController.js');
    const app = source('server/app.js');
    const compose = source('docker-compose.yml');
    const mobile = source('mobile/src/screens/WorkDetailScreen.tsx');
    const player = source('server/utils/codemaoPlayer.js');
    assert.match(user, /req\.file\?\.external_url[\s\S]{0,100}cleanupUploadedFile\(req\.file\)/);
    assert.match(app, /NODE_ENV === 'production' && rawTrustProxy === 'true'/);
    assert.match(compose, /127\.0\.0\.1:3001:3001/);
    assert.match(mobile, /PLAYER_HOSTS/);
    assert.match(mobile, /onShouldStartLoadWithRequest/);
    assert.match(player, /isAllowedCodemaoPlayerUrl/);
}

function testSecretRedaction() {
    const redacted = sanitizeSecrets('dead http://alice:p%40ss@proxy.example:8080/?token=secret-value');
    assert(!redacted.includes('alice'));
    assert(!redacted.includes('p%40ss'));
    assert(!redacted.includes('secret-value'));
}

async function testImageDimensions() {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codedog-image-limit-'));
    const filePath = path.join(dir, safeImageFilename('image/png'));
    const file = { path: filePath, filename: path.basename(filePath), originalname: 'large.png', mimetype: 'image/png' };
    try {
        await sharp({ create: { width: MAX_IMAGE_DIMENSION + 1, height: 1, channels: 3, background: '#fff' } }).png().toFile(filePath);
        await assert.rejects(validateAndReencodeImage(file, new Set(['image/png'])), /dimensions or frame count exceed limits/);
    } finally {
        await cleanupUploadedFile(file);
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
}

async function main() {
    testAuthorizationAndStateBoundaries();
    testAtomicClaimsPresent();
    testResourceAndDeploymentBoundaries();
    testSecretRedaction();
    await testImageDimensions();
    console.log('Security remediation smoke tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
