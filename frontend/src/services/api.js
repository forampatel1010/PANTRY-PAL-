import axios from 'axios'

const API_BASE_URL = '/api'

const apiProcessResponse = (response) => {
  return response.data
}

/** FastAPI validation errors use { detail: string | array } — no `message` field. */
function messageFromFastApiBody(data) {
  if (!data || typeof data !== 'object') return null
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  const d = data.detail
  if (typeof d === 'string' && d.trim()) return d
  if (Array.isArray(d) && d.length) {
    const parts = d.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item.msg === 'string') {
        const loc = Array.isArray(item.loc) ? item.loc.filter(Boolean).join('.') : ''
        return loc ? `${loc}: ${item.msg}` : item.msg
      }
      return null
    }).filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  return null
}

/** Attach hint / suggestions from RasoiAI JSON error bodies. */
function throwFromAxiosData(data) {
  const msg =
    messageFromFastApiBody(data) ||
    'Something went wrong — please try again.'
  const err = new Error(msg)
  err.hint = data?.hint || null
  err.suggestions = Array.isArray(data?.suggestions) ? data.suggestions : []
  err.code = data?.code || (Array.isArray(data?.detail) ? 'validation' : null)
  throw err
}

export function rejectIfApiFailed(body) {
  if (body && body.success === false) {
    throwFromAxiosData(body)
  }
}

const apiProcessError = (error) => {
  if (error.response?.data) {
    throwFromAxiosData(error.response.data)
  }
  const err = new Error(
    error.message || 'We couldn’t reach the server. Check your connection and try again.'
  )
  err.hint = 'If you’re on Wi‑Fi, try refreshing the page or waiting a moment before retrying.'
  err.suggestions = []
  err.code = 'network'
  throw err
}

export const generateRecipe = async (payload, options = {}) => {
  try {
    const params = {}
    if (options.refresh || (payload && payload.base_recipe)) {
      params.refresh = true
    }
    const response = await axios.post(`${API_BASE_URL}/generate-recipe`, payload, { params })
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

export const regenerateRecipe = async (payload, removeIngredient) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/regenerate`, payload, {
      params: { remove_ingredient: removeIngredient }
    })
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

export const getSearchLinks = async (query) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/search-links`, {
      params: { query }
    })
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

export const getStatus = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/status`)
    return apiProcessResponse(response)
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

export const fetchAnalyticsSummary = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/analytics`)
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

/** Ingredient chip autocomplete (same vocabulary as backend rules). */
export const fetchIngredientSuggestions = async (q = '') => {
  try {
    const response = await axios.get(`${API_BASE_URL}/suggest-ingredients`, {
      params: { q: q.trim() },
    })
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

/** Categories, pairings map, popular — for smart suggestion UI. */
export const fetchIngredientMeta = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ingredient-meta`)
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

/** Multipart image → Gemini vision → sanitized ingredient list. */
export const detectIngredientsFromImage = async (file) => {
  try {
    const form = new FormData()
    form.append('file', file)
    // Do NOT set Content-Type — browser must add multipart boundary or FastAPI returns 422.
    const response = await axios.post(`${API_BASE_URL}/detect-ingredients`, form)
    const body = apiProcessResponse(response)
    rejectIfApiFailed(body)
    return body
  } catch (error) {
    if (error instanceof Error && ('code' in error || 'hint' in error || 'suggestions' in error)) {
      throw error
    }
    throw apiProcessError(error)
  }
}

export const downloadPDF = async (recipeData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/download-pdf`, recipeData, {
      responseType: 'blob'
    })
    return response.data
  } catch (error) {
    if (error.response && error.response.data instanceof Blob) {
      const text = await error.response.data.text()
      try {
        const json = JSON.parse(text)
        const err = new Error(
          json.message || 'We couldn’t build your PDF. Your recipe is still safe — try again in a moment.'
        )
        err.hint = json.hint || null
        err.code = json.code || 'pdf'
        throw err
      } catch (e) {
        if (e instanceof Error && e.code === 'pdf') throw e
        const err = new Error('We couldn’t download the PDF. Please try again.')
        err.hint = 'If this keeps happening, copy the recipe text instead.'
        throw err
      }
    }
    if (error instanceof Error && error.hint) throw error
    const err = new Error(error.message || 'Failed to download PDF.')
    err.hint = 'Check your connection and try the download again.'
    throw err
  }
}
