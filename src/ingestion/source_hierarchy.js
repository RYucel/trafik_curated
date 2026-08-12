export const SOURCE_TIERS = {
  TIER_1_OFFICIAL: {
    code: 'TIER_1_OFFICIAL',
    name: 'Official / Government',
    description: 'KKTC Police (PGM), DPÖ, Official Government Publications',
    weight: 1.0
  },
  TIER_2_AGENCY: {
    code: 'TIER_2_AGENCY',
    name: 'News Agency',
    description: 'TAK (Türk Ajansı Kıbrıs)',
    weight: 0.85
  },
  TIER_3_ESTABLISHED_MEDIA: {
    code: 'TIER_3_ESTABLISHED_MEDIA',
    name: 'Established Media',
    description: 'Kıbrıs Postası, Yenidüzen, Kıbrıs Gazetesi, Haber Kıbrıs',
    weight: 0.70
  },
  TIER_4_OTHER: {
    code: 'TIER_4_OTHER',
    name: 'Other / Secondary Media',
    description: 'Unverified social media, secondary aggregators, blogs',
    weight: 0.40
  }
};

export function getSourceTier(sourceName) {
  if (!sourceName) return SOURCE_TIERS.TIER_4_OTHER;

  const s = sourceName.toLowerCase();
  if (s.includes('polis') || s.includes('pgm') || s.includes('dpö') || s.includes('bakanlık')) {
    return SOURCE_TIERS.TIER_1_OFFICIAL;
  }
  if (s.includes('tak') || s.includes('türk ajansı')) {
    return SOURCE_TIERS.TIER_2_AGENCY;
  }
  if (s.includes('kıbrıs postası') || s.includes('yenidüzen') || s.includes('kıbrıs gazetesi') || s.includes('haber kıbrıs')) {
    return SOURCE_TIERS.TIER_3_ESTABLISHED_MEDIA;
  }
  return SOURCE_TIERS.TIER_4_OTHER;
}
