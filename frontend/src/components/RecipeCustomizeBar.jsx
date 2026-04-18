import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidersHorizontal, ChevronDown, Sparkles } from 'lucide-react'

const SPICES = ['Low', 'Medium', 'High']

function SpiceRow({ level, setLevel, disabled }) {
  return (
    <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200">
      {SPICES.map((lvl) => {
        const isActive = level === lvl
        return (
          <button
            key={lvl}
            type="button"
            disabled={disabled}
            onClick={() => setLevel(lvl)}
            className="relative flex-1 py-2 text-xs font-bold focus:outline-none z-10 disabled:opacity-50"
          >
            {isActive && (
              <div className="absolute inset-0 rounded-lg bg-white shadow-sm border border-slate-200 z-0" />
            )}
            <span className={`relative z-10 ${isActive ? 'text-food-primary' : 'text-food-muted'}`}>{lvl}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function RecipeCustomizeBar({ disabled, preferencesSnapshot, onApply }) {
  const [open, setOpen] = useState(false)
  const [spiceLevel, setSpiceLevel] = useState('Medium')
  const [lowOil, setLowOil] = useState(false)
  const [quick, setQuick] = useState(false)
  const [highProtein, setHighProtein] = useState(false)
  const [lowCal, setLowCal] = useState(false)
  const [moreVeg, setMoreVeg] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const p = preferencesSnapshot || {}
    const s = (p.spice_level || 'medium').toLowerCase()
    if (s === 'low' || s === 'medium' || s === 'high') {
      setSpiceLevel(s.charAt(0).toUpperCase() + s.slice(1))
    }
    setLowOil(p.oil_level === 'low')
    setQuick(!!p.quick_mode)
    setHighProtein(!!p.high_protein)
    setLowCal(!!p.low_calorie)
    setMoreVeg(!!p.more_vegetables)
  }, [preferencesSnapshot])

  const handleApply = () => {
    if (!onApply || disabled) return
    onApply({
      modification_request: notes.trim() || undefined,
      preferencesPatch: {
        spice_level: spiceLevel.toLowerCase(),
        oil_level: lowOil ? 'low' : 'normal',
        quick_mode: quick,
        high_protein: highProtein,
        low_calorie: lowCal,
        more_vegetables: moreVeg,
      },
    })
    setNotes('')
  }

  return (
    <div className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/90 to-white overflow-hidden">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/50 transition-colors disabled:opacity-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal size={18} className="text-food-primary shrink-0" />
          <span className="text-sm font-extrabold text-food-dark truncate">Modify this recipe</span>
        </div>
        <ChevronDown size={18} className={`text-food-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 flex flex-col gap-4 border-t border-orange-100/80">
              <p className="text-xs text-food-muted font-medium leading-relaxed">
                Tune taste and nutrition — RasoiAI will rebuild this card using your pantry chips and the style you picked on the left.
              </p>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-food-muted">Spice</span>
                <SpiceRow level={spiceLevel} setLevel={setSpiceLevel} disabled={disabled} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniToggle label="Low oil" active={lowOil} onClick={() => setLowOil(!lowOil)} disabled={disabled} />
                <MiniToggle label="Quick" active={quick} onClick={() => setQuick(!quick)} disabled={disabled} />
                <MiniToggle label="High protein" active={highProtein} onClick={() => setHighProtein(!highProtein)} disabled={disabled} />
                <MiniToggle label="Low calorie" active={lowCal} onClick={() => setLowCal(!lowCal)} disabled={disabled} />
                <MiniToggle label="More vegetables" active={moreVeg} onClick={() => setMoreVeg(!moreVeg)} disabled={disabled} className="col-span-2" />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-food-muted">Your words (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={disabled}
                  maxLength={400}
                  rows={2}
                  placeholder='e.g. "make it spicier", "less oil", "one-pot only"'
                  className="w-full rounded-xl border-2 border-slate-200 bg-white p-3 text-sm text-food-dark placeholder-slate-400 focus:border-food-primary/50 focus:outline-none focus:ring-4 focus:ring-food-primary/10 resize-none disabled:opacity-50"
                />
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={handleApply}
                className="inline-flex items-center justify-center gap-2 w-full rounded-xl border-2 border-food-primary bg-food-primary text-white py-3 text-sm font-extrabold hover:bg-orange-600 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Sparkles size={18} />
                Regenerate with changes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MiniToggle({ label, active, onClick, disabled, className = '' }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-2.5 text-left text-xs font-bold transition-all ${
        active
          ? 'border-food-primary bg-orange-50 text-food-primary'
          : 'border-slate-200 bg-white text-food-dark hover:border-slate-300'
      } disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  )
}
