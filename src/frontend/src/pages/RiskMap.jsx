import React, { useState, useEffect } from 'react';
import { MapPin, ShieldAlert, AlertTriangle, Navigation, Route } from 'lucide-react';

export const RiskMap = () => {
  const [districts, setDistricts] = useState([]);

  useEffect(() => {
    fetch('/api/statistics/districts')
      .then(r => r.json())
      .then(d => setDistricts(d || []));
  }, []);

  const hotspots = [
    {
      road: 'Girne - Lefkoşa Anayolu',
      segment: 'Ciklos Mevkii & Boğaz Kavşağı',
      district: 'Girne / Lefkoşa',
      riskScore: 'YÜKSEK RİSK (8.8/10)',
      fatalCount: 14,
      commonCauses: 'Aşırı Sürat, Islak Zemin, Eğilimli Virajlar',
      recommendation: 'Hız kamerası denetimi ve bariyer yenileme önerilmektedir.'
    },
    {
      road: 'Lefkoşa - Gazimağusa Anayolu',
      segment: 'Haspolat Çemberi & Minareliköy Kavşağı',
      district: 'Lefkoşa',
      riskScore: 'YÜKSEK RİSK (8.4/10)',
      fatalCount: 11,
      commonCauses: 'Kavşakta Yol Hakkı İhlali, Gece Aydınlatma Yetersizliği',
      recommendation: 'Akıllı çember düzenlemesi ve sinyalizasyon artırılmalıdır.'
    },
    {
      road: 'Gazimağusa - İskele Anayolu',
      segment: 'Yeniboğaziçi Çemberi - Salamis Yolu',
      district: 'Gazimağusa / İskele',
      riskScore: 'ORTA-YÜKSEK (7.6/10)',
      fatalCount: 8,
      commonCauses: 'Hatalı Sollama, Şerit İhlali',
      recommendation: 'Bölünmüş yol çalışmaları tamamlanmalıdır.'
    },
    {
      road: 'Bedrettin Demirel Caddesi',
      segment: 'Dereboyu & Başbakanlık Işıkları',
      district: 'Lefkoşa',
      riskScore: 'ORTA RİSK (6.9/10)',
      fatalCount: 5,
      commonCauses: 'Yaya Çarpmaları, Dikkatsiz Sürüş',
      recommendation: 'Yaya geçitleri ışıklandırılmalı ve hız kasisleri artırılmalıdır.'
    }
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <Navigation className="w-4 h-4 text-rose-400" />
          TRAFİK RİSK VE HOTSPOT ANALİZİ
        </div>
        <h1 className="text-2xl font-extrabold text-white">KKTC Trafik Risk Haritası ve Kaza Yoğunlaşma Noktaları</h1>
        <p className="text-xs text-slate-300">
          Kaza yoğunluğu, yol segmenti tehlike puanı ve ölümlü vakaların ilçe/yol bazlı dağılımı.
        </p>
      </div>

      {/* Interactive Map Visual Mockup Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden min-h-[340px] flex flex-col justify-between">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#f43f5e_1px,transparent_1px)] [background-size:16px_16px]"></div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Route className="w-4 h-4 text-rose-400" />
            KKTC Karayolları Yoğunluk Katmanı
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Yüksek Risk</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Orta Risk</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Düşük Yoğunluk</span>
          </div>
        </div>

        {/* District Risk Tiles Visualiser */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 my-6">
          {districts.map((d) => (
            <div key={d.district} className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-center space-y-1">
              <div className="text-xs font-bold text-white">{d.district}</div>
              <div className="text-xl font-extrabold font-mono text-rose-400">{d.total_deaths} Can</div>
              <div className="text-[10px] text-slate-400 font-mono">{d.fatal_accidents} ölümlü kaza</div>
            </div>
          ))}
        </div>

        <div className="relative z-10 text-center text-xs text-slate-400 border-t border-slate-800/60 pt-3">
          * Konum koordinatları polis kaza yeri inceleme verilerine dayanmaktadır.
        </div>
      </div>

      {/* Hotspots Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
          Yüksek Riskli Yol Segmentleri (Hotspots)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hotspots.map((hs, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{hs.road}</h3>
                  <div className="text-xs text-rose-400 font-mono font-semibold">{hs.segment}</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[11px] font-mono font-bold">
                  {hs.riskScore}
                </span>
              </div>

              <div className="text-xs text-slate-300 space-y-1 font-sans">
                <div><span className="font-semibold text-slate-400">İlçe:</span> {hs.district}</div>
                <div><span className="font-semibold text-slate-400">Ölüm Sayısı:</span> <span className="font-mono text-rose-400 font-bold">{hs.fatalCount} Ölü</span></div>
                <div><span className="font-semibold text-slate-400">Sık Bildirilen Nedenler:</span> {hs.commonCauses}</div>
              </div>

              <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80 text-[11px] text-slate-300">
                <strong className="text-amber-400">Öneri: </strong>{hs.recommendation}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
