import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const CategorySchema = z.object({
  name: z.string().min(1),
  subcategories: z.array(z.string()).default([]),
})

function user(req: { headers: Record<string, unknown> }) {
  return (req.headers['x-user'] as string) || 'System'
}

export async function categoryRoutes(fastify: FastifyInstance) {
  fastify.get('/api/categories', async () => {
    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    return cats.map(c => ({ ...c, subcategories: JSON.parse(c.subcategories) as string[] }))
  })

  fastify.post('/api/categories', async (req, reply) => {
    const data = CategorySchema.parse(req.body)
    const cat = await prisma.category.create({
      data: { name: data.name, subcategories: JSON.stringify(data.subcategories) },
    })
    await logAudit({
      user: user(req), entity: 'Kategorie', action: 'CREATE', entityId: cat.id,
      summary: `Přidána kategorie: "${cat.name}"`,
    })
    return reply.status(201).send({ ...cat, subcategories: JSON.parse(cat.subcategories) })
  })

  fastify.put('/api/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = CategorySchema.partial().parse(req.body)
    const cat = await prisma.category.update({
      where: { id: parseInt(id) },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.subcategories !== undefined && { subcategories: JSON.stringify(data.subcategories) }),
      },
    })
    await logAudit({
      user: user(req), entity: 'Kategorie', action: 'UPDATE', entityId: cat.id,
      summary: `Upravena kategorie: "${cat.name}"`,
    })
    return { ...cat, subcategories: JSON.parse(cat.subcategories) }
  })

  fastify.delete('/api/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const cat = await prisma.category.findUnique({ where: { id: parseInt(id) } })
    await prisma.category.delete({ where: { id: parseInt(id) } })
    await logAudit({
      user: user(req), entity: 'Kategorie', action: 'DELETE', entityId: parseInt(id),
      summary: `Smazána kategorie: "${cat?.name ?? 'ID ' + id}"`,
    })
    return reply.status(204).send()
  })
}
