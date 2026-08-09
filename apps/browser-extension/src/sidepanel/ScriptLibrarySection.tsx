import React, { useEffect, useMemo, useState } from 'react';
import type { ScriptLibraryView, ScriptMatch } from '../domain/scriptLibrary';

type Props = {
  view: ScriptLibraryView | null;
  match?: ScriptMatch | null;
  recommendationMessage?: string;
  loadError?: string;
  onFill: (content: string) => void;
  onManage: () => void;
  onRetry: () => void;
};

export function ScriptLibrarySection({ view, match, recommendationMessage, loadError, onFill, onManage, onRetry }: Props) {
  const groups = useMemo(() => (view?.library.groups || [])
    .filter((group) => group.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)), [view]);
  const [activeGroupId, setActiveGroupId] = useState('');
  useEffect(() => {
    if (!groups.some((group) => group.id === activeGroupId)) setActiveGroupId(groups[0]?.id || '');
  }, [activeGroupId, groups]);
  useEffect(() => {
    if (match?.group.id && groups.some((group) => group.id === match.group.id)) setActiveGroupId(match.group.id);
  }, [groups, match?.group.id]);
  const active = groups.find((group) => group.id === activeGroupId) || groups[0];
  const scripts = (active?.scripts || []).filter((script) => script.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const [showAll, setShowAll] = useState(false);
  const recommended = match?.script || groups.flatMap((group) => group.scripts)
    .filter((script) => script.enabled)
    .sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder)[0];

  return <section className="card">
    <div className="section-title"><div><h2>推荐话术</h2><p className="section-subtitle">根据当前订单和联系方式推荐</p></div>{view?.canManage && <button className="secondary compact" onClick={onManage}>话术设置</button>}</div>
    {!view && loadError ? <div className="script-load-error"><p>{loadError}</p><button className="secondary compact" onClick={onRetry}>重试加载</button></div>
      : !view ? <p className="empty">正在从极享OS加载话术…</p> : !groups.length ? <p className="empty">暂无已启用的话术分组。</p> : <>
      {recommended && <button className="script-button recommended primary-recommendation" onClick={() => onFill(recommended.content)}>
        <span className="script-heading"><strong>{recommended.title}</strong><em>{match ? '系统推荐' : '常用'}</em></span>
        <span>{recommended.content}</span>
        {match?.reasons.length ? <small>{match.reasons.join(' · ')}</small> : null}
        <b className="fill-label">填入回复框</b>
      </button>}
      <button className="script-expand" onClick={() => setShowAll((current) => !current)}>{showAll ? '收起全部话术' : '查看全部话术'}</button>
      {showAll && <div className="script-all">
        <div className="script-tabs">{groups.map((group) => <button key={group.id} className={group.id === active?.id ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}</div>
        <div className="script-grid">{scripts.map((script) => <button key={script.id} className={`script-button ${match?.script.id === script.id ? 'recommended' : ''}`} onClick={() => onFill(script.content)}>
          <span className="script-heading"><strong>{script.title}</strong>{match?.script.id === script.id && <em>系统推荐</em>}</span>
          <span>{script.content}</span>
        </button>)}</div>
        {!scripts.length && <p className="empty">该分组暂无已启用的话术。</p>}
      </div>}
    </>}
    {recommendationMessage && <div className="recommendation-message">{recommendationMessage}</div>}
    <p className="hint">话术只填入输入框，需客服确认后发送。</p>
  </section>;
}
