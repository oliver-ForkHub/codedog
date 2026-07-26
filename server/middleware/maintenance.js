/**
 * Maintenance mode middleware
 * Activation: set env MAINTENANCE_MODE=true OR create server/.maintenance file
 * The .maintenance file can contain a custom message (optional).
 */
const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('../utils/security');

const MAINTENANCE_FILE = path.join(__dirname, '..', '.maintenance');

function isMaintenanceMode() {
    if (process.env.MAINTENANCE_MODE === 'true') return true;
    return fs.existsSync(MAINTENANCE_FILE);
}

function getMaintenanceMessage() {
    try {
        if (fs.existsSync(MAINTENANCE_FILE)) {
            const content = fs.readFileSync(MAINTENANCE_FILE, 'utf8').trim();
            if (content) return content;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function maintenanceMiddleware(req, res, next) {
    // API requests get a JSON 503 so clients can detect maintenance
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        res.set('Retry-After', '120');
        return res.status(503).json({
            code: 503,
            msg: '系统正在升级维护，请稍后再试',
            data: null,
            errorCode: 'maintenance_mode'
        });
    }

    // Serve the maintenance HTML page for all other requests (SPA routes, static files)
    const html = getMaintenancePage();
    res.set('Retry-After', '120');
    res.status(503).send(html);
}

function getMaintenancePage(customMessage = getMaintenanceMessage()) {
    const customMsg = customMessage;
    const message = escapeHtml(customMsg || '系统正在升级维护，请稍后再试...');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>系统维护中 - 编程狗</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .container {
    text-align: center;
    padding: 40px;
    max-width: 480px;
  }
  .icon {
    font-size: 80px;
    margin-bottom: 24px;
    animation: spin 3s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  h1 { font-size: 28px; margin-bottom: 16px; font-weight: 600; }
  .message {
    font-size: 16px;
    line-height: 1.6;
    opacity: 0.9;
    margin-bottom: 32px;
  }
  .progress {
    width: 200px;
    height: 4px;
    background: rgba(255,255,255,0.3);
    border-radius: 2px;
    margin: 0 auto;
    overflow: hidden;
  }
  .progress-bar {
    width: 30%;
    height: 100%;
    background: #fff;
    border-radius: 2px;
    animation: progress 2s ease-in-out infinite;
  }
  @keyframes progress {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }
  .retry {
    margin-top: 24px;
    font-size: 14px;
    opacity: 0.7;
  }
  .retry a {
    color: #fff;
    text-decoration: underline;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="icon">&#9881;</div>
    <h1>系统维护中</h1>
    <p class="message">${message}</p>
    <div class="progress"><div class="progress-bar"></div></div>
    <p class="retry">预计很快完成，请 <a href="/">点击刷新</a> 重试</p>
  </div>
</body>
</html>`;
}

module.exports = { isMaintenanceMode, maintenanceMiddleware, getMaintenancePage, MAINTENANCE_FILE };
