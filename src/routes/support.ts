import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendSupportEmail } from '../lib/email'

const SupportBody = z.object({
  subject:     z.string().min(1).max(200),
  message:     z.string().min(1).max(5000),
  projectName: z.string().min(1).max(200),
})

export async function supportRoutes(fastify: FastifyInstance) {
  // POST /api/support — authenticated users can send support requests
  fastify.post('/api/support', async (req, reply) => {
    const user = req.authUser
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    const parsed = SupportBody.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid input' })

    const { subject, message, projectName } = parsed.data

    await sendSupportEmail(user.email, projectName, subject, message)

    return { ok: true }
  })
}
