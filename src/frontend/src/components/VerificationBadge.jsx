import React from 'react';
import { CheckCircle2, AlertTriangle, Cpu } from 'lucide-react';

export const VerificationBadge = ({ status, type = 'fact' }) => {
  if (type === 'ai_inference') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-950/80 text-purple-300 border border-purple-800/60">
        <Cpu className="w-3.5 h-3.5 text-purple-400" />
        AI ANALİZ / ÇIKARIM
      </span>
    );
  }

  if (status === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        DOĞRULANMIŞ VERİ
      </span>
    );
  }

  if (status === 'REPORTED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        HABERDEN BİLDİRİLEN
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
      BELİRSİZ / İNCELEMEDE
    </span>
  );
};
