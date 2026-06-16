import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import { isTenantProfile } from "@/lib/auth-identity"
import { getCurrentProfile } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  transcript: z.string().min(1),
  priceBook: z.array(
    z.object({ id: z.string(), name: z.string(), unit_price: z.number() })
  ),
})

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    areas: {
      type: "array",
      description: "Rooms / areas of the job, each with its line items.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Room or area, e.g. Kitchen" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                price_book_item_id: {
                  type: ["string", "null"],
                  description:
                    "Matching price-book item id, or null for a custom line.",
                },
                description: { type: "string" },
                qty: { type: "number" },
              },
              required: ["price_book_item_id", "description", "qty"],
            },
          },
        },
        required: ["name", "lines"],
      },
    },
  },
  required: ["areas"],
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (
    !profile ||
    !profile.active ||
    !isTenantProfile(profile) ||
    (profile.role !== "admin" && profile.role !== "office")
  ) {
    return Response.json({ error: "Not authorized" }, { status: 403 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Voice parsing isn't configured (no ANTHROPIC_API_KEY)." },
      { status: 501 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Bad request" }, { status: 400 })
  }
  const { transcript, priceBook } = parsed.data

  const priceList = priceBook
    .map((p) => `- ${p.name} (id: ${p.id}, $${p.unit_price})`)
    .join("\n")

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tool_choice: { type: "tool", name: "build_quote" },
      tools: [
        {
          name: "build_quote",
          description:
            "Convert an electrician's spoken job description into quote areas and line items.",
          input_schema: TOOL_SCHEMA,
        },
      ],
      messages: [
        {
          role: "user",
          content:
            `You convert an electrician's spoken notes into structured quote line items.\n\n` +
            `PRICE BOOK (use the id when an item clearly matches; quantities are how many):\n${priceList}\n\n` +
            `Rules:\n` +
            `- Group items under the room/area mentioned. If no room is mentioned, use "General".\n` +
            `- Match spoken items to the price book by meaning (e.g. "plugs"/"outlets" = Receptacle, "GFI"/"GFCI" = GFI / GFCI, "fan" = Exhaust fan).\n` +
            `- For matched items set price_book_item_id and use the price-book name as the description.\n` +
            `- For anything not in the price book, set price_book_item_id to null and use the spoken words as the description.\n` +
            `- qty defaults to 1 when not stated.\n\n` +
            `Transcript:\n"${transcript}"`,
        },
      ],
    })

    const toolUse = msg.content.find((c) => c.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ areas: [] })
    }
    return Response.json(toolUse.input)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voice parsing failed"
    return Response.json({ error: message }, { status: 502 })
  }
}
