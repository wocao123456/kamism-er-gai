# Changelog

所有显著变更均记录于此。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [未发布] — 2026-05-29

### 新增

- **全局操作日志（管理员端）**：管理员 Dashboard 新增全局操作日志区块（第二位置），查询所有 `operation_logs` 表数据
- **商户操作日志（商户端）**：商户 Dashboard 新增按 `user_id` 过滤的操作日志区块（仅显示当前账号操作），放在第二位置
- **主题跟随系统**：默认检测系统 `prefers-color-scheme` 偏好，亮色系统→亮模式，暗系统→暗模式；优先读取 localStorage 缓存
- **呼吸动画线条**：所有统计卡片顶部线条添加 `card-breathe` 呼吸动画（box-shadow 脉冲 + 背景扫光），每条线使用各自颜色。涉及：注册商户、应用总数、卡密总数、活跃卡密、激活次数、卡密IP访问、绑定设备、近30天激活、使用中
- **服务依赖状态自适应**：`service-deps-grid` 使用 `grid-template-columns: repeat(auto-fit, minmax(130px, 1fr))` 自适应网格，修复重叠问题
- **API文档移动端适配**：API文档页面添加响应式CSS，手机端请求头/请求体/代码示例垂直堆叠布局，使用 `useIsMobile` hook 彻底修复响应式
- **数据库迁移**：创建 `010_operation_logs.sql`（操作日志表）和 `011_api_keys_merchant_id.sql`（API密钥商户隔离字段），均带 `IF NOT EXISTS`

### 修改

- **侧边栏分区**：管理员侧边栏添加 `hideForAdmin` 标记（隐藏商户总览和代理管理），添加 "── 商户功能 ──" 分隔符
- **API管理移入商户功能区域**：API管理从 admin 导航移至 merchant 导航（路由 `/api-manage`），管理员和商户均可访问，每个商户数据独立不互通
- **API文档布局优化**：请求头和请求体改为上下排列（`flexDirection: column`）
- **后端操作日志**：`admin.rs` 中 `op_logs` 从 `activation_alerts` 改为 `operation_logs` 表，列名对齐数据库 schema（`ip_address`、`user_agent`）
- **商户操作日志路由**：`merchant.rs` 新增 `/merchant/op-logs`，按 `Claims.sub` 过滤当前商户日志
- **API密钥商户隔离**：`api_keys.rs` 添加 `auth_middleware`、list 查询加入 `WHERE merchant_id = $1`、create 插入绑定 `merchant_id`
- **前端 ApiManage 组件**：所有 API 请求添加 `Authorization` 头，确保商户隔离鉴权

### 修复

- **TypeScript 编译错误**：修复 Layout.tsx `Shield` 未使用、`user.charAt(0)` 不存在、admin Dashboard `RefreshCw` 未使用、ApiDocs 重复 `gap` 属性、NavItem 缺少 `hideForAdmin` 属性、separator 对象缺少 `icon` 等多个编译错误
- **Rust 编译错误**：`api_keys.rs` 添加 `use axum::middleware` 导入
- **数据库迁移对齐**：由于 git reset 导致迁移文件丢失（007-010），重新创建带 `IF NOT EXISTS` 的迁移文件，删除 DB 中旧的迁移记录让 sqlx 重新应用
- **后端列名修复**：`ip` → `ip_address`，修复运行时报错

---

## [1.0.0] — 2025-05-20

### 新增

- 多级代理分销体系
- IP 风控黑名单
- API 密钥管理
- Webhook 事件推送
- 服务健康监控
- 自定义卡密前缀
- 卡密导出功能
- API 文档在线查看
- 管理员端服务状态监控
- 首屏加载性能优化
- 数据库连接优化

### 修复

- 禁用卡密验证漏洞
- 注入风险优化
- 公告弹窗体验优化

---

## [0.1.0] — 2025-05-01

### 初始版本

- 基于 Tauri 2.0 + Rust (Axum) + React + PostgreSQL + Redis + RabbitMQ 构建
- 基础卡密管理功能
- 多商户隔离
- 多应用管理
- 多设备绑定
- 管理员/商户角色体系
