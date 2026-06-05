import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { kpiEstimates, companies, retailers, kpis } from '../db/schema.js'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { SseEvent, NewEstimatePayload } from '@yipitdata/shared'

const estimatesQuerySchema = z.object({
  kpiId: z.coerce.number().optional(),
  retailerId: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  type: z.enum(['historical', 'mtd', 'all']).optional().default('all'),
})

const publishBodySchema = z.object({
  companyId: z.number(),
  retailerId: z.number(),
  kpiId: z.number(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estimateValue: z.number(),
  estimateType: z.enum(['historical', 'mtd']),
  asOfTimestamp: z.string().optional(),
})

export async function estimateRoutes(fastify: FastifyInstance) {
  // GET /companies/:id/estimates
  fastify.get('/companies/:id/estimates', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const companyId = parseInt(id)
    if (isNaN(companyId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid company id' })
    }

    const query = estimatesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: 'Bad Request', message: query.error.message })
    }

    const { kpiId, retailerId, dateFrom, dateTo, type } = query.data
    const conditions = [eq(kpiEstimates.companyId, companyId)]

    if (kpiId) conditions.push(eq(kpiEstimates.kpiId, kpiId))
    if (retailerId) conditions.push(eq(kpiEstimates.retailerId, retailerId))
    if (dateFrom) conditions.push(gte(kpiEstimates.periodMonth, dateFrom))
    if (dateTo) conditions.push(lte(kpiEstimates.periodMonth, dateTo))
    if (type !== 'all') conditions.push(eq(kpiEstimates.estimateType, type))

    const rows = await db
      .select({
        id: kpiEstimates.id,
        companyId: kpiEstimates.companyId,
        retailerId: kpiEstimates.retailerId,
        retailerName: retailers.name,
        kpiId: kpiEstimates.kpiId,
        kpiName: kpis.name,
        kpiUnit: kpis.unit,
        periodMonth: kpiEstimates.periodMonth,
        estimateValue: kpiEstimates.estimateValue,
        estimateType: kpiEstimates.estimateType,
        asOfTimestamp: kpiEstimates.asOfTimestamp,
        publishedAt: kpiEstimates.publishedAt,
        updatedAt: kpiEstimates.updatedAt,
      })
      .from(kpiEstimates)
      .innerJoin(kpis, eq(kpis.id, kpiEstimates.kpiId))
      .innerJoin(retailers, eq(retailers.id, kpiEstimates.retailerId))
      .where(and(...conditions))
      .orderBy(kpiEstimates.kpiId, kpiEstimates.periodMonth, desc(kpiEstimates.estimateType), kpiEstimates.asOfTimestamp)

    return reply.send(rows)
  })

  // POST /estimates — publish new estimate (admin only)
  fastify.post('/estimates', { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const body = publishBodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Bad Request', message: body.error.message })
    }

    const { companyId, retailerId, kpiId, periodMonth, estimateValue, estimateType, asOfTimestamp } = body.data

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
    if (!company) return reply.status(404).send({ error: 'Not Found', message: 'Company not found' })

    const [retailer] = await db.select().from(retailers).where(eq(retailers.id, retailerId)).limit(1)
    if (!retailer) return reply.status(404).send({ error: 'Not Found', message: 'Retailer not found' })

    const [kpi] = await db.select().from(kpis).where(eq(kpis.id, kpiId)).limit(1)
    if (!kpi) return reply.status(404).send({ error: 'Not Found', message: 'KPI not found' })

    const asOf = asOfTimestamp ? new Date(asOfTimestamp) : (estimateType === 'mtd' ? new Date() : null)

    const [inserted] = await db
      .insert(kpiEstimates)
      .values({
        companyId,
        retailerId,
        kpiId,
        periodMonth,
        estimateValue: String(estimateValue),
        estimateType,
        asOfTimestamp: asOf,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      // Historical rows hit the partial unique index (uq_historical_estimate, where as_of IS NULL) → upsert.
      // MTD rows (as_of IS NOT NULL) never match the partial index → always insert a new intraday snapshot.
      .onConflictDoUpdate({
        target: [kpiEstimates.companyId, kpiEstimates.retailerId, kpiEstimates.kpiId, kpiEstimates.periodMonth, kpiEstimates.estimateType],
        targetWhere: sql`${kpiEstimates.asOfTimestamp} IS NULL`,
        set: {
          estimateValue: String(estimateValue),
          updatedAt: new Date(),
        },
      })
      .returning()

    const payload: NewEstimatePayload = {
      estimateId: inserted!.id,
      companyId,
      companyName: company.name,
      retailerId,
      retailerName: retailer.name,
      kpiId,
      kpiName: kpi.name,
      periodMonth,
      estimateValue,
      estimateType,
      publishedAt: inserted!.publishedAt.toISOString(),
    }

    const event: SseEvent = {
      type: 'NEW_ESTIMATE',
      payload: payload as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    }

    fastify.sseManager.broadcast(event)

    return reply.status(201).send(inserted)
  })

  // GET /kpis
  fastify.get('/kpis', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const rows = await db.select().from(kpis).orderBy(kpis.name)
    return reply.send(rows)
  })
}
