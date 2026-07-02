import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "..", "docs");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const pathSegments = (await params).path ?? [];
  const file = pathSegments.join("/") || "README";
  const fileName = file.endsWith(".md") ? file : `${file}.md`;

  const fullPath = path.join(DOCS_DIR, fileName);
  const resolved = path.resolve(fullPath);
  const docsResolved = path.resolve(DOCS_DIR);

  if (
    !(resolved === docsResolved || resolved.startsWith(docsResolved + path.sep))
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    return new Response(content, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
