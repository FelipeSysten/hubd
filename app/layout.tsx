import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { JobsProvider } from "@/components/JobsProvider";
import { Nav } from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "hubd",
  description: "Estúdio de criação de imagens e vídeos com IA, num só portal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <JobsProvider>
          <Nav />
          {children}
        </JobsProvider>
      </body>
    </html>
  );
}
