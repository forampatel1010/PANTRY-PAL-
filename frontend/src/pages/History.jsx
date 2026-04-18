import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { History as HistoryIcon, ArrowLeft, Clock, Trash2, ChefHat } from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (d = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay: d },
  }),
}

function HistoryCard({ recipe, onClick, onDelete }) {
  const date = new Date(recipe._date).toLocaleDateString(undefined, { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      whileHover={{ scale: 1.02 }}
      className="glass-panel p-6 cursor-pointer hover:border-food-secondary/40 group transition-all relative"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
        <h3 className="text-xl font-bold text-food-dark group-hover:text-food-primary transition-colors line-clamp-1 pr-8">
          {recipe.recipe_name}
        </h3>
        {/* Delete Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(recipe._id); }}
          className="absolute top-5 right-5 p-2 rounded-xl bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white border border-red-200"
          title="Delete from history"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      <div className="flex items-center gap-4 text-sm font-semibold text-slate-500">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-100">
          <ChefHat size={16} />
          <span className="capitalize">{recipe.cuisine}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
          <Clock size={16} />
          <span>{recipe.time_required}</span>
        </div>
      </div>
      
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[11px] tracking-wider uppercase text-slate-400 font-bold">
          {date}
        </span>
        <span className="text-sm text-food-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          Load Recipe &rarr;
        </span>
      </div>
    </motion.div>
  )
}

export default function History() {
  const navigate = useNavigate()
  const [history, setHistory] = useState([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('rasoi_history')
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const handleDelete = (id) => {
    const updated = history.filter(r => r._id !== id)
    setHistory(updated)
    localStorage.setItem('rasoi_history', JSON.stringify(updated))
  }

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear your entire recipe history?")) {
      setHistory([])
      localStorage.removeItem('rasoi_history')
    }
  }

  const handleLoadRecipe = (recipe) => {
    navigate('/', { state: { loadedRecipe: recipe } })
  }

  return (
    <div className="min-h-screen flex flex-col bg-food-bg relative">
      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-50 w-full px-6 py-4 flex items-center justify-between border-b border-orange-900/5 bg-white/80"
        style={{ backdropFilter: 'blur(16px)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 group focus:outline-none"
        >
          <span
            className="flex items-center justify-center w-10 h-10 rounded-2xl shadow-sm transition-transform group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FFD166 100%)' }}
          >
            <ChefHat size={20} className="text-white" />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-food-dark">
            Rasoi<span className="text-food-primary">AI</span>
          </span>
        </button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          className="btn-ghost"
        >
          <ArrowLeft size={16} />
          Back to Cooking
        </motion.button>
      </motion.nav>

      {/* Content */}
      <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full z-10">
        {/* Page header */}
        <motion.div
          custom={0.1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex items-center justify-between mb-8 px-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white shadow-sm border border-slate-200">
              <HistoryIcon size={24} className="text-food-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-food-dark">Recipe History</h1>
              <p className="text-sm font-medium text-food-muted mt-1">Your previously generated recipes</p>
            </div>
          </div>

          {history.length > 0 && (
            <button 
              onClick={handleClearAll}
              className="px-4 py-2 text-sm font-bold bg-white text-red-500 hover:text-white hover:bg-red-500 border border-slate-200 hover:border-red-500 rounded-full transition-colors shadow-sm"
            >
              Clear All
            </button>
          )}
        </motion.div>

        {/* History Grid or Empty State */}
        {history.length > 0 ? (
          <motion.div 
            custom={0.2} 
            variants={fadeUp} 
            initial="hidden" 
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence>
              {history.map(recipe => (
                <HistoryCard 
                  key={recipe._id} 
                  recipe={recipe} 
                  onClick={() => handleLoadRecipe(recipe)}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            custom={0.2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="glass-panel p-12 flex flex-col items-center justify-center text-center gap-5 min-h-[400px] max-w-2xl mx-auto mt-12"
          >
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-orange-50 border-2 border-orange-100 mb-2">
              <Clock size={36} className="text-food-primary" />
            </div>
            <h2 className="text-2xl font-black text-food-dark">Nothing here yet 🍽️</h2>
            <p className="text-base text-food-muted max-w-md leading-relaxed font-medium">
              Cook something on the home screen — we’ll tuck it here automatically so you can come back anytime.
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/')}
              className="btn-primary mt-4 min-h-[48px] px-8"
            >
              Cook my first recipe
            </motion.button>
          </motion.div>
        )}
      </main>

      {/* Ambient soft warm blobs in background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[100px] opacity-40 mix-blend-multiply"
          style={{ background: '#FFD166' }}
        />
        <div
          className="absolute bottom-1/2 -right-40 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 mix-blend-multiply"
          style={{ background: '#FF6B35' }}
        />
      </div>
    </div>
  )
}
