import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Page not found | Swift Electric",
  description: "The requested Swift Electric page could not be found.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-[#101723] px-6 py-16 text-white">
      <div className="w-full max-w-2xl text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.3em] text-[#C49A2C]">
          404
        </p>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-white/70">
          This public page is not available. You can return to Swift Electric or
          request a quote from the public site.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md bg-[#C49A2C] px-5 text-sm font-semibold text-[#101723] transition hover:bg-[#E6B73E]"
          >
            Back home
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center rounded-md border border-white/25 px-5 text-sm font-semibold text-white transition hover:border-[#C49A2C] hover:text-[#C49A2C]"
          >
            Request a quote
          </Link>
        </div>
      </div>
    </main>
  )
}
