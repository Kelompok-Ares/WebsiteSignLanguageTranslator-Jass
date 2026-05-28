'use client';
import { useState, useEffect, useCallback } from 'react';
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

type Tab = 'detection' | 'trainer' | 'settings';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('detection');
  const [dataset, setDataset] = useState<DatasetState>(createEmptyDataset());
  const [model] = useState(() => new SignModel());
  const [modelTrained, setModelTrained] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) setDataset(saved);
  }, []);

  // Set initial URL from model (localStorage)
  useEffect(() => {
    setBackendUrl(model.backendUrl);
  }, [model]);

  // Health check on mount and when URL changes
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

    // Periodic health check every 30 seconds
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
    { id: 'detection', label: 'Detection', icon: '👁' },
    { id: 'trainer', label: 'Data', icon: '🧠' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <MediaPipeProvider>
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>

        {/* Fullscreen Webcam Background */}
        <WebcamPanel />

        {/* Floating Sidebar Container */}
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          bottom: 16,
          width: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          zIndex: 50
        }}>

          {/* Header/Nav Glass Panel */}
          <div className="glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🤟</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Sign Language Translator (Prototype)</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>By Ares Team</div>
              </div>
              {/* Backend status indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 20,
                background: backendConnected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${backendConnected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: backendConnected ? '#10b981' : '#ef4444',
                  boxShadow: backendConnected ? '0 0 6px #10b981' : '0 0 6px #ef4444',
                }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: backendConnected ? '#10b981' : '#ef4444' }}>
                  {backendConnected ? 'API' : 'Offline'}
                </span>
              </div>
            </div>

            <nav style={{ display: 'flex', gap: 6 }}>
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`tab-btn ${activeTab === t.id ? 'tab-btn-active' : ''}`}>
                  <span>{t.icon}</span> <span>{t.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Active Tab Content Panel */}
          <div className="glass" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>
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

        </div>

      </div>
    </MediaPipeProvider>
  );
}
