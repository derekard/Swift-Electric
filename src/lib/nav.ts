import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Receipt,
  Users,
  Settings,
  Clock,
  type LucideIcon,
} from "lucide-react"

import type { Role } from "@/lib/supabase/types"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

const ownerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
]

const techNav: NavItem[] = [
  { label: "My jobs", href: "/my/jobs", icon: Briefcase },
  { label: "Timesheet", href: "/my/timesheet", icon: Clock },
]

export function navForRole(role: Role): NavItem[] {
  return role === "owner" ? ownerNav : techNav
}
