const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGE_FORMATS = Object.freeze({
    'image/jpeg': { extension: '.jpg', format: 'jpeg' },
    'image/png': { extension: '.png', format: 'png' },
    'image/webp': { extension: '.webp', format: 'webp' },
    'image/gif': { extension: '.gif', format: 'gif' }
});

function invalidImageError(message) {
    const error = new Error(message);
    error.code = 'INVALID_IMAGE_UPLOAD';
    return error;
}

function safeImageFilename(mimetype) {
    const imageFormat = IMAGE_FORMATS[mimetype];
    if (!imageFormat) return null;
    return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${imageFormat.extension}`;
}

function hasAllowedImageSignature(buffer, mimetype) {
    if (mimetype === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimetype === 'image/png') {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimetype === 'image/webp') {
        return buffer.length >= 12
            && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
            && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    if (mimetype === 'image/gif') {
        const signature = buffer.subarray(0, 6).toString('ascii');
        return signature === 'GIF87a' || signature === 'GIF89a';
    }
    return false;
}

async function validateAndReencodeImage(file, allowedMimeTypes) {
    if (!file || !allowedMimeTypes.has(file.mimetype) || !IMAGE_FORMATS[file.mimetype]) {
        throw invalidImageError('Unsupported image type');
    }

    const input = await fs.promises.readFile(file.path);
    if (!hasAllowedImageSignature(input, file.mimetype)) {
        throw invalidImageError('Invalid image signature');
    }

    const expected = IMAGE_FORMATS[file.mimetype];
    const image = sharp(input, { animated: file.mimetype === 'image/gif', limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== expected.format || !metadata.width || !metadata.height) {
        throw invalidImageError('Invalid image data');
    }

    let output;
    if (expected.format === 'jpeg') output = await image.jpeg({ quality: 90 }).toBuffer();
    if (expected.format === 'png') output = await image.png().toBuffer();
    if (expected.format === 'webp') output = await image.webp({ quality: 90 }).toBuffer();
    if (expected.format === 'gif') output = await image.gif().toBuffer();
    await fs.promises.writeFile(file.path, output);

    file.originalname = path.basename(file.filename || safeImageFilename(file.mimetype));
    file.size = output.length;
    return file;
}

async function cleanupUploadedFile(file) {
    if (!file?.path) return;
    await fs.promises.unlink(file.path).catch(() => {});
}

module.exports = {
    IMAGE_FORMATS,
    safeImageFilename,
    hasAllowedImageSignature,
    validateAndReencodeImage,
    cleanupUploadedFile
};
