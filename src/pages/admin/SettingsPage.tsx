import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

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

function bgKey() { return 'kamism_bg_url_' + (localStorage.getItem('role') || 'guest'); }

export default function SettingsPage() {
  const { role, updateUser } = useAuthStore();
  const isAdmin = role === 'admin';
  const [bgUrl, setBgUrl] = useState('');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [appid, setAppid] = useState('');
  const [appkey, setAppkey] = useState('');
  const [redirectUri, setRedirectUri] = useState(() => `${window.location.origin}/auth/oauth/callback`);
  const [oauthBaseUrl, setOauthBaseUrl] = useState('https://u.suyanw.cn');
  const [oauthLoginPath, setOauthLoginPath] = useState('/connect.php');
  const [oauthUserPath, setOauthUserPath] = useState('/api.php');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const checkForUpdates = async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setChecking(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system-update/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setUpdateInfo(json.data);
        if (json.data?.running) {
          if (!pollRef.current) {
            pollRef.current = window.setInterval(() => {
              checkForUpdates(true);
            }, 2000);
          }
        } else {
          stopPolling();
        }
      } else if (!silent && res.status !== 403) {
        toast.error(json.message || '检查更新失败');
      }
    } catch {
      if (!silent && isAdmin) toast.error('检查更新失败');
    } finally {
      if (!silent) setChecking(false);
    }
  };

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
      setTimeout(() => checkForUpdates(), 800);
    }
    return () => stopPolling();
  }, []);

  const handleSystemUpdate = async () => {
    if (!confirm('确认拉取 GitHub 最新版本并重构前后端？更新过程中服务会短暂重启。')) return;
    setUpdating(true);
    stopPolling();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system-update/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || '系统更新已开始');
        setUpdateInfo((prev: any) => ({ ...(prev || {}), running: true, log: '正在获取实时构建日志...' }));
        checkForUpdates(true);
        pollRef.current = window.setInterval(() => {
          checkForUpdates(true);
        }, 2000);
      } else {
        toast.error(json.message || '启动更新失败');
      }
    } catch {
      toast.error('启动更新失败');
    } finally {
      setUpdating(false);
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

      {isAdmin && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>三方OAuth自定义</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span className={oauthEnabled && enabledTypes.length > 0 ? 'status-dot breathing' : 'status-dot'} />
              {oauthEnabled && enabledTypes.length > 0 ? '已启用' : '未启用'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={oauthEnabled} onChange={(e) => setOauthEnabled(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>启用第三方登录</span>
          </div>
          {oauthEnabled && (
            <>
              <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>OAuth服务地址</div><input className="input" value={oauthBaseUrl} onChange={(e) => setOauthBaseUrl(e.target.value)} placeholder="https://u.suyanw.cn" /></div>
              <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>登录接口路径</div><input className="input" value={oauthLoginPath} onChange={(e) => setOauthLoginPath(e.target.value)} placeholder="/connect.php" /></div>
              <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>用户信息接口路径</div><input className="input" value={oauthUserPath} onChange={(e) => setOauthUserPath(e.target.value)} placeholder="/api.php" /></div>
              <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>AppID</div><input className="input" value={appid} onChange={(e) => setAppid(e.target.value)} placeholder="请输入 AppID" /></div>
              <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>AppKey</div><input className="input" value={appkey} onChange={(e) => setAppkey(e.target.value)} placeholder="请输入 AppKey" /></div>
              <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>跳转地址</div><input className="input" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="https://u.suyanw.cn" /></div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>启用类型</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {OAUTH_TYPES.map((t) => {
                    const checked = enabledTypes.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        onClick={() => {
                          setEnabledTypes((prev) => checked ? prev.filter((x) => x !== t.value) : [...prev, t.value]);
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

      {isAdmin && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>系统更新</div>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => checkForUpdates()} disabled={checking || updating}>
            {checking ? '检测中...' : '重新检测'}
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <div>当前版本：{updateInfo?.current_version || updateInfo?.current || '未知'} {updateInfo?.current_message ? `· ${updateInfo.current_message}` : ''}</div>
          <div>最新版本：{updateInfo?.latest_version || updateInfo?.latest || '未知'} {updateInfo?.latest_message ? `· ${updateInfo.latest_message}` : ''}</div>
          <div>状态：{updateInfo?.running ? <span style={{ color: 'var(--warning)' }}>更新中</span> : updateInfo?.has_update ? <span style={{ color: 'var(--warning)' }}>发现新版本</span> : <span style={{ color: 'var(--success)' }}>已是最新版本</span>}</div>
        </div>
        {updateInfo?.running && updateInfo?.log && (
          <pre style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{updateInfo.log}</pre>
        )}
        {!updateInfo?.running && updateInfo?.changelog && (
          <pre style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{updateInfo.changelog}</pre>
        )}
        <button className="btn btn-primary" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={handleSystemUpdate} disabled={updating || updateInfo?.running}>
          {updating || updateInfo?.running ? '更新中...' : '确认更新并重构前后端'}
        </button>
      </div>
      )}
    </div>
  );
}
