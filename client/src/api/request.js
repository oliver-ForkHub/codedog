/**
 * Axios 请求封装
 * 统一处理请求和响应：
 * - baseURL 通过环境变量配置，默认 /api
 * - 401 自动清登录态并跳转登录页（带防抖避免并发重复弹窗）
 * - HCAPTCHA_REQUIRED 派发全局事件，由 App.vue 弹出验证码对话框
 */

import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  // 优先使用 Vite 环境变量，便于不同部署环境（Docker/宝塔）灵活配置后端地址
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  // 修复: 全局默认 30s,避免短操作(登录/统计)在后端异常时卡死 2 分钟;AI 审核等长操作在调用处单独覆盖
  timeout: 30000,
  withCredentials: true
})

let hcaptchaChecking = false
// 401 防抖标记，避免并发请求返回 401 时重复弹窗/跳转
let isHandling401 = false

// 修复 H04：被 hCaptcha 拦截的请求进入待重放队列，验证完成后由 'hcaptcha-verified' 事件触发重放。
// 通过在 config 上打 __hcaptchaRetried 标记保证每请求最多重放一次，避免验证失败/服务异常时无限循环。
// 同时保存原始 error，在用户取消验证('hcaptcha-cancelled')时取出 reject 给调用方，
// 否则调用方拿到的 Promise 永不 settle，导致 fetchConfigs 等永久挂起（子代理 bug 复审发现）。
const pendingHcaptchaQueue = []

function replayPendingHcaptchaRequests() {
  if (pendingHcaptchaQueue.length === 0) return
  // 取出当前队列快照后清空，重放期间新产生的 HCAPTCHA_REQUIRED 会重新入队等待下一次验证完成事件
  const queue = pendingHcaptchaQueue.splice(0)
  queue.forEach(({ config, resolve, reject }) => {
    request(config).then(resolve).catch(reject)
  })
}

// 修复：用户取消/关闭验证码对话框时，队列里的待重放请求永远等不到 'hcaptcha-verified'，
// 直接 reject 原始 error 把控制权交回调用方（让它走原本的 catch 分支）。
function rejectPendingHcaptchaRequests() {
  if (pendingHcaptchaQueue.length === 0) return
  const queue = pendingHcaptchaQueue.splice(0)
  queue.forEach(({ error, reject }) => reject(error))
}

if (typeof window !== 'undefined') {
  window.addEventListener('hcaptcha-verified', replayPendingHcaptchaRequests)
  window.addEventListener('hcaptcha-cancelled', rejectPendingHcaptchaRequests)
}

request.interceptors.request.use(
  config => {
    // 修复: token 改用 httpOnly cookie(后端自动通过 Set-Cookie 下发)
    // 浏览器自动随同源请求携带,前端无需手动管理 Authorization 头
    // 兼容: 如果用户还在用旧版本(sessionStorage 有 token),仍可工作
    const token = sessionStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    console.error('响应错误:', error)

    if (error.response) {
      const status = error.response.status
      const message = error.response.data?.msg || '请求失败'
      const errorCode = error.response.data?.errorCode || error.response.data?.code
      const url = error.config?.url || ''

      if (errorCode === 'HCAPTCHA_REQUIRED') {
        // 修复 H04：将被拦截请求入队，验证完成重放；不再直接 reject 导致配置加载等丢失。
        // 调用方拿到一个待 resolve 的 Promise，验证成功后重放原请求并 resolve，失败则 reject。
        if (!hcaptchaChecking) {
          hcaptchaChecking = true
          window.dispatchEvent(new CustomEvent('hcaptcha-required'))
          setTimeout(() => { hcaptchaChecking = false }, 5000)
        }
        const wasRetried = error.config?.__hcaptchaRetried
        if (wasRetried) {
          // 已重放过一次仍被拦截，说明验证未真正完成，交给调用方处理
          return Promise.reject(error)
        }
        return new Promise((resolve, reject) => {
          pendingHcaptchaQueue.push({
            config: { ...error.config, __hcaptchaRetried: true },
            error,
            resolve,
            reject
          })
        })
      }

      if (status === 401) {
        // /login、/register、/auth/me、/users/me 等路径的 401 由调用方自行处理
        const skipRedirectPaths = ['/login', '/register', '/users/me', '/auth/me']
        const shouldSkip = skipRedirectPaths.some(p => url.includes(p))

        if (!shouldSkip) {
          // 防抖：首个 401 处理跳转，其余 401 直接 reject 不重复弹窗/跳转
          if (!isHandling401) {
            isHandling401 = true
            ElMessage.error('登录已过期，请重新登录')
            // 清除 sessionStorage 中的 token
            sessionStorage.removeItem('token')
            // 使用 location.href 跳转，避免在拦截器中引入 router 实例导致循环依赖
            // 同时拼接 redirect 参数，登录后可回到原页面（排除 /login 自身避免死循环）
            const currentPath = window.location.pathname
            const redirect = currentPath && currentPath !== '/login' ? currentPath : '/'
            setTimeout(() => {
              window.location.href = '/login?redirect=' + encodeURIComponent(redirect)
            }, 500)
          }
        }
      } else if (status === 403) {
        if (!url.includes('/hcaptcha/')) {
          ElMessage.error(message || '权限不足')
        }
      } else if (status === 404) {
        ElMessage.error('请求的资源不存在')
      } else if (status === 500) {
        ElMessage.error('服务器错误')
      } else {
        if (!url.includes('/hcaptcha/')) {
          ElMessage.error(message)
        }
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接')
    }

    return Promise.reject(error)
  }
)

export default request
