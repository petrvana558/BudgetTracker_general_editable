import { FastifyRequest, FastifyReply } from 'fastify'

export function requireRole(minRole: 'admin' | 'superadmin') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = req.authUser?.role
    if (minRole === 'superadmin' && role !== 'superadmin') {
      return reply.code(403).send({ error: 'Forbidden — superadmin required' })
    }
    if (minRole === 'admin' && role !== 'admin' && role !== 'superadmin') {
      return reply.code(403).send({ error: 'Forbidden — admin required' })
    }
  }
}
