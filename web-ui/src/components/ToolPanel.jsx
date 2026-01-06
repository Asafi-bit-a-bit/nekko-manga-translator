// Tool panel component
import { Pencil, Move, Music } from 'lucide-react'

export const ToolPanel = ({
  activeTool,
  setActiveTool,
  drawingType,
  onToggleDrawingType,
  onToggleOrderMenu,
  isOrderMenuOpen,
}) => {
  const handleDrawClick = (e) => {
    if (activeTool === 'draw') {
      // If already active, toggle drawing type
      if (onToggleDrawingType) {
        e.preventDefault()
        e.stopPropagation()
        onToggleDrawingType()
      }
    } else {
      setActiveTool('draw')
    }
  }

  return (
    <div className="tool-panel-horizontal">
      <button
        type="button"
        className={`tool-button ${activeTool === 'draw' ? 'active' : ''}`}
        onClick={handleDrawClick}
        title={drawingType === 'sounds' ? 'Рисование звуков (нажмите для переключения на текст)' : 'Рисование текста (нажмите для переключения на звуки)'}
      >
        {drawingType === 'sounds' ? <Music size={20} /> : <Pencil size={20} />}
      </button>
      <button
        type="button"
        className={`tool-button ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => setActiveTool('select')}
        title="Выделение и перемещение (Selection+Move)"
      >
        <Move size={20} />
      </button>
      {onToggleOrderMenu && (
        <button
          type="button"
          className={`tool-button tool-button-number ${isOrderMenuOpen ? 'active' : ''}`}
          onClick={onToggleOrderMenu}
          title="Сортировка по номерам"
        >
          5
        </button>
      )}
    </div>
  )
}
