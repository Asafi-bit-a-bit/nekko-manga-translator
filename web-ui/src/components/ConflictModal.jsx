// Conflict modal component
export const ConflictModal = ({
  conflicts,
  selectedConflictId,
  setSelectedConflictId,
  applyToAllConflicts,
  setApplyToAllConflicts,
  processConflicts,
  renderPreviewThumb,
}) => {
  const selectedConflict = conflicts.find((c) => c.id === selectedConflictId) || conflicts[0]

  const conflictButtonText = (base) => {
    if (!applyToAllConflicts) return base
    if (base === 'Заменить') return 'Заменить все'
    if (base === 'Пропустить') return 'Пропустить все'
    if (base === 'Оставить оба') return 'Оставить оба для всех'
    return base
  }

  if (conflicts.length === 0) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <div className="panel-title">Обнаружены дубликаты</div>
            <div className="muted small">
              Выберите, что делать с каждым файлом или примените действие ко всем.
            </div>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={applyToAllConflicts}
              onChange={(e) => setApplyToAllConflicts(e.target.checked)}
            />
            <span>ко всем</span>
          </label>
        </div>
        <div className="modal-body">
          <div className="conflict-list">
            {conflicts.map((conflict) => {
              const isActive = conflict.id === selectedConflictId
              return (
                <button
                  key={conflict.id}
                  className={`conflict-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedConflictId(conflict.id)}
                >
                  <div className="conflict-previews">
                    <div className="conflict-box">
                      {renderPreviewThumb(conflict.existing)}
                      <div className="muted small">до</div>
                    </div>
                    <div className="conflict-arrow">→</div>
                    <div className="conflict-box">
                      {renderPreviewThumb(conflict.incoming)}
                      <div className="muted small">после</div>
                    </div>
                  </div>
                  <div className="conflict-name">{conflict.existing.name}</div>
                </button>
              )
            })}
          </div>
          <div className="conflict-actions">
            <button
              className="btn primary"
              onClick={() => processConflicts('replace')}
              disabled={!selectedConflict}
            >
              {conflictButtonText('Заменить')}
            </button>
            <button
              className="btn secondary"
              onClick={() => processConflicts('skip')}
              disabled={!selectedConflict}
            >
              {conflictButtonText('Пропустить')}
            </button>
            <button
              className="btn ghost"
              onClick={() => processConflicts('keep-both')}
              disabled={!selectedConflict}
            >
              {conflictButtonText('Оставить оба')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

