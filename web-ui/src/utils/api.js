// API utilities
export const logStep = (label, payload) => {
  const ts = new Date().toISOString()
  if (payload !== undefined) {
    console.log(`[${ts}] ${label}`, payload)
  } else {
    console.log(`[${ts}] ${label}`)
  }
}

export const parseJsonWithPreview = (text, context) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    console.warn(`[${context}] JSON parse failed`, err, { preview: text.slice(0, 400) })
    return null
  }
}

export const fetchWithLogs = async (url, options, context) => {
  const started = performance.now()
  const res = await fetch(url, options)
  const bodyText = await res.text()
  const durationMs = Math.round(performance.now() - started)
  const data = parseJsonWithPreview(bodyText, `${context} body`)
  logStep(`${context} response`, {
    status: res.status,
    ok: res.ok,
    durationMs,
    bodyPreview: bodyText.slice(0, 300),
    url,
  })
  if (!res.ok) {
    const detail = (data && data.detail) || bodyText || `HTTP ${res.status}`
    throw new Error(`${context} failed: ${res.status} ${res.statusText} :: ${detail}`)
  }
  return data || {}
}

export const processSSEStream = async (url, formData, onMessage) => {
  const response = await fetch(url, { method: 'POST', body: formData })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          onMessage(data)
        } catch (e) {
          console.warn('[sse] parse error', e, line)
        }
      }
    }
  }
}

