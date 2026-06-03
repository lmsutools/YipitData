import { buildApp } from './app.js'
import { config } from './config.js'

const fastify = buildApp()

fastify.listen({ port: config.PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  fastify.log.info(`YipitData KPI API running on http://localhost:${config.PORT}`)
})
