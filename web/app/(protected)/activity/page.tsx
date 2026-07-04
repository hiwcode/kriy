"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { WorkspaceActivityCard } from "@/components/dashboard/workspace-activity-card";

export default function ActivityPage() {
  return (
    <AppLayout>
      <PageLayout title="Activity" subtitle="Recent changes across your workspace">
        <div className="mx-auto max-w-3xl">
          <WorkspaceActivityCard paginate pageSize={20} showViewAll={false} devider={true}/>
        </div>
      </PageLayout>
    </AppLayout>
  );
}
