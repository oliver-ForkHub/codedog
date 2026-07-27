const crypto = require('crypto');

const baseUrl = (process.env.SECURITY_TEST_BASE_URL || process.argv[2] || 'http://127.0.0.1:3200').replace(/\/$/, '');
const insecureJwtSecret = 'development-secret-key-do-not-use-in-production';
const failures = [];
const results = [];

function base64url(input) {
    const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return bytes.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(payload, secret = insecureJwtSecret) {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const unsigned = `${header}.${body}`;
    const signature = base64url(crypto.createHmac('sha256', secret).update(unsigned).digest());
    return `${unsigned}.${signature}`;
}

function forgedToken(role = 'superadmin', id = 1) {
    const now = Math.floor(Date.now() / 1000);
    return signJwt({
        id,
        username: 'attacker',
        role,
        iat: now,
        exp: now + 3600
    });
}

async function request(name, path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body !== undefined && typeof body !== 'string' && !(body instanceof Buffer)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        body = JSON.stringify(body);
    }

    const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body,
        redirect: 'manual'
    });

    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (_) {
        json = null;
    }

    return {
        name,
        url,
        status: response.status,
        headers: response.headers,
        text,
        json
    };
}

function record(name, passed, detail) {
    results.push({ name, passed, detail });
    if (!passed) {
        failures.push(`${name}: ${detail}`);
    }
}

function hasStackLeak(text) {
    return /SyntaxError|Sequelize|node_modules|at\s+\S+\s+\(|JWT_SECRET|development-secret-key/i.test(text || '');
}

async function main() {
    const forgedAdmin = forgedToken('superadmin', 1);
    const forgedMissingUser = forgedToken('superadmin', 999999);
    const forgedUser = forgedToken('user', 1);

    const health = await request('health', '/api/health');
    record('health endpoint is alive', health.status === 200, `status=${health.status}`);

    const root = await request('root security headers', '/');
    record('Express fingerprint is hidden', !root.headers.has('x-powered-by'), `x-powered-by=${root.headers.get('x-powered-by')}`);
    record('nosniff header is present', root.headers.get('x-content-type-options') === 'nosniff', `header=${root.headers.get('x-content-type-options')}`);
    record('frame protection is present', root.headers.get('x-frame-options') === 'DENY', `header=${root.headers.get('x-frame-options')}`);
    record('CSP frame-ancestors blocks embedding', /frame-ancestors 'none'/.test(root.headers.get('content-security-policy') || ''), `csp=${root.headers.get('content-security-policy')}`);
    record('referrer policy is present', !!root.headers.get('referrer-policy'), `header=${root.headers.get('referrer-policy')}`);

    const evilCors = await request('evil cors', '/api/health', {
        headers: { Origin: 'http://evil.example' }
    });
    record('evil Origin does not trigger 5xx', evilCors.status < 500, `status=${evilCors.status}`);
    record('evil Origin is not allowed by CORS', !evilCors.headers.get('access-control-allow-origin'), `acao=${evilCors.headers.get('access-control-allow-origin')}`);

    const evilPost = await request('evil origin post', '/api/posts', {
        method: 'POST',
        headers: { Origin: 'http://evil.example' },
        body: {
            title: 'cross-site post attempt',
            content: 'should not enter business logic'
        }
    });
    record('evil Origin unsafe request is blocked before business logic', evilPost.status === 403, `status=${evilPost.status}; body=${evilPost.text.slice(0, 120)}`);

    const allowedCors = await request('allowed cors', '/api/health', {
        headers: { Origin: 'http://127.0.0.1:8080' }
    });
    record('local frontend Origin is allowed', allowedCors.headers.get('access-control-allow-origin') === 'http://127.0.0.1:8080', `acao=${allowedCors.headers.get('access-control-allow-origin')}`);

    const evilPreflight = await request('evil preflight', '/api/posts', {
        method: 'OPTIONS',
        headers: {
            Origin: 'http://evil.example',
            'Access-Control-Request-Method': 'POST'
        }
    });
    record('evil CORS preflight is not allowed', !evilPreflight.headers.get('access-control-allow-origin'), `status=${evilPreflight.status}; acao=${evilPreflight.headers.get('access-control-allow-origin')}`);

    const disguisedLocalOrigin = await request('disguised local origin post', '/api/posts', {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:8080.evil.example' },
        body: { title: 'origin trick', content: 'should be blocked' }
    });
    record('lookalike localhost Origin is blocked', disguisedLocalOrigin.status === 403, `status=${disguisedLocalOrigin.status}`);

    const nullOriginPost = await request('null origin post', '/api/posts', {
        method: 'POST',
        headers: { Origin: 'null' },
        body: { title: 'file origin trick', content: 'should be blocked' }
    });
    record('null Origin unsafe request is blocked', nullOriginPost.status === 403, `status=${nullOriginPost.status}`);

    for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const blocked = await request(`evil origin ${method}`, '/api/posts/1', {
            method,
            headers: { Origin: 'http://evil.example' },
            body: method === 'DELETE' ? undefined : { title: 'unsafe method probe' }
        });
        record(`evil Origin ${method} is blocked before routes`, blocked.status === 403, `status=${blocked.status}`);
    }

    const noAuthAdmin = await request('unauth admin', '/api/admin/stats');
    record('admin requires auth', noAuthAdmin.status === 401, `status=${noAuthAdmin.status}`);

    const malformedBearer = await request('malformed bearer', '/api/admin/stats', {
        headers: { Authorization: 'Bearer' }
    });
    record('malformed Authorization is rejected', malformedBearer.status === 401, `status=${malformedBearer.status}`);

    const forgedAdminStats = await request('forged default admin jwt', '/api/admin/stats', {
        headers: { Authorization: `Bearer ${forgedAdmin}` }
    });
    record('old default-secret admin JWT cannot access admin stats', forgedAdminStats.status !== 200, `status=${forgedAdminStats.status}`);

    const forgedMissingUserStats = await request('forged missing user jwt', '/api/admin/stats', {
        headers: { Authorization: `Bearer ${forgedMissingUser}` }
    });
    record('forged JWT for missing user is rejected', forgedMissingUserStats.status !== 200, `status=${forgedMissingUserStats.status}`);

    const forgedMe = await request('forged user me', '/api/users/me', {
        headers: { Authorization: `Bearer ${forgedUser}` }
    });
    record('old default-secret user JWT cannot access profile', forgedMe.status !== 200, `status=${forgedMe.status}`);

    const forgedMigration = await request('forged db migration', '/api/admin/db-migration/stats?dbType=sqlite&path=./data/database.sqlite', {
        headers: { Authorization: `Bearer ${forgedAdmin}` }
    });
    record('old default-secret JWT cannot access db migration', forgedMigration.status !== 200, `status=${forgedMigration.status}`);

    const badJson = await request('malformed json', '/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"username":'
    });
    record('malformed JSON returns 400', badJson.status === 400, `status=${badJson.status}`);
    record('malformed JSON does not leak stack', !hasStackLeak(badJson.text), badJson.text.slice(0, 160));

    const hugeBody = await request('huge json body', '/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a'.repeat(300000), password: 'x' })
    });
    record('oversized body is rejected', hugeBody.status === 413, `status=${hugeBody.status}`);

    const unsupportedCharset = await request('unsupported json charset', '/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-16' },
        body: '{}'
    });
    record('unsupported JSON charset does not return 5xx', unsupportedCharset.status >= 400 && unsupportedCharset.status < 500, `status=${unsupportedCharset.status}; body=${unsupportedCharset.text.slice(0, 120)}`);
    record('unsupported JSON charset does not leak stack', !hasStackLeak(unsupportedCharset.text), unsupportedCharset.text.slice(0, 160));

    const textPlainLogin = await request('text/plain login body', '/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ username: 'plain-body-attacker', password: 'wrong-password' })
    });
    record('text/plain JSON-shaped login body does not return 5xx', textPlainLogin.status >= 400 && textPlainLogin.status < 500, `status=${textPlainLogin.status}; body=${textPlainLogin.text.slice(0, 120)}`);
    record('text/plain login body does not leak stack', !hasStackLeak(textPlainLogin.text), textPlainLogin.text.slice(0, 160));

    let loginRateLimited = null;
    for (let index = 0; index < 11; index += 1) {
        loginRateLimited = await request(`login brute force ${index + 1}`, '/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ username: 'brute-force-victim', password: 'wrong-password' })
        });
    }
    record('repeated login attempts are rate-limited', loginRateLimited.status === 429, `status=${loginRateLimited.status}; body=${loginRateLimited.text.slice(0, 120)}`);

    const worksClamp = await request('works clamp', '/api/works?page=0&pageSize=9999');
    record('works pagination clamps page/pageSize', worksClamp.json?.data?.page === 1 && worksClamp.json?.data?.pageSize === 100, `page=${worksClamp.json?.data?.page}; pageSize=${worksClamp.json?.data?.pageSize}`);

    const postsClamp = await request('posts clamp', '/api/posts?page=-99&pageSize=9999');
    record('posts pagination clamps page/pageSize', postsClamp.json?.data?.page === 1 && postsClamp.json?.data?.pageSize === 100, `page=${postsClamp.json?.data?.page}; pageSize=${postsClamp.json?.data?.pageSize}`);

    const sqliKeyword = await request('sql-ish keyword does not crash', "/api/works?keyword=%27%20OR%201%3D1%20--&page=1&pageSize=20");
    record('SQL-ish keyword does not return 5xx', sqliKeyword.status < 500, `status=${sqliKeyword.status}`);

    const xssKeyword = await request('xss-ish keyword does not crash', '/api/posts?keyword=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    record('XSS-ish keyword does not return 5xx', xssKeyword.status < 500, `status=${xssKeyword.status}`);

    const unauthCreatePost = await request('unauth xss post', '/api/posts', {
        method: 'POST',
        body: {
            title: '<img src=x onerror=alert(1)>',
            content: '<script>alert(1)</script>',
            user_id: 999
        }
    });
    record('unauthenticated content creation is blocked', unauthCreatePost.status === 401, `status=${unauthCreatePost.status}`);

    const protectedRoutes = [
        '/api/works/my',
        '/api/posts/my/list',
        '/api/notifications/unread-count',
        '/api/favorites/my',
        '/api/follows/check/1',
        '/api/reports/my'
    ];
    for (const path of protectedRoutes) {
        const protectedResponse = await request(`protected route ${path}`, path);
        record(`protected route requires auth: ${path}`, protectedResponse.status === 401, `status=${protectedResponse.status}; body=${protectedResponse.text.slice(0, 100)}`);
    }

    const invalidCodemaoRead = await request('invalid codemao work id', '/api/works/codemao/not-a-number%3Cscript%3E');
    record('invalid Codemao work id remains read-only and does not import', invalidCodemaoRead.status === 404, `status=${invalidCodemaoRead.status}; body=${invalidCodemaoRead.text.slice(0, 120)}`);

    const unauthCodemaoImport = await request('unauth codemao import', '/api/works/import/1', { method: 'POST' });
    record('anonymous Codemao import is blocked before external fetch', unauthCodemaoImport.status === 401, `status=${unauthCodemaoImport.status}; body=${unauthCodemaoImport.text.slice(0, 120)}`);

    const traversal = await request('uploads traversal', '/uploads/avatars/%2e%2e/%2e%2e/server/app.js');
    record('uploads traversal does not leak source', !/require\('dotenv'\)|const app = express|JWT_SECRET/.test(traversal.text), traversal.text.slice(0, 120));

    const envTraversal = await request('uploads env traversal', '/uploads/%2e%2e/.env');
    record('uploads traversal does not leak env files', !/JWT_SECRET|SESSION_SECRET|DB_PASSWORD|MYSQL_ROOT_PASSWORD/i.test(envTraversal.text), envTraversal.text.slice(0, 120));

    const migrationTraversal = await request('forged db migration traversal', '/api/admin/db-migration/stats?dbType=sqlite&path=..%2F..%2Fserver%2Fapp.js', {
        headers: { Authorization: `Bearer ${forgedAdmin}` }
    });
    record('forged db migration traversal is not accepted', migrationTraversal.status !== 200, `status=${migrationTraversal.status}; body=${migrationTraversal.text.slice(0, 120)}`);
    record('db migration traversal response does not leak stack', !hasStackLeak(migrationTraversal.text), migrationTraversal.text.slice(0, 160));

    const unknownApi = await request('unknown api', '/api/does-not-exist');
    record('unknown API returns JSON 404', unknownApi.status === 404 && unknownApi.json?.code === 404, `status=${unknownApi.status}; body=${unknownApi.text.slice(0, 120)}`);

    for (const result of results) {
        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name} - ${result.detail}`);
    }

    if (failures.length > 0) {
        console.error('\nSecurity attack test failures:');
        for (const failure of failures) {
            console.error(`- ${failure}`);
        }
        process.exit(1);
    }

    console.log(`\nSecurity attack tests passed against ${baseUrl}.`);
}

main().catch(error => {
    console.error('Security attack test crashed:', error);
    process.exit(1);
});
