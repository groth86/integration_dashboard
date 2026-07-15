import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Integration Dashboard',
  description: 'Integration monitoring dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
