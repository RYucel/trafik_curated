import React from 'react';
import { X, ExternalLink, Calendar, MapPin, AlertOctagon, Car, ShieldCheck, FileText } from 'lucide-react';
import { VerificationBadge } from './VerificationBadge';

export const AccidentDetailModal = ({ accident, onClose }) => {
  if (!accident) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {accident.accident_id}
            </span>
            <VerificationBadge status={accident.verification_status} />
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
          <div>
            <h3 className="text-lg font-bold text-white mb-2 leading-snug">
              {accident.description_raw || accident.title}
            </h3>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-rose-400" />
                {accident.event_date} {accident.event_time ? `(${accident.event_time})` : ''}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                {accident.district} - {accident.road_normalized || accident.location_normalized}
              </span>
            </div>
          </div>

          {/* Key Stats Bar */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <div>
              <div className="text-xs text-slate-400 mb-1">Can Kaybı</div>
              <div className={`text-xl font-bold font-mono ${accident.death_count > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {accident.death_count} Ölü
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Yaralı Sayısı</div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {accident.injury_count} Yaralı
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Araç Tipi</div>
              <div className="text-xs font-semibold text-slate-200 mt-1">
                {Array.isArray(accident.vehicle_types) ? accident.vehicle_types.join(', ') : 'Otomobil'}
              </div>
            </div>
          </div>

          {/* Cause & Verification Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              Bildirilen Kaza Nedeni & Doğrulama Seviyesi
            </h4>
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800 text-xs leading-relaxed">
              <div className="mb-2">
                <span className="font-semibold text-slate-200">Kategori: </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-200">{accident.cause_category}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-200">Raporlanan Detay: </span>
                <span>{accident.reported_cause}</span>
              </div>
            </div>
          </div>

          {/* Source Provenance */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Kaynak Şeffaflığı & Doğrulama İzi
            </h4>
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-slate-200">{accident.source_name} ({accident.source_type})</div>
                <div className="text-slate-400 font-mono text-[11px]">Güven Puanı: %{Math.round((accident.confidence_score || 0.9) * 100)}</div>
              </div>
              {accident.source_url && (
                <a
                  href={accident.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-medium transition"
                >
                  Orijinal Habere Git <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
