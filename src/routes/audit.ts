import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function logAudit(opts: {
  user: string
  category?: string
  entity: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  entityId?: number | null
  summary: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        user: opts.user,
        category: opts.category ?? 'Budget Tracker',
        entity: opts.entity,
        action: opts.action,
        entityId: opts.entityId ?? null,
        summary: opts.summary,
      },
    })
  } catch {
    // audit must never crash the main request
  }
}

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.get('/api/audit', async (req) => {
    const q = req.query as Record<string, string>
    const limit = Math.min(parseInt(q.limit || '200'), 500)
    const category = q.category || undefined
    const entity = q.entity || undefined
    return prisma.auditLog.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(entity ? { entity } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })
  })

  fastify.delete('/api/audit', async (req, reply) => {
    const q = req.query as Record<string, string>
    const category = q.category || undefined
    await prisma.auditLog.deleteMany({
      where: category ? { category } : undefined,
    })
    return reply.status(204).send()
  })
}
