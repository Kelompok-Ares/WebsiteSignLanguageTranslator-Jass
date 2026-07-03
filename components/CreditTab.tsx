'use client';

import React from 'react';
import { User, Globe, Mail, Code, ExternalLink } from 'lucide-react';

export default function CreditTab() {
  return (
    <div className="tab-container">
      <div className="tab-content flex-col gap-lg">

        {/* Jass Profile */}
        <div className="settings-section">
          <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code size={18} /> Lead Developer
          </div>
          <div className="settings-card">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E8E 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0
              }}>
                <User size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Jass</h3>
                <p className="label-text" style={{ margin: '0 0 12px 0' }}>AI Architect & Backend Developer</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href="https://github.com/JazzIsOnTheBeat" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding: '6px 12px' }}>
                    <Globe size={14} /> GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dims Profile */}
        <div className="settings-section">
          <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExternalLink size={18} /> UI/UX Designer
          </div>
          <div className="settings-card">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #4DABF7 0%, #74C0FC 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0
              }}>
                <User size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Dims</h3>
                <p className="label-text" style={{ margin: '0 0 12px 0' }}>Frontend Developer & UI/UX</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" style={{ padding: '6px 12px' }}>
                    <Mail size={14} /> Contact
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 'auto',
          padding: '24px',
          textAlign: 'center',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-hover)'
        }}>
          <p className="label-text" style={{ margin: 0, lineHeight: 1.6 }}>
            "Bridging the communication gap through artificial intelligence and accessible design."
          </p>
        </div>

      </div>
    </div>
  );
}
