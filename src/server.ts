import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import path from 'path'
import { itemRoutes } from './routes/items'
import { peopleRoutes } from './routes/people'
import { categoryRoutes } from './routes/categories'
import { priorityRoutes } from './routes/priorities'
import { dashboardRoutes } from './routes/dashboard'
import { settingsRoutes } from './routes/settings'
import { laborRoutes } from './routes/labor'
import { auditRoutes } from './routes/audit'
import { commentRoutes } from './routes/comments'

const PORT = parseInt(process.env.PORT ?? '3003')

const fastify = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
})

async function main() {
  await fastify.register(cors, { origin: true })

  await fastify.register(staticFiles, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  })

  await fastify.register(itemRoutes)
  await fastify.register(peopleRoutes)
  await fastify.register(categoryRoutes)
  await fastify.register(priorityRoutes)
  await fastify.register(dashboardRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(laborRoutes)
  await fastify.register(auditRoutes)
  await fastify.register(commentRoutes)

  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`Budget Tracker running on http://localhost:${PORT}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
