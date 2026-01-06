// File upload API service
import { API_BASE } from '../constants/api.js'
import { fetchWithLogs, logStep } from '../utils/api.js'

export const uploadFiles = async (files) => {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  
  const data = await fetchWithLogs(`${API_BASE}/api/upload`, { method: 'POST', body: form }, '[upload]')
  return data
}

