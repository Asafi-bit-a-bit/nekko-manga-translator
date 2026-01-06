// Image viewer component
import { Fragment } from 'react'
import { ChevronLeft, ChevronRight, ArrowRight, Music, Type } from 'lucide-react'
import { CLASS_COLORS } from '../constants/detection.js'
import { BoxContextMenu } from './BoxContextMenu.jsx'

import { ToolPanel } from './ToolPanel.jsx'

export const ImageViewer = ({
  activeImage,
  boxes,
  selectedBoxIds,
  editingBoxId,
  drawingBox,
  selectionBox,
  overlayRef,
  imageRef,
  handleOverlayMouseDown,
  handleBoxClick,
  handleBoxMouseDown,
  startResize,
  setSelectedBoxIds,
  setEditingBoxId,
  hasPreviousPage,
  hasNextPage,
  goToPreviousPage,
  goToNextPage,
  activeTool,
  setActiveTool,
  toggleDrawingType,
  drawingType,
  onContextMenu,
  contextMenuPosition,
  onDeleteBoxes,
  onToggleBoxesType,
  onShowBoxesInList,
  onCloseContextMenu,
  showOrderMenu,
  orderInput,
  onOrderInputChange,
  onApplyOrder,
  orderError,
  onToggleOrderMenu,
}) => {
  return (
    <div className="viewer panel">
      <div className="panel-title">Предпросмотр</div>
      <ToolPanel
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        drawingType={drawingType}
        onToggleDrawingType={toggleDrawingType}
        onToggleOrderMenu={onToggleOrderMenu}
        isOrderMenuOpen={showOrderMenu}
      />
      {showOrderMenu && (
        <div className="order-menu">
          <div className="order-menu-title">Порядок боксов</div>
          <div className="order-menu-body">
            <input
              className="order-menu-input"
              type="text"
              placeholder="Например: 1 2 3 5 6 4"
              value={orderInput}
              onChange={(e) => onOrderInputChange(e.target.value)}
            />
            <button className="btn ghost" onClick={onApplyOrder}>
              Применить
            </button>
          </div>
          {orderError && <div className="order-menu-error">{orderError}</div>}
        </div>
      )}
      <div className="canvas">
        {activeImage?.url ? (
          <>
            <img
              ref={imageRef}
              src={activeImage.url}
              alt={activeImage.name}
            />
            {hasPreviousPage && (
              <button
                className="nav-arrow nav-arrow-left"
                onClick={(e) => goToPreviousPage(e.shiftKey)}
                title="Предыдущая страница"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {hasNextPage && (
              <button
                className="nav-arrow nav-arrow-right"
                onClick={(e) => goToNextPage(e.shiftKey)}
                title="Следующая страница"
              >
                <ChevronRight size={24} />
              </button>
            )}
            <div
              className="overlay"
              ref={overlayRef}
              data-tool={activeTool}
              onMouseDown={handleOverlayMouseDown}
              onContextMenu={(e) => e.preventDefault()}
              style={{ cursor: activeTool === 'draw' ? 'crosshair' : 'default' }}
            >
              {boxes.map((box, index) => {
                const isActive = selectedBoxIds.includes(box.id)
                const isEditing = editingBoxId === box.id
                const isNearTop = box.y < 0.05
                const bboxStyle = {
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  borderColor: CLASS_COLORS[box.type],
                  backgroundColor: `${CLASS_COLORS[box.type]}22`,
                  opacity: isActive ? 1 : 0.35,
                  pointerEvents: 'auto',
                  cursor: activeTool === 'select' && isActive ? 'move' : 'pointer',
                }
                const numberStyle = {
                  position: 'absolute',
                  top: isNearTop 
                    ? `calc(${box.y * 100}% + 2px)` 
                    : `calc(${box.y * 100}% - 22px - 2px)`,
                  left: `calc(${box.x * 100}% + 2px)`,
                  background: CLASS_COLORS[box.type],
                  color: 'white',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '4px',
                  lineHeight: '1.3',
                  zIndex: 10,
                  pointerEvents: 'none',
                  opacity: 1,
                }
                return (
                  <Fragment key={box.id}>
                    <div
                      className={`bbox ${isEditing ? 'editing' : ''}`}
                      style={bboxStyle}
                      onClick={(e) => handleBoxClick(box.id, e)}
                      onMouseDown={(e) => handleBoxMouseDown(box.id, e)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!selectedBoxIds.includes(box.id)) {
                          setSelectedBoxIds([box.id])
                        }
                        setEditingBoxId(box.id)
                        if (onContextMenu) {
                          onContextMenu(e)
                        }
                      }}
                    >
                      {isEditing && (
                        <>
                          {['nw', 'ne', 'sw', 'se'].map((corner) => (
                            <div
                              key={corner}
                              className={`bbox-handle handle-${corner}`}
                              onMouseDown={(e) => startResize(box.id, corner, e)}
                            />
                          ))}
                        </>
                      )}
                    </div>
                    <span
                      className="bbox-number"
                      style={numberStyle}
                    >
                      {index + 1}
                    </span>
                  </Fragment>
                )
              })}
              {drawingBox && (
                <div
                  className="bbox drawing"
                  style={{
                    left: `${drawingBox.x * 100}%`,
                    top: `${drawingBox.y * 100}%`,
                    width: `${drawingBox.w * 100}%`,
                    height: `${drawingBox.h * 100}%`,
                  }}
                />
              )}
              {selectionBox && (
                <div
                  className="selection-box"
                  style={{
                    left: `${selectionBox.x * 100}%`,
                    top: `${selectionBox.y * 100}%`,
                    width: `${selectionBox.w * 100}%`,
                    height: `${selectionBox.h * 100}%`,
                  }}
                />
              )}
              {contextMenuPosition && selectedBoxIds.length > 0 && (
                <BoxContextMenu
                  position={contextMenuPosition}
                  selectedBoxIds={selectedBoxIds}
                  boxes={boxes}
                  onDelete={onDeleteBoxes}
                  onToggleType={onToggleBoxesType}
                  onShowInList={onShowBoxesInList}
                  onClose={onCloseContextMenu}
                />
              )}
            </div>
          </>
        ) : (
          <div className="placeholder">Загрузите страницу, чтобы увидеть превью</div>
        )}
      </div>
    </div>
  )
}
