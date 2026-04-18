const KEY = 'rasoi_recent_ingredients'
const MAX = 14

export function readRecentIngredients() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()) : []
  } catch {
    return []
  }
}

export function recordRecentIngredient(name) {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return
  const prev = readRecentIngredients()
  const next = [n, ...prev.filter((x) => x !== n)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}
