import React, { useState, useEffect } from 'react';
import { AlertOctagon, CheckCircle2, XCircle, Edit3, Cpu, Activity, ShieldCheck, RefreshCw } from 'lucide-react';

export const AdminReviewQueue = () => {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review-queue');
      const data = await res.json();
      setQueue(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      const res = await fetch(`/api/review-queue/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewer: 'Dernek Editörü' })
      });
      if (res.ok) {
        setActionSuccess(`Vaka #${id} başarıyla '${action.toUpperCase()}' durumuna getirildi.`);
        setTimeout(() => setActionSuccess(null), 3000);
        fetchQueue();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <AlertOctagon className="w-4 h-4 text-rose-400" />
          YÖNETİCİ & İNCELEME KUYRUĞU (ADMIN REVIEW QUEUE)
        </div>
        <h1 className="text-2xl font-extrabold text-white">Çelişkili Vakalar ve İnceleme Yönetimi</h1>
        <p className="text-xs text-slate-300">
          Otomatik deduplikasyon ve doğrulama ajanları tarafından tespit edilen çelişkili veya belirsiz kayıtlar insan editör onayına sunulur.
        </p>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {actionSuccess}
        </div>
      )}

      {/* Review Queue Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">İnceleme Bekleyen Vakalar ({queue.filter(q => q.status === 'PENDING').length})</h2>
          <button
            onClick={fetchQueue}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition font-mono"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Yenile
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-slate-400 bg-slate-900 rounded-xl border border-slate-800">
            Kuyruk verileri yükleniyor...
          </div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 rounded-xl border border-slate-800">
            Şu anda inceleme bekleyen vaka bulunmamaktadır.
          </div>
        ) : (
          queue.map((item) => (
            <div key={item.review_id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-950 border border-rose-900">
                      {item.issue_type}
                    </span>
                    <span className="text-xs font-mono text-slate-400">Eşleşme Güveni: {item.match_confidence}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                  item.status === 'PENDING' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {item.status}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                {item.description}
              </p>

              {/* Source Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-400">Kaynak A:</div>
                  <div className="text-white font-mono">{item.source_a}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-400">Kaynak B:</div>
                  <div className="text-white font-mono">{item.source_b}</div>
                </div>
              </div>

              {/* Actions */}
              {item.status === 'PENDING' && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800 text-xs">
                  <button
                    onClick={() => handleAction(item.review_id, 'approved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 font-semibold transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Kaynak A'yı Onayla
                  </button>

                  <button
                    onClick={() => handleAction(item.review_id, 'resolved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-800 font-semibold transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Birleştir (Merge)
                  </button>

                  <button
                    onClick={() => handleAction(item.review_id, 'rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 font-semibold transition"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reddet
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Agent Observability Log */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          Ajan Çalışma Durumu & İzlenebilirlik Logları (Agent Observability)
        </h3>

        <div className="space-y-2 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-slate-300">
            <div>
              <span className="font-bold text-white">Traffic Research Agent</span> (Web Search & Official Feed)
            </div>
            <span className="text-emerald-400">STATUS: ACTIVE (06:00 Cron)</span>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-slate-300">
            <div>
              <span className="font-bold text-white">Deduplication & Verification Agent</span> (Deterministic + AI Match)
            </div>
            <span className="text-emerald-400">STATUS: ACTIVE (06:30 Cron)</span>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-slate-300">
            <div>
              <span className="font-bold text-white">Daily Bulletin & Telegram Publisher</span> (Automated Broadcast)
            </div>
            <span className="text-emerald-400">STATUS: ACTIVE (08:00 Cron)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
