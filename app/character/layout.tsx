import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { CharacterHeader } from "@/components/character/CharacterHeader";
import { CharacterProvider } from "@/components/character/CharacterProvider";
import "./character.css";

const display = Fraunces({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-ch-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-ch-mono" });

export const metadata: Metadata = { title: "Character · hubd" };

export default function CharacterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ch ${display.variable} ${mono.variable}`}>
      <CharacterProvider>
        <CharacterHeader />
        {children}
      </CharacterProvider>
    </div>
  );
}
