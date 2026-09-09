import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AURA Designer Review',
  description: 'Designer review dashboard for AURA product imagery.',
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
