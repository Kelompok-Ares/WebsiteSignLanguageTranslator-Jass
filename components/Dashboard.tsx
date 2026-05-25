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

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) setDataset(saved);
  }, []);

  const updateDataset = useCallback((next: DatasetState) => {
    setDataset(next);
    saveToStorage(next);
  }, []);

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
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Sign Language Translator (Prototype)</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>By Ares Team</div>
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
              <DetectionTab model={model} modelTrained={modelTrained} />
            )}
            {activeTab === 'trainer' && (
              <TrainerTab
                dataset={dataset}
                onDatasetChange={updateDataset}
                model={model}
                onModelTrained={() => setModelTrained(true)}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsTab
                dataset={dataset}
                onDatasetChange={updateDataset}
                model={model}
                modelTrained={modelTrained}
                onModelTrained={() => setModelTrained(true)}
              />
            )}
          </div>

        </div>

      </div>
    </MediaPipeProvider>
  );
}
