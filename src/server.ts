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
import { testingRoutes } from './routes/testing'
import { riskRoutes } from './routes/risks'
import { issueRoutes } from './routes/issues'
import { changesRoutes } from './routes/changes'
import { assumptionRoutes } from './routes/assumptions'
import { authPlugin } from './plugins/auth'
import { authRoutes } from './routes/auth'
import { projectsRoutes } from './routes/projects'
import { companiesRoutes } from './routes/companies'
import { plansRoutes } from './routes/plans'
import { invoicesRoutes } from './routes/invoices'
import { registrationRoutes } from './routes/registration'
import { adminStatsRoutes } from './routes/admin-stats'
import { supportRoutes } from './routes/support'
import { tasksRoutes } from './routes/tasks'
import { kanbanColumnsRoutes } from './routes/kanban-columns'
import { taskDependenciesRoutes } from './routes/task-dependencies'
import { workItemsRoutes } from './routes/work-items'
import { workColumnsRoutes } from './routes/work-columns'
import { workflowStepsRoutes } from './routes/workflow-steps'
import { startTrialChecker } from './lib/trial-checker'

const PORT = parseInt(process.env.PORT ?? '3003')

const fastify = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
})

async function main() {
  await fastify.register(cors, { origin: true })
  await fastify.register(authPlugin)

  await fastify.register(staticFiles, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  })

  await fastify.register(authRoutes)
  await fastify.register(projectsRoutes)
  await fastify.register(companiesRoutes)
  await fastify.register(plansRoutes)
  await fastify.register(invoicesRoutes)
  await fastify.register(registrationRoutes)
  await fastify.register(adminStatsRoutes)
  await fastify.register(supportRoutes)
  await fastify.register(tasksRoutes)
  await fastify.register(kanbanColumnsRoutes)
  await fastify.register(taskDependenciesRoutes)
  await fastify.register(workItemsRoutes)
  await fastify.register(workColumnsRoutes)
  await fastify.register(workflowStepsRoutes)
  await fastify.register(itemRoutes)
  await fastify.register(peopleRoutes)
  await fastify.register(categoryRoutes)
  await fastify.register(priorityRoutes)
  await fastify.register(dashboardRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(laborRoutes)
  await fastify.register(auditRoutes)
  await fastify.register(commentRoutes)
  await fastify.register(testingRoutes)
  await fastify.register(riskRoutes)
  await fastify.register(issueRoutes)
  await fastify.register(changesRoutes)
  await fastify.register(assumptionRoutes)

  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`PM Tool running on http://localhost:${PORT}`)

  // Start trial expiration checker
  startTrialChecker()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
