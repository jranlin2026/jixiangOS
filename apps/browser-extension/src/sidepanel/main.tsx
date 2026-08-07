import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  ApiEnvelope,
  AuthenticatedOperator,
  ExtensionConfig,
  LeadIntakeResponse,
  WorkerCommand,
} from '../shared/contracts';
import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import { activeTabCommand } from '../shared/activeTabMessaging';

const scripts = [
  { label: '下单欢迎', text: '您好，已经看到您的订单了，我们会尽快为您安排后续服务。' },
  { label: '索要联系方式', text: '为了安排专属老师联系您，请回复您的姓名和手机号。' },
  { label: '站外联系', text: '如果平台内不方便发送联系方式，您可以通过站外联系老师，取得联系方式后我帮您完成登记。' },
];

type AuthState = { config?: ExtensionConfig; operator?: AuthenticatedOperator };
type ContactForm = { name: string; phone: string; wechat: string; source: 'CHAT' | 'OFF_PLATFORM' };

async function worker<T>(message: WorkerCommand): Promise<ApiEnvelope<T>> {
  return chrome.runtime.sendMessage(message);
}

function permissionPattern(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  return `${url.origin}/*`;
}

function orderRemarkText(form: ContactForm, result: LeadIntakeResponse, operator?: AuthenticatedOperator) {
  const contact = form.phone ? form.phone : `微信：${form.wechat}`;
  return `【极享OS已录入】客户：${form.name}；联系：${contact}；线索：${result.lead.id}；录入：${operator?.name || '-'}；`;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auth, setAuth] = useState<AuthState>({});
  const [apiBaseUrl, setApiBaseUrl] = useState('http://127.0.0.1:3001/api');
  const [shopKey, setShopKey] = useState('jixiang-douyin');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [context, setContext] = useState<FeigePageContext | null>(null);
  const [form, setForm] = useState<ContactForm>({ name: '', phone: '', wechat: '', source: 'CHAT' });
  const [sync, setSync] = useState<LeadIntakeResponse | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkMessage, setRemarkMessage] = useState('');
  const [contactConfirmed, setContactConfirmed] = useState(false);

  const canIntake = Boolean(context?.supported && context.platformOrderNo && form.name.trim()
    && (form.phone.trim() || form.wechat.trim()) && shopKey.trim() && contactConfirmed);
  const workflowLabel = useMemo(() => {
    if (sync) return sync.orderRemarkStatus === 'SUCCEEDED' ? '已完成' : '线索已入库，待备注';
    if (form.phone || form.wechat) return '联系方式待确认';
    return '等待联系方式';
  }, [form.phone, form.wechat, sync]);

  const refreshContext = async () => {
    setError('');
    setNotice('');
    try {
      const result = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' });
      if (!('context' in result)) throw new Error('当前页面未返回飞鸽会话信息');
      const orderChanged = context?.platformOrderNo !== result.context.platformOrderNo;
      setContext(result.context);
      if (orderChanged) {
        setContactConfirmed(false);
        setSync(null); setRemarkText(''); setRemarkMessage('');
        setForm({
          name: result.context.customerDisplayName,
          phone: result.detectedContact?.phone || '',
          wechat: result.detectedContact?.wechat || '',
          source: result.detectedContact ? 'CHAT' : 'OFF_PLATFORM',
        });
      } else {
        setForm((current) => ({
          ...current,
          phone: result.detectedContact?.phone || current.phone,
          wechat: result.detectedContact?.wechat || current.wechat,
          source: result.detectedContact ? 'CHAT' : current.source,
        }));
      }
    } catch (caught) {
      setContext(null);
      setError(caught instanceof Error ? caught.message : '无法读取当前页面');
    }
  };

  useEffect(() => {
    void worker<AuthState>({ type: 'AUTH_STATE' }).then((result) => {
      if (result.data?.config) {
        setApiBaseUrl(result.data.config.apiBaseUrl);
        setShopKey(result.data.config.shopKey);
      }
      setAuth(result.data || {});
      setLoading(false);
      if (result.data?.operator) void refreshContext();
    });
  }, []);

  const login = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const origin = permissionPattern(apiBaseUrl);
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) throw new Error('未授权插件访问极享OS地址');
      const config = { apiBaseUrl, shopKey };
      const result = await worker<{ operator: AuthenticatedOperator; config: ExtensionConfig }>({
        type: 'LOGIN', config, account, password,
      });
      if (result.code !== 0 || !result.data) throw new Error(result.message);
      setAuth(result.data);
      setPassword('');
      setNotice(`已以${result.data.operator.name}登录`);
      await refreshContext();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败');
    } finally { setBusy(false); }
  };

  const logout = async () => {
    await worker({ type: 'LOGOUT' });
    setAuth((current) => ({ config: current.config }));
    setContext(null); setSync(null); setNotice('');
  };

  const fillScript = async (text: string) => {
    setError(''); setNotice('');
    try {
      const result = await activeTabCommand({ type: 'FILL_FEIGE_REPLY', text });
      if (!result.ok) throw new Error(result.message);
      setNotice('话术已填入飞鸽，请客服确认后发送');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '填入话术失败'); }
  };

  const reportRemark = async (result: LeadIntakeResponse, text: string, expectedOrderNo: string) => {
    try {
      const current = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' });
      if (!('context' in current) || !current.context.supported
        || current.context.platformOrderNo !== expectedOrderNo) {
        throw new Error('当前飞鸽会话已切换，已停止写入订单备注');
      }
      const pageResult = await activeTabCommand({ type: 'SAVE_ORDER_REMARK', text });
      const status = pageResult.ok ? 'SUBMITTED' : 'FAILED';
      const reported = await worker<{ syncId: string; orderRemarkStatus: LeadIntakeResponse['orderRemarkStatus'] }>({
        type: 'REPORT_ORDER_REMARK', syncId: result.syncId, status,
        ...(!pageResult.ok ? { errorMessage: pageResult.message } : {}),
      });
      if (reported.code !== 0) throw new Error(reported.message);
      setSync({ ...result, orderRemarkStatus: status });
      setRemarkMessage(pageResult.ok
        ? '已点击平台保存，等待真实飞鸽页面校准成功信号；请客服目视确认'
        : `${pageResult.message}，可复制下方备注手工处理`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '订单备注失败';
      await worker({ type: 'REPORT_ORDER_REMARK', syncId: result.syncId, status: 'FAILED', errorMessage: message });
      setSync({ ...result, orderRemarkStatus: 'FAILED' });
      setRemarkMessage(`${message}，可复制下方备注手工处理`);
    }
  };

  const intake = async () => {
    if (!context || !canIntake) return;
    setBusy(true); setError(''); setNotice(''); setRemarkMessage('');
    try {
      const latest = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' });
      if (!('context' in latest) || !latest.context.supported
        || latest.context.platformOrderNo !== context.platformOrderNo) {
        setContactConfirmed(false);
        setSync(null);
        throw new Error('当前飞鸽会话已切换，请刷新识别并重新确认客户资料');
      }
      setContext(latest.context);
      const result = await worker<LeadIntakeResponse>({
        type: 'CREATE_LEAD_INTAKE',
        input: {
          platform: 'DOUYIN', shopKey: shopKey.trim(), platformOrderNo: context.platformOrderNo,
          contactName: form.name.trim(), contactPhone: form.phone.trim() || undefined,
          contactWechat: form.wechat.trim() || undefined, contactSource: form.source,
          sourceProductName: context.productName || undefined,
        },
      });
      if (result.code !== 0 || !result.data) throw new Error(result.message);
      setSync(result.data);
      const text = orderRemarkText(form, result.data, auth.operator);
      setRemarkText(text);
      setNotice(result.data.outcome === 'CREATED'
        ? `线索已入库，销售：${result.data.lead.assignedTo || '待分配'}`
        : '该订单已入库，本次没有重复创建线索');
      if (result.data.outcome === 'CREATED') {
        await reportRemark(result.data, text, context.platformOrderNo);
      } else {
        setRemarkText('');
        setRemarkMessage('为避免覆盖原客户资料，重复入库不会再次改写平台订单备注');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '线索入库失败');
    } finally { setBusy(false); }
  };

  if (loading) return <main className="shell"><div className="loading">正在连接极享OS…</div></main>;

  if (!auth.operator) return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>极享AI浏览器员工</h1><p>飞鸽客服·线索入库</p></div></header>
    <section className="card login-card">
      <h2>连接极享OS</h2>
      <label>极享OS API地址<input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} /></label>
      <label>店铺标识<input value={shopKey} onChange={(event) => setShopKey(event.target.value)} /></label>
      <label>账号<input value={account} onChange={(event) => setAccount(event.target.value)} /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div className="alert error">{error}</div>}
      <button className="primary" disabled={busy || !account || !password || !shopKey} onClick={() => void login()}>{busy ? '正在登录…' : '登录并连接'}</button>
      <p className="hint">密码仅用于本次登录，不会保存在插件中。</p>
    </section>
  </main>;

  return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>飞鸽客服副驾驶</h1><p>{auth.operator.name}·{workflowLabel}</p></div><button className="text-button" onClick={() => void logout()}>退出</button></header>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    <section className="card context-card">
      <div className="section-title"><h2>当前会话</h2><button className="secondary compact" onClick={() => void refreshContext()}>刷新识别</button></div>
      {context ? <div className="facts">
        <div><span>客户</span><strong>{context.customerDisplayName || '未识别'}</strong></div>
        <div><span>订单</span><strong>{context.platformOrderNo || '未识别'}</strong></div>
        <div><span>商品</span><strong>{context.productName || '未识别'}</strong></div>
        <div><span>消息</span><strong>{context.messages.length}条</strong></div>
      </div> : <p className="empty">请打开抖店飞鸽客服会话，然后点击“刷新识别”。</p>}
      {context?.diagnostics.length ? <ul className="diagnostics">{context.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </section>

    <section className="card">
      <h2>常用话术</h2>
      <div className="script-grid">{scripts.map((item) => <button key={item.label} className="script-button" onClick={() => void fillScript(item.text)}><strong>{item.label}</strong><span>{item.text}</span></button>)}</div>
      <p className="hint">话术只填入输入框，需客服确认后发送。</p>
    </section>

    <section className="card">
      <div className="section-title"><h2>联系方式</h2><span className={`status ${form.phone || form.wechat ? 'ready' : ''}`}>{form.phone || form.wechat ? '已获取' : '待获取'}</span></div>
      <div className="source-switch"><button className={form.source === 'CHAT' ? 'active' : ''} onClick={() => { setForm({ ...form, source: 'CHAT' }); setContactConfirmed(false); }}>客户聊天提供</button><button className={form.source === 'OFF_PLATFORM' ? 'active' : ''} onClick={() => { setForm({ ...form, source: 'OFF_PLATFORM' }); setContactConfirmed(false); }}>站外已获取</button></div>
      <label>客户姓名<input value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setContactConfirmed(false); }} placeholder="请客服确认真实姓名" /></label>
      <label>手机号<input value={form.phone} onChange={(event) => { setForm({ ...form, phone: event.target.value }); setContactConfirmed(false); }} placeholder="手机号和微信至少填一项" /></label>
      <label>微信号<input value={form.wechat} onChange={(event) => { setForm({ ...form, wechat: event.target.value }); setContactConfirmed(false); }} placeholder="可选" /></label>
      <label className="confirm-row"><input type="checkbox" checked={contactConfirmed} onChange={(event) => setContactConfirmed(event.target.checked)} /> 我已确认姓名和联系方式属于当前订单</label>
      <button className="primary" disabled={busy || !canIntake || Boolean(sync)} onClick={() => void intake()}>{busy ? '正在入库…' : sync ? '线索已入库' : '一键完成入库'}</button>
    </section>

    {sync && <section className="card result-card">
      <h2>处理结果</h2>
      <div className="facts"><div><span>线索编号</span><strong>{sync.lead.id}</strong></div><div><span>分配销售</span><strong>{sync.lead.assignedTo || '待分配'}</strong></div><div><span>订单备注</span><strong>{sync.orderRemarkStatus === 'SUCCEEDED' ? '已确认保存' : sync.orderRemarkStatus === 'SUBMITTED' ? '已提交待确认' : '待人工确认'}</strong></div></div>
      {remarkMessage && <div className={`alert ${sync.orderRemarkStatus === 'SUCCEEDED' ? 'success' : 'warning'}`}>{remarkMessage}</div>}
      {remarkText && <><pre className="remark-preview">{remarkText}</pre><div className="result-actions"><button className="secondary" onClick={() => void navigator.clipboard.writeText(remarkText)}>复制备注</button>{sync.orderRemarkStatus !== 'SUCCEEDED' && context?.platformOrderNo && <button className="secondary" onClick={() => void reportRemark(sync, remarkText, context.platformOrderNo)}>重试写入</button>}</div></>}
    </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
