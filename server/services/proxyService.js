const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { SystemConfig } = require('../models');

class ProxyService {
    constructor() {
        this.currentProxy = null;
        this.enabled = false;
        this.poolUrl = null;
        this._defaultProtocol = null;
        this._cache = [];
        this._cacheTime = 0;
        this._cacheTTL = 5 * 60 * 1000;
        this._deadProxies = new Set();
        this._failCount = 0;
        this._maxFailBeforeSwitch = 3;
        this._refreshTimer = null;
        this._refreshInterval = 5 * 60 * 1000;
        this._autoRefreshEnabled = false;
        this._autoRefreshMinutes = 0;
    }

    startAutoRefresh(intervalMs) {
        this.stopAutoRefresh();
        if (!this.poolUrl || !this.enabled) return;
        const ms = intervalMs || (5 * 60 * 1000);
        this._autoRefreshEnabled = true;
        this._refreshInterval = ms;
        this._autoRefreshMinutes = Math.max(1, Math.round(ms / 60000));
        this._refreshTimer = setInterval(async () => {
            try {
                console.log(`[代理] 定时刷新(每${this._autoRefreshMinutes}分钟)...`);
                this._cacheTime = 0;
                const fresh = await this.fetchFromPool();
                let found = false;
                for (const proxy of fresh) {
                    if (this._deadProxies.has(proxy.url)) continue;
                    const result = await this.testProxy(proxy.url);
                    if (result.ok) {
                        await this.saveCurrentProxy(proxy);
                        console.log(`[代理] 定时刷新获取新代理: ${proxy.host}:${proxy.port}`);
                        found = true;
                        break;
                    } else {
                        this._deadProxies.add(proxy.url);
                    }
                }
                if (!found) {
                    console.warn('[代理] 定时刷新: 代理池全部不可用');
                    this._deadProxies.clear();
                }
            } catch (e) {
                console.warn('[代理] 定时刷新失败:', e.message);
            }
        }, this._refreshInterval);
        console.log(`[代理] 自动刷新已启动, 间隔${this._autoRefreshMinutes}分钟`);
    }

    stopAutoRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
        this._autoRefreshEnabled = false;
    }

    async loadConfig() {
        try {
            const keys = ['proxy_enabled', 'proxy_pool_url', 'proxy_current', 'proxy_protocol', 'proxy_auto_refresh'];
            const configs = {};
            await Promise.all(keys.map(async (k) => {
                const cfg = await SystemConfig.findOne({ where: { config_key: k } });
                configs[k] = cfg ? cfg.config_value : null;
            }));
            this.enabled = configs.proxy_enabled === 'true';
            this.poolUrl = configs.proxy_pool_url || null;
            try {
                const parsed = configs.proxy_current ? JSON.parse(configs.proxy_current) : null;
                this.currentProxy = parsed && typeof parsed === 'object' ? parsed : null;
            } catch {
                this.currentProxy = null;
            }
            this._defaultProtocol = configs.proxy_protocol || null;
            const ar = parseInt(configs.proxy_auto_refresh, 10);
            this._autoRefreshMinutes = Number.isFinite(ar) && ar > 0 ? ar : 0;
            if (this.enabled && this.poolUrl && this._autoRefreshMinutes > 0) {
                this.startAutoRefresh(this._autoRefreshMinutes * 60 * 1000);
            } else {
                this.stopAutoRefresh();
            }
        } catch (e) {
            console.warn('[Proxy] 配置加载失败:', e.message);
        }
    }

    async setEnabled(enabled) {
        this.enabled = enabled;
        await SystemConfig.upsert({ config_key: 'proxy_enabled', config_value: String(enabled) });

        if (enabled && this.poolUrl) {
            const arCfg = await SystemConfig.findOne({ where: { config_key: 'proxy_auto_refresh' } });
            const ar = arCfg ? parseInt(arCfg.config_value, 10) : 0;
            if (Number.isFinite(ar) && ar > 0) {
                this._autoRefreshMinutes = ar;
                this.startAutoRefresh(ar * 60 * 1000);
            } else {
                this.stopAutoRefresh();
            }
        } else {
            this.stopAutoRefresh();
        }
    }

    async setPoolUrl(url) {
        this.poolUrl = url || null;
        this._cacheTime = 0;
        if (url) {
            await SystemConfig.upsert({ config_key: 'proxy_pool_url', config_value: url });
        } else {
            await SystemConfig.destroy({ where: { config_key: 'proxy_pool_url' } });
        }
    }

    async setProtocol(protocol) {
        this._defaultProtocol = protocol || null;
        if (protocol) {
            await SystemConfig.upsert({ config_key: 'proxy_protocol', config_value: protocol });
        } else {
            await SystemConfig.destroy({ where: { config_key: 'proxy_protocol' } });
        }
        this._cache = [];
        this._cacheTime = 0;
    }

    async setAutoRefresh(minutes) {
        const ar = parseInt(minutes, 10);
        this._autoRefreshMinutes = Number.isFinite(ar) && ar > 0 ? ar : 0;
        await SystemConfig.upsert({
            config_key: 'proxy_auto_refresh',
            config_value: String(this._autoRefreshMinutes)
        });
        if (this.enabled && this.poolUrl && this._autoRefreshMinutes > 0) {
            this.startAutoRefresh(this._autoRefreshMinutes * 60 * 1000);
        } else {
            this.stopAutoRefresh();
        }
    }

    async saveCurrentProxy(proxy) {
        this.currentProxy = proxy || null;
        if (proxy) {
            await SystemConfig.upsert({ config_key: 'proxy_current', config_value: JSON.stringify(proxy) });
        } else {
            await SystemConfig.destroy({ where: { config_key: 'proxy_current' } });
        }
    }

    _parseProxyString(str, defaultProtocol) {
        if (!str) return null;
        str = str.trim();
        if (!str) return null;

        let url = str;
        if (!str.startsWith('http://') && !str.startsWith('https://') && !str.startsWith('socks')) {
            const proto = defaultProtocol || 'http';
            url = proto + '://' + str;
        }

        try {
            const u = new URL(url);
            return {
                url,
                host: u.hostname,
                port: parseInt(u.port, 10) || (u.protocol === 'https:' ? 443 : 80),
                protocol: u.protocol.replace(':', ''),
                auth: u.username ? { username: u.username, password: u.password } : null
            };
        } catch {
            return null;
        }
    }

    _getAgent(proxyUrl) {
        if (!proxyUrl) return null;
        try {
            if (proxyUrl.startsWith('socks')) {
                return new SocksProxyAgent(proxyUrl);
            }
            return new HttpsProxyAgent(proxyUrl);
        } catch {
            return null;
        }
    }

    _redactProxyUrl(proxyUrl) {
        try {
            const value = new URL(String(proxyUrl || ''));
            if (value.username) value.username = '***';
            if (value.password) value.password = '***';
            for (const key of [...value.searchParams.keys()]) {
                if (/pass|password|token|secret|key|auth/i.test(key)) value.searchParams.set(key, '***');
            }
            return value.toString();
        } catch {
            return '[invalid proxy URL]';
        }
    }

    _extractProxyList(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (typeof data !== 'object') return [];

        if (data.data && Array.isArray(data.data.proxies)) return data.data.proxies;
        if (data.data && Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.proxies)) return data.proxies;
        if (Array.isArray(data.list)) return data.list;
        if (Array.isArray(data.result)) return data.result;
        return [];
    }

    async fetchFromPool(force = false) {
        if (!this.poolUrl) throw new Error('未配置代理池地址');

        const now = Date.now();
        if (!force && this._cache.length > 0 && (now - this._cacheTime) < this._cacheTTL) {
            return this._cache;
        }

        const res = await axios.get(this.poolUrl, { timeout: 15000, responseType: 'text' });
        let data = res.data;

        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                data = data.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            }
        }

        const proxies = this._extractProxyList(data);
        const parsed = [];
        for (const p of proxies) {
            let str = typeof p === 'string'
                ? p
                : (p.proxy || p.url || (p.ip && p.port ? `${p.ip}:${p.port}` : null));
            if (!str) continue;
            const info = this._parseProxyString(str, this._defaultProtocol);
            if (info) parsed.push(info);
        }

        if (parsed.length > 0) {
            this._cache = parsed;
            this._cacheTime = now;
        }

        return parsed;
    }

    pickOne() {
        if (this.currentProxy && !this._deadProxies.has(this.currentProxy.url)) {
            return this.currentProxy;
        }
        const alive = this._cache.filter(p => !this._deadProxies.has(p.url));
        if (alive.length > 0) {
            const idx = Math.floor(Math.random() * alive.length);
            const chosen = alive[idx];
            this.currentProxy = chosen;
            return chosen;
        }
        return null;
    }

    async markDead(proxyUrl) {
        if (!proxyUrl) return;
        this._deadProxies.add(proxyUrl);
        this._failCount++;
        console.warn(`[代理] 标记死亡: ${this._redactProxyUrl(proxyUrl)}, 死亡数: ${this._deadProxies.size}`);
        if (this.currentProxy && this.currentProxy.url === proxyUrl) {
            this.currentProxy = null;
            const next = this.pickOne();
            if (next) {
                await this.saveCurrentProxy(next);
                console.log(`[代理] 自动切换至: ${this._redactProxyUrl(next.url)}`);
            } else {
                await this.saveCurrentProxy(null);
                console.warn('[代理] 代理池全部死亡, 已清空当前代理');
            }
        }
    }

    getAxiosConfigWithRetry(config = {}, maxRetries = 2) {
        return {
            ...this.getAxiosConfig(config),
            __proxyRetry: true,
            __maxRetries: maxRetries,
            __proxyService: this
        };
    }

    async testProxy(proxyUrl) {
        const agent = this._getAgent(proxyUrl);
        const start = Date.now();
        try {
            const res = await axios.get('https://api.codemao.cn/tiger/v3/web/accounts/login', {
                timeout: 10000,
                httpsAgent: agent,
                httpAgent: agent,
                proxy: false,
                validateStatus: () => true
            });
            const latency = Date.now() - start;
            return { ok: true, latency, status: res.status };
        } catch (e) {
            return { ok: false, latency: Date.now() - start, error: e.message };
        }
    }

    async testCurrentProxy() {
        const proxy = this.currentProxy && !this._deadProxies.has(this.currentProxy.url)
            ? this.currentProxy
            : this.pickOne();
        if (!proxy) throw new Error('无可用代理');
        return { proxy: this._redactProxyUrl(proxy.url), ...(await this.testProxy(proxy.url)) };
    }

    getAxiosConfig(config = {}) {
        if (!this.enabled) return config;
        const proxy = this.pickOne();
        if (!proxy) return config;
        const agent = this._getAgent(proxy.url);
        if (!agent) return config;
        return {
            ...config,
            httpsAgent: agent,
            httpAgent: agent,
            proxy: false,
            __proxyUrl: proxy.url
        };
    }

    async refreshFromPool() {
        const proxies = await this.fetchFromPool(true);
        if (proxies.length === 0) throw new Error('代理池返回为空');

        for (const proxy of proxies.slice(0, 5)) {
            if (this._deadProxies.has(proxy.url)) continue;
            const result = await this.testProxy(proxy.url);
            if (result.ok) {
                await this.saveCurrentProxy(proxy);
                return { ...proxy, ...result };
            }
            this._deadProxies.add(proxy.url);
        }
        throw new Error('代理池中无可用代理');
    }

    getStatus() {
        return {
            enabled: this.enabled,
            poolUrl: this.poolUrl,
            protocol: this._defaultProtocol || '',
            autoRefresh: this._autoRefreshMinutes || 0,
            autoRefreshRunning: this._autoRefreshEnabled,
            currentProxy: this.currentProxy ? this._redactProxyUrl(this.currentProxy.url) : null,
            cacheCount: this._cache.length,
            deadCount: this._deadProxies.size
        };
    }
}

module.exports = new ProxyService();
