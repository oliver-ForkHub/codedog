<template>
  <div class="geetest-captcha">
    <div ref="captchaBox" class="geetest-captcha--box"></div>
    <div v-if="loading" class="geetest-captcha--loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载验证码...</span>
    </div>
    <div v-if="error" class="geetest-captcha--error">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ error }}</span>
      <el-button size="small" text @click="init">重试</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { geetestApi } from '@/api/geetest'
import { Loading, WarningFilled } from '@element-plus/icons-vue'

const props = defineProps({
  scene: { type: String, default: 'login' }
})

const emit = defineEmits(['success', 'error', 'ready'])

const captchaBox = ref(null)
const loading = ref(false)
const error = ref('')
const captchaObj = ref(null)
const validated = ref(false)
const validateData = ref(null)
const config = ref(null)

// 极验4 基础脚本 USED 缓存标识，避免重复注入
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
      // 修复 M07：加载失败移除失效 script 节点并重置缓存，否则重试命中失效节点永远挂起。
      script.remove()
      gt4ScriptPromise = null
      reject(new Error('极验4脚本加载失败'))
    }
    document.head.appendChild(script)
  })
  return gt4ScriptPromise
}

const init = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const configRes = await geetestApi.getConfig()
    if (configRes.code !== 200 || !configRes.data.enabled) {
      emit('ready', { enabled: false })
      loading.value = false
      return
    }
    
    config.value = configRes.data
    
    // 检查该场景是否需要验证
    if (!configRes.data.scenes[props.scene]) {
      emit('ready', { enabled: false })
      loading.value = false
      return
    }
    
    const registerRes = await geetestApi.register()
    if (registerRes.code !== 200 || !registerRes.data || !registerRes.data.captcha_id) {
      throw new Error('验证码注册失败')
    }
    
    const captchaId = registerRes.data.captcha_id
    const product = configRes.data.product || 'popup'
    
    // 先确保极验4脚本就绪,再初始化
    // 修复: 对外部脚本加载加 12s 超时兜底。该脚本来自 static.geetest.com,
    // 在境外网络下可能长时间挂起(既不 load 也不 error),原代码会在这里无限等待,
    // 导致验证码永不渲染、captchaObj 恒为空、登录页永久空白且点登录无任何反应。
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
    // 修复: 初始化失败时也通知父组件禁用验证码,否则用户无法通过验证
    emit('ready', { enabled: false })
    emit('error', e)
  }
}

const loadCaptcha = async (captchaId, product) => {
  try {
    await geetestApi.recordShow(props.scene)
  } catch (e) {
    console.error('记录验证码展示失败:', e)
  }
  
  if (typeof window.initGeetest4 !== 'function') {
    throw new Error('极验4脚本未加载')
  }
  
  window.initGeetest4({
    captchaId,
    product,
    nativeButton: { width: '100%' }
  }, (captcha) => {
    captchaObj.value = captcha
    
    // 极验4: 仅 float 模式才用 appendTo 内嵌渲染; popup/bind 的 appendTo 无效,
    // 需由登录/业务触发 verify()(内部调用 showCaptcha) 弹窗。
    if (product === 'float' && captchaBox.value) {
      captcha.appendTo(captchaBox.value)
    }
    
    captcha.onReady(() => {
      loading.value = false
      emit('ready', { enabled: true, product })
    })
    
    captcha.onSuccess(() => {
      const result = captcha.getValidate()
      if (result) {
        validateData.value = {
          geetest_lot_number: result.lot_number,
          geetest_captcha_output: result.captcha_output,
          geetest_pass_token: result.pass_token,
          geetest_gen_time: result.gen_time
        }
        validated.value = true
        emit('success', validateData.value)
      }
    })
    
    captcha.onError(() => {
      error.value = '验证码加载出错'
      loading.value = false
      emit('error', new Error('验证码加载出错'))
    })
    
    captcha.onClose(() => {
      validated.value = false
      validateData.value = null
    })
  })
}

const getValidateData = () => {
  return validateData.value
}

const reset = () => {
  if (captchaObj.value) {
    captchaObj.value.reset()
    validated.value = false
    validateData.value = null
  }
}

const verify = () => {
  // 修复: captchaObj 未就绪(初始化未完成/加载失败)时不能静默空转,
  // 原代码直接无操作,导致登录页"点了登录既看不到验证码、也不发登录请求"。
  // 改为在组件内显示明确错误提示,让用户知道是验证码还没准备好而非登录失效。
  if (!captchaObj.value) {
    error.value = '验证码尚未加载完成，请稍候重试或点上方重试'
    loading.value = false
    return
  }
  // GT4 手动触发验证弹窗使用 showCaptcha()
  captchaObj.value.showCaptcha()
}

onMounted(() => {
  init()
})

onUnmounted(() => {
  if (captchaObj.value) {
    captchaObj.value.destroy()
  }
})

watch(() => props.scene, () => {
  if (captchaObj.value) {
    captchaObj.value.destroy()
    captchaObj.value = null
  }
  init()
})

defineExpose({
  getValidateData,
  reset,
  verify,
  validated
})
</script>

<style lang="scss">
.geetest-captcha {
  width: 100%;
  
  &--box {
    min-height: 44px;
  }
  
  &--loading,
  &--error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 4px;
    color: #909399;
    font-size: 14px;
  }
  
  &--error {
    color: #f56c6c;
  }
}
</style>
