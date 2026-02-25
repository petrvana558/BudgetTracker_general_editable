import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const CAT = 'Issue Tracker'
function user(req: any) { return (req.headers?.['x-user'] as string) || 'System' }
function fmtDate(d: Date | null | undefined) { return d ? d.toISOString().slice(0, 10) : '—' }

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

    const existing = await prisma.issue.findUnique({ where: { id }, include: { owner: true, linkedRisk: true } })
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

    const ch: string[] = []
    if (d.title !== undefined && d.title !== existing.title)
      ch.push(`Název: "${existing.title}" → "${d.title}"`)
    if (d.type !== undefined && d.type !== existing.type)
      ch.push(`Typ: ${existing.type} → ${d.type}`)
    if (d.severity !== undefined && d.severity !== existing.severity)
      ch.push(`Závažnost: ${existing.severity} → ${d.severity}`)
    if (d.priority !== undefined && d.priority !== existing.priority)
      ch.push(`Priorita: ${existing.priority} → ${d.priority}`)
    if (d.status !== undefined && d.status !== existing.status)
      ch.push(`Status: ${existing.status} → ${d.status}`)
    if (d.ownerId !== undefined && d.ownerId !== existing.ownerId) {
      const oldName = existing.owner?.name ?? '—'
      const newName = issue.owner?.name ?? '—'
      ch.push(`Vlastník: ${oldName} → ${newName}`)
    }
    if (d.dueDate !== undefined && fmtDate(d.dueDate ? new Date(d.dueDate) : null) !== fmtDate(existing.dueDate))
      ch.push(`Termín: ${fmtDate(existing.dueDate)} → ${fmtDate(d.dueDate ? new Date(d.dueDate) : null)}`)
    if (d.linkedRiskId !== undefined && d.linkedRiskId !== existing.linkedRiskId) {
      const oldRisk = existing.linkedRisk?.title ? `"${existing.linkedRisk.title}"` : '—'
      const newRisk = issue.linkedRisk?.title ? `"${issue.linkedRisk.title}"` : '—'
      ch.push(`Propojené riziko: ${oldRisk} → ${newRisk}`)
    }
    if (d.linkedChangeRequestId !== undefined && d.linkedChangeRequestId !== existing.linkedChangeRequestId) {
      const oldCR = existing.linkedChangeRequestId ? `CR #${existing.linkedChangeRequestId}` : '—'
      const newCR = issue.linkedChangeRequestId ? `CR #${issue.linkedChangeRequestId}` : '—'
      ch.push(`Propojený CR: ${oldCR} → ${newCR}`)
    }
    if (d.rootCause !== undefined && d.rootCause !== existing.rootCause)
      ch.push(`Kořenová příčina: upraven`)
    if (d.description !== undefined && d.description !== existing.description)
      ch.push(`Popis: upraven`)

    await logAudit({ user: user(req), category: CAT, entity: 'Issue', action: 'UPDATE', entityId: id, summary: `Upraven issue: "${issue.title}"${ch.length ? ' · ' + ch.join(' · ') : ''}` })
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
