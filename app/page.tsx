"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// A client redirect (works in both the server app and the static Pages export,
// where server redirect() is not allowed).
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/overview");
  }, [router]);
  return (
    <div className="sub">
      Redirecting to the overview… <Link href="/overview" style={{ color: "var(--ai)", fontWeight: 700 }}>continue</Link>
    </div>
  );
}
