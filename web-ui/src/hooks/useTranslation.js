// Translation hook
import { useState } from 'react'
import { runTranslationStream } from '../services/translation.js'
import { orderBoxes } from '../utils/boxes.js'
import { shouldTranslate, normalizePunctuation } from '../utils/text.js'
import { logStep } from '../utils/api.js'

export const useTranslation = (fileItems, fileBoxes, ocrByFile, setTranslationsByFile, translationsByFile) => {
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateProgress, setTranslateProgress] = useState({ current: 0, total: 0 })
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [failedOcrBlocks, setFailedOcrBlocks] = useState([])
  const [pendingTranslation, setPendingTranslation] = useState(null)
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [pendingRerunTranslation, setPendingRerunTranslation] = useState(null)
  const [ollamaApiKey, setOllamaApiKey] = useState(() => {
    try {
      return localStorage.getItem('ollama_api_key') || ''
    } catch {
      return ''
    }
  })
  const [targetLang, setTargetLang] = useState('en')
  const [ollamaModel, setOllamaModel] = useState('deepseek-v3.1:671b-cloud')

  const updateTranslationsForFile = (fileId, updater) => {
    setTranslationsByFile((prev) => {
      const current = prev[fileId] || {}
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [fileId]: next }
    })
  }

  const executeTranslation = async (lang, skipEmpty = false, forceRerun = false) => {
    if (!ollamaApiKey.trim()) {
      alert('Пожалуйста, введите API ключ Ollama Cloud')
      return
    }
    
    const nonArchiveFiles = fileItems.filter((f) => !f.isArchive)
    if (!nonArchiveFiles.length) {
      console.warn('[translate] no files to translate')
      return
    }

    setIsTranslating(true)
    
    try {
      const textsToTranslate = []
      const boxIds = []
      const boxIdToFileId = new Map()
      const failedBlocks = []
      
      for (let fileIndex = 0; fileIndex < nonArchiveFiles.length; fileIndex++) {
        const file = nonArchiveFiles[fileIndex]
        const pageBoxes = orderBoxes(fileBoxes[file.id] || [])
        const texts = ocrByFile[file.id] || {}
        
        for (let boxIndex = 0; boxIndex < pageBoxes.length; boxIndex++) {
          const box = pageBoxes[boxIndex]
          let text = (texts[box.id] || '').trim()
          
          // Check if result is empty
          if (!text || text.length === 0) {
            failedBlocks.push({
              fileId: file.id,
              fileName: file.name,
              boxId: box.id,
              pageIndex: fileIndex,
              boxIndex: boxIndex,
            })
            if (!skipEmpty) {
              continue
            }
          }
          
          // Normalize text first
          const normalizedText = normalizePunctuation(text)
          
          // Check if text should be translated (after normalization)
          if (!shouldTranslate(normalizedText)) {
            // If text is not translatable (only punctuation), normalize and insert directly
            const fileId = file.id
            updateTranslationsForFile(fileId, (prev) => ({ ...prev, [box.id]: normalizedText }))
            continue
          }
          
          // Use normalized text for translation
          textsToTranslate.push(normalizedText)
          boxIds.push(box.id)
          boxIdToFileId.set(box.id, file.id)
        }
      }

      if (!textsToTranslate.length) {
        alert('Нет текста для перевода. Сначала выполните OCR.')
        setIsTranslating(false)
        return
      }

      const totalTexts = textsToTranslate.length
      let processedTexts = 0
      setTranslateProgress({ current: 0, total: totalTexts })

      logStep('[translate] start streaming', {
        textsCount: textsToTranslate.length,
        sourceLang: lang,
        targetLang,
        model: ollamaModel,
      })

      await runTranslationStream(textsToTranslate, boxIds, lang, targetLang, ollamaApiKey.trim(), ollamaModel, (data) => {
        if (data.status === 'complete') {
          logStep('[translate] stream complete', { total: data.total })
        } else if (data.box_id) {
          processedTexts++
          setTranslateProgress({ current: processedTexts, total: totalTexts })
          const fileId = boxIdToFileId.get(data.box_id)
          if (fileId) {
            logStep('[translate] box result', { boxId: data.box_id, fileId, chars: data.text?.length || 0 })
            updateTranslationsForFile(fileId, (prev) => ({ ...prev, [data.box_id]: data.text || '' }))
          }
        }
      })

      logStep('[translate] complete')
    } catch (err) {
      console.error('[translate] error', err)
      alert(`Ошибка перевода: ${err.message || 'Неизвестная ошибка'}`)
    } finally {
      setIsTranslating(false)
      setTranslateProgress({ current: 0, total: 0 })
    }
  }

  const runTranslation = async (lang) => {
    if (!ollamaApiKey.trim()) {
      alert('Пожалуйста, введите API ключ Ollama Cloud')
      return
    }
    
    const nonArchiveFiles = fileItems.filter((f) => !f.isArchive)
    if (!nonArchiveFiles.length) {
      console.warn('[translate] no files to translate')
      return
    }

    // Check for failed OCR blocks (only empty texts, not normalized punctuation-only texts)
    const failedBlocks = []
    for (let fileIndex = 0; fileIndex < nonArchiveFiles.length; fileIndex++) {
      const file = nonArchiveFiles[fileIndex]
      const pageBoxes = orderBoxes(fileBoxes[file.id] || [])
      const texts = ocrByFile[file.id] || {}
      
      for (let boxIndex = 0; boxIndex < pageBoxes.length; boxIndex++) {
        const box = pageBoxes[boxIndex]
        const text = (texts[box.id] || '').trim()
        // Only count as failed if text is empty (not if it's just punctuation - those will be normalized)
        if (!text || text.length === 0) {
          failedBlocks.push({
            fileId: file.id,
            fileName: file.name,
            boxId: box.id,
            pageIndex: fileIndex,
            boxIndex: boxIndex,
          })
        }
      }
    }

    // Check if translation already exists
    const alreadyTranslated = nonArchiveFiles
      .map((file, idx) => {
        const translations = translationsByFile[file.id] || {}
        const hasTranslation = Object.keys(translations).length > 0
        return hasTranslation ? idx + 1 : null
      })
      .filter((idx) => idx !== null)

    // If there are failed blocks, show confirmation modal
    if (failedBlocks.length > 0) {
      setFailedOcrBlocks(failedBlocks)
      setPendingTranslation({ lang, alreadyTranslated })
      setShowConfirmModal(true)
      return
    }

    // If translation already exists, show rerun modal
    if (alreadyTranslated.length > 0) {
      setPendingRerunTranslation({ lang })
      setShowRerunModal(true)
      return
    }

    // No failed blocks and no existing translation, proceed directly
    await executeTranslation(lang, true)
  }

  const handleConfirmTranslation = async () => {
    setShowConfirmModal(false)
    if (pendingTranslation) {
      const { lang: translationLang, alreadyTranslated } = pendingTranslation
      // If translation already exists, show rerun modal instead
      if (alreadyTranslated && alreadyTranslated.length > 0) {
        setPendingRerunTranslation({ lang: translationLang })
        setShowRerunModal(true)
      } else {
        await executeTranslation(translationLang, true)
      }
      setPendingTranslation(null)
    }
    setFailedOcrBlocks([])
  }

  const handleCancelTranslation = () => {
    setShowConfirmModal(false)
    setPendingTranslation(null)
    setFailedOcrBlocks([])
  }

  const handleConfirmRerun = async () => {
    setShowRerunModal(false)
    if (pendingRerunTranslation) {
      await executeTranslation(pendingRerunTranslation.lang, true, true)
      setPendingRerunTranslation(null)
    }
  }

  const handleCancelRerun = () => {
    setShowRerunModal(false)
    setPendingRerunTranslation(null)
  }

  const getRerunPageRange = () => {
    if (!pendingRerunTranslation) return []
    const nonArchiveFiles = fileItems.filter((f) => !f.isArchive)
    const alreadyTranslated = nonArchiveFiles
      .map((file, idx) => {
        const translations = translationsByFile[file.id] || {}
        const hasTranslation = Object.keys(translations).length > 0
        return hasTranslation ? idx + 1 : null
      })
      .filter((idx) => idx !== null)
    return alreadyTranslated
  }

  return {
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
    showRerunModal,
    rerunPageRange: getRerunPageRange(),
    handleConfirmRerun,
    handleCancelRerun,
  }
}

