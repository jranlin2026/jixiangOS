import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  ApiEnvelope,
  AuthenticatedOperator,
  BrowserLeadIntakeInput,
  BrowserProductPreviewResponse,
  BrowserRuntimeSelection,
  BrowserRuntimeShop,
  CompleteOsOrderResult,
  ExtensionConfig,
  LeadIntakeResponse,
  LogoutResult,
  WorkerCommand,
} from '../shared/contracts';
import { hasRequiredOrderFacts } from '../shared/contracts';
import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import { activeTabCommand } from '../shared/activeTabMessaging';
import { withWorkerTimeout } from '../shared/workerMessaging';
import {
  matchScript,
  recommendationKey,
  shouldAttemptAutoFill,
  type ScriptLibrary,
  type ScriptLibraryView,
  type ScriptMatch,
} from '../domain/scriptLibrary';
import { isPaidOrderStatus } from '../domain/orderCompletion';
import { ScriptLibraryEditor } from './ScriptLibraryEditor';
import { ScriptLibrarySection } from './ScriptLibrarySection';
import { FeedbackDialog } from './FeedbackDialog';
import {
  runOrderCompletion,
  type PlatformCompletionReport,
} from './orderCompletionWorkflow';
import {
  completionAttemptSnapshot,
  completionPanelReducer,
  conversationKey,
  createCompletionPanelState,
  isCompletionFormLocked,
  productPreviewForPanel,
} from './orderCompletionPanelState';
import { pageShopMatchesBinding } from './orderCompletionWorkflow';

type AuthState = { config?: ExtensionConfig; operator?: AuthenticatedOperator };
type RecognitionSnapshot = { id: number; context: FeigePageContext; hasContact: boolean };

function completionStatus(status: string) {
  if (status === 'SUCCEEDED') return { className: 'success', label: '已完成' };
  if (status === 'FAILED') return { className: 'error', label: '失败' };
  if (status === 'IN_PROGRESS') return { className: 'warning', label: '处理中' };
  if (status === 'SUBMITTED') return { className: 'warning', label: '已提交' };
  return { className: 'warning', label: '待处理' };
}

async function sendWorkerCommand<T>(message: WorkerCommand): Promise<ApiEnvelope<T>> {
  return withWorkerTimeout(chrome.runtime.sendMessage(message));
}

function permissionPattern(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  return `${url.origin}/*`;
}

function formatMoney(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? `¥${value.toFixed(2)}` : '未识别';
}

function matchMethodLabel(method?: string) {
  if (method === 'PLATFORM_PRODUCT_ID') return '店铺商品映射';
  if (method === 'PLATFORM_SKU_ID') return '店铺SKU映射';
  if (method === 'SHOP_ALIAS') return '店铺商品别名';
  if (method === 'EXACT_OS_NAME') return 'OS产品同名';
  return '待后端确认';
}

function selectedRuntimeShop(shops: BrowserRuntimeShop[], shopBindingId: string) {
  return shops.find((shop) => shop.id === shopBindingId);
}

function normalizedFact(value: unknown) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function previewRepresentsContext(
  preview: BrowserProductPreviewResponse | null,
  context: FeigePageContext | null,
  shopBindingId: string,
) {
  if (!preview || !hasRequiredOrderFacts(context) || preview.shop.id !== shopBindingId) return false;
  return normalizedFact(preview.facts.platformProductId) === normalizedFact(context.platformProductId)
    && normalizedFact(preview.facts.platformSkuId) === normalizedFact(context.platformSkuId)
    && normalizedFact(preview.facts.platformProductName) === normalizedFact(context.productName)
    && preview.facts.paymentAmount === context.paymentAmount
    && new Date(preview.facts.paymentAt).getTime() === new Date(context.paymentAt).getTime();
}

function App() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auth, setAuth] = useState<AuthState>({});
  const [apiBaseUrl, setApiBaseUrl] = useState('http://127.0.0.1:3001/api');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [panel, dispatchPanel] = useReducer(completionPanelReducer, undefined, createCompletionPanelState);
  const {
    context,
    form,
    sync,
    completion,
    remarkText,
    contactConfirmed,
    runtimeConfig,
    shopBindingId,
    productPreview: authoritativePreview,
    productPreviewStatus,
  } = panel;
  const [scriptView, setScriptView] = useState<ScriptLibraryView | null>(null);
  const [scriptLibraryError, setScriptLibraryError] = useState('');
  const [scriptDraft, setScriptDraft] = useState<ScriptLibrary | null>(null);
  const [managingScripts, setManagingScripts] = useState(false);
  const [savingScripts, setSavingScripts] = useState(false);
  const [recommendationMessage, setRecommendationMessage] = useState('');
  const [recommendation, setRecommendation] = useState<ScriptMatch | null>(null);
  const [recognition, setRecognition] = useState<RecognitionSnapshot | null>(null);
  const attemptedRecommendationKeys = useRef(new Set<string>());
  const recognitionSequence = useRef(0);
  const evaluatedRecognition = useRef(0);
  const attemptSequence = useRef(0);
  const activeAttempt = useRef<{
    id: number;
    conversationKey: string;
    operatorId: string;
    shopBindingId: string;
    cancellationReason: 'LOGOUT' | 'UNMOUNT' | 'SHOP_CHANGE' | 'SESSION_CHANGE' | 'SUPERSEDED' | null;
  } | null>(null);
  const busyAttemptId = useRef<number | null>(null);
  const productPreviewSequence = useRef(0);
  const activeProductPreview = useRef<{ generation: number; requestKey: string } | null>(null);
  const mounted = useRef(false);
  const loggingOutRef = useRef(false);
  const activeOperatorId = useRef<string>();
  const currentShopBindingId = useRef(shopBindingId);
  const currentConversationKey = useRef(context ? conversationKey(context) : '');
  activeOperatorId.current = loggingOutRef.current ? undefined : auth.operator?.id;
  currentShopBindingId.current = shopBindingId;
  currentConversationKey.current = context ? conversationKey(context) : '';

  const clearAuthenticatedUi = (sessionExpiredMessage?: string) => {
    if (activeAttempt.current) activeAttempt.current.cancellationReason = 'SESSION_CHANGE';
    activeAttempt.current = null;
    busyAttemptId.current = null;
    activeProductPreview.current = null;
    activeOperatorId.current = undefined;
    loggingOutRef.current = false;
    setBusy(false);
    setLoggingOut(false);
    setAuth((current) => ({ config: current.config }));
    dispatchPanel({ type: 'RESET' });
    setNotice('');
    setScriptView(null);
    setScriptLibraryError('');
    setScriptDraft(null);
    setManagingScripts(false);
    setRecommendationMessage('');
    setRecommendation(null);
    setRecognition(null);
    attemptedRecommendationKeys.current.clear();
    if (sessionExpiredMessage) setError(sessionExpiredMessage);
  };

  const worker = async <T,>(message: WorkerCommand): Promise<ApiEnvelope<T>> => {
    const result = await sendWorkerCommand<T>(message);
    if (result.authOutcome === 'SESSION_EXPIRED_LOCAL_LOGOUT' && mounted.current) {
      clearAuthenticatedUi(result.message || '登录状态已失效，请重新登录');
    }
    return result;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeAttempt.current) activeAttempt.current.cancellationReason = 'UNMOUNT';
      activeAttempt.current = null;
      activeProductPreview.current = null;
    };
  }, []);

  const paidOrderRecognized = Boolean(context && isPaidOrderStatus(context.orderStatus));
  const completionFormLocked = isCompletionFormLocked(panel);
  const selectedShop = selectedRuntimeShop(runtimeConfig?.shops || [], shopBindingId);
  const productPreview = productPreviewForPanel(panel);
  const previewResolution = authoritativePreview?.productResolution;
  const referencePrice = productPreview?.status === 'MATCHED'
    ? productPreview.osReferencePrice ?? (
        previewResolution?.status === 'MATCHED'
        && (!productPreview.osProductId || previewResolution.osProductId === productPreview.osProductId)
          ? previewResolution.osReferencePrice
          : undefined
      )
    : undefined;
  const priceDiffers = authoritativePreview?.priceDifference?.differs === true
    && typeof referencePrice === 'number'
    && typeof context?.paymentAmount === 'number'
    && referencePrice !== context.paymentAmount;
  const pageShopMismatch = Boolean(context?.shopDisplayName && selectedShop
    && !pageShopMatchesBinding(context.shopDisplayName, selectedShop));
  const orderFactsReady = hasRequiredOrderFacts(context);
  const canRunAuthoritativePreflight = Boolean(context?.supported && context.platformOrderNo && form.name.trim()
    && (form.phone.trim() || form.wechat.trim()) && selectedShop && contactConfirmed
    && paidOrderRecognized && context.shopDisplayName?.trim() && orderFactsReady && !loggingOut);
  const canIntake = canRunAuthoritativePreflight
    && (productPreviewStatus === 'READY' || pageShopMismatch);
  const workflowLabel = useMemo(() => {
    if (completion?.stage === 'COMPLETED') return '订单闭环已完成';
    if (sync) return '线索已入库，待完成订单';
    if (form.phone || form.wechat) return '联系方式待确认';
    return '等待联系方式';
  }, [completion?.stage, form.phone, form.wechat, sync]);

  useEffect(() => {
    if (!recognition || !scriptView || evaluatedRecognition.current === recognition.id) return;
    evaluatedRecognition.current = recognition.id;
    if (!isPaidOrderStatus(recognition.context.orderStatus)) {
      setRecommendation(null);
      setRecommendationMessage('请先确认当前订单为已付款有效订单');
      return;
    }
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

  useEffect(() => {
    const operatorId = auth.operator?.id;
    const selectedShopId = selectedShop?.id;
    const orderNo = context?.platformOrderNo.trim() || '';
    const customerName = context?.customerDisplayName.trim() || '';
    const pageShopDisplayName = context?.shopDisplayName?.trim() || '';
    if (loggingOut || !operatorId || !selectedShopId || !context?.supported || !orderNo || !customerName
      || !hasRequiredOrderFacts(context)
      || !pageShopDisplayName || pageShopMismatch) {
      activeProductPreview.current = null;
      return;
    }
    if (productPreviewStatus === 'READY'
      && previewRepresentsContext(authoritativePreview, context, selectedShopId)) {
      activeProductPreview.current = null;
      return;
    }
    const requestKey = JSON.stringify([
      selectedShopId,
      orderNo,
      customerName,
      pageShopDisplayName,
      context.platformProductId?.trim() || '',
      context.platformSkuId?.trim() || '',
      context.productName.trim(),
      context.paymentAmount ?? null,
      context.paymentAt?.trim() || '',
    ]);
    if (activeProductPreview.current?.requestKey === requestKey) return;
    const generation = ++productPreviewSequence.current;
    activeProductPreview.current = { generation, requestKey };
    const requestIsActive = () => mounted.current
      && activeOperatorId.current === operatorId
      && activeProductPreview.current?.generation === generation
      && activeProductPreview.current.requestKey === requestKey;
    dispatchPanel({ type: 'START_PRODUCT_PREVIEW', generation, requestKey });
    void worker<BrowserProductPreviewResponse>({
      type: 'PREVIEW_PRODUCT_MAPPING',
      input: {
        platform: 'DOUYIN',
        shopBindingId: selectedShopId,
        pageShopDisplayName,
        platformProductId: context.platformProductId?.trim() || undefined,
        platformSkuId: context.platformSkuId?.trim() || undefined,
        platformProductName: context.productName.trim(),
        paymentAmount: context.paymentAmount,
        paymentAt: context.paymentAt.trim(),
      },
    }).then((result) => {
      if (!requestIsActive()) return;
      if (result.code === 0 && result.data) {
        dispatchPanel({ type: 'APPLY_PRODUCT_PREVIEW', generation, requestKey, preview: result.data });
        activeProductPreview.current = null;
        return;
      }
      const message = result.message || '商品匹配预览失败';
      dispatchPanel({ type: 'FAIL_PRODUCT_PREVIEW', generation, requestKey, message });
      if (result.errorCode === 'SHOP_BINDING_UNAVAILABLE') {
        dispatchPanel({ type: 'SELECT_SHOP_BINDING', shopBindingId: '' });
        void worker<ExtensionConfig>({ type: 'SAVE_CONFIG', config: { apiBaseUrl } });
      }
      activeProductPreview.current = null;
      setError(message);
    }).catch((caught) => {
      if (!requestIsActive()) return;
      const message = caught instanceof Error ? caught.message : '商品匹配预览失败';
      dispatchPanel({ type: 'FAIL_PRODUCT_PREVIEW', generation, requestKey, message });
      activeProductPreview.current = null;
      setError(message);
    });
  }, [
    apiBaseUrl,
    auth.operator?.id,
    selectedShop?.id,
    context?.supported,
    context?.readyForIntake,
    context?.platformOrderNo,
    context?.customerDisplayName,
    context?.shopDisplayName,
    context?.platformProductId,
    context?.platformSkuId,
    context?.productName,
    context?.paymentAmount,
    context?.paymentAt,
    productPreviewStatus,
    authoritativePreview,
    pageShopMismatch,
    loggingOut,
  ]);

  const refreshContext = async () => {
    if (loggingOutRef.current) return;
    if (activeAttempt.current) activeAttempt.current.cancellationReason = 'SESSION_CHANGE';
    activeAttempt.current = null;
    setError('');
    setNotice('');
    try {
      const result = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' });
      if (!('context' in result)) throw new Error('当前页面未返回飞鸽会话信息');
      const conversationChanged = context?.platformOrderNo !== result.context.platformOrderNo
        || context?.customerDisplayName !== result.context.customerDisplayName;
      const detectedHasContact = Boolean(result.detectedContact?.phone || result.detectedContact?.wechat);
      activeProductPreview.current = null;
      dispatchPanel({ type: 'RECOGNIZE_CONTEXT', context: result.context, detectedContact: result.detectedContact });
      setRecognition({
        id: ++recognitionSequence.current,
        context: result.context,
        hasContact: detectedHasContact || (!conversationChanged && Boolean(form.phone.trim() || form.wechat.trim())),
      });
    } catch (caught) {
      activeAttempt.current = null;
      dispatchPanel({ type: 'CLEAR_CONTEXT' });
      setRecognition(null);
      setRecommendation(null);
      setRecommendationMessage('');
      setError(caught instanceof Error ? caught.message : '无法读取当前页面');
    }
  };

  const loadScriptLibrary = async () => {
    setScriptLibraryError('');
    try {
      const result = await worker<ScriptLibraryView>({ type: 'GET_SCRIPT_LIBRARY' });
      if (result.code !== 0 || !result.data) throw new Error(result.message);
      setScriptView(result.data);
      return result.data;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '话术加载失败';
      setScriptLibraryError(message);
      throw caught;
    }
  };

  const loadRuntimeConfig = async () => {
    const result = await worker<BrowserRuntimeSelection>({ type: 'GET_RUNTIME_CONFIG' });
    if (result.code !== 0 || !result.data) throw new Error(result.message || '店铺绑定加载失败');
    const runtimeSelection = result.data;
    dispatchPanel({
      type: 'APPLY_RUNTIME_CONFIG',
      runtimeConfig: runtimeSelection,
      selectedShopBindingId: runtimeSelection.selectedShopBindingId || '',
    });
    setAuth((current) => ({
      ...current,
      config: {
        apiBaseUrl: current.config?.apiBaseUrl || apiBaseUrl,
        ...(runtimeSelection.selectedShopBindingId ? { shopBindingId: runtimeSelection.selectedShopBindingId } : {}),
      },
    }));
    return runtimeSelection;
  };

  useEffect(() => {
    void worker<AuthState>({ type: 'AUTH_STATE' }).then((result) => {
      if (result.data?.config) {
        setApiBaseUrl(result.data.config.apiBaseUrl);
      }
      setAuth(result.data || {});
      setLoading(false);
      if (result.data?.operator) {
        void Promise.all([refreshContext(), loadRuntimeConfig(), loadScriptLibrary()])
          .catch((caught) => setError(caught instanceof Error ? caught.message : '初始化失败'));
      }
    });
  }, []);

  const login = async () => {
    if (loggingOutRef.current) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const origin = permissionPattern(apiBaseUrl);
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) throw new Error('未授权插件访问极享OS地址');
      const config: ExtensionConfig = {
        apiBaseUrl,
        ...(auth.config?.shopBindingId ? { shopBindingId: auth.config.shopBindingId } : {}),
        ...(!auth.config?.shopBindingId && auth.config?.shopKey ? { shopKey: auth.config.shopKey } : {}),
      };
      const result = await worker<{ operator: AuthenticatedOperator; config: ExtensionConfig }>({
        type: 'LOGIN', config, account, password,
      });
      if (result.code !== 0 || !result.data) throw new Error(result.message);
      loggingOutRef.current = false;
      setAuth(result.data);
      setPassword('');
      setNotice(`已以${result.data.operator.name}登录`);
      await Promise.all([refreshContext(), loadRuntimeConfig(), loadScriptLibrary()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败');
    } finally { setBusy(false); }
  };

  const logout = async () => {
    if (loggingOutRef.current) return;
    const operatorId = auth.operator?.id;
    loggingOutRef.current = true;
    activeOperatorId.current = undefined;
    setLoggingOut(true);
    if (activeAttempt.current) activeAttempt.current.cancellationReason = 'LOGOUT';
    activeAttempt.current = null;
    busyAttemptId.current = null;
    setBusy(false);
    activeProductPreview.current = null;
    try {
      const result = await worker<LogoutResult>({ type: 'LOGOUT' });
      if (!mounted.current) return;
      if (result.code !== 0 || !result.data?.localLogoutCompleted) {
        throw new Error(result.message || '退出失败，请重试');
      }
      clearAuthenticatedUi();
    } catch (caught) {
      if (!mounted.current) return;
      loggingOutRef.current = false;
      activeOperatorId.current = operatorId;
      setLoggingOut(false);
      setError(caught instanceof Error ? caught.message : '退出失败，请重试');
    }
  };

  const selectShop = async (nextShopBindingId: string) => {
    if (loggingOutRef.current) return;
    setBusy(true); setError(''); setNotice('');
    if (activeAttempt.current) activeAttempt.current.cancellationReason = 'SHOP_CHANGE';
    activeAttempt.current = null;
    activeProductPreview.current = null;
    try {
      const config: ExtensionConfig = {
        apiBaseUrl,
        ...(nextShopBindingId ? { shopBindingId: nextShopBindingId } : {}),
      };
      const result = await worker<ExtensionConfig>({ type: 'SAVE_CONFIG', config });
      if (result.code !== 0 || !result.data) throw new Error(result.message || '店铺选择保存失败');
      const savedConfig = result.data;
      dispatchPanel({ type: 'SELECT_SHOP_BINDING', shopBindingId: nextShopBindingId });
      setAuth((current) => ({ ...current, config: savedConfig }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '店铺选择保存失败');
    } finally {
      setBusy(false);
    }
  };

  const fillScript = async (text: string) => {
    setError(''); setNotice('');
    const expectedCustomerDisplayName = context?.customerDisplayName.trim();
    if (!expectedCustomerDisplayName) {
      setError('请先刷新并识别当前飞鸽客户，再追加话术');
      return;
    }
    try {
      const result = await activeTabCommand({
        type: 'APPEND_FEIGE_REPLY', text,
        expectedOrderNo: context?.platformOrderNo,
        expectedCustomerDisplayName,
      });
      if (!result.ok) throw new Error(result.message);
      setNotice('话术已追加到飞鸽，请客服确认后发送');
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

  const completeOrder = async () => {
    if (loggingOutRef.current) return;
    const attempt = completionAttemptSnapshot(panel);
    const attemptShop = runtimeConfig?.shops.find((shop) => shop.id === attempt?.shopBindingId);
    const operatorId = auth.operator?.id;
    if (!context || !attempt || !attemptShop || !operatorId || !canIntake) return;
    const attemptId = ++attemptSequence.current;
    const expectedConversationKey = conversationKey({
      platformOrderNo: attempt.expectedOrderNo,
      customerDisplayName: attempt.expectedCustomerDisplayName,
    });
    if (activeAttempt.current) activeAttempt.current.cancellationReason = 'SUPERSEDED';
    const attemptToken = {
      id: attemptId,
      conversationKey: expectedConversationKey,
      operatorId,
      shopBindingId: attempt.shopBindingId,
      cancellationReason: null,
    };
    activeAttempt.current = attemptToken;
    busyAttemptId.current = attemptId;
    const isAttemptActive = () => mounted.current
      && activeOperatorId.current === operatorId
      && activeAttempt.current === attemptToken
      && attemptToken.cancellationReason === null
      && currentShopBindingId.current === attempt.shopBindingId
      && currentConversationKey.current === expectedConversationKey;
    const assertAttemptActive = () => {
      if (!isAttemptActive()) throw new Error('操作已取消');
    };
    dispatchPanel({ type: 'START_ATTEMPT', attemptId, conversationKey: expectedConversationKey });
    setBusy(true); setError(''); setNotice('');
    const latestRecognitionRef: { value: {
      context: FeigePageContext;
      detectedContact: { phone?: string; wechat?: string } | null;
    } | null } = { value: null };
    const latestAuthoritativePreviewRef: { value: BrowserProductPreviewResponse | null } = { value: null };
    try {
      const result = await runOrderCompletion({
        expectedOrderNo: attempt.expectedOrderNo,
        expectedCustomerDisplayName: attempt.expectedCustomerDisplayName,
        phone: attempt.phone,
        wechat: attempt.wechat,
        shop: attemptShop,
        pageShopDisplayName: context.shopDisplayName,
        displayedPreview: authoritativePreview || undefined,
        existingIntake: attempt.existingIntake,
        intakeInput: {
          platform: 'DOUYIN', shopBindingId: attempt.shopBindingId,
          pageShopDisplayName: context.shopDisplayName || '',
          platformOrderNo: attempt.expectedOrderNo,
          contactName: attempt.expectedCustomerDisplayName, contactPhone: attempt.phone,
          contactWechat: attempt.wechat, contactSource: attempt.source,
          platformProductId: context.platformProductId || undefined,
          platformSkuId: context.platformSkuId || undefined,
          platformProductName: context.productName,
          paymentAmount: context.paymentAmount as number,
          paymentAt: context.paymentAt || '',
        } satisfies BrowserLeadIntakeInput,
      }, {
        isAttemptActive,
        readContext: async () => {
          const latest = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' });
          if (!('context' in latest)) throw new Error('当前页面未返回飞鸽会话信息');
          latestRecognitionRef.value = { context: latest.context, detectedContact: latest.detectedContact };
          return latest.context;
        },
        preview: async (input) => {
          assertAttemptActive();
          const previewResult = await worker<BrowserProductPreviewResponse>({
            type: 'PREVIEW_PRODUCT_MAPPING',
            input,
          });
          assertAttemptActive();
          if (previewResult.code === 0 && previewResult.data) {
            latestAuthoritativePreviewRef.value = previewResult.data;
          }
          return previewResult;
        },
        intake: async (input) => {
          assertAttemptActive();
          const intakeResult = await worker<LeadIntakeResponse>({
            type: 'CREATE_LEAD_INTAKE',
            input: input as BrowserLeadIntakeInput,
          });
          assertAttemptActive();
          return intakeResult;
        },
        completePage: async (input) => {
          const completed = await activeTabCommand({ type: 'COMPLETE_FEIGE_OS_ORDER', input });
          if (!('stage' in completed) && !('remarkStatus' in completed)) {
            throw new Error('当前页面未返回订单闭环结果');
          }
          return completed as CompleteOsOrderResult;
        },
        report: (input) => worker<PlatformCompletionReport>({ type: 'REPORT_PLATFORM_COMPLETION', ...input }),
        onState: (state) => {
          if (!isAttemptActive()) return;
          dispatchPanel({
            type: 'APPLY_COMPLETION',
            attemptId,
            conversationKey: expectedConversationKey,
            completion: state,
          });
        },
      });
      if (!isAttemptActive() || result.stage === 'ABORTED') return;
      const latestRecognition = latestRecognitionRef.value;
      const latestAuthoritativePreview = latestAuthoritativePreviewRef.value;
      const conversationChanged = Boolean(latestRecognition
        && (attempt.expectedOrderNo !== latestRecognition.context.platformOrderNo
          || attempt.expectedCustomerDisplayName !== latestRecognition.context.customerDisplayName));
      if (result.errorCode === 'ORDER_FACTS_CHANGED'
        && latestRecognition
        && latestAuthoritativePreview
        && !conversationChanged) {
        dispatchPanel({
          type: 'APPLY_RECONFIRMATION_SNAPSHOT',
          attemptId,
          conversationKey: expectedConversationKey,
          context: latestRecognition.context,
          detectedContact: latestRecognition.detectedContact,
          preview: latestAuthoritativePreview,
        });
        setRecognition({
          id: ++recognitionSequence.current,
          context: latestRecognition.context,
          hasContact: Boolean(latestRecognition.detectedContact?.phone || latestRecognition.detectedContact?.wechat)
            || Boolean(form.phone.trim() || form.wechat.trim()),
        });
      } else if (latestRecognition && !conversationChanged) {
        dispatchPanel({
          type: 'RECOGNIZE_ATTEMPT_CONTEXT',
          attemptId,
          conversationKey: expectedConversationKey,
          context: latestRecognition.context,
          detectedContact: latestRecognition.detectedContact,
        });
        setRecognition({
          id: ++recognitionSequence.current,
          context: latestRecognition.context,
          hasContact: Boolean(latestRecognition.detectedContact?.phone || latestRecognition.detectedContact?.wechat)
            || (!conversationChanged && Boolean(form.phone.trim() || form.wechat.trim())),
        });
      }
      if (result.stage === 'COMPLETED') {
        const completedIntake = result.intakeResult;
        setNotice(`线索编号：${completedIntake?.lead.id || '未知'}；分配销售：${completedIntake?.lead.assignedTo || '暂未分配'}；订单备注、绿色旗帜均已验证`);
      } else if (result.message) setError(result.message);
      if (activeAttempt.current === attemptToken) activeAttempt.current = null;
    } catch (caught) {
      if (isAttemptActive()) {
        setError(caught instanceof Error ? caught.message : '线索入库失败');
        activeAttempt.current = null;
      }
    } finally {
      if (busyAttemptId.current === attemptId) {
        busyAttemptId.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  };

  const feedbackDialog = <FeedbackDialog
    error={error}
    notice={notice}
    onClose={() => { setError(''); setNotice(''); }}
  />;

  if (loading) return <main className="shell"><div className="loading">正在连接极享OS…</div></main>;

  if (!auth.operator) return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>极享AI浏览器员工</h1><p>飞鸽客服·线索入库</p></div></header>
    <section className="card login-card">
      <h2>连接极享OS</h2>
      <label>极享OS API地址<input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} /></label>
      <label>账号<input value={account} onChange={(event) => setAccount(event.target.value)} /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="primary" disabled={busy || !account || !password || !apiBaseUrl.trim()} onClick={() => void login()}>{busy ? '正在登录…' : '登录并连接'}</button>
      <p className="hint">密码仅用于本次登录，不会保存在插件中。</p>
    </section>
    {feedbackDialog}
  </main>;

  if (managingScripts && scriptDraft) return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>飞鸽客服副驾驶</h1><p>{auth.operator.name}·话术库管理</p></div></header>
    <ScriptLibraryEditor library={scriptDraft} saving={savingScripts} onChange={setScriptDraft} onSave={() => void saveScripts()} onCancel={() => setManagingScripts(false)} />
    {feedbackDialog}
  </main>;

  return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>飞鸽客服副驾驶</h1><p>{auth.operator.name}·{workflowLabel}</p></div><button className="text-button" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? '正在退出…' : '退出'}</button></header>
    {feedbackDialog}

    <section className="card context-card">
      <div className="section-title"><h2>当前会话</h2><button className="secondary compact" disabled={busy || loggingOut} onClick={() => void refreshContext()}>刷新识别</button></div>
      {runtimeConfig && runtimeConfig.shops.length > 1 ? <label>绑定店铺
        <select
          aria-label="绑定店铺"
          disabled={busy || loggingOut || completionFormLocked}
          value={shopBindingId}
          onChange={(event) => void selectShop(event.target.value)}
        >
          <option value="">请选择当前店铺</option>
          {runtimeConfig.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.displayName}</option>)}
        </select>
      </label> : null}
      {context ? <div className="facts">
        <div><span>客户</span><strong>{context.customerDisplayName || '未识别'}</strong></div>
        <div><span>订单</span><strong>{context.platformOrderNo || '未识别'}</strong></div>
        <div><span>订单状态</span><strong>{context.orderStatus || '未识别'}</strong></div>
        <div><span>绑定店铺</span><strong>{selectedShop?.displayName || '未选择'}</strong></div>
        <div><span>页面店铺</span><strong>{context.shopDisplayName || '未识别'}</strong></div>
        <div><span>平台商品</span><strong>{context.productName || '未识别'}</strong></div>
        <div><span>匹配产品</span><strong>{productPreview?.status === 'MATCHED'
          ? productPreview.osProductName || '待后端确认'
          : productPreview?.status === 'UNMATCHED'
            ? '待匹配（本次仍可录入，平台原名会写入OS备注）'
            : productPreviewStatus === 'LOADING' ? '正在匹配…' : '待匹配预览'}</strong></div>
        <div><span>匹配方式</span><strong>{productPreview?.status === 'MATCHED'
          ? matchMethodLabel(productPreview.method)
          : productPreviewStatus === 'LOADING' ? '正在匹配…' : '未匹配'}</strong></div>
        <div><span>OS参考价</span><strong>{typeof referencePrice === 'number' ? formatMoney(referencePrice) : '暂未提供'}</strong></div>
        <div><span>实付金额</span><strong>{formatMoney(context.paymentAmount)}</strong></div>
        <div><span>付款时间</span><strong>{context.paymentAt || '未识别'}</strong></div>
        <div><span>消息</span><strong>{context.messages.length}条</strong></div>
      </div> : <p className="empty">请打开抖店飞鸽客服会话，然后点击“刷新识别”。</p>}
      {context?.diagnostics.length ? <ul className="diagnostics">{context.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {runtimeConfig && runtimeConfig.shops.length > 1 && !selectedShop
        ? <div className="alert warning">当前有多个启用店铺，请手工选择后再入库。</div> : null}
      {pageShopMismatch
        ? <div className="alert warning">当前页面店铺与已选店铺绑定不一致，请切换店铺或刷新识别后重试。</div> : null}
      {context && selectedShop && !context.shopDisplayName?.trim()
        ? <div className="alert warning">当前页面店铺未识别或存在歧义，请刷新飞鸽页面并重新识别。</div> : null}
      {context && !orderFactsReady
        ? <div className="alert warning">当前订单的平台商品名称、实付金额或付款时间未完整唯一识别，请等待订单加载完成后刷新识别。</div> : null}
      {productPreview?.status === 'UNMATCHED'
        ? <div className="alert warning">商品尚未匹配OS标准产品，本次仍可录入；平台原名“{productPreview.rawProductName || context?.productName || '未识别'}”将写入OS备注。</div> : null}
      {priceDiffers
        ? <div className="alert warning">OS参考价 {formatMoney(referencePrice)}，仅供参考；本次按飞鸽实付 {formatMoney(context?.paymentAmount)} 录入</div> : null}
    </section>

    <ScriptLibrarySection
      view={scriptView}
      match={recommendation}
      recommendationMessage={recommendationMessage}
      loadError={scriptLibraryError}
      onFill={(text) => void fillScript(text)}
      onManage={beginManageScripts}
      onRetry={() => {
        setError('');
        void loadScriptLibrary().catch((caught) => setError(caught instanceof Error ? caught.message : '话术加载失败'));
      }}
    />

    <section className="card">
      <div className="section-title"><h2>联系方式</h2><span className={`status ${form.phone || form.wechat ? 'ready' : ''}`}>{form.phone || form.wechat ? '已获取' : '待获取'}</span></div>
      <div className="source-switch"><button disabled={completionFormLocked} className={form.source === 'CHAT' ? 'active' : ''} onClick={() => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'source', value: 'CHAT' })}>客户聊天提供</button><button disabled={completionFormLocked} className={form.source === 'OFF_PLATFORM' ? 'active' : ''} onClick={() => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'source', value: 'OFF_PLATFORM' })}>站外已获取</button></div>
      <label>抖音昵称<input value={form.name} readOnly placeholder="请先刷新识别当前客户" /></label>
      <label>手机号<input disabled={completionFormLocked} value={form.phone} onChange={(event) => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'phone', value: event.target.value })} placeholder="手机号和微信至少填一项" /></label>
      <label>微信号<input disabled={completionFormLocked} value={form.wechat} onChange={(event) => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'wechat', value: event.target.value })} placeholder="可选" /></label>
      <label className="confirm-row"><input disabled={completionFormLocked} type="checkbox" checked={contactConfirmed} onChange={(event) => dispatchPanel({ type: 'SET_CONTACT_CONFIRMED', value: event.target.checked })} /> 我已确认昵称和联系方式属于当前订单</label>
      {context && !paidOrderRecognized && <div className="alert warning">请先确认当前订单为已付款有效订单</div>}
      <button data-action="complete-order" className="primary" disabled={busy || loggingOut || !canIntake || Boolean(sync)} onClick={() => void completeOrder()}>{busy ? '正在处理…' : sync ? '极享OS已入库' : '一键入OS并完成订单'}</button>
    </section>

    {(completion || sync) && <section className="card result-card">
      <h2>处理结果</h2>
      {sync && <div className="facts"><div><span>线索编号</span><strong>{sync.lead.id}</strong></div><div><span>分配销售</span><strong>{sync.lead.assignedTo || '暂未分配'}</strong></div></div>}
      <div className="completion-steps">
        {([
          ['极享OS入库', completion?.osStatus || (sync ? 'SUCCEEDED' : 'NOT_ATTEMPTED')],
          ['订单备注', completion?.orderRemarkStatus || sync?.orderRemarkStatus || 'NOT_ATTEMPTED'],
          ['绿色旗帜', completion?.greenFlagStatus || sync?.greenFlagStatus || 'NOT_ATTEMPTED'],
        ] as const).map(([label, status]) => {
          const presentation = completionStatus(status);
          return <div key={label}><span>{label}</span><strong className={`status ${presentation.className}`}>{presentation.label}</strong></div>;
        })}
      </div>
      {remarkText && <pre className="remark-preview">{remarkText}</pre>}
      {completion?.stage === 'PLATFORM_FAILED' && sync && <div className="result-actions">
        <button className="secondary" onClick={() => void navigator.clipboard.writeText(remarkText)}>复制备注</button>
        <button className="secondary" disabled={busy || loggingOut || !canIntake} onClick={() => void completeOrder()}>{busy ? '正在重试…' : '重试订单备注和绿旗'}</button>
      </div>}
    </section>}
  </main>;
}

export const sidepanelRoot = createRoot(document.getElementById('root')!);
sidepanelRoot.render(<React.StrictMode><App /></React.StrictMode>);
