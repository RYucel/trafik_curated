import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { PublicDashboard } from './pages/PublicDashboard';
import { Live2026Monitor } from './pages/Live2026Monitor';
import { AccidentArchive } from './pages/AccidentArchive';
import { HistoricalTimeline } from './pages/HistoricalTimeline';
import { RiskMap } from './pages/RiskMap';
import { ReportGenerator } from './pages/ReportGenerator';
import { QAAssistant } from './pages/QAAssistant';
import { Methodology } from './pages/Methodology';
import { AdminReviewQueue } from './pages/AdminReviewQueue';
import { Shield, ExternalLink, Heart } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [monitorData, setMonitorData] = useState(null);

  useEffect(() => {
    fetch('/api/statistics/2026')
      .then(res => res.json())
      .then(data => setMonitorData(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      {/* Institutional Header */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} monitorData={monitorData} />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <PublicDashboard />}
        {activeTab === 'live2026' && <Live2026Monitor />}
        {activeTab === 'accidents' && <AccidentArchive />}
        {activeTab === 'history' && <HistoricalTimeline />}
        {activeTab === 'map' && <RiskMap />}
        {activeTab === 'reports' && <ReportGenerator />}
        {activeTab === 'qa' && <QAAssistant />}
        {activeTab === 'methodology' && <Methodology />}
        {activeTab === 'admin' && <AdminReviewQueue />}
      </main>

      {/* Institutional Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-rose-950 border border-rose-800 flex items-center justify-center text-rose-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white">KKTC Trafik Intelligence Platformu</div>
              <div className="text-[11px] text-slate-400">
                KKTC Trafik Kazalarını Önleme Derneği için Bağımsız Veri ve Araştırma Hizmeti (1975–2026)
              </div>
            </div>
          </div>

          <div className="text-center md:text-right space-y-1 text-[11px]">
            <div>Resmi Kaynaklar: PGM Polis Basın Subaylığı • Başbakanlık DPÖ • TAK Ajansı</div>
            <div className="text-slate-400 font-mono">
              Doğrulanmış Son Veri Tarihi: 31 Temmuz 2026 | Sürüm: v2.0-Live
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
