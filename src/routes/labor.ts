import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const LaborSchema = z.object({
  role:       z.string().min(1),
  personName: z.string().optional().nullable(),
  mdRate:     z.number().min(0).default(0),
  mdDays:     z.number().min(0).default(0),
  costType:   z.enum(['Project', 'Annual', 'One-off']).default('Project'),
  department: z.string().optional().nullable(),
  notes:      z.string().optional().nullable(),
})

export function laborAmount(lc: { mdRate: number; mdDays: number }): number {
  return lc.mdRate * lc.mdDays
}

function user(req: { headers: Record<string, unknown> }) {
  return (req.headers['x-user'] as string) || 'System'
}

export async function laborRoutes(fastify: FastifyInstance) {
  fastify.get('/api/labor', async () => {
    return prisma.laborCost.findMany({ orderBy: { role: 'asc' } })
  })

  fastify.post('/api/labor', async (req, reply) => {
    const data = LaborSchema.parse(req.body)
    const lc = await prisma.laborCost.create({ data })
    await logAudit({
      user: user(req),
      entity: 'Labor', action: 'CREATE', entityId: lc.id,
      summary: `Přidána role: "${lc.role}" · ${lc.mdRate.toLocaleString('cs-CZ')} Kč/MD × ${lc.mdDays} MD = ${laborAmount(lc).toLocaleString('cs-CZ')} Kč`,
    })
    return reply.status(201).send(lc)
  })

  fastify.put('/api/labor/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = LaborSchema.partial().parse(req.body)
    const lc = await prisma.laborCost.update({ where: { id: parseInt(id) }, data })
    await logAudit({
      user: user(req),
      entity: 'Labor', action: 'UPDATE', entityId: lc.id,
      summary: `Upravena role: "${lc.role}" · ${lc.mdRate.toLocaleString('cs-CZ')} Kč/MD × ${lc.mdDays} MD = ${laborAmount(lc).toLocaleString('cs-CZ')} Kč`,
    })
    return lc
  })

  fastify.delete('/api/labor/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const lc = await prisma.laborCost.findUnique({ where: { id: parseInt(id) } })
    await prisma.laborCost.delete({ where: { id: parseInt(id) } })
    await logAudit({
      user: user(req),
      entity: 'Labor', action: 'DELETE', entityId: parseInt(id),
      summary: `Smazána role: "${lc?.role ?? 'ID ' + id}"`,
    })
    return reply.status(204).send()
  })
}
