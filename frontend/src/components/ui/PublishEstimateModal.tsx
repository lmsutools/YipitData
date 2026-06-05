import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { publishEstimate } from '../../api/estimates'
import toast from 'react-hot-toast'
import type { Kpi, Retailer } from '@yipitdata/shared'

interface Props {
  companyId: number
  companyName: string
  retailers: Retailer[]
  kpis: Kpi[]
  onClose: () => void
}

export function PublishEstimateModal({ companyId, companyName, retailers, kpis, onClose }: Props) {
  const queryClient = useQueryClient()
  const [kpiId, setKpiId] = useState<number>(kpis[0]?.id ?? 0)
  const [retailerId, setRetailerId] = useState<number>(retailers[0]?.id ?? 0)
  const [periodMonth, setPeriodMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [estimateValue, setEstimateValue] = useState('')
  const [estimateType, setEstimateType] = useState<'historical' | 'mtd'>('mtd')

  const mutation = useMutation({
    mutationFn: () => publishEstimate({ companyId, retailerId, kpiId, periodMonth, estimateValue: parseFloat(estimateValue), estimateType }),
    onSuccess: () => {
      toast.success('Estimate published — all connected clients notified via SSE')
      queryClient.invalidateQueries({ queryKey: ['estimates', companyId] })
      queryClient.invalidateQueries({ queryKey: ['company', companyId] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Publish failed'
      toast.error(msg)
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!estimateValue || isNaN(parseFloat(estimateValue))) {
      toast.error('Enter a valid numeric value')
      return
    }
    if (!retailerId) {
      toast.error('Select a retailer')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Publish Estimate</h2>
            <p className="text-sm text-gray-400">{companyName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Retailer</label>
            <select
              value={retailerId}
              onChange={(e) => setRetailerId(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {retailers.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">KPI</label>
            <select
              value={kpiId}
              onChange={(e) => setKpiId(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {kpis.map((k) => (
                <option key={k.id} value={k.id}>{k.name} ({k.unit})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period (first of month)</label>
            <input
              type="date"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="flex gap-2">
              {(['mtd', 'historical'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEstimateType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    estimateType === t
                      ? t === 'mtd' ? 'bg-amber-500 text-white border-amber-500' : 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {t === 'mtd' ? 'MTD' : 'Historical'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number"
              value={estimateValue}
              onChange={(e) => setEstimateValue(e.target.value)}
              placeholder="e.g. 32000000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Publishing…' : 'Publish & Notify'}
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Publishing will trigger a real-time SSE notification to all connected users
        </p>
      </div>
    </div>
  )
}
