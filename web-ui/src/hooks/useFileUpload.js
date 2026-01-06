// File upload hook
import { useRef } from 'react'
import { API_BASE } from '../constants/api.js'
import { normalizeName } from '../utils/files.js'
import { uploadFiles } from '../services/upload.js'
import { logStep } from '../utils/api.js'

export const useFileUpload = (setFileItems, setActiveFileId, setConflicts, setSelectedConflictId, setApplyToAllConflicts, resetWork, selectedConflictId) => {
  const fileItemsRef = useRef([])

  const cleanupFile = (file) => {
    if (file?.url) URL.revokeObjectURL(file.url)
  }

  const uploadPendingFiles = async () => {
    const pending = fileItemsRef.current.filter((f) => !f.serverId)
    if (!pending.length) {
      logStep('[upload] no pending files', { count: fileItemsRef.current.length })
      return fileItemsRef.current
    }
    logStep('[upload] pending', pending.map((p) => ({ id: p.id, name: p.name, hasFile: !!p.file, isArchive: p.isArchive })))
    const form = new FormData()
    const itemsToUpload = []
    pending.forEach((item) => {
      const fileObj = item.file || item.fileRef
      if (!fileObj) {
        console.warn('[upload] skipping item without file object', item.id, item.name)
        return
      }
      itemsToUpload.push(item)
      const uploadFile =
        fileObj.name === item.name
          ? fileObj
          : new File([fileObj], item.name, { type: fileObj.type })
      form.append('files', uploadFile)
    })
    logStep('[upload] items to upload', { count: itemsToUpload.length, names: itemsToUpload.map((i) => i.name) })
    const filesToUpload = itemsToUpload.map((item) => {
      const fileObj = item.file || item.fileRef
      return fileObj.name === item.name
        ? fileObj
        : new File([fileObj], item.name, { type: fileObj.type })
    })
    const data = await uploadFiles(filesToUpload)
    const serverFiles = data.files || []
    logStep('[upload] server response', { filesCount: serverFiles.length, files: serverFiles })
    
    const extractedFiles = []
    const idToServer = new Map()
    let serverIdx = 0
    
    itemsToUpload.forEach((item) => {
      if (item.isArchive) {
        while (serverIdx < serverFiles.length) {
          const server = serverFiles[serverIdx]
          if (server?.fromArchive && server.fromArchive === item.name) {
            extractedFiles.push({
              id: `${Date.now()}-${serverIdx}-${server.name}`,
              name: server.name,
              serverId: server.id,
              url: `${API_BASE}/api/image/${server.id}`,
              isArchive: false,
              fromArchive: server.fromArchive,
            })
            serverIdx++
          } else if (!server?.fromArchive && serverIdx === 0) {
            break
          } else {
            break
          }
        }
        idToServer.set(item.id, '__remove__')
      } else {
        const server = serverFiles[serverIdx]
        if (server?.id) {
          idToServer.set(item.id, server.id)
          logStep('[upload] mapped', { localId: item.id, name: item.name, serverId: server.id })
        } else {
          console.warn('[upload] no server id for item', item.id, item.name, 'at index', serverIdx)
        }
        serverIdx++
      }
    })
    
    if (!idToServer.size && !extractedFiles.length) {
      throw new Error('Upload returned no ids')
    }

    let updated = fileItemsRef.current
      .filter((item) => idToServer.get(item.id) !== '__remove__')
      .map((item) => {
        const serverId = idToServer.get(item.id)
        if (serverId && serverId !== '__remove__') {
          return { ...item, serverId, url: `${API_BASE}/api/image/${serverId}` }
        }
        return item
      })
    
    if (extractedFiles.length > 0) {
      logStep('[upload] extracted from archives', { count: extractedFiles.length, names: extractedFiles.map((f) => f.name) })
      updated = [...updated, ...extractedFiles]
    }
    
    setFileItems(updated)
    fileItemsRef.current = updated
    
    return updated
  }

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const archiveFiles = files.filter((f) => /\.(zip|rar|7z)$/i.test(f.name))
    const imageFiles = files.filter((f) => !/\.(zip|rar|7z)$/i.test(f.name))
    
    if (archiveFiles.length > 0) {
      logStep('[upload] uploading archives for extraction', { count: archiveFiles.length, names: archiveFiles.map((f) => f.name) })
      const form = new FormData()
      archiveFiles.forEach((f) => form.append('files', f))
      
      try {
        const data = await uploadFiles(archiveFiles)
        const serverFiles = data.files || []
        logStep('[upload-archive] extracted', { count: serverFiles.length })
        
        const existingByName = new Map(
          fileItemsRef.current.map((item) => [normalizeName(item.name), item]),
        )
        
        const extractedItems = serverFiles.map((sf, idx) => ({
          id: `${Date.now()}-ext-${idx}-${sf.name}`,
          name: sf.name,
          serverId: sf.id,
          url: `${API_BASE}/api/image/${sf.id}`,
          isArchive: false,
          fromArchive: sf.fromArchive,
        }))
        
        // Check for conflicts in extracted files
        const toAdd = []
        const conflictList = []
        
        extractedItems.forEach((item) => {
          const norm = normalizeName(item.name)
          const existing = existingByName.get(norm)
          if (existing) {
            conflictList.push({
              id: `conf-${item.id}`,
              existing,
              incoming: item,
            })
          } else {
            toAdd.push(item)
            existingByName.set(norm, item)
          }
        })
        
        if (toAdd.length > 0) {
          setFileItems((prev) => {
            const merged = [...prev, ...toAdd]
            fileItemsRef.current = merged
            return merged
          })
        }
        
        if (conflictList.length > 0) {
          setConflicts((prev) => {
            const merged = [...prev, ...conflictList]
            return merged
          })
          if (!selectedConflictId) {
            setSelectedConflictId(conflictList[0].id)
          }
          setApplyToAllConflicts(false)
        }
      } catch (err) {
        console.error('[upload-archive] extraction failed', err)
        let errorMessage = 'Неизвестная ошибка'
        if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
          errorMessage = 'Не удалось подключиться к серверу. Проверьте подключение к интернету.'
        } else if (err.message) {
          const match = err.message.match(/::\s*(.+)$/)
          errorMessage = match ? match[1].trim() : err.message
        }
        alert(`Ошибка распаковки архива: ${errorMessage}`)
      }
    }
    
    if (!imageFiles.length) return

    const existingByName = new Map(
      fileItemsRef.current.map((item) => [normalizeName(item.name), item]),
    )

    const nextItems = imageFiles.map((file, idx) => {
      return {
        id: `${Date.now()}-${idx}-${file.name}`,
        name: file.name,
        file,
        url: URL.createObjectURL(file),
        isArchive: false,
      }
    })

    const toAdd = []
    const conflictList = []

    nextItems.forEach((item) => {
      const norm = normalizeName(item.name)
      const existing = existingByName.get(norm)
      if (existing) {
        conflictList.push({
          id: `conf-${item.id}`,
          existing,
          incoming: item,
        })
      } else {
        toAdd.push(item)
        existingByName.set(norm, item)
      }
    })

    setFileItems((prev) => {
      const merged = [...prev, ...toAdd]
      fileItemsRef.current = merged
      return merged
    })
    if (conflictList.length > 0) {
      setConflicts(conflictList)
      setSelectedConflictId(conflictList[0].id)
      setApplyToAllConflicts(false)
    }
    resetWork()
  }

  return {
    fileItemsRef,
    uploadPendingFiles,
    handleFileChange,
    cleanupFile,
  }
}

