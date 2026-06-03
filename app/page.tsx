'use client';
import dynamic from 'next/dynamic';

const Dashboard = dynamic(() => import('@/components/Dashboard'), {
  ssr: false,
  loading: () => (
    <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, letterSpacing: 0.5 }}>Loading App...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Dashboard />;
}
