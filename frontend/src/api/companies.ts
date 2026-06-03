import { apiClient } from './client'
import type { Company, Sector } from '@yipitdata/shared'

export async function fetchSectors(): Promise<Sector[]> {
  const { data } = await apiClient.get<Sector[]>('/sectors')
  return data
}

export async function fetchCompanies(params?: { sector?: string; search?: string }): Promise<Company[]> {
  const { data } = await apiClient.get<Company[]>('/companies', { params })
  return data
}

export async function fetchCompany(id: number): Promise<Company & { mtdEstimates: MtdEstimate[] }> {
  const { data } = await apiClient.get(`/companies/${id}`)
  return data
}

export interface MtdEstimate {
  kpiId: number
  kpiName: string
  kpiUnit: string
  estimateValue: string
  periodMonth: string
  asOfTimestamp: string | null
  updatedAt: string
}
