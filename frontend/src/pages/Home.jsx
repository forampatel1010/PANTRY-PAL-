import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UtensilsCrossed, AlertCircle, ChefHat } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import Layout from '../components/Layout'
import InputPanel from '../components/InputPanel'
import UserFacingErrorBanner from '../components/UserFacingErrorBanner'
import RecipeCard from '../components/RecipeCard'
import IngredientsCard from '../components/IngredientsCard'
import StepsCard from '../components/StepsCard'
import TipsCard from '../components/TipsCard'
import LinksCard from '../components/LinksCard'
import { generateRecipe, regenerateRecipe, downloadPDF } from '../services/api'
import { trackEvent, inferDietType } from '../services/analytics'

const CLIENT_EMPTY_SUGGESTIONS = ['tomato', 'onion', 'egg', 'rice', 'paneer', 'bread']

function generationSummary(data) {
  const d = data || {}
  const fb = Boolean(d.fallback)
  const opts = Array.isArray(d.recipes) ? d.recipes : []
  const scores = opts
    .map((o) => o.confidence_score)
    .filter((x) => typeof x === 'number')
  const conf = scores.length
    ? Math.max(...scores)
    : typeof d.confidence_score === 'number'
      ? d.confidence_score
      : null
  return {
    fallback: fb,
    confidence: conf,
    option_count: opts.length || (d.recipe ? 1 : 0),
    cached: Boolean(d.cached),
  }
}

function buildRecipeOptionsFromApiData(data) {
  if (!data) return []
  const raw = data.recipes
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item, idx) => ({
      ...item.recipe,
      _confidence: item.confidence_score ?? null,
      _optionLabel: idx === 0 ? 'Best pick' : `Alternative ${idx + 1}`,
    }))
  }
  if (data.recipe) {
    return [
      {
        ...data.recipe,
        _confidence: data.confidence_score ?? null,
        _optionLabel: 'Recipe',
      },
    ]
  }
  return []
}

/* ── Right Panel — Recipe Preview Container ────────── */
function RecipePreview({ loading, error, recipeOptions, onRegenerate, onDownloadPDF, onPickSuggestion }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center gap-6">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="relative w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center border-4 border-orange-100"
        >
          <span className="text-5xl" role="img" aria-label="cooking">🍳</span>
        </motion.div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex flex-col gap-2"
        >
          <h2 className="text-2xl font-bold text-food-dark">
            Cooking your recipes…
          </h2>
          <p className="text-food-muted font-medium">
            RasoiAI is preparing a few tasty options for you.
          </p>
        </motion.div>
      </div>
    )
  }

  if (error) {
    const msg = typeof error === 'string' ? error : error?.message
    const hint = typeof error === 'object' ? error?.hint : null
    const suggestions = typeof error === 'object' && Array.isArray(error?.suggestions) ? error.suggestions : []
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center gap-5 px-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-amber-50 border border-amber-100 shadow-sm">
            <AlertCircle size={36} className="text-amber-600" />
          </div>
        </motion.div>
        <div className="flex flex-col gap-3 max-w-lg mx-auto">
          <p className="text-2xl font-bold text-food-dark leading-tight">
            {msg || 'Something went wrong'}
          </p>
          {hint && (
            <p className="text-food-muted text-base font-medium leading-relaxed">
              {hint}
            </p>
          )}
          {suggestions.length > 0 && onPickSuggestion && (
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onPickSuggestion(s)}
                  className="rounded-full border border-food-primary/30 bg-white px-3 py-1.5 text-xs font-bold text-food-primary hover:bg-orange-50"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 font-medium pt-2">
            Tip: check the yellow help box on the left for the same guidance.
          </p>
        </div>
      </div>
    )
  }

  if (recipeOptions && recipeOptions.length > 0) {
    return (
      <div className="space-y-12 h-full overflow-y-auto pr-2 pb-8 hide-scrollbar relative">
        <p className="text-sm font-bold text-food-muted px-1">
          {recipeOptions.length > 1
            ? `${recipeOptions.length} recipe ideas — compare below. Each card has its own PDF download.`
            : 'Your recipe is ready.'}
        </p>
        <div className="flex flex-col gap-14">
          {recipeOptions.map((recipe, idx) => (
            <div
              key={`${recipe.recipe_name || 'r'}-${idx}`}
              className="space-y-6 border-b border-slate-200/80 pb-14 last:border-0 last:pb-4"
            >
              <RecipeCard
                recipe={recipe}
                optionBadge={recipe._optionLabel}
                onRegenerate={onRegenerate}
                onDownloadPDF={() => onDownloadPDF(recipe)}
              />
              <IngredientsCard recipe={recipe} />
              <StepsCard recipe={recipe} />
              <TipsCard recipe={recipe} />
              <LinksCard recipe={recipe} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Hero Section (Empty state)
  return (
    <div className="relative w-full h-full min-h-[500px] rounded-3xl overflow-hidden shadow-lg flex items-center justify-center group flex-col">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=1600&auto=format&fit=crop")' }}
      />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#000000cc] via-[#00000066] to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="relative z-20 text-center px-6 flex flex-col items-center mt-12"
      >
        <div className="w-20 h-20 mb-6 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-2xl">
          <ChefHat size={36} className="text-white drop-shadow-md" />
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight drop-shadow-xl">
          Cook Smart.<br />
          <span className="text-food-secondary">Eat Delicious.</span>
        </h1>
        <p className="mt-6 text-lg text-white/90 max-w-sm mx-auto font-medium drop-shadow-md">
          List what you have on the left, and let RasoiAI handle the rest.
        </p>
      </motion.div>
    </div>
  )
}

function saveToHistory(recipeToSave) {
  try {
    const rawHistory = localStorage.getItem('rasoi_history')
    let history = rawHistory ? JSON.parse(rawHistory) : []

    const exists = history.some(
      (r) => r.recipe_name === recipeToSave.recipe_name && r.time_required === recipeToSave.time_required
    )
    if (!exists) {
      const entry = {
        ...recipeToSave,
        _id: recipeToSave._id ?? Date.now(),
        _date: recipeToSave._date ?? new Date().toISOString(),
      }
      history = [entry, ...history].slice(0, 50)
      localStorage.setItem('rasoi_history', JSON.stringify(history))
    }
  } catch (e) {
    console.error('Failed to save history', e)
  }
}

function errorToObject(err) {
  return {
    message: err?.message || 'Something went wrong.',
    hint: err?.hint || null,
    suggestions: Array.isArray(err?.suggestions) ? err.suggestions : [],
    code: err?.code || null,
  }
}

export default function Home() {
  const [recipeOptions, setRecipeOptions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [currentPayload, setCurrentPayload] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)
  const inputPanelRef = useRef(null)
  const lastViewedKey = useRef(null)

  const location = useLocation()

  useEffect(() => {
    if (location.state?.loadedRecipe) {
      const r = location.state.loadedRecipe
      setRecipeOptions([
        {
          ...r,
          _confidence: r._confidence ?? null,
          _optionLabel: 'Saved recipe',
        },
      ])
      setActionError(null)
      setError(null)
      window.history.replaceState({}, document.title)
      document.getElementById('preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location])

  useEffect(() => {
    if (!recipeOptions || recipeOptions.length === 0) return
    const key = recipeOptions.map((r) => r.recipe_name || '').join('|')
    if (lastViewedKey.current === key) return
    lastViewedKey.current = key
    trackEvent('recipe_viewed', {
      option_count: recipeOptions.length,
      recipe_names: recipeOptions.map((r) => r.recipe_name).filter(Boolean).slice(0, 8),
    })
  }, [recipeOptions])

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  const focusIngredientsInput = () => {
    document.getElementById('ingredients-input')?.focus()
    document.getElementById('input-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handlePickSuggestion = (word) => {
    trackEvent('suggestion_clicked', { suggestion: word, section: 'error_banner' })
    inputPanelRef.current?.addChip?.(word)
    focusIngredientsInput()
  }

  const handleGenerateRecipe = async (payload) => {
    const ingCount = (payload.ingredients || []).filter(Boolean).length
    if (!ingCount) {
      trackEvent('client_validation_error', { code: 'client_empty', field: 'ingredients' })
      const block = {
        message: 'We need at least one food ingredient to cook with.',
        hint: 'Try typing things you’d find in a kitchen — vegetables, eggs, dairy, rice, or bread. You can also use voice, smart chips, or scan a food photo.',
        suggestions: CLIENT_EMPTY_SUGGESTIONS,
        code: 'client_empty',
      }
      setActionError(block)
      setError(block)
      return
    }

    setLoading(true)
    setError(null)
    setActionError(null)
    setRecipeOptions(null)
    setCurrentPayload(payload)

    setTimeout(() => {
      document.getElementById('preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)

    const ings = (payload.ingredients || []).filter(Boolean)
    trackEvent('recipe_requested', {
      ingredient_count: ings.length,
      ingredients: ings.slice(0, 20),
      diet_type: inferDietType(ings),
      cuisine: payload.cuisine || null,
    })

    try {
      const response = await generateRecipe(payload)
      const options = buildRecipeOptionsFromApiData(response?.data)
      if (!options.length) {
        const e = new Error(
          response?.message || 'The server replied, but we could not read any recipes from it.'
        )
        e.hint = 'Try again in a moment, or slightly change your ingredient list.'
        e.code = 'empty_recipe_response'
        throw e
      }
      const gen = generationSummary(response?.data)
      trackEvent('recipe_succeeded', {
        ingredient_count: ings.length,
        ingredients: ings.slice(0, 20),
        diet_type: inferDietType(ings),
        cuisine: payload.cuisine || null,
        confidence: gen.confidence,
        fallback: gen.fallback,
        option_count: gen.option_count,
        cached: gen.cached,
      })
      setRecipeOptions(options)
      const batchId = Date.now()
      options.forEach((r, i) => saveToHistory({ ...r, _batchId: batchId, _id: batchId + i }))
    } catch (err) {
      const o = errorToObject(err)
      trackEvent('recipe_failed', {
        code: o.code || err.code || 'unknown',
        message: (o.message || '').slice(0, 280),
      })
      setError(o)
      setActionError(o)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async (removeIngredient) => {
    if (!currentPayload) return

    setLoading(true)
    setError(null)
    setActionError(null)

    document.getElementById('preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    trackEvent('regenerate_requested', { remove_ingredient: removeIngredient })

    try {
      const response = await regenerateRecipe(currentPayload, removeIngredient)
      const options = buildRecipeOptionsFromApiData(response?.data)
      if (!options.length) {
        const e = new Error(response?.message || 'Regeneration did not return usable recipes.')
        e.hint = 'Try removing a different ingredient, or start a fresh generate from the left panel.'
        e.code = 'regenerate_empty_response'
        throw e
      }
      const gen = generationSummary(response?.data)
      const newIngredients = currentPayload.ingredients.filter(
        (i) => i.toLowerCase() !== removeIngredient.toLowerCase()
      )
      trackEvent('recipe_succeeded', {
        ingredient_count: newIngredients.length,
        ingredients: newIngredients.slice(0, 20),
        diet_type: inferDietType(newIngredients),
        cuisine: currentPayload.cuisine || null,
        confidence: gen.confidence,
        fallback: gen.fallback,
        option_count: gen.option_count,
        cached: gen.cached,
        via: 'regenerate',
      })
      setRecipeOptions(options)
      const batchId = Date.now()
      options.forEach((r, i) => saveToHistory({ ...r, _batchId: batchId, _id: batchId + i }))
      showToast(`Ingredient '${removeIngredient}' removed!`)

      setCurrentPayload({ ...currentPayload, ingredients: newIngredients })
    } catch (err) {
      const o = errorToObject(err)
      trackEvent('recipe_failed', {
        code: o.code || err.code || 'unknown',
        message: (o.message || '').slice(0, 280),
        via: 'regenerate',
      })
      setError(o)
      setActionError(o)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async (recipe) => {
    if (!recipe) return

    showToast('Generating PDF...', 'success')

    try {
      const blob = await downloadPDF(recipe)
      const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${recipe.recipe_name || 'recipe'}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)

      showToast('PDF downloaded!', 'success')
      trackEvent('pdf_download_succeeded', {
        recipe_name: (recipe.recipe_name || 'recipe').slice(0, 120),
      })
    } catch (err) {
      trackEvent('pdf_failed', {
        code: err.code || 'pdf_error',
        message: (err.message || 'pdf_failed').slice(0, 240),
      })
      const msg = err?.hint ? `${err.message} — ${err.hint}` : err.message
      showToast(msg || 'PDF download failed.', 'error')
    }
  }

  const topBanner =
    actionError && !loading ? (
      <UserFacingErrorBanner
        message={actionError.message}
        hint={actionError.hint}
        suggestions={actionError.suggestions}
        onDismiss={() => {
          setActionError(null)
        }}
        onRetry={
          actionError.code === 'client_empty'
            ? () => {
                setActionError(null)
                setError(null)
                focusIngredientsInput()
              }
            : currentPayload
              ? () => {
                  setActionError(null)
                  setError(null)
                  handleGenerateRecipe(currentPayload)
                }
              : null
        }
        onPickSuggestion={handlePickSuggestion}
      />
    ) : null

  return (
    <>
      <Layout
        topBanner={topBanner}
        leftPanel={<InputPanel ref={inputPanelRef} onGenerate={handleGenerateRecipe} isGenerating={loading} />}
        rightPanel={
          <RecipePreview
            loading={loading}
            error={error}
            recipeOptions={recipeOptions}
            onRegenerate={handleRegenerate}
            onDownloadPDF={handleDownloadPDF}
            onPickSuggestion={handlePickSuggestion}
          />
        }
      />

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 right-6 px-6 py-4 rounded-2xl shadow-xl z-[100] flex items-center gap-3 border ${
              toastMessage.type === 'error'
                ? 'bg-white border-red-200 text-red-600'
                : 'bg-white border-emerald-200 text-emerald-600'
            }`}
          >
            {toastMessage.type === 'error' ? <AlertCircle size={20} /> : <UtensilsCrossed size={20} />}
            <span className="font-bold text-sm tracking-wide text-food-dark">{toastMessage.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
