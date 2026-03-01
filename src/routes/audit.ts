import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function logAudit(opts: {
  user: string
  category?: string
  entity: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'COMMENT' | 'COMMENT_DELETE' | 'ARCHIVE' | 'RESTORE' | 'BASELINE' | 'MOVE'
  entityId?: number | null
  summary: string
  projectId?: number
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
        projectId: opts.projectId ?? 1,
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
    const projectId = (req as any).projectId ?? 1
    return prisma.auditLog.findMany({
      where: {
        projectId,
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
    const projectId = (req as any).projectId ?? 1
    await prisma.auditLog.deleteMany({
      where: {
        projectId,
        ...(category ? { category } : {}),
      },
    })
    return reply.status(204).send()
  })
}
