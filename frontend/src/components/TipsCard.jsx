import { motion } from 'framer-motion'
import { Lightbulb, Info } from 'lucide-react'

export default function TipsCard({ recipe }) {
  const tips = recipe?.tips || []
  const substitutions = recipe?.substitutions || {}

  const hasTips = tips.length > 0
  const hasSubstitutions = Object.keys(substitutions).length > 0

  if (!hasTips && !hasSubstitutions) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-panel p-6"
    >
      {/* Tips Section */}
      {hasTips && (
        <div className="mb-6 last:mb-0">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={20} className="text-yellow-500" />
            <h3 className="text-lg font-black text-food-dark">Chef's Tips</h3>
          </div>
          <ul className="flex flex-col gap-3 relative">
            {tips.map((tip, idx) => (
              <li
                key={idx}
                className="pl-6 relative text-sm sm:text-base font-medium text-slate-700 leading-relaxed"
              >
                <div className="absolute left-1 top-2 w-2 h-2 rounded-full bg-yellow-400" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Substitutions Section */}
      {hasSubstitutions && (
        <div className={hasTips ? "pt-6 mt-6 border-t border-slate-200" : ""}>
          <div className="flex items-center gap-2 mb-4">
            <Info size={20} className="text-blue-500" />
            <h3 className="text-lg font-black text-food-dark">Substitutions</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(substitutions).map(([original, sub], idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-slate-300 transition-colors shadow-sm"
              >
                <span className="text-sm font-bold text-slate-500 line-through decoration-red-400 decoration-2">
                  {original}
                </span>
                <span className="text-slate-400 text-xs font-black">→</span>
                <span className="text-sm font-black text-emerald-600">
                  {sub}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
