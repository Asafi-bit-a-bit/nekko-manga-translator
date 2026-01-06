// Translation API service
import { API_BASE } from '../constants/api.js'
import { processSSEStream } from '../utils/api.js'

export const runTranslationStream = async (texts, boxIds, sourceLang, targetLang, apiKey, model, onMessage) => {
  const form = new FormData()
  form.append('texts', JSON.stringify(texts))
  form.append('box_ids', JSON.stringify(boxIds))
  form.append('source_lang', sourceLang)
  form.append('target_lang', targetLang)
  form.append('api_key', apiKey)
  form.append('model', model)
  
  await processSSEStream(`${API_BASE}/api/translate/stream`, form, onMessage)
}

