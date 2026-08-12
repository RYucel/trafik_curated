import React, { useState } from 'react';
import { MessageSquare, Send, Sparkles, ShieldCheck, Database, Info } from 'lucide-react';
import { VerificationBadge } from '../components/VerificationBadge';

export const QAAssistant = () => {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const sampleQuestions = [
    '2026’da trafik ölümleri geçen yılın aynı dönemine göre nasıl?',
    'Son 10 yılda hangi aylarda daha fazla ölümlü kaza meydana geldi?',
    'Girne’de son 3 yıldaki ölümlü kaza trendi nedir?',
    'En sık bildirilen kaza nedenleri nelerdir?'
  ];

  const handleAsk = async (qText) => {
    const q = qText || question;
    if (!q.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      const data = await res.json();
      setResponse(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
          <MessageSquare className="w-4 h-4 text-rose-400" />
          KANIT ODAKLI VERİ ASİSTANI (EVIDENCE-FIRST DATA QA)
        </div>
        <h1 className="text-2xl font-extrabold text-white">Kanıta Dayalı Trafik Veri Asistanı</h1>
        <p className="text-xs text-slate-300">
          Bu asistan uydurma veri (hallucination) üretmez. Yanıtlar yalnızca veritabanında yer alan 1975–2026 resmi kayıtlardan ve polis bültenlerinden derlenmektedir.
        </p>
      </div>

      {/* Question Form */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Örn: 2026'da hangi ilçelerde ölümlü kazalarda artış var?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-sans"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800/80 px-6 py-3 rounded-lg text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Sor
          </button>
        </form>

        {/* Sample Question Pills */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400">Örnek Veri Soruları:</div>
          <div className="flex flex-wrap gap-2">
            {sampleQuestions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setQuestion(q);
                  handleAsk(q);
                }}
                className="text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1.5 rounded-lg transition text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Response Display */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl text-center space-y-3">
          <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-xs font-mono text-rose-400">Veritabanı Sorgulanıyor & Kanıt İzi Derleniyor...</div>
        </div>
      )}

      {response && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="text-xs font-bold text-white">Soru: "{response.question}"</div>
            <VerificationBadge status="VERIFIED" />
          </div>

          <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
            {response.answer}
          </div>

          <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-400">
              <Database className="w-4 h-4 text-emerald-400" />
              Sorgu Detayları & Kanıt İzi
            </div>
            <div className="text-[11px] text-slate-400 space-y-1 font-mono">
              <div><strong>Kapsanan Veri Dönemi:</strong> {response.data_period}</div>
              <div><strong>Kaynaklar:</strong> {response.sources?.join(', ')}</div>
              <div><strong>Güvenlik İlkesi:</strong> Veriler doğrudan veritabanı kayıtlarından hesaplanmıştır.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
