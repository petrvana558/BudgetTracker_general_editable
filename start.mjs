import { existsSync, writeFileSync, copyFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'

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
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { stdio: 'inherit' })
console.log('✓ Schema up to date')

// ── Start server ──────────────────────────────────────────────────────────────
console.log('🚀 Starting Budget Tracker…')
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], { stdio: 'inherit' })
server.on('exit', code => process.exit(code ?? 0))

// Forward shutdown signals from Railway/Docker to the child process
process.on('SIGTERM', () => server.kill('SIGTERM'))
process.on('SIGINT',  () => server.kill('SIGINT'))
