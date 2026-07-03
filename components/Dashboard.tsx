'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MediaPipeProvider } from '@/contexts/MediaPipeContext';

import { SignModel } from '@/lib/model';
import WebcamPanel from './WebcamPanel';
import DetectionTab from './DetectionTab';
import SettingsTab from './SettingsTab';
import CreditTab from './CreditTab';
import { ErrorBoundary } from './ErrorBoundary';

import { HandMetal, Eye, Brain, Settings, Camera, CameraOff, User } from 'lucide-react';

// Lazy-load Hand3DViewer since it imports Three.js
const Hand3DViewer = dynamic(() => import('./Hand3DViewer'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
    }}>
      <div className="spinner" />
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading 3D engine...</span>
    </div>
  ),
});

type Tab = 'detection' | 'settings' | 'credit';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'detection', label: 'Detect', icon: <Eye size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  { id: 'credit', label: 'Credit', icon: <User size={18} /> },
];

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<Tab>('detection');
  const [model] = useState(() => new SignModel());
  const [modelTrained, setModelTrained] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setBackendUrl(model.backendUrl);
  }, [model]);

  useEffect(() => {
    if (!backendUrl) {
      setBackendConnected(false);
      return;
    }

    let active = true;
    const checkHealth = async () => {
      const health = await model.checkHealth();
      if (!active) return;
      setBackendConnected(health !== null);
      if (health?.model_trained) {
        setModelTrained(true);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [backendUrl, model]);

  const handleModelTrained = useCallback(async () => {
    setModelTrained(true);
    // Immediately sync backend state so DetectionTab can connect
    const health = await model.checkHealth();
    if (health) {
      setBackendConnected(true);
    }
  }, [model]);



  const handleBackendUrlChange = useCallback((url: string) => {
    model.setBackendUrl(url);
    setBackendUrl(url);
  }, [model]);

  return (
    <MediaPipeProvider>
      <div className="app-shell">

        {/* ─── Headless camera (hidden or PiP) ─── */}
        <WebcamPanel showPreview={showPreview} />

        {/* ─── Top Header ─── */}
        <header className="app-header">
          <div className="app-logo">
            <div className="app-logo-icon"><HandMetal size={20} color="#fff" /></div>
            <div>
              <div className="app-logo-text">Silent Vox</div>
            </div>
          </div>
          <div className={`status-badge ${backendConnected ? 'online' : 'offline'}`}>
            <div className={`status-dot ${backendConnected ? 'online' : 'offline'}`} />
            {backendConnected ? 'Online' : 'Offline'}
          </div>
        </header>

        {/* ─── 3D Viewport (left panel) ─── */}
        <div className="viewport-panel" style={{ position: 'relative' }}>
          <Hand3DViewer />

          <button
            className="btn btn-ghost"
            onClick={() => setShowPreview(!showPreview)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 50,
              background: 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            {showPreview ? <CameraOff size={18} /> : <Camera size={18} />}
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {showPreview ? 'Hide Camera' : 'Show Camera'}
            </span>
          </button>
        </div>

        {/* ─── Sidebar (right panel) ─── */}
        <div className="sidebar-panel">

          {/* Tab Navigation */}
          <nav className="sidebar-nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`sidebar-nav-btn ${activeTab === t.id ? 'active' : ''}`}
              >
                <span className="nav-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Tab Content */}
          <div className="sidebar-content">
            {activeTab === 'detection' && (
              <DetectionTab model={model} modelTrained={modelTrained} backendConnected={backendConnected} />
            )}
            {activeTab === 'settings' && (
              <SettingsTab
                model={model}
                modelTrained={modelTrained}
                onModelTrained={() => setModelTrained(true)}
                backendUrl={backendUrl}
                onBackendUrlChange={handleBackendUrlChange}
                backendConnected={backendConnected}
              />
            )}
            {activeTab === 'credit' && <CreditTab />}
          </div>
        </div>

        {/* ─── Bottom Footer ─── */}
        <footer className="app-footer">
          © {new Date().getFullYear()} Jass & Dims. All rights reserved.
        </footer>

      </div>
    </MediaPipeProvider>
  );
}

export default function Dashboard() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
