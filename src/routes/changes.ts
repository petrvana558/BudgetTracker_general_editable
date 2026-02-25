import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const CAT = 'Change Management'
function user(req: any) { return (req.headers?.['x-user'] as string) || 'System' }

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
    await logAudit({ user: user(req), category: CAT, entity: 'ChangeRequest', action: 'CREATE', entityId: cr.id, summary: `Vytvořen CR: "${cr.title}" · Typ: ${cr.changeType} · Status: ${cr.approvalStatus}${cr.budgetImpact ? ' · Budget impact: ' + cr.budgetImpact.toLocaleString('cs-CZ') + ' Kč' : ''}` })
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

    const existing = await prisma.changeRequest.findUnique({ where: { id }, include: { requestedBy: true, approvedBy: true } })
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

    const ch: string[] = []
    if (d.title !== undefined && d.title !== existing.title)
      ch.push(`Název: "${existing.title}" → "${d.title}"`)
    if (d.changeType !== undefined && d.changeType !== existing.changeType)
      ch.push(`Typ změny: ${existing.changeType} → ${d.changeType}`)
    if (d.approvalStatus !== undefined && d.approvalStatus !== existing.approvalStatus)
      ch.push(`Status: ${existing.approvalStatus} → ${d.approvalStatus}`)
    if (d.budgetImpact !== undefined && d.budgetImpact !== existing.budgetImpact) {
      const oldVal = existing.budgetImpact != null ? existing.budgetImpact.toLocaleString('cs-CZ') + ' Kč' : '—'
      const newVal = d.budgetImpact != null ? d.budgetImpact.toLocaleString('cs-CZ') + ' Kč' : '—'
      ch.push(`Budget impact: ${oldVal} → ${newVal}`)
    }
    if (d.requestedById !== undefined && d.requestedById !== existing.requestedById) {
      const oldName = existing.requestedBy?.name ?? '—'
      const newName = cr.requestedBy?.name ?? '—'
      ch.push(`Požaduje: ${oldName} → ${newName}`)
    }
    if (d.approvedById !== undefined && d.approvedById !== existing.approvedById) {
      const oldName = existing.approvedBy?.name ?? '—'
      const newName = cr.approvedBy?.name ?? '—'
      ch.push(`Schválil: ${oldName} → ${newName}`)
    }
    if (d.timelineImpact !== undefined && d.timelineImpact !== existing.timelineImpact)
      ch.push(`Dopad na harmonogram: upraven`)
    if (d.resourceImpact !== undefined && d.resourceImpact !== existing.resourceImpact)
      ch.push(`Dopad na zdroje: upraven`)
    if (d.riskImpact !== undefined && d.riskImpact !== existing.riskImpact)
      ch.push(`Dopad na rizika: upraven`)
    if (d.businessJustification !== undefined && d.businessJustification !== existing.businessJustification)
      ch.push(`Obchodní zdůvodnění: upraven`)
    if (d.linkedRequirements !== undefined && d.linkedRequirements !== existing.linkedRequirements)
      ch.push(`Propojené požadavky: upraven`)
    if (d.linkedRiskIds !== undefined) {
      const oldIds: number[] = JSON.parse(existing.linkedRiskIds || '[]')
      const added   = riskIds.filter((x: number) => !oldIds.includes(x))
      const removed = oldIds.filter((x: number) => !riskIds.includes(x))
      if (added.length)   ch.push(`Přidána rizika: #${added.join(', #')}`)
      if (removed.length) ch.push(`Odebrána rizika: #${removed.join(', #')}`)
    }
    if (d.linkedIssueIds !== undefined) {
      const oldIds: number[] = JSON.parse(existing.linkedIssueIds || '[]')
      const added   = issueIds.filter((x: number) => !oldIds.includes(x))
      const removed = oldIds.filter((x: number) => !issueIds.includes(x))
      if (added.length)   ch.push(`Přidány issues: #${added.join(', #')}`)
      if (removed.length) ch.push(`Odebrány issues: #${removed.join(', #')}`)
    }
    if (d.description !== undefined && d.description !== existing.description)
      ch.push(`Popis: upraven`)

    await logAudit({ user: user(req), category: CAT, entity: 'ChangeRequest', action: 'UPDATE', entityId: id, summary: `Upraven CR: "${cr.title}"${ch.length ? ' · ' + ch.join(' · ') : ''}` })
    return { ...cr, linkedRiskIds: riskIds, linkedIssueIds: issueIds }
  })

  // DELETE change request
  fastify.delete('/api/changes/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const existing = await prisma.changeRequest.findUnique({ where: { id } })
    await prisma.changeRequest.delete({ where: { id } })
    await logAudit({ user: user(req), category: CAT, entity: 'ChangeRequest', action: 'DELETE', entityId: id, summary: `Smazán CR: "${existing?.title ?? 'ID ' + id}" · Byl ve stavu: ${existing?.approvalStatus ?? '?'}` })
    return reply.code(204).send()
  })
}
