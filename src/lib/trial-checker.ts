import { PrismaClient } from '@prisma/client'
import { sendTrialExpiringEmail } from './email'

const prisma = new PrismaClient()

export function startTrialChecker() {
  const CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

  async function check() {
    const now = new Date()

    // 1. Expire companies whose trial has ended
    const expired = await prisma.company.updateMany({
      where: {
        status: 'trial',
        trialEndsAt: { lt: now },
      },
      data: { status: 'expired' },
    })
    if (expired.count > 0) {
      console.log(`⏰ Trial checker: ${expired.count} companies expired`)
    }

    // 2. Send reminder to companies with 3 days left
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const expiringSoon = await prisma.company.findMany({
      where: {
        status: 'trial',
        trialEndsAt: {
          gte: new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000),
        },
      },
      include: { users: { where: { role: 'admin', active: true }, select: { email: true } } },
    })

    for (const company of expiringSoon) {
      const daysLeft = Math.ceil((company.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      for (const user of company.users) {
        await sendTrialExpiringEmail(user.email, company.name, daysLeft)
      }
    }
    if (expiringSoon.length > 0) {
      console.log(`⏰ Trial checker: sent reminders to ${expiringSoon.length} companies`)
    }
  }

  // Run first check after 10 seconds, then every 24 hours
  setTimeout(() => {
    check().catch(console.error)
    setInterval(() => check().catch(console.error), CHECK_INTERVAL)
  }, 10_000)

  console.log('✓ Trial checker started (runs every 24h)')
}
