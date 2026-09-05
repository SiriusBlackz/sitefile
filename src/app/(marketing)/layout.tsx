import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { MarketingNav, MarketingFooter } from "./marketing-ui";
import "./marketing.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`marketing-root min-h-screen ${archivo.variable} ${plexMono.variable} ${publicSans.variable}`}
    >
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
