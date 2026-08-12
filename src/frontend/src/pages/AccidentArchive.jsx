import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, MapPin, Eye, ExternalLink, ShieldCheck } from 'lucide-react';
import { VerificationBadge } from '../components/VerificationBadge';
import { AccidentDetailModal } from '../components/AccidentDetailModal';

export const AccidentArchive = () => {
  const [accidents, setAccidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [district, setDistrict] = useState('');
  const [year, setYear] = useState('');
  const [verification, setVerification] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedAccident, setSelectedAccident] = useState(null);

  useEffect(() => {
    fetchAccidents();
  }, [page, district, year, verification]);

  const fetchAccidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 15,
        ...(district && { district }),
        ...(year && { year }),
        ...(verification && { verification }),
        ...(search && { search })
      });
      const res = await fetch(`/api/accidents?${params.toString()}`);
      const data = await res.json();
      setAccidents(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchAccidents();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
        <h1 className="text-2xl font-extrabold text-white">Detaylı Trafik Kazaları Arşivi</h1>
        <p className="text-xs text-slate-300">
          2024–2026 yılları arasında PGM Polis Raporları, TAK Ajansı haberleri ve doğrulanmış yayınlardan derlenen tüm kaza kayıtları.
        </p>

        {/* Filter Controls */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Konum veya haber ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <select
            value={district}
            onChange={(e) => { setDistrict(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
          >
            <option value="">Tüm İlçeler</option>
            <option value="Lefkoşa">Lefkoşa</option>
            <option value="Girne">Girne</option>
            <option value="Gazimağusa">Gazimağusa</option>
            <option value="İskele">İskele</option>
            <option value="Güzelyurt">Güzelyurt</option>
            <option value="Lefke">Lefke</option>
          </select>

          <select
            value={year}
            onChange={(e) => { setYear(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
          >
            <option value="">Tüm Yıllar</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          <select
            value={verification}
            onChange={(e) => { setVerification(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
          >
            <option value="">Tüm Doğrulama Durumları</option>
            <option value="VERIFIED">Doğrulanmış (Verified)</option>
            <option value="REPORTED">Haberden Bildirilen</option>
          </select>

          <button
            type="submit"
            className="bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800/80 rounded-lg px-4 py-2 text-xs font-semibold transition"
          >
            Filtrele & Ara
          </button>
        </form>
      </div>

      {/* Accidents Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/80 uppercase tracking-wider font-semibold">
                <th className="p-4">Kaza ID / Tarih</th>
                <th className="p-4">İlçe / Yol</th>
                <th className="p-4">Açıklama</th>
                <th className="p-4">Bilanço</th>
                <th className="p-4">Neden</th>
                <th className="p-4">Doğrulama</th>
                <th className="p-4 text-right">İncele</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400 font-mono">
                    Kaza arşivi verileri getiriliyor...
                  </td>
                </tr>
              ) : accidents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400">
                    Arama kriterlerine uygun kaza kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                accidents.map((acc) => (
                  <tr key={acc.accident_id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 font-mono">
                      <div className="font-bold text-white">{acc.accident_id}</div>
                      <div className="text-[11px] text-slate-400">{acc.event_date}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-white">{acc.district}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{acc.road_normalized || acc.location_normalized}</div>
                    </td>
                    <td className="p-4 max-w-xs truncate text-slate-200">
                      {acc.description_raw || acc.title}
                    </td>
                    <td className="p-4 font-mono">
                      <span className={`font-bold ${acc.death_count > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {acc.death_count} Ölü
                      </span>
                      <span className="text-slate-400 ml-2">/ {acc.injury_count} Yaralı</span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                        {acc.cause_category}
                      </span>
                    </td>
                    <td className="p-4">
                      <VerificationBadge status={acc.verification_status} />
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedAccident(acc)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Detay
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div>
            Sayfa <span className="font-mono font-bold text-white">{page}</span> / <span className="font-mono">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition"
            >
              Önceki
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedAccident && (
        <AccidentDetailModal
          accident={selectedAccident}
          onClose={() => setSelectedAccident(null)}
        />
      )}
    </div>
  );
};
