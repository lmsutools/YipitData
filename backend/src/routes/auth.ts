import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Simple constant-time string comparison to avoid timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

// Hardcoded plain-text passwords mapped to emails for assessment simplicity
const PLAIN_PASSWORDS: Record<string, string> = {
  'admin@yipit.com': 'admin123',
  'user@yipit.com': 'user123',
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Bad Request', message: body.error.message })
    }

    const { email, password } = body.data
    const expectedPassword = PLAIN_PASSWORDS[email]
    if (!expectedPassword || !safeCompare(password, expectedPassword)) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' })
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    return reply.send({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    })
  })
}
