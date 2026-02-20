import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/settings', async () => {
    const rows = await prisma.settings.findMany()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })

  fastify.put('/api/settings/:key', async (req, reply) => {
    const { key } = req.params as { key: string }
    const { value } = z.object({ value: z.string() }).parse(req.body)
    const setting = await prisma.settings.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
    return setting
  })
}
