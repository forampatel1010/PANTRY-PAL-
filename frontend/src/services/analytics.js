/**
 * Fire-and-forget client analytics → POST /api/analytics/event
 */

const NON_VEG_SUBSTRINGS = [
  'chicken',
  'mutton',
  'fish',
  'prawn',
  'egg',
  'meat',
  'beef',
  'pork',
  'lamb',
  'bacon',
  'ham',
  'sausage',
  'tuna',
  'sardine',
  'anchovy',
  'seafood',
]

export function inferDietType(ingredients) {
  if (!Array.isArray(ingredients)) return 'unknown'
  for (const raw of ingredients) {
    const s = String(raw || '').toLowerCase()
    if (!s) continue
    for (const nv of NON_VEG_SUBSTRINGS) {
      if (s.includes(nv)) return 'non_veg'
    }
  }
  return 'veg'
}

function buildPayload(event, props) {
  const out = {
    event,
    client_ts: new Date().toISOString(),
    ...props,
  }
  return JSON.stringify(out)
}

export function trackEvent(event, properties = {}) {
  if (!event || typeof event !== 'string') return
  const body = buildPayload(event, properties)
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/analytics/event', blob)
      return
    }
  } catch {
    /* fall through */
  }
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
