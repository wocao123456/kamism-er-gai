<div align=center><img src="https://oss.fly-fly.fun/ext/kamism.png" width="200" height="200"></div>

# KamiSM 二改 — 增强版卡密授权管理系统

> 基于 Tauri 2.0 + Rust (Axum) + React + PostgreSQL + Redis + RabbitMQ 构建的卡密即服务（KaaS）平台。
> 在原项目基础上进行了大量功能增强与安全优化，新增代理分销体系、IP风控黑名单、API密钥管理、Webhook推送、服务健康监控等企业级特性。

---

<div align=center><img src="https://oss.fly-fly.fun/ext/kamiuser.jpg" ></div>

## 简介

本项目是 KamiSM 卡密管理系统的二次开发增强版本。在原版基础上，新增了多级代理分销、IP安全防护、API文档在线查看、数据看板优化、卡密导出、Webhook事件推送等功能，同时修复了已知安全漏洞，对数据库连接、首屏加载等进行了性能优化。

适用于需要对自研软件进行授权控制的开发者与企业，支持多商户隔离、多应用管理、多设备绑定、代理商分润等完整业务链路。

---

## 系统架构

```
┌─────────────────────────────────┐     ┌────────────────────────────────────┐
│       用户电脑                    │     │           云服务器                   │
│                                 │     │                                    │
│  ┌─────────────────────────┐   │     │  ┌──────────────────────────────┐  │
│  │   Tauri 桌面客户端        │   │     │  │   kamism-server (Axum)       │  │
│  │   (纯前端 React UI)       │──HTTP──│  │   REST API + SSE + Webhook   │  │
│  │   无后端服务               │   │     │  └──────────┬─────────────────┘  │
│  └─────────────────────────┘   │     │             │                    │
└─────────────────────────────────┘     │  ┌──────────▼─────────────────┐  │
                                        │  │   PostgreSQL                │  │
┌─────────────────────────────────┐     │  │   Redis（缓存/限速/分布式锁）  │  │
│    第三方软件（商户的软件）         │     │  │   RabbitMQ（异步降级队列）    │  │
│   调用 /api/v1/verify 验证卡密   │─────│  └────────────────────────────┘  │
└─────────────────────────────────┘     └────────────────────────────────────┘
```

**桌面客户端**：纯 UI 管理后台，打包后不含任何后端服务，通过 HTTP 连接云服务器。
**云服务器**：运行 Axum API 服务 + PostgreSQL + Redis + RabbitMQ，处理所有业务逻辑。

---

## 角色体系

| 角色 | 说明 |
|------|------|
| **平台管理员** | 管理所有商户账号、套餐配置、服务状态监控、API密钥管理、发送全站公告/站内信 |
| **商户（上级）** | 注册后创建应用、生成卡密、查看激活记录，可创建下级代理、管理IP/设备黑名单 |
| **商户（代理）** | 使用邀请码加入上级，受配额限制生成卡密，获得激活分润统计 |
| **终端用户** | 通过商户软件内嵌 API 调用激活/验证卡密 |

---

## 二改新增功能

### 🆕 多级代理分销体系
- 生成邀请码邀请下级代理，支持配额划拨与回收
- 分润比例自定义设置，每次激活自动记录分润明细
- 代理可查看上级信息、激活分润记录
- 上级可启用/禁用/解除代理关系

### 🛡️ IP安全防护与风控黑名单
- IP黑名单/设备黑名单手动添加与批量管理
- 异常激活告警：IP频繁激活、设备多卡激活、异地激活检测
- 同一IP短时间内频率限制（防黄牛刷卡）
- SQL注入防护与安全中间件增强

### 🔑 API密钥管理
- 商户级API Key生成、查看、撤销
- 独立的API密钥鉴权体系，无需JWT即可调用开放接口

### 📖 在线API文档
- 管理员端与商户端均可查看API文档
- 接口参数说明、请求示例、响应格式一目了然
- 支持快速复制调用代码

### 📊 数据看板优化
- 重新设计首页数据总览，关键指标一目了然
- 优化首屏加载速度，减少不必要的请求

### 📦 卡密导出功能
- 支持将卡密列表导出为文件，方便线下分发

### 🔔 Webhook事件推送
- 应用可配置Webhook URL
- 卡密激活/验证成功时自动推送事件（HMAC-SHA256签名）

### 🏥 服务健康监控
- 管理员端实时查看 PostgreSQL / Redis / RabbitMQ 运行状态
- 快速定位服务异常

### 📨 站内信与公告系统
- 管理员可发送全站公告或定向站内信
- 商户端实时接收未读提醒（WebSocket推送）
- 优化公告弹窗体验

### 🐛 安全修复
- 修复禁用卡密仍可验证通过的安全漏洞
- 优化WebSocket连接管理，管理员端禁用不必要的长连接

### ⚡ 性能优化
- 数据库连接池优化，减少连接开销
- 首屏渲染优化，提升加载速度
- 管理员接口重构，降低响应延迟

---

## 原有核心功能

- **多商户隔离**：每个商户拥有独立的应用、卡密和数据，互不干扰
- **套餐管理**：免费版/专业版，管理员可配置各套餐的应用数、卡密数、设备数限制
- **异步套餐降级**：专业版到期后通过 RabbitMQ 异步处理，Redis 分布式锁防并发
- **卡密前缀/格式自定义**：生成卡密时可指定前缀和格式
- **批量延期/缩短**：支持对选中卡密批量调整有效期
- **多设备支持**：每张卡密可配置最大绑定设备数（1~100 台）
- **联网验证**：软件每次启动调用 API 验证，服务端实时校验有效期和设备绑定
- **邮箱注册验证**：注册时发送 6 位数字验证码（Redis 存储，10 分钟有效，60 秒防刷）
- **批量生成卡密**：支持一次生成 1~1000 张
- **卡密生命周期管理**：未使用 / 使用中 / 已过期 / 已禁用（可重新启用）
- **设备解绑**：商户可手动解绑指定设备
- **无感续期**：Access Token 2小时过期后自动用 Refresh Token 刷新
- **字段级数据加密**：AES-256-GCM + SHA256 哈希索引，敏感数据加密存储

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面客户端 | [Tauri 2.0](https://tauri.app/)（纯前端壳） |
| 前端 UI | React 18 + TypeScript + Vite + Zustand 状态管理 |
| 后端服务 | Rust + [Axum](https://github.com/tokio-rs/axum) |
| 数据库 | PostgreSQL + [SQLx](https://github.com/launchbadge/sqlx) |
| 缓存 | Redis（验证码、Rate Limiting、分布式锁） |
| 消息队列 | RabbitMQ + [lapin](https://github.com/amqp-rs/lapin) |
| 认证 | JWT Access Token + Refresh Token，bcrypt 密码加密 |
| 数据加密 | AES-256-GCM + SHA256 哈希索引 |
| 邮件 | [Lettre](https://lettre.rs/)（SMTP） |

---

## 部署

> 只需要服务器上装有 **Docker** 和 **Docker Compose**，无需任何额外环境。

### 第一步：克隆代码

```bash
git clone https://github.com/wocao123456/kamism-er-gai.git
cd kamism-er-gai
```

### 第二步：配置环境变量

```bash
cp env.example .env
nano .env
```

`.env` 必填字段：

```env
POSTGRES_PASSWORD=强密码
RABBITMQ_PASSWORD=强密码
JWT_SECRET=随机32位以上字符串
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123456
MASTER_KEY=64位16进制字符串（openssl rand -hex 32）
```

完整字段说明见 `env.example`。

---

### 方式一：单容器部署

所有服务打包进一个容器：

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

> 首次构建约需 **20~30 分钟**。

### 方式二：多容器部署（生产推荐）

各服务独立容器，共 5 个容器：

```bash
docker compose up -d --build
```

> 首次构建约需 **10~20 分钟**。

---

### 访问地址

| 地址 | 说明 |
|---|---|
| `http://your-server-ip:1420` | Web 管理控制台 |
| `http://your-server-ip:1420/api/` | 后端 REST API |
| `http://your-server-ip:1420/api/v1/activate` | 卡密激活接口 |

登录账号为 `.env` 中配置的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`。

---

### 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f app

# 停止服务
docker compose down

# 更新重新部署
git pull && docker compose up -d --build
```

---

## 对外开放 API

供第三方软件集成，通过商户 `api_key` 鉴权。

### 激活卡密

```http
POST https://yourdomain.com/api/v1/activate
Content-Type: application/json

{
  "api_key": "km_xxx...",
  "app_id": "xxx-xxx-xxx",
  "card_code": "KAMI-XXXX-XXXX-XXXX-XXXX",
  "device_id": "设备唯一标识符",
  "device_name": "设备名称"
}
```

### 验证卡密

```http
POST https://yourdomain.com/api/v1/verify
Content-Type: application/json

{
  "api_key": "km_xxx...",
  "app_id": "xxx-xxx-xxx",
  "card_code": "KAMI-XXXX-XXXX-XXXX-XXXX",
  "device_id": "设备唯一标识符"
}
```

### 解绑设备

```http
POST https://yourdomain.com/api/v1/unbind
Content-Type: application/json

{
  "api_key": "km_xxx...",
  "app_id": "xxx-xxx-xxx",
  "card_code": "KAMI-XXXX-XXXX-XXXX-XXXX",
  "device_id": "设备唯一标识符"
}
```

### 响应示例

```json
{
  "success": true,
  "valid": true,
  "message": "卡密有效",
  "data": {
    "card_code": "KAMI-XXXX-XXXX-XXXX-XXXX",
    "expires_at": "2025-01-01T00:00:00Z",
    "remaining_days": 30,
    "max_devices": 3,
    "current_devices": 1
  }
}
```

---

## 项目结构

```
src/
├── pages/
│   ├── admin/
│   │   ├── Dashboard.tsx       # 数据总览（优化版）
│   │   ├── Merchants.tsx       # 商户管理
│   │   ├── PlanConfigs.tsx     # 套餐配置
│   │   ├── Messages.tsx        # 公告与站内信管理
│   │   ├── ApiManage.tsx       # API密钥管理 🆕
│   │   └── ApiDocs.tsx         # API文档 🆕
│   ├── merchant/
│   │   ├── Dashboard.tsx       # 数据看板
│   │   ├── Apps.tsx            # 应用管理
│   │   ├── Cards.tsx           # 卡密管理（含导出）
│   │   ├── Activations.tsx     # 激活记录
│   │   ├── Agents.tsx          # 代理管理 🆕
│   │   ├── Blacklist.tsx       # IP/设备黑名单 🆕
│   │   ├── ApiDocs.tsx         # API文档 🆕
│   │   ├── Messages.tsx        # 消息中心
│   │   └── Settings.tsx        # 账号设置
│   └── auth/                   # 登录/注册/重置密码
├── components/Layout.tsx       # 侧边栏布局
├── lib/api.ts                  # API请求封装
└── stores/                     # Zustand状态管理

src-tauri/
├── migrations/                 # 数据库迁移
└── src/
    ├── routes/
    │   ├── auth.rs             # 认证
    │   ├── admin.rs            # 管理员接口
    │   ├── agent.rs            # 代理体系 🆕
    │   ├── blacklist.rs        # 风控黑名单 🆕
    │   ├── api_keys.rs         # API密钥 🆕
    │   ├── api_ts.rs           # API文档 🆕
    │   ├── health.rs           # 服务健康检查 🆕
    │   ├── webhooks.rs         # Webhook推送 🆕
    │   ├── cards.rs            # 卡密管理
    │   ├── activations.rs      # 激活记录
    │   ├── apps.rs             # 应用管理
    │   ├── messages.rs         # 站内信/公告
    │   └── public_api.rs       # 对外开放API
    ├── middleware/
    │   ├── auth.rs             # JWT中间件
    │   ├── rate_limit.rs       # 频率限制
    │   └── security.rs         # 安全防护 🆕
    └── utils/                  # 工具函数
```

---

## 数据加密

本项目实现了**字段级 AES-256-GCM 加密 + SHA256 哈希索引**的双层安全方案。

| 表 | 加密字段 | 存储方式 | 查询方式 |
|---|---|---|---|
| merchants | api_key, email | AES-256-GCM | SHA256哈希索引 |
| cards | card_code | AES-256-GCM | SHA256哈希索引 |
| activations | device_id | AES-256-GCM | SHA256哈希索引 |

**性能提升**：查询从 O(n) 全表扫描优化至 O(1) 索引定位，性能提升 **100倍+**。

---

## License

Copyright © 2026 KamiSM Contributors

本项目基于 MIT 协议开源。

原始项目地址：https://github.com/zf26/kamism

---

> ⚠️ 本项目基于 KamiSM 进行二次开发，保留原项目的核心架构，在此基础上进行了功能增强与安全加固。
