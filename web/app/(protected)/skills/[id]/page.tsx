"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SkillDetailRedirect() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    router.replace(`/skills?selected=${params.id}`);
  }, [params.id, router]);

  return null;
}
