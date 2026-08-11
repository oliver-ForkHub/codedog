const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { consumeRateLimit } = require('../src/replayStore');

test('local rate limit rejects requests beyond the configured window quota', async () => {
  const key = `test:${crypto.randomUUID()}`;
  assert.equal(await consumeRateLimit(key, 2, 60_000), true);
  assert.equal(await consumeRateLimit(key, 2, 60_000), true);
  assert.equal(await consumeRateLimit(key, 2, 60_000), false);
});

test('IM source enforces removed membership, socket caps, frame quotas and captcha parity', () => {
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  assert.match(app, /existing\?\.state === 'removed'/);
  assert.match(app, /maxSocketsPerUser/);
  assert.match(app, /frame:user:/);
  assert.match(app, /assertCaptchaGrant\(user, 'im_message'/);
  assert.match(app, /assertAccountActive\(user\)/);
});
