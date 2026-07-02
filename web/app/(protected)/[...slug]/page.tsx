import { AppLayout } from "@/components/layout/app-layout";
import { PagePlaceholder } from "@/components/ui/page-placeholder";
import { AgentPage } from "@/components/agents/agent-page";
import { getAgentConfig } from "@/config/site";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug } = await params;
  const path = "/" + slug.join("/");

  // Check if it's an agent route
  const agent = getAgentConfig(path);

  if (agent) {
    return (
      <AppLayout>
        <AgentPage agentId={agent.id} agentName={agent.name} />
      </AppLayout>
    );
  }

  // Default placeholder for other routes
  return (
    <AppLayout>
      <PagePlaceholder />
    </AppLayout>
  );
}
