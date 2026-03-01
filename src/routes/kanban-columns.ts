import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'
import { logAudit } from './audit'

const usr = (req: any) => req.authUser?.name ?? 'System'
const CAT = 'Kanban'

export async function kanbanColumnsRoutes(fastify: FastifyInstance) {
  // GET /api/kanban-columns — list for project
  fastify.get('/api/kanban-columns', async (req) => {
    const projectId = (req as any).projectId ?? 1
    return prisma.kanbanColumn.findMany({
      where: { projectId },
      include: { _count: { select: { tasks: { where: { archived: false } } } } },
      orderBy: { sortOrder: 'asc' },
    })
  })

  // POST /api/kanban-columns — create (admin+)
  fastify.post('/api/kanban-columns', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      name: z.string().min(1).max(100),
      color: z.string().default('#6B7280'),
      wipLimit: z.number().int().optional().nullable(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const maxOrder = await prisma.kanbanColumn.aggregate({ where: { projectId }, _max: { sortOrder: true } })
    const col = await prisma.kanbanColumn.create({
      data: {
        projectId,
        name: body.data.name,
        color: body.data.color,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        wipLimit: body.data.wipLimit ?? null,
      },
    })
    await logAudit({ user: usr(req), category: CAT, entity: 'KanbanColumn', action: 'CREATE', entityId: col.id, summary: `Vytvořen sloupec: "${col.name}"`, projectId })
    return reply.status(201).send(col)
  })

  // PUT /api/kanban-columns/:id — update
  fastify.put('/api/kanban-columns/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const colId = parseInt(id)

    const existing = await prisma.kanbanColumn.findFirst({ where: { id: colId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Column not found' })

    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      color: z.string().optional(),
      wipLimit: z.number().int().optional().nullable(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const col = await prisma.kanbanColumn.update({
      where: { id: colId },
      data: body.data,
    })
    await logAudit({ user: usr(req), category: CAT, entity: 'KanbanColumn', action: 'UPDATE', entityId: colId, summary: `Upraven sloupec: "${col.name}"`, projectId })
    return col
  })

  // DELETE /api/kanban-columns/:id — delete (move tasks to first column)
  fastify.delete('/api/kanban-columns/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const colId = parseInt(id)

    const existing = await prisma.kanbanColumn.findFirst({ where: { id: colId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Column not found' })

    // Find first remaining column to move tasks to
    const firstCol = await prisma.kanbanColumn.findFirst({
      where: { projectId, id: { not: colId } },
      orderBy: { sortOrder: 'asc' },
    })
    if (!firstCol) return reply.status(400).send({ error: 'Cannot delete the last column' })

    // Move tasks to first column
    await prisma.task.updateMany({
      where: { kanbanColumnId: colId, projectId },
      data: { kanbanColumnId: firstCol.id },
    })

    await prisma.kanbanColumn.delete({ where: { id: colId } })
    await logAudit({ user: usr(req), category: CAT, entity: 'KanbanColumn', action: 'DELETE', entityId: colId, summary: `Smazán sloupec: "${existing.name}"`, projectId })
    return reply.status(204).send()
  })

  // POST /api/kanban-columns/reorder — bulk reorder
  fastify.post('/api/kanban-columns/reorder', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      items: z.array(z.object({
        id: z.number().int(),
        sortOrder: z.number().int(),
      })),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    for (const item of body.data.items) {
      await prisma.kanbanColumn.updateMany({
        where: { id: item.id, projectId },
        data: { sortOrder: item.sortOrder },
      })
    }
    return { ok: true }
  })
}
