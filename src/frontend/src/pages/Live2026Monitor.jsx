import React, { useState, useEffect } from 'react';
import { Calendar, Radio, AlertOctagon, ArrowUpRight, ShieldCheck, Info } from 'lucide-react';
import { VerificationBadge } from '../components/VerificationBadge';

export const Live2026Monitor = () => {
  const [monitor, setMonitor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/statistics/2026')
      .then(res => res.json())
      .then(data => {
        setMonitor(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading || !monitor) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-rose-400 font-mono text-sm">
        2026 Canlı Veri İzleyici Yükleniyor...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Title */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <Radio className="w-4 h-4 animate-pulse text-rose-500" />
          CANLI YIL İZLEME PANELİ (2026 LIVE TRAFFIC MONITOR)
        </div>
        <h1 className="text-2xl font-extrabold text-white">2026 Yılı Trafik Güvenliği Bilanço ve Karşılaştırması</h1>
        <p className="text-xs text-slate-300">
          Kısmi yıl verileri (Ocak – Temmuz 2026), önceki yılların tam verileriyle değil, yalnızca <strong>aynı kısmi dönemleriyle (Ocak – Temmuz)</strong> kıyaslanmaktadır.
        </p>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-rose-900/80 p-6 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider">2026 Can Kaybı</div>
          <div className="text-4xl font-extrabold font-mono text-rose-400">{monitor.deaths} Can</div>
          <div className="text-xs text-slate-400">Veri Dönemi: {monitor.data_period_label}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ölümlü Kaza</div>
          <div className="text-4xl font-extrabold font-mono text-white">{monitor.fatal_accidents} Kaza</div>
          <div className="text-xs text-slate-400">Resmi doğrulanmış vakalar</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">2025 Aynı Dönem</div>
          <div className="text-4xl font-extrabold font-mono text-amber-400">{monitor.same_period_2025.deaths} Can</div>
          <div className="text-xs text-slate-400">Ocak – Temmuz 2025</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Geçen Yıla Göre Değişim</div>
          <div className={`text-4xl font-extrabold font-mono ${monitor.yoy_change_pct >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {monitor.yoy_change_pct >= 0 ? '+' : ''}{monitor.yoy_change_pct}%
          </div>
          <div className="text-xs text-slate-400">Aynı döneme göre oran</div>
        </div>
      </div>

      {/* Partial Year Comparison Rules */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Info className="w-5 h-5 text-sky-400" />
          Kısmi Yıl (Partial-Year) Karşılaştırma Analizi
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <th className="p-3">Karşılaştırma Dönemi</th>
                <th className="p-3">Ölümlü Kaza</th>
                <th className="p-3">Can Kaybı</th>
                <th className="p-3">Yaralı Sayısı</th>
                <th className="p-3">2026'ya Göre Fark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr className="bg-rose-950/30 text-rose-200">
                <td className="p-3 font-bold font-sans">Ocak – Temmuz 2026 (Aktif YTD)</td>
                <td className="p-3">{monitor.fatal_accidents}</td>
                <td className="p-3 font-extrabold text-rose-400">{monitor.deaths}</td>
                <td className="p-3">{monitor.injuries}</td>
                <td className="p-3 font-bold text-rose-400">Referans Yıl</td>
              </tr>
              <tr className="text-slate-300">
                <td className="p-3 font-sans">Ocak – Temmuz 2025 (Geçen Yıl Aynı Dönem)</td>
                <td className="p-3">{monitor.same_period_2025.fatal_accidents}</td>
                <td className="p-3 text-amber-400">{monitor.same_period_2025.deaths}</td>
                <td className="p-3">{monitor.same_period_2025.injuries}</td>
                <td className="p-3 text-rose-400">+{monitor.deaths - monitor.same_period_2025.deaths} Ölüm (+%{monitor.yoy_change_pct})</td>
              </tr>
              <tr className="text-slate-300">
                <td className="p-3 font-sans">Ocak – Temmuz 2024 (2 Yıl Önce Aynı Dönem)</td>
                <td className="p-3">{monitor.same_period_2024.fatal_accidents}</td>
                <td className="p-3 text-amber-400">{monitor.same_period_2024.deaths}</td>
                <td className="p-3">{monitor.same_period_2024.injuries}</td>
                <td className="p-3 text-rose-400">+{monitor.deaths - monitor.same_period_2024.deaths} Ölüm</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
