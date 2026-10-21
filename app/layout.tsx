import type { Metadata } from "next";
// Self-hosted variable Rubik (has Cyrillic): no network access needed at build or run time.
import "@fontsource-variable/rubik";
import "./globals.css";

export const metadata: Metadata = {
  title: "Формы откликов",
  description: "Конструктор форм отклика для карьерной платформы студентов",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg font-sans text-ink">{children}</body>
    </html>
  );
}
