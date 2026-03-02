import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'
import { logAudit } from './audit'

const usr = (req: any) => req.authUser?.name ?? 'System'
const CAT = 'Work Board'

export async function workColumnsRoutes(fastify: FastifyInstance) {
  // GET /api/work-columns — list for project
  fastify.get('/api/work-columns', async (req) => {
    const projectId = (req as any).projectId ?? 1
    return prisma.workColumn.findMany({
      where: { projectId },
      include: { _count: { select: { workItems: true } } },
      orderBy: { sortOrder: 'asc' },
    })
  })

  // POST /api/work-columns — create (admin+)
  fastify.post('/api/work-columns', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      name: z.string().min(1).max(100),
      color: z.string().default('#6B7280'),
      wipLimit: z.number().int().optional().nullable(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const maxOrder = await prisma.workColumn.aggregate({ where: { projectId }, _max: { sortOrder: true } })
    const col = await prisma.workColumn.create({
      data: {
        projectId,
        name: body.data.name,
        color: body.data.color,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        wipLimit: body.data.wipLimit ?? null,
      },
    })
    await logAudit({ user: usr(req), category: CAT, entity: 'WorkColumn', action: 'CREATE', entityId: col.id, summary: `Created work column: "${col.name}"`, projectId })
    return reply.status(201).send(col)
  })

  // PUT /api/work-columns/:id — update
  fastify.put('/api/work-columns/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const colId = parseInt(id)

    const existing = await prisma.workColumn.findFirst({ where: { id: colId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Column not found' })

    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      color: z.string().optional(),
      wipLimit: z.number().int().optional().nullable(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const col = await prisma.workColumn.update({
      where: { id: colId },
      data: body.data,
    })
    await logAudit({ user: usr(req), category: CAT, entity: 'WorkColumn', action: 'UPDATE', entityId: colId, summary: `Updated work column: "${col.name}"`, projectId })
    return col
  })

  // DELETE /api/work-columns/:id — delete (move items to first column)
  fastify.delete('/api/work-columns/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const colId = parseInt(id)

    const existing = await prisma.workColumn.findFirst({ where: { id: colId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Column not found' })

    const firstCol = await prisma.workColumn.findFirst({
      where: { projectId, id: { not: colId } },
      orderBy: { sortOrder: 'asc' },
    })
    if (!firstCol) return reply.status(400).send({ error: 'Cannot delete the last column' })

    await prisma.workItem.updateMany({
      where: { columnId: colId, projectId },
      data: { columnId: firstCol.id },
    })

    await prisma.workColumn.delete({ where: { id: colId } })
    await logAudit({ user: usr(req), category: CAT, entity: 'WorkColumn', action: 'DELETE', entityId: colId, summary: `Deleted work column: "${existing.name}"`, projectId })
    return reply.status(204).send()
  })

  // POST /api/work-columns/reorder — bulk reorder
  fastify.post('/api/work-columns/reorder', { preHandler: requireRole('admin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      items: z.array(z.object({
        id: z.number().int(),
        sortOrder: z.number().int(),
      })),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    for (const item of body.data.items) {
      await prisma.workColumn.updateMany({
        where: { id: item.id, projectId },
        data: { sortOrder: item.sortOrder },
      })
    }
    return { ok: true }
  })
}
