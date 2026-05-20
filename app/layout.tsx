  import type { Metadata } from "next";
  import "./globals.css";
  import { ErrorBanner } from "@/components/error-banner";

  export const metadata: Metadata = {
    title: "AI Video Cutter",
    description: "Browser-based AI assistant for cutting, splitting, and trimming videos.",
  };

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <body>
          <ErrorBanner />
          {children}
        </body>
      </html>
    );
  }
