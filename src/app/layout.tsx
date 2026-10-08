import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FF Wahlplattform", template: "%s · FF Wahlplattform" },
  description: "Wahlplattform der Freiwilligen Feuerwehr",
};
export const viewport: Viewport = { themeColor: "#07090d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
