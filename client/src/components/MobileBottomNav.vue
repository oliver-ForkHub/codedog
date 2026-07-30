<template>
  <nav class="mobile-nav" aria-label="手机端主导航">
    <router-link v-for="item in items" :key="item.to" :to="item.to" class="mobile-nav__item" :class="{ 'is-active': item.match(route.path) }">
      <el-icon><component :is="item.icon" /></el-icon>
      <span>{{ item.label }}</span>
    </router-link>
    <button class="mobile-nav__create" type="button" @click="goCreate" aria-label="发布作品">
      <span><el-icon><Plus /></el-icon></span>
      <b>创作</b>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HomeFilled, Compass, ChatDotRound, User, Plus } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const myPage = computed(() => {
  if (!userStore.isLoggedIn) return '/login'
  const codemaoId = userStore.user?.codemao_user_id
  return codemaoId ? `/user/${codemaoId}` : '/profile'
})
const items = computed(() => [
  { label: '首页', to: '/', icon: HomeFilled, match: p => p === '/' },
  { label: '发现', to: '/works', icon: Compass, match: p => p.startsWith('/work') && !p.startsWith('/work_shop') },
  { label: '论坛', to: '/community', icon: ChatDotRound, match: p => p.startsWith('/community') || p.startsWith('/post/') },
  { label: '我的', to: myPage.value, icon: User, match: p => p.startsWith('/user/') || ['/profile','/login','/my-works','/favorites','/notifications'].some(x => p.startsWith(x)) }
])
const goCreate = () => router.push(userStore.isLoggedIn ? '/publish' : { path: '/login', query: { redirect: '/publish' } })
</script>

<style scoped>
.mobile-nav{display:none}
@media(max-width:768px){
  .mobile-nav{position:fixed;z-index:2200;left:10px;right:10px;bottom:max(8px,env(safe-area-inset-bottom));height:64px;padding:5px 4px;background:rgba(255,255,255,.94);border:1px solid rgba(214,222,235,.9);border-radius:18px;box-shadow:0 12px 38px rgba(22,34,57,.18);backdrop-filter:blur(18px);display:grid;grid-template-columns:repeat(5,1fr)}
  .mobile-nav__item{min-width:0;display:grid;grid-template-rows:36px 12px;place-items:center;gap:3px;color:#7a8597;font-size:10px;font-weight:600;line-height:12px;transition:.18s ease}
  .mobile-nav__item>span{line-height:12px}.mobile-nav__item :deep(.el-icon){align-self:center;font-size:20px}.mobile-nav__item.is-active{color:#172033}.mobile-nav__item.is-active :deep(.el-icon){color:#e5a900}
  .mobile-nav__item:nth-child(3){grid-column:4}.mobile-nav__item:nth-child(4){grid-column:5}
  .mobile-nav__create{grid-column:3;grid-row:1;min-width:0;min-height:0;padding:0;border:0;background:transparent;color:#172033;font:700 10px/12px sans-serif;display:grid;grid-template-rows:36px 12px;place-items:center;gap:3px}
  .mobile-nav__create span{flex:none;width:36px;height:36px;border-radius:12px;background:#fec433;display:grid;place-items:center;box-shadow:0 2px 8px rgba(224,162,0,.2)}.mobile-nav__create :deep(.el-icon){font-size:20px}
  .mobile-nav__create b{font:inherit;line-height:12px}
}
</style>
