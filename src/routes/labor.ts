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
  spent:      z.number().min(0).optional().nullable(),
})

export function laborAmount(lc: { mdRate: number; mdDays: number }): number {
  return lc.mdRate * lc.mdDays
}

function user(req: { headers: Record<string, unknown> }) {
  return (req.headers['x-user'] as string) || 'System'
}

export async function laborRoutes(fastify: FastifyInstance) {
  fastify.get('/api/labor', async () => {
    return prisma.laborCost.findMany({
      orderBy: { role: 'asc' },
      include: { entries: { orderBy: { date: 'desc' } } },
    })
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

  // ── Per-role monthly entries ─────────────────────────────────────────
  async function recomputeSpent(laborCostId: number) {
    const agg = await prisma.laborRoleEntry.aggregate({
      where: { laborCostId },
      _sum: { amount: true },
    })
    await prisma.laborCost.update({
      where: { id: laborCostId },
      data: { spent: agg._sum.amount ?? 0 },
    })
  }

  fastify.get('/api/labor/:id/entries', async (req, reply) => {
    const { id } = req.params as { id: string }
    return prisma.laborRoleEntry.findMany({
      where: { laborCostId: parseInt(id) },
      orderBy: { date: 'desc' },
    })
  })

  fastify.post('/api/labor/:id/entries', async (req, reply) => {
    const { id } = req.params as { id: string }
    const lcId = parseInt(id)
    const data = z.object({
      date:   z.string(),
      amount: z.number().min(0),
      note:   z.string().optional().nullable(),
    }).parse(req.body)
    const entry = await prisma.laborRoleEntry.create({
      data: { laborCostId: lcId, date: new Date(data.date), amount: data.amount, note: data.note },
    })
    await recomputeSpent(lcId)
    await logAudit({
      user: user(req), entity: 'Labor', action: 'UPDATE', entityId: lcId,
      summary: `Přidán měsíční záznam: ${data.amount.toLocaleString('cs-CZ')} Kč · ${new Date(data.date).toLocaleDateString('cs-CZ')}`,
    })
    return reply.status(201).send(entry)
  })

  fastify.delete('/api/labor-entries/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const entry = await prisma.laborRoleEntry.findUnique({ where: { id: parseInt(id) } })
    if (!entry) return reply.status(404).send({ error: 'Not found' })
    await prisma.laborRoleEntry.delete({ where: { id: parseInt(id) } })
    await recomputeSpent(entry.laborCostId)
    return reply.status(204).send()
  })

  // ── Labor spent log (weekly tracking) ───────────────────────────────
  fastify.get('/api/labor-spent', async () => {
    return prisma.laborSpentLog.findMany({ orderBy: { date: 'desc' } })
  })

  fastify.post('/api/labor-spent', async (req, reply) => {
    const data = z.object({
      date:   z.string(),
      amount: z.number().min(0),
      note:   z.string().optional().nullable(),
    }).parse(req.body)
    const entry = await prisma.laborSpentLog.create({
      data: { date: new Date(data.date), amount: data.amount, note: data.note },
    })
    await logAudit({
      user: user(req), entity: 'LaborSpent', action: 'CREATE', entityId: entry.id,
      summary: `Přidán záznam utraceno: ${entry.amount.toLocaleString('cs-CZ')} · ${new Date(entry.date).toLocaleDateString('cs-CZ')}`,
    })
    return reply.status(201).send(entry)
  })

  fastify.delete('/api/labor-spent/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.laborSpentLog.delete({ where: { id: parseInt(id) } })
    return reply.status(204).send()
  })
}
