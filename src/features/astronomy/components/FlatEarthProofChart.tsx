import { useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts'
import type { MeasurementResult, StatsResult } from '@/services/api'

interface FlatEarthProofChartProps {
  measurements: MeasurementResult[]
  stats: StatsResult | null
}

// Common flat Earth claim: sun is ~5000-6000 km above the flat plane
const FLAT_EARTH_CLAIM_HEIGHT_KM = 5000

interface ChartDataPoint {
  latitude: number
  sunHeight: number
  id: number
}

/**
 * FlatEarthProofChart - Visualizes the triangulation test results.
 *
 * If Earth were flat, calculated sun heights should cluster around a consistent value.
 * On a globe, they will vary wildly based on location and time.
 */
export function FlatEarthProofChart({ measurements, stats }: FlatEarthProofChartProps) {
  // Filter measurements with valid flat earth calculations
  const chartData = useMemo<ChartDataPoint[]>(() => {
    return measurements
      .filter((m) => m.flat_earth_sun_height_km !== null)
      .map((m) => ({
        latitude: m.latitude,
        sunHeight: m.flat_earth_sun_height_km as number,
        id: m.id,
      }))
  }, [measurements])

  const hasData = chartData.length > 0

  // Calculate Y-axis domain based on data
  const yDomain = useMemo(() => {
    if (!hasData) return [0, 10000]
    const heights = chartData.map((d) => d.sunHeight)
    const minHeight = Math.min(...heights)
    const maxHeight = Math.max(...heights)
    // Add padding and ensure we show the reference line
    const lower = Math.min(0, minHeight * 0.9)
    const upper = Math.max(FLAT_EARTH_CLAIM_HEIGHT_KM * 1.5, maxHeight * 1.1)
    return [lower, upper]
  }, [chartData, hasData])

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-mono font-semibold text-slate-200 flex items-center gap-2">
          <span className="text-xl">&#x1F4D0;</span>
          TRIANGULATION TEST (Sun Height)
        </h2>
        {stats?.flat_earth_samples && (
          <div className="px-3 py-1 bg-slate-900/50 border border-slate-600 rounded text-xs font-mono text-slate-400">
            {stats.flat_earth_samples} samples
          </div>
        )}
      </div>

      {/* Chart */}
      {!hasData ? (
        <div className="h-64 flex items-center justify-center text-slate-500 font-mono text-sm">
          No triangulation data available yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              type="number"
              dataKey="latitude"
              name="Latitude"
              domain={[-90, 90]}
              stroke="#94a3b8"
              fontSize={12}
              tickFormatter={(v) => `${v}°`}
            >
              <Label
                value="User Latitude"
                position="bottom"
                offset={0}
                fill="#64748b"
                fontSize={11}
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="sunHeight"
              name="Sun Height"
              domain={yDomain}
              stroke="#94a3b8"
              fontSize={12}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            >
              <Label
                value="Calculated Height (km)"
                angle={-90}
                position="insideLeft"
                fill="#64748b"
                fontSize={11}
                style={{ textAnchor: 'middle' }}
              />
            </YAxis>

            {/* Flat Earth claim reference line */}
            <ReferenceLine
              y={FLAT_EARTH_CLAIM_HEIGHT_KM}
              stroke="#f59e0b"
              strokeDasharray="8 4"
              strokeWidth={2}
            >
              <Label
                value="Flat Earth Claim (~5,000 km)"
                position="right"
                fill="#f59e0b"
                fontSize={10}
              />
            </ReferenceLine>

            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
              }}
              formatter={(value) => {
                const numVal = typeof value === 'number' ? value : 0
                return [`${numVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`, 'Sun Height']
              }}
              labelFormatter={(label) => `Latitude: ${label}°`}
            />

            <Scatter
              name="Calculated Sun Height"
              data={chartData}
              fill="#3b82f6"
              fillOpacity={0.7}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* Stats Summary */}
      {stats?.avg_flat_earth_sun_height_km !== null && stats?.avg_flat_earth_sun_height_km !== undefined && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="bg-slate-900/50 rounded p-3 border border-slate-700">
            <p className="text-slate-500 text-xs font-mono uppercase">Avg Height</p>
            <p className="text-xl font-mono font-bold text-cyan-400 mt-1">
              {stats.avg_flat_earth_sun_height_km.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-slate-400 text-sm ml-1">km</span>
            </p>
          </div>
          <div className="bg-slate-900/50 rounded p-3 border border-slate-700">
            <p className="text-slate-500 text-xs font-mono uppercase">Std Deviation</p>
            <p className={`text-xl font-mono font-bold mt-1 ${
              (stats.std_dev_flat_earth_sun_height_km ?? 0) > 5000
                ? 'text-green-400'
                : 'text-red-400'
            }`}>
              {stats.std_dev_flat_earth_sun_height_km?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? 'N/A'}
              <span className="text-slate-400 text-sm ml-1">km</span>
            </p>
          </div>
        </div>
      )}

      {/* Interpretation */}
      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-red-900/20 border border-red-800/50 rounded p-3">
            <p className="text-red-400 font-semibold mb-1">If Earth is Flat:</p>
            <p className="text-slate-400">
              Points should align on a horizontal line at ~5,000 km with low variance.
            </p>
          </div>
          <div className="bg-green-900/20 border border-green-800/50 rounded p-3">
            <p className="text-green-400 font-semibold mb-1">If Earth is Round:</p>
            <p className="text-slate-400">
              Points will be scattered with high variance — the formula doesn't work on a sphere.
            </p>
          </div>
        </div>
        {stats?.std_dev_flat_earth_sun_height_km !== null && stats?.std_dev_flat_earth_sun_height_km !== undefined && (
          <div className="mt-3 text-center">
            <p className={`text-sm font-mono font-bold ${
              stats.std_dev_flat_earth_sun_height_km > 5000
                ? 'text-green-400'
                : 'text-amber-400'
            }`}>
              {stats.std_dev_flat_earth_sun_height_km > 5000
                ? '🌍 High variance detected — consistent with spherical Earth'
                : '⚠️ Low variance — more data needed for conclusive results'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
