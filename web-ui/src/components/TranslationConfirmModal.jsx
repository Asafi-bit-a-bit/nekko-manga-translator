// Translation confirmation modal component
export const TranslationConfirmModal = ({
  failedOcrBlocks,
  onConfirm,
  onCancel,
}) => {
  if (!failedOcrBlocks || failedOcrBlocks.length === 0) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <div className="panel-title">Обнаружены блоки с неудачным OCR</div>
            <div className="muted small">
              Вы действительно хотите продолжить перевод?
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="error-list">
            <div className="muted small" style={{ marginBottom: '8px' }}>
              Блоки с неудачным распознаванием текста:
            </div>
            <div className="error-items">
              {failedOcrBlocks.map((item, index) => (
                <div key={index} className="error-item">
                  <span className="error-label">Страница {item.pageIndex + 1}, блок {item.boxIndex + 1}</span>
                  {item.fileName && (
                    <span className="muted small"> ({item.fileName})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="conflict-actions">
            <button
              className="btn primary"
              onClick={onConfirm}
            >
              Да, продолжить
            </button>
            <button
              className="btn ghost"
              onClick={onCancel}
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

