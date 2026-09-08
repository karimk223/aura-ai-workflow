import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AURA Content Review',
  description: 'Creator review dashboard for AURA product imagery.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
