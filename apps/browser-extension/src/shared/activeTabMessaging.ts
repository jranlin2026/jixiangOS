import type { PageCommand, PageCommandResult } from './contracts';

type ChromeBridge = Pick<typeof chrome, 'tabs' | 'scripting'>;

function isSupportedFeigeUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['jinritemai.com', 'douyinec.com']
      .some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isMissingReceiver(error: unknown) {
  return /Receiving end does not exist|Could not establish connection/i
    .test(error instanceof Error ? error.message : String(error));
}

export async function activeTabCommand(
  message: PageCommand,
  chromeBridge: ChromeBridge = chrome,
): Promise<PageCommandResult> {
  const [tab] = await chromeBridge.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('未找到当前标签页');
  if (!isSupportedFeigeUrl(tab.url)) {
    throw new Error('请先打开抖店飞鸽客服会话，再点击“刷新识别”');
  }
  try {
    return await chromeBridge.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!isMissingReceiver(error)) throw error;
    try {
      await chromeBridge.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return await chromeBridge.tabs.sendMessage(tab.id, message);
    } catch {
      throw new Error('飞鸽页面读取程序尚未加载，请刷新飞鸽页面后重试');
    }
  }
}
