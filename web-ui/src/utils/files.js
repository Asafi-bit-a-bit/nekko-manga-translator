// File manipulation utilities
export const normalizeName = (name) => name.toLowerCase()

export const uniqueName = (name, existingNames) => {
  const norm = normalizeName(name)
  if (!existingNames.has(norm)) return name
  const dot = name.lastIndexOf('.')
  const base = dot !== -1 ? name.slice(0, dot) : name
  const ext = dot !== -1 ? name.slice(dot) : ''
  let i = 1
  // Ensure uniqueness
  while (existingNames.has(normalizeName(`${base} (${i})${ext}`))) {
    i += 1
  }
  return `${base} (${i})${ext}`
}

