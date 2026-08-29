import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Brand face for the Modernist design system. 400/600/800 are the weights
// the system's tokens reference (--font-heading-weight is 800).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Yahzel",
    template: "%s | Yahzel",
  },
  description:
    "Yahzel is where your professional identity lives. Start with your personal profile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* One provider for the whole product: the authentication screens
            follow the same System/Light/Dark preference the app does. */}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
