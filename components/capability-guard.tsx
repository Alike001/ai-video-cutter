
  "use client";

  import { useEffect } from "react";
  import { useRouter } from "next/navigation";
  import { getMissingCapabilities } from "@/lib/capabilities";

  export function CapabilityGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    useEffect(() => {
      const missing = getMissingCapabilities();
      if (missing.length > 0) {
        router.replace(`/unsupported?missing=${encodeURIComponent(missing.join(","))}`);
      }
    }, [router]);

    return <>{children}</>;
  }

