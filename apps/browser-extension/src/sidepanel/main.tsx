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
import { hasRequiredIntakeContext } from '../shared/contracts';
import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import { activeTabCommand } from '../shared/activeTabMessaging';
import { withWorkerTimeout } from '../shared/workerMessaging';
import { scriptLibrarySettingsUrl } from '../shared/osSettingsUrl';
import {
  matchScript,
  type ScriptLibraryView,
  type ScriptMatch,
} from '../domain/scriptLibrary';
import { isIntakeEligibleOrderStatus } from '../domain/orderCompletion';
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

function selectedRuntimeShop(shops: BrowserRuntimeShop[], shopBindingId: string) {
  return shops.find((shop) => shop.id === shopBindingId);
}

function normalizedFact(value: unknown) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function formatPlatformPaymentAmount(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? `¥${value.toFixed(2)}` : '未识别';
}

function formatPlatformPaymentTime(value?: string) {
  if (!value) return '未识别';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未识别';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

function sameOptionalInstant(left?: string, right?: string) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function previewRepresentsContext(
  preview: BrowserProductPreviewResponse | null,
  context: FeigePageContext | null,
  shopBindingId: string,
) {
  if (!preview || !hasRequiredIntakeContext(context) || preview.shop.id !== shopBindingId) return false;
  return normalizedFact(preview.facts.platformProductId) === normalizedFact(context.platformProductId)
    && normalizedFact(preview.facts.platformSkuId) === normalizedFact(context.platformSkuId)
    && normalizedFact(preview.facts.platformProductName) === normalizedFact(context.productName)
    && preview.facts.paymentAmount === context.paymentAmount
    && sameOptionalInstant(preview.facts.paymentAt, context.paymentAt);
}

function App() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auth, setAuth] = useState<AuthState>({});
  const [apiBaseUrl, setApiBaseUrl] = useState('http://127.0.0.1:3001/api');
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
  const [recommendationMessage, setRecommendationMessage] = useState('');
  const [recommendation, setRecommendation] = useState<ScriptMatch | null>(null);
  const [recognition, setRecognition] = useState<RecognitionSnapshot | null>(null);
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
    setRecommendationMessage('');
    setRecommendation(null);
    setRecognition(null);
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

  const completionFormLocked = isCompletionFormLocked(panel);
  const selectedShop = selectedRuntimeShop(runtimeConfig?.shops || [], shopBindingId);
  const productPreview = productPreviewForPanel(panel);
  const criticalDiagnostics = context?.diagnostics.filter((item) => (
    /客户昵称|平台订单号|多张可见活动订单卡/.test(item)
  )) || [];
  const canRunAuthoritativePreflight = Boolean(context?.supported && context.platformOrderNo && form.name.trim()
    && (form.phone.trim() || form.wechat.trim()) && selectedShop && contactConfirmed
    && hasRequiredIntakeContext(context) && isIntakeEligibleOrderStatus(context.orderStatus) && !loggingOut);
  const canIntake = canRunAuthoritativePreflight && productPreviewStatus === 'READY';
  const intakeBlockedReason = sync ? ''
    : !context ? '请先刷新识别当前会话'
      : !context.supported ? '当前页面不是受支持的抖店飞鸽会话'
        : !context.customerDisplayName.trim() ? '未识别客户昵称，请刷新当前会话'
          : !context.platformOrderNo.trim() ? '未识别平台订单号，请展开订单后刷新'
            : !hasRequiredIntakeContext(context) ? '订单必要信息尚未识别完整，请展开订单后刷新'
              : !selectedShop ? '请先选择当前店铺'
                : !(form.phone.trim() || form.wechat.trim()) ? '请至少填写手机号或微信号'
                    : !contactConfirmed ? '请先核对并确认客户资料'
                      : !isIntakeEligibleOrderStatus(context.orderStatus) ? '当前订单状态暂不支持入OS'
                        : productPreviewStatus === 'LOADING' ? '正在校验订单与商品信息'
                          : productPreviewStatus === 'FAILED' ? '订单或商品校验失败，请按上方提示处理'
                            : '请根据上方提示完善信息';
  const workflowLabel = useMemo(() => {
    if (completion?.stage === 'COMPLETED') return '订单闭环已完成';
    if (sync) return '线索已入库，待完成订单';
    if (form.phone || form.wechat) return '联系方式待确认';
    return '等待联系方式';
  }, [completion?.stage, form.phone, form.wechat, sync]);

  useEffect(() => {
    if (!recognition || !scriptView || evaluatedRecognition.current === recognition.id) return;
    evaluatedRecognition.current = recognition.id;
    const nextRecommendation = matchScript(scriptView.library, {
      orderStatus: recognition.context.orderStatus,
      productName: recognition.context.productName,
      hasContact: recognition.hasContact,
    });
    setRecommendation(nextRecommendation);
    setRecommendationMessage(nextRecommendation ? '点击推荐话术后，将追加到回复框末尾。' : '');
  }, [recognition, scriptView]);

  useEffect(() => {
    const operatorId = auth.operator?.id;
    const selectedShopId = selectedShop?.id;
    const orderNo = context?.platformOrderNo.trim() || '';
    const customerName = context?.customerDisplayName.trim() || '';
    if (loggingOut || !operatorId || !selectedShopId || !context?.supported || !orderNo || !customerName
      || !hasRequiredIntakeContext(context)) {
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
        platformProductId: context.platformProductId?.trim() || undefined,
        platformSkuId: context.platformSkuId?.trim() || undefined,
        platformProductName: context.productName.trim() || undefined,
        paymentAmount: context.paymentAmount,
        paymentAt: context.paymentAt?.trim() || undefined,
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
    context?.platformProductId,
    context?.platformSkuId,
    context?.productName,
    context?.paymentAmount,
    context?.paymentAt,
    productPreviewStatus,
    authoritativePreview,
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
      if (result.code !== 0) setError(result.message || '极享OS连接已失效');
      if (result.data?.operator) {
        void Promise.all([refreshContext(), loadRuntimeConfig(), loadScriptLibrary()])
          .catch((caught) => setError(caught instanceof Error ? caught.message : '初始化失败'));
      }
    });
  }, []);

  async function connect(interactive = true) {
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
        type: 'CONNECT_OS', config, interactive,
      });
      if (result.code !== 0 || !result.data) throw new Error(result.message);
      loggingOutRef.current = false;
      setAuth(result.data);
      setNotice(`已连接极享OS：${result.data.operator.name}`);
      await Promise.all([refreshContext(), loadRuntimeConfig(), loadScriptLibrary()]);
    } catch (caught) {
      if (interactive) setError(caught instanceof Error ? caught.message : '连接失败');
    } finally { setBusy(false); }
  }

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
        displayedPreview: authoritativePreview || undefined,
        existingIntake: attempt.existingIntake,
        intakeInput: {
          platform: 'DOUYIN', shopBindingId: attempt.shopBindingId,
          platformOrderNo: attempt.expectedOrderNo,
          contactName: attempt.expectedCustomerDisplayName, contactPhone: attempt.phone,
          contactWechat: attempt.wechat, contactSource: attempt.source,
          platformProductId: context.platformProductId || undefined,
          platformSkuId: context.platformSkuId || undefined,
          ...(context.productName.trim() ? { platformProductName: context.productName.trim() } : {}),
          ...(typeof context.paymentAmount === 'number' ? { paymentAmount: context.paymentAmount } : {}),
          ...(context.paymentAt?.trim() ? { paymentAt: context.paymentAt.trim() } : {}),
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
        setNotice(`线索编号：${completedIntake?.lead.id || '未知'}；分配销售：${completedIntake?.lead.assignedTo || '暂未分配'}；订单备注、红色旗帜均已验证`);
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
      <button className="primary" disabled={busy || !apiBaseUrl.trim()} onClick={() => void connect(true)}>{busy ? '正在连接…' : '使用极享OS登录状态连接'}</button>
      <p className="hint">请先在极享OS网页完成登录。插件只获得浏览器员工专用权限，不会读取或保存您的密码。</p>
    </section>
    {feedbackDialog}
  </main>;

  return <main className="shell">
    <header><span className="brand-mark">JX</span><div><h1>飞鸽客服副驾驶</h1><p>{auth.operator.name}·{workflowLabel}</p></div><button className="text-button" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? '正在退出…' : '退出'}</button></header>
    {feedbackDialog}

    <section className="card context-card">
      <div className="section-title"><h2>当前会话</h2><button className="secondary compact" disabled={busy || loggingOut} onClick={() => void refreshContext()}>刷新识别</button></div>
      {runtimeConfig && runtimeConfig.shops.length ? <div className="shop-binding-row"><span>绑定店铺</span>
        <select
          aria-label="绑定店铺"
          disabled={busy || loggingOut || completionFormLocked}
          value={shopBindingId}
          onChange={(event) => void selectShop(event.target.value)}
        >
          <option value="">请选择当前店铺</option>
          {runtimeConfig.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.displayName}</option>)}
        </select>
      </div> : null}
      {context ? <div className="facts">
        <div><span>客户</span><strong>{context.customerDisplayName || '未识别'}</strong></div>
        <div><span>订单</span><strong>{context.platformOrderNo || '未识别'}</strong></div>
        <div><span>订单状态</span><strong>{context.orderStatus || '未识别'}</strong></div>
        <div><span>平台商品</span><strong>{context.productName || '未识别'}</strong></div>
        <div><span>OS产品</span><strong>{productPreview?.status === 'MATCHED'
          ? productPreview.osProductName || '已匹配'
          : productPreview?.status === 'UNMATCHED'
            ? '未匹配（不影响入OS）'
            : productPreviewStatus === 'LOADING' ? '正在匹配…' : '待匹配预览'}</strong></div>
        <div data-field="platform-payment-amount"><span>平台实付金额</span><strong>{formatPlatformPaymentAmount(context.paymentAmount)}</strong></div>
        <div data-field="platform-payment-time"><span>平台付款时间</span><strong>{formatPlatformPaymentTime(context.paymentAt)}</strong></div>
      </div> : <p className="empty">请打开抖店飞鸽客服会话，然后点击“刷新识别”。</p>}
      {criticalDiagnostics.length ? <ul className="diagnostics">{criticalDiagnostics.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {runtimeConfig && !selectedShop
        ? <div className="alert warning">请先手工选择当前飞鸽账号对应的店铺，选择结果会保存在本机。</div> : null}
      {context && !isIntakeEligibleOrderStatus(context.orderStatus)
        ? <div className="alert warning">当前订单状态不支持入OS；已付款、已发货、已完成和已关闭订单可继续。</div> : null}
      {productPreview?.status === 'UNMATCHED'
        ? <div className="alert warning">商品未匹配OS标准产品，本次仍可入库，不会阻断客服操作。</div> : null}
    </section>

    <ScriptLibrarySection
      view={scriptView}
      match={recommendation}
      recommendationMessage={recommendationMessage}
      loadError={scriptLibraryError}
      onFill={(text) => void fillScript(text)}
      onManage={() => window.open(scriptLibrarySettingsUrl(apiBaseUrl), '_blank', 'noopener,noreferrer')}
      onRetry={() => {
        setError('');
        void loadScriptLibrary().catch((caught) => setError(caught instanceof Error ? caught.message : '话术加载失败'));
      }}
    />

    <section className="card">
      <div className="section-title"><h2>联系方式</h2><span className={`status ${form.phone || form.wechat ? 'ready' : ''}`}>{form.phone || form.wechat ? '已获取' : '待获取'}</span></div>
      <div className="source-switch" role="radiogroup" aria-label="联系方式来源"><button role="radio" aria-checked={form.source === 'CHAT'} disabled={completionFormLocked} className={form.source === 'CHAT' ? 'active' : ''} onClick={() => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'source', value: 'CHAT' })}>聊天中提供</button><button role="radio" aria-checked={form.source === 'OFF_PLATFORM'} disabled={completionFormLocked} className={form.source === 'OFF_PLATFORM' ? 'active' : ''} onClick={() => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'source', value: 'OFF_PLATFORM' })}>客服站外补录</button></div>
      <p className="source-description">{form.source === 'CHAT' ? '客户在当前飞鸽会话中发送了手机号或微信号。' : '客服通过电话、微信等站外方式取得联系方式后手工补录。'}</p>
      <div className="customer-summary"><span>客户昵称</span><strong>{form.name || '请先刷新识别当前客户'}</strong></div>
      <label>手机号<input disabled={completionFormLocked} value={form.phone} onChange={(event) => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'phone', value: event.target.value })} placeholder="手机号和微信至少填一项" /></label>
      <label>微信号<input disabled={completionFormLocked} value={form.wechat} onChange={(event) => dispatchPanel({ type: 'SET_FORM_FIELD', field: 'wechat', value: event.target.value })} placeholder="可选" /></label>
      <label className="confirm-row contact-confirm"><input disabled={completionFormLocked} type="checkbox" checked={contactConfirmed} onChange={(event) => dispatchPanel({ type: 'SET_CONTACT_CONFIRMED', value: event.target.checked })} /> 已核对：昵称、联系方式与当前订单属于同一客户</label>
    </section>

    {(completion || sync) && <section className="card result-card">
      <h2>处理结果</h2>
      {sync && <div className="facts"><div><span>线索编号</span><strong>{sync.lead.id}</strong></div><div><span>分配销售</span><strong>{sync.lead.assignedTo || '暂未分配'}</strong></div></div>}
      <div className="completion-steps">
        {([
          ['极享OS入库', completion?.osStatus || (sync ? 'SUCCEEDED' : 'NOT_ATTEMPTED')],
          ['订单备注', completion?.orderRemarkStatus || sync?.orderRemarkStatus || 'NOT_ATTEMPTED'],
          ['红色旗帜', completion?.greenFlagStatus || sync?.greenFlagStatus || 'NOT_ATTEMPTED'],
        ] as const).map(([label, status]) => {
          const presentation = completionStatus(status);
          return <div key={label}><span>{label}</span><strong className={`status ${presentation.className}`}>{presentation.label}</strong></div>;
        })}
      </div>
      {remarkText && <pre className="remark-preview">{remarkText}</pre>}
      {completion?.stage === 'PLATFORM_FAILED' && sync && <div className="result-actions">
        <button className="secondary" onClick={() => void navigator.clipboard.writeText(remarkText)}>复制备注</button>
        <button className="secondary" disabled={busy || loggingOut || !canIntake} onClick={() => void completeOrder()}>{busy ? '正在重试…' : '重试订单备注和红旗'}</button>
      </div>}
    </section>}
    <div className="sticky-primary-action">
      {!sync && !canIntake && <p className="action-reason">{intakeBlockedReason}</p>}
      <button data-action="complete-order" className="primary" disabled={busy || loggingOut || !canIntake || Boolean(sync)} onClick={() => void completeOrder()}>{busy ? '正在处理…' : sync ? '极享OS已入库' : '入OS并写入订单备注'}</button>
    </div>
  </main>;
}

export const sidepanelRoot = createRoot(document.getElementById('root')!);
sidepanelRoot.render(<React.StrictMode><App /></React.StrictMode>);
