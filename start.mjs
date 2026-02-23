import { existsSync, writeFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'

// 1. Auto-create .env if missing
if (!existsSync('.env')) {
  writeFileSync('.env', 'DATABASE_URL="file:./dev.db"\nPORT=3003\n')
  console.log('✓ .env created with defaults')
}

// 2. Auto-init DB if prisma/dev.db doesn't exist
if (!existsSync('prisma/dev.db')) {
  console.log('⚙  Initializing database (first run)...')
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], { stdio: 'inherit' })
  console.log('✓ Database ready')
}

// 3. Start server
console.log('🚀 Starting Budget Tracker...')
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], { stdio: 'inherit' })
server.on('exit', code => process.exit(code ?? 0))
