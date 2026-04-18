import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { History, ChefHat, BarChart3 } from 'lucide-react'

/* ── Animation variants ──────────────────────────────── */
const panelVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  visible: (delay = 0) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay },
  }),
}

/* ── Status Dot ──────────────────────────────────────── */
function StatusDot({ online = true }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-food-muted font-medium">
      <span className="relative flex h-2 w-2">
        {online && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            online ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
        />
      </span>
      <span>{online ? 'Online' : 'Offline'}</span>
    </span>
  )
}

/* ── Navbar ──────────────────────────────────────────── */
function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isHistory = location.pathname === '/history'
  const isAnalytics = location.pathname === '/analytics'

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="sticky top-0 z-50 w-full px-6 py-4 flex items-center justify-between border-b border-orange-900/5 bg-white/80"
      style={{ backdropFilter: 'blur(16px)' }}
    >
      {/* ── Brand ── */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-3 group focus:outline-none"
        id="nav-brand"
        aria-label="RasoiAI home"
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

      {/* ── Right Controls ── */}
      <div className="flex items-center gap-4">
        <StatusDot online={true} />

        <div className="w-px h-6 bg-slate-200 mx-1" />

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/analytics')}
          id="nav-analytics-btn"
          className={`btn-ghost ${isAnalytics ? 'text-food-primary' : ''}`}
          aria-label="Analytics"
          title="Analytics"
        >
          <BarChart3 size={16} />
          Stats
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(isHistory ? '/' : '/history')}
          id="nav-history-btn"
          className="btn-ghost"
          aria-label={isHistory ? 'Back to home' : 'View history'}
        >
          <History size={16} />
          {isHistory ? 'Back to Cooking' : 'History'}
        </motion.button>
      </div>
    </motion.nav>
  )
}

/* ── Panel Wrapper ───────────────────────────────────── */
function Panel({ children, className = '', delay = 0, id }) {
  return (
    <motion.section
      id={id}
      custom={delay}
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className={`glass-panel p-6 sm:p-8 flex flex-col min-h-0 transition-shadow duration-300 hover:shadow-lg hover:shadow-orange-500/[0.06] ${className}`}
    >
      {children}
    </motion.section>
  )
}

/* ── Layout ──────────────────────────────────────────── */
export default function Layout({ leftPanel, rightPanel, topBanner }) {
  return (
    <div className="min-h-screen flex flex-col bg-food-bg">
      <Navbar />

      <main className="flex-1 p-4 md:p-6 xl:p-8 relative z-10 w-full max-w-[1600px] mx-auto">
        {topBanner}
        <div
          className="
            grid gap-6
            grid-cols-1
            lg:grid-cols-[minmax(380px,460px)_1fr]
            xl:grid-cols-[440px_1fr]
            lg:items-start
          "
          style={{ minHeight: 'calc(100vh - 7rem)' }}
        >
          {/* Left — Input Panel */}
          <Panel
            id="input-panel"
            delay={0.1}
            className="lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
          >
            {leftPanel}
          </Panel>

          {/* Right — Preview Panel */}
          <Panel
            id="preview-panel"
            delay={0.2}
            className="lg:min-h-[calc(100vh-8rem)]"
          >
            {rightPanel}
          </Panel>
        </div>
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
          className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 mix-blend-multiply flex-none"
          style={{ background: '#FF6B35' }}
        />
      </div>
    </div>
  )
}
