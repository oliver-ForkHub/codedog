# 编程狗原生 App

React Native + Expo + TypeScript 客户端。页面由原生组件渲染，不是网站 WebView 套壳。

## 本地运行

```powershell
cd mobile
Copy-Item .env.example .env
npm install
npm run android
```

Android 模拟器可直接使用 `.env.example` 中的 `10.0.2.2` 访问电脑的 3001 端口。真机调试需要把 `EXPO_PUBLIC_API_BASE_URL` 改为电脑局域网 IP，并确保手机可以访问该端口。

当前 MVP 覆盖：

- 五栏原生导航：首页、发现、创作、论坛、我的
- 作品列表、详情、搜索、排序、下拉刷新和分页
- 论坛列表、搜索和帖子详情
- 工作室列表、搜索和详情
- 编程猫账号登录、会话恢复和退出
- 发布编程猫作品与社区帖子

生产环境如果启用了极验，登录、发布和部分互动操作仍需接入原生验证码挑战。消息通知、评论提交、点赞收藏、图片上传、Deep Link、推送通知和原生作品播放器属于后续增强范围。
