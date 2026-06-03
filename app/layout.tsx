import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignLang 3D — Real-Time Sign Language Translator',
  description: 'A minimalist 3D real-time sign language translator using MediaPipe and Three.js.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
