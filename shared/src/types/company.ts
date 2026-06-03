export interface Sector {
  id: number
  name: string
  slug: string
  companyCount?: number
  createdAt: string
}

export interface Company {
  id: number
  sectorId: number
  sectorName?: string
  name: string
  slug: string
  description: string | null
  createdAt: string
}
