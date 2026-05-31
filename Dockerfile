# ─── 构建阶段 ───────────────────────────────────────────
FROM rust:1.88-slim AS builder

WORKDIR /app

# [1/6] 安装系统依赖
RUN echo "==> [1/6] 安装系统依赖 (pkg-config, libssl-dev)..." \
    && apt-get update && apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && echo "==> [1/6] 系统依赖完成"

# [2/6] 复制 Cargo 文件，准备依赖缓存
RUN echo "==> [2/6] 复制 Cargo 配置文件..."
COPY Cargo.toml Cargo.lock ./
COPY server/Cargo.toml server/Cargo.toml
COPY src-tauri/Cargo.toml src-tauri/Cargo.toml

# 创建占位源文件，让 cargo 先拉依赖
RUN echo "==> [3/6] 预下载 Rust 依赖（首次构建约需 5~15 分钟，请耐心等待）..." \
    && mkdir -p server/src src-tauri/src \
    && echo 'fn main(){}' > server/src/main.rs \
    && echo 'pub fn run(){} pub async fn start_server() -> anyhow::Result<()> { Ok(()) }' > src-tauri/src/lib.rs \
    && echo 'fn main(){}' > src-tauri/src/main.rs \
    && echo 'fn main(){}' > src-tauri/build.rs

RUN cargo build --release -p kamism-server 2>/dev/null || true \
    && echo "==> [3/6] 依赖预编译完成"

# [4/6] 复制真实源码
RUN echo "==> [4/6] 复制源代码..."
COPY src-tauri/src src-tauri/src
COPY src-tauri/migrations src-tauri/migrations
COPY src-tauri/build.rs src-tauri/build.rs
COPY src-tauri/icons src-tauri/icons
COPY server/src server/src
COPY ensure_evn.sh ensure_evn.sh
RUN chmod +x ensure_evn.sh && ./ensure_evn.sh || true

# 删除占位编译缓存，强制重新编译
RUN touch src-tauri/src/lib.rs server/src/main.rs

# [5/6] 正式编译后端服务
RUN echo "==> [5/6] 正式编译 kamism-server（约需 2~5 分钟）..." \
    && cargo build --release -p kamism-server \
    && echo "==> [5/6] 后端编译完成"

# ─── 运行阶段 ───────────────────────────────────────────
FROM debian:bookworm-slim

WORKDIR /app

# [6/6] 安装运行时依赖（新增 python3-pip 和 pycryptodome）
RUN echo "==> [6/6] 安装运行时依赖..." \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        ca-certificates \
        libssl3 \
        git \
        docker.io \
    && python3 -m pip install --break-system-packages pycryptodome \
    && rm -rf /var/lib/apt/lists/* \
    && echo "==> [6/6] 后端镜像构建完成，等待启动..."

# 复制编译产物和数据库迁移文件
COPY --from=builder /app/target/release/kamism-server /app/kamism-server
COPY --from=builder /app/src-tauri/migrations /app/migrations
COPY ensure_evn.sh /app/ensure_evn.sh
RUN chmod +x /app/ensure_evn.sh

EXPOSE 9527

CMD ["sh", "-lc", "/app/ensure_evn.sh || true; exec /app/kamism-server"]