import React, { useEffect } from 'react';

export type FeedbackDialogState = {
  tone: 'error' | 'success';
  title: string;
  message: string;
};

export function feedbackDialogContent(error: string, notice: string): FeedbackDialogState | null {
  if (error.trim()) return { tone: 'error', title: '操作未完成', message: error.trim() };
  if (notice.trim()) return { tone: 'success', title: '操作成功', message: notice.trim() };
  return null;
}

export function FeedbackDialog({
  error,
  notice,
  onClose,
}: {
  error: string;
  notice: string;
  onClose: () => void;
}) {
  const content = feedbackDialogContent(error, notice);

  useEffect(() => {
    if (!content) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [content, onClose]);

  if (!content) return null;
  const titleId = 'jx-feedback-dialog-title';
  const descriptionId = 'jx-feedback-dialog-description';
  return <div className="feedback-backdrop" role="presentation">
    <section
      className={`feedback-dialog ${content.tone}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <button className="feedback-close" type="button" aria-label="关闭提示" onClick={onClose}>×</button>
      <div className="feedback-icon" aria-hidden="true">{content.tone === 'error' ? '!' : '✓'}</div>
      <h2 id={titleId}>{content.title}</h2>
      <p id={descriptionId}>{content.message}</p>
      <button className="primary feedback-confirm" type="button" autoFocus onClick={onClose}>知道了</button>
    </section>
  </div>;
}
