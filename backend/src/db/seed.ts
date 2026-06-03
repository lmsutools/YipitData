import { db } from './client.js'
import { sectors, companies, kpis, kpiEstimates, users } from './schema.js'
import { subMonths, startOfMonth, format } from 'date-fns'

async function seed() {
  console.log('🌱 Seeding database...')

  // Clear existing data
  await db.delete(kpiEstimates)
  await db.delete(users)
  await db.delete(companies)
  await db.delete(kpis)
  await db.delete(sectors)

  // Sectors
  const [footwear, apparel, electronics] = await db.insert(sectors).values([
    { name: 'Footwear', slug: 'footwear' },
    { name: 'Apparel', slug: 'apparel' },
    { name: 'Electronics', slug: 'electronics' },
  ]).returning()

  // Companies
  const [tsb, nike, adidas, zara, hm, samsung] = await db.insert(companies).values([
    {
      sectorId: footwear!.id,
      name: 'Trendy Shoe Brand',
      slug: 'trendy-shoe-brand',
      description: 'Leading direct-to-consumer footwear brand known for limited-edition drops.',
    },
    {
      sectorId: footwear!.id,
      name: 'Nike',
      slug: 'nike',
      description: 'Global athletic footwear and apparel leader.',
    },
    {
      sectorId: footwear!.id,
      name: 'Adidas',
      slug: 'adidas',
      description: 'International sportswear and footwear manufacturer.',
    },
    {
      sectorId: apparel!.id,
      name: 'Zara',
      slug: 'zara',
      description: 'Fast-fashion global retailer by Inditex.',
    },
    {
      sectorId: apparel!.id,
      name: 'H&M',
      slug: 'hm',
      description: 'Swedish multinational retail-clothing company.',
    },
    {
      sectorId: electronics!.id,
      name: 'Samsung',
      slug: 'samsung',
      description: 'South Korean multinational electronics corporation.',
    },
  ]).returning()

  // KPIs
  const [gmv, units, asp] = await db.insert(kpis).values([
    { name: 'GMV', unit: 'USD', description: 'Gross Merchandise Value — total sales dollar amount' },
    { name: 'Units Sold', unit: 'units', description: 'Total number of units sold' },
    { name: 'ASP', unit: 'USD', description: 'Average Sales Price per unit' },
  ]).returning()

  // Users (passwords are bcrypt of the plain text shown — we store pre-hashed for simplicity)
  // admin123 and user123 — hashed with bcrypt cost 10
  await db.insert(users).values([
    {
      email: 'admin@yipit.com',
      passwordHash: '$2b$10$xV5Y4HsXbJFx5S3UkZl7AOMl6mVcjzIFiYsX3E5VNE1VGl7SFpOca',
      role: 'admin',
    },
    {
      email: 'user@yipit.com',
      passwordHash: '$2b$10$4LxEJOdqiFlYiOtjpbO9te26u/H3G.TqtZ3xFHaQbkI9vvXgLBsOC',
      role: 'viewer',
    },
  ])

  // Generate 13 months of historical estimates + 1 MTD
  const allCompanies = [tsb!, nike!, adidas!, zara!, hm!, samsung!]
  const allKpis = [gmv!, units!, asp!]

  // Base monthly GMV values per company (in millions USD)
  const baseGmv: Record<string, number> = {
    'trendy-shoe-brand': 28_000_000,
    'nike': 1_100_000_000,
    'adidas': 600_000_000,
    'zara': 450_000_000,
    'hm': 380_000_000,
    'samsung': 2_800_000_000,
  }

  const baseUnits: Record<string, number> = {
    'trendy-shoe-brand': 120_000,
    'nike': 4_500_000,
    'adidas': 2_800_000,
    'zara': 3_200_000,
    'hm': 5_000_000,
    'samsung': 6_000_000,
  }

  const now = new Date()
  const estimateRows: (typeof kpiEstimates.$inferInsert)[] = []

  for (const company of allCompanies) {
    const gmvBase = baseGmv[company.slug]!
    const unitsBase = baseUnits[company.slug]!

    for (let i = 13; i >= 1; i--) {
      const monthDate = startOfMonth(subMonths(now, i))
      const periodMonth = format(monthDate, 'yyyy-MM-dd')

      // Seasonal multiplier: Q4 boost, Q1 dip
      const month = monthDate.getMonth() + 1
      const seasonal = month >= 10 ? 1.25 : month <= 2 ? 0.85 : 1.0
      // YOY growth: ~8% annually
      const yoyFactor = i > 12 ? 0.92 : 1.0
      const noise = () => 0.92 + Math.random() * 0.16

      const gmvValue = Math.round(gmvBase * seasonal * yoyFactor * noise())
      const unitsValue = Math.round(unitsBase * seasonal * yoyFactor * noise())
      const aspValue = Math.round((gmvValue / unitsValue) * 100) / 100

      estimateRows.push(
        { companyId: company.id, kpiId: gmv!.id, periodMonth, estimateValue: String(gmvValue), estimateType: 'historical', publishedAt: new Date(), updatedAt: new Date() },
        { companyId: company.id, kpiId: units!.id, periodMonth, estimateValue: String(unitsValue), estimateType: 'historical', publishedAt: new Date(), updatedAt: new Date() },
        { companyId: company.id, kpiId: asp!.id, periodMonth, estimateValue: String(aspValue), estimateType: 'historical', publishedAt: new Date(), updatedAt: new Date() },
      )
    }

    // MTD estimate for current month
    const currentPeriod = format(startOfMonth(now), 'yyyy-MM-dd')
    const mtdFraction = now.getDate() / 28  // approx month progress
    const seasonal = (now.getMonth() + 1) >= 10 ? 1.25 : (now.getMonth() + 1) <= 2 ? 0.85 : 1.0
    const gmvMtd = Math.round(gmvBase * seasonal * mtdFraction * (0.95 + Math.random() * 0.1))
    const unitsMtd = Math.round(unitsBase * seasonal * mtdFraction * (0.95 + Math.random() * 0.1))
    const aspMtd = Math.round((gmvMtd / unitsMtd) * 100) / 100

    estimateRows.push(
      { companyId: company.id, kpiId: gmv!.id, periodMonth: currentPeriod, estimateValue: String(gmvMtd), estimateType: 'mtd', asOfTimestamp: now, publishedAt: now, updatedAt: now },
      { companyId: company.id, kpiId: units!.id, periodMonth: currentPeriod, estimateValue: String(unitsMtd), estimateType: 'mtd', asOfTimestamp: now, publishedAt: now, updatedAt: now },
      { companyId: company.id, kpiId: asp!.id, periodMonth: currentPeriod, estimateValue: String(aspMtd), estimateType: 'mtd', asOfTimestamp: now, publishedAt: now, updatedAt: now },
    )
  }

  // Insert in batches of 50
  for (let i = 0; i < estimateRows.length; i += 50) {
    await db.insert(kpiEstimates).values(estimateRows.slice(i, i + 50))
  }

  console.log(`✅ Seeded: ${allCompanies.length} companies, ${allKpis.length} KPIs, ${estimateRows.length} estimates`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
