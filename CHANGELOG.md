# KamiSM 更新日志

所有重要变更都会记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [未发布] - 2026-05-31

### 二改修复日志
- 修复三方 OAuth 聚合登录：配置改为后端持久化，支持通用服务地址、登录接口、用户信息接口、回调地址和启用类型。
- 新增 OAuth 回调完成页，授权成功后自动写入登录态；首次 OAuth 登录自动创建商户账号。
- 修复 OAuth GitHub/QQ 返回字段兼容：支持数字型 `social_uid`、真实邮箱、外链头像，并同步到商户资料。
- 修复 OAuth 旧账号登录查询不存在 `role` 字段导致失败的问题。
- 修复管理员/商户背景图持久化与隔离：上传后立即同步全局状态，刷新/重登继续从后端读取。
- 修复自定义背景被根容器覆盖的问题，改为全局固定背景层显示。
- 修复侧栏头像同步：支持本地头像路径和 OAuth 外链头像。
- 修复 `admin@kamism.local` 影子账号自动生成问题，删除前端硬编码登录与后端启动生成逻辑。
- 修复管理员商户功能外键失败：管理员商户上下文按当前管理员 ID 兜底重建。
- 修复邮箱换绑完整流程：按当前用户 ID 更新，同步 admins/merchants，商户邮箱继续加密存储并更新 hash。
- 邮箱/密码修改成功后自动退出并跳转登录页，避免旧 token 显示旧信息。
- 修复 API Key 重新生成格式与加密方式，恢复 `km_` 格式并统一使用加密字段工具写入 hash。
- 修复密码错误提示乱码、侧栏分隔符乱码、OAuth 配置商户可见等问题。

---

## [未发布] - 2026-05-30

### 新功能
- **侧边栏2x2网格布局**：底部按钮改为2x2网格，包含「我的」「设置」「暗色模式」「退出」
- **「我的」页面独立路由**：从 `/admin/profile` 改为 `/profile`，admin 和 merchant 角色均可访问
- **全新的「我的」页面**：美观的用户信息管理页面
  - 头像上传（支持点击更换，hover显示"更换"提示，边框改为简洁2px solid var(--border-light)）
  - 用户名点击直接编辑，实时保存
  - API Key 折叠面板（默认脱敏显示 `****`，点击展开查看完整Key）
  - API Key 重新生成功能
  - 邮箱换绑功能（输入新邮箱→获取验证码→验证→换绑，带60秒倒计时）
  - 修改密码弹窗（原密码/新密码/确认密码，三字段校验）
- **「设置」页面独立路由**：包含自定义背景和OAuth配置
- **自定义背景上传**：支持上传背景图保存到服务器磁盘，换系统迁移保留
- **三方OAuth自定义配置**（原素颜聚合登录）
  - 支持 13 种登录方式：QQ/微信/支付宝/微博/百度/抖音/华为/Google/Microsoft/Twitter/钉钉/Gitee/GitHub
  - AppID + AppKey（密码框输入）+ 回调地址配置
  - 多选启用的登录方式，点击切换
  - 根据配置动态显示登录按钮，通过素颜聚合登录API获取跳转地址
- **nginx 代理修复**：删除独立 `/profile` location，统一走 `/api/` 代理
- **Authorization header 转发**：nginx 所有 API location 正确转发 `Authorization` header
- **前端 api() 统一前缀**：所有请求统一走 `/api/xxx`，彻底修复 `/profile` 页面刷新401问题
- **操作日志详情增强**：对 `/profile/upload-background`、`/profile/upload-avatar`、`/profile/api-key`、`/profile/change-password`、`/profile/change-email` 等做中文映射（上传背景/上传头像/重新生成Key/修改密码/更换邮箱）
- **Dashboard 操作日志中文映射**：`formatLogDetail` 函数映射所有profile相关路径
- **移动端响应式**：侧边栏支持移动端 overlay + hamburger menu

### Bug修复
- 头像上传返回 401 错误修复（nginx `proxy_set_header Authorization $http_authorization`）
- `/profile` 页面刷新 401 错误修复（删除nginx独立 `/profile` location）
- 登录页 TypeScript 编译错误（移除不存在的 lucide-react 导出 `Chrome`、`Qq`）
- 设置页面 TypeScript 编译错误（移除未使用的 `Plus`、`X` 导入）
- 设置页面 title 「登录快捷设置」→「登录快捷配置」
- auth.ts 模板字符串语法错误（`Bearer ${token}` 改为 `'Bearer ' + token`）
- auth.ts `refreshProfile` 函数修复，token 过期自动刷新
- 操作日志中显示详细路径 `/profile/upload-background` 改为中文描述
- Dashboard.tsx `getActionLabel` 返回值类型变更导致 TS2322 错误修复
- 头像 404 问题（浏览器缓存旧头像路径，清理缓存解决）

### UI改进
- 头像边框去除紫色圆环，改为简洁 `2px solid var(--border-light)`
- 「我的」页面统一使用 `card` + `btn` 标准风格
- API Key / 邮箱换绑折叠面板美化：展开时紫色背景高亮 `rgba(124,106,247,0.08)` + 紫色边框 `rgba(124,106,247,0.2)`
- 折叠面板箭头图标展开时变为主题色 `var(--accent)`
- 折叠面板整体可点击区域增大，用户体验更好
- 设置页面 OAuth 配置按钮美化（圆角 `border-radius: 8`、过渡动画 `transition: all 0.2s`）
- 侧边栏底部2x2网格布局，按钮间距 `gap: 6`，hover 背景 `var(--bg-hover)`
- 侧边栏用户头像区域边框 `2px solid var(--border-light)`

### 架构改进
- 前后端 API 统一前缀策略（统一走 `/api`，不再有特殊路径）
- nginx SPA fallback 正确处理非 API 路径返回 index.html
- 后端新增 `profile.rs` 路由：`/profile`、`/profile/avatar`、`/profile/api-key`、`/profile/change-password`、`/profile/send-email-code`、`/profile/change-email`
- 后端操作日志中间件增强：记录请求体关键字段

---

## [最新] - 2026-05-29

### Bug修复
- 黑白名单卡密类型：修复黑名单查询遗漏 `card_blacklist` 表，现在支持 `tp=card` 查询
- 黑名单SQL：`card_blacklist` 表没有 `blocked_until` 列，移除错误查询字段
- 操作日志UUID：移除所有日志中的UUID后缀（如"删除卡密 5c0a0d24"改为"删除卡密"）
- API管理toast：统一使用 `react-hot-toast` 库，风格与风控页面一致
- 操作日志过滤：跳过 `/health`、`/api/ts/*`、`/api/frontend-log` 等不需要记录的路径
- API字段对齐：后端返回 `user_type` 字段名与前端一致
- API管理空状态emoji乱码修复，显示纯文本"暂无密钥"
- 统计行清理：移除多余标记，只保留昨天/今天/合并
- 操作日志中间件编译错误修复（body读取、unused vars、classify_module语法）
- op_log中间件：`use bytes::Bytes` 改为 `use http_body_util::BodyExt`
- `classify_module` if链多余闭合括号，改为 `if ... { return ...; }` 模式
- `public_api.rs` 3个unused变量警告修复

### 新功能
- 黑白名单支持卡密类型（`tp=card`），管理员和商户均可操作
- 操作日志显示具体操作内容（如"添加到黑名单"、"删除卡密"等）
- API管理添加/删除/启用密钥时弹幕toast提示
- 操作日志自动过滤健康检查和外部API调用
- `admin/whitelist_stats` 返回 `card_total` 字段

### UI改进
- API管理空状态显示纯文本"暂无密钥"
- 统计行移除 `✅ 0 ❌ 0`，只保留 `昨天 N 条 · 今天 N 条 · 合并 N 条`
- 所有toast提示统一风格（绿色成功/红色失败）
- 操作日志图标美化（渐变圆形背景、彩色标签）

---

## [v1.2.0] - 2026-05-29

### Bug修复
- 操作日志中间件重写：从请求体提取关键字段，返回详细中文detail
- 后端编译错误修复（Rust语法、body读取、unused变量）
- 前端TypeScript类型修复（JSX.Element → React.ReactNode）
- 模板字符串转义导致的JSX语法错误
- `op_log_middleware` 注册到 `lib.rs`，修复中间件从未被调用
- 清理未使用的lucide-react导入

### 新功能
- 操作日志详细化：显示具体操作如"批量生成30张卡密"、"添加IP到黑名单"
- 操作日志图标：20+种操作的彩色渐变图标（登录/删除/新建/修改等）
- 操作日志分类：完善 `classify_action()` 和 `classify_module()` 中文映射
- API文档英文改中文（Fixed value → 固定值，auth_key说明等）
- 中间件记录所有写操作含未认证请求

### UI改进
- 操作日志渐变圆形背景、彩色标签、模块名圆角标签
- 用户类型胶囊（管理员红色/商户蓝色）
- 层级布局优化（图标圆形 → 右侧文字区）
- 主题跟随系统深色/浅色模式

---

## [v1.1.0] - 2026-05-28

### 新功能
- API管理页面：密钥管理、签名测试、加解密测试
- 鉴权密钥自动生成（5分钟有效）
- 调用日志与实时统计（昨天/今天/合并请求数）
- API文档手机端适配

### Bug修复
- 前端路由图标导入修复
- 模板字符串转义修复
- TS命名空间修复
- API管理显示在商户功能区域
- 手机端响应式布局修复（useIsMobile hook）

---

## [v1.0.0] - 2026-05-27

### 首次发布
- 核心功能：卡密管理、商户管理、套餐配置、风控设置
- API接口：激活、验证、解绑、心跳、签名、加解密
- Docker Compose一键部署
- 安全特性：JWT认证、速率限制、设备封禁、IP黑名单
- RabbitMQ消息队列集成
- Redis缓存与会话管理
- PostgreSQL数据库与迁移
- 前端React + 后端Rust Axum全栈架构