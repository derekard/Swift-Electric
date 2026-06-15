"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import { navForRole, platformNavItem, type NavItem } from "@/lib/nav"
import type { Role } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SignOutButton } from "@/components/sign-out-button"

type ShellProfile = {
  full_name: string | null
  email: string
  role: Role
  is_platform_admin: boolean
}

type Brand = {
  companyName: string
  logoUrl: string | null
}

function initials(name: string | null, email: string) {
  const source = name?.trim() || email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function Brand({ brand }: { brand: Brand }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt={brand.companyName} className="h-8 w-auto" />
      ) : (
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
          <Zap className="size-4.5" />
        </div>
      )}
      <span className="text-base font-semibold tracking-tight">
        {brand.companyName}
      </span>
    </div>
  )
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserCard({ profile }: { profile: ShellProfile }) {
  return (
    <div className="flex items-center gap-2 border-t px-2 py-3">
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className="bg-muted text-xs font-medium">
          {initials(profile.full_name, profile.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {profile.full_name ?? profile.email}
        </p>
        <p className="truncate text-xs text-muted-foreground capitalize">
          {profile.role}
        </p>
      </div>
      <SignOutButton variant="ghost" iconOnly className="shrink-0" />
    </div>
  )
}

export function AppShell({
  profile,
  brand,
  children,
}: {
  profile: ShellProfile
  brand: Brand
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = profile.is_platform_admin
    ? [...navForRole(profile.role), platformNavItem]
    : navForRole(profile.role)

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="p-3">
          <Brand brand={brand} />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks items={items} pathname={pathname} />
        </div>
        <UserCard profile={profile} />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open menu" />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="p-3">
                  <Brand brand={brand} />
                </div>
                <div className="flex-1 overflow-y-auto px-3">
                  <NavLinks
                    items={items}
                    pathname={pathname}
                    onNavigate={() => setOpen(false)}
                  />
                </div>
                <UserCard profile={profile} />
              </div>
            </SheetContent>
          </Sheet>
          <Brand brand={brand} />
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
