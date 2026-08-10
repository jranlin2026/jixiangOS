import React, { useEffect, useMemo, useState } from 'react';
import type { ScriptLibraryView } from '../domain/scriptLibrary';

type Props = {
  view: ScriptLibraryView | null;
  loadError?: string;
  refreshing?: boolean;
  onFill: (content: string) => void;
  onManage: () => void;
  onRefresh: () => void;
  onRetry: () => void;
};

export function ScriptLibrarySection({ view, loadError, refreshing = false, onFill, onManage, onRefresh, onRetry }: Props) {
  const groups = useMemo(() => (view?.library.groups || [])
    .filter((group) => group.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)), [view]);
  const [activeGroupId, setActiveGroupId] = useState('');
  useEffect(() => {
    if (!groups.some((group) => group.id === activeGroupId)) setActiveGroupId(groups[0]?.id || '');
  }, [activeGroupId, groups]);
  const active = groups.find((group) => group.id === activeGroupId) || groups[0];
  const scripts = (active?.scripts || []).filter((script) => script.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const recommended = [...scripts]
    .sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder)[0];
  const otherScripts = recommended ? scripts.filter((script) => script.id !== recommended.id) : scripts;

  return <section className="card">
    <div className="section-title"><div><h2>推荐话术</h2><p className="section-subtitle">根据当前订单和联系方式推荐</p></div>{view && <div className="script-actions"><button className="secondary compact script-refresh" disabled={refreshing} onClick={onRefresh}>{refreshing ? '刷新中…' : '刷新话术'}</button>{view.canManage && <button className="secondary compact" onClick={onManage}>话术设置</button>}</div>}</div>
    {!view && loadError ? <div className="script-load-error"><p>{loadError}</p><button className="secondary compact" onClick={onRetry}>重试加载</button></div>
      : !view ? <p className="empty">正在从极享OS加载话术…</p> : !groups.length ? <p className="empty">暂无已启用的话术分组。</p> : <>
      {recommended && <button className="script-button recommended primary-recommendation" onClick={() => onFill(recommended.content)}>
        <span className="script-heading"><strong>{active.name} · 推荐话术</strong><em>推荐</em></span>
        <span>{recommended.content}</span>
        <b className="fill-label">填入回复框</b>
      </button>}
      <div className="script-all">
        <div className="script-tabs">{groups.map((group) => <button key={group.id} className={group.id === active?.id ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}</div>
        <div className="script-grid">{otherScripts.map((script) => <button key={script.id} className="script-button" onClick={() => onFill(script.content)}>
          <span>{script.content}</span>
        </button>)}</div>
        {!scripts.length && <p className="empty">该分组暂无已启用的话术。</p>}
      </div>
    </>}
    <p className="hint">话术只填入输入框，需客服确认后发送。</p>
  </section>;
}
