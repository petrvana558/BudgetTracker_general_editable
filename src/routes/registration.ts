import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../db'

const RegisterBody = z.object({
  companyName:  z.string().min(2),
  companySlug:  z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug: only lowercase, numbers, hyphens'),
  planSlug:     z.string().min(1),
  userName:     z.string().min(1),
  userEmail:    z.string().email(),
  userPassword: z.string().min(6).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{6,}$/,
    'Heslo musí obsahovat velké písmeno, malé písmeno, číslici a speciální znak'
  ),
  captchaId:     z.string().min(1),
  captchaAnswer: z.number().int(),
})

function generateVariableSymbol(companyId: number): string {
  const now = new Date()
  const yy = String(now.getFullYear() % 100).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const cid = String(companyId).padStart(4, '0')
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0')
  return `${yy}${mm}${cid}${rand}`
}

// In-memory captcha store (auto-expires after 5 min)
const captchaStore = new Map<string, { answer: number; expires: number }>()

function cleanExpiredCaptchas() {
  const now = Date.now()
  for (const [id, c] of captchaStore) {
    if (c.expires < now) captchaStore.delete(id)
  }
}

export async function registrationRoutes(fastify: FastifyInstance) {
  // GET /api/auth/captcha — generate math challenge
  fastify.get('/api/auth/captcha', async () => {
    cleanExpiredCaptchas()
    const a = Math.floor(Math.random() * 20) + 1
    const b = Math.floor(Math.random() * 20) + 1
    const id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    const answer = a + b
    captchaStore.set(id, { answer, expires: Date.now() + 5 * 60 * 1000 })
    return { id, question: `${a} + ${b} = ?` }
  })

  // POST /api/auth/register — public, self-service registration
  fastify.post('/api/auth/register', async (req, reply) => {
    const body = RegisterBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    // Validate captcha
    const captcha = captchaStore.get(body.data.captchaId)
    if (!captcha || captcha.expires < Date.now()) {
      captchaStore.delete(body.data.captchaId)
      return reply.code(400).send({ error: 'Captcha vypršela, zkuste to znovu' })
    }
    if (captcha.answer !== body.data.captchaAnswer) {
      captchaStore.delete(body.data.captchaId)
      return reply.code(400).send({ error: 'Špatná odpověď na ověřovací otázku' })
    }
    captchaStore.delete(body.data.captchaId)

    // Check slug uniqueness
    const existingSlug = await prisma.company.findUnique({ where: { slug: body.data.companySlug } })
    if (existingSlug) return reply.code(409).send({ error: 'Company slug already taken' })

    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({ where: { email: body.data.userEmail } })
    if (existingEmail) return reply.code(409).send({ error: 'Email already registered' })

    // Find the plan
    const plan = await prisma.plan.findUnique({ where: { slug: body.data.planSlug } })
    if (!plan || !plan.active) return reply.code(400).send({ error: 'Invalid plan' })

    // Individual plan — just record the inquiry, don't create account
    if (plan.slug === 'individual') {
      console.log(`📩 Individual plan inquiry: ${body.data.companyName} (${body.data.userEmail})`)
      return reply.code(200).send({
        individual: true,
        message: 'Děkujeme za váš zájem. Budeme vás kontaktovat s individuální nabídkou.',
      })
    }

    // Trial: 14 days from now
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    // Create company
    const company = await prisma.company.create({
      data: {
        name: body.data.companyName,
        slug: body.data.companySlug,
        planId: plan.id,
        status: 'trial',
        trialEndsAt,
      },
    })

    // Create admin user
    const passwordHash = await bcrypt.hash(body.data.userPassword, 10)
    const user = await prisma.user.create({
      data: {
        email: body.data.userEmail,
        name: body.data.userName,
        passwordHash,
        role: 'admin',
        companyId: company.id,
      },
    })

    // Create default project
    const project = await prisma.project.create({
      data: { name: body.data.companyName, companyId: company.id },
    })

    // Assign admin to project
    await prisma.projectUser.create({
      data: { projectId: project.id, userId: user.id },
    })

    // Generate first invoice (proforma)
    let variableSymbol = generateVariableSymbol(company.id)
    while (await prisma.invoice.findUnique({ where: { variableSymbol } })) {
      variableSymbol = generateVariableSymbol(company.id)
    }
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 14) // due at end of trial

    await prisma.invoice.create({
      data: {
        companyId: company.id,
        amount: plan.priceMonthly,
        variableSymbol,
        dueDate,
        notes: `Prvni faktura — plan ${plan.name}`,
      },
    })

    // Get plan sections for frontend
    let planSections: string[] = []
    try { planSections = JSON.parse(plan.sections) } catch {}

    // Sign JWT (auto-login)
    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions, companyId: company.id },
      { expiresIn: '8h' }
    )

    return reply.code(201).send({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        permissions: user.permissions, companyId: company.id, companyName: company.name,
      },
      projects: [{ id: project.id, name: project.name, companyName: company.name }],
      companyStatus: 'trial',
      trialEndsAt: trialEndsAt.toISOString(),
      planSections,
      planName: plan.name,
    })
  })
}
