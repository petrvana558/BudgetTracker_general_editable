import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'
import { requireRole } from '../lib/rbac'
import { calculateCriticalPath } from '../lib/critical-path'

const user = (req: any) => req.authUser?.name ?? 'System'
const CAT = 'Project Plan'

function diffDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return days + 1  // inclusive: same day = 1
}

function diffWorkDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  let count = 0
  const d = new Date(start)
  while (d <= end) {  // inclusive: count end day too
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function enrichTask(t: any) {
  return { ...t, durationDays: diffDays(t.plannedStart, t.plannedEnd), durationWorkDays: diffWorkDays(t.plannedStart, t.plannedEnd) }
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

const TaskBody = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  type: z.enum(['phase', 'workstream', 'task']).default('task'),
  parentId: z.number().int().optional().nullable(),
  ownerId: z.number().int().optional().nullable(),
  status: z.enum(['not_started', 'in_progress', 'done', 'blocked', 'unscheduled']).default('not_started'),
  progress: z.number().int().min(0).max(100).default(0),
  isMilestone: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
  kanbanColumnId: z.number().int().optional().nullable(),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  constraintType: z.string().optional().nullable(),
  constraintDate: z.string().optional().nullable(),
  estimatedCost: z.number().optional().nullable(),
  linkedRiskId: z.number().int().optional().nullable(),
  linkedAssumptionId: z.number().int().optional().nullable(),
})

const taskInclude = {
  owner: { select: { id: true, name: true } },
  kanbanColumn: { select: { id: true, name: true, color: true } },
  children: { select: { id: true, name: true, type: true, status: true, progress: true, sortOrder: true }, where: { archived: false } },
  incomingDeps: { include: { predecessor: { select: { id: true, name: true } } } },
  outgoingDeps: { include: { successor: { select: { id: true, name: true } } } },
}

export async function tasksRoutes(fastify: FastifyInstance) {
  // GET /api/tasks — list
  fastify.get('/api/tasks', async (req) => {
    const projectId = (req as any).projectId ?? 1
    const q = req.query as any
    const where: any = { projectId, archived: q.archived === 'true' ? true : false }
    if (q.status) where.status = q.status
    if (q.type) where.type = q.type
    if (q.parentId) where.parentId = parseInt(q.parentId)
    if (q.parentId === 'null') where.parentId = null

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return tasks.map(enrichTask)
  })

  // GET /api/tasks/:id — detail
  fastify.get('/api/tasks/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const task = await prisma.task.findFirst({
      where: { id: parseInt(id), projectId },
      include: taskInclude,
    })
    if (!task) return reply.status(404).send({ error: 'Task not found' })
    return enrichTask(task)
  })

  // POST /api/tasks — create
  fastify.post('/api/tasks', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const parsed = TaskBody.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message })
    const data = parsed.data

    // Resolve kanbanColumnId: use provided or first column of project
    let kanbanColumnId = data.kanbanColumnId
    if (!kanbanColumnId) {
      const firstCol = await prisma.kanbanColumn.findFirst({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
      })
      if (!firstCol) return reply.status(400).send({ error: 'No kanban columns found for project. Create columns first.' })
      kanbanColumnId = firstCol.id
    }

    // Validate parentId belongs to same project
    if (data.parentId) {
      const parent = await prisma.task.findFirst({ where: { id: data.parentId, projectId } })
      if (!parent) return reply.status(400).send({ error: 'Parent task not found in this project' })
    }

    const maxOrder = await prisma.task.aggregate({ where: { projectId, parentId: data.parentId ?? null }, _max: { sortOrder: true } })
    const task = await prisma.task.create({
      data: {
        projectId,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        parentId: data.parentId ?? null,
        ownerId: data.ownerId ?? null,
        status: data.status,
        progress: data.progress,
        isMilestone: data.isMilestone,
        sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
        kanbanColumnId,
        plannedStart: parseDate(data.plannedStart),
        plannedEnd: parseDate(data.plannedEnd),
        constraintType: data.constraintType ?? null,
        constraintDate: parseDate(data.constraintDate),
        estimatedCost: data.estimatedCost ?? null,
        linkedRiskId: data.linkedRiskId ?? null,
        linkedAssumptionId: data.linkedAssumptionId ?? null,
      },
      include: taskInclude,
    })

    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'CREATE', entityId: task.id, summary: `Vytvořen úkol: "${task.name}" (${task.type})`, projectId })
    return reply.status(201).send(enrichTask(task))
  })

  // PUT /api/tasks/:id — update
  fastify.put('/api/tasks/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const taskId = parseInt(id)

    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    const parsed = TaskBody.partial().safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message })
    const data = parsed.data

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.type !== undefined) updateData.type = data.type
    if (data.parentId !== undefined) updateData.parentId = data.parentId
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId
    if (data.status !== undefined) updateData.status = data.status
    if (data.progress !== undefined) updateData.progress = data.progress
    if (data.isMilestone !== undefined) updateData.isMilestone = data.isMilestone
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
    if (data.kanbanColumnId !== undefined) updateData.kanbanColumnId = data.kanbanColumnId
    if (data.plannedStart !== undefined) updateData.plannedStart = parseDate(data.plannedStart)
    if (data.plannedEnd !== undefined) updateData.plannedEnd = parseDate(data.plannedEnd)
    if (data.constraintType !== undefined) updateData.constraintType = data.constraintType
    if (data.constraintDate !== undefined) updateData.constraintDate = parseDate(data.constraintDate)
    if (data.estimatedCost !== undefined) updateData.estimatedCost = data.estimatedCost
    if (data.linkedRiskId !== undefined) updateData.linkedRiskId = data.linkedRiskId
    if (data.linkedAssumptionId !== undefined) updateData.linkedAssumptionId = data.linkedAssumptionId

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: taskInclude,
    })

    // Auto-shift dependent tasks if dates changed
    const newStart = updateData.plannedStart !== undefined ? updateData.plannedStart : existing.plannedStart
    const newEnd = updateData.plannedEnd !== undefined ? updateData.plannedEnd : existing.plannedEnd
    if (newEnd && (existing.plannedEnd?.getTime() !== newEnd?.getTime())) {
      await autoShiftDependents(taskId, newEnd, projectId)
    }

    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'UPDATE', entityId: taskId, summary: `Upraven úkol: "${task.name}"`, projectId })
    return enrichTask(task)
  })

  // DELETE /api/tasks/:id — soft delete (archive)
  fastify.delete('/api/tasks/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const taskId = parseInt(id)
    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    // Archive task and all children
    await archiveTaskTree(taskId, projectId, (req as any).authUser?.id ?? null)

    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'ARCHIVE', entityId: taskId, summary: `Archivován úkol: "${existing.name}"`, projectId })
    return reply.status(204).send()
  })

  // DELETE /api/tasks/:id/permanent — hard delete (superadmin only)
  fastify.delete('/api/tasks/:id/permanent', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const taskId = parseInt(id)
    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    await prisma.task.delete({ where: { id: taskId } })
    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'DELETE', entityId: taskId, summary: `Trvale smazán úkol: "${existing.name}"`, projectId })
    return reply.status(204).send()
  })

  // PATCH /api/tasks/:id/restore — restore from archive (superadmin only)
  fastify.patch('/api/tasks/:id/restore', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const taskId = parseInt(id)
    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId, archived: true } })
    if (!existing) return reply.status(404).send({ error: 'Archived task not found' })

    await prisma.task.updateMany({
      where: { id: taskId, projectId },
      data: { archived: false, archivedAt: null, archivedById: null },
    })

    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'RESTORE', entityId: taskId, summary: `Obnoven úkol z archivu: "${existing.name}"`, projectId })
    return { ok: true }
  })

  // PATCH /api/tasks/:id/kanban-move — drag-drop on kanban
  fastify.patch('/api/tasks/:id/kanban-move', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const taskId = parseInt(id)
    const body = z.object({
      kanbanColumnId: z.number().int(),
      kanbanOrder: z.number().int().default(0),
      status: z.enum(['not_started', 'in_progress', 'done', 'blocked', 'unscheduled']).optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    // Verify column belongs to same project
    const col = await prisma.kanbanColumn.findFirst({ where: { id: body.data.kanbanColumnId, projectId } })
    if (!col) return reply.status(400).send({ error: 'Column not found in this project' })

    const updateData: any = {
      kanbanColumnId: body.data.kanbanColumnId,
      kanbanOrder: body.data.kanbanOrder,
    }
    if (body.data.status) updateData.status = body.data.status

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: taskInclude,
    })

    await logAudit({ user: user(req), category: 'Kanban', entity: 'Task', action: 'MOVE', entityId: taskId, summary: `Přesunuta karta "${task.name}" do sloupce "${col.name}"`, projectId })
    return enrichTask(task)
  })

  // POST /api/tasks/reorder — bulk reorder
  fastify.post('/api/tasks/reorder', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      items: z.array(z.object({
        id: z.number().int(),
        sortOrder: z.number().int().optional(),
        kanbanOrder: z.number().int().optional(),
      })),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    for (const item of body.data.items) {
      const data: any = {}
      if (item.sortOrder !== undefined) data.sortOrder = item.sortOrder
      if (item.kanbanOrder !== undefined) data.kanbanOrder = item.kanbanOrder
      await prisma.task.updateMany({ where: { id: item.id, projectId }, data })
    }
    return { ok: true }
  })

  // POST /api/tasks/:id/save-baseline — save current planned → baseline
  fastify.post('/api/tasks/:id/save-baseline', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const taskId = parseInt(id)
    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    await prisma.task.update({
      where: { id: taskId },
      data: { baselineStart: existing.plannedStart, baselineEnd: existing.plannedEnd },
    })

    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'BASELINE', entityId: taskId, summary: `Uložen baseline pro úkol: "${existing.name}"`, projectId })
    return { ok: true }
  })

  // POST /api/tasks/save-all-baselines — save baseline for all planned tasks
  fastify.post('/api/tasks/save-all-baselines', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const tasks = await prisma.task.findMany({
      where: { projectId, archived: false, plannedStart: { not: null }, plannedEnd: { not: null } },
    })
    for (const t of tasks) {
      await prisma.task.update({
        where: { id: t.id },
        data: { baselineStart: t.plannedStart, baselineEnd: t.plannedEnd },
      })
    }
    await logAudit({ user: user(req), category: CAT, entity: 'Task', action: 'BASELINE', entityId: null, summary: `Uložen baseline pro ${tasks.length} úkolů`, projectId })
    return { ok: true, count: tasks.length }
  })

  // GET /api/tasks/export — JSON export
  fastify.get('/api/tasks/export', async (req) => {
    const projectId = (req as any).projectId ?? 1
    const tasks = await prisma.task.findMany({
      where: { projectId, archived: false },
      include: { ...taskInclude, parent: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }],
    })
    return { projectId, exportedAt: new Date().toISOString(), tasks: tasks.map(enrichTask) }
  })

  // POST /api/tasks/critical-path — recalculate critical path
  fastify.post('/api/tasks/critical-path', async (req) => {
    const projectId = (req as any).projectId ?? 1
    return calculateCriticalPath(projectId)
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function archiveTaskTree(taskId: number, projectId: number, userId: number | null) {
  await prisma.task.updateMany({
    where: { id: taskId, projectId },
    data: { archived: true, archivedAt: new Date(), archivedById: userId },
  })
  // Cascade to children
  const children = await prisma.task.findMany({ where: { parentId: taskId, projectId, archived: false } })
  for (const child of children) {
    await archiveTaskTree(child.id, projectId, userId)
  }
}

async function autoShiftDependents(taskId: number, newEnd: Date, projectId: number) {
  const deps = await prisma.taskDependency.findMany({
    where: { predecessorId: taskId },
    include: { successor: true },
  })
  for (const dep of deps) {
    if (dep.successor.projectId !== projectId) continue
    if (!dep.successor.plannedStart) continue

    const lagMs = dep.lagDays * 24 * 60 * 60 * 1000
    const newSuccessorStart = new Date(newEnd.getTime() + lagMs)

    if (newSuccessorStart > dep.successor.plannedStart) {
      const duration = diffDays(dep.successor.plannedStart, dep.successor.plannedEnd)
      const newSuccessorEnd = duration ? new Date(newSuccessorStart.getTime() + duration * 24 * 60 * 60 * 1000) : dep.successor.plannedEnd

      await prisma.task.update({
        where: { id: dep.successorId },
        data: { plannedStart: newSuccessorStart, plannedEnd: newSuccessorEnd },
      })
      // Recursively shift further dependents
      if (newSuccessorEnd) {
        await autoShiftDependents(dep.successorId, newSuccessorEnd, projectId)
      }
    }
  }
}
