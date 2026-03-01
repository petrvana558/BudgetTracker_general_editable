import { existsSync, writeFileSync, copyFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// ── Determine database location ───────────────────────────────────────────────
//
//  Railway (production):
//    Set DATABASE_URL=file:/data/dev.db  in Railway service Variables.
//    The volume must be mounted at /data in Railway Volume settings.
//    On first deploy start.mjs copies the bundled seed DB to /data/dev.db.
//    On every subsequent restart/redeploy the volume DB is used as-is → data persists.
//
//  Local dev:
//    No DATABASE_URL env var → uses prisma/dev.db as before.
//
// ─────────────────────────────────────────────────────────────────────────────

const externalDbUrl = process.env.DATABASE_URL  // set in Railway Variables

// Derive the absolute file path from DATABASE_URL (handles file:/abs and file:./rel)
function dbFileFromUrl(url) {
  const m = url.match(/^file:(.+)/)
  if (!m) return null
  const p = m[1]
  if (p.startsWith('/')) return p                        // absolute  → /data/dev.db
  return null                                            // relative  → let Prisma handle it
}

let dbFile, dbUrl

if (externalDbUrl) {
  // Production: trust what's in the environment
  dbUrl  = externalDbUrl
  dbFile = dbFileFromUrl(externalDbUrl)
} else {
  // Local dev defaults
  dbFile = 'prisma/dev.db'
  dbUrl  = 'file:./dev.db'
}

// ── Write .env so Prisma always picks up the right DATABASE_URL ───────────────
if (!existsSync('.env') || externalDbUrl) {
  writeFileSync('.env', `DATABASE_URL="${dbUrl}"\nPORT=3003\n`)
  console.log(`✓ DATABASE_URL → ${dbUrl}`)
}

// ── On first deploy: copy bundled seed DB to volume path ─────────────────────
if (dbFile && !existsSync(dbFile)) {
  const seedDb = 'prisma/dev.db'
  if (existsSync(seedDb) && dbFile !== seedDb) {
    console.log(`⚙  First deploy — copying seed DB to ${dbFile} …`)
    copyFileSync(seedDb, dbFile)
    console.log('✓ Seed database copied')
  }
}

// ── Always sync schema (idempotent — adds missing tables, keeps existing data) ─
console.log('⚙  Syncing database schema…')
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--accept-data-loss'], { stdio: 'inherit' })
console.log('✓ Schema up to date')

// ── Seed default admin + default project (idempotent) ────────────────────────
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()
try {
  const hash = await bcrypt.hash('Admin1!local', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@local' },
    update: { passwordHash: hash },
    create: { email: 'admin@local', name: 'Admin', passwordHash: hash, role: 'admin' },
  })
  console.log(`✓ Admin user ready (${admin.email})`)

  // Seed default plans
  const startPlan = await prisma.plan.upsert({
    where: { slug: 'start' },
    update: { maxProjects: 1, maxUsers: 5, isPublic: true },
    create: {
      name: 'Start', slug: 'start',
      sections: JSON.stringify(['assets','labor']),
      maxProjects: 1, maxUsers: 5, priceMonthly: 990,
      description: 'Základní plán pro malé týmy', isDefault: true, isPublic: true,
    },
  })
  const advancedPlan = await prisma.plan.upsert({
    where: { slug: 'advanced' },
    update: { maxProjects: 3, maxUsers: 15, isPublic: true },
    create: {
      name: 'Advanced', slug: 'advanced',
      sections: JSON.stringify(['assets','labor','testing','risks','issues','changes','assumptions']),
      maxProjects: 3, maxUsers: 15, priceMonthly: 2990,
      description: 'Kompletní sada pro projektové řízení', isPublic: true,
    },
  })
  const individualPlan = await prisma.plan.upsert({
    where: { slug: 'individual' },
    update: { isPublic: true },
    create: {
      name: 'Individual', slug: 'individual',
      sections: JSON.stringify([]),
      maxProjects: 0, maxUsers: 0, priceMonthly: 0,
      description: 'Individuální nastavení na míru', isPublic: true,
    },
  })
  console.log(`✓ Plans ready (${startPlan.name}, ${advancedPlan.name}, ${individualPlan.name})`)

  // Seed default company
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: { planId: advancedPlan.id, status: 'active' },
    create: { id: 1, name: 'Hlavní firma', slug: 'hlavni-firma', planId: advancedPlan.id, status: 'active' },
  })
  console.log(`✓ Default company ready (${company.name})`)

  // Assign admin to default company
  await prisma.user.update({ where: { email: 'admin@local' }, data: { companyId: 1 } })

  // Seed default project (company 1)
  const proj = await prisma.project.upsert({
    where: { id: 1 },
    update: { companyId: 1 },
    create: { id: 1, name: 'Hlavní projekt', companyId: 1 },
  })
  console.log(`✓ Default project ready (${proj.name})`)

  // Add admin to default project
  await prisma.projectUser.upsert({
    where: { projectId_userId: { projectId: 1, userId: admin.id } },
    update: {},
    create: { projectId: 1, userId: admin.id },
  })
  console.log('✓ Admin assigned to default project')

  // Seed superadmin (no company — global support account)
  const superHash = await bcrypt.hash('Super1!admin', 10)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@local' },
    update: { passwordHash: superHash },
    create: { email: 'superadmin@local', name: 'Super Admin', passwordHash: superHash, role: 'superadmin' },
  })
  console.log(`✓ Superadmin ready (${superAdmin.email})`)
} finally {
  await prisma.$disconnect()
}

// ── Start server ──────────────────────────────────────────────────────────────
console.log('🚀 Starting Budget Tracker…')
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: dbUrl },
})
server.on('exit', code => process.exit(code ?? 0))

// Forward shutdown signals from Railway/Docker to the child process
process.on('SIGTERM', () => server.kill('SIGTERM'))
process.on('SIGINT',  () => server.kill('SIGINT'))
