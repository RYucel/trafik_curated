import crypto from 'crypto';
import { LLMProvider } from '../lib/llm_provider.js';
import { executeDb, queryDb } from '../lib/db.js';
import { getSourceTier } from './source_hierarchy.js';
import { evaluateVerificationStatus } from './verification_engine.js';

function generateHash(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function normalizeIsoDate(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const text = String(candidate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().substring(0, 10);
  }
  return new Date().toISOString().substring(0, 10);
}

export class AccidentExtractor {
  constructor() {
    this.llm = new LLMProvider();
  }

  async extractAccidentFromArticle(article, fullContent) {
    const textToAnalyze = fullContent || article.content || article.description || article.title;

    const prompt = `Extract structured traffic accident details from the following KKTC news article text.

Article Title: ${article.title}
Source: ${article.source_name}
Publication Date: ${article.published_at}
Text:
${textToAnalyze}

Instructions:
1. FIRST, determine the record_type:
   - "INDIVIDUAL_ACCIDENT": Reports a specific individual accident event.
   - "AGGREGATE_TRAFFIC_STATISTICS": Reports periodic/weekly summary totals (e.g., "71 accidents, 27 injured, 1 death in past week").
   - "GENERAL_TRAFFIC_NEWS": General news, law changes, road safety warnings.

2. IF record_type IS "AGGREGATE_TRAFFIC_STATISTICS":
   Extract aggregate totals ONLY. DO NOT create fake individual events.

3. IF record_type IS "INDIVIDUAL_ACCIDENT":
   Extract event details where explicitly stated. Unknown fields = null. DO NOT GUESS.
   Districts MUST be one of: Lefkoşa, Girne, Gazimağusa, İskele, Güzelyurt, Lefke.

Return strictly JSON:
{
  "record_type": "INDIVIDUAL_ACCIDENT" | "AGGREGATE_TRAFFIC_STATISTICS" | "GENERAL_TRAFFIC_NEWS",
  "event_date": "YYYY-MM-DD" | null,
  "event_time": "HH:MM" | null,
  "district": "Lefkoşa" | "Girne" | "Gazimağusa" | "İskele" | "Güzelyurt" | "Lefke" | null,
  "location_raw": string | null,
  "location_normalized": string | null,
  "road_raw": string | null,
  "road_normalized": string | null,
  "fatal": boolean,
  "death_count": integer,
  "injury_count": integer,
  "total_accidents_aggregate": integer | null,
  "reported_cause": string | null,
  "cause_category": string,
  "vehicle_types": array of strings,
  "confidence": number (0.0 to 1.0)
}`;

    try {
      const responseText = await this.llm.generateText(prompt, { temperature: 0.1 });
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (!extracted) {
        throw new Error('Failed to parse structured accident JSON from LLM');
      }

      const recordType = extracted.record_type || 'INDIVIDUAL_ACCIDENT';
      const sourceTierInfo = getSourceTier(article.source_name);
      const sourceTier = sourceTierInfo.code;

      if (extracted.requires_llm_extraction) {
        console.warn(`[AccidentExtractor] Structured extraction deferred for article ${article.id}: no LLM provider configured.`);
        executeDb(
          "UPDATE news_articles SET processing_status = 'REVIEW_REQUIRED', error_message = 'LLM extraction provider not configured' WHERE id = ?",
          [article.id]
        );

        const reviewAccidentId = `NEWS-${article.id}`;
        const existingReview = queryDb(
          "SELECT review_id FROM review_queue WHERE accident_id = ? AND status = 'PENDING' LIMIT 1",
          [reviewAccidentId]
        );
        if (existingReview.length === 0) {
          executeDb(`
            INSERT INTO review_queue (
              accident_id, issue_type, title, description, status, match_confidence, source_a, source_b, details_json
            ) VALUES (?, 'LLM_EXTRACTION_UNAVAILABLE', ?, ?, 'PENDING', 'HIGH', ?, '', ?)
          `, [
            reviewAccidentId,
            `Yapılandırılmış çıkarım incelemesi: ${article.title}`,
            'LLM sağlayıcısı yapılandırılmadığı için trafik adayı otomatik olarak olay kaydına dönüştürülmedi.',
            article.source_name,
            JSON.stringify({ article_id: article.id, url: article.url, published_at: article.published_at })
          ]);
        }
        return {
          status: 'REVIEW_REQUIRED',
          record_type: recordType,
          reason: 'LLM extraction provider not configured'
        };
      }

      if (recordType === 'AGGREGATE_TRAFFIC_STATISTICS') {
        console.log(`[AccidentExtractor] Extracted AGGREGATE TRAFFIC STATISTICS report from "${article.title}"`);
        executeDb("UPDATE news_articles SET processing_status = 'EXTRACTED_AGGREGATE' WHERE id = ?", [article.id]);
        return { status: 'AGGREGATE_REPORT', record_type: 'AGGREGATE_TRAFFIC_STATISTICS', extracted };
      }

      if (recordType === 'GENERAL_TRAFFIC_NEWS') {
        console.log(`[AccidentExtractor] Rejected non-accident article "${article.title}" after structured extraction`);
        executeDb(
          "UPDATE news_articles SET processing_status = 'REJECTED', traffic_relevance = 0, error_message = NULL WHERE id = ?",
          [article.id]
        );
        return { status: 'NOT_ACCIDENT', record_type: 'GENERAL_TRAFFIC_NEWS', extracted };
      }

      // Default date to article date if missing
      const eventDate = normalizeIsoDate(extracted.event_date, article.published_at);
      const district = extracted.district || 'Lefkoşa';
      const fatal = extracted.fatal ? 1 : (extracted.death_count > 0 ? 1 : 0);
      const deathCount = extracted.death_count || 0;
      const injuryCount = extracted.injury_count || 0;

      // 1. Perform Deduplication Check against existing database
      const existingMatches = queryDb(`
        SELECT * FROM accidents 
        WHERE event_date = ? AND district = ?
      `, [eventDate, district]);

      let matchedAccident = null;
      let highestScore = 0.0;

      for (const candidate of existingMatches) {
        let score = 0.5; // Base date + district match
        if (candidate.road_normalized && extracted.road_normalized && candidate.road_normalized === extracted.road_normalized) {
          score += 0.3;
        }
        if (candidate.death_count === deathCount) {
          score += 0.15;
        }
        if (candidate.injury_count === injuryCount) {
          score += 0.05;
        }

        if (score > highestScore) {
          highestScore = score;
          matchedAccident = candidate;
        }
      }

      if (highestScore >= 0.85 && matchedAccident) {
        // MATCH FOUND: Attach source provenance to existing accident record (DO NOT create duplicate accident)
        console.log(`[AccidentExtractor] Matched existing accident ${matchedAccident.accident_id} (Match Score: ${highestScore})`);

        // Check for Source Conflict (e.g. differing death/injury counts)
        if (matchedAccident.death_count !== deathCount || matchedAccident.injury_count !== injuryCount) {
          console.warn(`[AccidentExtractor] CONFLICT DETECTED for ${matchedAccident.accident_id}!`);

          executeDb(`
            UPDATE accidents SET verification_status = 'CONFLICT', publication_approval_status = 'DRAFT' WHERE accident_id = ?
          `, [matchedAccident.accident_id]);

          executeDb(`
            INSERT INTO review_queue (
              accident_id, issue_type, title, description, status, match_confidence, source_a, source_b, details_json
            ) VALUES (?, 'CONFLICTING_DEATH_COUNT', ?, ?, 'PENDING', ?, ?, ?, ?)
          `, [
            matchedAccident.accident_id,
            `Can Kaybı / Yaralı Sayısı Çelişkisi (${article.source_name})`,
            `Mevcut kayıt: ${matchedAccident.death_count} ölü, ${matchedAccident.injury_count} yaralı (${matchedAccident.source_tier}). Yeni kaynak (${article.source_name} - ${sourceTier}): ${deathCount} ölü, ${injuryCount} yaralı.`,
            highestScore >= 0.9 ? 'HIGH' : 'MEDIUM',
            `${matchedAccident.source_name} (${matchedAccident.death_count} Ölü, ${matchedAccident.injury_count} Yaralı)`,
            `${article.source_name} (${deathCount} Ölü, ${injuryCount} Yaralı)`,
            JSON.stringify({ new_source_url: article.url, extracted_data: extracted, source_tier: sourceTier })
          ]);
        }

        // Add source provenance record
        executeDb(`
          INSERT INTO accident_sources (
            accident_id, source_tier, source_name, source_url, published_at,
            extracted_death_count, extracted_injury_count, extracted_cause, raw_snippet
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          matchedAccident.accident_id, sourceTier, article.source_name, article.url, article.published_at,
          deathCount, injuryCount, extracted.reported_cause || '', article.title
        ]);

        executeDb("UPDATE news_articles SET processing_status = 'EXTRACTED' WHERE id = ?", [article.id]);

        return { status: 'ATTACHED_EXISTING', accident_id: matchedAccident.accident_id, match_score: highestScore };

      } else {
        // NEW ACCIDENT RECORD
        const newAccidentId = `ACC-${eventDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
        const dt = new Date(eventDate);
        const year = dt.getFullYear() || 2026;
        const month = dt.getMonth() + 1 || 8;
        const dayOfWeek = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][dt.getDay()] || 'Çarşamba';

        const contentHash = generateHash(`${newAccidentId}_${eventDate}_${article.title}`);

        // Evaluate Deterministic Verification
        const verResult = evaluateVerificationStatus(
          { event_date: eventDate, district },
          [{ source_name: article.source_name, extracted_death_count: deathCount, extracted_injury_count: injuryCount, published_at: article.published_at }]
        );

        const approvalStatus = verResult.status === 'VERIFIED' ? 'APPROVED' : 'DRAFT';

        executeDb(`
          INSERT INTO accidents (
            accident_id, event_date, event_time, year, month, day_of_week, district,
            location_raw, location_normalized, road_raw, road_normalized,
            fatal, death_count, injury_count, vehicle_types, reported_cause,
            cause_category, cause_confidence, description_raw, description_normalized,
            source_type, source_tier, source_name, source_url, source_date, record_type, verification_status,
            publication_approval_status, confidence_score, content_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          newAccidentId, eventDate, extracted.event_time || '12:00', year, month, dayOfWeek, district,
          extracted.location_raw || district, extracted.location_normalized || district,
          extracted.road_raw || 'Anayol', extracted.road_normalized || 'Anayol',
          fatal, deathCount, injuryCount, JSON.stringify(extracted.vehicle_types || ['Otomobil']),
          extracted.reported_cause || article.title, extracted.cause_category || 'UNKNOWN',
          extracted.confidence || 0.85, article.title, textToAnalyze.substring(0, 500),
          'Established Media', sourceTier, article.source_name, article.url, article.published_at,
          recordType, verResult.status, approvalStatus, extracted.confidence || 0.85, contentHash
        ]);

        // Insert Source Provenance
        executeDb(`
          INSERT INTO accident_sources (
            accident_id, source_tier, source_name, source_url, published_at,
            extracted_death_count, extracted_injury_count, extracted_cause, raw_snippet
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          newAccidentId, sourceTier, article.source_name, article.url, article.published_at,
          deathCount, injuryCount, extracted.reported_cause || '', article.title
        ]);

        executeDb("UPDATE news_articles SET processing_status = 'EXTRACTED' WHERE id = ?", [article.id]);

        return { status: 'NEW_RECORD', accident_id: newAccidentId, match_score: 0.0, verification_status: verResult.status };
      }

    } catch (err) {
      console.error(`[AccidentExtractor] Extraction error for article ${article.id}: ${err.message}`);
      executeDb("UPDATE news_articles SET processing_status = 'ERROR', error_message = ? WHERE id = ?", [err.message, article.id]);
      return { status: 'ERROR', error: err.message };
    }
  }
}
