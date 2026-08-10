import { AppLayout } from "@/components/layout/app-layout";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function CatchAllPage({ params }: PageProps) {
  await params;

  return (
    <AppLayout>
      <PagePlaceholder />
    </AppLayout>
  );
}
