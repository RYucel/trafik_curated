import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, TrendingDown, ArrowRight, ShieldCheck } from 'lucide-react';

export const HistoricalTimeline = () => {
  const [yearlyData, setYearlyData] = useState([]);
  const [selectedDecade, setSelectedDecade] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/statistics/yearly')
      .then(r => r.json())
      .then(data => {
        setYearlyData(data || []);
        setLoading(false);
      });
  }, []);

  const decades = [
    { label: 'Tüm Yıllar (1975 - 2026)', value: 'ALL' },
    { label: '1975 - 1984 (İlk On Yıl)', start: 1975, end: 1984 },
    { label: '1985 - 1994', start: 1985, end: 1994 },
    { label: '1995 - 2004 (En Yüksek Yıllar)', start: 1995, end: 2004 },
    { label: '2005 - 2014', start: 2005, end: 2014 },
    { label: '2015 - 2024', start: 2015, end: 2024 },
    { label: '2025 - 2026 (Günümüz)', start: 2025, end: 2026 }
  ];

  const filteredData = yearlyData.filter(d => {
    if (selectedDecade === 'ALL') return true;
    const dec = decades.find(x => x.label === selectedDecade);
    if (!dec) return true;
    return d.year >= dec.start && d.year <= dec.end;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-rose-400" />
          50 YILLIK İSTATİSTİK ZAMAN ÇİZELGESİ (1975 → 2026)
        </div>
        <h1 className="text-2xl font-extrabold text-white">KKTC Trafik Kazaları Tarihsel Zaman Çizelgesi</h1>
        <p className="text-xs text-slate-300">
          Devlet Planlama Örgütü (DPÖ) ve PGM Polis Basın Subaylığı resmi istatistik raporlarından çıkarılan yarım asırlık kaza geçmişi.
        </p>

        {/* Decade Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-2">
          {decades.map(dec => (
            <button
              key={dec.label}
              onClick={() => setSelectedDecade(dec.label)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedDecade === dec.label
                  ? 'bg-rose-950 text-rose-200 border border-rose-800 font-semibold'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {dec.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredData.map(item => (
          <div
            key={item.year}
            className={`p-5 rounded-xl border transition ${
              item.year === 2026
                ? 'bg-rose-950/40 border-rose-800/80 shadow-lg shadow-rose-950/40'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <span className="text-xl font-extrabold font-mono text-white">{item.year}</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                {item.data_period}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Ölümlü Kaza:</span>
                <span className="font-bold text-white">{item.fatal_accidents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Can Kaybı:</span>
                <span className="font-bold text-rose-400 text-sm">{item.deaths} Ölü</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Yaralı Sayısı:</span>
                <span className="text-amber-400">{item.injured}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Toplam Kaza:</span>
                <span className="text-slate-300">{item.total_accidents}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                <span className="text-slate-400 font-sans">Şiddet İndeksi:</span>
                <span className="text-slate-300 font-bold">{item.deaths_per_fatal_accident} ölüm/kaza</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
