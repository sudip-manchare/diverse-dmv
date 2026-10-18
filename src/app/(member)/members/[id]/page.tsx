import { MemberProfilePage } from "@/components/profile-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemberProfilePage id={id} />;
}
