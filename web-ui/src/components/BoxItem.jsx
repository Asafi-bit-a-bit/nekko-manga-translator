// Box item component (for translation view)
import { CLASS_COLORS } from '../constants/detection.js'
import { getTypeLabel } from '../utils/boxes.js'

export const BoxItem = ({ box, index, originalText, translatedText, updateTranslation }) => {
  return (
    <div className="box-row">
      <div className="box-meta">
        <span>{index + 1}</span>
        <button
          type="button"
          className="legend type-toggle"
          title="Тип блока"
        >
          <span
            className="legend-swatch"
            style={{ backgroundColor: CLASS_COLORS[box.type] }}
          />
          <span className="type-label">{getTypeLabel(box.type)}</span>
        </button>
      </div>
      <div className="muted small" style={{ marginBottom: '2px', fontSize: '10px' }}>До:</div>
      <textarea
        rows={1}
        placeholder="OCR"
        value={originalText}
        readOnly
        style={{ marginBottom: '6px', backgroundColor: '#f5f5f5' }}
      />
      <div className="muted small" style={{ marginBottom: '2px', fontSize: '10px' }}>После:</div>
      <textarea
        rows={1}
        placeholder="Перевод"
        value={translatedText}
        onChange={(e) => updateTranslation(box.id, e.target.value)}
      />
    </div>
  )
}

