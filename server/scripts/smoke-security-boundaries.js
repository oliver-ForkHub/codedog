const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { Sequelize, DataTypes } = require('sequelize');
const { validateAndReencodeImage, cleanupUploadedFile, safeImageFilename } = require('../utils/imageUpload');
const { likeContains } = require('../utils/security');
const { GeetestLib } = require('../services/geetest');

async function testImageBoundary() {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codedog-image-test-'));
    try {
        const invalidPath = path.join(tempDir, safeImageFilename('image/png'));
        await fs.promises.writeFile(invalidPath, '<script>alert(1)</script>');
        const invalidFile = { path: invalidPath, filename: path.basename(invalidPath), originalname: 'payload.html', mimetype: 'image/png' };
        await assert.rejects(
            validateAndReencodeImage(invalidFile, new Set(['image/png'])),
            /Invalid image signature/
        );
        await cleanupUploadedFile(invalidFile);
        assert.strictEqual(fs.existsSync(invalidPath), false, 'rejected upload must be removable');

        const validPath = path.join(tempDir, safeImageFilename('image/png'));
        await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffcc00' } }).png().toFile(validPath);
        const validFile = { path: validPath, filename: path.basename(validPath), originalname: 'unsafe\r\nname.png', mimetype: 'image/png' };
        await validateAndReencodeImage(validFile, new Set(['image/png']));
        const metadata = await sharp(validPath).metadata();
        assert.strictEqual(metadata.format, 'png');
        assert(!/[\r\n]/.test(validFile.originalname), 'outbound filename must not contain CR/LF');
        await cleanupUploadedFile(validFile);
        assert.strictEqual(fs.existsSync(validPath), false, 'accepted upload must be cleaned after forwarding');
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}

async function testSqlInjectionBoundary() {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const Item = sequelize.define('Item', { name: DataTypes.STRING }, { tableName: 'items', timestamps: false });
    try {
        await sequelize.sync();
        const payload = "%' OR 1=1 --";
        await Item.bulkCreate([{ name: payload }, { name: 'ordinary row' }]);
        const rows = await Item.findAll({ where: likeContains(sequelize, ['name'], payload), raw: true });
        assert.deepStrictEqual(rows.map(row => row.name), [payload], 'LIKE input must stay data, not become SQL');
        assert.throws(() => likeContains(sequelize, ['name) OR 1=1 --'], 'x'), /非法列名/);
    } finally {
        await sequelize.close();
    }
}

async function testGeetestFallbackFailsClosed() {
    const geetest = new GeetestLib('test-id', 'test-key');
    geetest.lastRegisterSuccess = false;
    const challenge = 'known-challenge';
    const attackerComputedValidate = require('crypto').createHash('md5').update(challenge).digest('hex');
    const result = await geetest.validate(challenge, attackerComputedValidate, 'anything');
    assert.strictEqual(result.result, 'fail', 'Geetest outage fallback must not accept a client-computable proof');
}

async function main() {
    await testImageBoundary();
    await testSqlInjectionBoundary();
    await testGeetestFallbackFailsClosed();
    console.log('Security boundary smoke tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
