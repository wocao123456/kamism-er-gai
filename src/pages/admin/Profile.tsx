import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, Shield, Edit3, ChevronDown, ChevronUp, Key, Mail, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

const api = (path: string, opts?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(`/api${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, ...(opts?.headers || {}) },
  });
};

export default function AdminProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', code: '' });
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showEmailChange, setShowEmailChange] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadProfile = async () => {
    try {
      const res = await api('/profile');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          setProfile(d);
          setApiKey(d.api_key || '');
          setUsername(d.username || '');
          if (d.background_url) {
            document.documentElement.style.setProperty('--custom-bg', `url(${d.background_url})`);
          }
          useAuthStore.getState().updateUser(d);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

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
          loadProfile();
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
          setShowApiKey(false);
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
        loadProfile();
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
      const res = await api('/profile/send-email-code', {
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
        setShowEmailChange(false);
        useAuthStore.getState().updateUser({ email: emailForm.email });
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
        toast.error(json.message || '密码修改失败');
      }
    } catch { toast.error('密码修改失败'); }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <span className="spinner" />
    </div>
  );
  if (!profile) return <div style={{ textAlign: 'center', padding: 40 }}>加载失败</div>;

  const avatarSrc = profile.avatar || '/default-avatar.png';
  const maskedApiKey = apiKey ? apiKey.slice(0, 8) + '****' + apiKey.slice(-4) : '暂无密钥';

  return (
    <div className="fade-in">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">我的</h1>
          <p className="page-subtitle">管理您的账户信息</p>
        </div>
      </div>

      {/* 头像卡片 - 只显示头像+用户名，不显示邮箱 */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 28 }}>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
          <div onClick={() => fileRef.current?.click()} style={{
            width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer',
            border: '2px solid var(--border-light)', position: 'relative', background: 'var(--bg)',
          }}>
            <img src={avatarSrc} alt="avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 76"><rect width="76" height="76" fill="%23666"/><text x="38" y="48" text-anchor="middle" fill="white" font-size="24">👤</text></svg>'; }} />
            <div className="avatar-overlay" style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10,
              opacity: 0, transition: 'opacity 0.2s',
            }}>更换</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
        </div>

        {/* 用户名 - 点击编辑 */}
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
        </div>
      </div>

      {/* 信息大卡片 - API Key 在上，邮箱换绑在下 */}
      <div className="card" style={{ marginBottom: 16 }}>
        {/* API Key - 折叠面板 */}
        <div onClick={() => setShowApiKey(!showApiKey)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
          background: showApiKey ? 'rgba(124,106,247,0.08)' : 'transparent',
          border: showApiKey ? '1px solid rgba(124,106,247,0.2)' : '1px solid transparent',
          transition: 'all 0.2s', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>API Key</span>
          </div>
          {showApiKey ? <ChevronUp size={16} style={{ color: 'var(--accent)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
        {showApiKey && (
          <div style={{ marginTop: -4, paddingBottom: 12, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 14px', fontFamily: 'monospace', fontSize: 12,
              color: 'var(--accent)', wordBreak: 'break-all', marginBottom: 10,
            }}>{apiKey || maskedApiKey}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <><EyeOff size={13} /> 隐藏</> : <><Eye size={13} /> 显示</>}
              </button>
              <button className="btn btn-ghost" onClick={handleRegenerateKey} disabled={regenerating}>
                <RefreshCw size={13} /> {regenerating ? '生成中...' : '重新生成Key'}
              </button>
            </div>
          </div>
        )}

        {/* 邮箱换绑 - 折叠面板 */}
        <div onClick={() => setShowEmailChange(!showEmailChange)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
          background: showEmailChange ? 'rgba(124,106,247,0.08)' : 'transparent',
          border: showEmailChange ? '1px solid rgba(124,106,247,0.2)' : '1px solid transparent',
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>邮箱换绑</span>
          </div>
          {showEmailChange ? <ChevronUp size={16} style={{ color: 'var(--accent)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
        {showEmailChange && (
          <div style={{ marginTop: -4, paddingBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="input" value={emailForm.email} onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))} placeholder="新邮箱地址" style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={handleSendEmailCode} disabled={countdown > 0 || sendingCode}>
                {countdown > 0 ? `${countdown}s` : sendingCode ? '发送中...' : '获取验证码'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="input" value={emailForm.code} onChange={e => setEmailForm(f => ({ ...f, code: e.target.value }))} placeholder="验证码" style={{ flex: 1 }} />
              <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleChangeEmail}>换绑邮箱</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>当前邮箱：{profile.email}</div>
          </div>
        )}

        {/* 修改密码 */}
        <div style={{ marginTop: 12 }}>
          <PwdModalBtn onSubmit={handleChangePassword} />
        </div>
      </div>

      <style>{`
        .avatar-overlay { opacity: 0 !important; }
        div:hover > .avatar-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

function PwdModalBtn({ onSubmit }: { onSubmit: (old: string, nw: string) => void }) {
  const [open, setOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!oldPwd || !newPwd) { toast.error('请填写所有字段'); return; }
    if (newPwd !== confirm) { toast.error('两次密码不一致'); return; }
    if (newPwd.length < 6) { toast.error('密码至少6位'); return; }
    setLoading(true);
    await onSubmit(oldPwd, newPwd);
    setLoading(false);
    setOpen(false);
    setOldPwd(''); setNewPwd(''); setConfirm('');
  };

  if (!open) {
    return <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setOpen(true)}><Shield size={14} /> 修改密码</button>;
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>修改密码</div>
      <input className="input" type="password" placeholder="原密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} style={{ marginBottom: 10 }} />
      <input className="input" type="password" placeholder="新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} style={{ marginBottom: 10 }} />
      <input className="input" type="password" placeholder="确认新密码" value={confirm} onChange={e => setConfirm(e.target.value)} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>取消</button>
        <button className="btn btn-primary" onClick={submit} disabled={loading}>{loading ? '提交中...' : '确认'}</button>
      </div>
    </div>
  );
}