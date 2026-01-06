// OCR panel component
import { MODEL_OPTIONS } from '../constants/models.js'
import { LANG_OPTIONS } from '../constants/languages.js'
import { DETECTION_CLASSES, ROUTABLE_CLASSES, CLASS_COLORS } from '../constants/detection.js'
import { ProgressBar } from './ProgressBar.jsx'

export const OCRPanel = ({
  hasDetection,
  mode,
  setMode,
  selectedModel,
  setSelectedModel,
  routing,
  setRouting,
  handleRoutingChange,
  lang,
  setLang,
  availableModels,
  ocrOnePage,
  setOcrOnePage,
  isOcr,
  ocrProgress,
  canOcr,
  runOcr,
}) => {
  return (
    <div className="panel">
      <div className={`mode-block ${hasDetection ? '' : 'is-disabled'}`}>
        <div className="mode-toggle">
          <button
            className={`btn ghost ${mode === 'simple' ? 'active' : ''}`}
            onClick={() => {
              setMode('simple')
              const allModel = selectedModel || availableModels[0]?.id
              setRouting({
                text_bubble: allModel,
                text_free: allModel,
              })
            }}
            disabled={!hasDetection}
          >
            Обычный
          </button>
          <button
            className={`btn ghost ${mode === 'custom' ? 'active' : ''}`}
            onClick={() => setMode('custom')}
            disabled={!hasDetection}
          >
            Custom
          </button>
        </div>
      </div>
      <div className="row">
        <div className={`input-group ${hasDetection ? '' : 'is-disabled'}`}>
          <label>Модели</label>
          <select
            value={selectedModel}
            onChange={(e) => {
              const value = e.target.value
              setSelectedModel(value)
              setRouting({
                text_bubble: value,
                text_free: value,
              })
            }}
            disabled={!hasDetection}
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label>Language</label>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {mode === 'custom' && (
        <div className={`routing-grid ${hasDetection ? '' : 'is-disabled'}`}>
          {DETECTION_CLASSES.filter((cls) => ROUTABLE_CLASSES.includes(cls.id)).map(
            (cls) => (
              <div className="routing-row" key={cls.id}>
                <div className="legend">
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: CLASS_COLORS[cls.id] }}
                  />
                  <span>{cls.label}</span>
                </div>
                <select
                  value={routing[cls.id]}
                  onChange={(e) => handleRoutingChange(cls.id, e.target.value)}
                  disabled={!hasDetection}
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ),
          )}
        </div>
      )}
      {!hasDetection && (
        <div className="muted small">Сначала запустите детектор, чтобы настроить модели и OCR.</div>
      )}
      <div className={`row ocr-row ${hasDetection ? '' : 'is-disabled'}`}>
        <button
          className="btn secondary"
          onClick={runOcr}
          disabled={!canOcr || isOcr || !hasDetection}
        >
          {isOcr ? 'OCR...' : 'Запустить OCR'}
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={ocrOnePage}
            onChange={(e) => setOcrOnePage(e.target.checked)}
            disabled={!hasDetection}
          />
          <span>One page mode</span>
        </label>
      </div>
      {isOcr && ocrProgress.total > 0 && (
        <ProgressBar current={ocrProgress.current} total={ocrProgress.total} label="областей" />
      )}
    </div>
  )
}

