import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { id: number; email: string; name: string; role: string; permissions: string; companyId: number | null }
    projectId?: number
  }
}

// Maps URL prefix → section key
function urlToSection(url: string): string | null {
  if (url.startsWith('/api/items') || url.startsWith('/api/comments')) return 'assets'
  if (url.startsWith('/api/labor') || url.startsWith('/api/labor-spent') || url.startsWith('/api/labor-entries')) return 'labor'
  if (url.startsWith('/api/testsets') || url.startsWith('/api/testcases') || url.startsWith('/api/teststeps') || url.startsWith('/api/defects')) return 'testing'
  if (url.startsWith('/api/risks')) return 'risks'
  if (url.startsWith('/api/issues')) return 'issues'
  if (url.startsWith('/api/changes')) return 'changes'
  if (url.startsWith('/api/assumptions')) return 'assumptions'
  return null
}

const ADMIN_ONLY_PREFIXES = ['/api/settings', '/api/people', '/api/categories', '/api/priorities']

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'bt-local-dev-secret',
  })

  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/api/')) return
    if (req.url.startsWith('/api/auth/login')) return

    // 1. Verify JWT
    try {
      await req.jwtVerify()
      req.authUser = req.user as any
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const { role } = req.authUser!
    const method = req.method.toUpperCase()
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

    // 2. Inject + validate projectId from X-Project-Id header
    if (!req.url.startsWith('/api/auth') && !req.url.startsWith('/api/projects') && !req.url.startsWith('/api/companies')) {
      const rawPid = req.headers['x-project-id']
      if (rawPid) {
        const pid = parseInt(rawPid as string)
        if (!isNaN(pid)) {
          if (role === 'superadmin') {
            req.projectId = pid  // superadmin: bypass all checks
          } else if (role === 'admin') {
            // Company admin: project must belong to their company
            const project = await prisma.project.findUnique({ where: { id: pid }, select: { companyId: true } })
            if (!project || project.companyId !== req.authUser!.companyId)
              return reply.code(403).send({ error: 'Project not in your company' })
            req.projectId = pid
          } else {
            // User: company check + ProjectUser membership
            const project = await prisma.project.findUnique({ where: { id: pid }, select: { companyId: true } })
            if (!project || project.companyId !== req.authUser!.companyId)
              return reply.code(403).send({ error: 'Project not in your company' })
            const member = await prisma.projectUser.findUnique({
              where: { projectId_userId: { projectId: pid, userId: req.authUser!.id } }
            })
            if (!member) return reply.code(403).send({ error: 'No access to this project' })
            req.projectId = pid
          }
        }
      }
    }

    // 3. Superadmin and admin bypass section permission checks
    if (role === 'superadmin' || role === 'admin') return

    // 4. Admin-only sections
    if (ADMIN_ONLY_PREFIXES.some(p => req.url.startsWith(p))) {
      return reply.code(403).send({ error: 'Forbidden — admin only' })
    }

    // 5. Audit: GET allowed, mutations admin only
    if (req.url.startsWith('/api/audit')) {
      if (isMutation) return reply.code(403).send({ error: 'Forbidden — admin only' })
      return
    }

    // 6. Dashboard — always allowed
    if (req.url.startsWith('/api/dashboard')) return

    // 7. Projects / Companies — authenticated users can list their own
    if (req.url.startsWith('/api/projects') || req.url.startsWith('/api/companies')) return

    // 8. Granular section permissions
    const section = urlToSection(req.url)
    if (!section) return

    let perms: Record<string, string> = {}
    try { perms = JSON.parse(req.authUser!.permissions || '{}') } catch {}

    const level = perms[section] ?? 'none'

    if (level === 'none') {
      return reply.code(403).send({ error: `No access to ${section}` })
    }
    if (isMutation && level !== 'write') {
      return reply.code(403).send({ error: `Read-only access to ${section}` })
    }
  })
})
