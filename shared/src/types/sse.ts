export type SseEventType = 'NEW_ESTIMATE' | 'ESTIMATE_UPDATED' | 'CONNECTED'

export interface SseEvent {
  type: SseEventType
  payload: Record<string, unknown>
  timestamp: string
}

export interface NewEstimatePayload {
  estimateId: number
  companyId: number
  companyName: string
  retailerId: number
  retailerName: string
  kpiId: number
  kpiName: string
  periodMonth: string
  estimateValue: number
  estimateType: 'historical' | 'mtd'
  publishedAt: string
}
