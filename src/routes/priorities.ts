import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const PrioritySchema = z.object({
  name:  z.string().min(1),
  color: z.string().default('#FFCC00'),
  rank:  z.number().int().default(0),
})

function user(req: any) {
  return req.authUser?.name || 'System'
}

export async function priorityRoutes(fastify: FastifyInstance) {
  fastify.get('/api/priorities', async () => {
    return prisma.priority.findMany({ orderBy: { rank: 'asc' } })
  })

  fastify.post('/api/priorities', async (req, reply) => {
    const data = PrioritySchema.parse(req.body)
    const priority = await prisma.priority.create({ data })
    await logAudit({
      user: user(req), entity: 'Priorita', action: 'CREATE', entityId: priority.id,
      summary: `Přidána priorita: "${priority.name}" (${priority.color})`,
    })
    return reply.status(201).send(priority)
  })

  fastify.put('/api/priorities/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = PrioritySchema.partial().parse(req.body)
    const priority = await prisma.priority.update({ where: { id: parseInt(id) }, data })
    await logAudit({
      user: user(req), entity: 'Priorita', action: 'UPDATE', entityId: priority.id,
      summary: `Upravena priorita: "${priority.name}"`,
    })
    return priority
  })

  fastify.delete('/api/priorities/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const priority = await prisma.priority.findUnique({ where: { id: parseInt(id) } })
    await prisma.budgetItem.updateMany({ where: { priorityId: parseInt(id) }, data: { priorityId: null } })
    await prisma.priority.delete({ where: { id: parseInt(id) } })
    await logAudit({
      user: user(req), entity: 'Priorita', action: 'DELETE', entityId: parseInt(id),
      summary: `Smazána priorita: "${priority?.name ?? 'ID ' + id}"`,
    })
    return reply.status(204).send()
  })
}
