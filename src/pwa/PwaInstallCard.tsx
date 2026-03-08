import { useState } from 'react';
import { useInstallPrompt } from './useInstallPrompt';

export function PwaInstallCard() {
  const { installed, canPromptInstall, showIosHint, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [statusText, setStatusText] = useState('');

  if (installed || dismissed || (!canPromptInstall && !showIosHint)) {
    return null;
  }

  async function handleInstallClick() {
    const accepted = await promptInstall();
    setStatusText(accepted ? '已发起安装，装好后就能像应用一样从桌面打开。' : '你这次先取消了安装，稍后还可以再点。');
  }

  return (
    <section className="install-card">
      <div>
        <p className="eyebrow">安装更顺手</p>
        <h2>把它放到手机桌面</h2>
        <p className="install-copy">
          {canPromptInstall
            ? '装到桌面后，打开更快，也更像一个真正的记账小工具。'
            : '如果你用的是苹果手机或平板，请点浏览器里的“分享”，再点“添加到主屏幕”。'}
        </p>
        {statusText ? <p className="install-status">{statusText}</p> : null}
      </div>

      <div className="install-actions">
        {canPromptInstall ? (
          <button type="button" className="primary-button" onClick={handleInstallClick}>
            安装到桌面
          </button>
        ) : null}
        <button type="button" className="ghost-button" onClick={() => setDismissed(true)}>
          先不装
        </button>
      </div>
    </section>
  );
}
