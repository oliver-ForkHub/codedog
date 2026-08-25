#!/bin/bash

# CodeDog 管理工具箱
VERSION="1.0.9"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

DATA_PATH="$SCRIPT_DIR/data"
UPLOADS_PATH="$SCRIPT_DIR/uploads"
HOST_DB_PATH="$DATA_PATH/database.sqlite"
LEGACY_DB_PATH="$SCRIPT_DIR/server/data/database.sqlite"
CONTAINER_DB_PATH="/app/server/data/database.sqlite"

get_env_value() {
    local key="$1"
    if [ -f "$SCRIPT_DIR/.env" ]; then
        grep -E "^${key}=" "$SCRIPT_DIR/.env" | tail -1 | cut -d= -f2-
    fi
}

get_db_type() {
    local value
    value=$(get_env_value "DB_TYPE")
    echo "${value:-sqlite}"
}

show_database_status() {
    local db_type
    db_type=$(get_db_type)

    if [ "$db_type" = "mysql" ]; then
        echo "数据库: MySQL（使用外部数据库，不检查 SQLite 文件）"
        return
    fi

    if [ -f "$HOST_DB_PATH" ]; then
        echo "数据库: 存在 ($HOST_DB_PATH)"
        ls -lh "$HOST_DB_PATH" 2>/dev/null || true
        return
    fi

    if [ -f "$LEGACY_DB_PATH" ]; then
        echo "数据库: 存在（旧路径：$LEGACY_DB_PATH）"
        echo "提示：当前 Docker 部署推荐使用 $HOST_DB_PATH"
        ls -lh "$LEGACY_DB_PATH" 2>/dev/null || true
        return
    fi

    if $COMPOSE_CMD exec -T codedog test -f "$CONTAINER_DB_PATH" >/dev/null 2>&1; then
        echo "数据库: 存在（容器内：$CONTAINER_DB_PATH）"
        echo "提示：宿主机未在 $HOST_DB_PATH 看到数据库，请检查 docker-compose.yml 的 data 挂载。"
        $COMPOSE_CMD exec -T codedog ls -lh "$CONTAINER_DB_PATH" 2>/dev/null || true
        return
    fi

    echo "数据库: 不存在"
    echo "已检查："
    echo "  - 宿主机新路径: $HOST_DB_PATH"
    echo "  - 宿主机旧路径: $LEGACY_DB_PATH"
    echo "  - 容器内路径: $CONTAINER_DB_PATH"
    echo ""
    echo "容器内数据目录："
    $COMPOSE_CMD exec -T codedog ls -lah /app/server/data 2>/dev/null || true
}

main_loop() {
    while true; do
        show_menu
    done
}

show_menu() {
    clear
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}   CodeDog 管理工具箱 v${VERSION}${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
    echo "  1) 查看系统状态"
    echo "  2) 查看服务日志"
    echo "  3) 检查更新"
    echo "  4) 执行更新"
    echo "  5) 修复问题"
    echo "  6) 数据库管理"
    echo "  7) 敏感词管理"
    echo "  8) 系统配置"
    echo "  9) 验证码开关 (hCaptcha / 极验)"
    echo "  0) 退出"
    echo ""
    read -p "请选择操作 [0-9]: " choice
    echo ""
    case $choice in
        1) show_status ;;
        2) show_logs ;;
        3) check_update ;;
        4) do_update ;;
        5) do_fix ;;
        6) do_database ;;
        7) do_sensitive ;;
        8) do_config ;;
        9) do_captcha_toggle ;;
        0) exit 0 ;;
        *) echo "无效选项"; sleep 1 ;;
    esac
}

wait_enter() {
    echo ""
    read -p "按回车返回菜单..."
}

show_status() {
    echo "=== 系统状态 ==="
    echo ""
    docker --version > /dev/null 2>&1 && echo "Docker: 已安装" || echo "Docker: 未安装"

    echo ""
    echo "容器状态:"
    docker ps --filter "name=codedog" 2>/dev/null || true

    echo ""
    echo "健康检查:"
    # 修复: 之前用 grep '"Status":' 抓的是 State.Status(恒为 running),不是 Healthcheck 状态
    # 改用 docker inspect --format 直接取 Healthcheck 状态;无 healthcheck 时回退显示容器运行状态
    HEALTH_STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' codedog 2>/dev/null || true)
    if [ -n "$HEALTH_STATUS" ]; then
        if [ "$HEALTH_STATUS" = "no-healthcheck" ]; then
            echo "Docker 健康检查: 未配置健康检查"
            # 回退显示容器运行状态
            CONTAINER_STATE=$(docker inspect --format='{{.State.Status}}' codedog 2>/dev/null || true)
            [ -n "$CONTAINER_STATE" ] && echo "容器运行状态: $CONTAINER_STATE"
        else
            echo "Docker 健康检查: $HEALTH_STATUS"
        fi
    else
        echo "Docker 健康检查: 未知（容器不存在或无法访问）"
    fi

    echo ""
    if curl -fs http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "后端服务: 运行中"
    else
        echo "后端服务: 未响应"
        echo ""
        echo "最近日志:"
        $COMPOSE_CMD logs --tail=40 codedog 2>/dev/null || true
    fi

    echo ""
    show_database_status

    wait_enter
}

show_logs() {
    echo "=== 服务日志 ==="
    echo "1) 实时日志"
    echo "2) 最近50行"
    echo "3) 最近100行"
    echo ""
    read -p "请选择 [1-3]: " log_choice
    case $log_choice in
        1) $COMPOSE_CMD logs -f codedog ;;
        2) $COMPOSE_CMD logs --tail=50 codedog ;;
        3) $COMPOSE_CMD logs --tail=100 codedog ;;
    esac
    wait_enter
}

check_update() {
    echo "=== 检查更新 ==="
    # 修复: 不再吞掉 git fetch 错误,失败时给出明确提示
    if ! git fetch origin 2>&1; then
        echo "拉取远程信息失败,请检查网络或 git 远程配置"
        wait_enter
        return
    fi

    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo main)
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null)

    # 修复: REMOTE 为空时不能直接比较,会误报"有新版本"
    if [ -z "$LOCAL" ] || [ -z "$REMOTE" ]; then
        echo "无法获取版本信息(LOCAL=$LOCAL, REMOTE=$REMOTE)"
        echo "请检查 git 仓库状态和远程分支 origin/$CURRENT_BRANCH 是否存在"
        wait_enter
        return
    fi

    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "已是最新版本 (分支: $CURRENT_BRANCH, commit: ${LOCAL:0:8})"
    else
        echo "有新版本可用 (分支: $CURRENT_BRANCH):"
        git log HEAD..origin/$CURRENT_BRANCH --oneline --no-merges 2>/dev/null | head -10
    fi
    wait_enter
}

# 使用 sqlite3 在线热备份；WAL 模式下比 cp -r 更一致
backup_sqlite() {
    local backup_dir="$1"
    # 修复: 优先使用 HOST_DB_PATH(Docker 路径),不存在则尝试 LEGACY_DB_PATH(本地路径)
    local db_file=""
    if [ -f "$HOST_DB_PATH" ]; then
        db_file="$HOST_DB_PATH"
    elif [ -f "$LEGACY_DB_PATH" ]; then
        db_file="$LEGACY_DB_PATH"
    fi

    if [ -z "$db_file" ]; then
        echo "  数据库文件不存在,跳过 SQLite 备份"
        return 0
    fi

    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$db_file" ".backup '$backup_dir/database.sqlite'"
        echo "数据库已使用 sqlite3 .backup 热备份 (源: $db_file)"
    else
        cp "$db_file" "$backup_dir/database.sqlite"
        echo "sqlite3 未安装，已冷拷贝数据库 (源: $db_file)"
    fi
}

# 复制 data/uploads/.env 到备份目录；先拷贝非 DB 文件，DB 单独热备份
backup_data() {
    local backup_dir="$1"
    mkdir -p "$backup_dir"
    # 数据目录（排除已有旧数据库文件）
    cp -r data "$backup_dir/" 2>/dev/null || true
    # 修复: 本地/宝塔部署时数据库在 server/data/,也需备份
    if [ -d "$SCRIPT_DIR/server/data" ]; then
        mkdir -p "$backup_dir/server-data"
        cp -r "$SCRIPT_DIR/server/data" "$backup_dir/server-data/" 2>/dev/null || true
    fi
    # 上传文件
    cp -r uploads "$backup_dir/" 2>/dev/null || true
    # 修复: 本地/宝塔部署时上传文件在 server/uploads/,也需备份
    if [ -d "$SCRIPT_DIR/server/uploads" ]; then
        mkdir -p "$backup_dir/server-uploads"
        cp -r "$SCRIPT_DIR/server/uploads" "$backup_dir/server-uploads/" 2>/dev/null || true
    fi
    # 环境变量
    cp .env "$backup_dir/.env" 2>/dev/null || true
    # 修复: 本地开发可能有 server/.env,也需备份
    cp "$SCRIPT_DIR/server/.env" "$backup_dir/server.env" 2>/dev/null || true
    # SQLite 热备份，覆盖上面冷拷贝的数据库
    if [ "$(get_db_type)" = "sqlite" ]; then
        backup_sqlite "$backup_dir"
    fi
    echo "备份已保存到 $backup_dir"
}

# 清理 SQLite 残留 backup 表(避免 sync alter 残留导致启动崩溃)
clean_backup_tables() {
    # 修复: 优先使用 HOST_DB_PATH(Docker 路径),不存在则尝试 LEGACY_DB_PATH(本地路径)
    local db_file=""
    if [ -f "$HOST_DB_PATH" ]; then
        db_file="$HOST_DB_PATH"
    elif [ -f "$LEGACY_DB_PATH" ]; then
        db_file="$LEGACY_DB_PATH"
    fi

    if [ -z "$db_file" ] || ! command -v sqlite3 >/dev/null 2>&1; then
        return 0
    fi
    local BACKUP_TABLES
    BACKUP_TABLES=$(sqlite3 "$db_file" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup';" 2>/dev/null || true)
    if [ -n "$BACKUP_TABLES" ]; then
        echo "  发现残留 backup 表:"
        echo "$BACKUP_TABLES" | sed 's/^/    /'
        echo "$BACKUP_TABLES" | while read -r t; do
            [ -n "$t" ] && sqlite3 "$db_file" "DROP TABLE IF EXISTS \"$t\";" 2>/dev/null && echo "  已删除: $t"
        done
    else
        echo "  无残留 backup 表"
    fi
}

# 检测 .env 是否缺少生产必需的环境变量
check_env_required() {
    local missing=()
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        echo "  警告: .env 文件不存在"
        return 1
    fi
    # JWT_SECRET / SESSION_SECRET 必填且 >= 32 字符
    local jwt session
    jwt=$(get_env_value "JWT_SECRET")
    session=$(get_env_value "SESSION_SECRET")
    if [ -z "$jwt" ] || [ ${#jwt} -lt 32 ]; then
        missing+=("JWT_SECRET(需>=32字符)")
    fi
    if [ -z "$session" ] || [ ${#session} -lt 32 ]; then
        missing+=("SESSION_SECRET(需>=32字符)")
    fi
    # 生产环境需要 CORS_ORIGIN
    local node_env
    node_env=$(get_env_value "NODE_ENV")
    if [ "$node_env" = "production" ]; then
        local cors
        cors=$(get_env_value "CORS_ORIGIN")
        if [ -z "$cors" ]; then
            missing+=("CORS_ORIGIN(生产必需)")
        fi
    fi
    if [ ${#missing[@]} -gt 0 ]; then
        echo "  缺少必需环境变量:"
        for m in "${missing[@]}"; do echo "    - $m"; done
        return 1
    fi
    echo "  环境变量检查通过"
    return 0
}

# 启动失败时智能诊断: 扫描日志中已知崩溃模式并给出修复建议
diagnose_startup_failure() {
    echo "=== 启动失败智能诊断 ==="
    local LOGS
    LOGS=$($COMPOSE_CMD logs --tail=80 codedog 2>/dev/null || true)

    # 模式1: SQLite backup 表残留
    if echo "$LOGS" | grep -qi "SQLITE_ERROR.*backup\|already exists.*backup\|UNIQUE constraint failed: users_backup"; then
        echo "  [诊断] 检测到 SQLite backup 表残留导致崩溃"
        echo "  [建议] 执行菜单 5(修复问题) → 选项 4(清理残留备份表)"
    fi

    # 模式2: JWT/SESSION 缺失
    if echo "$LOGS" | grep -qi "JWT_SECRET\|SESSION_SECRET.*required\|SESSION_SECRET.*must"; then
        echo "  [诊断] 检测到 JWT_SECRET 或 SESSION_SECRET 缺失/过短"
        echo "  [建议] 在 .env 中设置 >=32 字符的 JWT_SECRET 和 SESSION_SECRET"
    fi

    # 模式3: CORS 缺失
    if echo "$LOGS" | grep -qi "CORS_ORIGIN.*required\|CORS_ORIGIN.*must"; then
        echo "  [诊断] 检测到生产环境缺少 CORS_ORIGIN"
        echo "  [建议] 在 .env 中设置 CORS_ORIGIN=https://你的域名"
    fi

    # 模式4: getDialectName 旧 bug(已修但可能残留旧镜像)
    if echo "$LOGS" | grep -qi "getDialectName is not a function"; then
        echo "  [诊断] 检测到旧版本 Sequelize 适配代码"
        echo "  [建议] 确认已 git pull 最新代码,并执行 --no-cache 重建"
    fi

    # 模式5: 端口占用
    if echo "$LOGS" | grep -qi "EADDRINUSE\|port.*already in use"; then
        echo "  [诊断] 检测到端口 3001 被占用"
        echo "  [建议] 执行: lsof -i:3001 或 netstat -tlnp | grep 3001 查找占用进程"
    fi

    # 模式6: 数据库连接失败
    if echo "$LOGS" | grep -qi "ECONNREFUSED\|connect ECONNREFUSED.*3306\|database.*connection.*fail"; then
        echo "  [诊断] 检测到数据库连接失败"
        echo "  [建议] 检查 DB_TYPE 配置和 MySQL 服务是否运行"
    fi

    # 模式7: 模块加载失败
    if echo "$LOGS" | grep -qi "Cannot find module\|MODULE_NOT_FOUND"; then
        echo "  [诊断] 检测到 Node 模块缺失"
        echo "  [建议] 确认已 --no-cache 重建镜像; 检查 package.json 是否完整"
    fi

    echo ""
    echo "--- 最近 40 行日志 ---"
    echo "$LOGS" | tail -40
    echo "---------------------"
}

# 智能更新: 更新前后自动处理常见"更新后仍异常"的场景
do_update() {
    echo "=== 执行更新(智能模式 v$VERSION) ==="
    echo ""
    echo "智能更新会自动处理:"
    echo "  1) 更新前清理 SQLite 残留 backup 表(防启动崩溃)"
    echo "  2) 更新前检查 .env 必需变量"
    echo "  3) 更新后失败自动诊断日志"
    echo "  4) 更新后询问是否执行数据修复脚本"
    echo ""
    read -p "开始更新? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        echo "已取消"
        wait_enter
        return
    fi

    # ========== 步骤1: 停服务 + 备份 ==========
    echo ""
    # 清理上次可能残留的宿主机维护页服务器
    if [ -f "$SCRIPT_DIR/scripts/maintenance-server.sh" ]; then
        bash "$SCRIPT_DIR/scripts/maintenance-server.sh" stop 2>/dev/null || true
    fi

    echo "[1/8] 停止服务并备份..."
    $COMPOSE_CMD down --remove-orphans
    # 等待容器真正释放监听端口。仅探测 /api/health 会在容器退出过程中误判。
    for i in $(seq 1 10); do
        if ! ss -tln 2>/dev/null | grep -q ':3001 '; then break; fi
        sleep 1
    done
    # 启动宿主机维护页服务器(非 Docker,直接绑定 3001)。维护脚本会等待
    # Docker 完全释放端口，并在失败时直接输出诊断日志。
    if [ -f "$SCRIPT_DIR/scripts/maintenance-server.sh" ]; then
        if ! bash "$SCRIPT_DIR/scripts/maintenance-server.sh" start; then
            echo -e "${RED}[!!] 维护页启动失败，为避免更新期间出现 502，更新已中止${NC}"
            $COMPOSE_CMD up -d
            wait_enter
            return 1
        fi
    fi
    echo "  [OK] 维护页已启动 (port 3001)"

    BACKUP="backup_$(date +%Y%m%d_%H%M%S)"
    backup_data "$BACKUP"

    # ========== 步骤2: 预检 - 清理残留 backup 表 ==========
    echo ""
    echo "[2/8] 预检: 清理 SQLite 残留 backup 表..."
    if [ "$(get_db_type)" = "sqlite" ]; then
        clean_backup_tables
    else
        echo "  非 SQLite 模式,跳过"
    fi

    # ========== 步骤3: 预检 - 环境变量 ==========
    echo ""
    echo "[3/8] 预检: 环境变量..."
    check_env_required || true

    # ========== 步骤4: git pull ==========
    # 服务器上可能有调试时手动修改的文件(Dockerfile/deploy.sh/app.js等),
    # 直接 git pull 会被这些本地改动阻断。工具箱自动 stash 保存后重试。
    echo ""
    echo "[4/8] 拉取更新..."
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo main)
    if ! git pull origin "$CURRENT_BRANCH"; then
        # 检测是否有本地未提交改动
        LOCAL_CHANGES=$(git status --porcelain 2>/dev/null)
        if [ -n "$LOCAL_CHANGES" ]; then
            echo ""
            echo -e "${YELLOW}检测到本地有未提交改动,这些改动可能是之前调试时手动修改的:${NC}"
            git status --short
            echo ""
            echo "工具箱可以自动 stash 保存这些改动(不会丢失),然后继续更新。"
            echo "如需恢复,更新完成后可手动执行: git stash pop"
            echo ""
            read -p "是否自动 stash 本地改动并继续更新? (y/n): " stash_confirm
            if [ "$stash_confirm" != "y" ]; then
                echo -e "${YELLOW}已取消。更新已中止${NC}"
                echo "服务当前已停止,如需启动可执行: $COMPOSE_CMD up -d"
                wait_enter
                return 1
            fi
            # stash 保存本地改动,带时间戳备注方便找回
            STASH_MSG="toolbox-auto-stash-$(date +%Y%m%d_%H%M%S)"
            if ! git stash push -m "$STASH_MSG"; then
                echo -e "${RED}git stash 失败! 更新已中止${NC}"
                echo "服务当前已停止,如需启动可执行: $COMPOSE_CMD up -d"
                wait_enter
                return 1
            fi
            echo -e "${GREEN}本地改动已 stash 保存: $STASH_MSG${NC}"
            # 重试 git pull
            if ! git pull origin "$CURRENT_BRANCH"; then
                echo ""
                echo -e "${RED}git pull 仍然失败! 更新已中止${NC}"
                echo "可能原因: 网络问题 / 合并冲突"
                echo "处理方法:"
                echo "  1) 检查网络连接"
                echo "  2) 手动执行: git pull origin $CURRENT_BRANCH"
                echo "  3) 本地改动已 stash,可执行 git stash pop 恢复"
                echo ""
                echo "服务当前已停止,如需启动可执行: $COMPOSE_CMD up -d"
                wait_enter
                return 1
            fi
        else
            echo ""
            echo -e "${RED}git pull 失败! 更新已中止${NC}"
            echo "可能原因: 网络问题 / 合并冲突"
            echo "处理方法:"
            echo "  1) 检查网络连接"
            echo "  2) 手动执行: git pull origin $CURRENT_BRANCH"
            echo ""
            echo "服务当前已停止,如需启动可执行: $COMPOSE_CMD up -d"
            wait_enter
            return 1
        fi
    fi

    # ========== 步骤5: 权限修复 ==========
    echo ""
    echo "[5/8] 修复持久化目录权限..."
    mkdir -p "$DATA_PATH" "$UPLOADS_PATH/avatars" "$UPLOADS_PATH/works"
    chmod -R a+rwX "$DATA_PATH" "$UPLOADS_PATH" 2>/dev/null || true

    # ========== 步骤6: 重新构建 + 启动 ==========
    echo ""
    echo "[6/8] 重新构建并启动（复用 Docker 缓存）..."
    # 镜像构建不占用 3001，构建期间继续由维护服务器响应 Cloudflare。
    # 普通更新必须保留 Docker layer 缓存：依赖未变化时复用 apk/npm 层。
    # 仅在缓存损坏或排障时由管理员手动执行 `$COMPOSE_CMD build --no-cache`。
    if ! $COMPOSE_CMD build; then
        echo "[!!] 构建失败，维护页将继续保持在线，请修复后重新更新"
        wait_enter
        return 1
    fi

    # 镜像准备好后再短暂切换端口。不要先 create 再 start：部分 Docker
    # Compose 版本会在预创建容器后的 start 阶段无输出卡住，用户无法判断
    # 是端口冲突还是 Docker 异常。up --no-build 能一次完成创建和启动，且
    # 不会重复构建刚刚生成的镜像。
    echo "  镜像已构建，正在切换维护页与正式服务..."
    if [ -f "$SCRIPT_DIR/scripts/maintenance-server.sh" ]; then
        if command -v timeout >/dev/null 2>&1; then
            timeout 15s bash "$SCRIPT_DIR/scripts/maintenance-server.sh" stop || true
        else
            bash "$SCRIPT_DIR/scripts/maintenance-server.sh" stop || true
        fi
    fi
    for i in $(seq 1 15); do
        if ! ss -tln 2>/dev/null | grep -q ':3001 '; then break; fi
        [ "$i" -eq 1 ] && echo "  等待 3001 端口释放..."
        sleep 1
    done
    if ss -tln 2>/dev/null | grep -q ':3001 '; then
        echo "[!!] 3001 端口在 15 秒后仍被占用，正式服务尚未启动"
        ss -ltnp 'sport = :3001' 2>/dev/null || true
        if [ -f "$SCRIPT_DIR/scripts/maintenance-server.sh" ]; then
            bash "$SCRIPT_DIR/scripts/maintenance-server.sh" start || true
        fi
        wait_enter
        return 1
    fi

    echo "  启动新容器（最长等待 90 秒）..."
    START_OK=0
    # 某些 Docker Compose 版本在已经输出 "Container ... Started" 后仍不退出。
    # 后台启动并直接轮询容器状态，容器进入 running 后不再被 Compose 客户端卡住。
    $COMPOSE_CMD up -d --no-build codedog &
    COMPOSE_START_PID=$!
    for i in $(seq 1 90); do
        if docker inspect -f '{{.State.Running}}' codedog 2>/dev/null | grep -qx 'true'; then
            START_OK=1
            echo "  [OK] 新容器已进入运行状态"
            break
        fi
        if ! kill -0 "$COMPOSE_START_PID" 2>/dev/null; then
            wait "$COMPOSE_START_PID" 2>/dev/null || true
            break
        fi
        [ $((i % 10)) -eq 0 ] && echo "  仍在等待 Docker 启动容器... (${i}s)"
        sleep 1
    done
    # Compose 客户端若仍挂起，只结束客户端进程；已启动的 detached 容器不受影响。
    if kill -0 "$COMPOSE_START_PID" 2>/dev/null; then
        kill "$COMPOSE_START_PID" 2>/dev/null || true
    fi
    wait "$COMPOSE_START_PID" 2>/dev/null || true
    if [ "$START_OK" != "1" ]; then
        echo "[!!] 新容器启动失败，正在恢复维护页..."
        $COMPOSE_CMD down --remove-orphans 2>/dev/null || true
        for i in $(seq 1 15); do
            if ! ss -tln 2>/dev/null | grep -q ':3001 '; then break; fi
            sleep 1
        done
        if [ -f "$SCRIPT_DIR/scripts/maintenance-server.sh" ]; then
            bash "$SCRIPT_DIR/scripts/maintenance-server.sh" start || true
        fi
        diagnose_startup_failure
        wait_enter
        return 1
    fi

    # ========== 步骤7: 等待启动 + 智能诊断 ==========
    echo ""
    echo "[7/8] 等待服务启动..."
    SERVICE_READY=0
    for i in $(seq 1 60); do
        if curl -fs http://localhost:3001/api/health > /dev/null 2>&1; then
            SERVICE_READY=1
            echo ""
            echo "服务已就绪"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""

    if [ "$SERVICE_READY" != "1" ]; then
        echo ""
        echo "[!] 服务未在 120 秒内响应,进入诊断模式..."
        diagnose_startup_failure
        echo "[!] 正在停止异常容器并恢复维护页..."
        $COMPOSE_CMD down --remove-orphans 2>/dev/null || true
        for i in $(seq 1 15); do
            if ! ss -tln 2>/dev/null | grep -q ':3001 '; then break; fi
            sleep 1
        done
        if [ -f "$SCRIPT_DIR/scripts/maintenance-server.sh" ]; then
            bash "$SCRIPT_DIR/scripts/maintenance-server.sh" start || true
        fi
        wait_enter
        return 1
    fi

    # ========== 步骤8: 智能数据修复提示 ==========
    echo ""
    echo "[8/8] 数据修复检查..."

    # 检测是否存在 repairImageUrls.js
    REPAIR_SCRIPT="$SCRIPT_DIR/server/scripts/repairImageUrls.js"
    if [ -f "$REPAIR_SCRIPT" ]; then
        echo "  检测到图片 URL 修复脚本: $REPAIR_SCRIPT"
        echo "  此脚本用于修复历史数据中的图片/头像 URL(反引号包裹、相对路径)"
        echo "  如果更新涉及图片/头像相关代码,建议执行"
        echo ""
        read -p "是否执行数据修复脚本? (y/n,默认n): " run_repair
        if [ "$run_repair" = "y" ]; then
            echo "  正在容器内执行修复脚本..."
            $COMPOSE_CMD exec -T codedog node server/scripts/repairImageUrls.js 2>&1 | head -50
            echo "  修复脚本执行完成"
            # 修复后重启以刷新缓存
            echo "  重启服务以应用修复..."
            $COMPOSE_CMD restart codedog
            sleep 3
        else
            echo "  已跳过数据修复(可稍后通过菜单 5 或手动执行)"
        fi
    else
        echo "  无数据修复脚本"
    fi

    echo ""
    echo "=== 更新完成 ==="
    echo "更新流程: 备份 → 预检 → 拉取 → 构建 → 启动 → 诊断 → 修复"
    wait_enter
}

do_fix() {
    echo "=== 修复问题 ==="
    echo "1) 检查数据库状态"
    echo "2) 修复文件权限"
    echo "3) 修复敏感词表"
    echo "4) 清理 SQLite 残留备份表（解决启动崩溃）"
    echo "5) 执行图片/头像 URL 修复脚本"
    echo "6) 全部修复"
    echo ""
    read -p "请选择 [1-6]: " fix_choice

    case $fix_choice in
        1)
            show_database_status
            ;;
        2)
            mkdir -p "$DATA_PATH" "$UPLOADS_PATH/avatars" "$UPLOADS_PATH/works"
            chmod -R a+rwX "$DATA_PATH" "$UPLOADS_PATH" 2>/dev/null || true
            echo "权限修复完成"
            ;;
        3)
            # 修复: 同时检查 Docker 路径和本地路径
            local db_file=""
            if [ -f "$HOST_DB_PATH" ]; then
                db_file="$HOST_DB_PATH"
            elif [ -f "$LEGACY_DB_PATH" ]; then
                db_file="$LEGACY_DB_PATH"
            fi
            if [ -n "$db_file" ]; then
                sqlite3 "$db_file" "SELECT COUNT(*) FROM sensitive_words" 2>/dev/null && echo "敏感词表正常 (源: $db_file)" || echo "无法读取敏感词表"
            else
                echo "数据库文件不存在:"
                echo "  已检查: $HOST_DB_PATH"
                echo "  已检查: $LEGACY_DB_PATH"
            fi
            ;;
        4)
            if [ "$(get_db_type)" = "sqlite" ]; then
                clean_backup_tables
            else
                echo "非 SQLite 模式,无需清理"
            fi
            ;;
        5)
            # 新增: 一键执行数据修复脚本(反引号/相对路径)
            REPAIR_SCRIPT="$SCRIPT_DIR/server/scripts/repairImageUrls.js"
            if [ ! -f "$REPAIR_SCRIPT" ]; then
                echo "修复脚本不存在: $REPAIR_SCRIPT"
                echo "请先 git pull 获取最新代码"
            else
                # 修复: docker compose ps 的 STATUS 列是 "Up X minutes (healthy)"，不含 "running" 字样
                # 改用 docker inspect 取 State.Status，与 show_status 中的健康检查逻辑一致
                CONTAINER_STATE=$(docker inspect --format='{{.State.Status}}' codedog 2>/dev/null || true)
                if [ "$CONTAINER_STATE" != "running" ]; then
                    echo "容器未运行(状态: ${CONTAINER_STATE:-不存在}),请先启动服务: $COMPOSE_CMD up -d"
                else
                    echo "正在容器内执行修复脚本..."
                    echo "  修复范围: User.avatar / Work.preview / Work.work_url / Post.cover / Studio.cover / Banner.image_url"
                    $COMPOSE_CMD exec -T codedog node server/scripts/repairImageUrls.js 2>&1 | head -80
                    echo ""
                    echo "修复完成,重启服务以刷新缓存..."
                    $COMPOSE_CMD restart codedog
                    sleep 3
                    echo "已重启"
                fi
            fi
            ;;
        6)
            # 修复: 之前的"全部修复"只做了权限修复+重启,未执行其他修复项
            # 现在依次执行: 权限修复 → 清理残留备份表 → 敏感词表检查 → 数据修复 → 重启
            echo "[1/5] 修复文件权限..."
            mkdir -p "$DATA_PATH" "$UPLOADS_PATH/avatars" "$UPLOADS_PATH/works"
            chmod -R a+rwX "$DATA_PATH" "$UPLOADS_PATH" 2>/dev/null || true
            echo "  权限修复完成"

            echo "[2/5] 清理 SQLite 残留备份表..."
            if [ "$(get_db_type)" = "sqlite" ]; then
                clean_backup_tables
            else
                echo "  非 SQLite 模式,跳过"
            fi

            echo "[3/5] 检查敏感词表..."
            if [ -f "$HOST_DB_PATH" ] && command -v sqlite3 >/dev/null 2>&1; then
                if sqlite3 "$HOST_DB_PATH" "SELECT COUNT(*) FROM sensitive_words" >/dev/null 2>&1; then
                    echo "  敏感词表正常"
                else
                    echo "  警告: 敏感词表无法读取,请检查数据库"
                fi
            else
                echo "  跳过(数据库文件不存在或 sqlite3 未安装)"
            fi

            echo "[4/5] 执行图片/头像 URL 修复..."
            REPAIR_SCRIPT="$SCRIPT_DIR/server/scripts/repairImageUrls.js"
            # 修复: 同选项5，docker compose ps 的 STATUS 列不含 "running"，改用 docker inspect
            CONTAINER_STATE_4=$(docker inspect --format='{{.State.Status}}' codedog 2>/dev/null || true)
            if [ -f "$REPAIR_SCRIPT" ] && [ "$CONTAINER_STATE_4" = "running" ]; then
                $COMPOSE_CMD exec -T codedog node server/scripts/repairImageUrls.js 2>&1 | tail -10
            else
                echo "  跳过(脚本不存在或容器未运行,状态: ${CONTAINER_STATE_4:-不存在})"
            fi

            echo "[5/5] 重启服务..."
            $COMPOSE_CMD restart codedog
            echo ""
            echo "全部修复完成，已重启服务"
            ;;
    esac
    wait_enter
}

do_database() {
    echo "=== 数据库管理 ==="

    # 修复: MySQL 模式下不支持 SQLite 文件操作，需提前提示
    local db_type
    db_type=$(get_db_type)
    if [ "$db_type" = "mysql" ]; then
        echo "当前数据库类型: MySQL"
        echo "MySQL 模式下不支持通过工具箱直接备份/查看，请使用 MySQL 客户端工具操作"
        echo "  备份: mysqldump -u $DB_USER -p $DB_NAME > backup.sql"
        echo "  查看: mysql -u $DB_USER -p $DB_NAME -e 'SHOW TABLES;'"
        wait_enter
        return
    fi

    echo "1) 备份数据库"
    echo "2) 查看数据库信息"
    echo ""
    read -p "请选择 [1-2]: " db_choice

    case $db_choice in
        1)
            if [ -f "$HOST_DB_PATH" ]; then
                BACKUP_FILE="$DATA_PATH/backup_$(date +%Y%m%d_%H%M%S).sqlite"
                if command -v sqlite3 >/dev/null 2>&1; then
                    sqlite3 "$HOST_DB_PATH" ".backup '$BACKUP_FILE'"
                    echo "热备份已保存到: $BACKUP_FILE"
                else
                    cp "$HOST_DB_PATH" "$BACKUP_FILE"
                    echo "冷拷贝已保存到: $BACKUP_FILE"
                fi
            elif $COMPOSE_CMD exec -T codedog test -f "$CONTAINER_DB_PATH" >/dev/null 2>&1; then
                BACKUP_FILE="$DATA_PATH/backup_$(date +%Y%m%d_%H%M%S).sqlite"
                $COMPOSE_CMD cp codedog:"$CONTAINER_DB_PATH" "$BACKUP_FILE" && echo "备份已保存到: $BACKUP_FILE"
            else
                echo "数据库文件不存在"
            fi
            ;;
        2)
            if [ -f "$HOST_DB_PATH" ]; then
                if command -v sqlite3 >/dev/null 2>&1; then
                    echo "数据表:"
                    sqlite3 "$HOST_DB_PATH" "SELECT name FROM sqlite_master WHERE type='table'" 2>/dev/null
                else
                    echo "sqlite3 未安装，显示文件信息:"
                    ls -lh "$HOST_DB_PATH"
                fi
            else
                show_database_status
            fi
            ;;
    esac
    wait_enter
}

do_sensitive() {
    echo "=== 敏感词管理 ==="

    # 修复: MySQL 模式下不支持直接读取 SQLite 文件
    local db_type
    db_type=$(get_db_type)
    if [ "$db_type" = "mysql" ]; then
        echo "当前数据库类型: MySQL"
        echo "MySQL 模式下不支持通过工具箱直接操作敏感词表，请使用后台管理界面"
        wait_enter
        return
    fi

    echo "1) 查看统计"
    echo ""
    read -p "请选择 [1]: " sw_choice

    if [ "$sw_choice" = "1" ] && [ -f "$HOST_DB_PATH" ]; then
        if command -v sqlite3 >/dev/null 2>&1; then
            echo "活跃敏感词:"
            sqlite3 "$HOST_DB_PATH" "SELECT COUNT(*) FROM sensitive_words WHERE status='active'" 2>/dev/null
            echo "按分类:"
            sqlite3 "$HOST_DB_PATH" "SELECT category, COUNT(*) FROM sensitive_words WHERE status='active' GROUP BY category" 2>/dev/null
        else
            echo "sqlite3 未安装，无法直接查看统计"
        fi
    else
        show_database_status
    fi
    wait_enter
}

do_config() {
    echo "=== 系统配置 ==="
    if [ -f "$SCRIPT_DIR/.env" ]; then
        echo "当前配置(敏感信息已脱敏):"
        # 修复: 之前只脱敏 JWT_SECRET/SESSION_SECRET,遗漏了 DB_PASSWORD、代理凭据、API key 等
        # 现在覆盖所有常见敏感字段(密码/密钥/代理/令牌)
        sed -E \
            -e 's/^(JWT_SECRET|SESSION_SECRET)=.*/\1=******/' \
            -e 's/^(DB_PASSWORD|MYSQL_PASSWORD|DATABASE_PASSWORD)=.*/\1=******/' \
            -e 's/^(REDIS_PASSWORD)=.*/\1=******/' \
            -e 's/^(HTTPS_PROXY|HTTP_PROXY|ALL_PROXY)=.*/\1=******/' \
            -e 's/^([A-Z_]*_API_KEY)=.*/\1=******/' \
            -e 's/^([A-Z_]*_SECRET)=.*/\1=******/' \
            -e 's/^([A-Z_]*_TOKEN)=.*/\1=******/' \
            -e 's/^([A-Z_]*_SECRET_KEY)=.*/\1=******/' \
            -e 's/^([A-Z_]*_PRIVATE_KEY)=.*/\1=******/' \
            -e 's/^(GEETEST_ID|GEETEST_KEY|HCAPTCHA_SITE_KEY|HCAPTCHA_SECRET_KEY)=.*/\1=******/' \
            "$SCRIPT_DIR/.env"
    else
        echo ".env 文件不存在"
    fi
    wait_enter
}

do_clean() {
    echo "=== 清理缓存 ==="
    echo "将执行: docker system prune -f"
    echo "此操作会删除所有未使用的镜像、容器、网络,释放磁盘空间"
    echo "注意: 不会删除已命名的数据卷(如数据库卷)"
    read -p "确认清理? (y/n): " clean_confirm
    if [ "$clean_confirm" != "y" ]; then
        echo "已取消"
        wait_enter
        return
    fi
    docker system prune -f 2>/dev/null
    echo "缓存清理完成"
    wait_enter
}

# ==================== 验证码开关 ====================
# 直接修改数据库 system_configs 表的 hcaptcha_enabled / geetest_enabled 字段
# 用于验证码服务异常时紧急关闭，避免登录/发帖/评论被全部拦截
# 注意：hCaptcha 中间件有 60 秒缓存，关闭后最多 60 秒生效；重启服务立即生效
do_captcha_toggle() {
    echo "=== 验证码开关 ==="
    echo ""

    # MySQL 模式下不支持直接读取 SQLite 文件
    local db_type
    db_type=$(get_db_type)
    if [ "$db_type" = "mysql" ]; then
        echo "当前数据库类型: MySQL"
        echo "MySQL 模式下不支持通过工具箱直接修改验证码配置"
        echo "请使用后台管理界面 → 系统配置 修改验证码开关"
        wait_enter
        return
    fi

    # 查找数据库文件：优先 Docker 路径，其次本地路径
    local db_file=""
    if [ -f "$HOST_DB_PATH" ]; then
        db_file="$HOST_DB_PATH"
    elif [ -f "$LEGACY_DB_PATH" ]; then
        db_file="$LEGACY_DB_PATH"
    else
        echo "数据库文件不存在:"
        echo "  已检查: $HOST_DB_PATH"
        echo "  已检查: $LEGACY_DB_PATH"
        echo ""
        echo "可能原因:"
        echo "  1) 项目尚未部署"
        echo "  2) 数据库在容器内（请先 docker compose up -d）"
        wait_enter
        return
    fi

    if ! command -v sqlite3 >/dev/null 2>&1; then
        echo "sqlite3 命令未安装，无法直接修改数据库"
        echo "请安装 sqlite3: sudo apt-get install -y sqlite3  或  sudo yum install -y sqlite"
        wait_enter
        return
    fi

    echo "数据库: $db_file"
    echo ""
    echo "当前状态:"

    # 读取当前 hCaptcha 状态
    local hcaptcha_raw
    hcaptcha_raw=$(sqlite3 "$db_file" "SELECT config_value FROM system_configs WHERE config_key='hcaptcha_enabled'" 2>/dev/null)
    local hcaptcha_state="未配置(默认关闭)"
    [ -n "$hcaptcha_raw" ] && hcaptcha_state="$hcaptcha_raw"
    [ "$hcaptcha_raw" = "true" ] && hcaptcha_state="已开启"
    [ "$hcaptcha_raw" = "false" ] && hcaptcha_state="已关闭"
    echo "  hCaptcha: $hcaptcha_state"

    # 读取当前极验状态
    local geetest_raw
    geetest_raw=$(sqlite3 "$db_file" "SELECT config_value FROM system_configs WHERE config_key='geetest_enabled'" 2>/dev/null)
    local geetest_state="未配置(默认关闭)"
    [ -n "$geetest_raw" ] && geetest_state="$geetest_raw"
    [ "$geetest_raw" = "true" ] && geetest_state="已开启"
    [ "$geetest_raw" = "false" ] && geetest_state="已关闭"
    echo "  极验Geetest: $geetest_state"

    echo ""
    echo "  1) 关闭 hCaptcha 验证码（紧急放行）"
    echo "  2) 开启 hCaptcha 验证码"
    echo "  3) 关闭 极验Geetest 验证码"
    echo "  4) 开启 极验Geetest 验证码"
    echo "  5) 全部关闭 (验证码服务故障时使用)"
    echo "  6) 全部开启"
    echo "  0) 返回"
    echo ""
    read -p "请选择 [0-6]: " cap_choice

    case "$cap_choice" in
        1) set_system_config "$db_file" "hcaptcha_enabled" "false" ;;
        2) set_system_config "$db_file" "hcaptcha_enabled" "true" ;;
        3) set_system_config "$db_file" "geetest_enabled" "false" ;;
        4) set_system_config "$db_file" "geetest_enabled" "true" ;;
        5)
            set_system_config "$db_file" "hcaptcha_enabled" "false"
            set_system_config "$db_file" "geetest_enabled" "false"
            ;;
        6)
            set_system_config "$db_file" "hcaptcha_enabled" "true"
            set_system_config "$db_file" "geetest_enabled" "true"
            ;;
        0) return ;;
    esac

    echo ""
    echo "提示: hCaptcha 中间件有 60 秒缓存，最多 60 秒后生效；重启服务立即生效。"
    wait_enter
}

# 写入 system_configs 表的辅助函数：存在则更新，不存在则插入
set_system_config() {
    local db_file="$1"
    local key="$2"
    local val="$3"
    local exists
    exists=$(sqlite3 "$db_file" "SELECT config_key FROM system_configs WHERE config_key='$key'" 2>/dev/null)
    if [ -z "$exists" ]; then
        sqlite3 "$db_file" "INSERT INTO system_configs (config_key, config_value, created_at, updated_at) VALUES ('$key', '$val', datetime('now'), datetime('now'))" 2>/dev/null
    else
        sqlite3 "$db_file" "UPDATE system_configs SET config_value='$val', updated_at=datetime('now') WHERE config_key='$key'" 2>/dev/null
    fi
    echo "  [OK] $key 已设置为 $val"
}

# 支持 CLI 直接调用: bash codedog.sh <功能名>
# 例: bash codedog.sh update  → 直接执行更新(智能模式)
#     bash codedog.sh status  → 直接查看系统状态
#     bash codedog.sh fix     → 进入修复菜单
# 不带参数则进入交互式主循环
dispatch_cli() {
    local cmd="$1"
    case "$cmd" in
        update)  do_update ;;
        status)  show_status ;;
        logs)    show_logs ;;
        check)   check_update ;;
        fix)     do_fix ;;
        db)      do_database ;;
        sensitive) do_sensitive ;;
        config)  do_config ;;
        clean)   do_clean ;;
        captcha) do_captcha_toggle ;;
        ""|menu) main_loop ;;
        *)
            echo "未知命令: $cmd"
            echo "可用命令: update status logs check fix db sensitive config clean captcha menu"
            exit 1
            ;;
    esac
}

dispatch_cli "$1"
