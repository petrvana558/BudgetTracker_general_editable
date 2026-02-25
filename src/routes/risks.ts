import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const CAT = 'Risk Management'
function user(req: any) { return (req.headers?.['x-user'] as string) || 'System' }
function fmtDate(d: Date | null | undefined) { return d ? d.toISOString().slice(0, 10) : '—' }

const RiskBody = z.object({
  title:               z.string().min(1),
  description:         z.string().optional().default(''),
  category:            z.string().optional().default('technical'),
  probability:         z.number().int().min(1).max(5),
  impact:              z.number().int().min(1).max(5),
  mitigationPlan:      z.string().optional().default(''),
  contingencyPlan:     z.string().optional().default(''),
  ownerId:             z.number().int().optional().nullable(),
  status:              z.string().optional().default('Open'),
  dateIdentified:      z.string().optional(),
  reviewDate:          z.string().optional().nullable(),
  materializationDate: z.string().optional().nullable(),
})

export async function riskRoutes(fastify: FastifyInstance) {
  // GET all risks
  fastify.get('/api/risks', async () => {
    return prisma.risk.findMany({
      include: { owner: true },
      orderBy: { score: 'desc' },
    })
  })

  // GET score history for one risk (for trend chart)
  fastify.get('/api/risks/:id/history', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    return prisma.riskScoreHistory.findMany({
      where: { riskId: id },
      orderBy: { date: 'asc' },
    })
  })

  // POST create risk
  fastify.post('/api/risks', async (req, reply) => {
    const body = RiskBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data
    const score = d.probability * d.impact

    const risk = await prisma.risk.create({
      data: {
        title:               d.title,
        description:         d.description,
        category:            d.category,
        probability:         d.probability,
        impact:              d.impact,
        score,
        mitigationPlan:      d.mitigationPlan,
        contingencyPlan:     d.contingencyPlan,
        ownerId:             d.ownerId ?? null,
        status:              d.status,
        dateIdentified:      d.dateIdentified ? new Date(d.dateIdentified) : new Date(),
        reviewDate:          d.reviewDate ? new Date(d.reviewDate) : null,
        materializationDate: d.materializationDate ? new Date(d.materializationDate) : null,
        scoreHistory: { create: { score } },
      },
      include: { owner: true },
    })
    await logAudit({ user: user(req), category: CAT, entity: 'Risk', action: 'CREATE', entityId: risk.id, summary: `Vytvořeno riziko: "${risk.title}" · Skóre: ${risk.score} (P${risk.probability}×D${risk.impact}) · Status: ${risk.status}` })
    return reply.code(201).send(risk)
  })

  // PUT update risk
  fastify.put('/api/risks/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const body = RiskBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data

    const existing = await prisma.risk.findUnique({ where: { id }, include: { owner: true } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    const prob   = d.probability ?? existing.probability
    const impact = d.impact      ?? existing.impact
    const score  = prob * impact
    const scoreChanged = score !== existing.score
    const updateData: any = {
      title:               d.title               ?? existing.title,
      description:         d.description         ?? existing.description,
      category:            d.category            ?? existing.category,
      probability:         prob,
      impact,
      score,
      mitigationPlan:      d.mitigationPlan      ?? existing.mitigationPlan,
      contingencyPlan:     d.contingencyPlan     ?? existing.contingencyPlan,
      ownerId:             d.ownerId !== undefined ? (d.ownerId ?? null) : existing.ownerId,
      status:              d.status              ?? existing.status,
      dateIdentified:      d.dateIdentified      ? new Date(d.dateIdentified) : existing.dateIdentified,
      reviewDate:          d.reviewDate !== undefined ? (d.reviewDate ? new Date(d.reviewDate) : null) : existing.reviewDate,
      materializationDate: d.materializationDate !== undefined ? (d.materializationDate ? new Date(d.materializationDate) : null) : existing.materializationDate,
    }
    if (scoreChanged) updateData.scoreHistory = { create: { score } }

    const risk = await prisma.risk.update({
      where: { id },
      data: updateData,
      include: { owner: true },
    })

    const ch: string[] = []
    if (d.title !== undefined && d.title !== existing.title)
      ch.push(`Název: "${existing.title}" → "${d.title}"`)
    if (d.category !== undefined && d.category !== existing.category)
      ch.push(`Kategorie: ${existing.category} → ${d.category}`)
    if (d.probability !== undefined && d.probability !== existing.probability)
      ch.push(`Pravděpodobnost: P${existing.probability} → P${d.probability}`)
    if (d.impact !== undefined && d.impact !== existing.impact)
      ch.push(`Dopad: D${existing.impact} → D${d.impact}`)
    if (scoreChanged)
      ch.push(`Skóre: ${existing.score} → ${score}`)
    if (d.status !== undefined && d.status !== existing.status)
      ch.push(`Status: ${existing.status} → ${d.status}`)
    if (d.ownerId !== undefined && d.ownerId !== existing.ownerId) {
      const oldName = existing.owner?.name ?? '—'
      const newName = risk.owner?.name ?? '—'
      ch.push(`Vlastník: ${oldName} → ${newName}`)
    }
    if (d.reviewDate !== undefined && fmtDate(d.reviewDate ? new Date(d.reviewDate) : null) !== fmtDate(existing.reviewDate))
      ch.push(`Datum revize: ${fmtDate(existing.reviewDate)} → ${fmtDate(d.reviewDate ? new Date(d.reviewDate) : null)}`)
    if (d.materializationDate !== undefined && fmtDate(d.materializationDate ? new Date(d.materializationDate) : null) !== fmtDate(existing.materializationDate))
      ch.push(`Datum materializace: ${fmtDate(existing.materializationDate)} → ${fmtDate(d.materializationDate ? new Date(d.materializationDate) : null)}`)
    if (d.mitigationPlan !== undefined && d.mitigationPlan !== existing.mitigationPlan)
      ch.push(`Mitigační plán: upraven`)
    if (d.contingencyPlan !== undefined && d.contingencyPlan !== existing.contingencyPlan)
      ch.push(`Záložní plán: upraven`)
    if (d.description !== undefined && d.description !== existing.description)
      ch.push(`Popis: upraven`)

    await logAudit({ user: user(req), category: CAT, entity: 'Risk', action: 'UPDATE', entityId: id, summary: `Upraveno riziko: "${risk.title}"${ch.length ? ' · ' + ch.join(' · ') : ''}` })
    return risk
  })

  // DELETE risk
  fastify.delete('/api/risks/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const existing = await prisma.risk.findUnique({ where: { id } })
    await prisma.risk.delete({ where: { id } })
    await logAudit({ user: user(req), category: CAT, entity: 'Risk', action: 'DELETE', entityId: id, summary: `Smazáno riziko: "${existing?.title ?? 'ID ' + id}" · Skóre bylo: ${existing?.score ?? '?'}` })
    return reply.code(204).send()
  })
}
