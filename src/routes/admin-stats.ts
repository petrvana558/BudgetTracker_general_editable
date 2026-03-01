import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { requireRole } from '../lib/rbac'

export async function adminStatsRoutes(fastify: FastifyInstance) {
  // GET /api/admin/stats — superadmin only
  fastify.get('/api/admin/stats', { preHandler: requireRole('superadmin') }, async () => {
    const [totalCompanies, activeCompanies, trialCompanies, expiredCompanies, totalUsers, totalProjects] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { status: 'active' } }),
      prisma.company.count({ where: { status: 'trial' } }),
      prisma.company.count({ where: { status: 'expired' } }),
      prisma.user.count(),
      prisma.project.count(),
    ])

    const recentRegistrations = await prisma.company.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, status: true, createdAt: true,
        plan: { select: { name: true } },
        _count: { select: { users: true, projects: true } },
      },
    })

    const pendingInvoices = await prisma.invoice.findMany({
      where: { status: 'pending' },
      include: { company: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    })

    // Monthly revenue: sum of paid invoices this month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const paidThisMonth = await prisma.invoice.findMany({
      where: { status: 'paid', paidAt: { gte: monthStart } },
    })
    const monthlyRevenue = paidThisMonth.reduce((sum, inv) => sum + inv.amount, 0)

    return {
      totalCompanies,
      activeCompanies,
      trialCompanies,
      expiredCompanies,
      totalUsers,
      totalProjects,
      monthlyRevenue,
      recentRegistrations,
      pendingInvoices,
    }
  })
}
