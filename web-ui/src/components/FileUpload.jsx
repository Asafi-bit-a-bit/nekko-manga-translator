// File upload component
import { useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'

export const FileUpload = ({ 
  fileItems, 
  activeFileId, 
  setActiveFileId, 
  draggingId, 
  setDraggingId, 
  handleFileChange, 
  handleReorder, 
  handleDeleteSelected, 
  handleDeleteAll,
  selectedFileIds,
  setSelectedFileIds,
}) => {
  const fileInputRef = useRef(null)
  const thumbStripRef = useRef(null)
  const hasFiles = fileItems.length > 0

  // Auto-scroll to active file in thumb-strip
  const scrollTimeoutRef = useRef(null)
  const lastActiveIdRef = useRef(null)
  
  useEffect(() => {
    if (!activeFileId || !thumbStripRef.current) return
    
    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    lastActiveIdRef.current = activeFileId
    
    // Use instant scroll for immediate response, especially during rapid navigation
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      const activeThumb = thumbStripRef.current?.querySelector(`[data-file-id="${activeFileId}"]`)
      if (activeThumb && thumbStripRef.current) {
        // Manual horizontal scroll calculation to avoid page scroll
        const stripRect = thumbStripRef.current.getBoundingClientRect()
        const thumbRect = activeThumb.getBoundingClientRect()
        const stripLeft = thumbStripRef.current.scrollLeft
        const stripWidth = thumbStripRef.current.clientWidth
        const thumbLeft = thumbRect.left - stripRect.left + stripLeft
        const thumbWidth = thumbRect.width
        const thumbCenter = thumbLeft + thumbWidth / 2
        const stripCenter = stripLeft + stripWidth / 2
        
        // Only scroll if thumb is not fully visible
        const scrollOffset = thumbCenter - stripCenter
        if (Math.abs(scrollOffset) > 5) {
          thumbStripRef.current.scrollLeft = stripLeft + scrollOffset
        }
      }
    })
    
    return () => {
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current)
      }
    }
  }, [activeFileId])

  const handleAddFilesClick = () => {
    fileInputRef.current?.click()
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const event = {
        target: {
          files: e.dataTransfer.files,
        },
      }
      handleFileChange(event)
    }
  }

  useEffect(() => {
    const el = thumbStripRef.current
    if (!el) return
    const handleWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const { deltaX, deltaY } = e
      if (deltaX) {
        el.scrollLeft += deltaX
        return
      }
      if (deltaY !== 0) {
        el.scrollLeft += deltaY
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel, { passive: false })
    }
  }, [])

  // Prevent page scroll when scrolling the panel
  const handlePanelWheel = (e) => {
    const panel = e.currentTarget
    // Prevent page scroll when mouse is over the panel
    const panelRect = panel.getBoundingClientRect()
    const mouseY = e.clientY
    const mouseX = e.clientX
    
    // Check if mouse is within panel bounds
    if (
      mouseY >= panelRect.top &&
      mouseY <= panelRect.bottom &&
      mouseX >= panelRect.left &&
      mouseX <= panelRect.right
    ) {
      // Check if we're scrolling vertically and panel has vertical scroll
      const hasVerticalScroll = panel.scrollHeight > panel.clientHeight
      const isVerticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX)
      
      if (isVerticalScroll) {
        // Allow panel to scroll vertically, prevent page scroll
        const { scrollTop, scrollHeight, clientHeight } = panel
        const canScrollUp = scrollTop > 0
        const canScrollDown = scrollTop < scrollHeight - clientHeight
        
        // If panel can scroll in the direction we're scrolling, prevent page scroll
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          e.preventDefault()
          panel.scrollTop += e.deltaY
        } else if (hasVerticalScroll) {
          // Even if we can't scroll more, prevent page scroll when over panel
          e.preventDefault()
        }
      }
    }
  }

  // Handle file click with proper selection logic
  const handleFileClick = (e, file, index) => {
    if (e.shiftKey && activeFileId) {
      // Shift+Click: select range from active file to clicked file
      e.preventDefault()
      const activeIndex = fileItems.findIndex((f) => f.id === activeFileId)
      if (activeIndex !== -1) {
        const startIndex = Math.min(activeIndex, index)
        const endIndex = Math.max(activeIndex, index)
        const rangeIds = fileItems
          .slice(startIndex, endIndex + 1)
          .map((f) => f.id)
        setSelectedFileIds((prev) => {
          const newSelection = new Set(prev)
          rangeIds.forEach((id) => newSelection.add(id))
          return Array.from(newSelection)
        })
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click (Cmd+Click on Mac): toggle selection of clicked file
      e.preventDefault()
      setSelectedFileIds((prev) => {
        if (prev.includes(file.id)) {
          return prev.filter((id) => id !== file.id)
        } else {
          return [...prev, file.id]
        }
      })
      // Also set as active file
      setActiveFileId(file.id)
    } else {
      // Simple click: navigate and clear selection
      setActiveFileId(file.id)
      setSelectedFileIds([])
    }
  }

  return (
    <div className="panel" onWheel={handlePanelWheel}>
      <div className="panel-title">1. Файлы</div>
      <label className={`file-drop ${hasFiles ? 'file-drop-hidden' : ''}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.zip,.rar,.7z"
          multiple
          onChange={handleFileChange}
        />
        <span>Перетащите или выберите файлы / архивы</span>
      </label>
      <div 
        ref={thumbStripRef}
        className="thumb-strip"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {fileItems.length === 0 && (
          <div className="muted small">Нет загруженных файлов.</div>
        )}
        {fileItems.map((file, index) => (
          <button
            key={file.id}
            data-file-id={file.id}
            className={`thumb ${activeFileId === file.id ? 'active' : ''} ${selectedFileIds.includes(file.id) ? 'selected' : ''}`}
            onClick={(e) => handleFileClick(e, file, index)}
            draggable
            onDragStart={() => setDraggingId(file.id)}
            onDragOver={(e) => {
              e.preventDefault()
              if (draggingId && draggingId !== file.id) handleReorder(draggingId, file.id)
            }}
            onDragEnd={() => setDraggingId(null)}
          >
            <div className="thumb-preview">
              {file.isArchive ? (
                <div className="thumb-archive">ZIP</div>
              ) : file.url ? (
                <img src={file.url} alt={file.name} />
              ) : (
                <div className="thumb-archive">FILE</div>
              )}
            </div>
            <div className="thumb-name" title={file.name}>
              <span className="page-badge">{index + 1}</span>
              <span className="thumb-name-text">{file.name}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn ghost" onClick={handleDeleteSelected} disabled={selectedFileIds.length === 0}>
          Удалить выбранное
        </button>
        <button className="btn ghost" onClick={handleDeleteAll} disabled={!fileItems.length}>
          Удалить всё
        </button>
        {hasFiles && (
          <button 
            className="btn ghost"
            onClick={handleAddFilesClick}
            title="Добавить файлы"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>Добавить файлы</span>
          </button>
        )}
      </div>
    </div>
  )
}
