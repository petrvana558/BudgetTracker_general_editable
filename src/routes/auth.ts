import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'
import { logAudit } from './audit'

const SECTIONS = ['assets', 'labor', 'testing', 'risks', 'issues', 'changes', 'assumptions'] as const
const DEFAULT_PERMISSIONS = Object.fromEntries(SECTIONS.map(s => [s, 'none']))

// Password must have: min 6 chars, uppercase, lowercase, digit, special char
const passwordSchema = z.string().min(6).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{6,}$/,
  'Heslo musí obsahovat velké písmeno, malé písmeno, číslici a speciální znak'
)

const LoginBody = z.object({
  email:    z.string().min(1),
  password: z.string().min(1),
})

const PermissionsSchema = z.record(z.enum(['none', 'read', 'write'])).optional()

const CreateUserBody = z.object({
  email:       z.string().min(3),
  name:        z.string().min(1),
  password:    passwordSchema,
  role:        z.enum(['admin', 'user']).default('user'),
  permissions: PermissionsSchema,
  companyId:   z.number().int().optional(),  // superadmin can assign to specific company
})

const UpdateUserBody = z.object({
  name:        z.string().min(1).optional(),
  role:        z.enum(['admin', 'user']).optional(),
  password:    passwordSchema.optional(),
  active:      z.boolean().optional(),
  permissions: PermissionsSchema,
  companyId:   z.number().int().optional(),
})

function userSelect() {
  return { id: true, email: true, name: true, role: true, permissions: true, active: true, companyId: true, createdAt: true }
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login — public
  fastify.post('/api/auth/login', async (req, reply) => {
    const body = LoginBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user || !user.active) return reply.code(401).send({ error: 'Invalid credentials' })

    const ok = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions, companyId: user.companyId },
      { expiresIn: '8h' }
    )

    // Scope projects by role and company
    const projects = await prisma.project.findMany({
      where: user.role === 'superadmin' ? {} :
             user.role === 'admin'      ? { companyId: user.companyId! } :
             { users: { some: { userId: user.id } }, companyId: user.companyId! },
      select: { id: true, name: true, company: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    // Flatten companyName into each project
    const projectList = projects.map(p => ({
      id: p.id,
      name: p.name,
      companyName: p.company?.name ?? null,
    }))

    // Company + plan info for this user
    const company = user.companyId
      ? await prisma.company.findUnique({
          where: { id: user.companyId },
          select: { id: true, name: true, status: true, trialEndsAt: true, plan: { select: { name: true, sections: true } } },
        })
      : null

    let planSections: string[] = []
    if (company?.plan) {
      try { planSections = JSON.parse(company.plan.sections) } catch {}
    }
    // Superadmin gets all sections
    if (user.role === 'superadmin') {
      planSections = ['assets', 'labor', 'testing', 'risks', 'issues', 'changes', 'assumptions']
    }

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions, companyId: user.companyId, companyName: company?.name ?? null },
      projects: projectList,
      companyStatus: company?.status ?? 'active',
      trialEndsAt: company?.trialEndsAt?.toISOString() ?? null,
      planSections,
      planName: company?.plan?.name ?? null,
    }
  })

  // GET /api/auth/me
  fastify.get('/api/auth/me', async (req) => req.authUser)

  // GET /api/users — admin (own company) or superadmin (all)
  fastify.get('/api/users', { preHandler: requireRole('admin') }, async (req) => {
    if (req.authUser?.role === 'superadmin') {
      return prisma.user.findMany({ select: userSelect(), orderBy: { createdAt: 'asc' } })
    }
    return prisma.user.findMany({
      where: { companyId: req.authUser!.companyId },
      select: userSelect(),
      orderBy: { createdAt: 'asc' },
    })
  })

  // POST /api/users — admin (creates in own company) or superadmin (can specify companyId)
  fastify.post('/api/users', { preHandler: requireRole('admin') }, async (req, reply) => {
    const body = CreateUserBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) return reply.code(409).send({ error: 'Email already exists' })

    const companyId = req.authUser?.role === 'superadmin'
      ? (body.data.companyId ?? null)
      : req.authUser!.companyId

    // Plan limit check for user count (superadmin bypasses)
    if (req.authUser?.role !== 'superadmin' && companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: { plan: { select: { maxUsers: true } } },
      })
      if (company?.plan) {
        const maxUsers = company.maxUsersOverride ?? company.plan.maxUsers
        const currentCount = await prisma.user.count({ where: { companyId, active: true } })
        if (currentCount >= maxUsers) {
          return reply.code(403).send({
            error: 'plan_limit',
            message: `Váš tarif umožňuje max. ${maxUsers} uživatelů. Kontaktujte podporu pro navýšení.`,
          })
        }
      }
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const perms = body.data.role === 'admin'
      ? {}
      : { ...DEFAULT_PERMISSIONS, ...(body.data.permissions ?? {}) }

    const user = await prisma.user.create({
      data: {
        email: body.data.email,
        name: body.data.name,
        passwordHash,
        role: body.data.role,
        permissions: JSON.stringify(perms),
        companyId,
      },
      select: userSelect(),
    })

    const permLabels = body.data.role === 'admin' ? 'admin (plný přístup)' : Object.entries(perms).filter(([,v]) => v !== 'none').map(([k,v]) => `${k}:${v}`).join(', ') || 'žádná'
    await logAudit({
      user: req.authUser?.name || 'System',
      category: 'Správa uživatelů',
      entity: 'User',
      action: 'CREATE',
      entityId: user.id,
      summary: `Vytvořen uživatel: "${user.name}" (${user.email}) · Role: ${user.role} · Oprávnění: ${permLabels}`,
      projectId: (req as any).projectId ?? 1,
    })

    return reply.code(201).send(user)
  })

  // PUT /api/users/:id — admin only
  fastify.put('/api/users/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = UpdateUserBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const data: Record<string, unknown> = {}
    if (body.data.name !== undefined) data.name = body.data.name
    if (body.data.role !== undefined) data.role = body.data.role
    if (body.data.active !== undefined) data.active = body.data.active
    if (body.data.password) data.passwordHash = await bcrypt.hash(body.data.password, 10)
    if (body.data.companyId !== undefined && req.authUser?.role === 'superadmin') {
      data.companyId = body.data.companyId
    }
    if (body.data.permissions !== undefined) {
      data.permissions = JSON.stringify({ ...DEFAULT_PERMISSIONS, ...body.data.permissions })
    }

    const existing = await prisma.user.findUnique({ where: { id: parseInt(id) }, select: { name: true, email: true, role: true, permissions: true, active: true } })
    const user = await prisma.user.update({ where: { id: parseInt(id) }, data, select: userSelect() })

    // Build change log
    const ch: string[] = []
    if (body.data.name !== undefined && body.data.name !== existing?.name) ch.push(`Jméno: "${existing?.name}" → "${body.data.name}"`)
    if (body.data.role !== undefined && body.data.role !== existing?.role) ch.push(`Role: ${existing?.role} → ${body.data.role}`)
    if (body.data.active !== undefined && body.data.active !== existing?.active) ch.push(body.data.active ? 'Aktivován' : 'Deaktivován')
    if (body.data.password) ch.push('Heslo změněno')
    if (body.data.permissions !== undefined) {
      const oldPerms: Record<string, string> = JSON.parse(existing?.permissions || '{}')
      const newPerms: Record<string, string> = { ...DEFAULT_PERMISSIONS, ...body.data.permissions }
      const permChanges = Object.keys(newPerms).filter(k => oldPerms[k] !== newPerms[k]).map(k => `${k}: ${oldPerms[k] || 'none'} → ${newPerms[k]}`)
      if (permChanges.length) ch.push(`Oprávnění: ${permChanges.join(', ')}`)
    }
    if (ch.length) {
      await logAudit({
        user: req.authUser?.name || 'System',
        category: 'Správa uživatelů',
        entity: 'User',
        action: 'UPDATE',
        entityId: parseInt(id),
        summary: `Upraven uživatel: "${user.name}" (${user.email}) · ${ch.join(' · ')}`,
        projectId: (req as any).projectId ?? 1,
      })
    }

    return user
  })

  // DELETE /api/users/:id — admin only (deactivates)
  fastify.delete('/api/users/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (parseInt(id) === req.authUser?.id) {
      return reply.code(400).send({ error: 'Cannot deactivate your own account' })
    }
    const target = await prisma.user.findUnique({ where: { id: parseInt(id) }, select: { name: true, email: true } })
    await prisma.user.update({ where: { id: parseInt(id) }, data: { active: false } })

    await logAudit({
      user: req.authUser?.name || 'System',
      category: 'Správa uživatelů',
      entity: 'User',
      action: 'DELETE',
      entityId: parseInt(id),
      summary: `Deaktivován uživatel: "${target?.name}" (${target?.email})`,
      projectId: (req as any).projectId ?? 1,
    })

    return reply.code(204).send()
  })
}
