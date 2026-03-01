import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const ItemSchema = z.object({
  category: z.string().optional().nullable(),
  subcategory: z.string().optional().nullable(),
  description: z.string().min(1),
  itemType: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  quantity: z.number().int().min(0).default(1),
  depreciationMonths: z.number().int().min(0).optional().nullable(),
  totalEstCost: z.number().optional().nullable(),
  additionalCostRevision: z.number().optional().nullable(),
  totalCostAfterRevision: z.number().optional().nullable(),
  actualPrice: z.number().optional().nullable(),
  capexNeeded: z.boolean().default(false),
  tenderStatus: z.string().optional().nullable(),
  tenderStartDate: z.string().optional().nullable(),
  tenderDeadline: z.string().optional().nullable(),
  orderPlaceDate: z.string().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
  approval: z.string().optional().nullable(),
  chosenSupplier: z.string().optional().nullable(),
  bottleneck: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  checklistJson: z.string().optional().default('[]'),
  responsibleId: z.number().int().optional().nullable(),
  priorityId: z.number().int().optional().nullable(),
})

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function user(req: any) {
  return req.authUser?.name || 'System'
}

export async function itemRoutes(fastify: FastifyInstance) {
  fastify.get('/api/items', async (req) => {
    const query = req.query as Record<string, string>
    const projectId = (req as any).projectId ?? 1
    const where: Record<string, unknown> = { projectId }
    if (query.category) where.category = query.category
    if (query.tenderStatus) where.tenderStatus = query.tenderStatus
    if (query.responsibleId) where.responsibleId = parseInt(query.responsibleId)
    if (query.priorityId) where.priorityId = parseInt(query.priorityId)
    if (query.capexNeeded !== undefined) where.capexNeeded = query.capexNeeded === 'true'
    if (query.search) where.description = { contains: query.search }
    return prisma.budgetItem.findMany({
      where,
      include: {
        responsible: true,
        priority: true,
        comments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.get('/api/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const projectId = (req as any).projectId ?? 1
    const item = await prisma.budgetItem.findFirst({
      where: { id: parseInt(id), projectId },
      include: {
        responsible: true,
        priority: true,
        comments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!item) return reply.status(404).send({ error: 'Not found' })
    return item
  })

  fastify.post('/api/items', async (req, reply) => {
    const projectId = (req as any).projectId!
    const data = ItemSchema.parse(req.body)
    const item = await prisma.budgetItem.create({
      data: {
        ...data,
        projectId,
        tenderStartDate: parseDate(data.tenderStartDate),
        tenderDeadline: parseDate(data.tenderDeadline),
        orderPlaceDate: parseDate(data.orderPlaceDate),
        deliveryDate: parseDate(data.deliveryDate),
      },
      include: { responsible: true, priority: true },
    })
    await logAudit({
      user: user(req),
      entity: 'Item', action: 'CREATE', entityId: item.id,
      summary: `Přidána položka: "${item.description}"${item.totalEstCost ? ' · ' + item.totalEstCost.toLocaleString('cs-CZ') + ' Kč' : ''}${item.category ? ' · ' + item.category : ''}`,
      projectId,
    })
    return reply.status(201).send(item)
  })

  fastify.put('/api/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const projectId = (req as any).projectId ?? 1
    const data = ItemSchema.partial().parse(req.body)
    const item = await prisma.budgetItem.update({
      where: { id: parseInt(id), projectId },
      data: {
        ...data,
        tenderStartDate: data.tenderStartDate !== undefined ? parseDate(data.tenderStartDate) : undefined,
        tenderDeadline: data.tenderDeadline !== undefined ? parseDate(data.tenderDeadline) : undefined,
        orderPlaceDate: data.orderPlaceDate !== undefined ? parseDate(data.orderPlaceDate) : undefined,
        deliveryDate: data.deliveryDate !== undefined ? parseDate(data.deliveryDate) : undefined,
      },
      include: { responsible: true, priority: true },
    })
    const checklistSummary = req.headers['x-checklist-summary'] as string | undefined
    const auditSummary = checklistSummary
      ? `Checklist · "${item.description}": ${checklistSummary}`
      : `Upravena položka: "${item.description}"${item.tenderStatus ? ' · Status: ' + item.tenderStatus : ''}`
    await logAudit({
      user: user(req),
      entity: 'Item', action: 'UPDATE', entityId: item.id,
      summary: auditSummary,
      projectId,
    })
    return item
  })

  fastify.delete('/api/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const projectId = (req as any).projectId ?? 1
    const item = await prisma.budgetItem.findFirst({ where: { id: parseInt(id), projectId } })
    await prisma.budgetItem.delete({ where: { id: parseInt(id), projectId } })
    await logAudit({
      user: user(req),
      entity: 'Item', action: 'DELETE', entityId: parseInt(id),
      summary: `Smazána položka: "${item?.description ?? 'ID ' + id}"`,
      projectId,
    })
    return reply.status(204).send()
  })
}
