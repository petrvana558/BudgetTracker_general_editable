import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'

const CreateInvoiceBody = z.object({
  companyId: z.number().int(),
  amount:    z.number().min(0),
  dueDate:   z.string().min(1),
  notes:     z.string().optional(),
})

function generateVariableSymbol(companyId: number): string {
  const now = new Date()
  const yy = String(now.getFullYear() % 100).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const cid = String(companyId).padStart(4, '0')
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0')
  return `${yy}${mm}${cid}${rand}`
}

export async function invoicesRoutes(fastify: FastifyInstance) {
  // GET /api/invoices — superadmin: all; admin: own company
  fastify.get('/api/invoices', { preHandler: requireRole('admin') }, async (req) => {
    if (req.authUser?.role === 'superadmin') {
      return prisma.invoice.findMany({
        include: { company: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
    }
    return prisma.invoice.findMany({
      where: { companyId: req.authUser!.companyId! },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /api/invoices — superadmin only
  fastify.post('/api/invoices', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const body = CreateInvoiceBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    let variableSymbol = generateVariableSymbol(body.data.companyId)
    // Ensure uniqueness
    while (await prisma.invoice.findUnique({ where: { variableSymbol } })) {
      variableSymbol = generateVariableSymbol(body.data.companyId)
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId: body.data.companyId,
        amount: body.data.amount,
        variableSymbol,
        dueDate: new Date(body.data.dueDate),
        notes: body.data.notes,
      },
      include: { company: { select: { name: true } } },
    })
    return reply.code(201).send(invoice)
  })

  // PATCH /api/invoices/:id/pay — superadmin only: mark as paid + activate company
  fastify.patch('/api/invoices/:id/pay', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const invoice = await prisma.invoice.findUnique({ where: { id: parseInt(id) } })
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' })

    // Mark invoice as paid
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'paid', paidAt: new Date() },
    })

    // Activate company
    await prisma.company.update({
      where: { id: invoice.companyId },
      data: { status: 'active', trialEndsAt: null },
    })

    return { success: true, companyId: invoice.companyId }
  })

  // PUT /api/invoices/:id — superadmin only: update invoice
  fastify.put('/api/invoices/:id', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
      notes: z.string().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const data: Record<string, unknown> = {}
    if (body.data.status) data.status = body.data.status
    if (body.data.notes !== undefined) data.notes = body.data.notes
    if (body.data.status === 'paid') data.paidAt = new Date()

    const invoice = await prisma.invoice.update({
      where: { id: parseInt(id) },
      data,
      include: { company: { select: { name: true } } },
    })
    return invoice
  })
}
