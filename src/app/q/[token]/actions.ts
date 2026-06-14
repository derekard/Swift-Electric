"use server"

import { revalidatePath } from "next/cache"

import { acceptPublicQuote } from "@/lib/public-quote"

export async function acceptQuoteTokenAction(
  token: string,
  signature: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await acceptPublicQuote(token, signature)
  if (res.ok) revalidatePath(`/q/${token}`)
  return res
}
