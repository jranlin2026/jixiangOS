import React, { useEffect, useMemo, useState } from 'react';
import type { ScriptLibraryView, ScriptMatch } from '../domain/scriptLibrary';

type Props = {
  view: ScriptLibraryView | null;
  match?: ScriptMatch | null;
  recommendationMessage?: string;
  onFill: (content: string) => void;
  onManage: () => void;
};

export function ScriptLibrarySection({ view, match, recommendationMessage, onFill, onManage }: Props) {
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

  return <section className="card">
    <div className="section-title"><h2>常用话术</h2>{view?.canManage && <button className="secondary compact" onClick={onManage}>管理话术</button>}</div>
    {!view ? <p className="empty">正在从极享OS加载话术…</p> : !groups.length ? <p className="empty">暂无已启用的话术分组。</p> : <>
      <div className="script-tabs">{groups.map((group) => <button key={group.id} className={group.id === active?.id ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}</div>
      <div className="script-grid">{scripts.map((script) => <button key={script.id} className={`script-button ${match?.script.id === script.id ? 'recommended' : ''}`} onClick={() => onFill(script.content)}>
        <span className="script-heading"><strong>{script.title}</strong>{match?.script.id === script.id && <em>系统推荐</em>}</span>
        <span>{script.content}</span>
        {match?.script.id === script.id && match.reasons.length > 0 && <small>{match.reasons.join(' · ')}</small>}
      </button>)}</div>
      {!scripts.length && <p className="empty">该分组暂无已启用的话术。</p>}
    </>}
    {recommendationMessage && <div className="recommendation-message">{recommendationMessage}</div>}
    <p className="hint">话术只填入输入框，需客服确认后发送。</p>
  </section>;
}
