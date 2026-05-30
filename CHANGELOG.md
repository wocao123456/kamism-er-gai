# KamiSM 更新日志

所有重要变更都会记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
