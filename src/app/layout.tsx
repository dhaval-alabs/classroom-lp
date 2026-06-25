import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Poppins } from "next/font/google";
import Analytics from "@/components/Analytics";
import "./globals.css";

// AnalytixLabs brand typeface
const poppins = Poppins({
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Offline Data Science & AI Classroom Batches | AnalytixLabs",
  description:
    "Join AnalytixLabs' in-person classroom batches in Gurgaon, Noida & Bangalore. Data Science, Generative AI & Analytics with 97% placement assistance. Book your seat today.",
  keywords: [
    "data science classroom course",
    "offline data science batch",
    "AnalytixLabs",
    "generative AI course",
    "data analytics course Gurgaon Noida Bangalore",
  ],
  openGraph: {
    title: "Offline Data Science & AI Classroom Batches | AnalytixLabs",
    description:
      "In-person Data Science, Generative AI & Analytics batches with 97% placement assistance. Limited seats — book your free counselling session.",
    type: "website",
    url: siteUrl,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#003368",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
