import { motion } from 'framer-motion'
import { Flame, CheckCircle } from 'lucide-react'

export default function StepsCard({ recipe }) {
  const steps = recipe?.steps || []

  if (!steps.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-panel p-6 sm:p-8"
    >
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 rounded-xl bg-orange-100 border border-orange-200">
          <Flame size={20} className="text-food-primary" />
        </div>
        <h2 className="text-xl font-black text-food-dark tracking-tight">Instructions</h2>
      </div>

      <div className="flex flex-col gap-6 relative">
        {/* Subtle timeline track */}
        <div className="absolute left-6 top-3 bottom-3 w-px bg-slate-200 hidden sm:block" />
        
        {steps.map((step, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + (idx * 0.1) }}
            className="group relative flex flex-col sm:flex-row gap-4 sm:gap-6"
          >
            {/* Step Number Badge */}
            <div className="shrink-0 flex items-center justify-center sm:w-12 sm:h-12 w-10 h-10 rounded-2xl bg-white border-2 border-slate-200 text-food-primary font-black shadow-sm group-hover:bg-orange-50 group-hover:border-orange-200 group-hover:scale-110 transition-all z-10">
              {idx + 1}
            </div>

            {/* Step Content */}
            <div className="flex-1 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-colors group-hover:bg-white group-hover:border-slate-300 group-hover:shadow-sm">
              <p className="text-sm sm:text-base font-medium leading-relaxed text-slate-700">
                {step}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Completion Message */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 + (steps.length * 0.1) }}
        className="mt-8 p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 flex items-center justify-center gap-2 shadow-sm"
      >
        <CheckCircle size={20} className="text-emerald-500" />
        <span className="text-emerald-700 text-sm font-black tracking-wide">
          Enjoy your meal!
        </span>
      </motion.div>
    </motion.div>
  )
}
