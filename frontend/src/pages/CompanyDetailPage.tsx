import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subMonths, startOfMonth } from 'date-fns'
import { fetchCompany } from '../api/companies'
import { fetchEstimates, fetchKpis } from '../api/estimates'
import { KpiChart } from '../components/charts/KpiChart'
import { PublishEstimateModal } from '../components/ui/PublishEstimateModal'
import { formatValue, exportToCsv } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import type { KpiEstimate } from '@yipitdata/shared'

const DEFAULT_DATE_FROM = format(startOfMonth(subMonths(new Date(), 13)), 'yyyy-MM-dd')
const DEFAULT_DATE_TO = format(startOfMonth(new Date()), 'yyyy-MM-dd')

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const companyId = parseInt(id!)

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [activeKpiId, setActiveKpiId] = useState<number | null>(null)
  const [activeRetailerId, setActiveRetailerId] = useState<number | null>(null)
  const [showYoy, setShowYoy] = useState(false)
  const [showMom, setShowMom] = useState(true)
  const [showPublish, setShowPublish] = useState(false)
  const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM)
  const [dateTo, setDateTo] = useState(DEFAULT_DATE_TO)

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => fetchCompany(companyId),
  })

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis'],
    queryFn: fetchKpis,
    staleTime: 60 * 60 * 1000,
  })

  const { data: estimates = [], isLoading: estimatesLoading } = useQuery({
    queryKey: ['estimates', companyId, activeKpiId, activeRetailerId, dateFrom, dateTo],
    queryFn: () => fetchEstimates(companyId, {
      kpiId: activeKpiId ?? undefined,
      retailerId: activeRetailerId ?? undefined,
      dateFrom,
      dateTo,
      type: 'all',
    }),
    enabled: !!companyId,
    staleTime: 30 * 1000,
  })

  // Select first KPI once loaded
  useMemo(() => {
    if (kpis.length > 0 && activeKpiId === null) {
      setActiveKpiId(kpis[0].id)
    }
  }, [kpis, activeKpiId])

  const activeKpi = kpis.find((k) => k.id === activeKpiId)
  const companyRetailers = company?.retailers ?? []

  const filteredEstimates = useMemo(() => {
    if (!activeKpiId) return estimates
    return estimates.filter((e) => e.kpiId === activeKpiId)
  }, [estimates, activeKpiId])

  // Aggregate estimates across retailers for chart (sum for GMV/Units, avg for ASP)
  const aggregatedEstimates = useMemo((): KpiEstimate[] => {
    if (!filteredEstimates.length) return []
    const isAvg = activeKpi?.unit === 'USD' && activeKpi?.name === 'ASP'

    // Group by (periodMonth, estimateType, asOfTimestamp)
    const grouped = new Map<string, { sum: number; count: number; row: KpiEstimate }>()
    for (const e of filteredEstimates) {
      const key = `${e.periodMonth}|${e.estimateType}|${e.asOfTimestamp ?? ''}`
      const existing = grouped.get(key)
      const val = parseFloat(String(e.estimateValue))
      if (existing) {
        existing.sum += val
        existing.count++
      } else {
        grouped.set(key, { sum: val, count: 1, row: e })
      }
    }

    return [...grouped.values()].map(({ sum, count, row }) => ({
      ...row,
      estimateValue: isAvg ? sum / count : sum,
    }))
  }, [filteredEstimates, activeKpi])

  // MTD: latest snapshot per kpi across all retailers (or filtered retailer)
  const mtdEstimate = useMemo(() => {
    if (!activeKpiId || !company?.mtdEstimates) return null
    const relevant = company.mtdEstimates.filter((m) =>
      m.kpiId === activeKpiId &&
      (activeRetailerId === null || m.retailerId === activeRetailerId)
    )
    if (!relevant.length) return null
    // Use the most recent as_of
    return relevant.sort((a, b) =>
      (b.asOfTimestamp ?? '').localeCompare(a.asOfTimestamp ?? '')
    )[0]
  }, [activeKpiId, activeRetailerId, company])

  const latestHistorical = useMemo(() => {
    const historicals = aggregatedEstimates
      .filter((e) => e.estimateType === 'historical')
      .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))
    return historicals[0] ?? null
  }, [aggregatedEstimates])

  const handleExport = () => {
    const rows = aggregatedEstimates.map((e) => ({
      company: company?.name ?? '',
      retailer: activeRetailerId ? companyRetailers.find(r => r.id === activeRetailerId)?.name ?? 'all' : 'all retailers',
      kpi: e.kpiName ?? '',
      unit: e.kpiUnit ?? '',
      period: e.periodMonth,
      type: e.estimateType,
      value: e.estimateValue,
      asOf: e.asOfTimestamp ?? '',
      publishedAt: e.publishedAt,
    }))
    exportToCsv(`${company?.slug ?? 'company'}-${activeKpi?.name ?? 'kpi'}-estimates.csv`, rows)
  }

  if (companyLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/3" />
          <div className="h-4 bg-gray-50 rounded w-1/2" />
          <div className="h-80 bg-gray-50 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-400">
        Company not found
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {showPublish && company && kpis.length > 0 && (
        <PublishEstimateModal
          companyId={companyId}
          companyName={company.name}
          retailers={companyRetailers}
          kpis={kpis}
          onClose={() => setShowPublish(false)}
        />
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link to="/" className="hover:text-blue-600 transition-colors">Dashboard</Link>
        <span>›</span>
        <span className="text-gray-600 font-medium">{company.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {(company as { sectorName?: string }).sectorName}
            </span>
          </div>
          {company.description && (
            <p className="text-gray-500 text-sm max-w-2xl">{company.description}</p>
          )}
        </div>

        {/* Quick stats */}
        {latestHistorical && activeKpi && (
          <div className="flex gap-4">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-32">
              <p className="text-xs text-gray-400 mb-0.5">Latest {activeKpi.name}</p>
              <p className="text-lg font-bold text-gray-900">
                {formatValue(parseFloat(String(latestHistorical.estimateValue)), activeKpi.unit, true)}
              </p>
              <p className="text-xs text-gray-400">{format(parseISO(latestHistorical.periodMonth), 'MMM yyyy')}</p>
            </div>

            {mtdEstimate && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 min-w-32">
                <p className="text-xs text-amber-600 mb-0.5 font-medium">MTD Estimate</p>
                <p className="text-lg font-bold text-amber-700">
                  {formatValue(parseFloat(String(mtdEstimate.estimateValue)), activeKpi.unit, true)}
                </p>
                <p className="text-xs text-amber-500">
                  As of {mtdEstimate.asOfTimestamp ? format(new Date(mtdEstimate.asOfTimestamp), 'MMM d, h:mm a') : '—'}
                </p>
                {mtdEstimate.retailerName && (
                  <p className="text-xs text-amber-400 mt-0.5">{mtdEstimate.retailerName}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Retailer filter pills */}
      {companyRetailers.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="text-xs text-gray-400 self-center mr-1">Retailer:</span>
          <button
            onClick={() => setActiveRetailerId(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeRetailerId === null
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            All Retailers
          </button>
          {companyRetailers.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRetailerId(r.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeRetailerId === r.id
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* KPI Tabs */}
      <div className="flex gap-2 mb-6">
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            onClick={() => setActiveKpiId(kpi.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeKpiId === kpi.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {kpi.name}
            <span className="ml-1.5 text-xs opacity-70">({kpi.unit})</span>
          </button>
        ))}
      </div>

      {/* Chart card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {/* Chart controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-gray-900">
              {activeKpi?.name} — {company.name}
              {activeRetailerId && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({companyRetailers.find(r => r.id === activeRetailerId)?.name})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-blue-500 opacity-80" />
              <span className="text-xs text-gray-400">Historical</span>
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-400 opacity-80 ml-2" />
              <span className="text-xs text-gray-400">MTD</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date range */}
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-gray-300">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-2">
              <ToggleButton active={showYoy} onClick={() => setShowYoy((v) => !v)} label="YOY" />
              <ToggleButton active={showMom} onClick={() => setShowMom((v) => !v)} label="MOM" />
            </div>

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-600 text-gray-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>

            {isAdmin && (
              <button
                onClick={() => setShowPublish(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Publish Estimate
              </button>
            )}
          </div>
        </div>

        {/* Chart — uses aggregated (or single-retailer) data */}
        {estimatesLoading ? (
          <div className="h-80 bg-gray-50 animate-pulse rounded-xl" />
        ) : (
          <KpiChart
            estimates={aggregatedEstimates}
            kpiUnit={activeKpi?.unit ?? 'USD'}
            showYoy={showYoy}
            showMom={showMom}
          />
        )}

        {/* Updated timestamp */}
        {latestHistorical && (
          <p className="text-xs text-gray-400 mt-4">
            Last updated: {format(new Date(latestHistorical.updatedAt), 'MMM d, yyyy h:mm a')}
            {mtdEstimate?.asOfTimestamp && (
              <> · MTD as-of: {format(new Date(mtdEstimate.asOfTimestamp), 'MMM d, yyyy h:mm a')}</>
            )}
            {!activeRetailerId && companyRetailers.length > 1 && (
              <span className="ml-1 text-gray-300">· values aggregated across {companyRetailers.length} retailers</span>
            )}
          </p>
        )}
      </div>

      {/* Data table */}
      {filteredEstimates.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Estimate History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Retailer</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">KPI</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Value</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">As Of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...filteredEstimates]
                  .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))
                  .slice(0, 30)
                  .map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-700 font-medium">
                        {format(parseISO(e.periodMonth), 'MMM yyyy')}
                      </td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{e.retailerName}</td>
                      <td className="px-6 py-3 text-gray-600">{e.kpiName}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.estimateType === 'mtd'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-50 text-blue-600'
                        }`}>
                          {e.estimateType === 'mtd' ? 'MTD' : 'Historical'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">
                        {formatValue(parseFloat(String(e.estimateValue)), e.kpiUnit ?? 'USD')}
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {e.asOfTimestamp ? format(new Date(e.asOfTimestamp), 'MMM d, h:mm a') : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
      }`}
    >
      {label}
    </button>
  )
}
