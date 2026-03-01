import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { laborAmount } from './labor'

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard', async (req) => {
    const projectId = (req as any).projectId ?? 1
    const [items, laborCosts, risks, issues, changes, assumptions, tasks] = await Promise.all([
      prisma.budgetItem.findMany({ where: { projectId }, include: { responsible: true, priority: true } }),
      prisma.laborCost.findMany({ where: { projectId } }),
      prisma.risk.findMany({ where: { projectId } }),
      prisma.issue.findMany({ where: { projectId } }),
      prisma.changeRequest.findMany({ where: { projectId } }),
      prisma.assumption.findMany({ where: { projectId } }),
      prisma.task.findMany({ where: { projectId, archived: false } }),
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

    // ── PM KPIs ──────────────────────────────────────────────────
    const totalRisks           = risks.length
    const highSeverityIssues   = issues.filter(i => i.severity === 'Critical' || i.severity === 'High').length
    const pendingChangeRequests = changes.filter(c => c.approvalStatus === 'Draft' || c.approvalStatus === 'Submitted').length
    const budgetImpactSummary  = changes
      .filter(c => c.approvalStatus === 'Approved' || c.approvalStatus === 'Implemented')
      .reduce((s, c) => s + (c.budgetImpact ?? 0), 0)
    const riskExposure = risks
      .filter(r => r.status === 'Open' || r.status === 'Monitoring')
      .reduce((s, r) => s + r.score, 0)

    // ── Assumption KPIs ──────────────────────────────────────────
    const now14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    const activeAssumptions    = assumptions.filter(a => !['Validated', 'Closed', 'Converted to Risk'].includes(a.status))
    const totalAssumptions     = assumptions.length
    const validatedAssumptions = assumptions.filter(a => a.status === 'Validated' || a.status === 'Closed').length
    const validatedPct         = totalAssumptions > 0 ? Math.round(validatedAssumptions / totalAssumptions * 100) : 0
    const expiringSoon         = activeAssumptions.filter(a => a.validationDate && a.validationDate <= now14 && a.validationDate >= new Date()).length
    const overdueAssumptions   = activeAssumptions.filter(a => a.validationDate && a.validationDate < new Date()).length
    const top5Assumptions      = [...assumptions]
      .filter(a => a.status === 'Active' || a.status === 'Under review')
      .sort((a, b) => b.exposureScore - a.exposureScore)
      .slice(0, 5)
      .map(a => ({ id: a.id, code: a.code, title: a.title, exposureScore: a.exposureScore, status: a.status, category: a.category }))

    // ── Project Plan KPIs ─────────────────────────────────────
    const plannedTasks = tasks.filter(t => t.plannedStart && t.plannedEnd)
    const totalEstCostPP = tasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0)
    let ppStart: Date | null = null
    let ppEnd: Date | null = null
    for (const t of plannedTasks) {
      if (!ppStart || t.plannedStart! < ppStart) ppStart = t.plannedStart
      if (!ppEnd || t.plannedEnd! > ppEnd) ppEnd = t.plannedEnd
    }
    const ppDurationDays = ppStart && ppEnd ? Math.round((ppEnd.getTime() - ppStart.getTime()) / 86400000) + 1 : 0
    const ppTotalTasks = tasks.length
    const ppDoneTasks = tasks.filter(t => t.status === 'done').length
    const ppLinkedRiskIds = new Set(tasks.filter(t => t.linkedRiskId).map(t => t.linkedRiskId!))
    const ppLinkedAssumptionIds = new Set(tasks.filter(t => t.linkedAssumptionId).map(t => t.linkedAssumptionId!))

    // Progress: sum(progress * estimatedCost) / sum(estimatedCost) — weighted by cost
    const totalPlannedWork = tasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0)
    const totalActualWork  = tasks.reduce((s, t) => s + ((t.progress ?? 0) / 100) * (t.estimatedCost ?? 0), 0)
    const ppProgressPct = totalPlannedWork > 0
      ? Math.round((totalActualWork / totalPlannedWork) * 100)
      : (ppTotalTasks > 0 ? Math.round(tasks.reduce((s, t) => s + (t.progress ?? 0), 0) / ppTotalTasks) : 0)

    // Overdue tasks: have plannedEnd in the past AND not done
    const ppOverdueTasks = tasks.filter(t => t.plannedEnd && t.plannedEnd < now && t.status !== 'done').length
    // Critical path tasks
    const ppCriticalTasks = tasks.filter(t => t.isCriticalPath).length
    // Unscheduled tasks: no plannedStart or no plannedEnd
    const ppUnscheduledTasks = tasks.filter(t => !t.plannedStart || !t.plannedEnd).length

    // Schedule variance: (actual/planned finish - baseline finish) per done task
    // Positive = behind schedule (took longer), Negative = ahead
    let ppScheduleVarianceDays: number | null = null
    const tasksWithBaseline = tasks.filter(t => t.baselineEnd && t.plannedEnd)
    if (tasksWithBaseline.length > 0) {
      let totalVar = 0
      for (const t of tasksWithBaseline) {
        // actual finish = plannedEnd (or updatedAt if done), baseline = baselineEnd
        const actualFinish = t.status === 'done' ? (t.updatedAt ?? t.plannedEnd!) : t.plannedEnd!
        totalVar += Math.round((actualFinish.getTime() - t.baselineEnd!.getTime()) / 86400000)
      }
      ppScheduleVarianceDays = totalVar
    }

    // Planned completion % — time-based: how far into the schedule are we
    let ppPlannedTimePct: number | null = null
    if (ppStart && ppEnd) {
      const elapsed = now.getTime() - ppStart.getTime()
      const total = ppEnd.getTime() - ppStart.getTime()
      if (total > 0) {
        ppPlannedTimePct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
      }
    }
    // Work-based: how many tasks should be done by today (plannedEnd <= today)
    const ppShouldBeDone = plannedTasks.filter(t => t.plannedEnd! <= now).length
    const ppShouldBeDonePct = ppTotalTasks > 0 ? Math.round((ppShouldBeDone / ppTotalTasks) * 100) : 0

    // On Track / At Risk indicator
    // cpDelayed = any critical path task is overdue
    const ppCPDelayed = tasks.some(t => t.isCriticalPath && t.plannedEnd && t.plannedEnd < now && t.status !== 'done')
    let ppHealthStatus: 'on_track' | 'at_risk' | 'critical' = 'on_track'
    if (ppCPDelayed || (ppScheduleVarianceDays !== null && ppScheduleVarianceDays > 5)) {
      ppHealthStatus = 'critical'
    } else if (ppOverdueTasks > 0 || (ppScheduleVarianceDays !== null && ppScheduleVarianceDays > 0)) {
      ppHealthStatus = 'at_risk'
    }

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
        // PM KPIs
        totalRisks,
        highSeverityIssues,
        pendingChangeRequests,
        budgetImpactSummary,
        riskExposure,
        // Assumption KPIs
        totalAssumptions,
        validatedPct,
        expiringSoon,
        overdueAssumptions,
        // Project Plan KPIs
        ppTotalTasks,
        ppDoneTasks,
        ppProgressPct,
        ppEstCost: totalEstCostPP,
        ppStart: ppStart?.toISOString() ?? null,
        ppEnd: ppEnd?.toISOString() ?? null,
        ppDurationDays,
        ppLinkedRisks: ppLinkedRiskIds.size,
        ppLinkedAssumptions: ppLinkedAssumptionIds.size,
        ppOverdueTasks,
        ppCriticalTasks,
        ppUnscheduledTasks,
        ppScheduleVarianceDays,
        ppPlannedTimePct,
        ppShouldBeDone,
        ppShouldBeDonePct,
        ppHealthStatus,
        ppCPDelayed,
      },
      byCategory,
      byPriority,
      byPerson,
      upcomingDeadlines,
      laborCosts,
      laborByDept,
      top5Assumptions,
    }
  })
}
