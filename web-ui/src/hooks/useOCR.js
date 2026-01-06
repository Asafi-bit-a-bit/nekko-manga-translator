// OCR hook
import { useState } from 'react'
import { runOCRStream } from '../services/ocr.js'
import { logStep } from '../utils/api.js'

export const useOCR = (fileItemsRef, activeFileId, boxes, selectedBoxIds, fileBoxes, setOcrByFile, setOcrResults, ocrByFile) => {
  const [isOcr, setIsOcr] = useState(false)
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0 })
  const [ocrOnePage, setOcrOnePage] = useState(true)
  const [lang, setLang] = useState('ja')
  const [selectedModel, setSelectedModel] = useState('manga-ocr')
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [pendingOCR, setPendingOCR] = useState(null)

  const updateOcrForFile = (fileId, updater) => {
    setOcrByFile((prev) => {
      const current = prev[fileId] || {}
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [fileId]: next }
    })
    if (fileId === activeFileId) {
      setOcrResults((prev) => {
        const current = prev || {}
        return typeof updater === 'function' ? updater(current) : updater
      })
    }
  }

  const executeOCR = async (uploadPendingFiles, availableModels) => {
    if (ocrOnePage && !boxes.length) return
    setIsOcr(true)
    const updatedFiles = await uploadPendingFiles().catch((err) => {
      console.error('[upload] error', err)
      return null
    })
    if (updatedFiles === null) {
      setIsOcr(false)
      return
    }
    const currentFiles = updatedFiles || fileItemsRef.current

    const routingPayload = {
      text_bubble: selectedModel || availableModels[0]?.id,
      text_free: selectedModel || availableModels[0]?.id,
    }

    if (ocrOnePage) {
      const targetFile = currentFiles.find((f) => f.id === activeFileId)
      const serverId = targetFile?.serverId
      if (!serverId) {
        console.warn('[ocr] no serverId for file', targetFile)
        setIsOcr(false)
        return
      }
      logStep('[ocr] start streaming', {
        activeFileId,
        serverId,
        boxes: boxes.length,
      })
      // Use all boxes on the active page, or selected boxes if any are selected
      const payloadBoxes = selectedBoxIds.length > 0 
        ? selectedBoxIds.map((id) => boxes.find((b) => b.id === id)).filter(Boolean)
        : boxes
      const totalBoxes = payloadBoxes.length
      let processedBoxes = 0
      setOcrProgress({ current: 0, total: totalBoxes })
      
      try {
        await runOCRStream(serverId, payloadBoxes, routingPayload, lang, (data) => {
          if (data.status === 'complete') {
            logStep('[ocr] stream complete', { total: data.total })
          } else if (data.box_id) {
            processedBoxes++
            setOcrProgress({ current: processedBoxes, total: totalBoxes })
            logStep('[ocr] box result', { boxId: data.box_id, chars: data.text?.length || 0 })
            updateOcrForFile(activeFileId, (prev) => ({ ...prev, [data.box_id]: data.text || '' }))
          }
        })
      } catch (err) {
        console.error('[ocr] error', err)
      } finally {
        setIsOcr(false)
        setOcrProgress({ current: 0, total: 0 })
      }
    } else {
      const nonArchiveFiles = currentFiles.filter((f) => !f.isArchive && f.serverId)
      logStep('[ocr-stream] start', { filesCount: nonArchiveFiles.length })
      
      let totalBoxes = 0
      for (const file of nonArchiveFiles) {
        totalBoxes += (fileBoxes[file.id] || []).length
      }
      let processedBoxes = 0
      setOcrProgress({ current: 0, total: totalBoxes })

      try {
        for (const file of nonArchiveFiles) {
          const pageBoxes = fileBoxes[file.id] || []
          if (!pageBoxes.length) {
            logStep('[ocr-stream] skip file (no boxes)', { fileId: file.id })
            continue
          }

          logStep('[ocr-stream] processing', { fileId: file.id, serverId: file.serverId, boxes: pageBoxes.length })
          
          try {
            await runOCRStream(file.serverId, pageBoxes, routingPayload, lang, (data) => {
              if (data.status === 'complete') {
                logStep('[ocr-stream] file complete', { fileId: file.id, total: data.total })
              } else if (data.box_id) {
                processedBoxes++
                setOcrProgress({ current: processedBoxes, total: totalBoxes })
                updateOcrForFile(file.id, (prev) => ({ ...prev, [data.box_id]: data.text || '' }))
              }
            })
          } catch (fileErr) {
            console.error('[ocr-stream] file error', file.id, fileErr)
          }
        }
        logStep('[ocr-stream] all complete')
      } catch (err) {
        console.error('[ocr-stream] error', err)
      } finally {
        setIsOcr(false)
        setOcrProgress({ current: 0, total: 0 })
      }
    }
  }

  const runOCR = async (uploadPendingFiles, availableModels) => {
    if (ocrOnePage && !boxes.length) return
    
    const updatedFiles = await uploadPendingFiles().catch((err) => {
      console.error('[upload] error', err)
      return null
    })
    if (updatedFiles === null) {
      return
    }
    const currentFiles = updatedFiles || fileItemsRef.current

    // Check if OCR already exists
    let alreadyOcred = []
    if (ocrOnePage) {
      const targetFile = currentFiles.find((f) => f.id === activeFileId)
      if (targetFile) {
        const ocrResults = ocrByFile[targetFile.id] || {}
        const hasOcr = Object.keys(ocrResults).length > 0
        if (hasOcr) {
          const nonArchiveFiles = currentFiles.filter((f) => !f.isArchive)
          const pageIndex = nonArchiveFiles.findIndex((f) => f.id === targetFile.id) + 1
          alreadyOcred = [pageIndex]
        }
      }
    } else {
      const nonArchiveFiles = currentFiles.filter((f) => !f.isArchive && f.serverId)
      alreadyOcred = nonArchiveFiles
        .map((file, idx) => {
          const ocrResults = ocrByFile[file.id] || {}
          const hasOcr = Object.keys(ocrResults).length > 0
          return hasOcr ? idx + 1 : null
        })
        .filter((idx) => idx !== null)
    }

    if (alreadyOcred.length > 0) {
      setPendingOCR({ uploadPendingFiles, availableModels, pageRange: alreadyOcred })
      setShowRerunModal(true)
      return
    }

    // No existing OCR, proceed directly
    await executeOCR(uploadPendingFiles, availableModels)
  }

  const handleConfirmRerun = async () => {
    setShowRerunModal(false)
    if (pendingOCR) {
      await executeOCR(pendingOCR.uploadPendingFiles, pendingOCR.availableModels)
      setPendingOCR(null)
    }
  }

  const handleCancelRerun = () => {
    setShowRerunModal(false)
    setPendingOCR(null)
  }

  const getRerunPageRange = () => {
    if (!pendingOCR) return []
    return pendingOCR.pageRange || []
  }

  return {
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
    showRerunModal,
    rerunPageRange: getRerunPageRange(),
    handleConfirmRerun,
    handleCancelRerun,
  }
}

