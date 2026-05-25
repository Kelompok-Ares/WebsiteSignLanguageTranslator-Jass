import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignLang.ID — Penerjemah Bahasa Isyarat Real-Time',
  description: 'Aplikasi penerjemah bahasa isyarat Indonesia secara real-time menggunakan AI di browser. Mendukung pelatihan model kustom dan pengenalan gestur berbasis posisi tangan.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
