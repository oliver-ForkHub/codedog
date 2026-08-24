const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const backupDir = path.join(root, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
const deployedRevisionFile = path.join(root, 'data', 'deployed-revision');

function exec(command, args, cwd = repo, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败`);
  return String(result.stdout || '').trim();
}
function copyIfExists(name) {
  const source = path.join(root, name); if (!fs.existsSync(source)) return;
  fs.mkdirSync(backupDir, { recursive: true }); fs.copyFileSync(source, path.join(backupDir, path.basename(name)));
}

console.log('=== CodeDog IM 智能更新 v0.1.0 ===');
const dirty = exec('git', ['status', '--porcelain', '--', 'im-system'], repo, true);
if (dirty) throw new Error('im-system 存在未提交修改，已停止更新以避免覆盖数据');
copyIfExists('.env'); copyIfExists('secrets/im_sso_public.pem'); copyIfExists('secrets/im_sso_private.pem');
const dockerAvailable = spawnSync('docker', ['--version'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
try {
  if (!dockerAvailable) throw Object.assign(new Error('Docker unavailable'), { code: 'ENOENT' });
  const running = exec('docker', ['compose', 'ps', '-q', 'mysql'], root, true);
  if (running) {
    const dump = spawnSync('docker', ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers codedog_im'], { cwd: root, encoding: null, shell: false });
    if (dump.status !== 0) throw new Error(String(dump.stderr || 'mysqldump failed'));
    fs.mkdirSync(backupDir, { recursive: true }); fs.writeFileSync(path.join(backupDir, 'codedog_im.sql'), dump.stdout);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error(`更新前数据库备份失败，已安全停止：${error.message}`);
  console.warn('未检测到 Docker，跳过容器数据库备份。');
}
const before = exec('git', ['rev-parse', 'HEAD'], repo, true);
const branch = exec('git', ['branch', '--show-current'], repo, true) || 'main';
exec('git', ['fetch', '--prune', 'origin']);
exec('git', ['merge', '--ff-only', `origin/${branch}`]);
if (process.platform !== 'win32') {
  const entry = path.join(root, 'im.sh'), target = '/usr/local/bin/codedogim';
  try {
    fs.chmodSync(entry, 0o755);
    // 修复: 用 rmSync(force) 兼容已有/不存在的软链,避免 ENOENT 分支。
    fs.rmSync(target, { force: true });
    fs.symlinkSync(entry, target);
    console.log('已更新全局命令 codedogim。');
  } catch (error) {
    // 修复: /usr/local/bin 属 root,非管理员进程会 EPERM。全局命令只是辅助入口,
    // 不应因权限不足中断核心部署(备份/构建/上线)。降级为告警,稍后手动处理即可。
    console.error(`[警告] 更新全局命令 ${target} 失败（${error.code}），不影响本次部署。如需更新请执行：sudo ln -sf ${entry} ${target}`);
  }
}
const after = exec('git', ['rev-parse', 'HEAD'], repo, true);
const deployedRevision = fs.existsSync(deployedRevisionFile) ? fs.readFileSync(deployedRevisionFile, 'utf8').trim() : '';
const changed = before === after ? [] : exec('git', ['diff', '--name-only', before, after, '--', 'im-system'], repo, true).split(/\r?\n/).filter(Boolean);
if (before === after && deployedRevision === after) { console.log('代码与当前运行版本均为最新，无需重建。'); process.exit(0); }
if (before !== after && !changed.length && deployedRevision) {
  fs.mkdirSync(path.dirname(deployedRevisionFile), { recursive: true });
  fs.writeFileSync(deployedRevisionFile, `${after}\n`);
  console.log('本次更新不包含 IM 文件，无需重建。');
  process.exit(0);
}
if (before === after) console.log('代码已是最新，但运行版本未记录或落后，将重新构建部署。');
if (changed.some(file => /package(-lock)?\.json$/.test(file))) exec('npm', ['ci'], root);
exec('npm', ['run', 'check'], root);
exec('docker', ['compose', 'up', '-d', '--build'], root);
fs.mkdirSync(path.dirname(deployedRevisionFile), { recursive: true });
fs.writeFileSync(deployedRevisionFile, `${after}\n`);
console.log(`更新完成：${before.slice(0, 8)} -> ${after.slice(0, 8)}；备份目录：${backupDir}`);
