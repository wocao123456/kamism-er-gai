import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Edit3, Mail, EyeOff, Key, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

const api = (path: string, opts?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(`/api${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, ...(opts?.headers || {}) },
  });
};

const AVATAR_FALLBACK = (name: string) =>
  `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 76"><rect width="76" height="76" rx="38" fill="%23667eea"/><text x="38" y="48" text-anchor="middle" fill="white" font-size="24">${(name || 'U').charAt(0).toUpperCase()}</text></svg>`;

export default function AdminProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', code: '' });
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarVer, setAvatarVer] = useState(0);
  const [openSections, setOpenSections] = useState({ apiKey: false, email: false, password: false });

  // 初始化背景：localStorage 优先（兼容旧后端未返回 background_url 的情况）
  useEffect(() => {
    const saved = localStorage.getItem('kamism_bg_url');
    if (saved) {
      document.documentElement.style.setProperty('--custom-bg', `url(${saved})`);
    }
  }, []);

  const loadProfile = async () => {
    setLoadError(false);
    try {
      const res = await api('/profile');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          setProfile(d);
          setApiKey(d.api_key || '');
          setUsername(d.username || '');
          localStorage.setItem('kamism_profile', JSON.stringify(d));
          useAuthStore.getState().updateUser(d);
          // 从后端 background_url 刷新自定义背景
          if (d.background_url) {
            const url = d.background_url + '?t=' + Date.now();
            const roleSuffix = localStorage.getItem('role') || 'guest';
            localStorage.setItem('kamism_bg_url_' + roleSuffix, url);
            document.documentElement.style.setProperty('--custom-bg', `url(${url})`);
          }
        } else {
          // 后端返回失败，用 localStorage 兜底显示旧数据
          const saved = localStorage.getItem('kamism_profile');
          if (saved) {
            try {
              const d = JSON.parse(saved);
              setProfile(d);
              setApiKey(d.api_key || '');
              setUsername(d.username || '');
            } catch {}
          } else {
            setLoadError(true);
          }
        }
      } else {
        setLoadError(true);
      }
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // 背景：初始化，用 role 后缀做数据隔离
  useEffect(() => {
    const saved = localStorage.getItem('kamism_bg_url_' + (localStorage.getItem('role') || 'guest'));
    if (saved) {
      document.documentElement.style.setProperty('--custom-bg', `url(${saved})`);
    }
  }, []);

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const bumpAvatar = () => setAvatarVer(v => v + 1);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('头像不能超过5MB'); return; }
    const form = new FormData();
    form.append('avatar', file);
    try {
      const res = await api('/profile/avatar', { method: 'POST', body: form });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          toast.success('头像更新成功');
          const newAvatar = json.data?.avatar;
          if (newAvatar) {
            useAuthStore.getState().updateUser({ avatar: `${newAvatar}?t=${Date.now()}` });
            setProfile((prev: any) => ({ ...prev, avatar: newAvatar }));
          }
          bumpAvatar();
          await loadProfile();
        } else { toast.error(json.message || '上传失败'); }
      } else { toast.error('上传失败'); }
    } catch { toast.error('上传失败'); }
  };

  const handleRegenerateKey = async () => {
    if (!confirm('确定要重新生成API Key？旧的Key将立即失效！')) return;
    setRegenerating(true);
    try {
      const res = await api('/profile/api-key', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setApiKey(json.data.api_key);
          useAuthStore.getState().updateUser({ api_key: json.data.api_key });
          toast.success('API Key已重新生成');
        } else { toast.error(json.message || '重新生成失败'); }
      } else { toast.error('重新生成失败'); }
    } catch { toast.error('操作失败'); }
    finally { setRegenerating(false); }
  };

  const handleSaveUsername = async () => {
    if (!username.trim()) { toast.error('用户名不能为空'); return; }
    setSavingUsername(true);
    try {
      const res = await api('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('用户名已更新');
        setEditingUsername(false);
        useAuthStore.getState().updateUser({ username: username.trim() });
        window.dispatchEvent(new Event('merchant-sync'));
        await loadProfile();
        setTimeout(() => window.dispatchEvent(new Event('merchant-sync')), 500);
      } else { toast.error(json.message || '更新失败'); }
    } catch { toast.error('更新失败'); }
    finally { setSavingUsername(false); }
  };

  const handleSendEmailCode = async () => {
    if (!emailForm.email || !emailForm.email.includes('@')) {
      toast.error('请输入有效邮箱'); return;
    }
    setSendingCode(true);
    try {
      const res = await api('/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailForm.email }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('验证码已发送');
        setCountdown(60);
      } else { toast.error(json.message || '发送失败'); }
    } catch { toast.error('发送失败'); }
    finally { setSendingCode(false); }
  };

  const handleChangeEmail = async () => {
    if (!emailForm.code || emailForm.code.length < 4) {
      toast.error('请输入验证码'); return;
    }
    try {
      const res = await api('/profile/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_email: emailForm.email, code: emailForm.code }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('邮箱已更换，请重新登录');
        setEmailForm({ email: '', code: '' });
        useAuthStore.getState().updateUser({ email: emailForm.email });
        window.dispatchEvent(new Event('merchant-sync'));
        loadProfile();
      } else { toast.error(json.message || '更换失败'); }
    } catch { toast.error('更换失败'); }
  };

  const handleChangePassword = async (oldPwd: string, newPwd: string) => {
    try {
      const res = await api('/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('密码修改成功，请重新登录');
      } else {
        toast.error(json.message || '����码修改失败');
      }
    } catch { toast.error('密码修改失败'); }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <span className="spinner" />
    </div>
  );
  if (loadError || !profile) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>加载失败，请稍后重试</p>
      <button className="btn btn-primary" onClick={loadProfile}>
        <RefreshCw size={14} /> 重新加载
      </button>
    </div>
  );

  const avatarSrc = profile.avatar ? `${profile.avatar}${profile.avatar.includes('?') ? '&' : '?'}t=${avatarVer}` : null;
  const displayName = profile.username || 'User';

  const toggleSection = (key: 'apiKey' | 'email' | 'password') => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fade-in">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">我的</h1>
          <p className="page-subtitle">管理您的账户信息</p>
        </div>
      </div>

      {/* 头像卡片 */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 28 }}>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
          <div onClick={() => fileRef.current?.click()} style={{
            width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer',
            border: '2px solid var(--border-light)', position: 'relative', background: 'var(--bg)',
          }}>
            <img
              src={avatarSrc || AVATAR_FALLBACK(displayName)}
              alt="avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).src = AVATAR_FALLBACK(displayName); }}
            />
            <div className="avatar-overlay" style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10,
              opacity: 0, transition: 'opacity 0.2s',
            }}>更换</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
        </div>

        <div>
          {editingUsername ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} style={{ width: 140, textAlign: 'center' }} />
              <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleSaveUsername} disabled={savingUsername}>保存</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setEditingUsername(false)}>取消</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }} onClick={() => { setUsername(profile.username); setEditingUsername(true); }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{profile.username}</span>
              <Edit3 size={13} style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{profile.email}</div>
        </div>
      </div>

      {/* 信息大卡片 - 三个折叠面板 */}
      <div className="card" style={{ marginBottom: 16 }}>
        {/* API Key 折叠面板 */}
        <div style={{ marginBottom: 12 }}>
          <div
            onClick={() => toggleSection('apiKey')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(124,106,247,0.08)',
              border: '1px solid rgba(124,106,247,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Key size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>API Key</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {openSections.apiKey ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
            </div>
          </div>
          {openSections.apiKey && (
            <div style={{ padding: '12px 16px', border: '1px solid var(--border-light)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <code style={{ flex: 1, fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', wordBreak: 'break-all' }}>
                  {apiKey || '暂无密钥'}
                </code>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(apiKey || ''); toast.success('已复制'); }}>复制</button>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleRegenerateKey} disabled={regenerating}>
                {regenerating ? '处理中...' : '重新生成'}
              </button>
            </div>
          )}
        </div>

        {/* 邮箱换绑 折叠面板 */}
        <div style={{ marginBottom: 12 }}>
          <div
            onClick={() => toggleSection('email')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(124,106,247,0.08)',
              border: '1px solid rgba(124,106,247,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>邮箱换绑</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {openSections.email ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
            </div>
          </div>
          {openSections.email && (
            <div style={{ padding: '12px 16px', border: '1px solid var(--border-light)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <input className="input" placeholder="新邮箱" value={emailForm.email} onChange={e => setEmailForm({ ...emailForm, email: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" placeholder="验证码" value={emailForm.code} onChange={e => setEmailForm({ ...emailForm, code: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn btn-primary" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={handleSendEmailCode} disabled={sendingCode || countdown > 0}>
                    {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </button>
                </div>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleChangeEmail}>确认换绑</button>
            </div>
          )}
        </div>

        {/* 修改密码 折叠面板 */}
        <div>
          <div
            onClick={() => toggleSection('password')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(124,106,247,0.08)',
              border: '1px solid rgba(124,106,247,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EyeOff size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>修改密码</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {openSections.password ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
            </div>
          </div>
          {openSections.password && (
            <PasswordSection onChangePassword={handleChangePassword} />
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordSection({ onChangePassword }: { onChangePassword: (oldPwd: string, newPwd: string) => void }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!oldPwd || !newPwd) { toast.error('请填写完整'); return; }
    if (newPwd.length < 6) { toast.error('新密码至少6位'); return; }
    setSending(true);
    try {
      await onChangePassword(oldPwd, newPwd);
      setOldPwd('');
      setNewPwd('');
    } finally { setSending(false); }
  };

  return (
    <div style={{ padding: '12px 16px', border: '1px solid var(--border-light)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        <input type="password" className="input" placeholder="旧密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
        <input type="password" className="input" placeholder="新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
      </div>
      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={submit} disabled={sending}>
        {sending ? '提交中...' : '确认修改'}
      </button>
    </div>
  );
}