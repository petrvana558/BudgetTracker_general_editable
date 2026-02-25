import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const CAT = 'Issue Tracker'
function user(req: any) { return (req.headers?.['x-user'] as string) || 'System' }

const IssueBody = z.object({
  title:                z.string().min(1),
  description:          z.string().optional().default(''),
  type:                 z.string().optional().default('Bug'),
  severity:             z.string().optional().default('Medium'),
  priority:             z.string().optional().default('Medium'),
  status:               z.string().optional().default('Open'),
  ownerId:              z.number().int().optional().nullable(),
  dueDate:              z.string().optional().nullable(),
  rootCause:            z.string().optional().default(''),
  linkedRiskId:         z.number().int().optional().nullable(),
  linkedChangeRequestId: z.number().int().optional().nullable(),
})

export async function issueRoutes(fastify: FastifyInstance) {
  // GET all issues
  fastify.get('/api/issues', async () => {
    return prisma.issue.findMany({
      include: { owner: true, linkedRisk: true },
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST create issue
  fastify.post('/api/issues', async (req, reply) => {
    const body = IssueBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data
    const issue = await prisma.issue.create({
      data: {
        title:                d.title,
        description:          d.description,
        type:                 d.type,
        severity:             d.severity,
        priority:             d.priority,
        status:               d.status,
        ownerId:              d.ownerId ?? null,
        dueDate:              d.dueDate ? new Date(d.dueDate) : null,
        rootCause:            d.rootCause,
        linkedRiskId:         d.linkedRiskId ?? null,
        linkedChangeRequestId: d.linkedChangeRequestId ?? null,
      },
      include: { owner: true, linkedRisk: true },
    })
    await logAudit({ user: user(req), category: CAT, entity: 'Issue', action: 'CREATE', entityId: issue.id, summary: `Vytvořen issue: "${issue.title}" · Typ: ${issue.type} · Závažnost: ${issue.severity} · Status: ${issue.status}` })
    return reply.code(201).send(issue)
  })

  // PUT update issue
  fastify.put('/api/issues/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const body = IssueBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data

    const existing = await prisma.issue.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    const issue = await prisma.issue.update({
      where: { id },
      data: {
        title:                d.title                ?? existing.title,
        description:          d.description          ?? existing.description,
        type:                 d.type                 ?? existing.type,
        severity:             d.severity             ?? existing.severity,
        priority:             d.priority             ?? existing.priority,
        status:               d.status               ?? existing.status,
        ownerId:              d.ownerId !== undefined ? (d.ownerId ?? null) : existing.ownerId,
        dueDate:              d.dueDate !== undefined ? (d.dueDate ? new Date(d.dueDate) : null) : existing.dueDate,
        rootCause:            d.rootCause            ?? existing.rootCause,
        linkedRiskId:         d.linkedRiskId !== undefined ? (d.linkedRiskId ?? null) : existing.linkedRiskId,
        linkedChangeRequestId: d.linkedChangeRequestId !== undefined ? (d.linkedChangeRequestId ?? null) : existing.linkedChangeRequestId,
      },
      include: { owner: true, linkedRisk: true },
    })

    const changes: string[] = []
    if (d.status && d.status !== existing.status) changes.push(`Status: ${existing.status} → ${d.status}`)
    if (d.severity && d.severity !== existing.severity) changes.push(`Závažnost: ${existing.severity} → ${d.severity}`)
    if (d.title && d.title !== existing.title) changes.push(`Název: "${d.title}"`)
    await logAudit({ user: user(req), category: CAT, entity: 'Issue', action: 'UPDATE', entityId: id, summary: `Upraven issue: "${issue.title}"${changes.length ? ' · ' + changes.join(', ') : ''}` })
    return issue
  })

  // DELETE issue
  fastify.delete('/api/issues/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const existing = await prisma.issue.findUnique({ where: { id } })
    await prisma.issue.delete({ where: { id } })
    await logAudit({ user: user(req), category: CAT, entity: 'Issue', action: 'DELETE', entityId: id, summary: `Smazán issue: "${existing?.title ?? 'ID ' + id}" · Závažnost: ${existing?.severity ?? '?'}` })
    return reply.code(204).send()
  })
}
