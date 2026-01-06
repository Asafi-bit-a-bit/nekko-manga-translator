// Detection panel component
import { ProgressBar } from './ProgressBar.jsx'

export const DetectionPanel = ({
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
}) => {
  return (
    <div className="panel">
      <div className="panel-title">2. Детекция и модели</div>
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
          <span>One page mode</span>
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
    </div>
  )
}

