import { existsSync, writeFileSync, copyFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'

// Railway sets RAILWAY_VOLUME_MOUNT_PATH automatically when a volume is attached.
// Locally it is undefined → use prisma/dev.db as usual.
const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH   // e.g. "/data"
const dbFile  = volumeMount ? `${volumeMount}/dev.db` : 'prisma/dev.db'
const dbUrl   = volumeMount ? `file:${volumeMount}/dev.db`  : 'file:./dev.db'

// 1. Write .env with the correct DATABASE_URL
//    Always overwrite when running on Railway so the path is never stale.
if (!existsSync('.env') || volumeMount) {
  writeFileSync('.env', `DATABASE_URL="${dbUrl}"\nPORT=3003\n`)
  console.log(`✓ .env ready  (db → ${dbFile})`)
}

// 2. Initialise the database if it does not exist at the target path
if (!existsSync(dbFile)) {
  if (volumeMount && existsSync('prisma/dev.db')) {
    // First deploy with a fresh volume: copy the bundled seed DB
    console.log('⚙  Copying seed database to volume (first deploy)…')
    copyFileSync('prisma/dev.db', dbFile)
    console.log('✓ Seed database ready on volume')
  } else {
    // No seed available → create a clean schema
    console.log('⚙  Initializing database…')
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], { stdio: 'inherit' })
    console.log('✓ Database ready')
  }
}

// 3. Start server
console.log('🚀 Starting Budget Tracker…')
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], { stdio: 'inherit' })
server.on('exit', code => process.exit(code ?? 0))
