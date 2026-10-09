import { notFound } from "next/navigation";
import { items as allItems, itemById } from "@/lib/data";
import { ItemDetail } from "./ItemDetail";

// Pre-render every item page (required for static export; harmless otherwise).
export function generateStaticParams() {
  return allItems.map((i) => ({ id: i.id }));
}

export default function ItemDetailPage({ params }: { params: { id: string } }) {
  if (!itemById(params.id)) notFound();
  return <ItemDetail id={params.id} />;
}
