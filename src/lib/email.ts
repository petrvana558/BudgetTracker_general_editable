// Email service — uses Resend when RESEND_API_KEY is set, otherwise logs to console

let resend: any = null

async function getResend() {
  if (resend) return resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  try {
    const { Resend } = await import('resend')
    resend = new Resend(apiKey)
    return resend
  } catch {
    return null
  }
}

const FROM = process.env.EMAIL_FROM || 'PM Tool <noreply@pmtool.cz>'

async function sendEmail(to: string, subject: string, html: string) {
  const client = await getResend()
  if (client) {
    try {
      await client.emails.send({ from: FROM, to, subject, html })
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
