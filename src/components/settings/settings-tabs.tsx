"use client"

import type {
  Allowlist,
  TenantSettings,
  PriceBookItem,
  Profile,
} from "@/lib/supabase/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CompanyForm } from "@/components/settings/company-form"
import { PriceBookManager } from "@/components/settings/price-book-manager"
import { TeamManager } from "@/components/settings/team-manager"

export function SettingsTabs({
  settings,
  items,
  profiles,
  invites,
}: {
  settings: TenantSettings
  items: PriceBookItem[]
  profiles: Profile[]
  invites: Allowlist[]
}) {
  return (
    <Tabs defaultValue="company">
      <TabsList>
        <TabsTrigger value="company">Company</TabsTrigger>
        <TabsTrigger value="pricebook">Price book</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="company" className="pt-4">
        <CompanyForm settings={settings} />
      </TabsContent>
      <TabsContent value="pricebook" className="pt-4">
        <PriceBookManager items={items} />
      </TabsContent>
      <TabsContent value="team" className="pt-4">
        <TeamManager profiles={profiles} invites={invites} />
      </TabsContent>
    </Tabs>
  )
}
