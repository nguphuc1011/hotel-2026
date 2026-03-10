import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug') || 'default';
  const name = slug === 'default' ? 'PMS' : `${slug.toUpperCase()}`;
  
  const manifest = {
    name: name,
    short_name: name,
    description: `Hệ thống quản lý khách sạn cho ${slug === 'default' ? 'khách sạn' : slug.toUpperCase()}.`,
    start_url: `/${slug}`,
    display: "standalone",
    scope: `/`,
    background_color: "#ffffff",
    theme_color: "#007AFF",
    icons: [
      {
        src: "/next.svg",
        sizes: "192x192",
        type: "image/svg+xml"
      },
      {
        src: "/next.svg",
        sizes: "512x512",
        type: "image/svg+xml"
      }
    ],
    orientation: "portrait",
    categories: ["business", "productivity"]
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    },
  });
}
