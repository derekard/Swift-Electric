import { Resend } from "resend"

import type { QuoteDoc } from "@/lib/quote-doc"
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
