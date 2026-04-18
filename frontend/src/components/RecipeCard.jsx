import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, ChefHat, BarChart, Flame, Download, Copy, RefreshCw, X, Check, ShieldCheck } from 'lucide-react'
import RecipeCustomizeBar from './RecipeCustomizeBar'

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, staggerChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } }
}

// ── Confidence Badge ──────────────────────────────────
function ConfidenceBadge({ score }) {
  const [hovered, setHovered] = useState(false)
  if (score === null || score === undefined) return null

  let label, colorClass, borderClass, dotClass
  if (score >= 80) {
    label = 'High Confidence'
    colorClass = 'text-emerald-700'
    borderClass = 'border-emerald-200 bg-emerald-50'
    dotClass = 'bg-emerald-500'
  } else if (score >= 60) {
    label = 'Medium Confidence'
    colorClass = 'text-yellow-700'
    borderClass = 'border-yellow-200 bg-yellow-50'
    dotClass = 'bg-yellow-500'
  } else {
    label = 'Low Confidence'
    colorClass = 'text-red-700'
    borderClass = 'border-red-200 bg-red-50'
    dotClass = 'bg-red-500'
  }

  return (
    <div className="relative inline-flex" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold tracking-wide cursor-default select-none ${colorClass} ${borderClass} shadow-sm`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass} animate-pulse`} />
        <ShieldCheck size={14} />
        {label} · {score}%
      </motion.div>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 z-50 w-60 p-3 rounded-2xl text-[12px] font-medium leading-relaxed text-slate-700 shadow-xl bg-white border border-slate-200"
          >
            Score based on ingredient match, anchor logic, veg compliance, and validation checks.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RecipeCard({
  recipe,
  onRegenerate,
  onDownloadPDF,
  onRefineRecipe,
  preferencesSnapshot,
  customizeDisabled,
  optionBadge,
}) {
  const [showRegenOptions, setShowRegenOptions] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  if (!recipe) return null

  const stats = [
    { label: 'Time', value: recipe.time_required || 'N/A', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50 border border-blue-100' },
    { label: 'Difficulty', value: recipe.difficulty || 'N/A', icon: BarChart, color: 'text-orange-600', bg: 'bg-orange-50 border border-orange-100' },
    { label: 'Cuisine', value: recipe.cuisine || 'Fusion', icon: ChefHat, color: 'text-purple-600', bg: 'bg-purple-50 border border-purple-100' },
  ]

  const nutrition = recipe.nutrition || {}
  const hasNutrition = Object.values(nutrition).some(val => val)

  const handleCopy = () => {
    const text = `
${recipe.recipe_name}
Time: ${recipe.time_required} | Difficulty: ${recipe.difficulty}

Ingredients:
${recipe.ingredients?.join('\n')}

Instructions:
${recipe.steps?.join('\n')}
    `.trim()
    navigator.clipboard.writeText(text)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleRemoveIngredient = (ing) => {
    setShowRegenOptions(false)
    if (onRegenerate) {
      onRegenerate(ing)
    }
  }

  // A generic placeholder image tailored to the cuisine or just food
  const placeholderImage = recipe.recipe_name.toLowerCase().includes("pizza") 
    ? "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop"
    : recipe.recipe_name.toLowerCase().includes("salad")
    ? "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop"
    : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop"

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full flex flex-col gap-6"
    >
      {/* ── Main Recipe Header ── */}
      <motion.div variants={itemVariants} className="bg-white rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
        
        {/* Food Image Banner */}
        <div 
          className="w-full h-48 sm:h-56 bg-cover bg-center"
          style={{ backgroundImage: `url("${placeholderImage}")` }}
        />
        
        {/* Actions Bar (floating over image) */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
          <button 
            onClick={handleCopy}
            className="p-2.5 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 hover:bg-white transition-all text-slate-600 shadow-sm"
            title="Copy Recipe"
          >
            {isCopied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
          </button>
          <button 
            onClick={onDownloadPDF}
            className="px-4 py-2.5 rounded-full bg-food-primary border border-orange-400 hover:bg-food-secondary hover:border-yellow-400 hover:text-food-dark transition-all text-white flex items-center gap-2 text-sm font-bold shadow-md"
          >
            <Download size={18} /> PDF
          </button>
        </div>

        <div className="p-6 sm:p-8 relative">
          {optionBadge && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-amber-900">
              {optionBadge}
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-black text-food-dark leading-tight mb-4 pr-12 relative z-10">
            {recipe.recipe_name || 'Delicious Recipe'}
          </h1>

          {/* Confidence Badge */}
          <div className="mb-6 relative z-10">
            <ConfidenceBadge score={recipe._confidence} />
          </div>

          {/* Info Pills */}
          <div className="flex flex-wrap gap-3 mb-8 relative z-10">
            {stats.map((stat, i) => {
              const Icon = stat.icon
              return (
                <div key={i} className={`flex items-center gap-2 px-4 py-2 rounded-2xl ${stat.bg} ${stat.color} shadow-sm`}>
                  <Icon size={16} strokeWidth={2.5} />
                  <span className="text-sm font-bold">{stat.value}</span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            {/* Regenerate Button */}
            <div className="relative">
              <button
                onClick={() => setShowRegenOptions(!showRegenOptions)}
                className="btn-ghost shadow-sm h-full"
              >
                <RefreshCw size={16} className={showRegenOptions ? 'animate-spin-once' : ''} />
                Regenerate Without...
              </button>
              
              <AnimatePresence>
                {showRegenOptions && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-3 p-4 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 min-w-[280px]"
                  >
                    <p className="text-sm font-semibold text-slate-700 mb-3 px-1 text-center">
                      Select an ingredient to remove:
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {recipe.ingredients?.map((ing, i) => (
                        <button
                          key={i}
                          onClick={() => handleRemoveIngredient(ing)}
                          className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white transition-colors"
                        >
                          <X size={12} className="inline mr-1" />
                          {ing}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {onRefineRecipe && (
            <div className="mt-6 relative z-10">
              <RecipeCustomizeBar
                disabled={customizeDisabled}
                preferencesSnapshot={preferencesSnapshot}
                onApply={(payload) => onRefineRecipe(recipe, payload)}
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Nutrition Banner ── */}
      {hasNutrition && (
        <motion.div variants={itemVariants} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-24 bg-gradient-to-l from-orange-100 to-transparent opacity-50 pointer-events-none rounded-full -mr-12 -mt-12" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 rounded-xl bg-orange-100 text-orange-600">
              <Flame size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="font-bold text-food-dark">Nutritional Value</h3>
              <p className="text-xs text-food-muted font-medium">Estimated per serving</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 relative z-10">
            {Object.entries(nutrition).map(([key, val]) => (
              val && (
                <div key={key} className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{key}</span>
                  <span className="font-bold text-food-dark">{val}</span>
                </div>
              )
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
