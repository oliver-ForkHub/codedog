const test = require('node:test');
const assert = require('node:assert/strict');

test('IM server modules load', () => {
  const api = require('../src/app');
  assert.equal(typeof api.start, 'function');
  assert.ok(api.app);
});

test('SSO user profiles are stored and refreshed', async () => {
  const { UserProfile } = require('../src/database');
  await UserProfile.upsert({ id: 81, username: 'codedog_81', nickname: '编程狗用户', avatar: 'https://example.test/avatar.png', codemao_user_id: '970000081', role: 'user' });
  await UserProfile.upsert({ id: 81, username: 'codedog_81', nickname: '新昵称', avatar: 'https://example.test/new.png', codemao_user_id: '970000081', role: 'user' });
  const user = await UserProfile.findByPk(81);
  assert.equal(user.nickname, '新昵称');
  assert.equal(user.avatar, 'https://example.test/new.png');
  assert.equal(user.codemao_user_id, '970000081');
});

test('SSO network binding accepts safe address rotation inside one network', () => {
  const { _test } = require('../src/auth');
  const nonce = 'network-binding-test';
  const payload = {
    binding_nonce: nonce,
    client_ip_hashes: [_test.boundHash(nonce, '203.0.113.21')],
    client_network_hashes: [_test.boundHash(nonce, _test.networkKey('203.0.113.21'))],
    browser_hash: _test.boundHash(nonce, 'codedog-browser')
  };
  const sameNetwork = _test.contextMatchResult({
    headers: { 'cf-connecting-ip': '203.0.113.99', 'user-agent': 'codedog-browser' },
    socket: {}
  }, payload);
  assert.equal(sameNetwork.matches, true);
  assert.equal(sameNetwork.matchType, 'network');

  const otherNetwork = _test.contextMatchResult({
    headers: { 'cf-connecting-ip': '198.51.100.99', 'user-agent': 'codedog-browser' },
    socket: {}
  }, payload);
  assert.equal(otherNetwork.matches, false);
});

test('SSO network binding reads Cloudflare original IPv6 identity', () => {
  const { _test } = require('../src/auth');
  const nonce = 'ipv6-binding-test';
  const ipv6 = '2001:db8:1234:5678::10';
  const payload = {
    binding_nonce: nonce,
    client_ip_hashes: [],
    client_network_hashes: [_test.boundHash(nonce, _test.networkKey(ipv6))],
    browser_hash: _test.boundHash(nonce, 'codedog-browser')
  };
  const result = _test.contextMatchResult({
    headers: { 'cf-connecting-ip': '192.0.2.44', 'cf-connecting-ipv6': '2001:db8:1234:5678::99', 'user-agent': 'codedog-browser' },
    socket: {}
  }, payload);
  assert.equal(result.matches, true);
  assert.equal(result.matchType, 'network');
});
