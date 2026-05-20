  "use client";

  import { useErrorBanner, clearBanner } from "@/lib/error-banner-store";
  import { X } from "lucide-react";

  const styles = {
    info: "bg-blue-50 text-blue-900 border-blue-200",
    warning: "bg-amber-50 text-amber-900 border-amber-200",
    error: "bg-red-50 text-red-900 border-red-200",
  };

  export function ErrorBanner() {
    const banner = useErrorBanner();
    if (banner === null) return null;
    return (
      <div className={`fixed top-0 inset-x-0 z-50 border-b px-4 py-2 flex items-center gap-3 ${styles[banner.variant]}`}>
        <span className="flex-1 text-sm">{banner.message}</span>
        {banner.actionLabel && banner.onAction && (
          <button
            onClick={banner.onAction}
            className="text-sm font-semibold underline underline-offset-2"
          >
            {banner.actionLabel}
          </button>
        )}
        <button
          onClick={clearBanner}
          aria-label="Dismiss"
          className="p-1 hover:opacity-70"
        >
          <X size={16} />
        </button>
      </div>
    );
  }
