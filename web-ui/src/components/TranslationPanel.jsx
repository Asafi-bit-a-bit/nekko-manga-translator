// Translation panel component
import { LANG_OPTIONS } from '../constants/languages.js'
import { OLLAMA_MODEL_OPTIONS } from '../constants/models.js'
import { ProgressBar } from './ProgressBar.jsx'

export const TranslationPanel = ({
  ollamaApiKey,
  setOllamaApiKey,
  targetLang,
  setTargetLang,
  ollamaModel,
  setOllamaModel,
  isTranslating,
  translateProgress,
  fileItems,
  runTranslation,
  hasTranslations,
  showAllTranslations,
  setShowAllTranslations,
}) => {
  return (
    <div className="panel">
      <div className="panel-title">Настройки перевода</div>
      <div className="row">
        <div className="input-group">
          <label>API ключ Ollama Cloud</label>
          <input
            type="password"
            placeholder="Введите API ключ"
            value={ollamaApiKey}
            onChange={(e) => setOllamaApiKey(e.target.value)}
          />
          <div className="muted small">Ключ сохраняется локально в браузере</div>
        </div>
      </div>
      <div className="row">
        <div className="input-group">
          <label>Язык перевода</label>
          <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label>Модель Ollama</label>
          <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
            {OLLAMA_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <button
          className="btn primary"
          onClick={runTranslation}
          disabled={!ollamaApiKey.trim() || isTranslating || !fileItems.length}
        >
          {isTranslating ? 'Перевод...' : 'Перевести все'}
        </button>
      </div>
      {isTranslating && translateProgress.total > 0 && (
        <ProgressBar current={translateProgress.current} total={translateProgress.total} label="переведено" />
      )}
      {!isTranslating && hasTranslations && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showAllTranslations}
            onChange={(e) => setShowAllTranslations(e.target.checked)}
          />
          <span>отображать/скрыть перевод</span>
        </label>
      )}
    </div>
  )
}
