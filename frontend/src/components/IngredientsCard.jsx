import { motion } from 'framer-motion'
import { CheckCircle2, ShoppingBasket } from 'lucide-react'

// Simple helper to parse generic ingredient strings like "2 cups flour" or "1 tbsp sugar"
function parseIngredientString(rawStr) {
  const str = String(rawStr).trim();
  // Regex to match things like "1 1/2 cups flour", "2.5 g salt", "1 whole egg"
  const match = str.match(/^([\d\.\/½¼¾\s]+)?\s?(cup|cups|tbsp|tsp|g|kg|ml|l|oz|lb|pound|pounds|pinch|handful|whole|slice|slices)\s+(.+)$/i);
  
  if (match) {
    return {
      qty: match[1] ? match[1].trim() : '',
      unit: match[2] ? match[2].toLowerCase() : '',
      item: match[3] ? match[3].trim() : str
    };
  }

  // Fallback if no specific unit is matched, just try to extract a leading number
  const numberMatch = str.match(/^([\d\.\/½¼¾\s]+)(.+)$/);
  if (numberMatch && numberMatch[1].trim()) {
    return {
      qty: numberMatch[1].trim(),
      unit: '',
      item: numberMatch[2].trim()
    }
  }

  // Last resort: whole string is the item
  return { qty: '', unit: '', item: str }
}

export default function IngredientsCard({ recipe }) {
  const ingredients = recipe?.ingredients || [];

  if (!ingredients.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-panel p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-200">
          <ShoppingBasket size={20} className="text-emerald-600" />
        </div>
        <h2 className="text-xl font-black text-food-dark tracking-tight">Ingredients</h2>
      </div>

      <ul className="flex flex-col gap-3">
        {ingredients.map((ing, i) => {
          const { qty, unit, item } = parseIngredientString(ing);
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + (i * 0.05) }}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-sm"
            >
              {/* Item Name */}
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0 group-hover:text-emerald-500 transition-colors" />
                <span className="text-sm font-bold text-slate-700 capitalize leading-relaxed">
                  {item}
                </span>
              </div>

              {/* Quantity / Unit Badge */}
              {(qty || unit) && (
                <div className="flex items-baseline gap-1 pl-7 sm:pl-0 shrink-0">
                  <span className="bg-emerald-50 border border-emerald-100/50 text-emerald-700 px-3 py-1 rounded-xl text-sm font-black shadow-sm">
                    {qty}
                    {unit && <span className="ml-1 text-emerald-600 font-bold">{unit}</span>}
                  </span>
                </div>
              )}
            </motion.li>
          )
        })}
      </ul>
    </motion.div>
  )
}
