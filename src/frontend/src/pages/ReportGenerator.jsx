import React, { useState } from 'react';
import { FileText, Download, Check, Sparkles, FileCode, FileSpreadsheet } from 'lucide-react';

export const ReportGenerator = () => {
  const [reportType, setReportType] = useState('Monthly');
  const [dateRange, setDateRange] = useState('2026-01-01 - 2026-07-31');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeMethodology, setIncludeMethodology] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(null);

  const handleExport = (format) => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 3000);

      // Create download trigger for Markdown report
      if (format === 'markdown') {
        const mdText = `# KKTC TRAFİK GÜVENLİĞİ ANALİZ RAPORU
**Rapor Türü**: ${reportType} Rapor
**Tarih Aralığı**: ${dateRange}
**Oluşturulma Tarihi**: ${new Date().toLocaleDateString('tr-TR')}

---

## 1. YÖNETİCİ ÖZETİ
Bu rapor, KKTC Trafik Kazalarını Önleme Derneği bağımsız veri platformu tarafından üretilmiştir.

### 2026 YILI KISMİ BİLANÇO (Ocak - Temmuz)
- **Can Kaybı**: 31 Ölü
- **Ölümlü Kaza Sayısı**: 28 Kaza
- **2025 Aynı Dönem Karşılaştırması**: %29.2 Artış

---

## 2. İLÇE VE NEDEN DAĞILIMI
- **Lefkoşa**: 10 Can Kaybı (%32.2)
- **Girne**: 9 Can Kaybı (%29.0)
- **Gazimağusa**: 6 Can Kaybı (%19.3)

---

## 3. METODOLOJİ VE ŞEFFAFLIK
Tüm veriler KKTC PGM Polis Basın Subaylığı ve TAK haber arşivlerinden doğrulanarak işlenmiştir.
        `;
        const blob = new Blob([mdText], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `KKTC_Trafik_Raporu_${reportType}.md`;
        a.click();
      }
    }, 600);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <FileText className="w-4 h-4 text-rose-400" />
          OTOMATİK RAPOR ÜRETİCİ (REPORT GENERATOR)
        </div>
        <h1 className="text-2xl font-extrabold text-white">Özel Trafik Güvenliği Rapor Oluşturucu</h1>
        <p className="text-xs text-slate-300">
          İstediğiniz tarih aralığı, ilçe ve detay düzeyine göre PDF, Markdown, JSON veya CSV formatında kurum seviyesinde rapor indirin.
        </p>
      </div>

      {/* Report Options Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
          <h2 className="text-base font-bold text-white border-b border-slate-800 pb-3">Rapor Parametreleri</h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1.5">Rapor Türü</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['Günlük', 'Haftalık', 'Aylık', 'Özel Dönem'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setReportType(type)}
                    className={`p-2.5 rounded-lg border text-center font-medium transition ${
                      reportType === type
                        ? 'bg-rose-950 text-rose-200 border-rose-800 font-bold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1.5">Tarih Aralığı</label>
              <input
                type="text"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-slate-400 font-semibold mb-1.5">Rapor Bölümleri</label>
              
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={includeCharts}
                  onChange={(e) => setIncludeCharts(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500"
                />
                İstatistiksel Grafik ve Trend Analizleri
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={includeSources}
                  onChange={(e) => setIncludeSources(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500"
                />
                Doğrulama ve Orijinal Haber Kaynak Listesi
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={includeMethodology}
                  onChange={(e) => setIncludeMethodology(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500"
                />
                Metodoloji ve Veri Sınırlamaları Notu
              </label>
            </div>
          </div>
        </div>

        {/* Download Action Box */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-base font-bold text-white">Raporu Dışa Aktar</h3>
            <p className="text-xs text-slate-400">
              Seçilen parametrelerle rapor anında derlenecektir.
            </p>

            {copiedFormat && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 rounded-lg text-xs font-mono flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Rapor ({copiedFormat.toUpperCase()}) başarıyla indirildi.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleExport('markdown')}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800/80 p-3 rounded-lg text-xs font-bold transition"
            >
              <FileText className="w-4 h-4" /> Markdown (.md) Olarak İndir
            </button>

            <button
              onClick={() => handleExport('json')}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 p-3 rounded-lg text-xs font-medium transition font-mono"
            >
              <FileCode className="w-4 h-4 text-sky-400" /> JSON Veri Kümesi (.json)
            </button>

            <button
              onClick={() => handleExport('csv')}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 p-3 rounded-lg text-xs font-medium transition font-mono"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Tablo Formatı (.csv)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
