import { useState, useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Legend,
} from 'recharts'
import {
  getStats,
  getMeasurements,
  downloadCSV,
  type StatsResult,
  type MeasurementResult,
} from '@/services/api'

function getTodayString(): string {
  return new Date().toISOString().split('T')[0]
}

interface ErrorBucket {
  range: string
  azimuth: number
  altitude: number
}

interface TimeScatterPoint {
  hour: number
  deltaAzimuth: number
  deltaAltitude: number
}

function buildHistogramBuckets(measurements: MeasurementResult[]): ErrorBucket[] {
  const buckets = [
    { range: '0-2°', min: 0, max: 2, azimuth: 0, altitude: 0 },
    { range: '2-5°', min: 2, max: 5, azimuth: 0, altitude: 0 },
    { range: '5-10°', min: 5, max: 10, azimuth: 0, altitude: 0 },
    { range: '10-20°', min: 10, max: 20, azimuth: 0, altitude: 0 },
    { range: '20°+', min: 20, max: Infinity, azimuth: 0, altitude: 0 },
  ]

  for (const m of measurements) {
    const azError = Math.abs(m.delta_azimuth)
    const altError = Math.abs(m.delta_altitude)

    for (const bucket of buckets) {
      if (azError >= bucket.min && azError < bucket.max) {
        bucket.azimuth++
      }
      if (altError >= bucket.min && altError < bucket.max) {
        bucket.altitude++
      }
    }
  }

  return buckets.map(({ range, azimuth, altitude }) => ({ range, azimuth, altitude }))
}

function buildScatterData(measurements: MeasurementResult[]): TimeScatterPoint[] {
  return measurements.map((m) => {
    const date = new Date(m.created_at)
    const hour = date.getHours() + date.getMinutes() / 60
    return {
      hour: Math.round(hour * 100) / 100,
      deltaAzimuth: m.delta_azimuth,
      deltaAltitude: m.delta_altitude,
    }
  })
}

function KPICard({
  title,
  value,
  unit,
  colorClass,
}: {
  title: string
  value: string | number
  unit?: string
  colorClass?: string
}) {
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
      <p className="text-slate-400 text-sm font-mono uppercase tracking-wider">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${colorClass || 'text-white'}`}>
        {value}
        {unit && <span className="text-lg text-slate-400 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function getErrorColorClass(value: number | null): string {
  if (value === null) return 'text-slate-500'
  const absVal = Math.abs(value)
  if (absVal < 5) return 'text-green-400'
  if (absVal < 15) return 'text-yellow-400'
  return 'text-red-400'
}

export function StatsDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString())
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [measurements, setMeasurements] = useState<MeasurementResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const [statsData, measurementsData] = await Promise.all([
          getStats(selectedDate),
          getMeasurements(selectedDate),
        ])
        setStats(statsData)
        setMeasurements(measurementsData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [selectedDate])

  const histogramData = useMemo(() => buildHistogramBuckets(measurements), [measurements])
  const scatterData = useMemo(() => buildScatterData(measurements), [measurements])

  const handleDownload = () => {
    downloadCSV(selectedDate)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight">MISSION CONTROL</h1>
          <p className="text-slate-400 text-sm mt-1">Solar Tracking Analytics Dashboard</p>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={handleDownload}
            className="border border-slate-500 hover:border-amber-500 hover:text-amber-400 text-slate-300 px-4 py-2 rounded font-mono text-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download CSV
          </button>
        </div>
      </div>

      {/* Loading / Error States */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 font-mono">Loading telemetry data...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && stats && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <KPICard title="Total Measurements" value={stats.count} />
            <KPICard
              title="Avg Azimuth Error"
              value={stats.avg_delta_azimuth?.toFixed(2) ?? 'N/A'}
              unit="°"
              colorClass={getErrorColorClass(stats.avg_delta_azimuth)}
            />
            <KPICard
              title="Avg Altitude Error"
              value={stats.avg_delta_altitude?.toFixed(2) ?? 'N/A'}
              unit="°"
              colorClass={getErrorColorClass(stats.avg_delta_altitude)}
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Histogram */}
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
              <h2 className="text-lg font-mono font-semibold mb-4 text-slate-200">
                Error Distribution
              </h2>
              {measurements.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={histogramData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="range" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="azimuth" name="Azimuth" fill="#f59e0b" />
                    <Bar dataKey="altitude" name="Altitude" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Scatter Plot */}
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
              <h2 className="text-lg font-mono font-semibold mb-4 text-slate-200">
                Error vs Time of Day
              </h2>
              {measurements.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis
                      type="number"
                      dataKey="hour"
                      name="Hour"
                      domain={[0, 24]}
                      stroke="#94a3b8"
                      fontSize={12}
                      tickFormatter={(v) => `${Math.floor(v)}:00`}
                    />
                    <YAxis
                      type="number"
                      dataKey="deltaAzimuth"
                      name="Delta"
                      stroke="#94a3b8"
                      fontSize={12}
                      label={{
                        value: 'Azimuth Error (°)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#94a3b8',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                      }}
                      formatter={(value) => {
                        const numVal = typeof value === 'number' ? value : 0
                        return [`${numVal.toFixed(2)}°`, 'Azimuth Error']
                      }}
                      labelFormatter={(label) => {
                        const hour = typeof label === 'number' ? label : 0
                        return `Time: ${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`
                      }}
                    />
                    <Scatter name="Measurements" data={scatterData} fill="#f59e0b" />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Standard Deviation Footer */}
          {(stats.std_dev_azimuth !== null || stats.std_dev_altitude !== null) && (
            <div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <p className="text-slate-400 text-sm font-mono">
                <span className="text-slate-500">σ</span> Standard Deviation:{' '}
                <span className="text-amber-400">
                  Azimuth {stats.std_dev_azimuth?.toFixed(2) ?? 'N/A'}°
                </span>
                {' / '}
                <span className="text-blue-400">
                  Altitude {stats.std_dev_altitude?.toFixed(2) ?? 'N/A'}°
                </span>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
