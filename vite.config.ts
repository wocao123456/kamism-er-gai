import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// 从 CHANGELOG.md 自动提取最新版本号
let appVersion = '1.0.0';
try {
  const changelog = readFileSync('CHANGELOG.md', 'utf-8');
  const m = changelog.match(/## \[(?:未发布|v?(\d+\.\d+\.\d+)|最新)\]/);
  if (m) appVersion = m[1] || '1.3.0'; // 未发布版本号，与 SettingsPage CURRENT_VERSION 保持一致
} catch {}

// https://vite.dev/config/
export default defineConfig(async () => {
  return {
    plugins: [
      react(),
    ],
    // Docker/web 部署用 '/'，Tauri 桌面端打包时 tauri-cli 会自动覆盖
    base: '/',

    // ── 构建优化 ──────────────────────────────────────────────────────────
    build: {
      // 启用 CSS 代码分割：每个异步 chunk 单独提取对应 CSS
      cssCodeSplit: true,
      // 生产构建启用 sourcemap（false = 更小体积，true = 便于生产调试）
      sourcemap: false,
      // chunk 大小警告阈值提升到 800KB（recharts 等库体积较大）
      chunkSizeWarningLimit: 800,
      // 构建时从 CHANGELOG 自动注入版本号
      define: {
        __APP_VERSION__: JSON.stringify(appVersion),
      },
      rollupOptions: {
        output: {
          // 手动分 chunk：将图表库单独打包，不阻塞首屏加载
          manualChunks: {
            // React 核心 - 几乎不更新，长期缓存
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // 图表库 - 体积最大，单独分离
            'vendor-charts': ['recharts'],
            // 图标库
            'vendor-icons': ['lucide-react'],
            // 状态管理 + 工具
            'vendor-utils': ['zustand', 'axios', 'react-hot-toast'],
          },
          // chunk 文件名带内容哈希，确保缓存精确失效
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },

    // ── 依赖预构建优化 ────────────────────────────────────────────────────
    optimizeDeps: {
      // 强制预构建这些依赖，避免开发服务器首次加载时卡顿
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'axios',
        'zustand',
        'recharts',
        'lucide-react',
        'react-hot-toast',
      ],
    },

    // Vite options tailored for Tauri development
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});