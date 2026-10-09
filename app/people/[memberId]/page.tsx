import { notFound } from "next/navigation";
import { members, memberById } from "@/lib/data";
import { MemberDetail } from "./MemberDetail";

// Pre-render every member page (required for static export; harmless otherwise).
export function generateStaticParams() {
  return members.map((m) => ({ memberId: m.id }));
}

export default function MemberDetailPage({ params }: { params: { memberId: string } }) {
  if (!memberById(params.memberId)) notFound();
  return <MemberDetail memberId={params.memberId} />;
}
