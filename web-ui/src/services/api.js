// Base API service
import { API_BASE } from '../constants/api.js'
import { fetchWithLogs } from '../utils/api.js'

export const getSystemCpu = async () => {
  const data = await fetchWithLogs(`${API_BASE}/api/system/cpu`, { method: 'GET' }, '[system]')
  return data
}

export const cleanupTmp = async () => {
  const data = await fetchWithLogs(`${API_BASE}/api/cleanup/tmp`, { method: 'GET' }, '[cleanup_tmp]')
  return data
}

export const getImageUrl = (fileId) => `${API_BASE}/api/image/${fileId}`

export const getCachedBoxes = async (fileId) => {
  const data = await fetchWithLogs(`${API_BASE}/api/boxes?file_id=${fileId}`, { method: 'GET' }, '[boxes]')
  return data
}

export const setCachedBoxes = async (fileId, boxes, meta) => {
  const data = await fetchWithLogs(
    `${API_BASE}/api/boxes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, boxes, meta }),
    },
    '[boxes]',
  )
  return data
}

export const cleanupFiles = async (fileIds) => {
  const form = new FormData()
  if (fileIds) {
    form.append('file_ids', fileIds)
  }
  const data = await fetchWithLogs(`${API_BASE}/api/cleanup`, { method: 'POST', body: form }, '[cleanup]')
  return data
}

