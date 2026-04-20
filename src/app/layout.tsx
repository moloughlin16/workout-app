import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Personal martial arts & lifting tracker",
  // Tells the browser where to find the PWA manifest. Next.js renders the
  // <link rel="manifest" href="/manifest.json"> tag for us.
  manifest: "/manifest.json",
  // iOS Safari uses these to make "Add to Home Screen" feel like a real app:
  // - apple-mobile-web-app-capable: launch full-screen, no Safari chrome
  // - title: the label shown under the home screen icon
  // - status-bar-style: translucent so our dark page background shows through
  appleWebApp: {
    capable: true,
    title: "Workout",
    statusBarStyle: "black-translucent",
  },
  // Tell iOS which icon to use on the home screen.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

// Viewport / theme color live in their own export in Next.js 14+.
// `viewportFit: "cover"` lets the app draw under the iPhone notch / home bar.
// themeColor = zinc-950 to match the forced-dark background (affects the iOS
// status bar + Android browser chrome color).
export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `className="dark"` locks the whole app into Tailwind's dark palette
    // regardless of system setting. `bg-zinc-950` on <html> prevents a
    // white flash when the PWA launches before our page-level bg kicks in.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased bg-zinc-950`}
    >
      {/* pb-20 = bottom padding so page content isn't hidden behind the nav */}
      <body className="min-h-full flex flex-col pb-20 bg-zinc-950 text-zinc-100">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
