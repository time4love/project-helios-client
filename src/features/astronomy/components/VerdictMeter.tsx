import { useState, useEffect, useCallback } from 'react'
import { getLatestVerdict, type VerdictResult } from '@/services/api'

/**
 * Get conditional color class based on error magnitude
 * - Error < 2°: Green (excellent)
 * - Error 2-5°: Amber (acceptable)
 * - Error > 5°: Red (poor)
 */
function getErrorColorClass(error: number): string {
  const absError = Math.abs(error)
  if (absError < 2) return 'text-green-400'
  if (absError <= 5) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * Format timestamp to DD/MM/YYYY HH:mm
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

/**
 * Calculate "time ago" string from ISO timestamp
 */
function getTimeAgo(isoString: string): string {
  const now = new Date()
  const then = new Date(isoString)
  const diffMs = now.getTime() - then.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  }
  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }
  if (diffMinutes > 0) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`
  }
  return 'Just now'
}

/**
 * VerdictMeter - A semicircular gauge showing Earth model confidence score.
 *
 * Visual zones:
 * - 0-60%: Red (Anomaly Detected)
 * - 60-100%: Green (NASA Model Confirmed)
 */
export function VerdictMeter() {
  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadVerdict = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const data = await getLatestVerdict()
      setVerdict(data)
    } catch (err) {
      // 404 is expected if no verdicts exist yet
      if (err instanceof Error && err.message.includes('404')) {
        setError('No verdict data yet')
      } else {
        setError('Failed to load verdict')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadVerdict()
  }, [loadVerdict])

  const handleRefresh = () => {
    loadVerdict(true)
  }

  if (loading) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-center h-48">
          <div className="text-slate-400 font-mono animate-pulse">
            Loading verdict data...
          </div>
        </div>
      </div>
    )
  }

  if (error || !verdict) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 mb-6">
        <div className="text-center">
          <p className="text-slate-500 font-mono text-sm">{error || 'No verdict available'}</p>
          <p className="text-slate-600 text-xs mt-2">
            Verdicts are calculated hourly from crowdsourced measurements
          </p>
        </div>
      </div>
    )
  }

  const score = verdict.confidence_score
  const isNasa = verdict.winning_model === 'NASA'

  // Calculate needle rotation: -90deg (0%) to +90deg (100%)
  const needleRotation = -90 + (score / 100) * 180

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-mono font-semibold text-slate-200 flex items-center gap-2">
          <span className="text-xl">&#x2699;</span>
          EARTH MODEL VERDICT
        </h2>
        <div
          className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
            isNasa
              ? 'bg-green-900/50 text-green-400 border border-green-700'
              : 'bg-red-900/50 text-red-400 border border-red-700'
          }`}
        >
          {isNasa ? 'CONFIRMED' : 'ANOMALY'}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Semicircular Gauge */}
        <div className="relative w-64 h-36 flex-shrink-0">
          {/* Background arc */}
          <svg viewBox="0 0 200 110" className="w-full h-full">
            {/* Gauge background track */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#334155"
              strokeWidth="16"
              strokeLinecap="round"
            />

            {/* Red zone (0-60%) */}
            <path
              d="M 20 100 A 80 80 0 0 1 100 20"
              fill="none"
              stroke="#dc2626"
              strokeWidth="16"
              strokeLinecap="round"
              opacity="0.7"
            />

            {/* Yellow transition zone (60-75%) */}
            <path
              d="M 100 20 A 80 80 0 0 1 140 35"
              fill="none"
              stroke="#eab308"
              strokeWidth="16"
              opacity="0.7"
            />

            {/* Green zone (75-100%) */}
            <path
              d="M 140 35 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#22c55e"
              strokeWidth="16"
              strokeLinecap="round"
              opacity="0.7"
            />

            {/* Tick marks */}
            {[0, 25, 50, 75, 100].map((tick) => {
              const angle = (-90 + (tick / 100) * 180) * (Math.PI / 180)
              const innerR = 62
              const outerR = 72
              const x1 = 100 + innerR * Math.cos(angle)
              const y1 = 100 + innerR * Math.sin(angle)
              const x2 = 100 + outerR * Math.cos(angle)
              const y2 = 100 + outerR * Math.sin(angle)
              return (
                <line
                  key={tick}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#64748b"
                  strokeWidth="2"
                />
              )
            })}

            {/* Tick labels */}
            <text x="20" y="108" fill="#64748b" fontSize="10" textAnchor="middle">0</text>
            <text x="100" y="15" fill="#64748b" fontSize="10" textAnchor="middle">50</text>
            <text x="180" y="108" fill="#64748b" fontSize="10" textAnchor="middle">100</text>

            {/* Needle */}
            <g transform={`rotate(${needleRotation}, 100, 100)`}>
              <polygon
                points="100,30 96,100 100,95 104,100"
                fill={isNasa ? '#22c55e' : '#dc2626'}
                stroke="#0f172a"
                strokeWidth="1"
              />
              <circle cx="100" cy="100" r="8" fill="#1e293b" stroke="#475569" strokeWidth="2" />
            </g>
          </svg>

          {/* Center score display */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
            <span
              className={`text-4xl font-bold font-mono ${
                isNasa ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {score.toFixed(1)}
            </span>
            <span className="text-slate-400 text-lg ml-1">%</span>
          </div>
        </div>

        {/* Status Panel */}
        <div className="flex-1 w-full lg:w-auto">
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 mb-4">
            <p className="text-slate-500 text-xs font-mono uppercase tracking-wider">Status</p>
            <p
              className={`text-xl font-bold mt-1 ${
                isNasa ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {isNasa ? 'NASA Model Confirmed' : 'Anomaly Detected'}
            </p>
          </div>

          {/* Telemetry Grid */}
          <div className="bg-slate-950 rounded-lg border border-slate-600 p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span className="text-amber-500">&#x25C8;</span>
                RAW TELEMETRY
              </h3>
              <div className="group relative">
                <button
                  className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label="Telemetry info"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
                {/* Tooltip */}
                <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    These values represent the average deviation between device sensor readings
                    and the astronomical model (NASA/Pysolar). Lower values indicate better
                    calibration accuracy.
                  </p>
                  <div className="mt-2 pt-2 border-t border-slate-700 text-xs">
                    <span className="text-green-400">&lt;2°</span>
                    <span className="text-slate-500 mx-1">Excellent</span>
                    <span className="text-amber-400 ml-2">2-5°</span>
                    <span className="text-slate-500 mx-1">Good</span>
                    <span className="text-red-400 ml-2">&gt;5°</span>
                    <span className="text-slate-500 mx-1">Poor</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* N Valid/Total */}
              <div className="bg-slate-900/80 rounded p-2 border border-slate-700">
                <p className="text-slate-500 text-xs font-mono uppercase tracking-tight">
                  N Valid/Total
                </p>
                <p className="text-lg font-mono font-bold text-cyan-400 mt-1">
                  {verdict.valid_samples.toLocaleString()}
                  <span className="text-slate-500 text-sm font-normal">
                    /{verdict.total_samples.toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Avg Δ Azimuth */}
              <div className="bg-slate-900/80 rounded p-2 border border-slate-700">
                <p className="text-slate-500 text-xs font-mono uppercase tracking-tight">
                  Avg Δ Az
                </p>
                <p className={`text-lg font-mono font-bold mt-1 ${getErrorColorClass(verdict.avg_error_azimuth)}`}>
                  {verdict.avg_error_azimuth.toFixed(2)}
                  <span className="text-slate-400 text-sm">°</span>
                </p>
              </div>

              {/* Avg Δ Altitude */}
              <div className="bg-slate-900/80 rounded p-2 border border-slate-700">
                <p className="text-slate-500 text-xs font-mono uppercase tracking-tight">
                  Avg Δ Alt
                </p>
                <p className={`text-lg font-mono font-bold mt-1 ${getErrorColorClass(verdict.avg_error_altitude)}`}>
                  {verdict.avg_error_altitude.toFixed(2)}
                  <span className="text-slate-400 text-sm">°</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="flex items-center justify-between">
          <p className="text-slate-500 text-xs font-mono">
            Based on {verdict.valid_samples.toLocaleString()} validated samples (last 24h)
          </p>

          <div className="flex items-center gap-3">
            <p className="text-slate-400 text-xs font-mono">
              Last Calculation: {formatTimestamp(verdict.created_at)}
              <span className="text-slate-500 ml-2">({getTimeAgo(verdict.created_at)})</span>
            </p>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh verdict"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
