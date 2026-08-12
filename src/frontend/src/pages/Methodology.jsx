import React from 'react';
import { Info, ShieldCheck, Database, Layers, Cpu, AlertTriangle } from 'lucide-react';
import { VerificationBadge } from '../components/VerificationBadge';

export const Methodology = () => {
  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <Info className="w-4 h-4 text-rose-400" />
          VERİ VE METODOLOJİ ŞEFFAFLIĞI (METHODOLOGY & TRANSPARENCY)
        </div>
        <h1 className="text-2xl font-extrabold text-white">Platform Metodolojisi ve Veri İlkeleri</h1>
        <p className="text-xs text-slate-300">
          KKTC Trafik Intelligence platformunun veri toplama, doğrulama, tekilleştirme (deduplication) ve yapay zeka kullanım standartları.
        </p>
      </div>

      {/* 3 Classes of Data */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          1. Üç Farklı Bilgi Sınıfı İlkeleri
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-900 border border-emerald-900/60 p-5 rounded-xl space-y-2">
            <VerificationBadge status="VERIFIED" />
            <h3 className="font-bold text-white text-sm pt-1">A. DOĞRULANMIŞ VERİ (VERIFIED FACT)</h3>
            <p className="text-slate-300 leading-relaxed">
              Polis Basın Subaylığı veya Devlet Planlama Örgütü (DPÖ) gibi resmi otorite raporlarında yer alan kesin olgular (tarih, ölü sayısı, kaza yeri).
            </p>
          </div>

          <div className="bg-slate-900 border border-amber-900/60 p-5 rounded-xl space-y-2">
            <VerificationBadge status="REPORTED" />
            <h3 className="font-bold text-white text-sm pt-1">B. HABERDEN BİLDİRİLEN (REPORTED INFO)</h3>
            <p className="text-slate-300 leading-relaxed">
              Basın yayın kuruluşları tarafından aktarılan ancak henüz polis raporuyla kesinleşmemiş haber detayları (iddia edilen nedenler, tanık ifadeleri).
            </p>
          </div>

          <div className="bg-slate-900 border border-purple-900/60 p-5 rounded-xl space-y-2">
            <VerificationBadge type="ai_inference" />
            <h3 className="font-bold text-white text-sm pt-1">C. AI ANALİZİ / ÇIKARIM (AI INFERENCE)</h3>
            <p className="text-slate-300 leading-relaxed">
              Yapay zeka tarafından üretilen eğilim analizleri, kalıp tespitleri veya risk odakları. Kesinlikle olgu olarak sunulmaz, açıkça etiketlenir.
            </p>
          </div>
        </div>
      </div>

      {/* Source Hierarchy */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 text-xs">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-400" />
          2. Kaynak Hiyerarşisi (Source Hierarchy)
        </h2>

        <div className="space-y-3 text-slate-300">
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
            <strong className="text-white">Tier 1 (Resmi Kurumlar): </strong>
            KKTC PGM Polis Basın Subaylığı, Başbakanlık DPÖ, Sağlık Bakanlığı resmi verileri.
          </div>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
            <strong className="text-white">Tier 2 (Kurumsal Basın): </strong>
            TAK (Türk Ajansı Kıbrıs) ve kurulmuş ana akım gazete/ajans yayınları.
          </div>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
            <strong className="text-white">Tier 3 (İkincil Kaynaklar): </strong>
            Diğer dijital haber portalı yayınları.
          </div>
        </div>
      </div>

      {/* AI Safety Rules */}
      <div className="bg-slate-900 border border-rose-900/60 p-6 rounded-xl space-y-4 text-xs">
        <h2 className="text-base font-bold text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          3. Kesin AI Güvenlik Kuralları (AI Safety Rules)
        </h2>

        <ul className="list-disc list-inside space-y-2 text-slate-300 leading-relaxed">
          <li>Sistem asla kaza detayı, kişi ismi, polis ifadesi veya kaza yeri <strong>uyduramaz (hallucination yasaktır)</strong>.</li>
          <li>Kaza nedeni polis raporunda kesinleştirilmemişse kategori <code className="bg-slate-950 px-1 py-0.5 rounded text-rose-300">UNKNOWN</code> olarak bırakılır.</li>
          <li>Farklı haber kaynaklarında ölü sayısında çelişki tespit edildiğinde sistem karar vermez, kaydı <strong>İnceleme Kuyruğuna (Review Queue)</strong> yönlendirir.</li>
        </ul>
      </div>
    </div>
  );
};
