import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── Rename /jobs → /freelances (Deploy 2 + ajuste Deploy 3) ─────────────
  // Preserva deeplinks externos (WhatsApp, email, bookmarks) via 301.
  //
  // Nota: /api/jobs/* não é afetado por esses redirects — URLs começam com
  // /api/, não /jobs/. Namespaces independentes. O lookahead negativo abaixo
  // (?!api) é defesa-em-profundidade conforme briefing Deploy 3.
  async redirects() {
    return [
      {
        source: '/jobs',
        destination: '/freelances',
        permanent: true,
      },
      // Deploy 4: /jobs/new foi eliminado (não existe destino /freelances/new).
      // Precedência: este redirect é declarado ANTES do catch-all para garantir
      // o match exato e evitar um 308 → 404 (fluxo quebrado em deeplinks antigos).
      {
        source: '/jobs/new',
        destination: '/freelances',
        permanent: true,
      },
      {
        source: '/jobs/:path((?!api).*)',
        destination: '/freelances/:path',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
