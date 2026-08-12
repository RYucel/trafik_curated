import React from 'react';
import { Shield, Radio, Activity, Sparkles, FileText, Database, Info, MessageSquare, AlertCircle } from 'lucide-react';

export const Header = ({ activeTab, setActiveTab, monitorData }) => {
  const tabs = [
    { id: 'dashboard', label: 'Genel Gösterge Paneli', icon: Activity },
    { id: 'live2026', label: '2026 Can Kaybı Takibi', icon: Radio },
    { id: 'accidents', label: 'Kaza Arşivi', icon: Database },
    { id: 'history', label: '1975-2026 Tarihçe', icon: Sparkles },
    { id: 'map', label: 'Risk Haritası', icon: Shield },
    { id: 'reports', label: 'Rapor Oluşturucu', icon: FileText },
    { id: 'qa', label: 'Veri Asistanı', icon: MessageSquare },
    { id: 'methodology', label: 'Metodoloji', icon: Info },
    { id: 'admin', label: 'İnceleme Kuyruğu', icon: AlertCircle }
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      {/* Top Banner Disclaimer */}
      <div className="bg-rose-950/60 border-b border-rose-900/40 px-4 py-1.5 text-center text-xs text-rose-300 flex items-center justify-center gap-2 font-medium">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
        <span><strong>KKTC Trafik Kazalarını Önleme Derneği</strong> Kamu Yararına Bağımsız Trafik Güvenliği Veri ve İnceleme Platformu</span>
      </div>

      {/* Main Nav Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-900 flex items-center justify-center text-white shadow-lg shadow-rose-950/50">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-base text-white tracking-tight flex items-center gap-2">
                KKTC TRAFİK INTELLIGENCE
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  v2.0 (1975-2026)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Otomatik Kaza İzleme, Doğrulama & Analiz Platformu
              </div>
            </div>
          </div>

          {/* Quick Stat Badge */}
          {monitorData && (
            <div className="hidden lg:flex items-center gap-4 text-xs font-mono bg-slate-950 px-3.5 py-1.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400">2026 Can Kaybı: </span>
                <span className="font-bold text-rose-400">{monitorData.deaths || 31} Ölü</span>
              </div>
              <div className="w-px h-3 bg-slate-800"></div>
              <div>
                <span className="text-slate-400">Veri Dönemi: </span>
                <span className="text-slate-300 font-sans">31 Temmuz 2026</span>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-2 border-t border-slate-800/60 text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-rose-950/80 text-rose-200 border border-rose-800/80 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-rose-400' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
