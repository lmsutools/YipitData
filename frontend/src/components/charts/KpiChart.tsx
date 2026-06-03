import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { format, parseISO, subYears } from 'date-fns'
import type { KpiEstimate } from '@yipitdata/shared'
import { formatValue } from '../../utils/format'

interface ChartDataPoint {
  period: string
  label: string
  value: number
  isMtd: boolean
  yoyValue?: number
}

interface Props {
  estimates: KpiEstimate[]
  kpiUnit: string
  showYoy: boolean
  showMom: boolean
}

function buildChartData(estimates: KpiEstimate[], showYoy: boolean): ChartDataPoint[] {
  const byPeriodType = new Map<string, { historical?: number; mtd?: number }>()

  for (const e of estimates) {
    if (!byPeriodType.has(e.periodMonth)) byPeriodType.set(e.periodMonth, {})
    const entry = byPeriodType.get(e.periodMonth)!
    if (e.estimateType === 'historical') entry.historical = parseFloat(String(e.estimateValue))
    else entry.mtd = parseFloat(String(e.estimateValue))
  }

  // Build sorted list of periods (only current 13 months)
  const periods = [...byPeriodType.keys()].sort()

  const result: ChartDataPoint[] = []
  for (const period of periods) {
    const entry = byPeriodType.get(period)!
    const isMtd = entry.mtd !== undefined && entry.historical === undefined
    const value = isMtd ? entry.mtd! : entry.historical!

    let yoyValue: number | undefined
    if (showYoy) {
      const yoyPeriod = format(subYears(parseISO(period), 1), 'yyyy-MM-dd')
      const yoyEntry = byPeriodType.get(yoyPeriod)
      if (yoyEntry) yoyValue = yoyEntry.historical ?? yoyEntry.mtd
    }

    result.push({
      period,
      label: format(parseISO(period), 'MMM yy'),
      value,
      isMtd,
      yoyValue,
    })
  }

  return result
}

const CustomTooltip = ({ active, payload, label, unit, showMom, data }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
  unit: string
  showMom: boolean
  data: ChartDataPoint[]
}) => {
  if (!active || !payload?.length) return null

  const point = data.find((d) => d.label === label)
  const currentVal = payload.find((p) => p.name === 'value')?.value
  const yoyVal = payload.find((p) => p.name === 'yoyValue')?.value

  const idx = data.findIndex((d) => d.label === label)
  const prevVal = idx > 0 ? data[idx - 1]?.value : undefined
  const momPct = prevVal && currentVal ? (((currentVal - prevVal) / prevVal) * 100).toFixed(1) : null
  const yoyPct = yoyVal && currentVal ? (((currentVal - yoyVal) / yoyVal) * 100).toFixed(1) : null

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-40">
      <p className="font-semibold text-gray-900 mb-2">
        {point?.isMtd ? `${label} (MTD)` : label}
      </p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Current</span>
          <span className="font-medium">{formatValue(currentVal ?? 0, unit)}</span>
        </div>
        {yoyVal !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">YOY</span>
            <span className="text-gray-500">{formatValue(yoyVal, unit)}</span>
          </div>
        )}
        {showMom && momPct !== null && (
          <div className="flex justify-between gap-4 border-t border-gray-100 pt-1 mt-1">
            <span className="text-gray-500">MOM</span>
            <span className={parseFloat(momPct) >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
              {parseFloat(momPct) >= 0 ? '+' : ''}{momPct}%
            </span>
          </div>
        )}
        {yoyPct !== null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">YOY Δ</span>
            <span className={parseFloat(yoyPct) >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
              {parseFloat(yoyPct) >= 0 ? '+' : ''}{yoyPct}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function KpiChart({ estimates, kpiUnit, showYoy, showMom }: Props) {
  const data = buildChartData(estimates, showYoy)

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available for the selected filters
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
        <YAxis
          tickFormatter={(v) => formatValue(v, kpiUnit, true)}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          width={70}
        />
        <Tooltip
          content={<CustomTooltip unit={kpiUnit} showMom={showMom} data={data} />}
        />
        {showYoy && <Legend />}

        <Bar dataKey="value" name="value" radius={[3, 3, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isMtd ? '#f59e0b' : '#3b82f6'}
              opacity={entry.isMtd ? 0.9 : 0.85}
            />
          ))}
        </Bar>

        {showYoy && (
          <Line
            type="monotone"
            dataKey="yoyValue"
            name="yoyValue"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={{ r: 3, fill: '#94a3b8' }}
            strokeDasharray="4 2"
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
