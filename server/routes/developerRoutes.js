/**
 * Developer portal routes (JWT required)
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const developerController = require('../controllers/developerController');
const { authMiddleware } = require('../middleware/auth');
const { geetestVerify } = require('../middleware/geetest');
const { safeImageFilename, validateAndReencodeImage, cleanupUploadedFile } = require('../utils/imageUpload');

router.use(authMiddleware);
const appIconDir = path.join(__dirname, '../data/upload-temp/app-icons');
fs.mkdirSync(appIconDir, { recursive: true });
const allowedAppIconTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const appIconUpload = multer({ storage: multer.diskStorage({ destination: appIconDir, filename: (req, file, cb) => { const filename = safeImageFilename(file.mimetype); return filename ? cb(null, filename) : cb(new Error('Unsupported image type')); } }), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, allowedAppIconTypes.has(file.mimetype)) });

async function validateAppIcon(req, res, next) {
    if (!req.file) return next();
    try {
        await validateAndReencodeImage(req.file, allowedAppIconTypes);
        return next();
    } catch (_) {
        await cleanupUploadedFile(req.file);
        return res.status(400).json({ code: 400, msg: '应用图标必须是有效的 JPG、PNG 或 WebP 图片', data: null });
    }
}

router.get('/docs/scopes', developerController.getScopeDocs);
router.get('/apps', developerController.listMyApps);
router.post('/apps', geetestVerify('developer_app'), developerController.createApp);
router.get('/apps/:id', developerController.getMyApp);
router.get('/apps/:id/calls', developerController.listMyAppCalls);
router.patch('/apps/:id', developerController.updateApp);
router.put('/apps/:id', developerController.updateApp);
router.post('/apps/:id/logo', appIconUpload.single('logo'), validateAppIcon, developerController.uploadAppLogo);
router.post('/apps/:id/rotate-secret', developerController.rotateSecret);

// User authorized third-party apps
router.get('/authorizations', developerController.listMyAuthorizations);
router.delete('/authorizations/:id', developerController.revokeMyAuthorization);
router.post('/authorizations/:id/revoke', developerController.revokeMyAuthorization);

module.exports = router;
