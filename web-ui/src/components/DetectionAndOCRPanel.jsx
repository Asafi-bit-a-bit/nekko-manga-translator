// Combined Detection and OCR panel component
import { MODEL_OPTIONS } from '../constants/models.js'
import { LANG_OPTIONS } from '../constants/languages.js'
import { DETECTION_CLASSES, ROUTABLE_CLASSES, CLASS_COLORS } from '../constants/detection.js'
import { ProgressBar } from './ProgressBar.jsx'

export const DetectionAndOCRPanel = ({
  // Detection props
  detectionThreshold,
  setDetectionThreshold,
  detectOnePage,
  setDetectOnePage,
  detectScope,
  setDetectScope,
  detectRangeStart,
  setDetectRangeStart,
  detectRangeEnd,
  setDetectRangeEnd,
  isDetecting,
  detectProgress,
  isLoadingBoxes,
  activeImage,
  runDetection,
  // OCR props
  hasDetection,
  selectedModel,
  setSelectedModel,
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
      <div className="panel-title">2. Детекция и модели</div>
      
      {/* Detection section */}
      <div className="row">
        <div className="input-group">
          <label>Чувствительность пузырьков</label>
          <input
            type="range"
            min="0.1"
            max="0.95"
            step="0.01"
            value={detectionThreshold}
            onChange={(e) => setDetectionThreshold(Number(e.target.value))}
          />
          <span className="muted small">Текущая: {detectionThreshold.toFixed(2)}</span>
        </div>
      </div>
      <div className="row">
        <button
          className="btn primary"
          onClick={runDetection}
          disabled={!activeImage?.url || isDetecting}
        >
          {isDetecting ? 'Детект...' : 'Запустить детектор'}
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={detectOnePage}
            onChange={(e) => setDetectOnePage(e.target.checked)}
            disabled={!activeImage?.url}
          />
          <span>Режим одной страницы</span>
        </label>
        {isLoadingBoxes && <span className="muted small">Загрузка сохраненных боксов…</span>}
      </div>
      {isDetecting && detectProgress.total > 0 && (
        <ProgressBar current={detectProgress.current} total={detectProgress.total} label="страниц" />
      )}
      {!detectOnePage && (
        <div className="row">
          <div className="input-group">
            <label>Режим детекции</label>
            <select
              value={detectScope}
              onChange={(e) => setDetectScope(e.target.value)}
              disabled={!activeImage?.url}
            >
              <option value="all">для всех файлов</option>
              <option value="range">для файлов из диапазона</option>
            </select>
          </div>
        </div>
      )}
      {!detectOnePage && detectScope === 'range' && (
        <div className="row range-row">
          <input
            type="number"
            min="1"
            value={detectRangeStart}
            onChange={(e) => setDetectRangeStart(e.target.value)}
            placeholder="1"
            disabled={!activeImage?.url}
          />
          <span className="muted">-</span>
          <input
            type="number"
            min="1"
            value={detectRangeEnd}
            onChange={(e) => setDetectRangeEnd(e.target.value)}
            placeholder="10"
            disabled={!activeImage?.url}
          />
        </div>
      )}
      
      <div className="row">
        <div className={`input-group ${hasDetection ? '' : 'is-disabled'}`}>
          <label>Модели</label>
          <select
            value={selectedModel}
            onChange={(e) => {
              const value = e.target.value
              setSelectedModel(value)
            }}
            disabled={!hasDetection}
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {selectedModel === 'paddleocr-vl' && (
            <div className="muted small" style={{ color: '#ff6b6b', marginTop: '4px' }}>
              ⚠️ PaddleOCR очень требователен к ресурсам и может работать медленно на CPU
            </div>
          )}
        </div>
        <div className={`input-group ${hasDetection ? '' : 'is-disabled'}`}>
          <label>Язык</label>
          <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={!hasDetection}>
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
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
          <span>Режим одной страницы</span>
        </label>
      </div>
      {isOcr && ocrProgress.total > 0 && (
        <ProgressBar current={ocrProgress.current} total={ocrProgress.total} label="областей" />
      )}
    </div>
  )
}

