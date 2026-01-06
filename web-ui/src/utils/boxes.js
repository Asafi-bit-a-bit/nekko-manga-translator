// Box manipulation utilities
import { BOX_TYPE_OPTIONS, DETECTION_CLASSES } from '../constants/detection.js'

export const clamp01 = (v) => Math.min(1, Math.max(0, v))

export const makeBoxId = () => `box-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`

export const sortAndReindexBoxes = (list) => {
  if (!Array.isArray(list) || list.length === 0) return []
  const hasOrder = list.some((b) => typeof b.order === 'number')
  const ordered = hasOrder
    ? [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [...list].sort((a, b) => a.y - b.y || a.x - b.x)
  return ordered.map((b, idx) => ({ ...b, order: idx }))
}

export const reindexBoxes = (list) => list.map((b, idx) => ({ ...b, order: idx }))

export const orderBoxes = (list) => {
  if (!Array.isArray(list) || list.length === 0) return []
  const hasOrder = list.some((b) => typeof b.order === 'number')
  if (hasOrder) {
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  return [...list].sort((a, b) => a.y - b.y || a.x - b.x)
}

export const getTypeLabel = (type) => {
  return DETECTION_CLASSES.find((cls) => cls.id === type)?.label || type
}

export const getNextType = (current) => {
  const idx = BOX_TYPE_OPTIONS.indexOf(current)
  if (idx === -1) return BOX_TYPE_OPTIONS[0]
  return BOX_TYPE_OPTIONS[(idx + 1) % BOX_TYPE_OPTIONS.length]
}

