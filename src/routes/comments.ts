import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

function user(req: { headers: Record<string, unknown> }) {
  return (req.headers['x-user'] as string) || 'System'
}

export async function commentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/items/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.budgetItem.findUnique({ where: { id: parseInt(id) } })
    if (!item) return reply.status(404).send({ error: 'Not found' })
    return prisma.comment.findMany({
      where: { itemId: parseInt(id) },
      orderBy: { createdAt: 'asc' },
    })
  })

  fastify.post('/api/items/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body)
    const item = await prisma.budgetItem.findUnique({ where: { id: parseInt(id) } })
    if (!item) return reply.status(404).send({ error: 'Not found' })
    const comment = await prisma.comment.create({
      data: { itemId: parseInt(id), author: user(req), text },
    })
    await logAudit({
      user: user(req),
      entity: 'Item',
      action: 'COMMENT',
      entityId: parseInt(id),
      summary: `Komentář · "${item.description}": ${text}`,
    })
    return reply.status(201).send(comment)
  })

  fastify.delete('/api/comments/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const comment = await prisma.comment.findUnique({ where: { id: parseInt(id) } })
    if (!comment) return reply.status(404).send({ error: 'Not found' })
    const item = await prisma.budgetItem.findUnique({ where: { id: comment.itemId } })
    await prisma.comment.delete({ where: { id: parseInt(id) } })
    await logAudit({
      user: user(req),
      entity: 'Item',
      action: 'COMMENT_DELETE',
      entityId: comment.itemId,
      summary: `Smazán komentář · "${item?.description ?? 'ID ' + comment.itemId}": ${comment.text}`,
    })
    return reply.status(204).send()
  })
}
