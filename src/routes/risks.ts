import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const RiskBody = z.object({
  title:           z.string().min(1),
  description:     z.string().optional().default(''),
  category:        z.string().optional().default('technical'),
  probability:     z.number().int().min(1).max(5),
  impact:          z.number().int().min(1).max(5),
  mitigationPlan:  z.string().optional().default(''),
  contingencyPlan: z.string().optional().default(''),
  ownerId:         z.number().int().optional().nullable(),
  status:          z.string().optional().default('Open'),
  dateIdentified:  z.string().optional(),
  reviewDate:      z.string().optional().nullable(),
})

export async function riskRoutes(fastify: FastifyInstance) {
  // GET all risks
  fastify.get('/api/risks', async () => {
    const risks = await prisma.risk.findMany({
      include: { owner: true },
      orderBy: { score: 'desc' },
    })
    return risks
  })

  // GET score history for one risk (for trend chart)
  fastify.get('/api/risks/:id/history', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const history = await prisma.riskScoreHistory.findMany({
      where: { riskId: id },
      orderBy: { date: 'asc' },
    })
    return history
  })

  // POST create risk
  fastify.post('/api/risks', async (req, reply) => {
    const body = RiskBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data
    const score = d.probability * d.impact

    const risk = await prisma.risk.create({
      data: {
        title:           d.title,
        description:     d.description,
        category:        d.category,
        probability:     d.probability,
        impact:          d.impact,
        score,
        mitigationPlan:  d.mitigationPlan,
        contingencyPlan: d.contingencyPlan,
        ownerId:         d.ownerId ?? null,
        status:          d.status,
        dateIdentified:  d.dateIdentified ? new Date(d.dateIdentified) : new Date(),
        reviewDate:      d.reviewDate ? new Date(d.reviewDate) : null,
        scoreHistory: { create: { score } },
      },
      include: { owner: true },
    })
    return reply.code(201).send(risk)
  })

  // PUT update risk
  fastify.put('/api/risks/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const body = RiskBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data

    const existing = await prisma.risk.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    const prob   = d.probability ?? existing.probability
    const impact = d.impact      ?? existing.impact
    const score  = prob * impact

    // Record history if score changed
    const scoreChanged = score !== existing.score
    const updateData: any = {
      title:           d.title           ?? existing.title,
      description:     d.description     ?? existing.description,
      category:        d.category        ?? existing.category,
      probability:     prob,
      impact,
      score,
      mitigationPlan:  d.mitigationPlan  ?? existing.mitigationPlan,
      contingencyPlan: d.contingencyPlan ?? existing.contingencyPlan,
      ownerId:         d.ownerId !== undefined ? (d.ownerId ?? null) : existing.ownerId,
      status:          d.status          ?? existing.status,
      dateIdentified:  d.dateIdentified  ? new Date(d.dateIdentified) : existing.dateIdentified,
      reviewDate:      d.reviewDate !== undefined
        ? (d.reviewDate ? new Date(d.reviewDate) : null)
        : existing.reviewDate,
    }
    if (scoreChanged) {
      updateData.scoreHistory = { create: { score } }
    }

    const risk = await prisma.risk.update({
      where: { id },
      data: updateData,
      include: { owner: true },
    })
    return risk
  })

  // DELETE risk
  fastify.delete('/api/risks/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    await prisma.risk.delete({ where: { id } })
    return reply.code(204).send()
  })
}
