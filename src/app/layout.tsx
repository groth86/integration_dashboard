import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Integration Dashboard',
  description: 'Integration monitoring dashboard',
};

// Applies the saved theme before first paint so there's no flash of the
// retro theme when Modern is selected. Kept tiny and dependency-free.
const THEME_INIT = `try{if(localStorage.getItem('id_theme')==='modern'){document.documentElement.dataset.theme='modern'}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
