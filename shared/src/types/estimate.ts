export type EstimateType = 'historical' | 'mtd'

export interface KpiEstimate {
  id: number
  companyId: number
  kpiId: number
  kpiName?: string
  kpiUnit?: string
  periodMonth: string        // ISO date string: first day of month
  estimateValue: number
  estimateType: EstimateType
  asOfTimestamp: string | null
  publishedAt: string
  updatedAt: string
}

export interface EstimateWithComparison extends KpiEstimate {
  momDelta: number | null     // month-over-month % change
  yoyDelta: number | null     // year-over-year % change
}

export interface PublishEstimateBody {
  companyId: number
  kpiId: number
  periodMonth: string
  estimateValue: number
  estimateType: EstimateType
  asOfTimestamp?: string
}
