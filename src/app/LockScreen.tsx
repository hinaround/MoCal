import { useEffect, useRef, useState } from 'react';

interface LockScreenProps {
  open: boolean;
  onUnlock: (passcode: string) => Promise<void>;
}

export function LockScreen(props: LockScreenProps) {
  const { open, onUnlock } = props;
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPasscode('');
    setError('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    if (!/^\d{4}$/.test(passcode.trim())) {
      setError('请输入 4 位数字管理口令');
      inputRef.current?.focus();
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await onUnlock(passcode.trim());
      setPasscode('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '口令不对，请再试一次');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop security-backdrop" role="presentation">
      <div className="modal-card security-card" role="dialog" aria-modal="true" aria-labelledby="lock-screen-title">
        <p className="eyebrow">管理口令</p>
        <h2 id="lock-screen-title">先输入口令，再继续管账</h2>
        <p className="lead">这是给你妈妈用的防误改保护。有人拿到平板，也不能直接新增、修改或作废账目。</p>

        <label>
          <span>4 位数字管理口令</span>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={passcode}
            maxLength={4}
            onChange={(event) => {
              setPasscode(event.target.value.replace(/\D/g, '').slice(0, 4));
              if (error) {
                setError('');
              }
            }}
            placeholder="请输入 4 位数字"
          />
        </label>

        {error ? <p className="field-error">{error}</p> : null}

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? '正在解锁…' : '解锁进入'}
          </button>
        </div>
      </div>
    </div>
  );
}
