import { redirect } from "next/navigation";

export default async function WorkspaceIndex({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  redirect(`/b/${businessId}/overview`);
}
