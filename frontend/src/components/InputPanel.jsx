import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  X,
  Flame,
  Leaf,
  Receipt,
  Clock,
  Mic,
  ScanSearch,
  Droplet,
  Activity,
  Scale,
  Carrot,
  Shield,
} from 'lucide-react'
import ImageUpload from './ImageUpload'
import IngredientSuggestions from './IngredientSuggestions'
import { fetchIngredientSuggestions, fetchIngredientMeta, detectIngredientsFromImage } from '../services/api'
import { readRecentIngredients, recordRecentIngredient } from '../lib/recentIngredients'
import { trackEvent } from '../services/analytics'

const slideUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (d = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], delay: d },
  }),
}

function ToggleCard({ icon: Icon, label, active, onClick, color }) {
  const activeColor = {
    green: 'border-emerald-500 bg-emerald-50 text-emerald-600',
    orange: 'border-food-primary bg-orange-50 text-food-primary',
    purple: 'border-purple-500 bg-purple-50 text-purple-600',
  }[color]

  const inactiveColor = 'border-slate-200 hover:border-slate-300 text-food-muted bg-white'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`relative flex items-center justify-center py-3 px-2 min-h-[48px] rounded-2xl border-2 transition-all duration-200 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-food-primary/25 ${active ? activeColor : inactiveColor}`}
      aria-pressed={active}
    >
      <div className="flex flex-col items-center gap-1.5 z-10">
        <Icon size={20} className={active ? '' : 'opacity-70'} />
        <span className={`text-[11px] font-bold uppercase tracking-wide ${active ? 'opacity-100' : 'opacity-60'}`}>
          {label}
        </span>
      </div>
    </motion.button>
  )
}

function SpiceLevelSelect({ level, setLevel }) {
  const levels = ['Low', 'Medium', 'High']
  
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-food-dark flex items-center gap-2">
        <Flame size={16} className="text-food-primary" />
        Spice Level
      </label>
      <div className="flex p-1 rounded-2xl bg-slate-100 border border-slate-200">
        {levels.map((lvl) => {
          const isActive = level === lvl
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevel(lvl)}
              className="relative flex-1 py-2.5 min-h-[44px] sm:min-h-0 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-food-primary/25 rounded-xl z-10 active:scale-[0.98] transition-transform"
            >
              {isActive && (
                <motion.div
                  layoutId="spice-level-bg"
                  className="absolute inset-0 rounded-xl bg-white shadow-sm border border-slate-200 z-0"
                />
              )}
              <span className={`relative z-10 block ${isActive ? 'text-food-primary' : 'text-food-muted hover:text-food-dark'}`}>
                {lvl}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const STATIC_SUGGESTIONS = [
  'onion', 'tomato', 'potato', 'egg', 'paneer', 'rice', 'garlic', 'ginger', 'bread', 'milk',
]

const INDIAN_STYLES = [
  'Gujarati',
  'Punjabi',
  'South Indian',
  'Street Food',
  'Bengali',
  'Rajasthani',
  'Healthy',
  'Breakfast',
]

const GLOBAL_STYLES = ['Italian', 'Chinese', 'Indo-Chinese', 'Mexican']

function umbrellaCuisineLabel(foodStyle, customTrimmed) {
  if (customTrimmed) return customTrimmed.slice(0, 50) || 'Indian'
  if (INDIAN_STYLES.includes(foodStyle)) return 'Indian'
  return (foodStyle || 'Indian').slice(0, 50)
}

const InputPanel = forwardRef(function InputPanel({ onGenerate, isGenerating }, ref) {
  const [ingredients, setIngredients] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [image, setImage] = useState(null)
  const [imageScanning, setImageScanning] = useState(false)
  const [imageScanError, setImageScanError] = useState(null)
  const [imageScanNote, setImageScanNote] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [ingredientMeta, setIngredientMeta] = useState(null)
  const [recentList, setRecentList] = useState(() => readRecentIngredients())
  const [listening, setListening] = useState(false)
  const [voiceHint, setVoiceHint] = useState(null)
  const suggestTimer = useRef(null)
  const recognitionRef = useRef(null)

  const [foodStyle, setFoodStyle] = useState('Gujarati')
  const [customRegional, setCustomRegional] = useState('')
  const isCustomRegional = foodStyle === '__custom__'

  const [spiceLevel, setSpiceLevel] = useState('Medium')
  const [budgetMode, setBudgetMode] = useState(false)
  const [healthMode, setHealthMode] = useState(false)
  const [quickMode, setQuickMode] = useState(false)
  const [lowOilMode, setLowOilMode] = useState(false)
  const [highProteinMode, setHighProteinMode] = useState(false)
  const [lowCalorieMode, setLowCalorieMode] = useState(false)
  const [moreVegMode, setMoreVegMode] = useState(false)
  const [vegOnlyMode, setVegOnlyMode] = useState(false)

  const addIngredientWord = useCallback((raw) => {
    const val = String(raw || '').trim().replace(/,$/, '')
    if (!val) return
    setIngredients((prev) => {
      if (prev.some((i) => i.toLowerCase() === val.toLowerCase())) return prev
      recordRecentIngredient(val)
      queueMicrotask(() => setRecentList(readRecentIngredients()))
      return [...prev, val]
    })
  }, [])

  useImperativeHandle(ref, () => ({
    addChip: (word) => addIngredientWord(word),
  }), [addIngredientWord])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchIngredientMeta()
        const data = res?.data
        if (!cancelled && data && (data.categories || data.pairings || data.popular)) {
          setIngredientMeta(data)
        }
      } catch {
        /* offline — UI falls back to API-only suggestions */
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (isGenerating) return
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetchIngredientSuggestions(inputValue.trim())
        const list = res?.data?.suggestions
        if (Array.isArray(list) && list.length) setSuggestions(list)
        else setSuggestions(STATIC_SUGGESTIONS)
      } catch {
        setSuggestions(STATIC_SUGGESTIONS)
      }
    }, 220)
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current)
    }
  }, [inputValue, isGenerating])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const startVoiceInput = () => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      setVoiceHint('Voice needs Chrome or Edge (Web Speech API).')
      return
    }
    if (listening || isGenerating) return
    setVoiceHint(null)
    const rec = new SR()
    recognitionRef.current = rec
    rec.lang = 'en-IN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript || ''
      const parts = text
        .split(/,|(?:\band\b)|(?:\bplus\b)|(?:\bwith\b)/i)
        .map((s) => s.trim())
        .filter(Boolean)
      setIngredients((prev) => {
        const next = [...prev]
        for (const p of parts) {
          if (!next.some((i) => i.toLowerCase() === p.toLowerCase())) {
            recordRecentIngredient(p)
            next.push(p)
          }
        }
        return next
      })
      setRecentList(readRecentIngredients())
      if (parts.length) {
        trackEvent('voice_input_used', { phrase_count: parts.length })
      }
    }
    rec.onerror = (ev) => {
      setVoiceHint(ev.error === 'not-allowed' ? 'Allow microphone access to use voice.' : 'Voice capture failed.')
      setListening(false)
    }
    rec.onend = () => setListening(false)
    setListening(true)
    try {
      rec.start()
    } catch {
      setVoiceHint('Could not start microphone.')
      setListening(false)
    }
  }

  const handleAddIngredient = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = inputValue.trim().replace(/,$/, '')
      if (val) addIngredientWord(val)
      setInputValue('')
    }
  }

  const removeIngredient = (ingredientToRemove) => {
    setIngredients(ingredients.filter(ing => ing !== ingredientToRemove))
  }

  const handleImageFile = useCallback((file) => {
    setImage(file)
    setImageScanError(null)
    setImageScanNote(null)
    if (file && file instanceof Blob) {
      trackEvent('image_selected', {
        mime: file.type || 'unknown',
        size_kb: Math.round((file.size || 0) / 1024),
      })
    }
  }, [])

  const handleScanImage = async () => {
    if (!image || imageScanning || isGenerating) return
    setImageScanning(true)
    setImageScanError(null)
    setImageScanNote(null)
    trackEvent('image_detect_requested', {})
    try {
      const res = await detectIngredientsFromImage(image)
      if (!res?.success) {
        throw new Error(res?.message || 'Detection failed.')
      }
      const list = res?.data?.ingredients
      if (!Array.isArray(list) || !list.length) {
        throw new Error('No ingredients returned. Try a clearer food photo.')
      }
      setIngredients((prev) => {
        const seen = new Set(prev.map((x) => x.toLowerCase()))
        const merged = [...prev]
        for (const item of list) {
          const t = String(item).trim()
          if (!t) continue
          const k = t.toLowerCase()
          if (seen.has(k)) continue
          seen.add(k)
          recordRecentIngredient(t)
          merged.push(t)
        }
        return merged
      })
      setRecentList(readRecentIngredients())
      const note = res?.data?.note
      setImageScanNote(
        note ||
          `Added ${list.length} ingredient(s) from your photo — edit chips above if needed.`
      )
      trackEvent('image_detect_succeeded', { detected_count: list.length })
    } catch (err) {
      trackEvent('image_detect_failed', {
        code: err.code || 'unknown',
        message: (err.message || 'detect_error').slice(0, 240),
      })
      const extra = err.hint ? ` ${err.hint}` : ''
      setImageScanError((err.message || 'Could not read ingredients from this image.') + extra)
    } finally {
      setImageScanning(false)
    }
  }

  const handleGenerate = () => {
    if (isGenerating) return
    const customTrimmed = customRegional.trim()
    const styleResolved = (isCustomRegional ? customTrimmed : foodStyle).slice(0, 50) || 'Gujarati'
    const cuisineResolved = umbrellaCuisineLabel(isCustomRegional ? '' : foodStyle, isCustomRegional ? customTrimmed : '')
    const payload = {
      ingredients: [...ingredients, inputValue.trim()].filter(Boolean),
      cuisine: cuisineResolved,
      food_style: styleResolved,
      is_veg: vegOnlyMode,
      preferences: {
        spice_level: spiceLevel.toLowerCase(),
        budget_mode: budgetMode,
        health_mode: healthMode,
        quick_mode: quickMode,
        oil_level: lowOilMode ? 'low' : 'normal',
        high_protein: highProteinMode,
        low_calorie: lowCalorieMode,
        more_vegetables: moreVegMode,
      },
    }
    if (onGenerate) {
      onGenerate(payload)
    }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* ── Header ── */}
      <motion.div custom={0.1} variants={slideUp} initial="hidden" animate="visible">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-food-primary" />
          <span className="text-xs font-black tracking-widest uppercase text-food-primary">
            Your kitchen
          </span>
        </div>
        <h2 className="text-3xl font-extrabold text-food-dark leading-tight">
          What do you have? 🍳
        </h2>
        <p className="mt-2 text-sm text-food-muted font-medium leading-relaxed">
          Type an ingredient and press{' '}
          <kbd className="px-1.5 py-0.5 bg-white rounded-md text-xs border border-slate-200 shadow-sm font-bold text-food-dark">Enter</kbd>
          {' '}— or tap ideas below, speak, or scan a photo.
        </p>
      </motion.div>

      <motion.div custom={0.15} variants={slideUp} initial="hidden" animate="visible" className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

      {/* ── Inputs Layout ── */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1 pb-4 hide-scrollbar">
        
        {/* Chips Input */}
        <motion.div custom={0.2} variants={slideUp} initial="hidden" animate="visible" className="flex flex-col gap-3">
          <label htmlFor="ingredients-input" className="text-[10px] font-black uppercase tracking-widest text-food-muted">
            Ingredients
          </label>
          <div className="flex flex-wrap gap-2 w-full min-h-[52px] bg-white border-2 border-slate-200 rounded-2xl p-2.5 shadow-sm shadow-orange-500/[0.04] focus-within:border-food-primary/55 focus-within:ring-4 focus-within:ring-food-primary/12 focus-within:shadow-md transition-all duration-200">
            <AnimatePresence>
              {ingredients.map(ing => (
                <motion.span
                  key={ing}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-orange-50 to-amber-50/80 text-food-primary border border-orange-200/90 rounded-full text-sm font-bold shadow-sm"
                >
                  {ing}
                  <button 
                    type="button"
                    onClick={() => removeIngredient(ing)}
                    className="hover:bg-orange-200/90 rounded-full p-1 min-w-[28px] min-h-[28px] inline-flex items-center justify-center transition-colors"
                    aria-label={`Remove ${ing}`}
                  >
                    <X size={14} />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
            <input
              id="ingredients-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleAddIngredient}
              disabled={isGenerating}
              placeholder={ingredients.length === 0 ? "e.g. potato, onion, tomato..." : "add more..."}
              className="flex-1 min-w-[120px] min-h-[44px] bg-transparent outline-none text-sm text-food-dark font-semibold placeholder-slate-400 px-2 py-1.5"
            />
            <button
              type="button"
              onClick={startVoiceInput}
              disabled={isGenerating || listening}
              title={listening ? 'Listening…' : 'Speak ingredients'}
              aria-label={listening ? 'Listening' : 'Voice input'}
              className={`shrink-0 flex items-center justify-center w-11 h-11 rounded-xl border-2 transition-all active:scale-95 ${
                listening
                  ? 'border-food-primary bg-orange-50 text-food-primary animate-pulse'
                  : 'border-slate-200 text-food-muted hover:border-food-primary/40 hover:text-food-primary hover:bg-orange-50/50 bg-white'
              }`}
            >
              <Mic size={18} />
            </button>
          </div>
          {voiceHint && (
            <p className="text-xs text-amber-700 font-medium px-0.5" role="status">
              {voiceHint}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-food-muted">
              Ideas for you
            </span>
            <IngredientSuggestions
              ingredients={ingredients}
              inputValue={inputValue}
              apiSuggestions={suggestions}
              meta={ingredientMeta}
              recentList={recentList}
              onPick={(label, meta) => {
                trackEvent('suggestion_clicked', {
                  suggestion: label,
                  section: meta?.section,
                  category_id: meta?.category_id,
                })
                addIngredientWord(label)
              }}
              disabled={isGenerating}
            />
          </div>
        </motion.div>

        {/* Image Upload + vision scan */}
        <motion.div custom={0.25} variants={slideUp} initial="hidden" animate="visible" className="flex flex-col gap-3">
          <ImageUpload onFileSelect={handleImageFile} />
          {image && (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-xs font-bold text-food-dark">
                Photo ready — run AI vision to fill ingredient chips (you can edit them before Generate).
              </p>
              <button
                type="button"
                onClick={handleScanImage}
                disabled={isGenerating || imageScanning}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-food-primary/40 bg-white py-2.5 px-3 text-sm font-bold text-food-primary hover:bg-orange-50 transition-colors disabled:opacity-60"
              >
                <ScanSearch size={18} className={imageScanning ? 'animate-pulse' : ''} />
                {imageScanning ? 'Analyzing photo…' : 'Detect ingredients from photo'}
              </button>
              {imageScanError && (
                <p className="text-xs font-semibold text-red-600" role="alert">
                  {imageScanError}
                </p>
              )}
              {imageScanNote && (
                <p className="text-xs font-medium text-emerald-800" role="status">
                  {imageScanNote}
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Filters Section ── */}
        <motion.div custom={0.3} variants={slideUp} initial="hidden" animate="visible" className="flex flex-col gap-6 pt-2">
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-food-dark">Cuisine style</label>
            <p className="text-xs text-food-muted font-medium -mt-1">
              Regional flavors for your ingredients — Indian regions and a few international profiles.
            </p>
            <select
              value={foodStyle}
              onChange={(e) => setFoodStyle(e.target.value)}
              disabled={isGenerating}
              className="w-full bg-white border-2 border-slate-200 rounded-2xl p-3 text-sm font-bold text-food-dark appearance-none focus:outline-none focus:border-food-primary/50 focus:ring-4 focus:ring-food-primary/10 transition-colors cursor-pointer"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%232D3748%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpolyline points=%226 9 12 15 18 9%22%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
            >
              <optgroup label="India">
                {INDIAN_STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
              <optgroup label="International">
                {GLOBAL_STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
              <option value="__custom__">Custom region…</option>
            </select>
          </div>

          {isCustomRegional && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex flex-col gap-2 -mt-2"
            >
              <input
                type="text"
                value={customRegional}
                onChange={(e) => setCustomRegional(e.target.value)}
                disabled={isGenerating}
                placeholder="e.g. Thai, Goan, Korean"
                className="w-full bg-white border-2 border-slate-200 rounded-2xl p-3 text-sm text-food-dark font-bold focus:outline-none focus:border-food-primary/50 focus:ring-4 focus:ring-food-primary/10 transition-colors"
                maxLength={50}
                autoFocus
              />
            </motion.div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SpiceLevelSelect level={spiceLevel} setLevel={setSpiceLevel} />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-food-dark flex items-center gap-2">
                <Shield size={16} className="text-emerald-600" />
                Diet
              </label>
              <button
                type="button"
                onClick={() => { if (!isGenerating) setVegOnlyMode(!vegOnlyMode) }}
                disabled={isGenerating}
                className={`w-full flex items-center justify-center gap-2 py-3 px-3 rounded-2xl border-2 text-sm font-bold transition-all ${
                  vegOnlyMode
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-food-muted hover:border-slate-300'
                }`}
              >
                Vegetarian only
              </button>
            </div>
          </div>

          {/* Toggle Modes */}
          <div className="grid grid-cols-3 gap-3">
            <ToggleCard
              icon={Receipt}
              label="Budget"
              active={budgetMode}
              onClick={() => { if (!isGenerating) setBudgetMode(!budgetMode) }}
              color="green"
            />
            <ToggleCard
              icon={Leaf}
              label="Healthy"
              active={healthMode}
              onClick={() => { if (!isGenerating) setHealthMode(!healthMode) }}
              color="green"
            />
            <ToggleCard
              icon={Clock}
              label="Quick"
              active={quickMode}
              onClick={() => { if (!isGenerating) setQuickMode(!quickMode) }}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ToggleCard
              icon={Droplet}
              label="Low oil"
              active={lowOilMode}
              onClick={() => { if (!isGenerating) setLowOilMode(!lowOilMode) }}
              color="orange"
            />
            <ToggleCard
              icon={Activity}
              label="High protein"
              active={highProteinMode}
              onClick={() => { if (!isGenerating) setHighProteinMode(!highProteinMode) }}
              color="orange"
            />
            <ToggleCard
              icon={Scale}
              label="Low calorie"
              active={lowCalorieMode}
              onClick={() => { if (!isGenerating) setLowCalorieMode(!lowCalorieMode) }}
              color="green"
            />
            <ToggleCard
              icon={Carrot}
              label="More veg"
              active={moreVegMode}
              onClick={() => { if (!isGenerating) setMoreVegMode(!moreVegMode) }}
              color="green"
            />
          </div>

        </motion.div>
      </div>

      {/* ── Generate Button ── */}
      <motion.div custom={0.4} variants={slideUp} initial="hidden" animate="visible" className="pt-2 mt-auto">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="btn-primary w-full text-base py-4 min-h-[52px] touch-manipulation"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Kitchen magic in progress…</span>
            </>
          ) : (
            <>
              <Sparkles size={20} className="shrink-0" />
              <span>Cook my recipe</span>
            </>
          )}
        </button>
      </motion.div>
    </div>
  )
})

export default InputPanel
