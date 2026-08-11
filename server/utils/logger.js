/**
 * 异步文件日志: 将所有日志写入 data/logs/app.log
 * 便于管理员在后台"实时日志"查看,同时保留 Docker 容器内所有输出
 */

const fs = require('fs');
const path = require('path');
const { createReadStream } = require('fs');
const readline = require('readline');

const LOG_DIR = path.join(__dirname, '../../.data/logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB 自动轮转

// 写队列:顺序写入,避免高并发下内容错乱
let writeQueue = Promise.resolve();
const nativeConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};
let consoleCaptureInstalled = false;

function sanitizeSecrets(value) {
    return String(value ?? '')
        .replace(/\b(https?|socks5h?|socks4):\/\/([^\s/@:]+):([^\s/@]+)@/gi, '$1://***:***@')
        .replace(/([?&](?:pass(?:word)?|token|secret|api[_-]?key|auth)=)[^&#\s]*/gi, '$1***');
}

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function formatLine(level, tag, message) {
    const time = new Date().toISOString();
    return `[${time}] [${level}] [${tag}] ${message}`;
}

function enqueueWrite(level, tag, message) {
    // 入队异步写入,不阻塞事件循环
    writeQueue = writeQueue.then(() => doWrite(level, tag, sanitizeSecrets(message))).catch((e) => {
        nativeConsole.error('[logger] write failed:', e.message);
    });
}

function doWrite(level, tag, message) {
    return new Promise((resolve) => {
        try {
            ensureLogDir();
            const line = formatLine(level, tag, message) + '\n';

            // 简单轮转:超过 MAX_LOG_SIZE 则重命名为 .bak 并新建
            try {
                const stat = fs.statSync(LOG_FILE);
                if (stat.size > MAX_LOG_SIZE) {
                    fs.renameSync(LOG_FILE, LOG_FILE + '.bak');
                }
            } catch (e) {
                // 文件不存在,首次写入,忽略
            }

            // 修复: 异步写入,不阻塞事件循环
            fs.appendFile(LOG_FILE, line, { encoding: 'utf8' }, (err) => {
              if (err) nativeConsole.error('[logger] write error:', err.message)
              resolve()
            });
        } catch (e) {
            // 日志写入失败不应影响业务
            resolve();
        }
    });
}

// 同时输出到原始 console
function log(tag, message) {
    enqueueWrite('INFO', tag, message);
    nativeConsole.log(`[${tag}]`, message);
}

function warn(tag, message) {
    enqueueWrite('WARN', tag, message);
    nativeConsole.warn(`[${tag}]`, message);
}

function error(tag, message) {
    enqueueWrite('ERROR', tag, message);
    nativeConsole.error(`[${tag}]`, message);
}

function stringifyArg(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
}

/** 捕获全应用 console 输出，同时保留原 stdout/stderr 行为。 */
function installConsoleCapture() {
    if (consoleCaptureInstalled) return;
    consoleCaptureInstalled = true;
    const levels = { log: 'INFO', info: 'INFO', warn: 'WARN', error: 'ERROR' };
    for (const [method, level] of Object.entries(levels)) {
        const output = method === 'error' ? nativeConsole.error : (method === 'warn' ? nativeConsole.warn : nativeConsole.log);
        console[method] = (...args) => {
            enqueueWrite(level, 'app', args.map(stringifyArg).join(' '));
            output(...args);
        };
    }
}

// 高效尾部读取: 从文件末尾读取(大文件友好,异步 Promise)
function getRecentLogs(limit = 200) {
    return new Promise((resolve) => {
        try {
            ensureLogDir();
            if (!fs.existsSync(LOG_FILE)) { resolve([]); return; }

            // 获取文件大小,从末尾往前读取足够的数据
            const stat = fs.statSync(LOG_FILE);
            const chunkSize = Math.min(limit * 200, stat.size);
            const startPos = Math.max(0, stat.size - chunkSize);

            const stream = createReadStream(LOG_FILE, { encoding: 'utf8', start: startPos });
            let remainder = '';
            const lines = [];

            let firstChunk = true;
            stream.on('data', (chunk) => {
                const data = remainder + chunk;
                const parts = data.split('\n');
                remainder = parts.pop();
                if (firstChunk && startPos > 0) parts.shift();
                firstChunk = false;
                for (const line of parts) {
                    if (line.trim()) lines.push(line);
                }
            });

            stream.on('end', () => {
                if (remainder.trim()) lines.push(remainder);
                resolve(lines.slice(-limit).map(sanitizeSecrets));
            });

            stream.on('error', () => resolve([]));
        } catch (e) {
            resolve([]);
        }
    });
}

// 同步版本的 getRecentLogs(兼容旧代码)
function getRecentLogsSync(limit = 200) {
    try {
        ensureLogDir();
        if (!fs.existsSync(LOG_FILE)) return [];
        const stat = fs.statSync(LOG_FILE);
        const chunkSize = Math.min(limit * 200, stat.size);
        const startPos = Math.max(0, stat.size - chunkSize);
        const buf = Buffer.alloc(chunkSize);
        const fd = fs.openSync(LOG_FILE, 'r');
        fs.readSync(fd, buf, 0, chunkSize, startPos);
        fs.closeSync(fd);
        const data = buf.toString('utf8');
        const lines = data.split('\n').filter(l => l.trim());
        return lines.slice(-limit).map(sanitizeSecrets);
    } catch (e) {
        return [];
    }
}

// P3-2: 时间戳轮转(避免固定 .bak 覆盖)
function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stat = fs.statSync(LOG_FILE);
        if (stat.size <= MAX_LOG_SIZE) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedName = `${LOG_FILE}.${timestamp}.bak`;

        // 删除旧的时间戳备份(只保留最近 3 个)
        const dir = path.dirname(LOG_FILE);
        const oldBackups = fs.readdirSync(dir)
            .filter(f => f.startsWith('app.log.') && f.endsWith('.bak'))
            .sort()
            .reverse();
        oldBackups.slice(3).forEach(f => {
            try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
        });

        fs.renameSync(LOG_FILE, rotatedName);
    } catch (e) {
        // 轮转失败不影响业务
    }
}

module.exports = { log, warn, error, getRecentLogs, writeLog: enqueueWrite, installConsoleCapture, sanitizeSecrets, LOG_FILE };
