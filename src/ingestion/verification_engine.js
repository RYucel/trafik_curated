import { getSourceTier } from './source_hierarchy.js';

export function evaluateVerificationStatus(accident, sources = []) {
  if (!accident.event_date || !accident.district) {
    return {
      status: 'INCOMPLETE',
      reason: 'Missing critical event_date or district information',
      requires_review: true
    };
  }

  // Check for conflicts across sources
  if (sources.length > 1) {
    const deaths = new Set();
    const injuries = new Set();
    const dates = new Set();

    for (const s of sources) {
      if (s.extracted_death_count !== null && s.extracted_death_count !== undefined) {
        deaths.add(s.extracted_death_count);
      }
      if (s.extracted_injury_count !== null && s.extracted_injury_count !== undefined) {
        injuries.add(s.extracted_injury_count);
      }
      if (s.published_at) {
        dates.add(s.published_at.substring(0, 10));
      }
    }

    if (deaths.size > 1 || injuries.size > 1) {
      return {
        status: 'CONFLICT',
        reason: `Discrepancy detected across sources (Deaths: ${Array.from(deaths).join(', ')}, Injuries: ${Array.from(injuries).join(', ')})`,
        requires_review: true
      };
    }
  }

  // Check tiers of sources
  const tiers = sources.map(s => getSourceTier(s.source_name).code);
  const hasTier1 = tiers.includes('TIER_1_OFFICIAL');
  const hasTier2 = tiers.includes('TIER_2_AGENCY');
  const tier3Count = tiers.filter(t => t === 'TIER_3_ESTABLISHED_MEDIA').length;

  if (hasTier1 || hasTier2) {
    return {
      status: 'VERIFIED',
      reason: 'Confirmed by official source or news agency (PGM / TAK)',
      requires_review: false
    };
  }

  if (tier3Count >= 2) {
    return {
      status: 'MEDIA_CORROBORATED',
      reason: 'Corroborated by multiple established media outlets',
      requires_review: false
    };
  }

  if (tier3Count === 1) {
    return {
      status: 'UNVERIFIED',
      reason: 'Reported by single media source, awaiting corroboration',
      requires_review: false
    };
  }

  return {
    status: 'UNVERIFIED',
    reason: 'Single or low-confidence source',
    requires_review: true
  };
}
