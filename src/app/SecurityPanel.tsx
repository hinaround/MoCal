import { useState, type FormEvent } from 'react';

interface SecurityPanelProps {
  enabled: boolean;
  locked: boolean;
  onSetPasscode: (passcode: string) => Promise<void>;
  onChangePasscode: (currentPasscode: string, nextPasscode: string) => Promise<void>;
  onDisablePasscode: (currentPasscode: string) => Promise<void>;
  onLockNow: () => void;
}

type Mode = 'closed' | 'set' | 'change' | 'disable';

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function SecurityPanel(props: SecurityPanelProps) {
  const { enabled, locked, onSetPasscode, onChangePasscode, onDisablePasscode, onLockNow } = props;
  const [mode, setMode] = useState<Mode>(enabled ? 'closed' : 'set');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [nextPasscode, setNextPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function resetForm(nextMode: Mode) {
    setMode(nextMode);
    setCurrentPasscode('');
    setNextPasscode('');
    setConfirmPasscode('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedCurrent = currentPasscode.trim();
    const trimmedNext = nextPasscode.trim();
    const trimmedConfirm = confirmPasscode.trim();

    if (mode === 'set' || mode === 'change') {
      if (!/^\d{4}$/.test(trimmedNext)) {
        setError('请设置 4 位数字管理口令');
        return;
      }

      if (trimmedNext !== trimmedConfirm) {
        setError('两次输入的管理口令不一样');
        return;
      }
    }

    if ((mode === 'change' || mode === 'disable') && !/^\d{4}$/.test(trimmedCurrent)) {
      setError('请先输入当前管理口令');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      if (mode === 'set') {
        await onSetPasscode(trimmedNext);
        resetForm('closed');
        return;
      }

      if (mode === 'change') {
        await onChangePasscode(trimmedCurrent, trimmedNext);
        resetForm('closed');
        return;
      }

      if (mode === 'disable') {
        await onDisablePasscode(trimmedCurrent);
        resetForm('set');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '处理失败，请再试一次');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel-card compact-top-gap">
      <div className="section-heading">
        <div>
          <h2>管理口令</h2>
          <p>不做复杂登录，只加一层 4 位数字保护，防止别人捡到平板后直接改账。</p>
        </div>
      </div>

      <article className="inline-card current-trip-card">
        <div className="book-status-row">
          <div>
            <strong>{enabled ? '已开启管理口令' : '还没开启管理口令'}</strong>
            <span>{enabled ? (locked ? '当前状态：已上锁' : '当前状态：已解锁') : '建议测试前先设置好，回到应用时就会自动上锁。'}</span>
          </div>
          {enabled ? <span className={`status-pill ${locked ? 'void' : 'posted'}`}>{locked ? '已上锁' : '已解锁'}</span> : null}
        </div>

        {enabled ? (
          <div className="action-row home-shortcuts">
            <button type="button" className="primary-button small-button" onClick={onLockNow}>
              立即上锁
            </button>
            <button type="button" className="ghost-button small-button" onClick={() => resetForm(mode === 'change' ? 'closed' : 'change')}>
              {mode === 'change' ? '先不改了' : '修改口令'}
            </button>
            <button type="button" className="ghost-button small-button danger-button" onClick={() => resetForm(mode === 'disable' ? 'closed' : 'disable')}>
              {mode === 'disable' ? '先不关闭' : '关闭口令'}
            </button>
          </div>
        ) : null}

        {!enabled || mode === 'change' || mode === 'disable' ? (
          <form className="stack-form compact-top-gap" onSubmit={handleSubmit}>
            {mode === 'change' || mode === 'disable' ? (
              <label>
                <span>当前管理口令</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={4}
                  value={currentPasscode}
                  onChange={(event) => setCurrentPasscode(normalizeDigits(event.target.value))}
                  placeholder="请输入当前 4 位数字"
                />
              </label>
            ) : null}

            {mode === 'set' || mode === 'change' ? (
              <>
                <label>
                  <span>{mode === 'set' ? '设置 4 位数字口令' : '新的 4 位数字口令'}</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    value={nextPasscode}
                    onChange={(event) => setNextPasscode(normalizeDigits(event.target.value))}
                    placeholder="例如：2580"
                  />
                </label>
                <label>
                  <span>再输入一次</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    value={confirmPasscode}
                    onChange={(event) => setConfirmPasscode(normalizeDigits(event.target.value))}
                    placeholder="再输一次确认"
                  />
                </label>
              </>
            ) : null}

            {mode === 'disable' ? <p className="storage-note">关闭后，打开应用就不再需要输入口令。</p> : null}
            {error ? <p className="field-error">{error}</p> : null}

            <div className="action-row">
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting
                  ? '正在保存…'
                  : mode === 'set'
                    ? '开启管理口令'
                    : mode === 'change'
                      ? '保存新口令'
                      : '确认关闭口令'}
              </button>
              {mode !== 'set' ? (
                <button type="button" className="ghost-button" onClick={() => resetForm('closed')} disabled={submitting}>
                  先取消
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </article>
    </section>
  );
}
