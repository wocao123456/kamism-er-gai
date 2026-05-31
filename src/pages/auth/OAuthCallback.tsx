import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/auth';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setAuth } = useAuthStore();
  const [message, setMessage] = useState('正在完成第三方登录...');

  useEffect(() => {
    const ticket = params.get('ticket');
    const error = params.get('error');
    if (error) {
      setMessage('第三方登录失败');
      toast.error('第三方登录失败');
      navigate('/login', { replace: true });
      return;
    }
    if (!ticket) {
      setMessage('第三方登录参数无效');
      toast.error('第三方登录参数无效');
      navigate('/login', { replace: true });
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/auth/oauth/result?ticket=${encodeURIComponent(ticket)}`);
        const json = await res.json();
        if (json.success && json.token && json.refresh_token && json.role && json.user) {
          setAuth(json.token, json.refresh_token, json.role, json.user);
          toast.success(json.created ? '第三方登录成功，已创建账号' : '第三方登录成功');
          navigate(json.role === 'admin' ? '/admin/dashboard' : '/dashboard', { replace: true });
        } else {
          setMessage(json.message || '第三方登录失败');
          toast.error(json.message || '第三方登录失败');
          navigate('/login', { replace: true });
        }
      } catch {
        setMessage('第三方登录失败，请检查网络');
        toast.error('第三方登录失败，请检查网络');
        navigate('/login', { replace: true });
      }
    })();
  }, [params, navigate, setAuth]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 'min(360px, calc(100vw - 32px))', textAlign: 'center', padding: 28 }}>
        <span className="spinner" />
        <div style={{ marginTop: 16, color: 'var(--text)', fontSize: 14 }}>{message}</div>
      </div>
    </div>
  );
}
