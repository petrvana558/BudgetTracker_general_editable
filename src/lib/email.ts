// Email service — uses Resend when API key is set (env or DB), otherwise logs to console
import { PrismaClient } from '@prisma/client'

let resend: any = null
let lastApiKey: string | null = null

async function getApiKeyFromDb(): Promise<string | null> {
  try {
    const prisma = new PrismaClient()
    const row = await prisma.settings.findFirst({ where: { key: 'resend_api_key', NOT: { value: '' } } })
    await prisma.$disconnect()
    return row?.value ?? null
  } catch {
    return null
  }
}

async function getFromFromDb(): Promise<string | null> {
  try {
    const prisma = new PrismaClient()
    const row = await prisma.settings.findFirst({ where: { key: 'email_from', NOT: { value: '' } } })
    await prisma.$disconnect()
    return row?.value ?? null
  } catch {
    return null
  }
}

async function getResend() {
  // Check env first, then DB
  const apiKey = process.env.RESEND_API_KEY || await getApiKeyFromDb()
  if (!apiKey) return null
  // Recreate client if key changed
  if (resend && lastApiKey === apiKey) return resend
  try {
    const { Resend } = await import('resend')
    resend = new Resend(apiKey)
    lastApiKey = apiKey
    return resend
  } catch {
    return null
  }
}

async function getFrom(): Promise<string> {
  return process.env.EMAIL_FROM || await getFromFromDb() || 'PM Tool <noreply@pmtool.cz>'
}

async function sendEmail(to: string, subject: string, html: string) {
  const client = await getResend()
  const from = await getFrom()
  if (client) {
    try {
      await client.emails.send({ from, to, subject, html })
      console.log(`✉ Email sent to ${to}: ${subject}`)
    } catch (err) {
      console.error(`✉ Email failed to ${to}:`, err)
    }
  } else {
    console.log(`✉ [DEV] Email to ${to}: ${subject}`)
  }
}

export async function sendWelcomeEmail(to: string, companyName: string, trialDays: number) {
  await sendEmail(to, `Vitejte v PM Tool — ${companyName}`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>Vitejte v PM Tool!</h2>
      <p>Vase firma <strong>${companyName}</strong> byla uspesne zaregistrovana.</p>
      <p>Mate <strong>${trialDays} dni</strong> zkusebni doby zdarma.</p>
      <p>Platebni udaje obdrzite v samostatnem emailu.</p>
      <p style="color:#888;font-size:13px">— Tym PM Tool</p>
    </div>
  `)
}

export async function sendInvoiceEmail(to: string, companyName: string, amount: number, variableSymbol: string, dueDate: string) {
  await sendEmail(to, `Faktura — PM Tool`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>Faktura pro ${companyName}</h2>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Castka</strong></td><td style="padding:8px;border:1px solid #ddd">${amount} Kc</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Variabilni symbol</strong></td><td style="padding:8px;border:1px solid #ddd;font-weight:700;font-size:18px">${variableSymbol}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Splatnost</strong></td><td style="padding:8px;border:1px solid #ddd">${dueDate}</td></tr>
      </table>
      <p>Po prijeti platby Vam bude pristup automaticky aktivovan.</p>
      <p style="color:#888;font-size:13px">— Tym PM Tool</p>
    </div>
  `)
}

export async function sendPaymentConfirmedEmail(to: string, companyName: string) {
  await sendEmail(to, `Platba prijata — PM Tool`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>Platba prijata!</h2>
      <p>Dekujeme. Firma <strong>${companyName}</strong> ma nyni plny pristup k PM Tool.</p>
      <p>Zkusebni obdobi bylo zruseno — Vas ucet je aktivni.</p>
      <p style="color:#888;font-size:13px">— Tym PM Tool</p>
    </div>
  `)
}

export async function sendSupportEmail(userEmail: string, projectName: string, subject: string, message: string) {
  const supportTo = process.env.SUPPORT_EMAIL || 'petrvana@email.cz'
  const fullSubject = `PM Tool - Projekt - ${projectName} - ${subject}`
  await sendEmail(supportTo, fullSubject, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>${subject}</h2>
      <p style="white-space:pre-wrap;line-height:1.6">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#888;font-size:13px"><strong>Projekt:</strong> ${projectName}</p>
      <p style="color:#888;font-size:13px"><strong>Odesílatel:</strong> <a href="mailto:${userEmail}">${userEmail}</a></p>
    </div>
  `)
}

export async function sendTrialExpiringEmail(to: string, companyName: string, daysLeft: number) {
  await sendEmail(to, `Zkusebni doba vyprsi za ${daysLeft} dni — PM Tool`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>Zkusebni doba vyprsi za ${daysLeft} dni</h2>
      <p>Firma <strong>${companyName}</strong> — pro zachovani pristupu prosim uhradte fakturu.</p>
      <p>Platebni udaje naleznete ve svem uctu v sekci Nastaveni.</p>
      <p style="color:#888;font-size:13px">— Tym PM Tool</p>
    </div>
  `)
}

// ── Work Board notifications ──────────────────────────────────────────

export async function sendWorkItemAssignedEmail(to: string, opts: {
  itemTitle: string; itemType: string; assignedBy: string; projectName: string; appUrl?: string
}) {
  const url = opts.appUrl || process.env.APP_URL || 'https://pmtool.cz'
  await sendEmail(to, `Byl vam prirazen ukol: ${opts.itemTitle}`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#1E40AF">Novy ukol pro vas</h2>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666;width:120px">Ukol</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">${opts.itemTitle}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666">Typ</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${opts.itemType}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666">Prirazeno</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${opts.assignedBy}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666">Projekt</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${opts.projectName}</td></tr>
      </table>
      <p><a href="${url}" style="display:inline-block;padding:10px 24px;background:#3B82F6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Otevrit v PM Tool</a></p>
      <p style="color:#888;font-size:13px">— PM Tool</p>
    </div>
  `)
}

export async function sendWorkItemStepEmail(to: string, opts: {
  itemTitle: string; stepName: string; movedBy: string; projectName: string; appUrl?: string
}) {
  const url = opts.appUrl || process.env.APP_URL || 'https://pmtool.cz'
  await sendEmail(to, `Ukol presunut: ${opts.itemTitle} → ${opts.stepName}`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#7C3AED">Zmena stavu ukolu</h2>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666;width:120px">Ukol</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">${opts.itemTitle}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666">Novy stav</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:700;color:#7C3AED">${opts.stepName}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666">Presunul</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${opts.movedBy}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#666">Projekt</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${opts.projectName}</td></tr>
      </table>
      <p><a href="${url}" style="display:inline-block;padding:10px 24px;background:#7C3AED;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Otevrit v PM Tool</a></p>
      <p style="color:#888;font-size:13px">— PM Tool</p>
    </div>
  `)
}
