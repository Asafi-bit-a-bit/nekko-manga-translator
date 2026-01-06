// Image canvas/overlay hook
import { useState, useRef, useEffect } from 'react'
import { clamp01, makeBoxId } from '../utils/boxes.js'
import { reindexBoxes } from '../utils/boxes.js'

export const useImageCanvas = (overlayRef, boxes, setBoxes, selectedBoxIds, setSelectedBoxIds, setEditingBoxId, persistBoxes, activeTool) => {
  const [drawingBox, setDrawingBox] = useState(null)
  const [selectionBox, setSelectionBox] = useState(null)
  const [draggingBoxId, setDraggingBoxId] = useState(null)
  const [dropTargetBoxId, setDropTargetBoxId] = useState(null)
  const [drawingType, setDrawingType] = useState('sounds')
  
  const drawingRef = useRef(null)
  const resizingRef = useRef(null)
  const selectionRef = useRef(null)
  const movingRef = useRef(null)
  const boxesRef = useRef([])

  useEffect(() => {
    boxesRef.current = boxes
  }, [boxes])

  const getOverlayPoint = (clientX, clientY) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }

  // Check if two boxes intersect (for selection)
  const boxesIntersect = (box1, box2) => {
    return !(
      box1.x + box1.w < box2.x ||
      box2.x + box2.w < box1.x ||
      box1.y + box1.h < box2.y ||
      box2.y + box2.h < box1.y
    )
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (drawingRef.current && activeTool === 'draw') {
        const { x, y } = getOverlayPoint(e.clientX, e.clientY)
        const { startX, startY } = drawingRef.current
        const x1 = Math.min(startX, x)
        const y1 = Math.min(startY, y)
        const x2 = Math.max(startX, x)
        const y2 = Math.max(startY, y)
        setDrawingBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      } else if (selectionRef.current && activeTool === 'select') {
        const { x, y } = getOverlayPoint(e.clientX, e.clientY)
        const { startX, startY } = selectionRef.current
        const x1 = Math.min(startX, x)
        const y1 = Math.min(startY, y)
        const x2 = Math.max(startX, x)
        const y2 = Math.max(startY, y)
        setSelectionBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      } else if (resizingRef.current) {
        const { x, y } = getOverlayPoint(e.clientX, e.clientY)
        const { boxId, corner, startBox, startX, startY } = resizingRef.current
        const dx = x - startX
        const dy = y - startY
        setBoxes((prev) =>
          prev.map((b) => {
            if (b.id !== boxId) return b
            let next = { ...b }
            if (corner.includes('n')) {
              const newY = startBox.y + dy
              const newH = startBox.h - dy
              if (newH > 0.01) {
                next.y = clamp01(newY)
                next.h = clamp01(newH)
              }
            }
            if (corner.includes('s')) {
              const newH = startBox.h + dy
              if (newH > 0.01) {
                next.h = clamp01(newH)
              }
            }
            if (corner.includes('w')) {
              const newX = startBox.x + dx
              const newW = startBox.w - dx
              if (newW > 0.01) {
                next.x = clamp01(newX)
                next.w = clamp01(newW)
              }
            }
            if (corner.includes('e')) {
              const newW = startBox.w + dx
              if (newW > 0.01) {
                next.w = clamp01(newW)
              }
            }
            next.x = clamp01(next.x)
            next.y = clamp01(next.y)
            next.w = clamp01(Math.min(next.w, 1 - next.x))
            next.h = clamp01(Math.min(next.h, 1 - next.y))
            return next
          }),
        )
      } else if (movingRef.current) {
        const { x, y } = getOverlayPoint(e.clientX, e.clientY)
        const { startX, startY, selectedIds, startPositions } = movingRef.current
        const dx = x - startX
        const dy = y - startY
        
        setBoxes((prev) =>
          prev.map((b) => {
            if (!selectedIds.includes(b.id)) return b
            const startPos = startPositions[b.id]
            if (!startPos) return b
            return {
              ...b,
              x: clamp01(startPos.x + dx),
              y: clamp01(startPos.y + dy),
              w: clamp01(Math.min(b.w, 1 - (startPos.x + dx))),
              h: clamp01(Math.min(b.h, 1 - (startPos.y + dy))),
            }
          }),
        )
      }
    }

    const handleMouseUp = (e) => {
      if (drawingRef.current && activeTool === 'draw') {
        const { x, y } = getOverlayPoint(e.clientX, e.clientY)
        const { startX, startY } = drawingRef.current
        drawingRef.current = null
        setDrawingBox(null)
        const x1 = Math.min(startX, x)
        const y1 = Math.min(startY, y)
        const x2 = Math.max(startX, x)
        const y2 = Math.max(startY, y)
        const w = x2 - x1
        const h = y2 - y1
        if (w < 0.01 || h < 0.01) return
        const newBox = {
          id: makeBoxId(),
          type: drawingType,
          score: 1,
          x: x1,
          y: y1,
          w,
          h,
        }
        setBoxes((prev) => {
          const next = reindexBoxes([...prev, newBox])
          persistBoxes(next)
          return next
        })
        setSelectedBoxIds((prev) => [...prev, newBox.id])
        setEditingBoxId(newBox.id)
      }
      if (selectionRef.current && activeTool === 'select') {
        const { startX, startY } = selectionRef.current
        const { x, y } = getOverlayPoint(e.clientX, e.clientY)
        const x1 = Math.min(startX, x)
        const y1 = Math.min(startY, y)
        const x2 = Math.max(startX, x)
        const y2 = Math.max(startY, y)
        const selectionArea = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
        
        // Find boxes that intersect with selection area
        const selectedIds = boxesRef.current
          .filter((box) => boxesIntersect(box, selectionArea))
          .map((box) => box.id)
        
        if (selectedIds.length > 0) {
          setSelectedBoxIds(selectedIds)
          // If only one box was selected, also enter editing mode for it
          if (selectedIds.length === 1) {
            setEditingBoxId(selectedIds[0])
          }
        }
        
        selectionRef.current = null
        setSelectionBox(null)
      }
      if (resizingRef.current) {
        persistBoxes(boxesRef.current || boxes)
        resizingRef.current = null
      }
      if (movingRef.current) {
        persistBoxes(boxesRef.current || boxes)
        // Keep selection after moving
        movingRef.current = null
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [boxes, setBoxes, setSelectedBoxIds, setEditingBoxId, persistBoxes, activeTool, drawingType, selectedBoxIds])

  const startResize = (boxId, corner, e) => {
    e.preventDefault()
    e.stopPropagation()
    const box = boxes.find((b) => b.id === boxId)
    if (!box) return
    const { x, y } = getOverlayPoint(e.clientX, e.clientY)
    resizingRef.current = { boxId, corner, startBox: box, startX: x, startY: y }
    setEditingBoxId(boxId)
    setSelectedBoxIds((sel) => (sel.includes(boxId) ? sel : [...sel, boxId]))
  }

  const handleOverlayMouseDown = (e) => {
    if (e.button !== 0) return
    
    // Don't start drawing/selection if clicking on a box or its children
    if (e.target.classList.contains('bbox') || 
        e.target.closest('.bbox') ||
        e.target.classList.contains('bbox-number') ||
        e.target.closest('.bbox-handle')) {
      return
    }
    
    if (e.target !== overlayRef.current && !e.target.classList.contains('overlay')) return
    
    if (activeTool === 'draw') {
      setEditingBoxId(null)
      const { x, y } = getOverlayPoint(e.clientX, e.clientY)
      drawingRef.current = { startX: x, startY: y }
      setDrawingBox({ x, y, w: 0, h: 0 })
      // Keep current drawingType, don't reset to 'sounds'
    } else if (activeTool === 'select') {
      // Clear selection if clicking on empty area
      setSelectedBoxIds([])
      setEditingBoxId(null)
      const { x, y } = getOverlayPoint(e.clientX, e.clientY)
      selectionRef.current = { startX: x, startY: y }
      setSelectionBox({ x, y, w: 0, h: 0 })
    }
  }

  const handleBoxClick = (boxId, e) => {
    e.stopPropagation()
    const isSelected = selectedBoxIds.includes(boxId)
    
    if (e.shiftKey) {
      // Toggle selection
      setSelectedBoxIds((prev) =>
        prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]
      )
    } else if (e.ctrlKey || e.metaKey) {
      // Add/remove from selection
      setSelectedBoxIds((prev) =>
        prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]
      )
    } else if (isSelected && selectedBoxIds.length > 1) {
      // If clicking on a selected box, select only it
      setSelectedBoxIds([boxId])
      setEditingBoxId(boxId)
    } else if (!isSelected) {
      // Click on unselected box - clear others and select this one
      setSelectedBoxIds([boxId])
      setEditingBoxId(boxId)
    } else {
      // Single selection (already selected)
      setSelectedBoxIds([boxId])
      setEditingBoxId(boxId)
    }
  }

  const handleBoxMouseDown = (boxId, e) => {
    if (e.button !== 0) return
    if (activeTool !== 'select') return
    if (!selectedBoxIds.includes(boxId)) {
      handleBoxClick(boxId, e)
      return
    }
    
    // Start moving selected boxes
    e.preventDefault()
    e.stopPropagation()
    const { x, y } = getOverlayPoint(e.clientX, e.clientY)
    const startPositions = {}
    boxesRef.current.forEach((box) => {
      if (selectedBoxIds.includes(box.id)) {
        startPositions[box.id] = { x: box.x, y: box.y }
      }
    })
    movingRef.current = {
      startX: x,
      startY: y,
      selectedIds: [...selectedBoxIds],
      startPositions,
    }
  }

  const toggleDrawingType = () => {
    setDrawingType((prev) => (prev === 'sounds' ? 'text_bubble' : 'sounds'))
  }

  const startBoxDrag = (boxId, e) => {
    e.stopPropagation()
    setDraggingBoxId(boxId)
    setDropTargetBoxId(boxId)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      const row = e.currentTarget?.closest?.('.box-row')
      if (row) {
        const ghost = row.cloneNode(true)
        const rect = row.getBoundingClientRect()
        const handleRect = e.currentTarget.getBoundingClientRect()
        ghost.style.position = 'absolute'
        ghost.style.top = '-9999px'
        ghost.style.left = '-9999px'
        ghost.style.width = `${row.offsetWidth}px`
        ghost.style.pointerEvents = 'none'
        ghost.classList.add('drag-ghost')
        document.body.appendChild(ghost)
        const offsetX = Math.max(0, handleRect.left - rect.left + handleRect.width / 2)
        const offsetY = Math.max(0, handleRect.top - rect.top + handleRect.height / 2)
        e.dataTransfer.setDragImage(ghost, offsetX, offsetY)
        setTimeout(() => ghost.remove(), 0)
      }
    }
  }

  const endBoxDrag = () => {
    setDraggingBoxId(null)
    setDropTargetBoxId(null)
  }

  return {
    drawingBox,
    setDrawingBox,
    selectionBox,
    draggingBoxId,
    setDraggingBoxId,
    dropTargetBoxId,
    setDropTargetBoxId,
    startResize,
    handleOverlayMouseDown,
    handleBoxClick,
    handleBoxMouseDown,
    startBoxDrag,
    endBoxDrag,
    getOverlayPoint,
    toggleDrawingType,
    drawingType,
  }
}
