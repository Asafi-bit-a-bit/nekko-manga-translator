// Detection hook
import { useState } from 'react'
import { runDetection } from '../services/detection.js'
import { sortAndReindexBoxes } from '../utils/boxes.js'
import { logStep } from '../utils/api.js'

export const useDetection = (fileItemsRef, activeFileId, setFileBoxes, setBoxes, setSelectedBoxIds, fileBoxes) => {
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectProgress, setDetectProgress] = useState({ current: 0, total: 0 })
  const [detectionThreshold, setDetectionThreshold] = useState(0.66)
  const [detectOnePage, setDetectOnePage] = useState(true)
  const [detectScope, setDetectScope] = useState('all')
  const [detectRangeStart, setDetectRangeStart] = useState('')
  const [detectRangeEnd, setDetectRangeEnd] = useState('')
  const [maxBoxes] = useState(10)
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [pendingDetection, setPendingDetection] = useState(null)

  const executeDetection = async (uploadPendingFiles, targets) => {
    if (!targets || targets.length === 0) {
      console.warn('[detect] no targets to process')
      return
    }
    setIsDetecting(true)
    setDetectProgress({ current: 0, total: targets.length })
    try {
      let processed = 0
      for (const file of targets) {
        if (!file?.serverId) {
          console.warn('[detect] skip file without serverId', file)
          processed++
          setDetectProgress({ current: processed, total: targets.length })
          continue
        }
        logStep('[detect] start', {
          fileId: file.id,
          serverId: file.serverId,
          maxBoxes,
          fileName: file.name,
          scope: detectOnePage ? 'single' : detectScope,
        })
        const data = await runDetection(file.serverId, maxBoxes, detectionThreshold)
        const detected = sortAndReindexBoxes((data.boxes || []).slice(0, maxBoxes))
        logStep('[detect] boxes', { count: detected.length, first: detected[0], meta: data.meta })
        setFileBoxes((prev) => ({ ...prev, [file.id]: detected }))
        if (file.id === activeFileId) {
          setBoxes(detected)
          // Do not auto-select boxes created by the detector
          setSelectedBoxIds([])
        }
        processed++
        setDetectProgress({ current: processed, total: targets.length })
      }
    } catch (err) {
      console.error('[detect] error', err)
      if (String(err).includes('404')) {
        console.warn('[detect] got 404, stop retry to avoid loop')
      }
    } finally {
      setIsDetecting(false)
      setDetectProgress({ current: 0, total: 0 })
    }
  }

  const runDetectionHandler = async (uploadPendingFiles) => {
    const updatedFiles = await uploadPendingFiles().catch((err) => {
      console.error('[upload] error', err)
      return null
    })
    if (updatedFiles === null) return
    const currentFiles = updatedFiles || fileItemsRef.current
    const indexedFiles = currentFiles.map((f, idx) => ({ ...f, pageIndex: idx + 1 }))
    const targetFile = indexedFiles.find((f) => f.id === activeFileId)
    const resolveTargets = () => {
      if (detectOnePage) {
        return targetFile ? [targetFile] : []
      }
      if (detectScope === 'range') {
        const start = parseInt(detectRangeStart, 10)
        const end = parseInt(detectRangeEnd, 10)
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
          window.alert('Введите корректный диапазон страниц.')
          return null
        }
        const min = Math.min(start, end)
        const max = Math.max(start, end)
        return indexedFiles.filter((file) => file.pageIndex >= min && file.pageIndex <= max)
      }
      return indexedFiles
    }

    const targets = (resolveTargets() || []).filter((file) => !file.isArchive)
    if (targets === null) return
    if (!targets.length) {
      console.warn('[detect] no targets to process')
      return
    }

    // Check if detection already exists for any target
    const alreadyDetected = targets.filter((file) => {
      const boxes = fileBoxes[file.id] || []
      return boxes.length > 0
    })

    if (alreadyDetected.length > 0) {
      const pageNumbers = alreadyDetected.map((f) => f.pageIndex)
      setPendingDetection({ uploadPendingFiles, targets })
      setShowRerunModal(true)
      return
    }

    // No existing detection, proceed directly
    await executeDetection(uploadPendingFiles, targets)
  }

  const handleConfirmRerun = async () => {
    setShowRerunModal(false)
    if (pendingDetection) {
      await executeDetection(pendingDetection.uploadPendingFiles, pendingDetection.targets)
      setPendingDetection(null)
    }
  }

  const handleCancelRerun = () => {
    setShowRerunModal(false)
    setPendingDetection(null)
  }

  const getRerunPageRange = () => {
    if (!pendingDetection) return []
    return pendingDetection.targets.map((f) => f.pageIndex)
  }

  return {
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
    showRerunModal,
    rerunPageRange: getRerunPageRange(),
    handleConfirmRerun,
    handleCancelRerun,
  }
}

