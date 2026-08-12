// Deterministic Traffic Keyword Pre-Filter
export const TRAFFIC_KEYWORDS = [
  'kaza', 'kazası', 'kazada', 'kazadan', 'kazaya', 'kazalar', 'kazaları',
  'trafik kazası', 'ölümlü kaza', 'yaralanmalı kaza', 'maddi hasarlı',
  'çarpışma', 'çarpıştı', 'çarpışarak', 'devrildi', 'takla attı',
  'hayatını kaybetti', 'yaşamını yitirdi', 'ölü', 'ölüm', 'ölüler',
  'yaralandı', 'yaralı', 'yaralılar', 'ağır yaralı',
  'sürücü', 'sürücüsü', 'direksiyon hakimiyeti',
  'araç', 'otomobil', 'motosiklet', 'yaya', 'kamyon', 'otobüs', 'minibüs',
  'polis basın subaylığı', 'pgm', 'yol kaza'
];

export function isCandidateTrafficArticle(title, description = '') {
  const combinedText = `${title} ${description}`.toLowerCase();
  
  let matchCount = 0;
  const matchedKeywords = [];

  for (const kw of TRAFFIC_KEYWORDS) {
    if (combinedText.includes(kw)) {
      matchCount++;
      matchedKeywords.push(kw);
    }
  }

  // Mandatory match criteria: at least 1 keyword match
  return {
    is_candidate: matchCount > 0,
    match_count: matchCount,
    matched_keywords: matchedKeywords,
    score: Math.min(1.0, matchCount * 0.2)
  };
}
