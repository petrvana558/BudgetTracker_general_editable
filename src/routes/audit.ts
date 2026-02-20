import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function logAudit(opts: {
  user: string
  entity: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  entityId?: number | null
  summary: string
}) {
  try {
    await prisma.auditLog.create({ data: opts })
  } catch {
    // audit must never crash the main request
  }
}

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.get('/api/audit', async (req) => {
    const q = req.query as Record<string, string>
    const limit = Math.min(parseInt(q.limit || '200'), 500)
    const entity = q.entity || undefined
    return prisma.auditLog.findMany({
      where: entity ? { entity } : undefined,
      orderBy: { timestamp: 'desc' },
      take: limit,
    })
  })

  fastify.delete('/api/audit', async (_req, reply) => {
    await prisma.auditLog.deleteMany({})
    return reply.status(204).send()
  })
}
