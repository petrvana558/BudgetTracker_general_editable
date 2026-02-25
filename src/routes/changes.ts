import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const CRBody = z.object({
  title:                 z.string().min(1),
  description:           z.string().optional().default(''),
  changeType:            z.string().optional().default('Scope'),
  businessJustification: z.string().optional().default(''),
  budgetImpact:          z.number().optional().nullable(),
  timelineImpact:        z.string().optional().default(''),
  resourceImpact:        z.string().optional().default(''),
  riskImpact:            z.string().optional().default(''),
  requestedById:         z.number().int().optional().nullable(),
  approvedById:          z.number().int().optional().nullable(),
  approvalStatus:        z.string().optional().default('Draft'),
  linkedRiskIds:         z.array(z.number().int()).optional().default([]),
  linkedIssueIds:        z.array(z.number().int()).optional().default([]),
  linkedRequirements:    z.string().optional().default(''),
})

export async function changesRoutes(fastify: FastifyInstance) {
  // GET all change requests
  fastify.get('/api/changes', async () => {
    const crs = await prisma.changeRequest.findMany({
      include: { requestedBy: true, approvedBy: true },
      orderBy: { createdAt: 'desc' },
    })
    return crs.map(cr => ({
      ...cr,
      linkedRiskIds:  JSON.parse(cr.linkedRiskIds  || '[]'),
      linkedIssueIds: JSON.parse(cr.linkedIssueIds || '[]'),
    }))
  })

  // GET single change request with resolved linked entities
  fastify.get('/api/changes/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const cr = await prisma.changeRequest.findUnique({
      where: { id },
      include: { requestedBy: true, approvedBy: true },
    })
    if (!cr) return reply.code(404).send({ error: 'Not found' })

    const riskIds  = JSON.parse(cr.linkedRiskIds  || '[]') as number[]
    const issueIds = JSON.parse(cr.linkedIssueIds || '[]') as number[]

    const [risks, issues] = await Promise.all([
      riskIds.length  ? prisma.risk.findMany({ where: { id: { in: riskIds } } })  : [],
      issueIds.length ? prisma.issue.findMany({ where: { id: { in: issueIds } } }) : [],
    ])

    return {
      ...cr,
      linkedRiskIds:  riskIds,
      linkedIssueIds: issueIds,
      linkedRisks:    risks,
      linkedIssues:   issues,
    }
  })

  // POST create change request
  fastify.post('/api/changes', async (req, reply) => {
    const body = CRBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data

    const cr = await prisma.changeRequest.create({
      data: {
        title:                 d.title,
        description:           d.description,
        changeType:            d.changeType,
        businessJustification: d.businessJustification,
        budgetImpact:          d.budgetImpact ?? null,
        timelineImpact:        d.timelineImpact,
        resourceImpact:        d.resourceImpact,
        riskImpact:            d.riskImpact,
        requestedById:         d.requestedById ?? null,
        approvedById:          d.approvedById ?? null,
        approvalStatus:        d.approvalStatus,
        linkedRiskIds:         JSON.stringify(d.linkedRiskIds),
        linkedIssueIds:        JSON.stringify(d.linkedIssueIds),
        linkedRequirements:    d.linkedRequirements,
      },
      include: { requestedBy: true, approvedBy: true },
    })
    return reply.code(201).send({
      ...cr,
      linkedRiskIds:  d.linkedRiskIds,
      linkedIssueIds: d.linkedIssueIds,
    })
  })

  // PUT update change request
  fastify.put('/api/changes/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const body = CRBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data

    const existing = await prisma.changeRequest.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    const riskIds  = d.linkedRiskIds  !== undefined ? d.linkedRiskIds  : JSON.parse(existing.linkedRiskIds  || '[]')
    const issueIds = d.linkedIssueIds !== undefined ? d.linkedIssueIds : JSON.parse(existing.linkedIssueIds || '[]')

    const cr = await prisma.changeRequest.update({
      where: { id },
      data: {
        title:                 d.title                 ?? existing.title,
        description:           d.description           ?? existing.description,
        changeType:            d.changeType            ?? existing.changeType,
        businessJustification: d.businessJustification ?? existing.businessJustification,
        budgetImpact:          d.budgetImpact !== undefined ? (d.budgetImpact ?? null) : existing.budgetImpact,
        timelineImpact:        d.timelineImpact        ?? existing.timelineImpact,
        resourceImpact:        d.resourceImpact        ?? existing.resourceImpact,
        riskImpact:            d.riskImpact            ?? existing.riskImpact,
        requestedById:         d.requestedById !== undefined ? (d.requestedById ?? null) : existing.requestedById,
        approvedById:          d.approvedById  !== undefined ? (d.approvedById  ?? null) : existing.approvedById,
        approvalStatus:        d.approvalStatus        ?? existing.approvalStatus,
        linkedRiskIds:         JSON.stringify(riskIds),
        linkedIssueIds:        JSON.stringify(issueIds),
        linkedRequirements:    d.linkedRequirements    ?? existing.linkedRequirements,
      },
      include: { requestedBy: true, approvedBy: true },
    })
    return {
      ...cr,
      linkedRiskIds:  riskIds,
      linkedIssueIds: issueIds,
    }
  })

  // DELETE change request
  fastify.delete('/api/changes/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    await prisma.changeRequest.delete({ where: { id } })
    return reply.code(204).send()
  })
}
