import type { MetadataRoute } from "next"

const PUBLIC_ROUTES = ["/", "/services", "/about", "/contact"]

function siteUrl(pathname: string): string {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "")

  return `${origin}${pathname}`
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((pathname) => ({
    url: siteUrl(pathname),
  }))
}
