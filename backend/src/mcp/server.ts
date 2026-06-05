#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { db } from '../db/client.js'
import { sectors, retailers, companies, kpis, kpiEstimates } from '../db/schema.js'
import { eq, and, gte, lte, desc, ilike, or, sql } from 'drizzle-orm'

const server = new Server(
  { name: 'yipitdata-kpi', version: '1.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_sectors',
      description: 'List all available sectors (e.g. Footwear, Apparel, Electronics, Beauty, Grocery) with company counts.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_retailers',
      description: 'List all retail channels/partners that distribute company products (e.g. Sole City, Market Square, StyleMart).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_companies',
      description: 'List companies, optionally filtered by sector slug or a search term.',
      inputSchema: {
        type: 'object',
        properties: {
          sector: { type: 'string', description: 'Sector slug (e.g. "footwear", "beauty", "grocery")' },
          search: { type: 'string', description: 'Partial name search across company and sector names' },
        },
      },
    },
    {
      name: 'get_company',
      description: 'Get detailed information about a specific company including its retail partners and latest MTD KPI snapshot per retailer.',
      inputSchema: {
        type: 'object',
        properties: {
          companyId: { type: 'number', description: 'Company ID' },
        },
        required: ['companyId'],
      },
    },
    {
      name: 'list_kpis',
      description: 'List all available KPI definitions (GMV, Units Sold, ASP).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_estimates',
      description: 'Get time-series KPI estimates for a company. Can filter by retailer, KPI, date range, and estimate type. MTD rows include multiple intraday snapshots (as_of_timestamp).',
      inputSchema: {
        type: 'object',
        properties: {
          companyId: { type: 'number', description: 'Company ID' },
          kpiId: { type: 'number', description: 'KPI ID (optional — omit for all KPIs)' },
          retailerId: { type: 'number', description: 'Retailer ID (optional — omit for all retailers)' },
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (optional)' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
          type: { type: 'string', enum: ['historical', 'mtd', 'all'], description: 'Filter by estimate type (default: all)' },
        },
        required: ['companyId'],
      },
    },
    {
      name: 'get_mtd_snapshot',
      description: 'Get the latest Month-to-Date (MTD) estimates for a company, showing current month performance. Returns the most recent intraday snapshot per retailer+KPI combination.',
      inputSchema: {
        type: 'object',
        properties: {
          companyId: { type: 'number', description: 'Company ID' },
          kpiId: { type: 'number', description: 'KPI ID (optional — omit for all KPIs)' },
          retailerId: { type: 'number', description: 'Retailer ID (optional — omit for all retailers)' },
        },
        required: ['companyId'],
      },
    },
    {
      name: 'compare_periods',
      description: 'Compare a KPI value between two periods for YOY or MOM analysis. Optionally scope to a specific retailer. Returns absolute and percentage delta.',
      inputSchema: {
        type: 'object',
        properties: {
          companyId: { type: 'number', description: 'Company ID' },
          kpiId: { type: 'number', description: 'KPI ID' },
          period1: { type: 'string', description: 'Earlier period (YYYY-MM-DD, first of month)' },
          period2: { type: 'string', description: 'Later period (YYYY-MM-DD, first of month)' },
          retailerId: { type: 'number', description: 'Retailer ID (optional — aggregates across all retailers if omitted)' },
        },
        required: ['companyId', 'kpiId', 'period1', 'period2'],
      },
    },
    {
      name: 'publish_estimate',
      description: 'Publish a new KPI estimate for a company+retailer combination. Use estimateType="mtd" for intra-month updates.',
      inputSchema: {
        type: 'object',
        properties: {
          companyId: { type: 'number' },
          retailerId: { type: 'number' },
          kpiId: { type: 'number' },
          periodMonth: { type: 'string', description: 'First day of target month (YYYY-MM-DD)' },
          estimateValue: { type: 'number' },
          estimateType: { type: 'string', enum: ['historical', 'mtd'] },
        },
        required: ['companyId', 'retailerId', 'kpiId', 'periodMonth', 'estimateValue', 'estimateType'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'list_sectors': {
        const rows = await db
          .select({ id: sectors.id, name: sectors.name, slug: sectors.slug })
          .from(sectors)
          .orderBy(sectors.name)
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
      }

      case 'list_retailers': {
        const rows = await db
          .select({ id: retailers.id, name: retailers.name, slug: retailers.slug })
          .from(retailers)
          .orderBy(retailers.name)
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
      }

      case 'list_companies': {
        const { sector, search } = args as { sector?: string; search?: string }
        const conditions = []
        if (sector) conditions.push(eq(sectors.slug, sector))
        if (search) conditions.push(or(ilike(companies.name, `%${search}%`), ilike(sectors.name, `%${search}%`))!)
        const rows = await db
          .select({ id: companies.id, name: companies.name, slug: companies.slug, sector: sectors.name, description: companies.description })
          .from(companies)
          .innerJoin(sectors, eq(sectors.id, companies.sectorId))
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(sectors.name, companies.name)
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
      }

      case 'get_company': {
        const { companyId } = args as { companyId: number }
        const [company] = await db
          .select({ id: companies.id, name: companies.name, slug: companies.slug, description: companies.description, sector: sectors.name })
          .from(companies)
          .innerJoin(sectors, eq(sectors.id, companies.sectorId))
          .where(eq(companies.id, companyId))
          .limit(1)
        if (!company) return { content: [{ type: 'text', text: `Company ${companyId} not found` }] }

        // Retailers for this company
        const companyRetailers = await db
          .selectDistinct({ id: retailers.id, name: retailers.name, slug: retailers.slug })
          .from(kpiEstimates)
          .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
          .where(eq(kpiEstimates.companyId, companyId))
          .orderBy(retailers.name)

        return { content: [{ type: 'text', text: JSON.stringify({ ...company, retailers: companyRetailers }, null, 2) }] }
      }

      case 'list_kpis': {
        const rows = await db.select().from(kpis).orderBy(kpis.name)
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
      }

      case 'get_estimates': {
        const { companyId, kpiId, retailerId, dateFrom, dateTo, type = 'all' } = args as {
          companyId: number; kpiId?: number; retailerId?: number; dateFrom?: string; dateTo?: string; type?: string
        }
        const conds = [eq(kpiEstimates.companyId, companyId)]
        if (kpiId) conds.push(eq(kpiEstimates.kpiId, kpiId))
        if (retailerId) conds.push(eq(kpiEstimates.retailerId, retailerId))
        if (dateFrom) conds.push(gte(kpiEstimates.periodMonth, dateFrom))
        if (dateTo) conds.push(lte(kpiEstimates.periodMonth, dateTo))
        if (type !== 'all') conds.push(eq(kpiEstimates.estimateType, type as 'historical' | 'mtd'))
        const rows = await db
          .select({
            retailerName: retailers.name,
            kpiName: kpis.name, kpiUnit: kpis.unit,
            periodMonth: kpiEstimates.periodMonth,
            estimateValue: kpiEstimates.estimateValue,
            estimateType: kpiEstimates.estimateType,
            asOfTimestamp: kpiEstimates.asOfTimestamp,
            updatedAt: kpiEstimates.updatedAt,
          })
          .from(kpiEstimates)
          .innerJoin(kpis, eq(kpis.id, kpiEstimates.kpiId))
          .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
          .where(and(...conds))
          .orderBy(retailers.name, kpiEstimates.kpiId, kpiEstimates.periodMonth, kpiEstimates.asOfTimestamp)
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
      }

      case 'get_mtd_snapshot': {
        const { companyId, kpiId, retailerId } = args as { companyId: number; kpiId?: number; retailerId?: number }
        const conds = [eq(kpiEstimates.companyId, companyId), eq(kpiEstimates.estimateType, 'mtd')]
        if (kpiId) conds.push(eq(kpiEstimates.kpiId, kpiId))
        if (retailerId) conds.push(eq(kpiEstimates.retailerId, retailerId))

        const allMtd = await db
          .select({
            retailerId: retailers.id,
            retailerName: retailers.name,
            kpiId: kpis.id,
            kpiName: kpis.name, kpiUnit: kpis.unit,
            periodMonth: kpiEstimates.periodMonth,
            estimateValue: kpiEstimates.estimateValue,
            asOfTimestamp: kpiEstimates.asOfTimestamp,
          })
          .from(kpiEstimates)
          .innerJoin(kpis, eq(kpis.id, kpiEstimates.kpiId))
          .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
          .where(and(...conds))
          .orderBy(desc(kpiEstimates.periodMonth), desc(kpiEstimates.asOfTimestamp))

        // Return only latest snapshot per (retailer, kpi)
        const seen = new Map<string, typeof allMtd[0]>()
        for (const row of allMtd) {
          const key = `${row.retailerId}:${row.kpiId}`
          if (!seen.has(key)) seen.set(key, row)
        }
        return { content: [{ type: 'text', text: JSON.stringify([...seen.values()], null, 2) }] }
      }

      case 'compare_periods': {
        const { companyId, kpiId, period1, period2, retailerId } = args as {
          companyId: number; kpiId: number; period1: string; period2: string; retailerId?: number
        }

        const baseConds1 = [
          eq(kpiEstimates.companyId, companyId),
          eq(kpiEstimates.kpiId, kpiId),
          eq(kpiEstimates.periodMonth, period1),
          eq(kpiEstimates.estimateType, 'historical'),
        ]
        const baseConds2 = [
          eq(kpiEstimates.companyId, companyId),
          eq(kpiEstimates.kpiId, kpiId),
          eq(kpiEstimates.periodMonth, period2),
          eq(kpiEstimates.estimateType, 'historical'),
        ]
        if (retailerId) {
          baseConds1.push(eq(kpiEstimates.retailerId, retailerId))
          baseConds2.push(eq(kpiEstimates.retailerId, retailerId))
        }

        const rows1 = await db.select({ value: kpiEstimates.estimateValue, retailerName: retailers.name })
          .from(kpiEstimates)
          .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
          .where(and(...baseConds1))
        const rows2 = await db.select({ value: kpiEstimates.estimateValue, retailerName: retailers.name })
          .from(kpiEstimates)
          .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
          .where(and(...baseConds2))

        if (!rows1.length || !rows2.length) {
          return { content: [{ type: 'text', text: 'One or both periods not found' }] }
        }

        const v1 = rows1.reduce((s, r) => s + parseFloat(r.value), 0)
        const v2 = rows2.reduce((s, r) => s + parseFloat(r.value), 0)
        const delta = v2 - v1
        const pct = v1 !== 0 ? ((delta / v1) * 100).toFixed(2) : null
        const scope = retailerId ? `retailer_id=${retailerId}` : 'all retailers aggregated'

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              scope,
              period1, value1: v1,
              period2, value2: v2,
              absoluteDelta: delta,
              percentageDelta: pct ? `${pct}%` : 'N/A',
            }, null, 2),
          }],
        }
      }

      case 'publish_estimate': {
        const { companyId, retailerId, kpiId, periodMonth, estimateValue, estimateType } = args as {
          companyId: number; retailerId: number; kpiId: number; periodMonth: string; estimateValue: number; estimateType: 'historical' | 'mtd'
        }
        const asOf = estimateType === 'mtd' ? new Date() : null
        const [inserted] = await db.insert(kpiEstimates).values({
          companyId, retailerId, kpiId, periodMonth,
          estimateValue: String(estimateValue),
          estimateType,
          asOfTimestamp: asOf,
          publishedAt: new Date(), updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [kpiEstimates.companyId, kpiEstimates.retailerId, kpiEstimates.kpiId, kpiEstimates.periodMonth, kpiEstimates.estimateType],
          targetWhere: sql`${kpiEstimates.asOfTimestamp} IS NULL`,
          set: { estimateValue: String(estimateValue), updatedAt: new Date() },
        })
        .returning()
        return { content: [{ type: 'text', text: `Published estimate id=${inserted!.id} for company=${companyId} retailer=${retailerId}` }] }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('YipitData MCP server running on stdio')
}

main().catch(console.error)
