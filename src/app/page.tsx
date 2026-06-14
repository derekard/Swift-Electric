import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Zap,
  Lightbulb,
  Gauge,
  PlugZap,
  Wrench,
  ShieldCheck,
  Phone,
  Mail,
  ArrowRight,
} from "lucide-react"

import { getCurrentProfile, homePathForProfile } from "@/lib/auth"
import { getSiteTenant } from "@/lib/tenant"
import { Button } from "@/components/ui/button"

// Public contact details (edit to the real ones).
const CONTACT = {
  phone: "(905) 555-0188",
  phoneHref: "tel:+19055550188",
  email: "info@swiftelectric.ca",
}

const SERVICES = [
  {
    icon: Lightbulb,
    title: "Pot lights & fixtures",
    desc: "Recessed lighting, dimmers, switches and fixture installs done clean.",
  },
  {
    icon: Gauge,
    title: "Panel upgrades",
    desc: "Service upgrades and panel changes to safely power your home.",
  },
  {
    icon: PlugZap,
    title: "EV chargers",
    desc: "Level 2 charger installs sized and wired for your vehicle.",
  },
  {
    icon: Wrench,
    title: "Renovations",
    desc: "Kitchens, basements and additions — wiring, devices and inspections.",
  },
  {
    icon: Zap,
    title: "Receptacles & GFCI",
    desc: "New outlets, GFI/GFCI protection and code corrections.",
  },
  {
    icon: ShieldCheck,
    title: "Service calls",
    desc: "Troubleshooting and repairs from a licensed Master Electrician.",
  },
]

export default async function HomePage() {
  const profile = await getCurrentProfile()
  if (profile?.active) redirect(homePathForProfile(profile))

  // On a company's branded host, send visitors to their branded login.
  const siteTenant = await getSiteTenant()
  if (siteTenant) redirect("/login")

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
            <Zap className="size-4.5" />
          </div>
          <span className="font-semibold tracking-tight">Swift Electric</span>
        </div>
        <Button render={<Link href="/login" />} variant="ghost" size="sm">
          Staff sign in
        </Button>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-16 pb-12 text-center sm:pt-24">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <ShieldCheck className="size-3.5" /> Licensed Master Electrician · ECRA/ESA
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Electrical work you can trust
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
          Swift Electric handles residential lighting, panel upgrades, EV
          chargers and renovations across the region — done safely, on time, and
          to code.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button render={<a href={`mailto:${CONTACT.email}`} />} size="lg">
            Get a free quote <ArrowRight />
          </Button>
          <Button
            render={<a href={CONTACT.phoneHref} />}
            variant="outline"
            size="lg"
          >
            <Phone /> {CONTACT.phone}
          </Button>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto w-full max-w-5xl px-6 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">
          What we do
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.title}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm"
              >
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-primary/10 px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready to get started?
          </h2>
          <p className="max-w-md text-muted-foreground">
            Tell us about your project and we&apos;ll send a detailed estimate.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button render={<a href={`mailto:${CONTACT.email}`} />} size="lg">
              <Mail /> Email us
            </Button>
            <Button
              render={<a href={CONTACT.phoneHref} />}
              variant="outline"
              size="lg"
            >
              <Phone /> Call {CONTACT.phone}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t px-6 py-8 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Swift Electric</p>
        <p className="mt-1">Master Electrician · ECRA/ESA Licensed · Fully insured</p>
        <p className="mt-1">
          {CONTACT.phone} · {CONTACT.email}
        </p>
      </footer>
    </div>
  )
}
