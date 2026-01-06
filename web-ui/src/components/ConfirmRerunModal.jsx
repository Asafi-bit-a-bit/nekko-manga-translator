// Confirm rerun modal component
export const ConfirmRerunModal = ({
  operation,
  pageRange,
  onConfirm,
  onCancel,
}) => {
  if (!operation) return null

  const operationNames = {
    detection: 'Детекцию',
    ocr: 'OCR',
    translation: 'Перевод',
  }

  const operationName = operationNames[operation] || operation

  const getPageText = () => {
    if (pageRange.length === 1) {
      return `страницы ${pageRange[0]}`
    } else if (pageRange.length > 1) {
      const sorted = [...pageRange].sort((a, b) => a - b)
      if (sorted.length === 2) {
        return `страниц ${sorted[0]}-${sorted[1]}`
      } else {
        return `страниц ${sorted[0]}-${sorted[sorted.length - 1]}`
      }
    }
    return 'страниц'
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <div className="panel-title">Повторный запуск</div>
            <div className="muted small">
              Провести {operationName} повторно для {getPageText()}?
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="conflict-actions">
            <button
              className="btn primary"
              onClick={onConfirm}
            >
              Да, выполнить повторно
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

