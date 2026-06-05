import { db } from './client.js'
import { sectors, retailers, companies, kpis, kpiEstimates, users } from './schema.js'
import { sql } from 'drizzle-orm'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// CSV lives at repo root — three levels up from backend/src/db/
const CSV_PATH = resolve(__dirname, '../../../kpi_sample_corporate_compatible.csv')

interface CsvRow {
  company_id: string
  company_name: string
  sector: string
  retailer_id: string
  retailer_name: string
  kpi_id: string
  kpi_name: string
  period_start: string
  estimate_type: string
  value: string
  unit: string
  as_of: string
  last_updated: string
}

async function parseCsv(filePath: string): Promise<CsvRow[]> {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  const rows: CsvRow[] = []
  let headers: string[] = []

  for await (const line of rl) {
    if (!headers.length) {
      headers = line.split(',')
      continue
    }
    const values = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    rows.push(row as unknown as CsvRow)
  }
  return rows
}

async function seed() {
  console.log('🌱 Seeding database from CSV...')

  const rows = await parseCsv(CSV_PATH)
  console.log(`  Parsed ${rows.length} CSV rows`)

  // Clear all tables in one shot — CASCADE handles FK order
  await db.execute(sql`TRUNCATE TABLE kpi_estimates, users, companies, retailers, kpis, sectors RESTART IDENTITY CASCADE`)


  // ── Sectors ───────────────────────────────────────────────────────────────
  const uniqueSectors = [...new Map(rows.map(r => [r.sector, r.sector])).keys()]
  const sectorRows = await db.insert(sectors).values(
    uniqueSectors.map(name => ({
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
    }))
  ).returning()
  const sectorByName = new Map(sectorRows.map(s => [s.name, s]))
  console.log(`  Inserted ${sectorRows.length} sectors`)

  // ── Retailers ─────────────────────────────────────────────────────────────
  const uniqueRetailers = [
    ...new Map(rows.map(r => [r.retailer_id, { id: r.retailer_id, name: r.retailer_name }])).values()
  ]
  const retailerRows = await db.insert(retailers).values(
    uniqueRetailers.map(r => ({ name: r.name, slug: r.id }))
  ).returning()
  const retailerBySlug = new Map(retailerRows.map(r => [r.slug, r]))
  console.log(`  Inserted ${retailerRows.length} retailers`)

  // ── Companies ─────────────────────────────────────────────────────────────
  const uniqueCompanies = [
    ...new Map(rows.map(r => [r.company_id, { id: r.company_id, name: r.company_name, sector: r.sector }])).values()
  ]
  const companyDescriptions: Record<string, string> = {
    trendy_shoe_brand: 'Leading direct-to-consumer footwear brand known for limited-edition drops.',
    urban_step: 'Urban lifestyle footwear label with a strong DTC e-commerce presence.',
    everyday_threads: 'Affordable everyday apparel brand focused on wardrobe basics.',
    northline_apparel: 'Outdoor and performance apparel with a loyal community following.',
    luma_devices: 'Consumer electronics brand specializing in smart home and audio products.',
    studio_sound: 'Premium audio gear and personal electronics for creative professionals.',
    morning_roast: 'Specialty coffee and beverage brand distributed through grocery partners.',
    snackcraft: 'Artisanal snack brand with broad retail distribution across grocery and club.',
    daily_hydrate: 'Functional hydration and wellness beverages sold through fitness and grocery channels.',
    fresh_face_co: 'Clean beauty brand with cult-status skincare lines sold through specialty retail.',
    glow_lab_beauty: 'Science-backed beauty brand with a full skincare and cosmetics portfolio.',
    modern_table: 'Contemporary home furnishings and tabletop accessories brand.',
    nest_home_goods: 'Home décor and organizational goods with a minimalist design aesthetic.',
    little_sprout: 'Baby and toddler essentials brand known for organic and safety-certified products.',
    bright_play: 'Toy and learning product brand targeting ages 0–12 with award-winning designs.',
    pet_patch: 'Natural pet food and accessories brand distributed through pet and grocery retail.',
    pulse_wellness: 'Fitness equipment and wellness supplement brand sold through DTC and gym partners.',
    trailfit_gear: 'Outdoor fitness and trail running gear with a strong running-community presence.',
    clean_kind: 'Eco-friendly household cleaning products with plastic-free packaging.',
    aero_luggage: 'Lightweight premium luggage and travel accessories brand.',
  }
  const companyRows = await db.insert(companies).values(
    uniqueCompanies.map(c => ({
      sectorId: sectorByName.get(c.sector)!.id,
      name: c.name,
      slug: c.id,
      description: companyDescriptions[c.id] ?? null,
    }))
  ).returning()
  const companyBySlug = new Map(companyRows.map(c => [c.slug, c]))
  console.log(`  Inserted ${companyRows.length} companies`)

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpiDescriptions: Record<string, { unit: string; description: string }> = {
    gmv:        { unit: 'USD',   description: 'Gross Merchandise Value — total sales dollar amount' },
    units_sold: { unit: 'units', description: 'Total number of units sold' },
    asp:        { unit: 'USD',   description: 'Average Sales Price per unit' },
  }
  const uniqueKpis = [...new Map(rows.map(r => [r.kpi_id, { id: r.kpi_id, name: r.kpi_name, unit: r.unit }])).values()]
  const kpiRows = await db.insert(kpis).values(
    uniqueKpis.map(k => ({
      name: k.name,
      unit: kpiDescriptions[k.id]?.unit ?? k.unit,
      description: kpiDescriptions[k.id]?.description ?? null,
    }))
  ).returning()
  const kpiByName = new Map(kpiRows.map(k => [k.name, k]))
  console.log(`  Inserted ${kpiRows.length} KPIs`)

  // ── Users ─────────────────────────────────────────────────────────────────
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

  // ── Estimates ─────────────────────────────────────────────────────────────
  const estimateRows: (typeof kpiEstimates.$inferInsert)[] = []

  for (const row of rows) {
    const company = companyBySlug.get(row.company_id)
    const retailer = retailerBySlug.get(row.retailer_id)
    const kpi = kpiByName.get(row.kpi_name)

    if (!company || !retailer || !kpi) {
      console.warn(`  Skipping row — missing ref: company=${row.company_id} retailer=${row.retailer_id} kpi=${row.kpi_name}`)
      continue
    }

    const periodMonth = row.period_start.substring(0, 10)   // YYYY-MM-DD
    const asOf = row.as_of ? new Date(row.as_of) : null
    const lastUpdated = row.last_updated ? new Date(row.last_updated) : new Date()

    estimateRows.push({
      companyId: company.id,
      retailerId: retailer.id,
      kpiId: kpi.id,
      periodMonth,
      estimateValue: row.value,
      estimateType: row.estimate_type as 'historical' | 'mtd',
      asOfTimestamp: asOf,
      publishedAt: lastUpdated,
      updatedAt: lastUpdated,
    })
  }

  // Insert in batches of 100
  let inserted = 0
  for (let i = 0; i < estimateRows.length; i += 100) {
    await db.insert(kpiEstimates).values(estimateRows.slice(i, i + 100))
    inserted += Math.min(100, estimateRows.length - i)
  }

  console.log(`✅ Seeded: ${companyRows.length} companies, ${retailerRows.length} retailers, ${kpiRows.length} KPIs, ${inserted} estimates`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
