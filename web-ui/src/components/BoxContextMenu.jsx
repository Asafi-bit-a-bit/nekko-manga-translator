// Box context menu component
import { Trash2, ArrowRight, ArrowLeftRight } from 'lucide-react'
import { getTypeLabel, getNextType } from '../utils/boxes.js'
import { CLASS_COLORS } from '../constants/detection.js'

export const BoxContextMenu = ({
  position,
  selectedBoxIds,
  boxes,
  onDelete,
  onToggleType,
  onShowInList,
  onClose,
}) => {
  if (!position || selectedBoxIds.length === 0) return null

  const selectedBoxes = boxes.filter((b) => selectedBoxIds.includes(b.id))
  const firstBox = selectedBoxes[0]
  const nextType = firstBox ? getNextType(firstBox.type) : null
  const nextTypeLabel = nextType ? getTypeLabel(nextType) : ''
  
  // Get box color for styling buttons
  const boxColor = firstBox ? CLASS_COLORS[firstBox.type] : CLASS_COLORS.sounds
  const buttonStyle = {
    borderColor: boxColor,
    // Use unified translucent green background for all context buttons
    backgroundColor: 'rgba(18, 124, 86, 0.5)',
    opacity: 1,
  }

  return (
    <div
      className="context-menu"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <button
        type="button"
        className="context-menu-item"
        style={buttonStyle}
        onClick={() => {
          onDelete(selectedBoxIds)
        }}
        title="Удалить"
      >
        <Trash2 size={16} stroke="white" strokeWidth={2.5} style={{ filter: 'none', paintOrder: 'normal' }} />
      </button>
      {nextType && (
        <button
          type="button"
          className="context-menu-item"
          style={buttonStyle}
          onClick={() => {
            onToggleType(selectedBoxIds)
          }}
          title={`Сменить тип на ${nextTypeLabel}`}
        >
          <ArrowLeftRight size={16} stroke="white" strokeWidth={2.5} style={{ filter: 'none', paintOrder: 'normal' }} />
        </button>
      )}
      <button
        type="button"
        className="context-menu-item"
        style={buttonStyle}
        onClick={() => {
          onShowInList(selectedBoxIds)
        }}
        title="Показать в списке"
      >
        <ArrowRight size={16} stroke="white" strokeWidth={2.5} style={{ filter: 'none', paintOrder: 'normal' }} />
      </button>
    </div>
  )
}

