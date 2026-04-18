import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react'
import { fetchAnalyticsSummary } from '../services/api'

export default function Analytics() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    setErr(null)
    fetchAnalyticsSummary()
      .then((res) => setData(res?.data || null))
      .catch((e) => setErr(e?.message || 'Could not load analytics.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="min-h-screen bg-food-bg p-4 md:p-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm font-bold text-food-primary hover:underline"
          >
            <ArrowLeft size={18} />
            Back to cooking
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-food-dark hover:border-food-primary/40 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FFD166 100%)' }}
            >
              <BarChart3 className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-food-dark">Analytics</h1>
              <p className="text-sm text-food-muted font-medium">
                Local JSONL log — recent activity and simple rollups.
              </p>
            </div>
          </div>

          {err && (
            <p className="text-sm font-semibold text-red-600 mb-4" role="alert">
              {err}
            </p>
          )}

          {loading && !data && <p className="text-food-muted text-sm font-medium">Loading…</p>}

          {data && (
            <div className="flex flex-col gap-6 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Events (window)" value={data.total_events_loaded} />
                <Stat
                  label="Recipe success %"
                  value={data.recipe_success_rate_percent != null ? `${data.recipe_success_rate_percent}%` : '—'}
                />
                <Stat label="Avg confidence" value={data.average_confidence_recipe_succeeded ?? '—'} />
                <Stat label="Recipe OK / fail" value={`${data.recipe_success_count} / ${data.recipe_failure_count}`} />
              </div>

              {data.log_path && (
                <p className="text-xs text-slate-400 font-mono break-all">Log: {data.log_path}</p>
              )}

              <Block title="Top ingredients (in tracked events)" rows={data.top_ingredients} k="ingredient" />
              <Block title="Common error codes" rows={data.top_error_codes} k="code" />
              <Block title="Events by type" rows={objectToRows(data.events_by_type)} k="name" />

              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-food-muted mb-2">
                  Recent activity
                </h2>
                <ul className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar border border-slate-100 rounded-xl p-3 bg-slate-50/80">
                  {(data.recent_activity || []).map((r, i) => (
                    <li key={i} className="text-xs font-mono text-slate-700">
                      <span className="font-bold text-food-primary">{r.event}</span>
                      {r.received_at && <span className="text-slate-400 ml-2">{r.received_at}</span>}
                      {r.summary && Object.keys(r.summary).length > 0 && (
                        <span className="block text-slate-500 mt-0.5">{JSON.stringify(r.summary)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-food-muted">{label}</p>
      <p className="text-lg font-extrabold text-food-dark mt-1">{value}</p>
    </div>
  )
}

function Block({ title, rows, k }) {
  if (!rows || !rows.length) return null
  return (
    <div>
      <h2 className="text-xs font-black uppercase tracking-widest text-food-muted mb-2">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {rows.slice(0, 24).map((row, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-food-dark"
          >
            {row[k] || row.name}
            <span className="text-food-primary">{row.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function objectToRows(obj) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([name, count]) => ({ name, count }))
}
