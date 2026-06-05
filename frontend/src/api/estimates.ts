import { apiClient } from './client'
import type { KpiEstimate, Kpi } from '@yipitdata/shared'

export interface EstimateParams {
  kpiId?: number
  retailerId?: number
  dateFrom?: string
  dateTo?: string
  type?: 'historical' | 'mtd' | 'all'
}

export async function fetchEstimates(companyId: number, params?: EstimateParams): Promise<KpiEstimate[]> {
  const { data } = await apiClient.get<KpiEstimate[]>(`/companies/${companyId}/estimates`, { params })
  return data
}

export async function fetchKpis(): Promise<Kpi[]> {
  const { data } = await apiClient.get<Kpi[]>('/kpis')
  return data
}

export async function publishEstimate(body: {
  companyId: number
  retailerId: number
  kpiId: number
  periodMonth: string
  estimateValue: number
  estimateType: 'historical' | 'mtd'
}): Promise<KpiEstimate> {
  const { data } = await apiClient.post<KpiEstimate>('/estimates', body)
  return data
}
