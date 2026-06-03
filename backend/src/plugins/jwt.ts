import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { config } from '../config.js'

export default fp(async function (fastify: FastifyInstance) {
  fastify.register(jwtPlugin, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '8h' },
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' })
    }
  })

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' })
    }
    const payload = request.user as { role: string }
    if (payload.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin role required' })
    }
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
