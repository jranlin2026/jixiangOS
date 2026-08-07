import React from 'react';
import type { ScriptGroup, ScriptLibrary, ScriptTemplate } from '../domain/scriptLibrary';

export function addGroup(library: ScriptLibrary, id: string): ScriptLibrary {
  const nextSort = Math.max(0, ...library.groups.map((group) => group.sortOrder)) + 10;
  return {
    ...library,
    groups: [...library.groups, { id, name: '新分组', enabled: true, sortOrder: nextSort, scripts: [] }],
  };
}

export function removeGroup(library: ScriptLibrary, groupId: string): ScriptLibrary {
  return { ...library, groups: library.groups.filter((group) => group.id !== groupId) };
}

export function addScript(library: ScriptLibrary, groupId: string, id: string): ScriptLibrary {
  return {
    ...library,
    groups: library.groups.map((group) => group.id === groupId ? {
      ...group,
      scripts: [...group.scripts, {
        id, title: '新话术', content: '请输入话术内容', enabled: true,
        sortOrder: Math.max(0, ...group.scripts.map((script) => script.sortOrder)) + 10,
        priority: 0,
        match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
      }],
    } : group),
  };
}

export function updateScript(
  library: ScriptLibrary,
  groupId: string,
  scriptId: string,
  patch: Partial<ScriptTemplate>,
): ScriptLibrary {
  return {
    ...library,
    groups: library.groups.map((group) => group.id === groupId ? {
      ...group,
      scripts: group.scripts.map((script) => script.id === scriptId ? { ...script, ...patch } : script),
    } : group),
  };
}

function updateGroup(library: ScriptLibrary, groupId: string, patch: Partial<ScriptGroup>): ScriptLibrary {
  return { ...library, groups: library.groups.map((group) => group.id === groupId ? { ...group, ...patch } : group) };
}

function removeScript(library: ScriptLibrary, groupId: string, scriptId: string): ScriptLibrary {
  return updateGroup(library, groupId, {
    scripts: library.groups.find((group) => group.id === groupId)?.scripts.filter((script) => script.id !== scriptId) || [],
  });
}

function list(value: string) {
  return [...new Set(value.split(/[\n，,]/).map((item) => item.trim()).filter(Boolean))];
}

function nextId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

type Props = {
  library: ScriptLibrary;
  saving: boolean;
  onChange: (library: ScriptLibrary) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function ScriptLibraryEditor({ library, saving, onChange, onSave, onCancel }: Props) {
  return <section className="card script-editor">
    <div className="section-title">
      <div><h2>管理话术</h2><p className="hint">公司统一配置 · 版本 {library.revision}</p></div>
      <button className="text-button" onClick={onCancel}>返回</button>
    </div>
    <div className="editor-actions">
      <button className="secondary compact" onClick={() => onChange(addGroup(library, nextId('group')))}>新增分组</button>
      <button className="primary compact" disabled={saving} onClick={onSave}>{saving ? '保存中…' : '保存全部'}</button>
    </div>
    {!library.groups.length && <p className="empty">暂无分组，点击“新增分组”开始配置。</p>}
    {library.groups.map((group) => <div className="editor-group" key={group.id}>
      <div className="editor-row group-row">
        <label>分组名称<input value={group.name} onChange={(event) => onChange(updateGroup(library, group.id, { name: event.target.value }))} /></label>
        <label>排序<input type="number" value={group.sortOrder} onChange={(event) => onChange(updateGroup(library, group.id, { sortOrder: Number(event.target.value) }))} /></label>
      </div>
      <div className="inline-controls">
        <label className="confirm-row"><input type="checkbox" checked={group.enabled} onChange={(event) => onChange(updateGroup(library, group.id, { enabled: event.target.checked }))} />启用分组</label>
        <button className="danger-link" onClick={() => onChange(removeGroup(library, group.id))}>删除分组</button>
      </div>
      {group.scripts.map((script) => <div className="editor-script" key={script.id}>
        <div className="section-title"><strong>{script.title || '未命名话术'}</strong><button className="danger-link" onClick={() => onChange(removeScript(library, group.id, script.id))}>删除</button></div>
        <label>话术标题<input value={script.title} onChange={(event) => onChange(updateScript(library, group.id, script.id, { title: event.target.value }))} /></label>
        <label>话术内容<textarea rows={4} value={script.content} onChange={(event) => onChange(updateScript(library, group.id, script.id, { content: event.target.value }))} /></label>
        <div className="editor-row triple">
          <label>排序<input type="number" value={script.sortOrder} onChange={(event) => onChange(updateScript(library, group.id, script.id, { sortOrder: Number(event.target.value) }))} /></label>
          <label>优先级<input type="number" value={script.priority} onChange={(event) => onChange(updateScript(library, group.id, script.id, { priority: Number(event.target.value) }))} /></label>
          <label>联系方式<select value={script.match.contactState} onChange={(event) => onChange(updateScript(library, group.id, script.id, { match: { ...script.match, contactState: event.target.value as ScriptTemplate['match']['contactState'] } }))}><option value="ANY">不限</option><option value="MISSING">未提供</option><option value="PRESENT">已提供</option></select></label>
        </div>
        <label>订单状态（逗号或换行）<textarea rows={2} value={script.match.orderStatuses.join('\n')} onChange={(event) => onChange(updateScript(library, group.id, script.id, { match: { ...script.match, orderStatuses: list(event.target.value) } }))} /></label>
        <label>商品关键词（逗号或换行）<textarea rows={2} value={script.match.productKeywords.join('\n')} onChange={(event) => onChange(updateScript(library, group.id, script.id, { match: { ...script.match, productKeywords: list(event.target.value) } }))} /></label>
        <label className="confirm-row"><input type="checkbox" checked={script.enabled} onChange={(event) => onChange(updateScript(library, group.id, script.id, { enabled: event.target.checked }))} />启用话术</label>
      </div>)}
      <button className="secondary compact add-script" onClick={() => onChange(addScript(library, group.id, nextId('script')))}>新增话术</button>
    </div>)}
  </section>;
}
