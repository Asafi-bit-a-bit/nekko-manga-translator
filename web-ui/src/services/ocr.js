// OCR API service
import { API_BASE } from '../constants/api.js'
import { processSSEStream } from '../utils/api.js'

export const runOCRStream = async (fileId, boxes, routing, lang, onMessage) => {
  const form = new FormData()
  form.append('file_id', fileId)
  form.append('boxes', JSON.stringify(boxes))
  form.append('routing', JSON.stringify(routing))
  form.append('lang', lang)
  
  await processSSEStream(`${API_BASE}/api/ocr/stream`, form, onMessage)
}

