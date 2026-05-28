import { useEffect, useState } from 'react';
import { activationsApi } from '../../lib/api';
import { Unlink, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../stores/confirm';

interface Activation {
  id: string;
  card_id: string;
  card_code: string;
  app_id: string;
  device_id: string;
  device_name: string | null;
  ip_address: string | null;
  activated_at: string;
  last_verified_at: string;
  activate_count: number;
}

interface CardGroup {
  card_code: string;
  card_id: string;
  devices: Activation[];
  last_verified: string;
}

export default function Activations() {
  const [list, setList] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchCode, setSearchCode] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const PAGE_SIZE_OPTIONS = [10, 20, 50];

  const load = (p = page, ps = pageSize, code = searchCode) => {
    setLoading(true);
    setList([]);
    activationsApi.list({ page: p, page_size: ps, card_code: code || undefined }).then(res => {
      if (res.data.success) { setList(res.data.data); setTotal(res.data.total); }
    }).finally(() => setLoading(false));
  };

  const handlePageSize = (ps: number) => { setPage(1); setPageSize(ps); };

  useEffect(() => { load(page, pageSize, searchCode); }, [page, pageSize, searchCode]);

  const confirm = useConfirm();

  const handleUnbind = async (id: string) => {
    const ok = await confirm({ title: '解绑设备', message: '确认解绑此设备？', confirmText: '解绑', danger: true });
    if (!ok) return;
    try {
      const res = await activationsApi.unbind(id);
      if (res.data.success) { toast.success('设备已解绑'); load(); }
      else toast.error(res.data.message);
    } catch { toast.error('操作失败'); }
  };

  const toggleExpand = (cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  // 按卡密分组
  const grouped = new Map<string, CardGroup>();
  list.forEach(a => {
    const key = a.card_id || a.card_code;
    if (!grouped.has(key)) {
      grouped.set(key, { card_code: a.card_code, card_id: a.card_id, devices: [], last_verified: a.last_verified_at });
    }
    const g = grouped.get(key)!;
    g.devices.push(a);
    if (a.last_verified_at > g.last_verified) g.last_verified = a.last_verified_at;
  });
  const cardGroups = Array.from(grouped.values());

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">激活记录</h1>
          <p className="page-subtitle">
            {loading ? <span className="skeleton" style={{ display: 'inline-block', width: 90, height: 13, borderRadius: 4, verticalAlign: 'middle' }} /> : `共 ${total} 条激活记录`}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => load()}><RefreshCw size={14} /> 刷新</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, flex: '0 0 280px' }}>
          <label className="form-label" style={{ fontSize: 12 }}>搜索卡密</label>
          <input type="text" placeholder="输入卡密代码..." value={searchCode} onChange={e => setSearchCode(e.target.value)} style={{ fontSize: 13 }} />
        </div>
        {searchCode && <button className="btn btn-ghost" onClick={() => setSearchCode('')} style={{ fontSize: 12 }}>清除</button>}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 30 }}></th><th>卡密</th><th>设备数</th><th>最后验证</th></tr></thead>
          <tbody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="skeleton-row">
                <td></td><td><span className="skeleton" style={{ width: '70%' }} /></td>
                <td><span className="skeleton" style={{ width: 30 }} /></td>
                <td><span className="skeleton" style={{ width: '60%' }} /></td>
              </tr>
            )) : cardGroups.length === 0 ? (
              <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-icon">📡</div><div className="empty-state-text">暂无激活记录</div></div></td></tr>
            ) : cardGroups.map((g, idx) => (
              <>
                <tr key={g.card_id} className="data-enter" style={{ animationDelay: `${idx * 25}ms`, cursor: 'pointer' }} onClick={() => toggleExpand(g.card_id)}>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {expandedCards.has(g.card_id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td><span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{g.card_code}</span></td>
                  <td><strong>{g.devices.length}</strong> 台</td>
                  <td style={{ fontSize: 12 }}>{new Date(g.last_verified).toLocaleString('zh-CN')}</td>
                </tr>
                {expandedCards.has(g.card_id) && (
                  <tr>
                    <td colSpan={4} style={{ padding: '0 0 8px 0' }}>
                      <div style={{ margin: '0 12px 0 30px', background: 'var(--bg)', borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ margin: 0 }}>
                          <thead><tr><th style={{ width: 30 }}>#</th><th>设备ID</th><th>设备名称</th><th>IP 地址</th><th style={{ width: 50 }}>解绑</th></tr></thead>
                          <tbody>
                            {g.devices.map((d, i) => (
                              <tr key={d.id}>
                                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i + 1}</td>
                                <td><span className="mono" style={{ fontSize: 11 }}>{d.device_id.slice(0, 16)}…</span></td>
                                <td style={{ fontSize: 12 }}>{d.device_name || '—'}</td>
                                <td><span className="mono" style={{ fontSize: 11 }}>{d.ip_address || '—'}</span></td>
                                <td><button className="btn btn-sm btn-danger" onClick={() => handleUnbind(d.id)}><Unlink size={12} /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map(p => (
          <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
        ))}
        <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 4px' }}>每页</span>
        {PAGE_SIZE_OPTIONS.map(s => (
          <button key={s} className={`page-btn ${s === pageSize ? 'active' : ''}`} onClick={() => handlePageSize(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}