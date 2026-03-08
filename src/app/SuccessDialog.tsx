interface SuccessDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export function SuccessDialog(props: SuccessDialogProps) {
  const { open, title, message, onClose } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading compact-gap">
          <div>
            <h3 id="success-dialog-title">{title}</h3>
            <p>这次操作已经正式完成。</p>
          </div>
        </div>

        <div className="dialog-summary-card">
          <strong>成功提醒</strong>
          <p>{message}</p>
        </div>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={onClose}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
