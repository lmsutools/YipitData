import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'

export async function notificationRoutes(fastify: FastifyInstance) {
  // SSE stream — token passed as query param because EventSource doesn't support headers
  fastify.get('/notifications/stream', async (request, reply) => {
    const { token } = request.query as { token?: string }
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing token' })
    }

    // Verify JWT
    try {
      fastify.jwt.verify(token)
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token' })
    }

    const clientId = randomUUID()

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // Send initial connected event
    reply.raw.write(`event: CONNECTED\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`)

    // Keep-alive ping every 25s
    const keepAlive = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n')
      } catch {
        clearInterval(keepAlive)
      }
    }, 25_000)

    fastify.sseManager.add(clientId, reply)

    request.raw.on('close', () => {
      clearInterval(keepAlive)
      fastify.sseManager.remove(clientId)
    })

    // Don't call reply.send() — we manage the stream manually
    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve)
    })
  })
}
