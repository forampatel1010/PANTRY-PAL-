import { motion } from 'framer-motion'
import { Youtube, ExternalLink, PlaySquare } from 'lucide-react'

export default function LinksCard({ recipe }) {
  const queries = recipe?.search_queries || []

  if (!queries.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-panel p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-100">
          <PlaySquare size={20} className="text-red-500" />
        </div>
        <h2 className="text-xl font-black text-food-dark tracking-tight">Watch & Learn</h2>
      </div>

      <div className="flex flex-col gap-3">
        {queries.map((query, idx) => {
          // Construct smart YouTube search URLs
          const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' recipe step by step')}`
          const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' authentic recipe')}`

          return (
            <div key={idx} className="flex flex-col sm:flex-row gap-2">
              {/* YouTube Link */}
              <a
                href={ytUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 group flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Youtube size={20} className="text-slate-400 group-hover:text-red-500 transition-colors" />
                  <span className="text-sm font-bold text-slate-700 group-hover:text-red-700 transition-colors truncate max-w-[200px] sm:max-w-xs cursor-pointer">
                    {query}
                  </span>
                </div>
                <ExternalLink size={16} className="text-slate-400 group-hover:text-red-500 opacity-50 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </a>
              
              {/* Optional secondary web link, smaller button */}
              <a
                 href={googleUrl}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="shrink-0 flex items-center justify-center p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 transition-all text-slate-400 hover:text-blue-500 shadow-sm"
                 title={`Search Google for ${query}`}
              >
                <ExternalLink size={20} />
              </a>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
