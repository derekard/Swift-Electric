import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { ClientsView } from "@/components/clients/clients-view"

export default async function ClientsPage() {
  await requireStaff()
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name")

  return <ClientsView clients={clients ?? []} />
}
