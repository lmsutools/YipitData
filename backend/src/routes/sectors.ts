import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { sectors, companies } from '../db/schema.js'
import { count, eq } from 'drizzle-orm'

export async function sectorRoutes(fastify: FastifyInstance) {
  fastify.get('/sectors', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const rows = await db
      .select({
        id: sectors.id,
        name: sectors.name,
        slug: sectors.slug,
        createdAt: sectors.createdAt,
        companyCount: count(companies.id),
      })
      .from(sectors)
      .leftJoin(companies, eq(companies.sectorId, sectors.id))
      .groupBy(sectors.id)
      .orderBy(sectors.name)

    return reply.send(rows)
  })
}
