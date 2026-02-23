import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

function user(req: { user?: string }) { return req.user || 'System' }
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const STATUSES = ['PASS', 'DEFECT', 'WIP', 'N/A']

// ── Schemas ──────────────────────────────────────────────────────────────────

const TestSetSchema = z.object({
  name: z.string().min(1),
  dateMin: z.string().optional().nullable(),
  dateMax: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const TestCaseSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['PASS', 'DEFECT', 'WIP', 'N/A', 'Not Started']).default('Not Started'),
  notes: z.string().optional().nullable(),
  testedBy: z.string().optional().nullable(),
  testedAt: z.string().optional().nullable(),
  dataUsed: z.string().optional().nullable(),
  order: z.number().int().default(0),
})

const TestStepSchema = z.object({
  description: z.string().min(1),
  order: z.number().int().default(0),
  status: z.enum(['PASS', 'DEFECT', 'WIP', 'N/A', 'Not Started']).default('Not Started'),
  testedBy: z.string().optional().nullable(),
  testedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const DefectSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Medium'),
  status: z.enum(['Open', 'In Progress', 'Fixed', 'Closed', 'Rejected']).default('Open'),
  reportedBy: z.string().optional().nullable(),
})

// ── CSV Import ────────────────────────────────────────────────────────────────
// Expected CSV columns: test_set, test_case, step_order, step_description
// All fields are optional except test_set and test_case.

type CsvRow = {
  testSet: string; testSetDateMin?: string; testSetDateMax?: string; testSetNotes?: string
  testCase: string; testCaseStatus?: string; testCaseNotes?: string; testCaseTestedBy?: string; testCaseTestedAt?: string; testCaseDataUsed?: string
  stepOrder?: number; stepDescription?: string; stepNotes?: string; stepStatus?: string; stepTestedBy?: string; stepTestedAt?: string
}

function parseCSV(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (!lines.length) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, '_'))
  const g = (row: Record<string, string>, ...keys: string[]) => keys.map(k => row[k]).find(v => v) || undefined
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return {
      testSet: g(row, 'test_set', 'testset') ?? '',
      testSetDateMin: g(row, 'test_set_date_min', 'set_date_min'),
      testSetDateMax: g(row, 'test_set_date_max', 'set_date_max'),
      testSetNotes: g(row, 'test_set_notes', 'set_notes'),
      testCase: g(row, 'test_case', 'testcase') ?? '',
      testCaseStatus: g(row, 'test_case_status', 'case_status'),
      testCaseNotes: g(row, 'test_case_notes', 'case_notes'),
      testCaseTestedBy: g(row, 'test_case_tested_by', 'case_tested_by'),
      testCaseTestedAt: g(row, 'test_case_tested_at', 'case_tested_at'),
      testCaseDataUsed: g(row, 'test_case_data_used', 'case_data_used', 'data_used'),
      stepOrder: row['step_order'] ? parseInt(row['step_order']) : undefined,
      stepDescription: g(row, 'step_description', 'stepdescription'),
      stepNotes: g(row, 'step_notes', 'step_expected', 'expected_result'),
      stepStatus: g(row, 'step_status'),
      stepTestedBy: g(row, 'step_tested_by'),
      stepTestedAt: g(row, 'step_tested_at'),
    }
  }).filter(r => r.testSet && r.testCase)
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function testingRoutes(fastify: FastifyInstance) {

  // ── TestSets ────────────────────────────────────────────────────────────────

  fastify.get('/api/testsets', async () => {
    return prisma.testSet.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        testCases: {
          orderBy: { order: 'asc' },
          include: {
            steps: { orderBy: { order: 'asc' } },
            defects: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    })
  })

  fastify.post('/api/testsets', async (req, reply) => {
    const data = TestSetSchema.parse(req.body)
    const ts = await prisma.testSet.create({
      data: {
        name: data.name,
        dateMin: parseDate(data.dateMin),
        dateMax: parseDate(data.dateMax),
        notes: data.notes ?? null,
      },
    })
    reply.code(201)
    return ts
  })

  fastify.put('/api/testsets/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    const data = TestSetSchema.partial().parse(req.body)
    const ts = await prisma.testSet.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.dateMin !== undefined && { dateMin: parseDate(data.dateMin) }),
        ...(data.dateMax !== undefined && { dateMax: parseDate(data.dateMax) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })
    return ts
  })

  fastify.delete('/api/testsets/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    await prisma.testSet.delete({ where: { id } })
    reply.code(204).send()
  })

  // ── TestCases ───────────────────────────────────────────────────────────────

  fastify.post('/api/testsets/:setId/testcases', async (req: FastifyRequest<{ Params: { setId: string } }>, reply) => {
    const setId = parseInt(req.params.setId)
    const data = TestCaseSchema.parse(req.body)
    const tc = await prisma.testCase.create({
      data: {
        testSetId: setId,
        name: data.name,
        status: data.status,
        notes: data.notes ?? null,
        testedBy: data.testedBy ?? null,
        testedAt: parseDate(data.testedAt),
        dataUsed: data.dataUsed ?? null,
        order: data.order,
      },
      include: { steps: true, defects: true },
    })
    reply.code(201)
    return tc
  })

  fastify.put('/api/testcases/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    const data = TestCaseSchema.partial().parse(req.body)
    return prisma.testCase.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.testedBy !== undefined && { testedBy: data.testedBy }),
        ...(data.testedAt !== undefined && { testedAt: parseDate(data.testedAt) }),
        ...(data.dataUsed !== undefined && { dataUsed: data.dataUsed }),
        ...(data.order !== undefined && { order: data.order }),
      },
      include: { steps: true, defects: true },
    })
  })

  fastify.delete('/api/testcases/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    await prisma.testCase.delete({ where: { id } })
    reply.code(204).send()
  })

  // ── TestSteps ───────────────────────────────────────────────────────────────

  fastify.post('/api/testcases/:caseId/steps', async (req: FastifyRequest<{ Params: { caseId: string } }>, reply) => {
    const caseId = parseInt(req.params.caseId)
    const data = TestStepSchema.parse(req.body)
    const step = await prisma.testStep.create({
      data: {
        testCaseId: caseId,
        description: data.description,
        order: data.order,
        status: data.status,
        testedBy: data.testedBy ?? null,
        testedAt: parseDate(data.testedAt),
        notes: data.notes ?? null,
      },
    })
    reply.code(201)
    return step
  })

  fastify.put('/api/teststeps/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    const data = TestStepSchema.partial().parse(req.body)
    return prisma.testStep.update({
      where: { id },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.testedBy !== undefined && { testedBy: data.testedBy }),
        ...(data.testedAt !== undefined && { testedAt: parseDate(data.testedAt) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })
  })

  fastify.delete('/api/teststeps/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    await prisma.testStep.delete({ where: { id } })
    reply.code(204).send()
  })

  // ── Defects ─────────────────────────────────────────────────────────────────

  fastify.post('/api/testcases/:caseId/defects', async (req: FastifyRequest<{ Params: { caseId: string } }>, reply) => {
    const caseId = parseInt(req.params.caseId)
    const data = DefectSchema.parse(req.body)
    const defect = await prisma.defect.create({
      data: {
        testCaseId: caseId,
        title: data.title,
        description: data.description ?? null,
        severity: data.severity,
        status: data.status,
        reportedBy: data.reportedBy ?? null,
      },
    })
    reply.code(201)
    return defect
  })

  fastify.put('/api/defects/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    const data = DefectSchema.partial().parse(req.body)
    return prisma.defect.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.severity !== undefined && { severity: data.severity }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.reportedBy !== undefined && { reportedBy: data.reportedBy }),
      },
    })
  })

  fastify.delete('/api/defects/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(req.params.id)
    await prisma.defect.delete({ where: { id } })
    reply.code(204).send()
  })

  // ── CSV Import ───────────────────────────────────────────────────────────────
  // POST /api/testsets/import
  // Body: { testSetId?: number, testSetName?: string, csv: string }
  // If testSetId provided - append to existing set; else create new set by testSetName or first value in CSV
  fastify.post('/api/testsets/import', async (req, reply) => {
    const body = req.body as { testSetId?: number; testSetName?: string; csv: string }
    const rows = parseCSV(body.csv)
    if (!rows.length) return reply.code(400).send({ error: 'Prázdné nebo neplatné CSV' })

    // Group by testSet name, then testCase name
    const sets: Map<string, Map<string, typeof rows>> = new Map()
    for (const row of rows) {
      if (!sets.has(row.testSet)) sets.set(row.testSet, new Map())
      const cases = sets.get(row.testSet)!
      if (!cases.has(row.testCase)) cases.set(row.testCase, [])
      cases.get(row.testCase)!.push(row)
    }

    const created: any[] = []

    for (const [setName, casesMap] of sets) {
      let ts: any

      if (body.testSetId) {
        ts = await prisma.testSet.findUnique({ where: { id: body.testSetId } })
        if (!ts) return reply.code(404).send({ error: 'TestSet nenalezen' })
      } else {
        // Use first row's testSet metadata for the set
        const firstRows = [...casesMap.values()][0]
        const meta = firstRows?.[0]
        ts = await prisma.testSet.create({
          data: {
            name: body.testSetName || setName,
            dateMin: parseDate(meta?.testSetDateMin),
            dateMax: parseDate(meta?.testSetDateMax),
            notes: meta?.testSetNotes ?? null,
          },
        })
      }

      let caseOrder = 0
      for (const [caseName, stepRows] of casesMap) {
        const meta = stepRows[0]
        const tc = await prisma.testCase.create({
          data: {
            testSetId: ts.id,
            name: caseName,
            order: caseOrder++,
            status: meta?.testCaseStatus ?? 'Not Started',
            notes: meta?.testCaseNotes ?? null,
            testedBy: meta?.testCaseTestedBy ?? null,
            testedAt: parseDate(meta?.testCaseTestedAt),
            dataUsed: meta?.testCaseDataUsed ?? null,
          },
        })

        let stepOrder = 0
        for (const r of stepRows) {
          if (r.stepDescription) {
            await prisma.testStep.create({
              data: {
                testCaseId: tc.id,
                description: r.stepDescription,
                order: r.stepOrder ?? stepOrder,
                notes: r.stepNotes ?? null,
                status: r.stepStatus ?? 'Not Started',
                testedBy: r.stepTestedBy ?? null,
                testedAt: parseDate(r.stepTestedAt),
              },
            })
            stepOrder++
          }
        }
      }
      created.push(ts)
    }

    reply.code(201)
    return { imported: created.length, sets: created }
  })

  // ── Defects list ────────────────────────────────────────────────────────────

  fastify.get('/api/testing/defects', async () => {
    const severityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
    const defects = await prisma.defect.findMany({
      include: { testCase: { include: { testSet: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return defects
      .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))
      .slice(0, 15)
      .map(d => ({
        id: d.id,
        title: d.title,
        description: d.description,
        severity: d.severity,
        status: d.status,
        reportedBy: d.reportedBy,
        testCase: d.testCase.name,
        testSet: d.testCase.testSet.name,
        createdAt: d.createdAt,
      }))
  })

  // ── Statistics ───────────────────────────────────────────────────────────────

  fastify.get('/api/testing/stats', async () => {
    const cases = await prisma.testCase.findMany({ select: { status: true } })
    const steps = await prisma.testStep.findMany({ select: { status: true } })
    const defects = await prisma.defect.findMany({ select: { status: true, severity: true } })

    const countBy = (arr: { status: string }[]) => {
      const c: Record<string, number> = { PASS: 0, DEFECT: 0, WIP: 0, 'N/A': 0 }
      arr.forEach(x => { c[x.status] = (c[x.status] ?? 0) + 1 })
      return c
    }

    return {
      cases: countBy(cases),
      steps: countBy(steps),
      defects: {
        total: defects.length,
        open: defects.filter(d => d.status === 'Open').length,
        inProgress: defects.filter(d => d.status === 'In Progress').length,
        fixed: defects.filter(d => d.status === 'Fixed').length,
        closed: defects.filter(d => d.status === 'Closed').length,
        bySeverity: {
          Critical: defects.filter(d => d.severity === 'Critical').length,
          High: defects.filter(d => d.severity === 'High').length,
          Medium: defects.filter(d => d.severity === 'Medium').length,
          Low: defects.filter(d => d.severity === 'Low').length,
        },
      },
    }
  })
}
