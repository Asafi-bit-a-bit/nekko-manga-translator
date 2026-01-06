// Boxes management hook
import { useState, useEffect, useRef } from 'react'
import { getCachedBoxes, setCachedBoxes } from '../services/api.js'
import { sortAndReindexBoxes, reindexBoxes, orderBoxes, getNextType } from '../utils/boxes.js'
import { logStep } from '../utils/api.js'

export const useBoxes = (activeFileId, fileItems, fileBoxes, setFileBoxes, ocrByFile, setOcrResults) => {
  const [boxes, setBoxes] = useState([])
  const [selectedBoxIds, setSelectedBoxIds] = useState([])
  const [editingBoxId, setEditingBoxId] = useState(null)
  const [isLoadingBoxes, setIsLoadingBoxes] = useState(false)
  const boxesLoadIdRef = useRef(0)
  const boxesRef = useRef([])
  const fileItemsRef = useRef([])

  useEffect(() => {
    fileItemsRef.current = fileItems
  }, [fileItems])

  useEffect(() => {
    boxesRef.current = boxes
  }, [boxes])

  useEffect(() => {
    if (!activeFileId) return
    if (!boxes || !boxes.length) return
    setFileBoxes((prev) => ({ ...prev, [activeFileId]: boxes }))
  }, [boxes, activeFileId])

  useEffect(() => {
    const target = fileItems.find((f) => f.id === activeFileId)
    if (!target || target.isArchive) {
      setBoxes([])
      setSelectedBoxIds([])
      setOcrResults({})
      setIsLoadingBoxes(false)
      return
    }
    setOcrResults(ocrByFile[target.id] || {})
    const savedBoxes = fileBoxes[target.id]
    if (!target.serverId) {
      setBoxes(orderBoxes(savedBoxes || []))
      setSelectedBoxIds([])
      setIsLoadingBoxes(false)
      return
    }

    if (savedBoxes && savedBoxes.length) {
      const orderedSaved = orderBoxes(savedBoxes)
      setBoxes(orderedSaved)
      setSelectedBoxIds([])
      setIsLoadingBoxes(false)
      return
    }

    let cancelled = false
    const loadId = Date.now()
    boxesLoadIdRef.current = loadId
    // Only show loading if we don't have saved boxes and need to fetch
    // Add a small delay to avoid flickering on rapid navigation
    const loadingTimeout = setTimeout(() => {
      if (!cancelled && boxesLoadIdRef.current === loadId) {
        setIsLoadingBoxes(true)
      }
    }, 100)
    
    getCachedBoxes(target.serverId)
      .then((data) => {
        if (cancelled || boxesLoadIdRef.current !== loadId) return
        const cached = sortAndReindexBoxes(data.boxes || [])
        setBoxes(cached)
        setSelectedBoxIds([])
        setEditingBoxId(null)
        setFileBoxes((prev) => ({ ...prev, [target.id]: cached }))
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[boxes] load failed', err)
        setBoxes([])
        setSelectedBoxIds([])
      })
      .finally(() => {
        if (cancelled || boxesLoadIdRef.current !== loadId) return
        clearTimeout(loadingTimeout)
        setIsLoadingBoxes(false)
      })
    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
    }
  }, [activeFileId, fileItems])

  const persistBoxes = (nextBoxes) => {
    const currentFiles = fileItemsRef.current
    const target = currentFiles.find((f) => f.id === activeFileId)
    if (!target?.serverId) return
    setCachedBoxes(target.serverId, nextBoxes, null).catch((err) => {
      console.warn('[boxes] update failed', err)
    })
  }

  const toggleBox = (id) => {
    setSelectedBoxIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    )
  }

  const toggleBoxType = (id) => {
    setBoxes((prev) => {
      const next = prev.map((b) =>
        b.id === id ? { ...b, type: getNextType(b.type) } : b,
      )
      setSelectedBoxIds((sel) => (sel.includes(id) ? sel : [...sel, id]))
      persistBoxes(next)
      return next
    })
  }

  const deleteBoxes = (ids) => {
    if (!ids || ids.length === 0) return
    setBoxes((prev) => {
      const next = prev.filter((b) => !ids.includes(b.id))
      const reindexed = reindexBoxes(next)
      persistBoxes(reindexed)
      return reindexed
    })
    setSelectedBoxIds((prev) => prev.filter((id) => !ids.includes(id)))
    setEditingBoxId(null)
  }

  const toggleBoxesType = (ids) => {
    if (!ids || ids.length === 0) return
    setBoxes((prev) => {
      const next = prev.map((b) =>
        ids.includes(b.id) ? { ...b, type: getNextType(b.type) } : b,
      )
      persistBoxes(next)
      return next
    })
  }

  const handleBoxReorder = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    setBoxes((prev) => {
      const base = prev.some((b) => typeof b.order === 'number')
        ? [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        : [...prev]
      const sourceIndex = base.findIndex((b) => b.id === sourceId)
      const targetIndex = targetId === '__END__' ? base.length : base.findIndex((b) => b.id === targetId)
      if (sourceIndex === -1 || targetIndex === -1) return prev
      const next = [...base]
      const [moved] = next.splice(sourceIndex, 1)
      const insertAt = targetId === '__END__' ? next.length : targetIndex
      next.splice(insertAt, 0, moved)
      const reindexed = reindexBoxes(next)
      persistBoxes(reindexed)
      return reindexed
    })
  }

  return {
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
  }
}

