<template>
  <div class="r-login--page">
    <div class="r-login--container">
      <!-- 左侧装饰 -->
      <div class="r-login--banner">
        <div class="r-login--banner_content">
          <img src="https://static.codemao.cn/community/shequ_logo.png" alt="编程狗社区" class="r-login--logo" referrerpolicy="no-referrer">
          <h2>欢迎来到编程狗社区</h2>
          <p>发现、分享、创作有趣的编程作品</p>
          <div class="r-login--features">
            <div class="r-login--feature_item">
              <span class="r-login--feature_icon r-login--feature_icon_work"></span>
              <span>分享作品</span>
            </div>
            <div class="r-login--feature_item">
              <span class="r-login--feature_icon r-login--feature_icon_chat"></span>
              <span>交流互动</span>
            </div>
            <div class="r-login--feature_item">
              <span class="r-login--feature_icon r-login--feature_icon_trophy"></span>
              <span>展示才华</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 右侧表单 -->
      <div class="r-login--form_wrapper">
        <div class="r-login--form_header">
          <h3>编程猫账号登录</h3>
          <p>使用编程猫账号登录社区</p>
        </div>
        
        <el-form 
          ref="formRef" 
          :model="form" 
          :rules="rules" 
          label-width="0"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input 
              v-model="form.username" 
              placeholder="编程猫用户名/手机号/邮箱"
              size="large"
              class="r-login--input"
            />
          </el-form-item>
          
          <el-form-item prop="password">
            <el-input 
              v-model="form.password" 
              type="password"
              placeholder="编程猫密码"
              size="large"
              show-password
              class="r-login--input"
            />
          </el-form-item>
          
          <el-form-item v-if="geetestEnabled">
            <GeetestCaptcha ref="geetestRef" scene="login" @success="onGeetestSuccess" @ready="onGeetestReady" />
          </el-form-item>
          
          <el-form-item>
            <el-button 
              type="primary" 
              size="large" 
              :loading="loading"
              class="r-login--submit_btn"
              native-type="submit"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>
        

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import GeetestCaptcha from '@/components/GeetestCaptcha.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const formRef = ref(null)
const loading = ref(false)
const geetestRef = ref(null)
const geetestEnabled = ref(true)
const geetestValidated = ref(false)
// popup 型极验: 首次点登录只弹窗不提交,验证成功后需二次点击才发起登录请求,
// 常被用户当成"点击没反应"。用一个标志在验证成功后自动再次提交登录。
let autoSubmitLogin = false

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入编程猫用户名/手机号/邮箱', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入编程猫密码', trigger: 'blur' }
  ]
}

const onGeetestReady = (data) => {
  geetestEnabled.value = data.enabled
}

const onGeetestSuccess = () => {
  geetestValidated.value = true
  // 修复: popup 极验验证通过后,若本次点击是由登录触发,则自动再次提交登录请求,
  // 免去"必须先点一次登录弹窗、再点一次才发送请求"的二次点击,避免被误判为登录没反应。
  if (autoSubmitLogin) {
    autoSubmitLogin = false
    handleLogin()
  }
}

const handleLogin = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  if (geetestEnabled.value && !geetestValidated.value) {
    // popup 是弹窗型：GeetestCaptcha 未内嵌 appendTo，点击登录时触发 showCaptcha 弹窗
    // 标记本次点击旨在弹窗，验证成功后由 onGeetestSuccess 自动继续提交
    autoSubmitLogin = true
    if (geetestRef.value) geetestRef.value.verify()
    return
  }
  
  autoSubmitLogin = false
  loading.value = true
  try {
    const geetestData = geetestEnabled.value && geetestRef.value ? geetestRef.value.getValidateData() : {}
    const res = await userStore.login(form.username, form.password, geetestData)
    if (res && res.code === 200) {
      ElMessage.success('登录成功')
      const redirect = route.query.redirect || '/'
      router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/')
    } else {
      ElMessage.error(res?.msg || '登录失败')
      if (geetestRef.value) geetestRef.value.reset()
      geetestValidated.value = false
    }
  } catch (error) {
    console.error('登录错误:', error)
    ElMessage.error(error.message || '登录失败')
    if (geetestRef.value) geetestRef.value.reset()
    geetestValidated.value = false
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
$primary-color: #FEC433;
$primary-hover: #FFD700;
$primary-light: #FFF9E6;
$text-color: #333;
$text-secondary: #666;
$text-muted: #999;

.r-login--page {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ed 100%);
}

.r-login--container {
  display: flex;
  max-width: 900px;
  width: 100%;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
  
  @media (max-width: 768px) {
    flex-direction: column;
  }
}

.r-login--banner {
  flex: 1;
  background: linear-gradient(135deg, $primary-color 0%, $primary-hover 100%);
  padding: 60px 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  @media (max-width: 768px) {
    padding: 40px 24px;
  }
  
  .r-login--banner_content {
    text-align: center;
    color: $text-color;
    
    .r-login--logo {
      height: 48px;
      margin-bottom: 24px;
    }
    
    h2 {
      font-size: 28px;
      font-weight: 600;
      margin: 0 0 12px;
    }
    
    p {
      font-size: 16px;
      opacity: 0.8;
      margin: 0 0 40px;
    }
  }
  
  .r-login--features {
    display: flex;
    gap: 32px;
    justify-content: center;
    
    .r-login--feature_item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      
      .r-login--feature_icon {
        width: 32px;
        height: 32px;
        
        &.r-login--feature_icon_work {
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z'/%3E%3C/svg%3E") no-repeat center;
          background-size: contain;
        }
        
        &.r-login--feature_icon_chat {
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z'/%3E%3C/svg%3E") no-repeat center;
          background-size: contain;
        }
        
        &.r-login--feature_icon_trophy {
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z'/%3E%3C/svg%3E") no-repeat center;
          background-size: contain;
        }
      }
      
      span:last-child {
        font-size: 14px;
        opacity: 0.8;
      }
    }
  }
}

.r-login--form_wrapper {
  width: 380px;
  padding: 60px 40px;
  flex-shrink: 0;
  
  @media (max-width: 768px) {
    width: 100%;
    padding: 40px 24px;
  }
  
  .r-login--form_header {
    text-align: center;
    margin-bottom: 24px;
    
    h3 {
      font-size: 24px;
      font-weight: 600;
      color: $text-color;
      margin: 0 0 8px;
    }
    
    p {
      font-size: 14px;
      color: $text-muted;
      margin: 0;
    }
  }
  
  .r-login--input {
    :deep(.el-input__wrapper) {
      border-radius: 8px;
      box-shadow: 0 0 0 1px #dcdfe6 inset;
      
      &:hover {
        box-shadow: 0 0 0 1px $primary-color inset;
      }
      
      &.is-focus {
        box-shadow: 0 0 0 2px rgba($primary-color, 0.3) inset;
      }
    }
  }
  
  .r-login--submit_btn {
    width: 100%;
    height: 48px;
    font-size: 16px;
    border-radius: 8px;
    background: $primary-color;
    border-color: $primary-color;
    color: $text-color;
    font-weight: 500;
    
    &:hover {
      background: $primary-hover;
      border-color: $primary-hover;
    }
  }
  
}
</style>
