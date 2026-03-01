import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'

const ProjectBody = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  companyId:   z.number().int().optional(),  // superadmin can specify
})

export async function projectsRoutes(fastify: FastifyInstance) {
  // GET /api/projects — scoped by role/company
  fastify.get('/api/projects', async (req) => {
    const role = req.authUser?.role
    if (role === 'superadmin') {
      return prisma.project.findMany({
        include: {
          company: { select: { id: true, name: true } },
          users: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (role === 'admin') {
      return prisma.project.findMany({
        where: { companyId: req.authUser!.companyId! },
        include: {
          company: { select: { id: true, name: true } },
          users: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      })
    }
    // user: own company + own membership
    return prisma.project.findMany({
      where: { users: { some: { userId: req.authUser!.id } }, companyId: req.authUser!.companyId! },
      select: { id: true, name: true, description: true, createdAt: true, company: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })
  })

  // POST /api/projects — admin (own company) or superadmin (can specify companyId)
  fastify.post('/api/projects', { preHandler: requireRole('admin') }, async (req, reply) => {
    const body = ProjectBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })
    const companyId = req.authUser?.role === 'superadmin'
      ? (body.data.companyId ?? 1)
      : req.authUser!.companyId!

    // Plan limit check (superadmin bypasses)
    if (req.authUser?.role !== 'superadmin') {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: { plan: { select: { maxProjects: true } } },
      })
      if (company?.plan) {
        const maxProjects = company.maxProjectsOverride ?? company.plan.maxProjects
        const currentCount = await prisma.project.count({ where: { companyId } })
        if (currentCount >= maxProjects) {
          return reply.code(403).send({
            error: 'plan_limit',
            message: `Váš tarif umožňuje max. ${maxProjects} projektů. Kontaktujte podporu pro navýšení.`,
          })
        }
      }
    }

    const project = await prisma.project.create({ data: { name: body.data.name, description: body.data.description, companyId } })
    return reply.code(201).send(project)
  })

  // PUT /api/projects/:id — admin (own company) or superadmin
  fastify.put('/api/projects/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = ProjectBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })
    const project = await prisma.project.update({ where: { id: parseInt(id) }, data: { name: body.data.name, description: body.data.description } })
    return project
  })

  // DELETE /api/projects/:id — admin (own company) or superadmin
  fastify.delete('/api/projects/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const pid = parseInt(id)
    if (pid === 1) return reply.code(400).send({ error: 'Cannot delete the default project' })
    await prisma.project.delete({ where: { id: pid } })
    return reply.code(204).send()
  })

  // GET /api/projects/:id/users — members list (admin)
  fastify.get('/api/projects/:id/users', { preHandler: requireRole('admin') }, async (req) => {
    const { id } = req.params as { id: string }
    return prisma.projectUser.findMany({
      where: { projectId: parseInt(id) },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    })
  })

  // POST /api/projects/:id/users — add member (admin)
  fastify.post('/api/projects/:id/users', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { userId } = req.body as { userId: number }
    if (!userId) return reply.code(400).send({ error: 'userId required' })
    const existing = await prisma.projectUser.findUnique({
      where: { projectId_userId: { projectId: parseInt(id), userId } }
    })
    if (existing) return reply.code(409).send({ error: 'User already in project' })
    const pu = await prisma.projectUser.create({
      data: { projectId: parseInt(id), userId },
    })
    return reply.code(201).send(pu)
  })

  // DELETE /api/projects/:id/users/:userId — remove member (admin)
  fastify.delete('/api/projects/:id/users/:userId', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string }
    await prisma.projectUser.delete({
      where: { projectId_userId: { projectId: parseInt(id), userId: parseInt(userId) } },
    })
    return reply.code(204).send()
  })
}
