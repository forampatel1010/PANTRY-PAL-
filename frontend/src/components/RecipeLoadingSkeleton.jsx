import { motion } from 'framer-motion'

function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`rounded-xl bg-gradient-to-r from-slate-100 via-orange-50/40 to-slate-100 bg-[length:200%_100%] animate-skeleton-pulse ${className}`}
      aria-hidden
    />
  )
}

export default function RecipeLoadingSkeleton() {
  return (
    <div
      className="w-full space-y-8 px-1 pb-8"
      aria-busy="true"
      aria-live="polite"
      aria-label="Preparing your recipes"
    >
      <div className="flex flex-col items-center text-center gap-3 pt-2 px-4">
        <motion.span
          className="text-4xl sm:text-5xl select-none"
          animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          role="img"
          aria-hidden
        >
          🍳
        </motion.span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-food-dark tracking-tight">
          Cooking something delicious for you 🍳
        </h2>
        <p className="text-sm sm:text-base text-food-muted font-medium max-w-md leading-relaxed">
          We’re picking the best ideas, steps, and flavors — almost ready to serve.
        </p>
      </div>

      {[0, 1].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + i * 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="rounded-3xl border border-slate-200/90 bg-white shadow-md shadow-orange-500/5 overflow-hidden"
        >
          <SkeletonBlock className="h-40 sm:h-48 w-full rounded-none" />
          <div className="p-5 sm:p-7 space-y-4">
            <SkeletonBlock className="h-9 w-4/5 max-w-md" />
            <div className="flex gap-2 flex-wrap">
              <SkeletonBlock className="h-8 w-24 rounded-full" />
              <SkeletonBlock className="h-8 w-28 rounded-full" />
              <SkeletonBlock className="h-8 w-20 rounded-full" />
            </div>
            <div className="space-y-2.5 pt-1">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-[92%]" />
              <SkeletonBlock className="h-3 w-4/5" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
