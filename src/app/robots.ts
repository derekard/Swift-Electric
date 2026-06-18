import type { MetadataRoute } from "next"

function siteUrl(pathname: string): string {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "")

  return `${origin}${pathname}`
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/services", "/about", "/contact", "/site/assets/"],
      disallow: [
        "/api/",
        "/auth/",
        "/clients",
        "/dashboard",
        "/invoices",
        "/jobs",
        "/login",
        "/my",
        "/no-access",
        "/platform",
        "/q/",
        "/quotes",
        "/reports",
        "/schedule",
        "/settings",
      ],
    },
    sitemap: siteUrl("/sitemap.xml"),
  }
}
