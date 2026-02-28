import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'

const CompanyBody = z.object({
  name:   z.string().min(1),
  slug:   z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug: only lowercase letters, numbers, hyphens'),
  active: z.boolean().optional(),
})

const CreateCompanyBody = CompanyBody.extend({
  adminEmail:    z.string().min(3),
  adminName:     z.string().min(1),
  adminPassword: z.string().min(6),
})

export async function companiesRoutes(fastify: FastifyInstance) {
  // GET /api/companies — superadmin only
  fastify.get('/api/companies', { preHandler: requireRole('superadmin') }, async () => {
    return prisma.company.findMany({
      include: {
        _count: { select: { users: true, projects: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  })

  // POST /api/companies — superadmin only
  // Creates company + first admin user + default project + assigns admin to project
  fastify.post('/api/companies', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const body = CreateCompanyBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const existingSlug = await prisma.company.findUnique({ where: { slug: body.data.slug } })
    if (existingSlug) return reply.code(409).send({ error: 'Slug already exists' })

    const existingEmail = await prisma.user.findUnique({ where: { email: body.data.adminEmail } })
    if (existingEmail) return reply.code(409).send({ error: 'Admin email already exists' })

    // Create company
    const company = await prisma.company.create({
      data: { name: body.data.name, slug: body.data.slug },
    })

    // Create default project for this company
    const project = await prisma.project.create({
      data: { name: body.data.name, companyId: company.id },
    })

    // Create company admin
    const passwordHash = await bcrypt.hash(body.data.adminPassword, 10)
    const admin = await prisma.user.create({
      data: {
        email: body.data.adminEmail,
        name: body.data.adminName,
        passwordHash,
        role: 'admin',
        companyId: company.id,
      },
    })

    // Assign admin to default project
    await prisma.projectUser.create({
      data: { projectId: project.id, userId: admin.id },
    })

    return reply.code(201).send({ company, project, admin: { id: admin.id, email: admin.email, name: admin.name } })
  })

  // PUT /api/companies/:id — superadmin only
  fastify.put('/api/companies/:id', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = CompanyBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })
    const company = await prisma.company.update({ where: { id: parseInt(id) }, data: body.data })
    return company
  })

  // DELETE /api/companies/:id — superadmin only (cascades users + projects + all data)
  fastify.delete('/api/companies/:id', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const cid = parseInt(id)
    if (cid === 1) return reply.code(400).send({ error: 'Cannot delete the default company' })
    // Cascade: delete all projects (which cascades all data) + users
    await prisma.project.deleteMany({ where: { companyId: cid } })
    await prisma.user.deleteMany({ where: { companyId: cid } })
    await prisma.company.delete({ where: { id: cid } })
    return reply.code(204).send()
  })

  // GET /api/companies/:id/overview — superadmin only (support view)
  fastify.get('/api/companies/:id/overview', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const cid = parseInt(id)
    const company = await prisma.company.findUnique({ where: { id: cid } })
    if (!company) return reply.code(404).send({ error: 'Company not found' })
    const users = await prisma.user.findMany({
      where: { companyId: cid },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    })
    const projects = await prisma.project.findMany({
      where: { companyId: cid },
      select: { id: true, name: true, description: true, createdAt: true },
    })
    return { company, users, projects }
  })
}
