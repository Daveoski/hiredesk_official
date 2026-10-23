import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "@/components/providers";
import { themeBootScript } from "@/lib/theme-script";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "HirePlume | Smarter Hiring for Modern Teams",
  description: "HirePlume helps companies review applicants, coordinate interviews, and make confident hiring decisions with a clear, collaborative workflow.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets the "dark" class before React loads, so the server HTML differs on purpose.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
