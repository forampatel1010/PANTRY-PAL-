import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, X, RefreshCw, Sparkles } from 'lucide-react'

/**
 * Friendly, actionable error strip (sticky context for RasoiAI).
 */
export default function UserFacingErrorBanner({
  message,
  hint,
  suggestions = [],
  onDismiss,
  onRetry,
  onPickSuggestion,
}) {
  if (!message) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        role="alert"
        className="mb-4 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/80 p-4 shadow-sm"
      >
        <div className="flex gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
            <AlertCircle size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">
              Heads up
            </p>
            <p className="text-sm font-bold text-food-dark leading-snug">{message}</p>
            {hint && (
              <p className="mt-2 text-sm text-food-muted font-medium leading-relaxed">{hint}</p>
            )}
            {suggestions.length > 0 && onPickSuggestion && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-food-muted w-full">
                  Tap to add
                </span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onPickSuggestion(s)}
                    className="inline-flex items-center gap-1 rounded-full border border-food-primary/30 bg-white px-2.5 py-1 text-xs font-bold text-food-primary hover:bg-orange-50 transition-colors"
                  >
                    <Sparkles size={12} />
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-food-primary text-white px-3 py-2 text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
                >
                  <RefreshCw size={14} />
                  Let’s try again
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-food-muted hover:border-slate-300"
                >
                  <X size={14} />
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
