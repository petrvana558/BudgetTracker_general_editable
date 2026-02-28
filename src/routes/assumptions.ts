import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const CAT = 'Assumption Log'
function user(req: any) { return req.authUser?.name || 'System' }
function fmtDate(d: Date | null | undefined) { return d ? d.toISOString().slice(0, 10) : '—' }

// exposureScore = invalidationProbability × scopeImpactValue (Low=1, Medium=2, High=3)
function calcExposure(prob: number, scope: string): number {
  const scopeVal: Record<string, number> = { Low: 1, Medium: 2, High: 3 }
  return prob * (scopeVal[scope] ?? 2)
}

const AssumptionBody = z.object({
  title:                   z.string().min(1),
  description:             z.string().optional().default(''),
  category:                z.string().optional().default('Finance'),
  phase:                   z.string().optional().default('Design'),
  type:                    z.string().optional().default('Operational'),
  source:                  z.string().optional().default('Internal planning'),
  validationMethod:        z.string().optional().nullable(),
  status:                  z.string().optional().default('Active'),
  ownerId:                 z.number().int().optional().nullable(),
  validationDate:          z.string().optional().nullable(),
  budgetImpact:            z.number().optional().nullable(),
  timelineImpact:          z.number().int().optional().nullable(),
  scopeImpact:             z.string().optional().default('Medium'),
  invalidationProbability: z.number().int().min(1).max(5).optional().default(3),
  notes:                   z.string().optional().default(''),
})

export async function assumptionRoutes(fastify: FastifyInstance) {
  // GET all assumptions
  fastify.get('/api/assumptions', async (req) => {
    const projectId = (req as any).projectId ?? 1
    return prisma.assumption.findMany({
      where: { projectId },
      include: { owner: true },
      orderBy: { createdAt: 'desc' },
    })
  })

  // GET single assumption
  fastify.get('/api/assumptions/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const projectId = (req as any).projectId ?? 1
    const a = await prisma.assumption.findFirst({ where: { id, projectId }, include: { owner: true } })
    if (!a) return reply.code(404).send({ error: 'Not found' })
    return a
  })

  // POST create assumption
  fastify.post('/api/assumptions', async (req, reply) => {
    const body = AssumptionBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data
    const projectId = (req as any).projectId!
    const exposureScore = calcExposure(d.invalidationProbability, d.scopeImpact)

    // Auto-generate code: count existing per project + 1
    const count = await prisma.assumption.count({ where: { projectId } })
    const code  = `A-${(count + 1).toString().padStart(3, '0')}`

    const assumption = await prisma.assumption.create({
      data: {
        code,
        title:                   d.title,
        description:             d.description,
        category:                d.category,
        phase:                   d.phase,
        type:                    d.type,
        source:                  d.source,
        validationMethod:        d.validationMethod ?? null,
        status:                  d.status,
        ownerId:                 d.ownerId ?? null,
        validationDate:          d.validationDate ? new Date(d.validationDate) : null,
        budgetImpact:            d.budgetImpact ?? null,
        timelineImpact:          d.timelineImpact ?? null,
        scopeImpact:             d.scopeImpact,
        invalidationProbability: d.invalidationProbability,
        exposureScore,
        notes:                   d.notes,
        projectId,
      },
      include: { owner: true },
    })
    await logAudit({ user: user(req), category: CAT, entity: 'Assumption', action: 'CREATE', entityId: assumption.id, summary: `Vytvořena assumption: ${assumption.code} "${assumption.title}" · Kategorie: ${assumption.category} · Fáze: ${assumption.phase} · Exposure: ${exposureScore}`, projectId })

    // Auto-create risk if created directly with Invalid status
    if (assumption.status === 'Invalid') {
      const riskProb   = assumption.invalidationProbability
      const riskImpact = 3
      const riskScore  = riskProb * riskImpact
      const risk = await prisma.risk.create({
        data: {
          title:        `[Assumption] ${assumption.title}`,
          description:  `Automaticky vytvořeno z invalidované assumption ${assumption.code}.\n${assumption.description ?? ''}`,
          category:     'technical',
          probability:  riskProb,
          impact:       riskImpact,
          score:        riskScore,
          ownerId:      assumption.ownerId,
          status:       'Open',
          scoreHistory: { create: { score: riskScore } },
          projectId,
        },
      })
      await prisma.assumption.update({
        where: { id: assumption.id, projectId },
        data: { status: 'Converted to Risk', convertedRiskId: risk.id },
      })
      assumption.status          = 'Converted to Risk'
      assumption.convertedRiskId = risk.id
      await logAudit({ user: user(req), category: CAT, entity: 'Assumption', action: 'UPDATE', entityId: assumption.id, summary: `Assumption ${assumption.code} "${assumption.title}" vytvořena jako Invalid → automaticky vytvořeno riziko #${risk.id} "${risk.title}"`, projectId })
      await logAudit({ user: user(req), category: 'Risk Management', entity: 'Risk', action: 'CREATE', entityId: risk.id, summary: `Vytvořeno riziko z assumption ${assumption.code}: "${risk.title}" · Skóre: ${riskScore} (P${riskProb}×D${riskImpact})`, projectId })
    }

    // Lock if created directly as Validated
    if (assumption.status === 'Validated') {
      await prisma.assumption.update({
        where: { id: assumption.id, projectId },
        data: { isLocked: true, validatedAt: new Date() },
      })
      assumption.isLocked    = true
      assumption.validatedAt = new Date()
    }

    return reply.code(201).send(assumption)
  })

  // PUT update assumption
  fastify.put('/api/assumptions/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const body = AssumptionBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send(body.error)
    const d = body.data
    const projectId = (req as any).projectId ?? 1

    const existing = await prisma.assumption.findFirst({ where: { id, projectId }, include: { owner: true } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    // Locked: only allow status and notes changes
    if (existing.isLocked) {
      const coreFields = ['title', 'description', 'category', 'phase', 'type', 'source',
        'validationMethod', 'ownerId', 'validationDate', 'budgetImpact', 'timelineImpact',
        'scopeImpact', 'invalidationProbability'] as const
      const hasCoreChange = coreFields.some(f => d[f] !== undefined && (d as any)[f] !== (existing as any)[f])
      if (hasCoreChange) {
        return reply.code(409).send({ error: 'Assumption je zamčena po validaci. Lze měnit pouze Status a Poznámky.' })
      }
    }

    const prob  = d.invalidationProbability ?? existing.invalidationProbability
    const scope = d.scopeImpact             ?? existing.scopeImpact
    const exposureScore = calcExposure(prob, scope)

    const newStatus = d.status ?? existing.status
    const becomingValidated   = newStatus === 'Validated'   && existing.status !== 'Validated'
    const becomingInvalid     = newStatus === 'Invalid'     && existing.status !== 'Invalid' && existing.status !== 'Converted to Risk'

    const updateData: any = {
      title:                   d.title                   ?? existing.title,
      description:             d.description             ?? existing.description,
      category:                d.category                ?? existing.category,
      phase:                   d.phase                   ?? existing.phase,
      type:                    d.type                    ?? existing.type,
      source:                  d.source                  ?? existing.source,
      validationMethod:        d.validationMethod !== undefined ? (d.validationMethod ?? null) : existing.validationMethod,
      status:                  newStatus,
      ownerId:                 d.ownerId !== undefined ? (d.ownerId ?? null) : existing.ownerId,
      validationDate:          d.validationDate !== undefined ? (d.validationDate ? new Date(d.validationDate) : null) : existing.validationDate,
      budgetImpact:            d.budgetImpact !== undefined ? (d.budgetImpact ?? null) : existing.budgetImpact,
      timelineImpact:          d.timelineImpact !== undefined ? (d.timelineImpact ?? null) : existing.timelineImpact,
      scopeImpact:             scope,
      invalidationProbability: prob,
      exposureScore,
      notes:                   d.notes ?? existing.notes,
    }

    // Lock when validated
    if (becomingValidated) {
      updateData.isLocked   = true
      updateData.validatedAt = new Date()
      updateData.status      = 'Validated'
    }

    const assumption = await prisma.assumption.update({
      where: { id, projectId },
      data: updateData,
      include: { owner: true },
    })

    // Auto-create risk when Invalid
    if (becomingInvalid) {
      const riskProb   = assumption.invalidationProbability
      const riskImpact = 3
      const riskScore  = riskProb * riskImpact
      const risk = await prisma.risk.create({
        data: {
          title:          `[Assumption] ${assumption.title}`,
          description:    `Automaticky vytvořeno z invalidované assumption ${assumption.code}.\n${assumption.description ?? ''}`,
          category:       'technical',
          probability:    riskProb,
          impact:         riskImpact,
          score:          riskScore,
          ownerId:        assumption.ownerId,
          status:         'Open',
          scoreHistory:   { create: { score: riskScore } },
          projectId,
        },
      })
      await prisma.assumption.update({
        where: { id, projectId },
        data: { status: 'Converted to Risk', convertedRiskId: risk.id },
      })
      assumption.status          = 'Converted to Risk'
      assumption.convertedRiskId = risk.id
      await logAudit({ user: user(req), category: CAT, entity: 'Assumption', action: 'UPDATE', entityId: id, summary: `Assumption ${assumption.code} "${assumption.title}" označena jako Invalid → automaticky vytvořeno riziko #${risk.id} "${risk.title}"`, projectId })
      await logAudit({ user: user(req), category: 'Risk Management', entity: 'Risk', action: 'CREATE', entityId: risk.id, summary: `Vytvořeno riziko z assumption ${assumption.code}: "${risk.title}" · Skóre: ${riskScore} (P${riskProb}×D${riskImpact})`, projectId })
      return assumption
    }

    // Build change log
    const ch: string[] = []
    if (d.title !== undefined && d.title !== existing.title)
      ch.push(`Název: "${existing.title}" → "${d.title}"`)
    if (d.category !== undefined && d.category !== existing.category)
      ch.push(`Kategorie: ${existing.category} → ${d.category}`)
    if (d.phase !== undefined && d.phase !== existing.phase)
      ch.push(`Fáze: ${existing.phase} → ${d.phase}`)
    if (d.type !== undefined && d.type !== existing.type)
      ch.push(`Typ: ${existing.type} → ${d.type}`)
    if (d.status !== undefined && d.status !== existing.status)
      ch.push(`Status: ${existing.status} → ${newStatus}${becomingValidated ? ' (zamčena)' : ''}`)
    if (d.ownerId !== undefined && d.ownerId !== existing.ownerId) {
      const oldName = existing.owner?.name ?? '—'
      const newName = assumption.owner?.name ?? '—'
      ch.push(`Vlastník: ${oldName} → ${newName}`)
    }
    if (d.invalidationProbability !== undefined && d.invalidationProbability !== existing.invalidationProbability)
      ch.push(`Pravděpodobnost: P${existing.invalidationProbability} → P${prob}`)
    if (d.scopeImpact !== undefined && d.scopeImpact !== existing.scopeImpact)
      ch.push(`Scope dopad: ${existing.scopeImpact} → ${scope}`)
    if (exposureScore !== existing.exposureScore)
      ch.push(`Exposure: ${existing.exposureScore} → ${exposureScore}`)
    if (d.validationDate !== undefined && fmtDate(d.validationDate ? new Date(d.validationDate) : null) !== fmtDate(existing.validationDate))
      ch.push(`Datum validace: ${fmtDate(existing.validationDate)} → ${fmtDate(d.validationDate ? new Date(d.validationDate) : null)}`)
    if (d.budgetImpact !== undefined && d.budgetImpact !== existing.budgetImpact) {
      const oldVal = existing.budgetImpact != null ? existing.budgetImpact.toLocaleString('cs-CZ') + ' Kč' : '—'
      const newVal = d.budgetImpact != null ? d.budgetImpact.toLocaleString('cs-CZ') + ' Kč' : '—'
      ch.push(`Budget dopad: ${oldVal} → ${newVal}`)
    }
    if (d.timelineImpact !== undefined && d.timelineImpact !== existing.timelineImpact)
      ch.push(`Timeline dopad: ${existing.timelineImpact ?? '—'} → ${d.timelineImpact ?? '—'} dní`)
    if (d.validationMethod !== undefined && d.validationMethod !== existing.validationMethod)
      ch.push(`Metoda validace: ${existing.validationMethod ?? '—'} → ${d.validationMethod ?? '—'}`)
    if (d.source !== undefined && d.source !== existing.source)
      ch.push(`Zdroj: ${existing.source} → ${d.source}`)
    if (d.notes !== undefined && d.notes !== existing.notes)
      ch.push(`Poznámky: upraven`)

    await logAudit({ user: user(req), category: CAT, entity: 'Assumption', action: 'UPDATE', entityId: id, summary: `Upravena assumption: ${assumption.code} "${assumption.title}"${ch.length ? ' · ' + ch.join(' · ') : ''}`, projectId })
    return assumption
  })

  // DELETE assumption
  fastify.delete('/api/assumptions/:id', async (req, reply) => {
    const id = parseInt((req.params as any).id)
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' })
    const projectId = (req as any).projectId ?? 1
    const existing = await prisma.assumption.findFirst({ where: { id, projectId } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })
    await prisma.assumption.delete({ where: { id, projectId } })
    await logAudit({ user: user(req), category: CAT, entity: 'Assumption', action: 'DELETE', entityId: id, summary: `Smazána assumption: ${existing.code} "${existing.title}" · Byl ve stavu: ${existing.status}`, projectId })
    return reply.code(204).send()
  })
}
