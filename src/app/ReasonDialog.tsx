import { useEffect, useRef, useState } from 'react';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  summary: string;
  reasonLabel: string;
  confirmText: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ReasonDialog(props: ReasonDialogProps) {
  const { open, title, summary, reasonLabel, confirmText, saving = false, onCancel, onConfirm } = props;
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setReason('');
    setError('');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('请先把原因写清楚');
      textareaRef.current?.focus();
      return;
    }

    await onConfirm(reason.trim());
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
        <div className="section-heading compact-gap">
          <div>
            <h3 id="reason-dialog-title">{title}</h3>
            <p>请先确认当前这笔记录，再写明原因。</p>
          </div>
        </div>

        <div className="dialog-summary-card">
          <strong>当前记录</strong>
          <p>{summary}</p>
        </div>

        <label>
          <span>{reasonLabel}</span>
          <textarea
            ref={textareaRef}
            value={reason}
            rows={4}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) {
                setError('');
              }
            }}
            placeholder="例如：刚才选错人了 / 金额写错了 / 这笔不该入账"
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleConfirm()} disabled={saving}>
            {saving ? '正在处理…' : confirmText}
          </button>
          <button type="button" className="ghost-button" onClick={onCancel}>
            先不改了
          </button>
        </div>
      </div>
    </div>
  );
}
