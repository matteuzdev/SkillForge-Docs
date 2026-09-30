import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillForge Docs — Web knowledge to AI skills",
  description: "Transforme documentação, help centers e bases públicas de conhecimento em Skills estruturadas para agentes de IA."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
