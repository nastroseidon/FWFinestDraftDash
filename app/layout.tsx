import type { Metadata, Viewport } from 'next';
import OrientationGuard from '@/components/OrientationGuard';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fort Wayne Finest: Draft Dash',
  description: 'Run until you get tackled. Your yardage sets your draft pick order.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0b1b12',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        {children}
        <OrientationGuard />
      </body>
    </html>
  );
}
