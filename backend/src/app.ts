import Fastify from 'fastify'
import corsPlugin from './plugins/cors.js'
import jwtPlugin from './plugins/jwt.js'
import ssePlugin from './plugins/sse.js'
import { authRoutes } from './routes/auth.js'
import { sectorRoutes } from './routes/sectors.js'
import { companyRoutes } from './routes/companies.js'
import { estimateRoutes } from './routes/estimates.js'
import { notificationRoutes } from './routes/notifications.js'
import fp from 'fastify-plugin'

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  })

  // Plugins
  fastify.register(corsPlugin)
  fastify.register(jwtPlugin)
  fastify.register(ssePlugin)

  // Routes
  fastify.register(authRoutes)
  fastify.register(sectorRoutes)
  fastify.register(companyRoutes)
  fastify.register(estimateRoutes)
  fastify.register(notificationRoutes)

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return fastify
}
