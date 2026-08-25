<template>
  <el-dialog
    v-model="visible"
    title="安全验证"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    center
    @closed="handleClosed"
  >
    <div class="hcaptcha-dialog--content">
      <p class="hcaptcha-dialog--tip">当前需要完成安全验证后继续操作。</p>
      <div ref="captchaContainer" class="hcaptcha-dialog--captcha"></div>
      <p v-if="error" class="hcaptcha-dialog--error">{{ error }}</p>
    </div>

    <template #footer>
      <el-button @click="cancel">取消</el-button>
      <el-button v-if="error" type="primary" @click="retry">重试</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { hcaptchaApi } from '@/api/hcaptcha'
import { ElMessage } from 'element-plus'

const visible = ref(false)
const captchaContainer = ref(null)
const error = ref('')
const siteKey = ref('')
const widgetId = ref(null)
const resolvePromise = ref(null)
const currentScene = ref('')

const loadScript = () => {
  return new Promise((resolve, reject) => {
    // 已加载完成（页面任何来源注入的 hcaptcha 均可复用）直接 resolve
    if (window.hcaptcha) {
      resolve()
      return
    }

    const existing = document.querySelector('script[data-hcaptcha-loader="true"]')
    if (existing) {
      // 修复：动态创建的非 IE script 通常没有 readyState 属性。
      // 原逻辑在「脚本已存在但 load 事件已触发过」时会永远等不到 load，导致重复弹出时卡死转圈（弹不出验证码）。
      // 改为始终挂一次性 load/error 监听；若此刻脚本已加载完成，顶部 window.hcaptcha 分支已提前返回。
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('hCaptcha 脚本加载失败')), { once: true })
      return
    }

    // 修复 M04：使用官方 onload 回调，确保 SDK 全局对象完成初始化后再 resolve，
    // 比依赖原生 script.onload 更可靠（onload 仅表示脚本下载执行完，不能保证 hcaptcha 已就绪）。
    const callbackName = '__hcaptchaOnload_' + Date.now()
    let timeoutId = null

    const cleanup = () => {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
      delete window[callbackName]
    }

    window[callbackName] = () => {
      cleanup()
      resolve()
    }

    const script = document.createElement('script')
    // 采用显式渲染(render=explicit): 与本组件用 window.hcaptcha.render() 手动渲染一致,
    // 以避免 EXPLICIT 与 AUTO 模式混用可能导致的渲染不到容器(弹窗只有阴影/占位)。
    // 注意: 该域为境外 CDN,若当前环境加载失败(网络错误/超时),需在代理/网关侧放行下述域名:
    //   js.hcaptcha.com / newassets.hcaptcha.com / hcaptcha.com
    script.src = `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${callbackName}`
    script.async = true
    script.defer = true
    script.dataset.hcaptchaLoader = 'true'
    script.onerror = () => {
      // 修复: 加载失败必须移除该 script 节点，并清理 onload 回调，避免泄漏。
      cleanup()
      script.remove()
      reject(new Error('hCaptcha 脚本加载失败，请检查网络后重试'))
    }
    document.head.appendChild(script)

    // 修复 M06：脚本加载超时兜底。网络半连接/丢包时既不触发 onload 也不触发 error，
    // 原 Promise 会永久挂起，弹窗永远转圈。12s 超时后清理并 reject，让用户可点重试。
    timeoutId = setTimeout(() => {
      cleanup()
      script.onerror = null
      script.remove()
      reject(new Error('hCaptcha 脚本加载超时，请检查网络后重试'))
    }, 12000)
  })
}

const settle = (result) => {
  const resolve = resolvePromise.value
  resolvePromise.value = null
  visible.value = false
  if (resolve) resolve(result)
}

const renderCaptcha = async () => {
  const configRes = await hcaptchaApi.getConfig()
  if (configRes.code !== 200 || !configRes.data.enabled) {
    settle(null)
    return
  }

  siteKey.value = configRes.data.site_key
  if (!siteKey.value) {
    throw new Error('hCaptcha site key 未配置')
  }

  await loadScript()

  try {
    await hcaptchaApi.recordShow(currentScene.value)
  } catch (e) {
    console.error('记录 hCaptcha 展示失败:', e)
  }

  if (captchaContainer.value) {
    captchaContainer.value.innerHTML = ''
    widgetId.value = window.hcaptcha.render(captchaContainer.value, {
      sitekey: siteKey.value,
      callback: onVerify,
      'error-callback': onError,
      // 官方文档: token 只能使用一次且需尽快校验。
      // 若不注册该回调,用户在验证完成后迟迟不提交、token 过期时,界面不会自动重置,
      // 会造成"验证通过却始终过不了"的假象。
      'expired-callback': onExpired
    })
  }
}

const show = (sceneName) => {
  currentScene.value = sceneName || 'global'
  error.value = ''
  visible.value = true

  return new Promise((resolve) => {
    resolvePromise.value = resolve
    renderCaptcha().catch((e) => {
      // 修复 M05：加载/渲染失败时不要 settle() 关闭弹窗。
      // 此前 catch 立即 settle() 把弹窗关掉，导致 v-if="error" 的「重试」按钮根本看不到。
      // 现在仅设置 error 保留弹窗，用户可点「重试」重新加载；只有用户取消或验证成功才 settle。
      console.error('hCaptcha 加载失败:', e)
      error.value = e.message || '验证码加载失败，请重试'
      ElMessage.error(error.value)
    })
  })
}

const retry = () => {
  error.value = ''
  renderCaptcha().catch((e) => {
    // 修复 M05：重试失败同样保留弹窗，不 settle。
    error.value = e.message || '验证码加载失败，请重试'
    ElMessage.error(error.value)
  })
}

const cancel = () => {
  settle({ verified: false, cancelled: true })
}

const handleClosed = () => {
  if (resolvePromise.value) {
    settle({ verified: false, cancelled: true })
  }
}

const onVerify = async (token) => {
  try {
    const res = await hcaptchaApi.verify(token, currentScene.value)
    if (res.code === 200) {
      settle({ verified: true, expires_at: res.data.expires_at })
    } else {
      error.value = res.msg || '验证失败'
      if (window.hcaptcha && widgetId.value !== null) {
        window.hcaptcha.reset(widgetId.value)
      }
    }
  } catch (e) {
    // 修复: 后端 verify 校验失败时返回 HTTP 400,axios 侧为异常分支。
    // 原逻辑只显示通用文案,把 hCaptcha 官方的具体失败原因(如 invalid-input-secret)
    // 吞掉,用户/开发者无法判断是 secret 填错还是 token 无效。这里从响应里取出真实原因展示。
    error.value = e?.response?.data?.msg || '验证失败，请重试'
    if (window.hcaptcha && widgetId.value !== null) {
      window.hcaptcha.reset(widgetId.value)
    }
  }
}

const onError = () => {
  error.value = '验证出错，请重试'
}

const onExpired = () => {
  error.value = '验证已过期，请重试'
  if (window.hcaptcha && widgetId.value !== null) {
    window.hcaptcha.reset(widgetId.value)
  }
}

onUnmounted(() => {
  if (window.hcaptcha && widgetId.value !== null) {
    try { window.hcaptcha.remove(widgetId.value) } catch (e) { /* ignore */ }
    widgetId.value = null
  }
  if (resolvePromise.value) {
    settle({ verified: false, cancelled: true })
  }
})

defineExpose({ show })
</script>

<style lang="scss" scoped>
.hcaptcha-dialog {
  &--content {
    text-align: center;
    padding: 20px 0;
  }

  &--tip {
    color: #666;
    margin-bottom: 20px;
  }

  &--captcha {
    display: flex;
    justify-content: center;
    min-height: 78px;
  }

  &--error {
    color: #f56c6c;
    margin-top: 15px;
    font-size: 14px;
  }
}
</style>
