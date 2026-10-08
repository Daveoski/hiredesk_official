import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "HireDesk",
  description: "Review applicants, coordinate interviews, and make thoughtful hiring decisions with your team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
