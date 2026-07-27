const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const { uploadToImageHost } = require('../services/imageHost');
const { successResponse, errorResponse } = require('../middleware/response');
const { safeImageFilename, validateAndReencodeImage, cleanupUploadedFile } = require('../utils/imageUpload');

const router = express.Router();
const tempDir = path.join(__dirname, '../data/upload-temp/images');
fs.mkdirSync(tempDir, { recursive: true });
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.diskStorage({
    destination: tempDir,
    filename: (req, file, cb) => {
      const filename = safeImageFilename(file.mimetype);
      return filename ? cb(null, filename) : cb(new Error('Unsupported image type'));
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, allowedImageTypes.has(file.mimetype))
});

router.post('/image', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return errorResponse(res, '请选择 JPG、PNG、WebP 或 GIF 图片', 400);
  try {
    await validateAndReencodeImage(req.file, allowedImageTypes);
    const url = await uploadToImageHost(req.file);
    return successResponse(res, { url }, '图片上传成功');
  } catch (error) {
    console.error('uploadImage', error.message, error.cause?.code || '');
    if (error.code === 'INVALID_IMAGE_UPLOAD') {
      return errorResponse(res, '上传内容必须是有效的 JPG、PNG、WebP 或 GIF 图片', 400);
    }
    return errorResponse(res, error.message || '图片上传到图床失败，请稍后重试', 502);
  } finally {
    await cleanupUploadedFile(req.file);
  }
});

module.exports = router;
