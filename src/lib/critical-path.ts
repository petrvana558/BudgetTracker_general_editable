import { prisma } from '../db'

interface TaskNode {
  id: number
  plannedStart: Date | null
  plannedEnd: Date | null
  durationDays: number
  earliestStart: number
  earliestFinish: number
  latestStart: number
  latestFinish: number
  float: number
  isCritical: boolean
  predecessors: { predecessorId: number; type: string; lagDays: number }[]
  successors: { successorId: number; type: string; lagDays: number }[]
}

function diffDays(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

export async function calculateCriticalPath(projectId: number) {
  // Fetch all non-archived tasks with planning dates
  const tasks = await prisma.task.findMany({
    where: { projectId, archived: false, plannedStart: { not: null }, plannedEnd: { not: null } },
    select: { id: true, plannedStart: true, plannedEnd: true },
  })

  if (tasks.length === 0) return { criticalPath: [], totalDuration: 0 }

  // Fetch all dependencies for this project's tasks
  const taskIds = tasks.map(t => t.id)
  const deps = await prisma.taskDependency.findMany({
    where: { predecessorId: { in: taskIds }, successorId: { in: taskIds } },
  })

  // Build node map
  const nodes = new Map<number, TaskNode>()
  for (const t of tasks) {
    nodes.set(t.id, {
      id: t.id,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      durationDays: diffDays(t.plannedStart, t.plannedEnd),
      earliestStart: 0,
      earliestFinish: 0,
      latestStart: Infinity,
      latestFinish: Infinity,
      float: 0,
      isCritical: false,
      predecessors: [],
      successors: [],
    })
  }

  // Populate dependency links
  for (const d of deps) {
    const pred = nodes.get(d.predecessorId)
    const succ = nodes.get(d.successorId)
    if (pred && succ) {
      pred.successors.push({ successorId: d.successorId, type: d.type, lagDays: d.lagDays })
      succ.predecessors.push({ predecessorId: d.predecessorId, type: d.type, lagDays: d.lagDays })
    }
  }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<number, number>()
  for (const [id, node] of nodes) {
    inDegree.set(id, node.predecessors.length)
  }
  const queue: number[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }
  const sorted: number[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    const node = nodes.get(id)!
    for (const s of node.successors) {
      const deg = (inDegree.get(s.successorId) ?? 1) - 1
      inDegree.set(s.successorId, deg)
      if (deg === 0) queue.push(s.successorId)
    }
  }

  // Forward pass: calculate earliest start/finish
  for (const id of sorted) {
    const node = nodes.get(id)!
    if (node.predecessors.length === 0) {
      node.earliestStart = 0
    } else {
      let maxES = 0
      for (const p of node.predecessors) {
        const pred = nodes.get(p.predecessorId)!
        // FS (Finish-to-Start): successor starts after predecessor finishes + lag
        const es = pred.earliestFinish + p.lagDays
        if (es > maxES) maxES = es
      }
      node.earliestStart = maxES
    }
    node.earliestFinish = node.earliestStart + node.durationDays
  }

  // Find project end (max earliest finish)
  let projectEnd = 0
  for (const [, node] of nodes) {
    if (node.earliestFinish > projectEnd) projectEnd = node.earliestFinish
  }

  // Backward pass: calculate latest start/finish
  for (let i = sorted.length - 1; i >= 0; i--) {
    const node = nodes.get(sorted[i])!
    if (node.successors.length === 0) {
      node.latestFinish = projectEnd
    } else {
      let minLF = Infinity
      for (const s of node.successors) {
        const succ = nodes.get(s.successorId)!
        const lf = succ.latestStart - s.lagDays
        if (lf < minLF) minLF = lf
      }
      node.latestFinish = minLF
    }
    node.latestStart = node.latestFinish - node.durationDays
    node.float = node.latestStart - node.earliestStart
    node.isCritical = node.float === 0
  }

  // Update DB with critical path flags
  const criticalIds: number[] = []
  for (const [id, node] of nodes) {
    criticalIds.push(id)
    await prisma.task.update({
      where: { id },
      data: { isCriticalPath: node.isCritical, floatDays: node.float },
    })
  }

  return {
    criticalPath: Array.from(nodes.values()).filter(n => n.isCritical).map(n => n.id),
    totalDuration: projectEnd,
  }
}
