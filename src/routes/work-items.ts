import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'
import { sendWorkItemAssignedEmail, sendWorkItemStepEmail } from '../lib/email'

const user = (req: any) => req.authUser?.name ?? 'System'
const CAT = 'Work Board'

async function getEmailSetting(projectId: number, key: string): Promise<string | null> {
  const row = await prisma.settings.findUnique({ where: { projectId_key: { projectId, key } } })
  return row?.value ?? null
}

async function getProjectName(projectId: number): Promise<string> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
  return p?.name ?? 'Projekt'
}

const WorkItemBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  type: z.enum(['epic', 'story', 'task', 'bug']).default('task'),
  parentId: z.number().int().optional().nullable(),
  assigneeId: z.number().int().optional().nullable(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).default('backlog'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().nullable(),
  storyPoints: z.number().int().min(0).optional().nullable(),
  columnId: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const workItemInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  column: { select: { id: true, name: true, color: true } },
  children: {
    select: { id: true, title: true, type: true, status: true, priority: true, storyPoints: true, sortOrder: true, assigneeId: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  pmLinks: {
    include: { pmTask: { select: { id: true, name: true, type: true, status: true } } },
  },
  parent: { select: { id: true, title: true, type: true } },
}

async function logWorkItem(opts: {
  projectId: number; workItemId: number; user: string; action: string;
  field?: string; oldValue?: string; newValue?: string; summary: string;
}) {
  await prisma.workItemLog.create({
    data: {
      projectId: opts.projectId,
      workItemId: opts.workItemId,
      user: opts.user,
      action: opts.action,
      field: opts.field ?? null,
      oldValue: opts.oldValue ?? null,
      newValue: opts.newValue ?? null,
      summary: opts.summary,
    },
  })
}

export async function workItemsRoutes(fastify: FastifyInstance) {
  // GET /api/work-items — list with filters
  fastify.get('/api/work-items', async (req) => {
    const projectId = (req as any).projectId ?? 1
    const q = req.query as any
    const where: any = { projectId }
    if (q.status) where.status = q.status
    if (q.type) where.type = q.type
    if (q.parentId) where.parentId = parseInt(q.parentId)
    if (q.parentId === 'null') where.parentId = null
    if (q.assigneeId) where.assigneeId = parseInt(q.assigneeId)
    if (q.columnId) where.columnId = parseInt(q.columnId)
    if (q.search) where.title = { contains: q.search }

    const items = await prisma.workItem.findMany({
      where,
      include: workItemInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return items
  })

  // GET /api/work-items/:id — detail
  fastify.get('/api/work-items/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const item = await prisma.workItem.findFirst({
      where: { id: parseInt(id), projectId },
      include: workItemInclude,
    })
    if (!item) return reply.status(404).send({ error: 'Work item not found' })
    return item
  })

  // POST /api/work-items — create
  fastify.post('/api/work-items', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const parsed = WorkItemBody.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message })
    const data = parsed.data

    // Resolve columnId: use provided or first column of project
    let columnId = data.columnId
    if (!columnId) {
      const firstCol = await prisma.workColumn.findFirst({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
      })
      if (!firstCol) return reply.status(400).send({ error: 'No work columns found. Create columns first.' })
      columnId = firstCol.id
    }

    // Validate parentId
    if (data.parentId) {
      const parent = await prisma.workItem.findFirst({ where: { id: data.parentId, projectId } })
      if (!parent) return reply.status(400).send({ error: 'Parent work item not found in this project' })
    }

    const maxOrder = await prisma.workItem.aggregate({ where: { projectId, parentId: data.parentId ?? null }, _max: { sortOrder: true } })
    const item = await prisma.workItem.create({
      data: {
        projectId,
        title: data.title,
        description: data.description ?? null,
        type: data.type,
        parentId: data.parentId ?? null,
        assigneeId: data.assigneeId ?? null,
        status: data.status,
        priority: data.priority ?? null,
        storyPoints: data.storyPoints ?? null,
        columnId,
        sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
      include: workItemInclude,
    })

    await logWorkItem({ projectId, workItemId: item.id, user: user(req), action: 'created', summary: `Created: "${item.title}" (${item.type})` })
    await logAudit({ user: user(req), category: CAT, entity: 'WorkItem', action: 'CREATE', entityId: item.id, summary: `Created work item: "${item.title}" (${item.type})`, projectId })

    // Send assignment email if created with assignee
    if (item.assignee?.email) {
      const notifyAssign = await getEmailSetting(projectId, 'wb_notify_assignment')
      if (notifyAssign === 'true') {
        const projectName = await getProjectName(projectId)
        await sendWorkItemAssignedEmail(item.assignee.email, {
          itemTitle: item.title, itemType: item.type,
          assignedBy: user(req), projectName,
        })
        await logWorkItem({ projectId, workItemId: item.id, user: 'System', action: 'email_trigger', summary: `Assignment email sent to ${item.assignee.email}` })
      }
    }

    return reply.status(201).send(item)
  })

  // PUT /api/work-items/:id — update
  fastify.put('/api/work-items/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const itemId = parseInt(id)

    const existing = await prisma.workItem.findFirst({ where: { id: itemId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Work item not found' })

    const parsed = WorkItemBody.partial().safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message })
    const data = parsed.data

    const updateData: any = {}
    const changes: { field: string; oldVal: string; newVal: string }[] = []

    if (data.title !== undefined) { updateData.title = data.title; if (data.title !== existing.title) changes.push({ field: 'title', oldVal: existing.title, newVal: data.title }) }
    if (data.description !== undefined) updateData.description = data.description
    if (data.type !== undefined) { updateData.type = data.type; if (data.type !== existing.type) changes.push({ field: 'type', oldVal: existing.type, newVal: data.type }) }
    if (data.parentId !== undefined) updateData.parentId = data.parentId
    if (data.assigneeId !== undefined) { updateData.assigneeId = data.assigneeId; if (data.assigneeId !== existing.assigneeId) changes.push({ field: 'assignee', oldVal: String(existing.assigneeId ?? ''), newVal: String(data.assigneeId ?? '') }) }
    if (data.status !== undefined) { updateData.status = data.status; if (data.status !== existing.status) changes.push({ field: 'status', oldVal: existing.status, newVal: data.status }) }
    if (data.priority !== undefined) { updateData.priority = data.priority; if (data.priority !== existing.priority) changes.push({ field: 'priority', oldVal: existing.priority ?? '', newVal: data.priority ?? '' }) }
    if (data.storyPoints !== undefined) updateData.storyPoints = data.storyPoints
    if (data.columnId !== undefined) updateData.columnId = data.columnId
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

    const item = await prisma.workItem.update({
      where: { id: itemId },
      data: updateData,
      include: workItemInclude,
    })

    // Log each changed field
    for (const ch of changes) {
      await logWorkItem({ projectId, workItemId: itemId, user: user(req), action: 'updated', field: ch.field, oldValue: ch.oldVal, newValue: ch.newVal, summary: `Changed ${ch.field}: "${ch.oldVal}" → "${ch.newVal}"` })
    }

    await logAudit({ user: user(req), category: CAT, entity: 'WorkItem', action: 'UPDATE', entityId: itemId, summary: `Updated work item: "${item.title}"`, projectId })

    // Send assignment email if assignee changed and new assignee has email
    if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId && item.assignee?.email) {
      const notifyAssign = await getEmailSetting(projectId, 'wb_notify_assignment')
      if (notifyAssign === 'true') {
        const projectName = await getProjectName(projectId)
        await sendWorkItemAssignedEmail(item.assignee.email, {
          itemTitle: item.title, itemType: item.type,
          assignedBy: user(req), projectName,
        })
        await logWorkItem({ projectId, workItemId: itemId, user: 'System', action: 'email_trigger', summary: `Assignment email sent to ${item.assignee.email}` })
      }
    }

    return item
  })

  // DELETE /api/work-items/:id — hard delete
  fastify.delete('/api/work-items/:id', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const itemId = parseInt(id)
    const existing = await prisma.workItem.findFirst({ where: { id: itemId, projectId } })
    if (!existing) return reply.status(404).send({ error: 'Work item not found' })

    await prisma.workItem.delete({ where: { id: itemId } })
    await logAudit({ user: user(req), category: CAT, entity: 'WorkItem', action: 'DELETE', entityId: itemId, summary: `Deleted work item: "${existing.title}"`, projectId })
    return reply.status(204).send()
  })

  // PATCH /api/work-items/:id/move — drag-drop on board
  fastify.patch('/api/work-items/:id/move', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const itemId = parseInt(id)
    const body = z.object({
      columnId: z.number().int(),
      sortOrder: z.number().int().default(0),
      status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    const existing = await prisma.workItem.findFirst({ where: { id: itemId, projectId }, include: { column: { select: { name: true } } } })
    if (!existing) return reply.status(404).send({ error: 'Work item not found' })

    const col = await prisma.workColumn.findFirst({ where: { id: body.data.columnId, projectId } })
    if (!col) return reply.status(400).send({ error: 'Column not found in this project' })

    const updateData: any = {
      columnId: body.data.columnId,
      sortOrder: body.data.sortOrder,
    }
    if (body.data.status) updateData.status = body.data.status

    const item = await prisma.workItem.update({
      where: { id: itemId },
      data: updateData,
      include: workItemInclude,
    })

    await logWorkItem({ projectId, workItemId: itemId, user: user(req), action: 'moved', field: 'column', oldValue: existing.column.name, newValue: col.name, summary: `Moved "${item.title}" from "${existing.column.name}" to "${col.name}"` })
    await logAudit({ user: user(req), category: CAT, entity: 'WorkItem', action: 'MOVE', entityId: itemId, summary: `Moved "${item.title}" to column "${col.name}"`, projectId })

    // Check workflow steps for email notification
    const step = await prisma.workflowStep.findFirst({ where: { projectId, name: col.name } })
    if (step?.notifyEmail && item.assignee?.email) {
      const projectName = await getProjectName(projectId)
      await sendWorkItemStepEmail(item.assignee.email, {
        itemTitle: item.title, stepName: col.name,
        movedBy: user(req), projectName,
      })
      await logWorkItem({ projectId, workItemId: itemId, user: 'System', action: 'email_trigger', summary: `Step email sent to ${item.assignee.email} for step "${col.name}"` })
    }

    return item
  })

  // POST /api/work-items/reorder — bulk reorder
  fastify.post('/api/work-items/reorder', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const body = z.object({
      items: z.array(z.object({
        id: z.number().int(),
        sortOrder: z.number().int(),
      })),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    for (const item of body.data.items) {
      await prisma.workItem.updateMany({ where: { id: item.id, projectId }, data: { sortOrder: item.sortOrder } })
    }
    return { ok: true }
  })

  // POST /api/work-items/:id/link — link to PM Task
  fastify.post('/api/work-items/:id/link', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const itemId = parseInt(id)
    const body = z.object({ pmTaskId: z.number().int() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message })

    // Verify both exist in project
    const item = await prisma.workItem.findFirst({ where: { id: itemId, projectId } })
    if (!item) return reply.status(404).send({ error: 'Work item not found' })
    const task = await prisma.task.findFirst({ where: { id: body.data.pmTaskId, projectId } })
    if (!task) return reply.status(404).send({ error: 'PM Task not found in this project' })

    const link = await prisma.pmTaskWorkItemLink.create({
      data: { pmTaskId: body.data.pmTaskId, workItemId: itemId },
    })

    await logWorkItem({ projectId, workItemId: itemId, user: user(req), action: 'linked', summary: `Linked to PM task: "${task.name}"` })
    await logAudit({ user: user(req), category: CAT, entity: 'PmTaskWorkItemLink', action: 'CREATE', entityId: link.id, summary: `Linked work item "${item.title}" ↔ PM task "${task.name}"`, projectId })
    return reply.status(201).send(link)
  })

  // DELETE /api/work-items/:id/link/:linkId — unlink from PM Task
  fastify.delete('/api/work-items/:id/link/:linkId', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id, linkId } = req.params as any
    const itemId = parseInt(id)

    const link = await prisma.pmTaskWorkItemLink.findUnique({ where: { id: parseInt(linkId) } })
    if (!link || link.workItemId !== itemId) return reply.status(404).send({ error: 'Link not found' })

    await prisma.pmTaskWorkItemLink.delete({ where: { id: parseInt(linkId) } })
    await logAudit({ user: user(req), category: CAT, entity: 'PmTaskWorkItemLink', action: 'DELETE', entityId: parseInt(linkId), summary: `Unlinked work item #${itemId} from PM task #${link.pmTaskId}`, projectId })
    return reply.status(204).send()
  })

  // GET /api/work-items/:id/log — get activity log for a work item
  fastify.get('/api/work-items/:id/log', async (req, reply) => {
    const projectId = (req as any).projectId ?? 1
    const { id } = req.params as any
    const itemId = parseInt(id)

    const logs = await prisma.workItemLog.findMany({
      where: { workItemId: itemId, projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return logs
  })

  // GET /api/work-item-logs — get all work item logs for current project
  fastify.get('/api/work-item-logs', async (req) => {
    const projectId = (req as any).projectId ?? 1
    const q = req.query as any
    const where: any = { projectId }
    if (q.action) where.action = q.action
    if (q.workItemId) where.workItemId = parseInt(q.workItemId)

    const logs = await prisma.workItemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(q.limit) || 200,
      include: { workItem: { select: { id: true, title: true } } },
    })
    return logs
  })
}
