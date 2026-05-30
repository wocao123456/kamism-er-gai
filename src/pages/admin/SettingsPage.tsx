import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, Trash2, RefreshCw } from 'lucide-react';

const CURRENT_VERSION = '0.1.0';

// 素颜聚合登录支持的类型
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

export default function SettingsPage() {
  const [bgUrl, setBgUrl] = useState('');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [latestLog, setLatestLog] = useState('');
  const [checking, setChecking] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 素颜聚合登录配置
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [appid, setAppid] = useState('');
  const [appkey, setAppkey] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
  const [ghToken, setGhToken] = useState('');
  const [changelog, setChangelog] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('kamism_bg_url');
    if (saved) setBgUrl(saved);
    const oauthCfg = localStorage.getItem('kamism_oauth_config');
    if (oauthCfg) {
      try {
        const cfg = JSON.parse(oauthCfg);
        setOauthEnabled(cfg.enabled || false);
        setAppid(cfg.appid || '');
        setAppkey(cfg.appkey || '');
        setRedirectUri(cfg.redirect_uri || '');
        setEnabledTypes(cfg.enabled_types || []);
      } catch {}
    }
    const savedGh = localStorage.getItem('kamism_gh_token');
    if (savedGh) setGhToken(savedGh);
  }, []);

  const saveOAuthConfig = () => {
    if (!appid || !appkey) {
      toast.error('请填写 AppID 和 AppKey');
      return;
    }
    localStorage.setItem('kamism_oauth_config', JSON.stringify({
      enabled: oauthEnabled,
      appid,
      appkey,
      redirect_uri: redirectUri,
      enabled_types: enabledTypes,
    }));
    toast.success('配置已保存');
  };

  const saveGhToken = () => {
    if (!ghToken.trim()) { toast.error('请输入 GitHub Token'); return; }
    localStorage.setItem('kamism_gh_token', ghToken.trim());
    toast.success('Token 已保存，下次检查更新将自动使用');
  };

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const res = await fetch('https://raw.githubusercontent.com/wocao123456/kamism-er-gai/main/CHANGELOG.md');
      if (res.ok) {
        const text = await res.text();
        const match = text.match(/## \[(\d+\.\d+\.\d+)\]/);
        if (match) {
          const latest = match[1];
          setLatestVersion(latest);
          setHasUpdate(latest !== CURRENT_VERSION);
          setLatestLog(text.substring(0, 2000));
          if (latest !== CURRENT_VERSION) {
            setShowUpdateModal(true);
          }
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
    if (file.size > 10 * 1024 * 1024) { toast.error('背景图不能超过10MB'); return; }
    const form = new FormData();
    form.append('background', file);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/upload-background', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setBgUrl(json.data.background_url);
          localStorage.setItem('kamism_bg_url', json.data.background_url);
          document.documentElement.style.setProperty('--custom-bg', `url(${json.data.background_url})`);
          toast.success('背景已更新');
        } else { toast.error(json.message || '上传失败'); }
      } else { toast.error('上传失败'); }
    } catch { toast.error('上传失败'); }
  };

  const handleRemoveBg = () => {
    setBgUrl('');
    localStorage.removeItem('kamism_bg_url');
    document.documentElement.style.removeProperty('--custom-bg');
    toast.success('背景已移除');
  };

  const doUpdate = async () => {
    try {
      toast('正在拉取最新代码...');
      setShowUpdateModal(false);
      toast.success('已记录更新请求，请手动在服务器执行 git pull && docker compose up --build');
    } catch { toast.error('更新失败'); }
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>设置</h2>

      {/* 自定义背景 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>自定义背景</div>
        <div style={{
          width: '100%', height: 120, borderRadius: 8,
          background: bgUrl ? `url(${bgUrl}) center/cover` : 'var(--bg)',
          border: '1px dashed var(--border)', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-dim)', fontSize: 13,
        }}>
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
          背景图将保存到服务器磁盘，换系统迁移也能保留
        </div>
      </div>

      {/* 三方OAuth自定义 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>三方OAuth自定义</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{enabledTypes.length > 0 ? '已启用' : '未启用'}</span>
            <input type="checkbox" checked={enabledTypes.length > 0} onChange={e => {
              if (e.target.checked) {
                if (!oauthEnabled) setOauthEnabled(true);
                if (enabledTypes.length === 0) setEnabledTypes(['github']);
              } else {
                setOauthEnabled(false);
                setEnabledTypes([]);
              }
            }} style={{ width: 16, height: 16 }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>AppID</label>
          <input className="input" value={appid} onChange={e => setAppid(e.target.value)} placeholder="OAuth AppID" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>AppKey</label>
          <input className="input" value={appkey} onChange={e => setAppkey(e.target.value)} placeholder="OAuth AppKey" type="password" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>回调地址 (Redirect URI)</label>
          <input className="input" value={redirectUri} onChange={e => setRedirectUri(e.target.value)} placeholder="https://your-domain.com/auth/oauth/callback" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>已启用的登录方式（点击切换）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {OAUTH_TYPES.map(type => {
              const isActive = enabledTypes.includes(type.value);
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    if (isActive) {
                      setEnabledTypes(prev => prev.filter(t => t !== type.value));
                    } else {
                      setEnabledTypes(prev => [...prev, type.value]);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 12px', borderRadius: 8, fontSize: 12,
                    border: '1px solid', cursor: 'pointer',
                    background: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-dim)',
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    transition: 'all 0.2s',
                  }}
                >
                  <span>{type.icon}</span>
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={saveOAuthConfig}>保存配置</button>
      </div>

      {/* 检测更新 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>检测更新</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              当前版本 v{CURRENT_VERSION}
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: hasUpdate ? 'var(--success)' : 'var(--text-dim)',
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {checking ? '检查中...' : hasUpdate ? `发现新版本 v${latestVersion}` : '已是最新版本'}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={checkForUpdates} disabled={checking}>
            <RefreshCw size={14} /> {checking ? '检查中...' : '重新检查'}
          </button>
        </div>
      </div>

      {/* 更新弹窗 */}
      {showUpdateModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUpdateModal(false); }}>
          <div className="modal">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>发现新版本 v{latestVersion}</h3>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {latestLog}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowUpdateModal(false)}>关闭</button>
              <button className="btn btn-primary" onClick={doUpdate}>立即更新</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}