// Header component
export const Header = ({ cpuName, activeView, setActiveView }) => {
  return (
    <header className="header">
      <div>
        <p className="eyebrow">Локальный OCR интерфейс · {cpuName}</p>
        <h1>Рабочая станция Manga OCR</h1>
      </div>
      <div className="header-actions">
        <button
          className={`btn ghost ${activeView === 'ocr' ? 'active' : ''}`}
          onClick={() => setActiveView('ocr')}
        >
          OCR
        </button>
        <button
          className={`btn ghost ${activeView === 'editing' ? 'active' : ''}`}
          onClick={() => setActiveView('editing')}
        >
          Редактирование
        </button>
        <button
          className={`btn ghost ${activeView === 'translating' ? 'active' : ''}`}
          onClick={() => setActiveView('translating')}
        >
          Перевод
        </button>
      </div>
    </header>
  )
}

