import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchCompanies, fetchSectors } from '../api/companies'
import { fetchEstimates } from '../api/estimates'
import { Sparkline } from '../components/charts/Sparkline'
import { formatValue } from '../utils/format'

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useMemo(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function CompanyCard({ company }: { company: { id: number; name: string; slug: string; sectorName?: string; description?: string | null } }) {
  const { data: estimates } = useQuery({
    queryKey: ['estimates', company.id, 'gmv-sparkline'],
    queryFn: () => fetchEstimates(company.id, { type: 'historical' }),
    staleTime: 5 * 60 * 1000,
  })

  const gmvData = useMemo(() => {
    if (!estimates) return []
    return estimates
      .filter((e) => e.kpiName === 'GMV')
      .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
      .slice(-6)
      .map((e) => parseFloat(String(e.estimateValue)))
  }, [estimates])

  const latestGmv = gmvData[gmvData.length - 1]
  const prevGmv = gmvData[gmvData.length - 2]
  const momPct = latestGmv && prevGmv ? (((latestGmv - prevGmv) / prevGmv) * 100).toFixed(1) : null

  return (
    <Link
      to={`/companies/${company.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            {company.name}
          </h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">
            {company.sectorName}
          </span>
        </div>
        <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {gmvData.length > 0 && (
        <>
          <Sparkline data={gmvData} color={momPct !== null && parseFloat(momPct) < 0 ? '#ef4444' : '#3b82f6'} />
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-500">Latest GMV</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {formatValue(latestGmv!, 'USD', true)}
              </span>
              {momPct !== null && (
                <span className={`text-xs font-medium ${parseFloat(momPct) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {parseFloat(momPct) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(momPct))}%
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {company.description && (
        <p className="text-xs text-gray-400 mt-2 line-clamp-2">{company.description}</p>
      )}
    </Link>
  )
}

export function DashboardPage() {
  const [search, setSearch] = useState('')
  const [activeSector, setActiveSector] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors'],
    queryFn: fetchSectors,
    staleTime: 10 * 60 * 1000,
  })

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies', activeSector, debouncedSearch],
    queryFn: () => fetchCompanies({
      sector: activeSector ?? undefined,
      search: debouncedSearch || undefined,
    }),
    staleTime: 2 * 60 * 1000,
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">KPI Dashboard</h1>
        <p className="text-gray-500 mt-1">Browse brand and retailer performance estimates</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies, sectors…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
      </div>

      {/* Sector filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveSector(null)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeSector === null
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
          }`}
        >
          All Sectors
        </button>
        {sectors.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSector(s.slug === activeSector ? null : s.slug)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeSector === s.slug
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
            }`}
          >
            {s.name}
            <span className="ml-1.5 text-xs opacity-70">({s.companyCount})</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 h-40 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-50 rounded w-1/3 mb-4" />
              <div className="h-10 bg-gray-50 rounded" />
            </div>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No companies found for your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c as typeof c & { sectorName?: string }} />
          ))}
        </div>
      )}
    </div>
  )
}
