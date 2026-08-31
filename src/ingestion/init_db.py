import sys
import os
import json
import sqlite3
import hashlib
import random
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "db", "kktc_traffic.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "db", "schema.sql")

DISTRICTS = ['Lefkoşa', 'Girne', 'Gazimağusa', 'İskele', 'Güzelyurt', 'Lefke']

DISTRICT_ROADS = {
    'Lefkoşa': ['Girne-Lefkoşa Anayolu', 'Lefkoşa-Gazimağusa Anayolu', 'Dr. Fazıl Küçük Bulvarı', 'Bedrettin Demirel Caddesi', 'Gönyeli Çemberi', 'Haspolat Çemberi'],
    'Girne': ['Girne-Lefkoşa Anayolu', 'Girne-Güzelyurt Anayolu', 'Karaoğlanoğlu Caddesi', 'Alsancak Anayolu', 'Çatalköy Anayolu', 'Girne Çevre Yolu'],
    'Gazimağusa': ['Lefkoşa-Gazimağusa Anayolu', 'Gazimağusa-İskele Anayolu', 'İsmet İnönü Bulvarı', 'Doğu Akdeniz Üniversitesi Yolu'],
    'İskele': ['Gazimağusa-İskele Anayolu', 'İskele-Ercan Anayolu', 'Karpaz Anayolu', 'Bafra Turizm Yolu'],
    'Güzelyurt': ['Lefkoşa-Güzelyurt Anayolu', 'Girne-Güzelyurt Anayolu', 'Güzelyurt-Lefke Anayolu'],
    'Lefke': ['Güzelyurt-Lefke Anayolu', 'Gemikonağı Anayolu', 'LAÜ Kampüs Yolu']
}

CAUSES = [
    ('SPEED', 'Aşırı Hız ve Dikkatsizlik', 0.35),
    ('DRUNK_DRIVING', 'Alkol Etkisinde Araç Kullanma', 0.20),
    ('DISTRACTED_DRIVING', 'Cep Telefonu / Dikkatsiz Sürüş', 0.15),
    ('FAILURE_TO_GIVE_WAY', 'Kavşakta Yol Hakkına Uymama', 0.10),
    ('WRONG_SIDE', 'Şerit İhlali / Ters Yön', 0.08),
    ('LOSS_OF_CONTROL', 'Direksiyon Hakimiyetini Kaybetme', 0.07),
    ('MOTORCYCLE', 'Motosiklet Sürücüsü Kural İhlali', 0.03),
    ('PEDESTRIAN', 'Yaya Kural İhlali', 0.02)
]

def generate_hash(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def init_database():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Read schema
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
    cursor.executescript(schema_sql)

    # 1. Populate Historical Statistics (1975-2025 PDF)
    hist_json_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "historical_1975_2025.json")
    if os.path.exists(hist_json_path):
        with open(hist_json_path, 'r', encoding='utf-8') as f:
            hist_records = json.load(f)

        for rec in hist_records:
            cursor.execute("""
                INSERT OR REPLACE INTO historical_statistics (
                    year, fatal_accidents, deaths, injury_accidents, injured,
                    damage_accidents, total_accidents, deaths_per_fatal_accident,
                    injured_per_injury_accident, data_period
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                rec['year'], rec['fatal_accidents'], rec['deaths'],
                rec['injury_accidents'], rec['injured'], rec['damage_accidents'],
                rec['total_accidents'], rec['deaths_per_fatal_accident'],
                rec['injured_per_injury_accident'], rec['data_period']
            ))
        print(f"Inserted {len(hist_records)} historical records (1975-2025).")

    # 2. Optional development fixtures. Never seed synthetic or legacy-mapped
    # accident rows into a production database unless explicitly requested.
    seed_fixture_data = os.environ.get('SEED_SYNTHETIC_FIXTURES', '').lower() == 'true'
    tak_json_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "detailed_accidents_tak.json")
    tak_accidents = []
    if seed_fixture_data and os.path.exists(tak_json_path):
        with open(tak_json_path, 'r', encoding='utf-8') as f:
            tak_accidents = json.load(f)

    # Build development-only fixture data when SEED_SYNTHETIC_FIXTURES=true.
    random.seed(42)

    all_accidents = []

    # Map TAK records
    for i, tak in enumerate(tak_accidents):
        date_str = tak.get('event_date')
        if not date_str:
            # Assign plausible dates in 2024-2026 if missing
            d = datetime(2024, 1, 1) + timedelta(days=i * 2)
            date_str = d.strftime('%Y-%m-%d')
        
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
        except:
            dt = datetime(2024, 6, 15)
            date_str = '2024-06-15'

        district = tak['district'] if tak['district'] != 'Diğer' else random.choice(DISTRICTS)
        road = DISTRICT_ROADS[district][0]

        all_accidents.append({
            "accident_id": tak['accident_id'],
            "event_date": date_str,
            "event_time": f"{random.randint(0,23):02d}:{random.choice(['00','15','30','45'])}",
            "year": dt.year,
            "month": dt.month,
            "day_of_week": ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][dt.weekday()],
            "district": district,
            "location_raw": f"{district} Yakınları",
            "location_normalized": district,
            "road_raw": road,
            "road_normalized": road,
            "latitude": 35.185 + random.uniform(-0.15, 0.15),
            "longitude": 33.382 + random.uniform(-0.25, 0.45),
            "fatal": 1 if tak['fatal'] else 0,
            "death_count": tak['death_count'],
            "injury_count": tak['injury_count'],
            "vehicle_types": json.dumps(tak['vehicle_types'], ensure_ascii=False),
            "vehicle_count": len(tak['vehicle_types']),
            "reported_cause": tak['reported_cause'],
            "cause_category": tak['cause_category'],
            "cause_confidence": tak['confidence_score'],
            "weather": random.choice(['Açık / Güneşli', 'Açık / Güneşli', 'Yağmurlu', 'Sisli']),
            "road_condition": 'Islak' if random.random() < 0.15 else 'Kuru',
            "lighting_condition": 'Gece' if random.random() < 0.45 else 'Gündüz',
            "victim_information": json.dumps([{"age": random.randint(19, 68), "gender": random.choice(["Erkek", "Kadın"])}]),
            "age_group": random.choice(['18-25', '26-40', '26-40', '41-60', '60+']),
            "gender": random.choice(['Erkek', 'Erkek', 'Kadın']),
            "description_raw": tak['title'],
            "description_normalized": f"{district} bölgesinde {road} üzerinde kaza meydana geldi.",
            "source_type": "Established Media",
            "source_name": "TAK (Türk Ajansı Kıbrıs)",
            "source_url": tak['source_url'],
            "source_date": date_str,
            "verification_status": tak['verification_status'],
            "confidence_score": tak['confidence_score'],
            "content_hash": generate_hash(f"{tak['accident_id']}_{date_str}_{tak['title']}")
        })

    # Add structured 2026 Live Dataset (Jan 1, 2026 to July 31, 2026) for exact YTD compliance
    start_2026 = datetime(2026, 1, 1)
    end_2026 = datetime(2026, 7, 31)
    curr_date = start_2026 if seed_fixture_data else end_2026 + timedelta(days=1)

    acc_counter = 1000
    while curr_date <= end_2026:
        # Generate 1-2 accidents per week (both fatal and injury)
        if random.random() < 0.28:
            acc_counter += 1
            district = random.choices(
                DISTRICTS,
                weights=[0.32, 0.28, 0.20, 0.10, 0.06, 0.04] # Girne & Lefkoşa higher baseline
            )[0]

            road = random.choice(DISTRICT_ROADS[district])
            cause_code, cause_desc, _ = random.choices(CAUSES, weights=[c[2] for c in CAUSES])[0]
            is_fatal = random.random() < 0.25 # 25% fatal
            deaths = random.choices([1, 2, 3], weights=[0.85, 0.12, 0.03])[0] if is_fatal else 0
            injuries = random.randint(1, 4) if not is_fatal else random.randint(0, 2)
            
            date_str = curr_date.strftime('%Y-%m-%d')
            title = f"{district} - {road} üzerinde {cause_desc.lower()} nedeniyle kaza: {deaths} ölü, {injuries} yaralı"

            all_accidents.append({
                "accident_id": f"ACC-2026-{acc_counter:04d}",
                "event_date": date_str,
                "event_time": f"{random.randint(0,23):02d}:{random.choice(['05','20','35','50'])}",
                "year": 2026,
                "month": curr_date.month,
                "day_of_week": ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][curr_date.weekday()],
                "district": district,
                "location_raw": f"{district} Mevkii",
                "location_normalized": district,
                "road_raw": road,
                "road_normalized": road,
                "latitude": 35.185 + random.uniform(-0.15, 0.15),
                "longitude": 33.382 + random.uniform(-0.25, 0.45),
                "fatal": 1 if is_fatal else 0,
                "death_count": deaths,
                "injury_count": injuries,
                "vehicle_types": json.dumps(random.sample(['Otomobil', 'Motosiklet', 'Ağır Vasıta', 'Otobüs/Minibüs'], k=random.randint(1, 2)), ensure_ascii=False),
                "vehicle_count": random.randint(1, 2),
                "reported_cause": f"Polis basın bültenine göre {cause_desc.lower()}",
                "cause_category": cause_code,
                "cause_confidence": 0.95,
                "weather": 'Açık / Güneşli',
                "road_condition": 'Kuru',
                "lighting_condition": 'Gece' if random.random() < 0.5 else 'Gündüz',
                "victim_information": json.dumps([{"age": random.randint(20, 62), "gender": random.choice(["Erkek", "Kadın"])}]),
                "age_group": random.choice(['18-25', '26-40', '26-40', '41-60']),
                "gender": random.choice(['Erkek', 'Kadın']),
                "description_raw": title,
                "description_normalized": title,
                "source_type": "Synthetic Test Fixture",
                "source_name": "Synthetic test fixture",
                "source_url": "https://github.com/RYucel/trafik_curated",
                "source_date": date_str,
                "record_type": "SYNTHETIC_TEST_FIXTURE",
                "verification_status": "INCOMPLETE",
                "confidence_score": 0.98,
                "content_hash": generate_hash(f"ACC-2026-{acc_counter}_{date_str}")
            })
        curr_date += timedelta(days=1)

    inserted_count = 0
    for acc in all_accidents:
        source_tier = 'TIER_1_OFFICIAL' if 'Polis' in acc['source_name'] else ('TIER_2_AGENCY' if 'TAK' in acc['source_name'] else 'TIER_3_ESTABLISHED_MEDIA')
        record_type = acc.get('record_type', 'INDIVIDUAL_ACCIDENT')
        approval_status = 'APPROVED' if acc['verification_status'] == 'VERIFIED' else 'DRAFT'

        cursor.execute("""
            INSERT OR REPLACE INTO accidents (
                accident_id, event_date, event_time, year, month, day_of_week,
                district, location_raw, location_normalized, road_raw, road_normalized,
                latitude, longitude, fatal, death_count, injury_count, vehicle_types,
                vehicle_count, reported_cause, cause_category, cause_confidence,
                weather, road_condition, lighting_condition, victim_information,
                age_group, gender, description_raw, description_normalized,
                source_type, source_tier, source_name, source_url, source_date, record_type,
                verification_status, publication_approval_status, confidence_score, content_hash
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, (
            acc['accident_id'], acc['event_date'], acc['event_time'], acc['year'], acc['month'], acc['day_of_week'],
            acc['district'], acc['location_raw'], acc['location_normalized'], acc['road_raw'], acc['road_normalized'],
            acc['latitude'], acc['longitude'], acc['fatal'], acc['death_count'], acc['injury_count'], acc['vehicle_types'],
            acc['vehicle_count'], acc['reported_cause'], acc['cause_category'], acc['cause_confidence'],
            acc['weather'], acc['road_condition'], acc['lighting_condition'], acc['victim_information'],
            acc['age_group'], acc['gender'], acc['description_raw'], acc['description_normalized'],
            acc['source_type'], source_tier, acc['source_name'], acc['source_url'], acc['source_date'], record_type,
            acc['verification_status'], approval_status, acc['confidence_score'], acc['content_hash']
        ))
        inserted_count += 1

    print(f"Inserted {inserted_count} accidents into SQLite database.")

    # 3. Optional development-only review queue fixtures.
    review_items = [
        {
            "accident_id": "ACC-2026-1012",
            "issue_type": "CONFLICTING_DEATH_COUNT",
            "title": "Girne Anayolu Kaza Can Kaybı Çelişkisi",
            "description": "PGM Raporu 1 can kaybı bildirirken, Gazete X 2 can kaybı olduğunu iddia etmektedir.",
            "status": "PENDING",
            "match_confidence": "HIGH",
            "source_a": "PGM Polis Basın Subaylığı (1 Ölü)",
            "source_b": "Haber Gazetesi (2 Ölü)",
            "details_json": json.dumps({"source_a_url": "https://polis.gov.ct.tr", "source_b_url": "https://habergazetesi.com"})
        },
        {
            "accident_id": "ACC-2026-1025",
            "issue_type": "POTENTIAL_DUPLICATE",
            "title": "Haspolat Çemberi Çift Haber Eşleşmesi",
            "description": "Farklı kaynaklarda aynı saat ve konumdaki kaza iki ayrı kayıt olarak tespit edildi.",
            "status": "PENDING",
            "match_confidence": "MEDIUM",
            "source_a": "TAK Ajansı #4412",
            "source_b": "Kıbrıs Postası #9912",
            "details_json": json.dumps({"date": "2026-06-18", "location": "Haspolat"})
        },
        {
            "accident_id": "ACC-2026-1039",
            "issue_type": "UNCERTAIN_CAUSE",
            "title": "İskele Bafra Yolu Kaza Nedeni Belirsizliği",
            "description": "Haber metninde direksiyon hakimiyeti kaybı ve aşırı hız iddiaları çelişiyor.",
            "status": "PENDING",
            "match_confidence": "LOW",
            "source_a": "Yerel Basın",
            "source_b": "Görgü Tanığı İfadesi",
            "details_json": json.dumps({"cause_a": "SPEED", "cause_b": "LOSS_OF_CONTROL"})
        }
    ]

    if seed_fixture_data:
        cursor.execute("DELETE FROM review_queue")
        for r in review_items:
            cursor.execute("""
                INSERT INTO review_queue (
                    accident_id, issue_type, title, description, status, match_confidence, source_a, source_b, details_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r['accident_id'], r['issue_type'], r['title'], r['description'], r['status'],
                r['match_confidence'], r['source_a'], r['source_b'], r['details_json']
            ))
        print(f"Inserted {len(review_items)} development review queue fixtures.")

    # 4. Seed Audit Log Entry
    if seed_fixture_data:
        cursor.execute("""
            INSERT INTO audit_log (user_action, entity_type, entity_id, previous_state, new_state, action_by)
            VALUES ('SYSTEM_INIT', 'DATABASE', 'kktc_traffic.db', NULL, 'SYNTHETIC_TEST_FIXTURES', 'System Admin')
        """)

    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == "__main__":
    init_database()
