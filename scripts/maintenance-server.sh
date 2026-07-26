#!/bin/bash
# Codedog maintenance page server for host (outside Docker)
# Serves a static maintenance page on port 3001 during updates
# Works alongside the host's existing reverse proxy

PORT=3001
PID_FILE="/tmp/codedog-maintenance.pid"
PORT_LOCK="/tmp/codedog-maintenance.portlock"
MAINTENANCE_DIR="$(cd "$(dirname "$0")/../maintenance" && pwd)"
LOG_FILE="/tmp/codedog-maintenance.log"

_port_in_use() {
    if command -v ss >/dev/null 2>&1; then
        ss -H -ltn "sport = :$PORT" 2>/dev/null | grep -q .
    elif command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    else
        return 1
    fi
}

_start() {
    # Check python3 available
    if ! command -v python3 >/dev/null 2>&1; then
        echo "[!] python3 not found, cannot start maintenance server"
        return 1
    fi

    # Already running?
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "[OK] Maintenance server already running (PID $(cat "$PID_FILE"))"
        return 0
    fi

    # Port in use? (codedog might still be holding it)
    # Docker may need a few seconds to release the host port after `down`.
    for i in $(seq 1 15); do
        _port_in_use || break
        [ "$i" -eq 15 ] && {
            echo "[!] Port $PORT is still in use after 15 seconds"
            command -v ss >/dev/null 2>&1 && ss -ltnp "sport = :$PORT" 2>/dev/null || true
            return 1
        }
        sleep 1
    done

    # Create a minimal index.html if the maintenance dir doesn't have one
    if [ ! -f "$MAINTENANCE_DIR/index.html" ]; then
        mkdir -p "$MAINTENANCE_DIR"
        cat > "$MAINTENANCE_DIR/index.html" <<'HTMLEOF'
<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>系统维护中 - 编程狗</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff}
.box{text-align:center;padding:40px;max-width:480px}
.icon{font-size:80px;margin-bottom:24px;animation:spin 3s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
h1{font-size:28px;margin-bottom:16px}.msg{font-size:16px;opacity:.9;margin-bottom:32px;line-height:1.6}
.bar{width:200px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;margin:0 auto;overflow:hidden}
.bar i{display:block;width:30%;height:100%;background:#fff;border-radius:2px;animation:progress 2s ease-in-out infinite}
@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
.tip{margin-top:24px;font-size:14px;opacity:.7}
</style></head><body>
<div class="box">
<div class="icon">&#9881;</div><h1>系统维护中</h1>
<p class="msg">系统正在升级维护，请稍后再试...<br>预计很快完成，感谢您的耐心等待</p>
<div class="bar"><i></i></div><p class="tip">页面将自动刷新</p>
</div>
</body></html>
HTMLEOF
    fi

    # Start threaded Python HTTP server on the maintenance dir
    cd "$MAINTENANCE_DIR" || exit 1
    # Use ThreadingHTTPServer for concurrent request handling
    python3 -c "
import http.server, socketserver, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', \"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'\")
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()
    def log_message(self, fmt, *args): pass  # suppress logs
class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
server = Server(('0.0.0.0', $PORT), H)
os.chdir('$MAINTENANCE_DIR')
server.serve_forever()
" >"$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"

    # Verify it actually started
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        echo "[OK] Maintenance server started (PID $pid, port $PORT)"
    else
        echo "[!] Failed to start maintenance server"
        if [ -s "$LOG_FILE" ]; then
            echo "--- $LOG_FILE ---"
            tail -20 "$LOG_FILE"
            echo "-----------------"
        fi
        rm -f "$PID_FILE"
        return 1
    fi
}

_stop() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            # Wait for process to exit
            for i in $(seq 1 5); do
                kill -0 "$pid" 2>/dev/null || break
                sleep 0.5
            done
            kill -9 "$pid" 2>/dev/null  # force kill if still alive
            echo "[OK] Maintenance server stopped (PID $pid)"
        fi
        rm -f "$PID_FILE"
    else
        echo "[!] No PID file found for maintenance server"
    fi
}

_status() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "[OK] Maintenance server running (PID $(cat "$PID_FILE"))"
        return 0
    else
        echo "[--] Maintenance server not running"
        return 1
    fi
}

case "${1}" in
    start)  _start ;;
    stop)   _stop ;;
    status) _status ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
