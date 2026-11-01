import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const name = slug && slug !== 'default' ? `${slug.toUpperCase()} - MANA PMS` : 'MANA PMS - Quản lý khách sạn';
  const shortName = slug && slug !== 'default' ? slug.toUpperCase() : 'MANA PMS';
  
  const manifest = {
    id: "/?source=pwa",
    name: name,
    short_name: shortName,
    description: "Hệ thống quản lý khách sạn và vận hành thông minh",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F172A",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    orientation: "any",
    categories: ["business", "productivity", "utilities"]
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
