import { requireOwner } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { PageHeader } from "@/components/page-header"
import { SettingsTabs } from "@/components/settings/settings-tabs"

export default async function SettingsPage() {
  await requireOwner()
  const supabase = await createClient()

  const [settings, { data: items }, { data: profiles }, { data: invites }] =
    await Promise.all([
      getSettings(),
      supabase.from("price_book_items").select("*").order("sort"),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("allowlist").select("*").order("email"),
    ])

  if (!settings) {
    return (
      <>
        <PageHeader title="Settings" />
        <p className="text-sm text-muted-foreground">
          Settings haven&apos;t been initialised. Run the database seed
          (supabase/seed.sql) to create the company settings row.
        </p>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details, pricing defaults, price book and team."
      />
      <SettingsTabs
        settings={settings}
        items={items ?? []}
        profiles={profiles ?? []}
        invites={invites ?? []}
      />
    </>
  )
}
