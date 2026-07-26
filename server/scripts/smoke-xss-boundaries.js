const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeHttpUrl, normalizePublicHttpUrl } = require('../utils/urlSafety');
const { getMaintenancePage } = require('../middleware/maintenance');

assert.strictEqual(normalizeHttpUrl('javascript:alert(1)').ok, false);
assert.strictEqual(normalizeHttpUrl('data:text/html,<script>alert(1)</script>').ok, false);
assert.strictEqual(normalizeHttpUrl('https://user:pass@example.com/').ok, false);
assert.strictEqual(normalizeHttpUrl('https://example.com/path').value, 'https://example.com/path');
assert.strictEqual(normalizeHttpUrl('http://example.com/path').ok, true);
assert.deepStrictEqual(normalizeHttpUrl(''), { ok: true, value: null });

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
assert.strictEqual(normalizePublicHttpUrl('http://example.com').ok, false);
assert.strictEqual(normalizePublicHttpUrl('https://example.com').ok, true);
process.env.NODE_ENV = 'development';
assert.strictEqual(normalizePublicHttpUrl('http://localhost:3000').ok, true);
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;

const maintenanceHtml = getMaintenancePage('</p><img src=x onerror=alert(1)><script>alert(2)</script>');
assert(!maintenanceHtml.includes('<img src=x'));
assert(!maintenanceHtml.includes('<script>'));
assert(!maintenanceHtml.includes('javascript:'));
assert(maintenanceHtml.includes('&lt;script&gt;alert(2)&lt;&#x2F;script&gt;'));
assert(getMaintenancePage('正常维护提示').includes('正常维护提示'));

const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const headerMiddleware = appSource.indexOf('setSecurityHeaders(res);');
const maintenanceMount = appSource.indexOf('app.use(maintenanceMiddleware);');
assert(headerMiddleware >= 0 && maintenanceMount > headerMiddleware);

const staticMaintenance = fs.readFileSync(path.join(__dirname, '../../maintenance/index.html'), 'utf8');
assert(!staticMaintenance.includes('<script>'));
assert(staticMaintenance.includes('http-equiv="refresh"'));

const maintenanceServer = fs.readFileSync(path.join(__dirname, '../../scripts/maintenance-server.sh'), 'utf8');
assert(!maintenanceServer.includes('<script>'));
assert(maintenanceServer.includes("Content-Security-Policy"));

const developerSource = fs.readFileSync(path.join(__dirname, '../controllers/developerController.js'), 'utf8');
assert(developerSource.includes("normalizeHttpUrl"));
assert(developerSource.includes("validateDeveloperUrl(homepage_url"));
assert(developerSource.includes("validateDeveloperUrl(logo_url"));

const adminSource = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
assert(adminSource.includes('轮播图片${imageResult.msg}'));
assert(adminSource.includes('轮播链接${linkResult.msg}'));

console.log('XSS boundary smoke checks passed.');
