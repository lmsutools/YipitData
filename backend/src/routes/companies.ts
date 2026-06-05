import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { companies, sectors, retailers, kpiEstimates, kpis } from '../db/schema.js'
import { eq, ilike, or, and, desc, sql } from 'drizzle-orm'
import { z } from 'zod'

const listQuerySchema = z.object({
  sector: z.string().optional(),
  search: z.string().optional(),
})

export async function companyRoutes(fastify: FastifyInstance) {
  // GET /retailers
  fastify.get('/retailers', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const rows = await db.select().from(retailers).orderBy(retailers.name)
    return reply.send(rows)
  })

  // GET /companies
  fastify.get('/companies', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: 'Bad Request', message: query.error.message })
    }

    const { sector, search } = query.data
    const conditions = []

    if (sector) {
      conditions.push(eq(sectors.slug, sector))
    }
    if (search) {
      conditions.push(
        or(
          ilike(companies.name, `%${search}%`),
          ilike(sectors.name, `%${search}%`),
          ilike(companies.description, `%${search}%`),
        )!,
      )
    }

    const rows = await db
      .select({
        id: companies.id,
        sectorId: companies.sectorId,
        sectorName: sectors.name,
        sectorSlug: sectors.slug,
        name: companies.name,
        slug: companies.slug,
        description: companies.description,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .innerJoin(sectors, eq(sectors.id, companies.sectorId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sectors.name, companies.name)

    return reply.send(rows)
  })

  // GET /companies/:id — returns company detail with retailers and latest MTD snapshot
  fastify.get('/companies/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const companyId = parseInt(id)
    if (isNaN(companyId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid company id' })
    }

    const [company] = await db
      .select({
        id: companies.id,
        sectorId: companies.sectorId,
        sectorName: sectors.name,
        sectorSlug: sectors.slug,
        name: companies.name,
        slug: companies.slug,
        description: companies.description,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .innerJoin(sectors, eq(sectors.id, companies.sectorId))
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company) {
      return reply.status(404).send({ error: 'Not Found', message: 'Company not found' })
    }

    // Retailers that carry this company (from estimates data)
    const companyRetailers = await db
      .selectDistinct({ id: retailers.id, name: retailers.name, slug: retailers.slug })
      .from(kpiEstimates)
      .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
      .where(eq(kpiEstimates.companyId, companyId))
      .orderBy(retailers.name)

    // Latest MTD snapshot per (retailer, kpi) — most recent as_of per group
    const mtdEstimates = await db
      .select({
        retailerId: retailers.id,
        retailerName: retailers.name,
        kpiId: kpis.id,
        kpiName: kpis.name,
        kpiUnit: kpis.unit,
        estimateValue: kpiEstimates.estimateValue,
        periodMonth: kpiEstimates.periodMonth,
        asOfTimestamp: kpiEstimates.asOfTimestamp,
        updatedAt: kpiEstimates.updatedAt,
      })
      .from(kpiEstimates)
      .innerJoin(kpis, eq(kpis.id, kpiEstimates.kpiId))
      .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
      .where(and(eq(kpiEstimates.companyId, companyId), eq(kpiEstimates.estimateType, 'mtd')))
      .orderBy(desc(kpiEstimates.periodMonth), desc(kpiEstimates.asOfTimestamp))

    // Deduplicate: keep only the latest snapshot per (retailer, kpi)
    const latestMtdMap = new Map<string, typeof mtdEstimates[0]>()
    for (const e of mtdEstimates) {
      const key = `${e.retailerId}:${e.kpiId}`
      if (!latestMtdMap.has(key)) latestMtdMap.set(key, e)
    }

    return reply.send({
      ...company,
      retailers: companyRetailers,
      mtdEstimates: [...latestMtdMap.values()],
    })
  })
}
