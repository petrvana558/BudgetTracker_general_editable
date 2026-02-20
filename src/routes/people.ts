import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logAudit } from './audit'

const PersonSchema = z.object({
  name:       z.string().min(1),
  email:      z.string().email().optional().nullable(),
  department: z.string().optional().nullable(),
})

function user(req: { user?: string }) {
  return req.user || 'System'
}

export async function peopleRoutes(fastify: FastifyInstance) {
  fastify.get('/api/people', async () => {
    return prisma.person.findMany({ orderBy: { name: 'asc' } })
  })

  fastify.post('/api/people', async (req, reply) => {
    const data = PersonSchema.parse(req.body)
    const person = await prisma.person.create({ data })
    await logAudit({
      user: user(req), entity: 'Osoba', action: 'CREATE', entityId: person.id,
      summary: `Přidána osoba: "${person.name}"${person.department ? ' · ' + person.department : ''}`,
    })
    return reply.status(201).send(person)
  })

  fastify.put('/api/people/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = PersonSchema.partial().parse(req.body)
    const person = await prisma.person.update({ where: { id: parseInt(id) }, data })
    await logAudit({
      user: user(req), entity: 'Osoba', action: 'UPDATE', entityId: person.id,
      summary: `Upravena osoba: "${person.name}"`,
    })
    return person
  })

  fastify.delete('/api/people/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const person = await prisma.person.findUnique({ where: { id: parseInt(id) } })
    await prisma.budgetItem.updateMany({ where: { responsibleId: parseInt(id) }, data: { responsibleId: null } })
    await prisma.person.delete({ where: { id: parseInt(id) } })
    await logAudit({
      user: user(req), entity: 'Osoba', action: 'DELETE', entityId: parseInt(id),
      summary: `Smazána osoba: "${person?.name ?? 'ID ' + id}"`,
    })
    return reply.status(204).send()
  })
}
