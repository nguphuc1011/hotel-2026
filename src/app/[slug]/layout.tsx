import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug === 'default' ? 'PMS' : `${slug.toUpperCase()}`;
  
  return {
    title: `${name} - Quản lý khách sạn`,
    manifest: `/manifest.json?slug=${slug}`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: name,
    },
  };
}

export default async function TenantLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await params; // Ensure params are available if needed in children or layout
  return <>{children}</>;
}
