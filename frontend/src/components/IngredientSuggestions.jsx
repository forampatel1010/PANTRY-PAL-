import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Sparkles, Clock, TrendingUp, Layers, Search } from 'lucide-react'

const chipSpring = { type: 'spring', stiffness: 420, damping: 30 }

function SuggestionChip({ label, onPick, pickMeta, disabled, subtle }) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={chipSpring}
      disabled={disabled}
      onClick={() => onPick(label, pickMeta)}
      className={`shrink-0 snap-start px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 inline-flex items-center rounded-full text-xs font-bold border transition-colors active:scale-[0.98] disabled:opacity-45
        ${subtle
          ? 'border-slate-200/90 bg-white text-food-dark hover:border-food-primary/45 hover:bg-orange-50/90 hover:text-food-primary'
          : 'border-food-primary/35 bg-orange-50/80 text-food-primary hover:bg-orange-100 hover:border-food-primary/55'}`}
    >
      {label}
    </motion.button>
  )
}

function SectionHeader({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon size={14} className="text-food-primary shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-widest text-food-muted truncate">{title}</span>
      {hint && <span className="text-[10px] text-slate-400 font-medium hidden sm:inline truncate">{hint}</span>}
    </div>
  )
}

function ChipRow({ children }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x snap-mandatory hide-scrollbar scroll-smooth">
      {children}
    </div>
  )
}

function excludeSet(ingredients, extraLower = '') {
  const s = new Set(ingredients.map((i) => i.toLowerCase()))
  if (extraLower && extraLower.trim()) s.add(extraLower.trim().toLowerCase())
  return s
}

function filterFresh(items, excluded) {
  const out = []
  const seen = new Set()
  for (const raw of items) {
    const t = String(raw || '').trim().toLowerCase()
    if (!t || excluded.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Last comma-separated fragment (what user is typing). */
function lastFragment(inputValue) {
  const parts = String(inputValue || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

function collectContextSuggestions(pairings, ingredients, tokenLower, vocabSet) {
  const out = []
  const seen = new Set()

  const push = (arr) => {
    for (const x of arr || []) {
      const t = String(x).trim().toLowerCase()
      if (!t || seen.has(t)) continue
      if (vocabSet && !vocabSet.has(t)) continue
      seen.add(t)
      out.push(t)
    }
  }

  for (const ing of ingredients) {
    const k = String(ing).trim().toLowerCase()
    if (k && pairings[k]) push(pairings[k])
  }

  if (tokenLower && pairings[tokenLower]) {
    push(pairings[tokenLower])
  }

  if (tokenLower.length >= 2 && pairings) {
    for (const key of Object.keys(pairings)) {
      if (key.startsWith(tokenLower) && key !== tokenLower) {
        push(pairings[key])
      }
    }
  }

  return out
}

export default function IngredientSuggestions({
  ingredients,
  inputValue,
  apiSuggestions,
  meta,
  recentList,
  onPick,
  disabled,
}) {
  const [openCats, setOpenCats] = useState(true)

  const excluded = useMemo(
    () => excludeSet(ingredients, lastFragment(inputValue)),
    [ingredients, inputValue]
  )

  const vocabSet = useMemo(() => {
    if (!meta?.categories) return null
    const s = new Set()
    for (const c of meta.categories) {
      for (const w of c.items || []) s.add(String(w).toLowerCase())
    }
    return s
  }, [meta])

  const pairings = meta?.pairings && typeof meta.pairings === 'object' ? meta.pairings : {}

  const token = lastFragment(inputValue)
  const tokenLower = token.toLowerCase()
  const isTyping = Boolean(token.trim())

  const { matches, contextItems, recentItems, popularItems } = useMemo(() => {
    const used = new Set(excluded)

    const takeFresh = (items, limit) => {
      const out = []
      for (const raw of items) {
        const t = String(raw || '').trim().toLowerCase()
        if (!t || used.has(t)) continue
        used.add(t)
        out.push(t)
        if (out.length >= limit) break
      }
      return out
    }

    const apiRaw = Array.isArray(apiSuggestions) ? apiSuggestions : []
    const matches = takeFresh(apiRaw, 12)

    const ctx = collectContextSuggestions(pairings, ingredients, tokenLower, vocabSet)
    const contextItems = takeFresh(ctx, 14)

    const recentRaw = Array.isArray(recentList) ? recentList : []
    const recentItems = takeFresh(recentRaw, 10)

    const popRaw = Array.isArray(meta?.popular) ? meta.popular : []
    const popularItems = takeFresh(popRaw, 10)

    return { matches, contextItems, recentItems, popularItems }
  }, [apiSuggestions, excluded, pairings, ingredients, tokenLower, vocabSet, recentList, meta])

  const hasMeta = Boolean(meta?.categories?.length)

  return (
    <div className="flex flex-col gap-4">
      {matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader
            icon={Search}
            title={isTyping ? 'As you type' : 'Quick picks'}
            hint={isTyping ? 'Prefix & fuzzy matches' : 'Tap to add'}
          />
          <ChipRow>
            <AnimatePresence mode="popLayout">
              {matches.map((s) => (
                <SuggestionChip
                  key={`m-${s}`}
                  label={s}
                  pickMeta={{ section: isTyping ? 'as_you_type' : 'quick_picks' }}
                  onPick={onPick}
                  disabled={disabled}
                  subtle
                />
              ))}
            </AnimatePresence>
          </ChipRow>
        </div>
      )}

      {contextItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader icon={Sparkles} title="Goes well with" hint="From your picks & typing" />
          <ChipRow>
            <AnimatePresence mode="popLayout">
              {contextItems.map((s) => (
                <SuggestionChip
                  key={`c-${s}`}
                  label={s}
                  pickMeta={{ section: 'goes_well_with' }}
                  onPick={onPick}
                  disabled={disabled}
                />
              ))}
            </AnimatePresence>
          </ChipRow>
        </div>
      )}

      {(recentItems.length > 0 || popularItems.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recentItems.length > 0 && (
            <div className="flex flex-col gap-2 min-w-0">
              <SectionHeader icon={Clock} title="Recent" />
              <ChipRow>
                <AnimatePresence mode="popLayout">
                  {recentItems.map((s) => (
                    <SuggestionChip
                      key={`r-${s}`}
                      label={s}
                      pickMeta={{ section: 'recent' }}
                      onPick={onPick}
                      disabled={disabled}
                      subtle
                    />
                  ))}
                </AnimatePresence>
              </ChipRow>
            </div>
          )}
          {popularItems.length > 0 && (
            <div className="flex flex-col gap-2 min-w-0">
              <SectionHeader icon={TrendingUp} title="Popular" />
              <ChipRow>
                <AnimatePresence mode="popLayout">
                  {popularItems.map((s) => (
                    <SuggestionChip
                      key={`p-${s}`}
                      label={s}
                      pickMeta={{ section: 'popular' }}
                      onPick={onPick}
                      disabled={disabled}
                      subtle
                    />
                  ))}
                </AnimatePresence>
              </ChipRow>
            </div>
          )}
        </div>
      )}

      {hasMeta && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenCats((o) => !o)}
            className="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-left hover:bg-white/60 transition-colors"
            aria-expanded={openCats}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Layers size={14} className="text-food-primary shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-food-muted">
                Browse by category
              </span>
            </div>
            <ChevronDown
              size={16}
              className={`text-food-muted shrink-0 transition-transform ${openCats ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {openCats && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 px-3 pb-3 pt-0">
                  {meta.categories.map((cat) => {
                    const blocked = new Set([
                      ...excluded,
                      ...matches,
                      ...contextItems,
                      ...recentItems,
                      ...popularItems,
                    ])
                    const items = filterFresh(cat.items || [], blocked).slice(0, 16)
                    if (!items.length) return null
                    return (
                      <div key={cat.id} className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-[11px] font-bold text-food-dark/80 pl-0.5">{cat.label}</span>
                        <ChipRow>
                          <AnimatePresence mode="popLayout">
                            {items.map((s) => (
                              <SuggestionChip
                                key={`${cat.id}-${s}`}
                                label={s}
                                pickMeta={{ section: 'category', category_id: cat.id }}
                                onPick={onPick}
                                disabled={disabled}
                                subtle
                              />
                            ))}
                          </AnimatePresence>
                        </ChipRow>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
