// Text processing utilities

/**
 * Check if text contains only punctuation marks (Unicode punctuation category).
 * @param {string} text - Input text to check
 * @returns {boolean} True if text contains only punctuation, False otherwise
 */
export const isPunctuationOnly = (text) => {
  if (!text || !text.trim()) {
    return false
  }
  
  // Remove whitespace for checking
  const textNoWs = text.replace(/\s/g, '')
  if (!textNoWs) {
    return false
  }
  
  // Check if all characters are punctuation
  // Unicode punctuation categories start with 'P'
  for (let i = 0; i < textNoWs.length; i++) {
    const char = textNoWs[i]
    const code = char.charCodeAt(0)
    // Check Unicode punctuation categories
    // Basic punctuation: U+2000-U+206F, U+2E00-U+2E7F
    // General punctuation: U+2000-U+206F
    // Supplemental punctuation: U+2E00-U+2E7F
    // CJK symbols and punctuation: U+3000-U+303F
    // Fullwidth forms: U+FF00-U+FFEF
    const isPunct = /[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\uFF00-\uFFEF\p{P}]/u.test(char)
    if (!isPunct) {
      return false
    }
  }
  
  return true
}

/**
 * Normalize punctuation marks in text (similar to backend normalize_punctuation).
 * @param {string} text - Input text to normalize
 * @returns {string} Normalized text
 */
export const normalizePunctuation = (text) => {
  if (!text) {
    return text
  }
  
  // Normalize ellipsis: various forms to "..."
  let normalized = text.replace(/\.{2,}/g, '...')  // Multiple dots
  normalized = normalized.replace(/\.\s*\.\s*\./g, '...')  // Dots with spaces
  normalized = normalized.replace(/…/g, '...')  // Unicode ellipsis
  
  // Normalize question + exclamation
  normalized = normalized.replace(/\s*\?\s*!\s*/g, '?!')
  normalized = normalized.replace(/\s*!\s*\?\s*/g, '?!')
  normalized = normalized.replace(/\?{2,}!*/g, '?!')
  normalized = normalized.replace(/!{2,}\?*/g, '?!')
  
  // Remove extra spaces around punctuation marks
  normalized = normalized.replace(/\s+([?!.,:;])/g, '$1')  // Space before punctuation
  normalized = normalized.replace(/([?!.,:;])\s+/g, '$1')  // Space after punctuation
  
  // Normalize dashes
  normalized = normalized.replace(/\s-\s/g, ' — ')  // Space-dash-space → em dash
  normalized = normalized.replace(/^-\s/g, '— ')  // Start with dash
  normalized = normalized.replace(/\s-$/g, ' —')  // End with dash
  
  return normalized.trim()
}

/**
 * Check if text should be sent for translation.
 * Text should NOT be translated if:
 * - It's empty or only whitespace
 * - It contains only punctuation marks
 * @param {string} text - Input text to check
 * @returns {boolean} True if text should be translated, False otherwise
 */
export const shouldTranslate = (text) => {
  if (!text || !text.trim()) {
    return false
  }
  
  if (isPunctuationOnly(text)) {
    return false
  }
  
  return true
}

