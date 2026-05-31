import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

const CURRENT_VERSION = (window as any).__APP_VERSION__ || '1.3.0';

const OAUTH_TYPES = [
  { value: 'qq', label: 'QQ', icon: '🐧' },
  { value: 'wx', label: '微信', icon: '💬' },
  { value: 'alipay', label: '支付宝', icon: '💰' },
  { value: 'sina', label: '微博', icon: '📢' },
  { value: 'baidu', label: '百度', icon: '🔍' },
  { value: 'douyin', label: '抖音', icon: '🎵' },
  { value: 'huawei', label: '华为', icon: '📱' },
  { value: 'google', label: 'Google', icon: '🔗' },
  { value: 'microsoft', label: 'Microsoft', icon: '🪟' },
  { value: 'twitter', label: 'Twitter', icon: '🐦' },
  { value: 'dingtalk', label: '钉钉', icon: '💼' },
  { value: 'gitee', label: 'Gitee', icon: '🐙' },
  { value: 'github', label: 'GitHub', icon: '🐱' },
];

// 背景用 userId 隔离，OAuth 是全局统一的用 admin
function bgKey() { return 'kamism_bg_url_' + (localStorage.getItem('role') || 'guest'); }


export default function SettingsPage() {
  const { role, updateUser } = useAuthStore();
  const isAdmin = role === 'admin';
  const [bgUrl, setBgUrl] = useState('');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [localVersion, setLocalVersion] = useState(CURRENT_VERSION);
  const [latestVersion, setLatestVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [appid, setAppid] = useState('');
  const [appkey, setAppkey] = useState('');
  const [redirectUri, setRedirectUri] = useState(() => `${window.location.origin}/auth/oauth/callback`);
  const [oauthBaseUrl, setOauthBaseUrl] = useState('https://u.suyanw.cn');
  const [oauthLoginPath, setOauthLoginPath] = useState('/connect.php');
  const [oauthUserPath, setOauthUserPath] = useState('/api.php');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  useEffect(() => {
    const currentBg = useAuthStore.getState().user?.background_url;
    if (currentBg) setBgUrl(currentBg);
    if (isAdmin) {
      (async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch('/auth/oauth/admin/config', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json();
          if (json.success && json.data) {
            const cfg = json.data;
            setOauthEnabled(Boolean(cfg.enabled));
            setAppid(cfg.appid || '');
            setAppkey(cfg.appkey || '');
            setRedirectUri(cfg.redirect_uri || `${window.location.origin}/auth/oauth/callback`);
            setOauthBaseUrl(cfg.base_url || 'https://u.suyanw.cn');
            setOauthLoginPath(cfg.login_path || '/connect.php');
            setOauthUserPath(cfg.user_path || '/api.php');
            setEnabledTypes(cfg.enabled_types || []);
          }
        } catch {}
      })();
    }
    (async () => {
      try {
        const res = await fetch('/api/profile/version');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.version) setLocalVersion(json.data.version);
        }
      } catch {}
      setTimeout(() => checkForUpdates(), 1200);
    })();
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const res = await fetch('https://raw.githubusercontent.com/wocao123456/kamism-er-gai/main/CHANGELOG.md');
      if (res.ok) {
        const text = await res.text();
        const versionRegex = /## \[(?:未发布|v?(\d+\.\d+\.\d+)|最新)\][^\n]*/g;
        const versions: { raw: string; version: string; label: string }[] = [];
        let m: RegExpExecArray | null;
        while ((m = versionRegex.exec(text)) !== null) {
          const raw = m[0];
          const ver = m[1] || 'unreleased';
          let label = ver;
          if (raw.includes('未发布')) label = '未发布 (开发版)';
          else if (raw.includes('最新') && !ver) label = '最新稳定版';
          versions.push({ raw, version: ver, label });
        }
        const latest = versions[0];
        if (latest) {
          setLatestVersion(latest.version === 'unreleased' ? '开发版' : latest.version);
          setHasUpdate(latest.version !== localVersion);
        }
      }
    } catch (e) {
      console.error('检查更新失败', e);
    } finally {
      setChecking(false);
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('背景图不能超过10MB');
      return;
    }
    const form = new FormData();
    form.append('background', file);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/upload-background', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.background_url) {
          const baseUrl = json.data.background_url;
          const url = baseUrl + '?t=' + Date.now();
          // 强制加时间戳，防止浏览器缓存同一文件名
          setBgUrl(url);
          localStorage.setItem(bgKey(), url);
          document.documentElement.style.setProperty('--custom-bg', `url(${url})`);
          updateUser({ background_url: baseUrl });
          toast.success('背景已更新');
        } else {
          toast.error(json.message || '上传失败');
        }
      } else {
        toast.error('上传失败');
      }
    } catch {
      toast.error('上传失败');
    }
  };

  const handleRemoveBg = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/remove-background', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || '移除失败');
        return;
      }
    } catch {
      toast.error('移除失败');
      return;
    }
    setBgUrl('');
    localStorage.removeItem(bgKey());
    document.documentElement.style.removeProperty('--custom-bg');
    updateUser({ background_url: undefined });
    toast.success('背景已移除');
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>设置</h2>

      {/* 自定义背景 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>自定义背景</div>
        <div
          style={{
            width: '100%',
            height: 120,
            borderRadius: 8,
            background: bgUrl ? `url(${bgUrl}) center/contain no-repeat` : 'var(--bg)',
            border: '1px dashed var(--border)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dim)',
            fontSize: 13,
          }}
        >
          {bgUrl ? '' : '暂无背景图'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> 选择图片上传
          </button>
          {bgUrl && (
            <button className="btn btn-ghost" onClick={handleRemoveBg} style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} /> 移除背景
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
          背景图将保存到服务器磁盘，换系统也能保留
        </div>
      </div>

      {/* 三方OAuth自定义 */}
      {isAdmin && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>三方OAuth自定义</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {enabledTypes.length > 0 ? '已启用' : '未启用'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={oauthEnabled}
              onChange={(e) => setOauthEnabled(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>启用第三方登录</span>
          </div>

          {oauthEnabled && (
            <>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>OAuth服务地址</div>
                <input className="input" value={oauthBaseUrl} onChange={(e) => setOauthBaseUrl(e.target.value)} placeholder="https://u.suyanw.cn" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>登录接口路径</div>
                <input className="input" value={oauthLoginPath} onChange={(e) => setOauthLoginPath(e.target.value)} placeholder="/connect.php" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>用户信息接口路径</div>
                <input className="input" value={oauthUserPath} onChange={(e) => setOauthUserPath(e.target.value)} placeholder="/api.php" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>AppID</div>
                <input
                  className="input"
                  value={appid}
                  onChange={(e) => setAppid(e.target.value)}
                  placeholder="请输入 AppID"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>AppKey</div>
                <input
                  className="input"
                  value={appkey}
                  onChange={(e) => setAppkey(e.target.value)}
                  placeholder="请输入 AppKey"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>跳转地址</div>
                <input
                  className="input"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  placeholder="https://u.suyanw.cn"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>启用类型</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {OAUTH_TYPES.map((t) => {
                    const checked = enabledTypes.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        onClick={() => {
                          setEnabledTypes((prev) =>
                            checked
                              ? prev.filter((x) => x !== t.value)
                              : [...prev, t.value],
                          );
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          border: '1px solid',
                          borderColor: checked ? 'var(--accent)' : 'var(--border)',
                          background: checked ? 'var(--accent-glow)' : 'transparent',
                          color: checked ? 'var(--accent)' : 'var(--text-dim)',
                          cursor: 'pointer',
                        }}
                      >
                        {t.icon} {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <button className="btn btn-primary" onClick={async () => {
            if (oauthEnabled && (!appid || !appkey || !oauthBaseUrl)) {
              toast.error('请填写 OAuth 服务地址、AppID 和 AppKey');
              return;
            }
            try {
              const token = localStorage.getItem('token');
              const res = await fetch('/auth/oauth/admin/config', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  enabled: oauthEnabled,
                  appid,
                  appkey,
                  redirect_uri: (redirectUri && redirectUri.startsWith('http')) ? redirectUri : `${window.location.origin}${redirectUri || '/auth/oauth/callback'}`,
                  base_url: oauthBaseUrl,
                  login_path: oauthLoginPath,
                  user_path: oauthUserPath,
                  enabled_types: enabledTypes,
                }),
              });
              const json = await res.json();
              if (json.success) toast.success('配置已保存');
              else toast.error(json.message || '保存失败');
            } catch {
              toast.error('保存失败，请检查网络');
            }
          }}>
            保存配置
          </button>
        </div>
      </div>
      )}

      {/* 版本检查 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>版本检查</div>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={checkForUpdates} disabled={checking}>
            {checking ? '检查中...' : '重新检查'}
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <div>当前版本：{localVersion}</div>
          <div>最新版本：{latestVersion || '未知'}</div>
          <div>
            {hasUpdate ? (
              <span style={{ color: 'var(--warning)' }}>发现新版本</span>
            ) : (
              <span style={{ color: 'var(--success)' }}>已是最新版本</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}