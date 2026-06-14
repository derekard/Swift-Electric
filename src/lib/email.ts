import { Resend } from "resend"

import type { QuoteDoc } from "@/lib/quote-doc"
import type { InvoiceDoc } from "@/lib/pdf/invoice-pdf"
import { money } from "@/lib/format"

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

type SendResult = { ok: true } | { ok: false; error: string }

/** Email a quote PDF to the client via Resend. */
export async function sendQuoteEmail(args: {
  to: string
  doc: QuoteDoc
  pdf: Buffer
}): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email isn't configured (RESEND_API_KEY)." }
  }
  const { to, doc, pdf } = args
  const resend = new Resend(process.env.RESEND_API_KEY)

  const totalLine = doc.showHstLine
    ? `Total: ${money(doc.total)} (incl. HST)`
    : `Total: ${money(doc.amountPretax)} + HST`

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: [to],
      subject: `Estimate ${doc.quoteNumber} from ${doc.company.name}`,
      text:
        `Hi${doc.client?.name ? ` ${doc.client.name}` : ""},\n\n` +
        `Please find attached estimate ${doc.quoteNumber} from ${doc.company.name}.\n` +
        `${totalLine}\n\n` +
        `Thank you,\n${doc.company.ownerName ?? doc.company.name}`,
      attachments: [
        {
          filename: `${doc.quoteNumber}.pdf`,
          content: pdf,
        },
      ],
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    }
  }
}

/** Polite payment reminder to a client for an outstanding invoice. */
export async function sendInvoiceReminderEmail(args: {
  to: string
  companyName: string
  ownerName: string | null
  clientName: string | null
  invoiceNumber: string
  amount: number
  dueDate: string
  daysOverdue: number
}): Promise<SendResult> {
  if (!isEmailConfigured()) return { ok: false, error: "Email not configured." }
  const { to, companyName, ownerName, clientName, invoiceNumber, amount, dueDate, daysOverdue } =
    args
  const resend = new Resend(process.env.RESEND_API_KEY)

  const status =
    daysOverdue > 0
      ? `is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue (was due ${dueDate})`
      : `is due today (${dueDate})`

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: [to],
      subject: `Reminder: invoice ${invoiceNumber} from ${companyName}`,
      text:
        `Hi${clientName ? ` ${clientName}` : ""},\n\n` +
        `A friendly reminder that invoice ${invoiceNumber} for ${money(amount)} ${status}.\n\n` +
        `Please arrange payment at your earliest convenience. If you've already paid, thank you — please disregard this note.\n\n` +
        `Thank you,\n${ownerName ?? companyName}`,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" }
  }
}

/** Digest of outstanding invoices to a company's admins/office. */
export async function sendOwnerDigestEmail(args: {
  to: string[]
  companyName: string
  items: {
    invoiceNumber: string
    clientName: string | null
    amount: number
    daysOverdue: number
  }[]
}): Promise<SendResult> {
  if (!isEmailConfigured()) return { ok: false, error: "Email not configured." }
  const { to, companyName, items } = args
  if (to.length === 0 || items.length === 0) return { ok: true }
  const resend = new Resend(process.env.RESEND_API_KEY)

  const total = items.reduce((s, i) => s + i.amount, 0)
  const lines = items
    .map(
      (i) =>
        `• ${i.invoiceNumber} — ${i.clientName ?? "client"} — ${money(i.amount)}` +
        (i.daysOverdue > 0 ? ` (${i.daysOverdue}d overdue)` : " (due today)")
    )
    .join("\n")

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to,
      subject: `${companyName}: ${items.length} invoice${items.length === 1 ? "" : "s"} outstanding (${money(total)})`,
      text:
        `Outstanding invoices for ${companyName}:\n\n${lines}\n\n` +
        `Total outstanding: ${money(total)}\n\n` +
        `Open the app to follow up.`,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" }
  }
}

/** Email an invoice PDF to the client via Resend. */
export async function sendInvoiceEmail(args: {
  to: string
  doc: InvoiceDoc
  pdf: Buffer
}): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email isn't configured (RESEND_API_KEY)." }
  }
  const { to, doc, pdf } = args
  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: [to],
      subject: `Invoice ${doc.invoiceNumber} from ${doc.company.name}`,
      text:
        `Hi${doc.clientName ? ` ${doc.clientName}` : ""},\n\n` +
        `Please find attached invoice ${doc.invoiceNumber} from ${doc.company.name}.\n` +
        `Total due: ${money(doc.total)} (incl. HST).\n` +
        `${doc.dueDate !== "—" ? `Due ${doc.dueDate}.\n` : ""}` +
        `\nThank you,\n${doc.company.ownerName ?? doc.company.name}`,
      attachments: [{ filename: `${doc.invoiceNumber}.pdf`, content: pdf }],
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    }
  }
}
