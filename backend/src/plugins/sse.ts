import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { SseEvent } from '@yipitdata/shared'

class SseManager {
  private clients = new Map<string, FastifyReply>()

  add(clientId: string, reply: FastifyReply) {
    this.clients.set(clientId, reply)
  }

  remove(clientId: string) {
    this.clients.delete(clientId)
  }

  broadcast(event: SseEvent) {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
    for (const [id, reply] of this.clients) {
      try {
        reply.raw.write(data)
      } catch {
        this.clients.delete(id)
      }
    }
  }

  get count() {
    return this.clients.size
  }
}

export const sseManager = new SseManager()

export default fp(async function (fastify: FastifyInstance) {
  fastify.decorate('sseManager', sseManager)
})

declare module 'fastify' {
  interface FastifyInstance {
    sseManager: SseManager
  }
}
