// Box list component
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { CLASS_COLORS } from '../constants/detection.js'
import { getTypeLabel } from '../utils/boxes.js'

export const BoxList = forwardRef(({
  boxes,
  selectedBoxIds,
  draggingBoxId,
  dropTargetBoxId,
  ocrResults,
  updateText,
  toggleBox,
  toggleBoxType,
  startBoxDrag,
  endBoxDrag,
  handleBoxReorder,
  setDropTargetBoxId,
  selectedModel,
  availableModels,
  highlightedBoxIds,
}, ref) => {
  const boxRefs = useRef({})
  const containerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    highlightBoxes: (ids) => {
      if (!ids || ids.length === 0) return
      const firstId = ids[0]
      const boxElement = boxRefs.current[firstId]
      if (boxElement && containerRef.current) {
        boxElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        boxElement.classList.add('highlighted')
        setTimeout(() => {
          boxElement.classList.remove('highlighted')
        }, 1000)
      }
    },
  }))

  useEffect(() => {
    if (highlightedBoxIds && highlightedBoxIds.length > 0) {
      highlightedBoxIds.forEach((id) => {
        const boxElement = boxRefs.current[id]
        if (boxElement) {
          boxElement.classList.add('highlighted')
          setTimeout(() => {
            boxElement.classList.remove('highlighted')
          }, 1000)
        }
      })
      const firstId = highlightedBoxIds[0]
      const boxElement = boxRefs.current[firstId]
      if (boxElement && containerRef.current) {
        boxElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [highlightedBoxIds])
  return (
    <div className="side panel">
      <div className="panel-title">Боксы и текст</div>
      <div 
        className="box-list" 
        ref={containerRef}
        onClick={(e) => {
          // Clear selection if clicking on empty area in box list
          if (e.target === e.currentTarget || e.target.closest('.box-list') === e.currentTarget) {
            // Only clear if not clicking on a box-row or its children
            if (!e.target.closest('.box-row') && !e.target.closest('input[type="checkbox"]')) {
              // This will be handled by the parent component's click handler
            }
          }
        }}
      >
        {boxes.length === 0 && (
          <div className="muted small">Боксы появятся после детекции.</div>
        )}
        {boxes.map((box, index) => (
          <div
            key={box.id}
            className="box-drop-zone"
            onDragOver={(e) => {
              e.preventDefault()
              if (draggingBoxId && draggingBoxId !== box.id) {
                setDropTargetBoxId(box.id)
              } else if (draggingBoxId === box.id) {
                setDropTargetBoxId(null)
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggingBoxId) handleBoxReorder(draggingBoxId, box.id)
              endBoxDrag()
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDropTargetBoxId(null)
            }}
          >
            {draggingBoxId &&
              dropTargetBoxId === box.id &&
              draggingBoxId !== box.id && (
              <div className="drop-indicator" />
            )}
            <div
              ref={(el) => (boxRefs.current[box.id] = el)}
              className={`box-row ${selectedBoxIds.includes(box.id) ? 'active' : ''} ${
                draggingBoxId === box.id ? 'dragging' : ''
              }`}
              onDragEnd={endBoxDrag}
            >
              <div className="box-meta">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selectedBoxIds.includes(box.id)}
                    onChange={() => toggleBox(box.id)}
                  />
                  <span>{index + 1}</span>
                </label>
                <button
                  type="button"
                  className="legend type-toggle"
                  onClick={() => toggleBoxType(box.id)}
                  title="Сменить тип"
                >
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: CLASS_COLORS[box.type] }}
                  />
                  <span className="type-label">{getTypeLabel(box.type)}</span>
                </button>
                <span className="pill">
                  точность {Number.isFinite(box.score) ? box.score.toFixed(2) : '—'}
                </span>
                <span className="pill muted">
                  → {selectedModel || availableModels[0]?.id}
                </span>
                <div
                  className="drag-handle"
                  draggable
                  onDragStart={(e) => startBoxDrag(box.id, e)}
                  onDragEnd={endBoxDrag}
                  title="Перетащить"
                >
                  <span className="drag-grip">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
              <textarea
                rows={2}
                placeholder={ocrResults[box.id] === '' ? 'Не удалось распознать текст' : 'Результат OCR'}
                value={ocrResults[box.id] || ''}
                onChange={(e) => updateText(box.id, e.target.value)}
              />
            </div>
          </div>
        ))}
        {draggingBoxId && dropTargetBoxId === '__END__' && <div className="drop-indicator" />}
        {draggingBoxId && boxes.length > 0 && (
          <div
            className="drop-zone-end"
            onDragOver={(e) => {
              e.preventDefault()
              if (draggingBoxId) setDropTargetBoxId('__END__')
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggingBoxId) handleBoxReorder(draggingBoxId, '__END__')
              endBoxDrag()
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDropTargetBoxId(null)
            }}
          />
        )}
      </div>
    </div>
  )
})
