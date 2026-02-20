import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { laborAmount } from './labor'

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard', async () => {
    const [items, laborCosts] = await Promise.all([
      prisma.budgetItem.findMany({ include: { responsible: true, priority: true } }),
      prisma.laborCost.findMany(),
    ])

    // ── Financials ──────────────────────────────────────────────
    const totalEstimated = items.reduce((s, i) => s + (i.totalEstCost ?? 0), 0)
    const totalActual    = items.reduce((s, i) => s + (i.actualPrice ?? 0), 0)
    const totalCapex     = items.filter(i => i.capexNeeded).reduce((s, i) => s + (i.totalEstCost ?? 0), 0)

    const totalLabor      = laborCosts.reduce((s, lc) => s + laborAmount(lc), 0)
    const totalLaborSpent = laborCosts.reduce((s, lc) => s + (lc.spent ?? 0), 0)
    const grandTotal = totalEstimated + totalLabor

    // ── Status breakdown ─────────────────────────────────────────
    const byStatus: Record<string, number> = {}
    for (const item of items) {
      const s = item.tenderStatus || 'Unset'
      byStatus[s] = (byStatus[s] || 0) + 1
    }

    // ── By category ──────────────────────────────────────────────
    const byCategoryMap: Record<string, { estimated: number; actual: number; count: number }> = {}
    for (const item of items) {
      const cat = item.category || 'Uncategorized'
      if (!byCategoryMap[cat]) byCategoryMap[cat] = { estimated: 0, actual: 0, count: 0 }
      byCategoryMap[cat].estimated += item.totalEstCost ?? 0
      byCategoryMap[cat].actual    += item.actualPrice ?? 0
      byCategoryMap[cat].count++
    }
    const byCategory = Object.entries(byCategoryMap)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.estimated - a.estimated)

    // ── By priority ──────────────────────────────────────────────
    const byPriorityMap: Record<string, { name: string; color: string; count: number; estimated: number }> = {}
    for (const item of items) {
      const key = item.priority ? String(item.priority.id) : 'none'
      if (!byPriorityMap[key]) {
        byPriorityMap[key] = {
          name:      item.priority?.name  ?? 'Unset',
          color:     item.priority?.color ?? '#cccccc',
          count:     0,
          estimated: 0,
        }
      }
      byPriorityMap[key].count++
      byPriorityMap[key].estimated += item.totalEstCost ?? 0
    }
    const byPriority = Object.values(byPriorityMap)

    // ── By person ────────────────────────────────────────────────
    const byPersonMap: Record<string, { name: string; count: number; estimated: number }> = {}
    for (const item of items) {
      const key = item.responsible ? String(item.responsible.id) : 'none'
      if (!byPersonMap[key]) {
        byPersonMap[key] = { name: item.responsible?.name ?? 'Unassigned', count: 0, estimated: 0 }
      }
      byPersonMap[key].count++
      byPersonMap[key].estimated += item.totalEstCost ?? 0
    }
    const byPerson = Object.values(byPersonMap).sort((a, b) => b.count - a.count)

    // ── Upcoming deadlines (next 90 days) ────────────────────────
    const now    = new Date()
    const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const upcomingDeadlines = items
      .filter(i => i.tenderDeadline && i.tenderDeadline >= now && i.tenderDeadline <= future)
      .sort((a, b) => a.tenderDeadline!.getTime() - b.tenderDeadline!.getTime())
      .slice(0, 10)
      .map(i => ({
        id:           i.id,
        description:  i.description,
        category:     i.category,
        tenderStatus: i.tenderStatus,
        tenderDeadline: i.tenderDeadline,
        deliveryDate: i.deliveryDate,
        responsible:  i.responsible?.name,
        priority:     i.priority,
        totalEstCost: i.totalEstCost,
      }))

    // ── Approval breakdown ───────────────────────────────────────
    const byApproval: Record<string, number> = {}
    for (const item of items) {
      const a = item.approval || 'Pending'
      byApproval[a] = (byApproval[a] || 0) + 1
    }

    // ── Labor by department ──────────────────────────────────────
    const byDeptMap: Record<string, number> = {}
    for (const lc of laborCosts) {
      const dept = lc.department || 'Ostatní'
      byDeptMap[dept] = (byDeptMap[dept] || 0) + laborAmount(lc)
    }
    const laborByDept = Object.entries(byDeptMap).map(([dept, total]) => ({ dept, total }))

    return {
      summary: {
        // Budget = sum of item estimates (auto-computed)
        totalBudget:    totalEstimated,
        totalEstimated,
        totalActual,
        totalCapex,
        totalLabor,
        totalLaborSpent,
        grandTotal,
        totalItems:     items.length,
        remaining:      totalEstimated - totalActual,
        spentPct:       totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : null,
        byStatus,
        byApproval,
      },
      byCategory,
      byPriority,
      byPerson,
      upcomingDeadlines,
      laborCosts,
      laborByDept,
    }
  })
}
