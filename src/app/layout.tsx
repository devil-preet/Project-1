import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Brand Portal", template: "%s · Brand Portal" },
  description: "Manage your brand, catalog and storefront.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${unbounded.variable} ${jetbrains.variable} dark h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col">
        <div className="nv-bg" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="grid" /></div>
        <div className="relative z-10 flex min-h-svh flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
