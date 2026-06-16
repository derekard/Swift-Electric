import {
  LayoutDashboard,
  FileText,
  Briefcase,
  CalendarDays,
  Receipt,
  Users,
  Settings,
  Clock,
  Building2,
  BarChart3,
  type LucideIcon,
} from "lucide-react"

import type { Role } from "@/lib/supabase/types"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

const dashboard: NavItem = { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }
const quotes: NavItem = { label: "Quotes", href: "/quotes", icon: FileText }
const jobs: NavItem = { label: "Jobs", href: "/jobs", icon: Briefcase }
const schedule: NavItem = { label: "Schedule", href: "/schedule", icon: CalendarDays }
const invoices: NavItem = { label: "Invoices", href: "/invoices", icon: Receipt }
const clients: NavItem = { label: "Clients", href: "/clients", icon: Users }
const reports: NavItem = { label: "Reports", href: "/reports", icon: BarChart3 }
const settings: NavItem = { label: "Settings", href: "/settings", icon: Settings }
const myJobs: NavItem = { label: "My jobs", href: "/my/jobs", icon: Briefcase }
const timesheet: NavItem = { label: "Timesheet", href: "/my/timesheet", icon: Clock }

// Admins work in the field too — give them My jobs + Timesheet to log their
// own time/mileage/parts.
const adminNav: NavItem[] = [dashboard, quotes, jobs, schedule, invoices, clients, reports, myJobs, timesheet, settings]
// Office = everything staff-level except company settings/team.
const officeNav: NavItem[] = [dashboard, quotes, jobs, schedule, invoices, clients, reports]
const techNav: NavItem[] = [myJobs, timesheet]

export const platformNavItem: NavItem = {
  label: "Companies",
  href: "/platform/admin",
  icon: Building2,
}

export function navForRole(role: Role): NavItem[] {
  if (role === "admin") return adminNav
  if (role === "office") return officeNav
  return techNav
}
