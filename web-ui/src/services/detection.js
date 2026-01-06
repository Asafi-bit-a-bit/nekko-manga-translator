// Detection API service
import { API_BASE } from '../constants/api.js'
import { fetchWithLogs } from '../utils/api.js'
import { sortAndReindexBoxes } from '../utils/boxes.js'

export const runDetection = async (fileId, maxBoxes, threshold) => {
  const form = new FormData()
  form.append('file_id', fileId)
  form.append('max_boxes', String(maxBoxes))
  form.append('threshold', String(threshold))
  const data = await fetchWithLogs(`${API_BASE}/api/detect`, { method: 'POST', body: form }, '[detect]')
  const detected = sortAndReindexBoxes((data.boxes || []).slice(0, maxBoxes))
  return { ...data, boxes: detected }
}

