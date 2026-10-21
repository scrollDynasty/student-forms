import type { Metadata } from "next";
// Fonts ship inside the `geist` npm package, so `next build` needs no network access.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Формы откликов",
  description: "Конструктор форм отклика для карьерной платформы студентов",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
