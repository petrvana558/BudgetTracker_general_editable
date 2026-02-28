import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

function user(req: any) {
  return req.authUser?.name || 'System'
}

export async function commentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/items/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const projectId = (req as any).projectId ?? 1
    const item = await prisma.budgetItem.findFirst({ where: { id: parseInt(id), projectId } })
    if (!item) return reply.status(404).send({ error: 'Not found' })
    return prisma.comment.findMany({
      where: { itemId: parseInt(id), projectId },
      orderBy: { createdAt: 'asc' },
    })
  })

  fastify.post('/api/items/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const projectId = (req as any).projectId!
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body)
    const item = await prisma.budgetItem.findFirst({ where: { id: parseInt(id), projectId } })
    if (!item) return reply.status(404).send({ error: 'Not found' })
    const comment = await prisma.comment.create({
      data: { itemId: parseInt(id), author: user(req), text, projectId },
    })
    await logAudit({
      user: user(req),
      entity: 'Item',
      action: 'COMMENT',
      entityId: parseInt(id),
      summary: `Komentář · "${item.description}": ${text}`,
      projectId,
    })
    return reply.status(201).send(comment)
  })

  fastify.delete('/api/comments/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const projectId = (req as any).projectId ?? 1
    const comment = await prisma.comment.findFirst({ where: { id: parseInt(id), projectId } })
    if (!comment) return reply.status(404).send({ error: 'Not found' })
    const item = await prisma.budgetItem.findFirst({ where: { id: comment.itemId, projectId } })
    await prisma.comment.delete({ where: { id: parseInt(id), projectId } })
    await logAudit({
      user: user(req),
      entity: 'Item',
      action: 'COMMENT_DELETE',
      entityId: comment.itemId,
      summary: `Smazán komentář · "${item?.description ?? 'ID ' + comment.itemId}": ${comment.text}`,
      projectId,
    })
    return reply.status(204).send()
  })
}
