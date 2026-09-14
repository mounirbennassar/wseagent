import type { Metadata, Viewport } from "next";
import { Manrope, Tajawal } from "next/font/google";
import "./globals.css";

const english = Manrope({ subsets: ["latin"], variable: "--font-english" });
const arabic = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700", "800"], variable: "--font-arabic" });
export const metadata: Metadata = { title: "هلا | Hala — Your English journey starts here", description: "Meet Hala, your AI English learning guide. Talk naturally in Saudi Arabic or English and discover Wall Street English.", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "Hala" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#003359" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body className={`${english.variable} ${arabic.variable}`}>{children}</body></html>;
}
