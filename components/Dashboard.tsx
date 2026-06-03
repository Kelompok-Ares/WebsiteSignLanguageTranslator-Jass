'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MediaPipeProvider } from '@/contexts/MediaPipeContext';
import {
  createEmptyDataset, saveToStorage, loadFromStorage,
  type DatasetState,
} from '@/lib/dataset';
import { SignModel } from '@/lib/model';
import WebcamPanel from './WebcamPanel';
import DetectionTab from './DetectionTab';
import TrainerTab from './TrainerTab';
import SettingsTab from './SettingsTab';

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

type Tab = 'detection' | 'trainer' | 'settings';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('detection');
  const [dataset, setDataset] = useState<DatasetState>(createEmptyDataset());
  const [model] = useState(() => new SignModel());
  const [modelTrained, setModelTrained] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) setDataset(saved);
  }, []);

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
    const interval = setInterval(checkHealth, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [backendUrl, model]);

  const updateDataset = useCallback((next: DatasetState) => {
    setDataset(next);
    saveToStorage(next);
  }, []);

  const handleBackendUrlChange = useCallback((url: string) => {
    model.setBackendUrl(url);
    setBackendUrl(url);
  }, [model]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'detection', label: 'Detect', icon: '👁' },
    { id: 'trainer', label: 'Train', icon: '🧠' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <MediaPipeProvider>
      <div className="app-shell">

        {/* ─── Headless camera (hidden) ─── */}
        <WebcamPanel />

        {/* ─── Top Header ─── */}
        <header className="app-header">
          <div className="app-logo">
            <div className="app-logo-icon">🤟</div>
            <div>
              <div className="app-logo-text">SignLang Translator</div>
              <div className="app-logo-sub">by Ares Team</div>
            </div>
          </div>
          <div className={`status-badge ${backendConnected ? 'online' : 'offline'}`}>
            <div className={`status-dot ${backendConnected ? 'online' : 'offline'}`} />
            {backendConnected ? 'API Connected' : 'Offline'}
          </div>
        </header>

        {/* ─── 3D Hand Hero Area ─── */}
        <div className="hero-3d">
          <Hand3DViewer />
        </div>

        {/* ─── Floating Content Panel ─── */}
        <div className={`content-panel ${!panelOpen ? 'collapsed' : ''}`}>
          {activeTab === 'detection' && (
            <DetectionTab model={model} modelTrained={modelTrained} backendConnected={backendConnected} />
          )}
          {activeTab === 'trainer' && (
            <TrainerTab
              dataset={dataset}
              onDatasetChange={updateDataset}
              model={model}
              onModelTrained={() => setModelTrained(true)}
              backendConnected={backendConnected}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              dataset={dataset}
              onDatasetChange={updateDataset}
              model={model}
              modelTrained={modelTrained}
              onModelTrained={() => setModelTrained(true)}
              backendUrl={backendUrl}
              onBackendUrlChange={handleBackendUrlChange}
              backendConnected={backendConnected}
            />
          )}
        </div>

        {/* ─── Bottom Navbar ─── */}
        <nav className="bottom-nav">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setPanelOpen(true); }}
              className={`nav-btn ${activeTab === t.id ? 'nav-btn-active' : ''}`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
          <button
            className="panel-toggle"
            onClick={() => setPanelOpen(!panelOpen)}
            title={panelOpen ? 'Hide panel' : 'Show panel'}
          >
            {panelOpen ? '▼' : '▲'}
          </button>
        </nav>

      </div>
    </MediaPipeProvider>
  );
}
