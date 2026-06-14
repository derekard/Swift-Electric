import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async rewrites() {
    // Public marketing site (static, in public/site) served at clean URLs.
    // The app portal (login/dashboard/…) stays on its own React routes.
    return {
      afterFiles: [
        { source: "/", destination: "/site/index.html" },
        { source: "/services", destination: "/site/services.html" },
        { source: "/about", destination: "/site/about.html" },
        { source: "/contact", destination: "/site/contact.html" },
      ],
    }
  },
}

export default nextConfig
