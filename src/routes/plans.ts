import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'

const PlanBody = z.object({
  name:         z.string().min(1),
  slug:         z.string().min(1).regex(/^[a-z0-9-]+$/),
  sections:     z.array(z.string()).default([]),
  maxProjects:  z.number().int().min(1).default(1),
  maxUsers:     z.number().int().min(1).default(5),
  priceMonthly: z.number().min(0).default(0),
  description:  z.string().optional(),
  isDefault:    z.boolean().optional(),
  isPublic:     z.boolean().optional(),
  active:       z.boolean().optional(),
})

export async function plansRoutes(fastify: FastifyInstance) {
  // GET /api/plans/public — public (for registration page) — only isPublic plans
  fastify.get('/api/plans/public', async () => {
    return prisma.plan.findMany({
      where: { active: true, isPublic: true },
      select: { id: true, name: true, slug: true, sections: true, maxProjects: true, maxUsers: true, priceMonthly: true, description: true, isDefault: true },
      orderBy: { priceMonthly: 'asc' },
    })
  })

  // GET /api/plans — superadmin only (all plans)
  fastify.get('/api/plans', { preHandler: requireRole('superadmin') }, async () => {
    return prisma.plan.findMany({
      include: { _count: { select: { companies: true } } },
      orderBy: { priceMonthly: 'asc' },
    })
  })

  // POST /api/plans — superadmin only
  fastify.post('/api/plans', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const body = PlanBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const existing = await prisma.plan.findUnique({ where: { slug: body.data.slug } })
    if (existing) return reply.code(409).send({ error: 'Slug already exists' })

    const plan = await prisma.plan.create({
      data: {
        ...body.data,
        sections: JSON.stringify(body.data.sections),
        isPublic: body.data.isPublic ?? false, // new plans default to hidden
      },
    })
    return reply.code(201).send(plan)
  })

  // PUT /api/plans/:id — superadmin only
  fastify.put('/api/plans/:id', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = PlanBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const data: Record<string, unknown> = { ...body.data }
    if (body.data.sections) data.sections = JSON.stringify(body.data.sections)

    const plan = await prisma.plan.update({ where: { id: parseInt(id) }, data })
    return plan
  })

  // DELETE /api/plans/:id — superadmin only (soft-delete)
  fastify.delete('/api/plans/:id', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.plan.update({ where: { id: parseInt(id) }, data: { active: false } })
    return reply.code(204).send()
  })
}
