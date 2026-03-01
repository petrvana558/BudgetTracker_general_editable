import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const user = (req: any) => req.authUser?.name ?? 'System'

export async function taskDependenciesRoutes(fastify: FastifyInstance) {
  // POST /api/task-dependencies — add dependency
  fastify.post('/api/task-dependencies', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      predecessorId: z.number().int(),
      successorId: z.number().int(),
      type: z.enum(['FS', 'FF', 'SS', 'SF']).default('FS'),
      lagDays: z.number().int().default(0),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const { predecessorId, successorId, type, lagDays } = body.data

    if (predecessorId === successorId) return reply.status(400).send({ error: 'Cannot depend on itself' })

    // Validate both tasks belong to same project
    const [pred, succ] = await Promise.all([
      prisma.task.findFirst({ where: { id: predecessorId, projectId } }),
      prisma.task.findFirst({ where: { id: successorId, projectId } }),
    ])
    if (!pred) return reply.status(400).send({ error: 'Predecessor task not found in this project' })
    if (!succ) return reply.status(400).send({ error: 'Successor task not found in this project' })

    // Check for circular dependency (simple check)
    const wouldCircle = await checkCircular(successorId, predecessorId)
    if (wouldCircle) return reply.status(400).send({ error: 'Circular dependency detected' })

    const dep = await prisma.taskDependency.create({
      data: { predecessorId, successorId, type, lagDays },
      include: {
        predecessor: { select: { id: true, name: true } },
        successor: { select: { id: true, name: true } },
      },
    })

    await logAudit({ user: user(req), category: 'Project Plan', entity: 'TaskDependency', action: 'CREATE', entityId: dep.id, summary: `Závislost: "${pred.name}" → "${succ.name}" (${type}, lag ${lagDays}d)`, projectId })
    return reply.status(201).send(dep)
  })

  // DELETE /api/task-dependencies/:id — remove dependency
  fastify.delete('/api/task-dependencies/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const depId = parseInt(id)

    const dep = await prisma.taskDependency.findFirst({
      where: { id: depId },
      include: { predecessor: { select: { projectId: true, name: true } }, successor: { select: { name: true } } },
    })
    if (!dep || dep.predecessor.projectId !== projectId) return reply.status(404).send({ error: 'Dependency not found' })

    await prisma.taskDependency.delete({ where: { id: depId } })
    await logAudit({ user: user(req), category: 'Project Plan', entity: 'TaskDependency', action: 'DELETE', entityId: depId, summary: `Odstraněna závislost: "${dep.predecessor.name}" → "${dep.successor.name}"`, projectId })
    return reply.status(204).send()
  })
}

async function checkCircular(fromId: number, targetId: number, visited = new Set<number>()): Promise<boolean> {
  if (fromId === targetId) return true
  if (visited.has(fromId)) return false
  visited.add(fromId)

  const deps = await prisma.taskDependency.findMany({
    where: { predecessorId: fromId },
    select: { successorId: true },
  })
  for (const dep of deps) {
    if (await checkCircular(dep.successorId, targetId, visited)) return true
  }
  return false
}
