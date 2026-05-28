import { useState, useEffect } from 'react';

export default function ApiDocs() {
  const [keys, setKeys] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [keyConfig, setKeyConfig] = useState<any>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    fetch('/api/keys')
      .then(r => r.json())
      .then(d => setKeys(d.data || []));
  }, []);

  useEffect(() => {
    if (selected) {
      const k = keys.find(k => k.name === selected);
      setKeyConfig(k || null);
    }
  }, [selected, keys]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(''), 2000);
  };

  const codeBlock = (code: string) => (
    <pre style={{
      background: 'var(--bg)', padding: 16, borderRadius: 10,
      fontSize: 12, overflow: 'auto', color: 'var(--text-dim)',
      border: '1px solid var(--border)', margin: 0, lineHeight: 1.6
    }}>
      {code}
    </pre>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'var(--text)' }}>对外开放 API 文档</h1>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>加解密 · 签名生成 · 真机测试</p>

      <div style={{ marginBottom: 24 }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, minWidth: 240
          }}
        >
          <option value="">选择密钥查看文档</option>
          {keys.map(k => (
            <option key={k.id} value={k.name}>{k.name}</option>
          ))}
        </select>
      </div>

      {!keyConfig && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          选择一个密钥查看对应的 API 文档
        </div>
      )}

      {keyConfig && (
        <>
          {/* 签名 */}
          {keyConfig.sign_enabled && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ background: '#667eea', color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 4 }}>POST</span>
                <code style={{ fontSize: 14, color: 'var(--text)' }}>/api/ts/sign</code>
                <button onClick={() => copy('/api/ts/sign')} style={{ background: 'none', border: 'none', color: copied === '/api/ts/sign' ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>
                  {copied === '/api/ts/sign' ? '✓' : '📋'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                算法: {keyConfig.sign_algorithm} · 参数名: {keyConfig.sign_param_name}
              </p>
              {codeBlock(`{
  "key_name": "${keyConfig.name}",
  "params": { /* 动态参数 */ }
}`)}
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                返回 signed_params 可直接用于请求
              </p>
            </div>
          )}

          {/* 解密 */}
          {keyConfig.encrypt_enabled && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ background: '#4ade80', color: '#000', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 4 }}>POST</span>
                <code style={{ fontSize: 14, color: 'var(--text)' }}>/api/ts/decrypt</code>
                <button onClick={() => copy('/api/ts/decrypt')} style={{ background: 'none', border: 'none', color: copied === '/api/ts/decrypt' ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>
                  {copied === '/api/ts/decrypt' ? '✓' : '📋'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                算法: {keyConfig.encrypt_algorithm}-{keyConfig.encrypt_mode} · IV: {keyConfig.encrypt_iv_source}
                {keyConfig.encrypt_iv_source === 'prefix' && `[${keyConfig.encrypt_iv_start}:${keyConfig.encrypt_iv_length}]`}
              </p>
              {codeBlock(`{
  "key_name": "${keyConfig.name}",
  "env_value": "你的环境变量密文"
}`)}
            </div>
          )}

          {/* 加密 */}
          {keyConfig.encrypt_enabled && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ background: '#f59e0b', color: '#000', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 4 }}>POST</span>
                <code style={{ fontSize: 14, color: 'var(--text)' }}>/api/ts/encrypt</code>
                <button onClick={() => copy('/api/ts/encrypt')} style={{ background: 'none', border: 'none', color: copied === '/api/ts/encrypt' ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>
                  {copied === '/api/ts/encrypt' ? '✓' : '📋'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                拼接: {keyConfig.encrypt_join_template || '无'}
              </p>
              {codeBlock(`{
  "key_name": "${keyConfig.name}",
  "plain_text": "修改后的参数串",
  "iv": "从解密获取",
  "prefix": "从解密获取"
}`)}
            </div>
          )}

          {/* 真机测试 */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ background: '#ec4899', color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 4 }}>POST</span>
              <code style={{ fontSize: 14, color: 'var(--text)' }}>/api/ts/test</code>
              <button onClick={() => copy('/api/ts/test')} style={{ background: 'none', border: 'none', color: copied === '/api/ts/test' ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>
                {copied === '/api/ts/test' ? '✓' : '📋'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              目标: {keyConfig.request_base_url} · {keyConfig.request_method}
            </p>
            {codeBlock(`{
  "key_name": "${keyConfig.name}",
  "env_vars": { "变量名": "变量值" },
  "task_name": "${keyConfig.tasks?.[0]?.name || '任务名'}"
}`)}
          </div>

          {/* 环境变量 */}
          {keyConfig.env_vars?.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>环境变量</h3>
              {keyConfig.env_vars.map((env: any, i: number) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4, color: 'var(--text-dim)' }}>
                  <code style={{ color: 'var(--accent)' }}>{env.name || env}</code>
                  {env.desc && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{env.desc}</span>}
                </div>
              ))}
            </div>
          )}

          {/* 任务列表 */}
          {keyConfig.tasks?.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>任务列表 ({keyConfig.tasks.length}个)</h3>
              {keyConfig.tasks.map((t: any, i: number) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 6, display: 'flex', gap: 12, color: 'var(--text-dim)' }}>
                  <span style={{ minWidth: 80, fontWeight: 600 }}>{t.name}</span>
                  <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{keyConfig.request_base_url}{t.path}</code>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.type === 'once' ? '单次' : `循环×${t.max}`}</span>
                </div>
              ))}
            </div>
          )}

          {/* 青龙示例（动态） */}
          <div style={{ background: 'rgba(102,126,234,0.06)', border: '1px solid rgba(102,126,234,0.2)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text)' }}>🐉 青龙面板调用示例</div>
            {codeBlock(`import os, requests
API = "http://你的IP:9527"

${keyConfig.encrypt_enabled ? `# 解密
r = requests.post(f"{API}/api/ts/decrypt", json={
    "key_name": "${keyConfig.name}",
    "env_value": os.getenv("${keyConfig.env_vars?.[0]?.name || 'VAR'}")
})
data = r.json()["data"]
plain = data["plain_text"]

# 修改参数
# plain = plain.replace(...)

# 加密
r = requests.post(f"{API}/api/ts/encrypt", json={
    "key_name": "${keyConfig.name}",
    "plain_text": plain,
    "iv": data["iv"],
    "prefix": data["prefix"]
})
body = r.json()["data"]["body"]` : ''}
${keyConfig.sign_enabled ? `
# 生成签名
r = requests.post(f"{API}/api/ts/sign", json={
    "key_name": "${keyConfig.name}",
    "params": {"key1": "val1"}
})
signed = r.json()["data"]["signed_params"]` : ''}

# 发请求
import requests as req
resp = req.${keyConfig.request_method?.toLowerCase() || 'post'}(
    "${keyConfig.request_base_url}${keyConfig.tasks?.[0]?.path || ''}",
    ${keyConfig.encrypt_enabled ? 'data=body' : 'json=signed'}
)`)}
          </div>
        </>
      )}
    </div>
  );
}