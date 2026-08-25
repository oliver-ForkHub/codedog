<template>
  <el-dialog
    v-model="visible"
    title="安全验证"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    destroy-on-close
    @open="onOpen"
    @closed="cancel"
  >
    <div v-if="loading" class="geetest-dialog--loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载验证码...</span>
    </div>
    <div v-if="error" class="geetest-dialog--error">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ error }}</span>
      <el-button size="small" text @click="initCaptcha">重试</el-button>
    </div>
    <div ref="captchaBox" class="geetest-dialog--box"></div>
    <template #footer>
      <el-button @click="cancel">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { Loading, WarningFilled } from '@element-plus/icons-vue'
import { geetestApi } from '@/api/geetest'

const visible = ref(false)
const captchaBox = ref(null)
const loading = ref(false)
const error = ref('')
const captchaObj = ref(null)
const resolvePromise = ref(null)
const currentScene = ref('')

// 极验4 脚本加载缓存,避免重复注入
let gt4ScriptPromise = null
const loadGt4Script = () => {
  if (window.initGeetest4) return Promise.resolve()
  if (gt4ScriptPromise) return gt4ScriptPromise
  gt4ScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gt4-loader="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('极验4脚本加载失败')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://static.geetest.com/v4/gt4.js'
    script.dataset.gt4Loader = 'true'
    script.onload = () => resolve()
    script.onerror = () => {
      // 修复 M07：加载失败移除失效 script 节点并重置缓存，否则重试会命中失效节点永远挂起。
      script.remove()
      gt4ScriptPromise = null
      reject(new Error('极验4脚本加载失败'))
    }
    document.head.appendChild(script)
  })
  return gt4ScriptPromise
}

const onOpen = () => {
  initCaptcha()
}

const initCaptcha = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const configRes = await geetestApi.getConfig()
    if (configRes.code !== 200 || !configRes.data.enabled) {
      if (resolvePromise.value) {
        resolvePromise.value({})
        resolvePromise.value = null
      }
      visible.value = false
      return
    }
    
    if (!configRes.data.scenes[currentScene.value]) {
      if (resolvePromise.value) {
        resolvePromise.value({})
        resolvePromise.value = null
      }
      visible.value = false
      return
    }
    
    const registerRes = await geetestApi.register()
    if (registerRes.code !== 200 || !registerRes.data || !registerRes.data.captcha_id) {
      throw new Error('验证码注册失败')
    }
    
    const captchaId = registerRes.data.captcha_id
    const product = configRes.data.product || 'popup'

    // 先确保极验4脚本就绪,再初始化
    // 修复 M10：对脚本加载加 12s 超时兜底（与 GeetestCaptcha.vue 一致），
    // 半连接下既不 load 也不 error 时避免永久挂起。
    await Promise.race([
      loadGt4Script(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('验证码脚本加载超时，请检查网络后重试')), 12000)
      )
    ])
    loadCaptcha(captchaId, product)
  } catch (e) {
    error.value = e.message || '验证码初始化失败'
    loading.value = false
    // 修复 M09：初始化失败时不再提前 resolve({}) 并清空 resolvePromise。
    // 此前提前 resolve 后用户点「重试」即使验证成功，onSuccess 因 resolvePromise 已为空
    // 无法把验证字段回传调用方。现在仅显示错误+重试按钮，保留调用上下文，让真正重试能完成原操作。
  }
}

// 修复 M08：统一取消/关闭路径 settle(null)，避免调用方 Promise 永挂。
// cancel 同时关闭弹窗（设置 visible=false），@closed 回调再做幂等兜底（此时 resolvePromise 已为空）。
const cancel = () => {
  if (resolvePromise.value) {
    resolvePromise.value(null)
    resolvePromise.value = null
  }
  visible.value = false
}

const loadCaptcha = (captchaId, product) => {
  if (typeof window.initGeetest4 !== 'function') {
    throw new Error('极验4脚本未加载')
  }
  
  window.initGeetest4({
    captchaId,
    product,
    nativeButton: { width: '100%' }
  }, (captcha) => {
    captchaObj.value = captcha
    
    captcha.onReady(() => {
      loading.value = false
      // 极验4 语义: float 用 appendTo 内嵌; popup/bind 的 appendTo 无效,
      // 必须在 onReady 之后调用 showCaptcha() 弹窗。若不弹，用户将看到空对话框。
      if (product === 'bind' || product === 'popup') {
        captcha.showCaptcha()
      }
    })
    
    captcha.onSuccess(() => {
      const result = captcha.getValidate()
      if (result && resolvePromise.value) {
        resolvePromise.value({
          geetest_lot_number: result.lot_number,
          geetest_captcha_output: result.captcha_output,
          geetest_pass_token: result.pass_token,
          geetest_gen_time: result.gen_time
        })
        resolvePromise.value = null
      }
      visible.value = false
    })
    
    captcha.onError(() => {
      error.value = '验证码加载出错'
      loading.value = false
    })
    
    // 修复: 检查 DOM ref 是否存在,避免组件卸载后 appendTo(null) 抛错
    if (product !== 'bind' && captchaBox.value) {
      captcha.appendTo(captchaBox.value)
    }
  })
}

const show = (sceneName) => {
  return new Promise((resolve) => {
    currentScene.value = sceneName
    resolvePromise.value = resolve

    geetestApi.getConfig().then(configRes => {
      if (configRes.code !== 200 || !configRes.data.enabled) {
        resolve({})
        resolvePromise.value = null
        return
      }

      if (!configRes.data.scenes[sceneName]) {
        resolve({})
        resolvePromise.value = null
        return
      }

      geetestApi.recordShow(sceneName).catch(e => {
        console.error('记录验证码展示失败:', e)
      })

      visible.value = true
    }).catch(e => {
      console.error('检查验证码配置失败:', e)
      resolve({})
      resolvePromise.value = null
    })
  })
}

onUnmounted(() => {
  if (captchaObj.value) {
    try { captchaObj.value.destroy() } catch (e) { /* ignore */ }
    captchaObj.value = null
  }
  // 修复 M08：卸载时统一按取消语义 settle(null)，避免调用方永挂
  if (resolvePromise.value) {
    resolvePromise.value(null)
    resolvePromise.value = null
  }
})

defineExpose({
  show
})
</script>

<style lang="scss">
.geetest-dialog {
  &--loading,
  &--error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px;
    color: #909399;
    font-size: 14px;
  }
  
  &--error {
    color: #f56c6c;
  }
  
  &--box {
    min-height: 44px;
  }
}
</style>
