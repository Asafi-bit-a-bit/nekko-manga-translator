import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

// Components
import { Header } from './components/Header.jsx'
import { FileUpload } from './components/FileUpload.jsx'
import { DetectionAndOCRPanel } from './components/DetectionAndOCRPanel.jsx'
import { TranslationPanel } from './components/TranslationPanel.jsx'
import { ImageViewer } from './components/ImageViewer.jsx'
import { BoxList } from './components/BoxList.jsx'
import { BoxItem } from './components/BoxItem.jsx'
import { ConflictModal } from './components/ConflictModal.jsx'
import { TranslationConfirmModal } from './components/TranslationConfirmModal.jsx'
import { ConfirmRerunModal } from './components/ConfirmRerunModal.jsx'
import { ToolPanel } from './components/ToolPanel.jsx'
import { BoxContextMenu } from './components/BoxContextMenu.jsx'

// Hooks
import { useFileUpload } from './hooks/useFileUpload.js'
import { useDetection } from './hooks/useDetection.js'
import { useOCR } from './hooks/useOCR.js'
import { useTranslation } from './hooks/useTranslation.js'
import { useBoxes } from './hooks/useBoxes.js'
import { useImageCanvas } from './hooks/useImageCanvas.js'

// Constants
import { MODEL_OPTIONS } from './constants/models.js'
import { CLASS_COLORS } from './constants/detection.js'

// Utils
import { makeBoxId, orderBoxes, sortAndReindexBoxes } from './utils/boxes.js'
import { normalizeName, uniqueName } from './utils/files.js'
import { getSystemCpu } from './services/api.js'

function App() {
  const [activeView, setActiveView] = useState('ocr')
  const [fileItems, setFileItems] = useState([])
  const [activeFileId, setActiveFileId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [fileBoxes, setFileBoxes] = useState({})
  const [ocrByFile, setOcrByFile] = useState({})
  const [translationsByFile, setTranslationsByFile] = useState({})
  const [ocrResults, setOcrResults] = useState({})
  const [conflicts, setConflicts] = useState([])
  const [selectedConflictId, setSelectedConflictId] = useState(null)
  const [applyToAllConflicts, setApplyToAllConflicts] = useState(false)
  const [cpuName, setCpuName] = useState('…')
  const [visibleTooltipBoxId, setVisibleTooltipBoxId] = useState(null)
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  const [activeTool, setActiveTool] = useState('draw')
  const [selectedFileIds, setSelectedFileIds] = useState([])
  const [showOrderMenu, setShowOrderMenu] = useState(false)
  const [orderInput, setOrderInput] = useState('')
  const [orderError, setOrderError] = useState('')

  const imageRef = useRef(null)
  const overlayRef = useRef(null)
  const importJsonRef = useRef(null)
  const shiftSelectionStartIndex = useRef(null)

  // Boxes hook (needed for resetWork)
  const {
    boxes,
    setBoxes,
    selectedBoxIds,
    setSelectedBoxIds,
    editingBoxId,
    setEditingBoxId,
    isLoadingBoxes,
    persistBoxes,
    toggleBox,
    toggleBoxType,
    deleteBoxes,
    toggleBoxesType,
    handleBoxReorder,
    boxesRef,
  } = useBoxes(activeFileId, fileItems, fileBoxes, setFileBoxes, ocrByFile, setOcrResults)
  
  const boxListRef = useRef(null)
  const [contextMenuPosition, setContextMenuPosition] = useState(null)
  const [highlightedBoxIds, setHighlightedBoxIds] = useState([])
  const prevActiveViewRef = useRef(activeView)

  const orderedBoxes = useMemo(() => orderBoxes(boxes), [boxes])

  // Auto-open first page with OCR when switching to translation view (only on initial switch)
  useEffect(() => {
    // Only trigger when switching TO translating view, not when already in it
    if (activeView === 'translating' && prevActiveViewRef.current !== 'translating') {
      const nonArchiveFiles = fileItems.filter((f) => !f.isArchive)
      // Find first file with OCR results
      const firstFileWithOcr = nonArchiveFiles.find((file) => {
        const ocrResults = ocrByFile[file.id] || {}
        return Object.keys(ocrResults).length > 0
      })
      if (firstFileWithOcr && firstFileWithOcr.id !== activeFileId) {
        setActiveFileId(firstFileWithOcr.id)
        setSelectedFileIds([firstFileWithOcr.id])
      }
    }
    prevActiveViewRef.current = activeView
  }, [activeView, fileItems, ocrByFile, activeFileId])

  useEffect(() => {
    if (activeView !== 'ocr') {
      setShowOrderMenu(false)
      setOrderInput('')
      setOrderError('')
    }
  }, [activeView])

  useEffect(() => {
    setOrderInput('')
    setOrderError('')
    setShowOrderMenu(false)
  }, [activeFileId])

  // Show context menu near selected boxes
  useEffect(() => {
    if (selectedBoxIds.length > 0 && activeView === 'ocr' && overlayRef.current) {
      const firstSelectedBox = orderedBoxes.find((b) => selectedBoxIds.includes(b.id))
      if (firstSelectedBox) {
        const overlayRect = overlayRef.current.getBoundingClientRect()
        
        // Calculate box position relative to overlay (in percentage, then convert to pixels)
        const boxRightPercent = firstSelectedBox.x + firstSelectedBox.w
        const boxLeftPercent = firstSelectedBox.x
        const boxTopPercent = firstSelectedBox.y
        const boxBottomPercent = firstSelectedBox.y + firstSelectedBox.h
        
        // Convert to pixels relative to overlay
        const boxRight = boxRightPercent * overlayRect.width
        const boxLeft = boxLeftPercent * overlayRect.width
        const boxTop = boxTopPercent * overlayRect.height
        const boxBottom = boxBottomPercent * overlayRect.height
        
        const menuWidth = 32
        const menuHeight = 108 // 3 buttons * 36px (32px + 4px gap)
        const spaceOnRight = overlayRect.width - boxRight
        const spaceOnLeft = boxLeft
        
        // Position on right if there's space, otherwise on left (relative to overlay)
        let menuX
        if (spaceOnRight >= menuWidth + 10) {
          menuX = boxRight + 10
        } else if (spaceOnLeft >= menuWidth + 10) {
          menuX = boxLeft - menuWidth - 10
        } else {
          // Default to right if both sides are tight
          menuX = boxRight + 10
        }
        
        // Position at top edge of the box (relative to overlay)
        const menuY = boxTop
        
        setContextMenuPosition({ x: menuX, y: menuY })
      }
    } else if (selectedBoxIds.length === 0 && activeView === 'ocr') {
      setContextMenuPosition(null)
    }
  }, [selectedBoxIds, orderedBoxes, activeView])

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuPosition && !e.target.closest('.context-menu') && !e.target.closest('.context-menu-backdrop') && !e.target.closest('.bbox')) {
        // Don't close if clicking on a box
        if (!e.target.closest('.bbox-handle')) {
          setContextMenuPosition(null)
        }
      }
    }
    if (contextMenuPosition) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenuPosition])

  // Clear box selection on click outside boxes
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Don't clear if clicking on:
      // - A box or its children
      // - Box handles
      // - Context menu
      // - Input/textarea/button elements (for editing)
      // - Checkbox in box list (for selection)
      if (
        e.target.closest('.bbox') ||
        e.target.closest('.bbox-handle') ||
        e.target.closest('.context-menu') ||
        e.target.closest('input[type="checkbox"]') ||
        e.target.closest('textarea') ||
        e.target.closest('button') ||
        e.target.closest('select')
      ) {
        return
      }
      
      // Clear selection if clicking outside
      if (selectedBoxIds.length > 0 && activeView === 'ocr') {
        setSelectedBoxIds([])
        setEditingBoxId(null)
      }
    }
    
    if (activeView === 'ocr') {
      // Use mousedown for more immediate clearing (before focus changes)
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [selectedBoxIds, activeView, setSelectedBoxIds, setEditingBoxId])

  // Image canvas hook (needed for resetWork)
  const {
    drawingBox,
    setDrawingBox,
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
    selectionBox,
    toggleDrawingType,
    drawingType,
  } = useImageCanvas(overlayRef, boxes, setBoxes, selectedBoxIds, setSelectedBoxIds, setEditingBoxId, persistBoxes, activeTool)

  const resetWork = () => {
    setBoxes([])
        setSelectedBoxIds([])
    setOcrResults({})
        setEditingBoxId(null)
    setDrawingBox(null)
    setDropTargetBoxId(null)
    setDraggingBoxId(null)
  }

  const cleanupFile = (file) => {
    if (file?.url) URL.revokeObjectURL(file.url)
  }

  // File upload hook
  const { fileItemsRef, uploadPendingFiles, handleFileChange: handleFileChangeHook } = useFileUpload(
    setFileItems,
    setActiveFileId,
    setConflicts,
    setSelectedConflictId,
    setApplyToAllConflicts,
    resetWork,
    selectedConflictId
  )

  // Detection hook
  const {
    isDetecting,
    detectProgress,
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
    maxBoxes,
    runDetection: runDetectionHandler,
    showRerunModal: showDetectRerunModal,
    rerunPageRange: detectRerunPageRange,
    handleConfirmRerun: handleConfirmDetectRerun,
    handleCancelRerun: handleCancelDetectRerun,
  } = useDetection(fileItemsRef, activeFileId, setFileBoxes, setBoxes, setSelectedBoxIds, fileBoxes)

  // OCR hook
  const {
    isOcr,
    ocrProgress,
    ocrOnePage,
    setOcrOnePage,
    lang,
    setLang,
    selectedModel,
    setSelectedModel,
    runOCR,
    updateOcrForFile,
    showRerunModal: showOcrRerunModal,
    rerunPageRange: ocrRerunPageRange,
    handleConfirmRerun: handleConfirmOcrRerun,
    handleCancelRerun: handleCancelOcrRerun,
  } = useOCR(fileItemsRef, activeFileId, boxes, selectedBoxIds, fileBoxes, setOcrByFile, setOcrResults, ocrByFile)

  // Translation hook
  const {
    isTranslating,
    translateProgress,
    ollamaApiKey,
    setOllamaApiKey,
    targetLang,
    setTargetLang,
    ollamaModel,
    setOllamaModel,
    runTranslation,
    updateTranslationsForFile,
    showConfirmModal,
    failedOcrBlocks,
    handleConfirmTranslation,
    handleCancelTranslation,
    showRerunModal: showTranslateRerunModal,
    rerunPageRange: translateRerunPageRange,
    handleConfirmRerun: handleConfirmTranslateRerun,
    handleCancelRerun: handleCancelTranslateRerun,
  } = useTranslation(fileItems, fileBoxes, ocrByFile, setTranslationsByFile, translationsByFile)

  // Computed values

  const combinedText = useMemo(() => {
    const lines = []
    const nonArchiveFiles = fileItems.filter((f) => !f.isArchive)
    nonArchiveFiles.forEach((file, idx) => {
      const pageBoxes = orderBoxes(fileBoxes[file.id] || [])
      const texts = ocrByFile[file.id] || {}
      const pageLines = pageBoxes
        .map((b) => {
          const txt = (texts[b.id] || '').trim()
          if (!txt) return null
          const label = b.type === 'sounds' ? 'sound' : 'text'
          return `${label}: "${txt}"`
        })
        .filter(Boolean)
      if (!pageLines.length) return
      lines.push(`//page ${idx + 1}`)
      lines.push(...pageLines)
      lines.push('')
    })
    return lines.join('\n').trim()
  }, [fileItems, fileBoxes, ocrByFile])

  const availableModels = useMemo(() => {
    return MODEL_OPTIONS.filter((m) => (lang === 'ja' ? true : m.id !== 'manga-ocr'))
  }, [lang])

  const canOcr = boxes.length > 0
  const hasDetection = boxes.length > 0

  const activeImage = useMemo(
    () => fileItems.find((f) => f.id === activeFileId && !f.isArchive),
    [fileItems, activeFileId],
  )

  const nonArchiveFiles = useMemo(
    () => fileItems.filter((f) => !f.isArchive),
    [fileItems],
  )

  const currentFileIndex = useMemo(() => {
    if (!activeFileId) return -1
    return nonArchiveFiles.findIndex((f) => f.id === activeFileId)
  }, [activeFileId, nonArchiveFiles])

  const hasPreviousPage = currentFileIndex > 0
  const hasNextPage = currentFileIndex >= 0 && currentFileIndex < nonArchiveFiles.length - 1

  const goToPreviousPage = useCallback((shiftKey = false) => {
    if (hasPreviousPage) {
      const prevFile = nonArchiveFiles[currentFileIndex - 1]
      if (prevFile) {
        if (shiftKey) {
          // Start selection from current index if not started
          if (shiftSelectionStartIndex.current === null) {
            shiftSelectionStartIndex.current = currentFileIndex
          }
          // Select range from start to previous file
          const startIndex = shiftSelectionStartIndex.current
          const endIndex = currentFileIndex - 1
          const minIndex = Math.min(startIndex, endIndex)
          const maxIndex = Math.max(startIndex, endIndex)
          const rangeIds = nonArchiveFiles
            .slice(minIndex, maxIndex + 1)
            .map((f) => f.id)
          setSelectedFileIds(rangeIds)
          setActiveFileId(prevFile.id)
        } else {
          // Normal navigation: clear selection
          setActiveFileId(prevFile.id)
          setSelectedFileIds([])
          shiftSelectionStartIndex.current = null
        }
      }
    }
  }, [hasPreviousPage, currentFileIndex, nonArchiveFiles])

  const goToNextPage = useCallback((shiftKey = false) => {
    if (hasNextPage) {
      const nextFile = nonArchiveFiles[currentFileIndex + 1]
      if (nextFile) {
        if (shiftKey) {
          // Start selection from current index if not started
          if (shiftSelectionStartIndex.current === null) {
            shiftSelectionStartIndex.current = currentFileIndex
          }
          // Select range from start to next file
          const startIndex = shiftSelectionStartIndex.current
          const endIndex = currentFileIndex + 1
          const minIndex = Math.min(startIndex, endIndex)
          const maxIndex = Math.max(startIndex, endIndex)
          const rangeIds = nonArchiveFiles
            .slice(minIndex, maxIndex + 1)
            .map((f) => f.id)
          setSelectedFileIds(rangeIds)
          setActiveFileId(nextFile.id)
        } else {
          // Normal navigation: clear selection
          setActiveFileId(nextFile.id)
          setSelectedFileIds([])
          shiftSelectionStartIndex.current = null
        }
      }
    }
  }, [hasNextPage, currentFileIndex, nonArchiveFiles])

  const translationsResults = useMemo(() => {
    if (!activeFileId) return {}
    return translationsByFile[activeFileId] || {}
  }, [activeFileId, translationsByFile])

  const hasAnyTranslations = useMemo(() => {
    return Object.values(translationsByFile).some((page) => {
      if (!page) return false
      return Object.values(page).some((txt) => (txt || '').trim().length > 0)
    })
  }, [translationsByFile])

  // Sync fileItemsRef
  useEffect(() => {
    fileItemsRef.current = fileItems
  }, [fileItems])

  // Sync ocrResults with ocrByFile
  useEffect(() => {
    if (!activeFileId) return
    setOcrResults(ocrByFile[activeFileId] || {})
  }, [activeFileId, ocrByFile])

  // Auto-select first file after upload
  useEffect(() => {
    const nonArchiveFiles = fileItems.filter((f) => !f.isArchive)
    if (nonArchiveFiles.length > 0 && !activeFileId) {
      setActiveFileId(nonArchiveFiles[0].id)
    }
  }, [fileItems, activeFileId, setActiveFileId])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle arrow keys when not in input/textarea (unless it's readonly)
      const isTextInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
      if (isTextInput && !e.target.readOnly) {
        return
      }
      
      if (e.key === 'ArrowLeft' && hasPreviousPage) {
        e.preventDefault()
        goToPreviousPage(e.shiftKey)
      } else if (e.key === 'ArrowRight' && hasNextPage) {
        e.preventDefault()
        goToNextPage(e.shiftKey)
      } else if (!e.shiftKey) {
        // Clear selection start when shift is released
        shiftSelectionStartIndex.current = null
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    const handleKeyUp = (e) => {
      if (!e.shiftKey) {
        shiftSelectionStartIndex.current = null
      }
    }
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [hasPreviousPage, hasNextPage, goToPreviousPage, goToNextPage])

  // Fetch CPU name
  useEffect(() => {
    getSystemCpu()
      .then((data) => setCpuName(data.cpu || '…'))
      .catch(() => setCpuName('Unknown'))
  }, [])

  // Save API key to localStorage
  useEffect(() => {
    try {
      if (ollamaApiKey) {
        localStorage.setItem('ollama_api_key', ollamaApiKey)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [ollamaApiKey])

  // Update model selection when available models change
  useEffect(() => {
    const allowedIds = availableModels.map((m) => m.id)
    const fallback = allowedIds[0] || ''
    setSelectedModel((prev) => (allowedIds.includes(prev) ? prev : fallback))
  }, [availableModels])

  // Handlers
  const handleFileChange = async (e) => {
    await handleFileChangeHook(e)
  }

  const handleReorder = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    setFileItems((prev) => {
      const sourceIndex = prev.findIndex((f) => f.id === sourceId)
      const targetIndex = prev.findIndex((f) => f.id === targetId)
      if (sourceIndex === -1 || targetIndex === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  const removeFileById = (fileId) => {
    setFileItems((prev) => {
      const removedIndex = prev.findIndex((f) => f.id === fileId)
      if (removedIndex === -1) return prev
      const removed = prev[removedIndex]
      cleanupFile(removed)

      const next = [...prev.slice(0, removedIndex), ...prev.slice(removedIndex + 1)]

      if (removed.id === activeFileId) {
        const findNext = () => {
          for (let i = removedIndex; i < next.length; i += 1) {
            if (!next[i].isArchive) return next[i].id
          }
          for (let i = Math.min(removedIndex - 1, next.length - 1); i >= 0; i -= 1) {
            if (!next[i].isArchive) return next[i].id
          }
          return null
        }
        const nextActiveId = findNext()
        setActiveFileId(nextActiveId)
        resetWork()
      }
      setFileBoxes((prevBoxes) => {
        const next = { ...prevBoxes }
        delete next[fileId]
        return next
      })
      setOcrByFile((prevOcr) => {
        const next = { ...prevOcr }
        delete next[fileId]
        return next
      })
      setTranslationsByFile((prevTranslations) => {
        const next = { ...prevTranslations }
        delete next[fileId]
        return next
      })
      return next
    })
  }

  const handleDeleteSelected = () => {
    // Delete selected files if any are selected
    if (selectedFileIds.length > 0) {
      const idsToDelete = [...selectedFileIds]
      setSelectedFileIds([])
      
      // Clean up file URLs
      fileItems
        .filter((f) => idsToDelete.includes(f.id))
        .forEach((f) => cleanupFile(f))
      
      // Update active file if it was deleted - calculate before removal
      const wasActiveDeleted = idsToDelete.includes(activeFileId)
      let nextActiveId = activeFileId
      if (wasActiveDeleted) {
        const remainingFiles = fileItems.filter((f) => !idsToDelete.includes(f.id) && !f.isArchive)
        nextActiveId = remainingFiles.length > 0 ? remainingFiles[0].id : null
      }
      
      // Remove files from list
      setFileItems((prev) => prev.filter((f) => !idsToDelete.includes(f.id)))
      
      // Update active file if needed
      if (wasActiveDeleted) {
        setActiveFileId(nextActiveId)
        if (nextActiveId === null) {
          resetWork()
        }
      }
      
      // Clean up boxes, OCR, and translations for deleted files
      setFileBoxes((prevBoxes) => {
        const next = { ...prevBoxes }
        idsToDelete.forEach((fileId) => delete next[fileId])
        return next
      })
      setOcrByFile((prevOcr) => {
        const next = { ...prevOcr }
        idsToDelete.forEach((fileId) => delete next[fileId])
        return next
      })
      setTranslationsByFile((prevTranslations) => {
        const next = { ...prevTranslations }
        idsToDelete.forEach((fileId) => delete next[fileId])
        return next
      })
      
      return
    }
    // Fallback: if no files selected, delete boxes or current file
    if (!activeFileId) return
    const activeBoxIds = selectedBoxIds
    if (activeBoxIds.length) {
      setBoxes((prev) => {
        const next = prev.filter((b) => !activeBoxIds.includes(b.id))
        persistBoxes(next)
        return next
      })
      setSelectedBoxIds([])
      updateOcrForFile(activeFileId, (prev) => {
        const next = { ...prev }
        activeBoxIds.forEach((id) => delete next[id])
        return next
      })
    } else {
      removeFileById(activeFileId)
    }
  }

  const handleDeleteAll = () => {
    if (!fileItems.length) return
    const ok = window.confirm('Очистить все файлы и результаты?')
    if (!ok) return
    fileItems.forEach((f) => cleanupFile(f))
    setFileItems([])
    setActiveFileId(null)
    setFileBoxes({})
    setOcrByFile({})
    resetWork()
  }

  const processConflicts = (action) => {
    if (!conflicts.length) return
    const processList = applyToAllConflicts
      ? conflicts
      : conflicts.filter((c) => c.id === selectedConflictId)
    const remaining = applyToAllConflicts
      ? []
      : conflicts.filter((c) => c.id !== selectedConflictId)

    setFileItems((prev) => {
      let nextList = [...prev]
      const existingNames = new Set(nextList.map((f) => normalizeName(f.name)))

      processList.forEach((conflict) => {
        const { existing, incoming } = conflict
        const existingIndex = nextList.findIndex((f) => f.id === existing.id)
        if (existingIndex === -1) return

        if (action === 'replace') {
          cleanupFile(existing)
          const incomingFile =
            incoming.file && incoming.name !== incoming.file.name
              ? new File([incoming.file], incoming.name, { type: incoming.file.type })
              : incoming.file
          nextList.splice(existingIndex, 1, { ...incoming, file: incomingFile })
          existingNames.delete(normalizeName(existing.name))
          existingNames.add(normalizeName(incoming.name))
          if (activeFileId === existing.id) setActiveFileId(incoming.id)
        } else if (action === 'skip') {
          cleanupFile(incoming)
        } else if (action === 'keep-both') {
          const newName = uniqueName(incoming.name, existingNames)
          const incomingFile =
            incoming.file && newName !== incoming.file.name
              ? new File([incoming.file], newName, { type: incoming.file.type })
              : incoming.file
          const incomingWithName = { ...incoming, name: newName, file: incomingFile }
          existingNames.add(normalizeName(newName))
          nextList.splice(existingIndex + 1, 0, incomingWithName)
        }
      })

      if (!nextList.some((f) => f.id === activeFileId) && nextList.length) {
        const firstImage = nextList.find((f) => !f.isArchive) || nextList[0]
        setActiveFileId(firstImage?.id || null)
      }
      return nextList
    })

    setConflicts(remaining)
    if (remaining.length === 0) {
      setSelectedConflictId(null)
      setApplyToAllConflicts(false)
    } else {
      setSelectedConflictId(remaining[0].id)
    }
  }

  const updateText = (id, value) => {
    if (!activeFileId) return
    updateOcrForFile(activeFileId, (prev) => ({ ...prev, [id]: value }))
  }

  const updateTranslation = (id, value) => {
    if (!activeFileId) return
    updateTranslationsForFile(activeFileId, (prev) => ({ ...prev, [id]: value }))
  }

  const handleToggleShowAllTranslations = (value) => {
    setShowAllTranslations(value)
    if (!value) {
      setVisibleTooltipBoxId(null)
    }
  }

  const downloadTxt = () => {
    if (!combinedText.trim()) return
    const baseName = fileItems.find((f) => !f.isArchive)?.name || 'ocr-all'
    const blob = new Blob([combinedText], { type: 'text/plain' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${baseName}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const downloadJson = () => {
    const baseName = fileItems.find((f) => !f.isArchive)?.name || 'ocr-all'
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      files: fileItems
        .filter((f) => !f.isArchive)
        .map((f) => ({
          name: f.name,
          boxes: fileBoxes[f.id] || [],
          ocr: ocrByFile[f.id] || {},
          translations: translationsByFile[f.id] || {},
        })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${baseName}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const applyManualOrder = () => {
    if (!orderedBoxes.length) {
      setOrderError('Нет боксов для сортировки.')
      return
    }
    const tokens = orderInput
      .split(/[^0-9]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => Number.parseInt(v, 10))

    if (!tokens.length) {
      setOrderError('Введите номера боксов.')
      return
    }

    const max = orderedBoxes.length
    const seen = new Set()
    for (const n of tokens) {
      if (!Number.isFinite(n) || n < 1 || n > max) {
        setOrderError(`Номер должен быть от 1 до ${max}.`)
        return
      }
      if (seen.has(n)) {
        setOrderError('Номера не должны повторяться.')
        return
      }
      seen.add(n)
    }

    const desired = tokens.map((n) => orderedBoxes[n - 1])
    const remaining = orderedBoxes.filter((_, idx) => !seen.has(idx + 1))
    const next = [...desired, ...remaining].map((b, idx) => ({ ...b, order: idx }))
    setBoxes(next)
    persistBoxes(next)
    setOrderInput('')
    setOrderError('')
    setShowOrderMenu(false)
  }

  const handleImportJson = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        applyImportData(data)
      } catch (err) {
        console.error('[import] invalid json', err)
        alert('Не удалось прочитать JSON файл.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const applyImportData = (data) => {
    if (!data || !Array.isArray(data.files)) {
      alert('Неверный формат JSON.')
      return
    }
    const byName = new Map(
      data.files
        .filter((f) => f && f.name)
        .map((f) => [normalizeName(f.name), f]),
    )
    const nextFileBoxes = { ...fileBoxes }
    const nextOcrByFile = { ...ocrByFile }
    const nextTranslationsByFile = { ...translationsByFile }
    let applied = 0

    fileItems
      .filter((f) => !f.isArchive)
      .forEach((file) => {
        const saved = byName.get(normalizeName(file.name))
        if (!saved) return
        const rawBoxes = Array.isArray(saved.boxes) ? saved.boxes : []
        const sanitized = rawBoxes
          .filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y))
          .map((b) => ({
            id: b.id || makeBoxId(),
            x: b.x,
            y: b.y,
            w: Number.isFinite(b.w) ? b.w : 0,
            h: Number.isFinite(b.h) ? b.h : 0,
            type: b.type || 'text_bubble',
            order: Number.isFinite(b.order) ? b.order : undefined,
          }))
        const normalized = sortAndReindexBoxes(sanitized)
        nextFileBoxes[file.id] = normalized
        nextOcrByFile[file.id] = saved.ocr && typeof saved.ocr === 'object' ? saved.ocr : {}
        nextTranslationsByFile[file.id] =
          saved.translations && typeof saved.translations === 'object' ? saved.translations : {}
        applied += 1
      })

    if (!applied) {
      alert('В JSON нет страниц, совпадающих по имени файлов.')
      return
    }
    setFileBoxes(nextFileBoxes)
    setOcrByFile(nextOcrByFile)
    setTranslationsByFile(nextTranslationsByFile)
    if (activeFileId && nextFileBoxes[activeFileId]) {
      setBoxes(nextFileBoxes[activeFileId])
      setSelectedBoxIds([])
      setEditingBoxId(null)
    }
    alert(`Импортировано страниц: ${applied}`)
  }

  const renderPreviewThumb = (file) => {
    if (!file) return <div className="thumb-archive">—</div>
    if (file.isArchive || !file.url) {
      return <div className="thumb-archive">ZIP</div>
    }
    return <img src={file.url} alt={file.name} />
  }

  const handleImageLoad = () => {
    // reserved for natural size usage
  }

  return (
    <div className="app">
      <Header cpuName={cpuName} activeView={activeView} setActiveView={setActiveView} />

      {activeView === 'ocr' ? (
        <>
          <section className="controls">
            <FileUpload
              fileItems={fileItems}
              activeFileId={activeFileId}
              setActiveFileId={setActiveFileId}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              handleFileChange={handleFileChange}
              handleReorder={handleReorder}
              handleDeleteSelected={handleDeleteSelected}
              handleDeleteAll={handleDeleteAll}
              selectedFileIds={selectedFileIds}
              setSelectedFileIds={setSelectedFileIds}
            />

            <DetectionAndOCRPanel
              detectionThreshold={detectionThreshold}
              setDetectionThreshold={setDetectionThreshold}
              detectOnePage={detectOnePage}
              setDetectOnePage={setDetectOnePage}
              detectScope={detectScope}
              setDetectScope={setDetectScope}
              detectRangeStart={detectRangeStart}
              setDetectRangeStart={setDetectRangeStart}
              detectRangeEnd={detectRangeEnd}
              setDetectRangeEnd={setDetectRangeEnd}
              isDetecting={isDetecting}
              detectProgress={detectProgress}
              isLoadingBoxes={isLoadingBoxes}
              activeImage={activeImage}
              runDetection={() => runDetectionHandler(uploadPendingFiles)}
              hasDetection={hasDetection}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              lang={lang}
              setLang={setLang}
              availableModels={availableModels}
              ocrOnePage={ocrOnePage}
              setOcrOnePage={setOcrOnePage}
              isOcr={isOcr}
              ocrProgress={ocrProgress}
              canOcr={canOcr}
              runOcr={() => runOCR(uploadPendingFiles, availableModels)}
            />
      </section>

      <section className="workspace">
            <div className="viewer-wrapper">
              <div className="viewer-container">
              <ImageViewer
                activeImage={activeImage}
                boxes={orderedBoxes}
                selectedBoxIds={selectedBoxIds}
                editingBoxId={editingBoxId}
                drawingBox={drawingBox}
                selectionBox={selectionBox}
                overlayRef={overlayRef}
                imageRef={imageRef}
                handleOverlayMouseDown={handleOverlayMouseDown}
                handleBoxClick={handleBoxClick}
                handleBoxMouseDown={handleBoxMouseDown}
                startResize={startResize}
                setSelectedBoxIds={setSelectedBoxIds}
                setEditingBoxId={setEditingBoxId}
                hasPreviousPage={hasPreviousPage}
                hasNextPage={hasNextPage}
                goToPreviousPage={goToPreviousPage}
                goToNextPage={goToNextPage}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                toggleDrawingType={toggleDrawingType}
                drawingType={drawingType}
                showOrderMenu={showOrderMenu}
                orderInput={orderInput}
                orderError={orderError}
                onOrderInputChange={(value) => {
                  setOrderInput(value)
                  if (orderError) {
                    setOrderError('')
                  }
                }}
                onApplyOrder={applyManualOrder}
                onToggleOrderMenu={() => {
                  setShowOrderMenu((prev) => !prev)
                  setOrderError('')
                }}
                contextMenuPosition={contextMenuPosition}
                onDeleteBoxes={(ids) => {
                  deleteBoxes(ids)
                  setContextMenuPosition(null)
                }}
                onToggleBoxesType={(ids) => {
                  toggleBoxesType(ids)
                  setContextMenuPosition(null)
                }}
                onShowBoxesInList={(ids) => {
                  setHighlightedBoxIds(ids)
                  if (boxListRef.current?.highlightBoxes) {
                    boxListRef.current.highlightBoxes(ids)
                  }
                  setContextMenuPosition(null)
                }}
                onCloseContextMenu={() => setContextMenuPosition(null)}
                onContextMenu={(e) => {
                  const rect = overlayRef.current?.getBoundingClientRect()
                  if (rect) {
                    setContextMenuPosition({
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                }}
              />
              </div>
            </div>

            <BoxList
              ref={boxListRef}
              boxes={orderedBoxes}
              selectedBoxIds={selectedBoxIds}
              draggingBoxId={draggingBoxId}
              dropTargetBoxId={dropTargetBoxId}
              ocrResults={ocrResults}
              updateText={updateText}
              toggleBox={toggleBox}
              toggleBoxType={toggleBoxType}
              startBoxDrag={startBoxDrag}
              endBoxDrag={endBoxDrag}
              handleBoxReorder={handleBoxReorder}
              setDropTargetBoxId={setDropTargetBoxId}
              selectedModel={selectedModel}
              availableModels={availableModels}
              highlightedBoxIds={highlightedBoxIds}
            />
      </section>

      <section className="assembly">
        <div className="panel">
          <div className="panel-title">Сборка текста</div>
          <textarea
            className="combined"
            rows={10}
            placeholder="Текст боксов из всех страниц появится здесь"
            value={combinedText}
            readOnly
          />
          <div className="row">
            <button className="btn ghost" onClick={downloadTxt} disabled={!combinedText.trim()}>
              Сохранить txt
            </button>
            <button className="btn ghost" onClick={downloadJson} disabled={!fileItems.length}>
              Сохранить JSON
            </button>
            <button
              className="btn ghost"
              onClick={() => importJsonRef.current?.click()}
              disabled={!fileItems.length}
            >
              Загрузить JSON
            </button>
            <input
              ref={importJsonRef}
              type="file"
              accept="application/json"
              onChange={handleImportJson}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </section>
        </>
      ) : activeView === 'translating' ? (
        <>
          <section className="controls">
            <FileUpload
              fileItems={fileItems}
              activeFileId={activeFileId}
              setActiveFileId={setActiveFileId}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              handleFileChange={handleFileChange}
              handleReorder={handleReorder}
              handleDeleteSelected={handleDeleteSelected}
              handleDeleteAll={handleDeleteAll}
              selectedFileIds={selectedFileIds}
              setSelectedFileIds={setSelectedFileIds}
            />

            <TranslationPanel
              ollamaApiKey={ollamaApiKey}
              setOllamaApiKey={setOllamaApiKey}
              targetLang={targetLang}
              setTargetLang={setTargetLang}
              ollamaModel={ollamaModel}
              setOllamaModel={setOllamaModel}
              isTranslating={isTranslating}
              translateProgress={translateProgress}
              fileItems={fileItems}
              runTranslation={() => runTranslation(lang)}
              hasTranslations={hasAnyTranslations}
              showAllTranslations={showAllTranslations}
              setShowAllTranslations={handleToggleShowAllTranslations}
            />
          </section>

          <section className="workspace">
            <div className="viewer panel">
              <div className="panel-title">Предпросмотр</div>
              <div className="canvas">
                {activeImage?.url ? (
                  <>
                    <img
                      ref={imageRef}
                      src={activeImage.url}
                      alt={activeImage.name}
                      onLoad={handleImageLoad}
                    />
                    <div className="overlay" ref={overlayRef} onContextMenu={(e) => e.preventDefault()}>
                      {orderedBoxes.map((box, index) => {
                        const translatedText = translationsResults[box.id] || ''
                        const isTooltipVisible = translatedText && (showAllTranslations || visibleTooltipBoxId === box.id)
                        const style = {
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.w * 100}%`,
                          height: `${box.h * 100}%`,
                          borderColor: CLASS_COLORS[box.type],
                          backgroundColor: `${CLASS_COLORS[box.type]}22`,
                          opacity: 0.7,
                          pointerEvents: 'auto',
                          cursor: translatedText ? 'pointer' : 'default',
                        }
                        const isNearTop = box.y < 0.05
                        return (
                          <div
                            key={box.id}
                            className="bbox"
                            style={style}
                            onClick={() => {
                              if (translatedText && !showAllTranslations) {
                                setVisibleTooltipBoxId(isTooltipVisible ? null : box.id)
                              }
                            }}
                          >
                            <span
                              className="bbox-number"
                              style={{
                                position: 'absolute',
                                top: isNearTop ? '4px' : '-22px',
                                left: isNearTop ? '4px' : '0',
                                background: CLASS_COLORS[box.type],
                                color: 'white',
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontWeight: '700',
                                borderRadius: '4px',
                                lineHeight: '1.3',
                                zIndex: 10,
                                pointerEvents: 'none',
                              }}
                            >
                              {index + 1}
                            </span>
                            {isTooltipVisible && (
                              <div className="translation-tooltip">
                                <div className="translation-tooltip-content">{translatedText}</div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="placeholder">Загрузите страницу, чтобы увидеть превью</div>
                )}
              </div>
            </div>

            <div className="side panel">
              <div className="panel-title">Боксы и текст</div>
              <div className="box-list">
                {orderedBoxes.length === 0 && (
                  <div className="muted small">Боксы появятся после детекции на странице OCR.</div>
                )}
                {orderedBoxes.map((box, index) => {
                  const originalText = ocrResults[box.id] || ''
                  const translatedText = translationsResults[box.id] || ''
                  return (
                    <BoxItem
                      key={box.id}
                      box={box}
                      index={index}
                      originalText={originalText}
                      translatedText={translatedText}
                      updateTranslation={updateTranslation}
                    />
                  )
                })}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="workspace">
          <div className="panel">
            <div className="panel-title">Редактирование</div>
            <div className="muted small">Страница в разработке.</div>
          </div>
        </section>
      )}

      {conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          selectedConflictId={selectedConflictId}
          setSelectedConflictId={setSelectedConflictId}
          applyToAllConflicts={applyToAllConflicts}
          setApplyToAllConflicts={setApplyToAllConflicts}
          processConflicts={processConflicts}
          renderPreviewThumb={renderPreviewThumb}
        />
      )}

      {showConfirmModal && (
        <TranslationConfirmModal
          failedOcrBlocks={failedOcrBlocks}
          onConfirm={handleConfirmTranslation}
          onCancel={handleCancelTranslation}
        />
      )}
      {showDetectRerunModal && (
        <ConfirmRerunModal
          operation="detection"
          pageRange={detectRerunPageRange}
          onConfirm={handleConfirmDetectRerun}
          onCancel={handleCancelDetectRerun}
        />
      )}
      {showOcrRerunModal && (
        <ConfirmRerunModal
          operation="ocr"
          pageRange={ocrRerunPageRange}
          onConfirm={handleConfirmOcrRerun}
          onCancel={handleCancelOcrRerun}
        />
      )}
      {showTranslateRerunModal && (
        <ConfirmRerunModal
          operation="translation"
          pageRange={translateRerunPageRange}
          onConfirm={handleConfirmTranslateRerun}
          onCancel={handleCancelTranslateRerun}
        />
      )}
    </div>
  )
}

export default App
