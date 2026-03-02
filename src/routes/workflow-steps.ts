import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'
import { logAudit } from './audit'

const usr = (req: any) => req.authUser?.name ?? 'System'
const CAT = 'Work Board'

export async function workflowStepsRoutes(fastify: FastifyInstance) {
  // GET /api/workflow-steps — list for project
  fastify.get('/api/workflow-steps', async (req) => {
    const projectId = (req as any).projectId ?? 1
    return prisma.workflowStep.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    })
  })

  // POST /api/workflow-steps — create (admin+)
  fastify.post('/api/workflow-steps', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      name: z.string().min(1).max(100),
      notifyEmail: z.boolean().default(false),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const maxOrder = await prisma.workflowStep.aggregate({ where: { projectId }, _max: { sortOrder: true } })
    const step = await prisma.workflowStep.create({
      data: {
        projectId,
        name: body.data.name,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        notifyEmail: body.data.notifyEmail,
      },
    })
    await logAudit({ user: usr(req), category: CAT, entity: 'WorkflowStep', action: 'CREATE', entityId: step.id, summary: `Created workflow step: "${step.name}" (email: ${step.notifyEmail})`, projectId })
    return reply.status(201).send(step)
  })

  // PUT /api/workflow-steps/:id — update
  fastify.put('/api/workflow-steps/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const stepId = parseInt(id)

    const existing = await prisma.workflowStep.findFirst({ where: { id: stepId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Workflow step not found' })

    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      notifyEmail: z.boolean().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const step = await prisma.workflowStep.update({
      where: { id: stepId },
      data: body.data,
    })
    await logAudit({ user: usr(req), category: CAT, entity: 'WorkflowStep', action: 'UPDATE', entityId: stepId, summary: `Updated workflow step: "${step.name}" (email: ${step.notifyEmail})`, projectId })
    return step
  })

  // DELETE /api/workflow-steps/:id — delete
  fastify.delete('/api/workflow-steps/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const stepId = parseInt(id)

    const existing = await prisma.workflowStep.findFirst({ where: { id: stepId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Workflow step not found' })

    await prisma.workflowStep.delete({ where: { id: stepId } })
    await logAudit({ user: usr(req), category: CAT, entity: 'WorkflowStep', action: 'DELETE', entityId: stepId, summary: `Deleted workflow step: "${existing.name}"`, projectId })
    return reply.status(204).send()
  })

  // POST /api/workflow-steps/reorder — bulk reorder
  fastify.post('/api/workflow-steps/reorder', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      items: z.array(z.object({
        id: z.number().int(),
        sortOrder: z.number().int(),
      })),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    for (const item of body.data.items) {
      await prisma.workflowStep.updateMany({
        where: { id: item.id, projectId },
        data: { sortOrder: item.sortOrder },
      })
    }
    return { ok: true }
  })

  // POST /api/workflow-steps/sync — sync workflow steps with work columns
  fastify.post('/api/workflow-steps/sync', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1

    // Get current work columns
    const columns = await prisma.workColumn.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    })

    // Get current workflow steps
    const existingSteps = await prisma.workflowStep.findMany({
      where: { projectId },
    })
    const existingNames = new Set(existingSteps.map(s => s.name))

    // Create workflow steps for any columns that don't have one
    let created = 0
    for (const col of columns) {
      if (!existingNames.has(col.name)) {
        await prisma.workflowStep.create({
          data: {
            projectId,
            name: col.name,
            sortOrder: col.sortOrder,
            notifyEmail: false,
          },
        })
        created++
      }
    }

    return { ok: true, synced: created }
  })
}
