import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { companies, sectors, kpiEstimates, kpis } from '../db/schema.js'
import { eq, ilike, or, and, desc, sql } from 'drizzle-orm'
import { z } from 'zod'

const listQuerySchema = z.object({
  sector: z.string().optional(),
  search: z.string().optional(),
})

export async function companyRoutes(fastify: FastifyInstance) {
  // List companies
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

  // Get single company with latest MTD snapshot summary
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

    // Latest MTD estimates for this company
    const mtdEstimates = await db
      .select({
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
      .where(and(eq(kpiEstimates.companyId, companyId), eq(kpiEstimates.estimateType, 'mtd')))
      .orderBy(desc(kpiEstimates.periodMonth))

    return reply.send({ ...company, mtdEstimates })
  })
}
