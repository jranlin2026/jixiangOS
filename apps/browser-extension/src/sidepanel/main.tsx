import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  matchScript,
  recommendationKey,
  shouldAttemptAutoFill,
  type ScriptLibrary,
  type ScriptLibraryView,
  type ScriptMatch,
} from '../domain/scriptLibrary';
import { ScriptLibraryEditor } from './ScriptLibraryEditor';
import { ScriptLibrarySection } from './ScriptLibrarySection';

type AuthState = { config?: ExtensionConfig; operator?: AuthenticatedOperator };
type ContactForm = { name: string; phone: string; wechat: string; source: 'CHAT' | 'OFF_PLATFORM' };
type RecognitionSnapshot = { id: number; context: FeigePageContext; hasContact: boolean };

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
  const [scriptView, setScriptView] = useState<ScriptLibraryView | null>(null);
  const [scriptDraft, setScriptDraft] = useState<ScriptLibrary | null>(null);
  const [managingScripts, setManagingScripts] = useState(false);
  const [savingScripts, setSavingScripts] = useState(false);
  const [recommendationMessage, setRecommendationMessage] = useState('');
  const [recommendation, setRecommendation] = useState<ScriptMatch | null>(null);
  const [recognition, setRecognition] = useState<RecognitionSnapshot | null>(null);
  const attemptedRecommendationKeys = useRef(new Set<string>());
  const recognitionSequence = useRef(0);
  const evaluatedRecognition = useRef(0);

  const canIntake = Boolean(context?.supported && context.platformOrderNo && form.name.trim()
    && (form.phone.trim() || form.wechat.trim()) && shopKey.trim() && contactConfirmed);
  const workflowLabel = useMemo(() => {
    if (sync) return sync.orderRemarkStatus === 'SUCCEEDED' ? '已完成' : '线索已入库，待备注';
    if (form.phone || form.wechat) return '联系方式待确认';
    return '等待联系方式';
  }, [form.phone, form.wechat, sync]);
  useEffect(() => {
    if (!recognition || !scriptView || evaluatedRecognition.current === recognition.id) return;
    evaluatedRecognition.current = recognition.id;
    const nextRecommendation = matchScript(scriptView.library, {
      orderStatus: recognition.context.orderStatus,
      productName: recognition.context.productName,
      hasContact: recognition.hasContact,
    });
    setRecommendation(nextRecommendation);
    if (!nextRecommendation) {
      setRecommendationMessage('');
      return;
    }
    const key = recommendationKey(recognition.context.platformOrderNo, nextRecommendation.script.id);
    if (!shouldAttemptAutoFill({
      orderNo: recognition.context.platformOrderNo,
      orderStatus: recognition.context.orderStatus,
      key,
      attemptedKeys: attemptedRecommendationKeys.current,
    })) return;
    attemptedRecommendationKeys.current.add(key);
    void activeTabCommand({
      type: 'FILL_FEIGE_REPLY_IF_EMPTY',
      text: nextRecommendation.script.content,
      expectedOrderNo: recognition.context.platformOrderNo,
      expectedCustomerDisplayName: recognition.context.customerDisplayName,
    })
      .then((result) => {
        if (!result.ok) {
          setRecommendationMessage(`已推荐话术，自动填入失败：${result.message}`);
          return;
        }
        if ('filled' in result && result.filled) setRecommendationMessage('已自动填入，请客服确认后发送');
        else setRecommendationMessage('输入框已有内容，仅提供推荐，未覆盖人工输入');
      })
      .catch((caught) => setRecommendationMessage(`已推荐话术，自动填入失败：${caught instanceof Error ? caught.message : '执行失败'}`));
  }, [recognition, scriptView]);

  const refreshContext = async () => {
    setError('');
    setNotice('');
    try {
      const result = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' });
      if (!('context' in result)) throw new Error('当前页面未返回飞鸽会话信息');
      const conversationChanged = context?.platformOrderNo !== result.context.platformOrderNo
        || context?.customerDisplayName !== result.context.customerDisplayName;
      const detectedHasContact = Boolean(result.detectedContact?.phone || result.detectedContact?.wechat);
      setContext(result.context);
      setRecognition({
        id: ++recognitionSequence.current,
        context: result.context,
        hasContact: detectedHasContact || (!conversationChanged && Boolean(form.phone.trim() || form.wechat.trim())),
      });
      if (conversationChanged) {
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
      setRecognition(null);
      setRecommendation(null);
      setRecommendationMessage('');
      setError(caught instanceof Error ? caught.message : '无法读取当前页面');
    }
  };

  const loadScriptLibrary = async () => {
    const result = await worker<ScriptLibraryView>({ type: 'GET_SCRIPT_LIBRARY' });
    if (result.code !== 0 || !result.data) throw new Error(result.message);
    setScriptView(result.data);
    return result.data;
  };

  useEffect(() => {
    void worker<AuthState>({ type: 'AUTH_STATE' }).then((result) => {
      if (result.data?.config) {
        setApiBaseUrl(result.data.config.apiBaseUrl);
        setShopKey(result.data.config.shopKey);
      }
      setAuth(result.data || {});
      setLoading(false);
      if (result.data?.operator) {
        void refreshContext();
        void loadScriptLibrary().catch((caught) => setError(caught instanceof Error ? caught.message : '话术加载失败'));
      }
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
      await Promise.all([refreshContext(), loadScriptLibrary()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败');
    } finally { setBusy(false); }
  };

  const logout = async () => {
    await worker({ type: 'LOGOUT' });
    setAuth((current) => ({ config: current.config }));
    setContext(null); setSync(null); setNotice(''); setScriptView(null); setScriptDraft(null); setManagingScripts(false);
    setRecommendationMessage(''); setRecommendation(null); setRecognition(null); attemptedRecommendationKeys.current.clear();
  };

  const fillScript = async (text: string) => {
    setError(''); setNotice('');
    try {
      const result = await activeTabCommand({
        type: 'FILL_FEIGE_REPLY_IF_EMPTY', text,
        expectedOrderNo: context?.platformOrderNo,
        expectedCustomerDisplayName: context?.customerDisplayName,
      });
      if (!result.ok) throw new Error(result.message);
      setNotice('filled' in result && result.filled
        ? '话术已填入飞鸽，请客服确认后发送'
        : '输入框已有内容，未覆盖人工输入');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '填入话术失败'); }
  };

  const beginManageScripts = () => {
    if (!scriptView?.canManage) return;
    setScriptDraft(structuredClone(scriptView.library));
    setManagingScripts(true);
  };

  const saveScripts = async () => {
    if (!scriptDraft) return;
    setSavingScripts(true); setError(''); setNotice('');
    try {
      const result = await worker<ScriptLibraryView>({ type: 'SAVE_SCRIPT_LIBRARY', library: scriptDraft });
      if (result.code !== 0 || !result.data) {
        if (result.code === 409) {
          await loadScriptLibrary();
          setManagingScripts(false);
        }
        throw new Error(result.message);
      }
      setScriptView(result.data);
      setScriptDraft(structuredClone(result.data.library));
      setRecommendation(null);
      setRecommendationMessage('');
      setManagingScripts(false);
      setNotice('话术库已更新，公司插件下次加载即使用新版本');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '话术保存失败');
    } finally { setSavingScripts(false); }
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

  if (managingScripts && scriptDraft) return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>飞鸽客服副驾驶</h1><p>{auth.operator.name}·话术库管理</p></div></header>
    {error && <div className="alert error">{error}</div>}
    <ScriptLibraryEditor library={scriptDraft} saving={savingScripts} onChange={setScriptDraft} onSave={() => void saveScripts()} onCancel={() => setManagingScripts(false)} />
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
        <div><span>订单状态</span><strong>{context.orderStatus || '未识别'}</strong></div>
        <div><span>商品</span><strong>{context.productName || '未识别'}</strong></div>
        <div><span>消息</span><strong>{context.messages.length}条</strong></div>
      </div> : <p className="empty">请打开抖店飞鸽客服会话，然后点击“刷新识别”。</p>}
      {context?.diagnostics.length ? <ul className="diagnostics">{context.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </section>

    <ScriptLibrarySection view={scriptView} match={recommendation} recommendationMessage={recommendationMessage} onFill={(text) => void fillScript(text)} onManage={beginManageScripts} />

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
