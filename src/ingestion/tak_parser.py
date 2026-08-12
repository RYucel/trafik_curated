import sys
import os
import json
import re
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

DISTRICTS = {
    'lefkoşa': 'Lefkoşa',
    'lefkosa': 'Lefkoşa',
    'gönyeli': 'Lefkoşa',
    'gonyeli': 'Lefkoşa',
    'haspolat': 'Lefkoşa',
    'hamitköy': 'Lefkoşa',
    'minareliköy': 'Lefkoşa',
    'değirmenlik': 'Lefkoşa',
    'metehan': 'Lefkoşa',
    'girne': 'Girne',
    'kyrenia': 'Girne',
    'karaoğlanoğlu': 'Girne',
    'alsancak': 'Girne',
    'lapta': 'Girne',
    'çatalköy': 'Girne',
    'esentepe': 'Girne',
    'dikmen': 'Girne',
    'dağyolu': 'Girne',
    'gazimağusa': 'Gazimağusa',
    'gazimagusa': 'Gazimağusa',
    'mağusa': 'Gazimağusa',
    'famagusta': 'Gazimağusa',
    'yeniboğaziçi': 'Gazimağusa',
    'geçitkale': 'Gazimağusa',
    'vadili': 'Gazimağusa',
    'iskele': 'İskele',
    'dipkarpaz': 'İskele',
    'yeni erenköy': 'İskele',
    'mehmetçik': 'İskele',
    'güzelyurt': 'Güzelyurt',
    'guzelyurt': 'Güzelyurt',
    'bostancı': 'Güzelyurt',
    'kalkanlı': 'Güzelyurt',
    'lefke': 'Lefke',
    'gemikonağı': 'Lefke',
    'yedidalga': 'Lefke'
}

CAUSES = [
    ('aşırı sürat', 'SPEED'),
    ('sürat', 'SPEED'),
    ('hızlı', 'SPEED'),
    ('alkol', 'DRUNK_DRIVING'),
    ('sarhoş', 'DRUNK_DRIVING'),
    ('dikkatsiz', 'DISTRACTED_DRIVING'),
    ('cep telefonu', 'DISTRACTED_DRIVING'),
    ('kavşakta durmayarak', 'FAILURE_TO_GIVE_WAY'),
    ('yol hakkı', 'FAILURE_TO_GIVE_WAY'),
    ('kırmızı ışık', 'RED_LIGHT'),
    ('şerit ihlali', 'WRONG_SIDE'),
    ('ters yön', 'WRONG_SIDE'),
    ('hatalı sollama', 'OVERTAKING'),
    ('direksiyon hakimiyeti', 'LOSS_OF_CONTROL'),
    ('kontrolünü kaybetti', 'LOSS_OF_CONTROL'),
    ('yaya', 'PEDESTRIAN'),
    ('motosiklet', 'MOTORCYCLE'),
    ('motor', 'MOTORCYCLE')
]

ROADS = [
    'Girne-Lefkoşa Anayolu',
    'Lefkoşa-Gazimağusa Anayolu',
    'Lefkoşa-Güzelyurt Anayolu',
    'Girne-Güzelyurt Anayolu',
    'Gazimağusa-İskele Anayolu',
    'Ercan-İskele Anayolu',
    'Gönyeli Çemberi',
    'Haspolat Çemberi',
    'Bedrettin Demirel Caddesi',
    'Dr. Fazıl Küçük Bulvarı'
]

def extract_dates(text):
    # Regex to match dates like 12.08.2024 or 12/08/2024 or 12 Ağustos 2024
    match = re.search(r'(\d{1,2})[\./\s]+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|\d{1,2})[\./\s]+(202[4-6])', text, re.IGNORECASE)
    if match:
        day, month, year = match.groups()
        month_map = {
            'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
            'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
            'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
        }
        if month.lower() in month_map:
            m = month_map[month.lower()]
        else:
            m = f"{int(month):02d}"
        d = f"{int(day):02d}"
        return f"{year}-{m}-{d}"
    return None

def parse_tak():
    csv_path = r'E:\Projeler\TAK_arsiv\turkajansikibris.csv'
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        return

    df = pd.read_csv(csv_path)

    accidents = []
    seen_urls = set()

    for idx, row in df.iterrows():
        title = str(row.get('edn_article', ''))
        url = str(row.get('edn_article href', ''))

        if not title or title in ('nan', '') or url in seen_urls:
            continue

        text_lower = title.lower()

        # Check if traffic accident related
        is_accident = any(k in text_lower for k in ['kaza', 'trafik kazası', 'çarptı', 'devrildi', 'yaralandı', 'hayatını kaybetti', 'ölüm'])
        if not is_accident:
            continue

        seen_urls.add(url)

        # Death & injury detection
        deaths = 0
        injuries = 0

        death_match = re.search(r'(\d+)\s+(kişi\s+)?(hayatını kaybetti|öldü|can verdi|ölüm)', text_lower)
        if death_match:
            deaths = int(death_match.group(1))
        elif any(k in text_lower for k in ['ölümlü kaza', 'hayatını kaybetti', 'yaşamını yitirdi']):
            deaths = 1

        injury_match = re.search(r'(\d+)\s+(kişi\s+)?yaralandı', text_lower)
        if injury_match:
            injuries = int(injury_match.group(1))
        elif 'yaralandı' in text_lower or 'yaralanan' in text_lower:
            injuries = 1

        fatal = deaths > 0

        # District detection
        district = "Diğer"
        for kw, dist_name in DISTRICTS.items():
            if kw in text_lower:
                district = dist_name
                break

        # Road detection
        road = "Genel Yol"
        for r in ROADS:
            if r.lower() in text_lower:
                road = r
                break

        # Cause detection
        cause_cat = "UNKNOWN"
        reported_cause = "Bilinmiyor / Polis Raporu Bekleniyor"
        for kw, cat in CAUSES:
            if kw in text_lower:
                cause_cat = cat
                reported_cause = f"Haber metninde '{kw}' ifadesi geçiyor"
                break

        # Vehicle detection
        vehicles = []
        if 'motosiklet' in text_lower or 'motor' in text_lower:
            vehicles.append('Motosiklet')
        if 'otobüs' in text_lower or 'minibüs' in text_lower:
            vehicles.append('Otobüs/Minibüs')
        if 'kamyon' in text_lower or 'tır' in text_lower:
            vehicles.append('Ağır Vasıta')
        if 'salon araç' in text_lower or 'araç' in text_lower or 'otomobil' in text_lower:
            vehicles.append('Otomobil')
        if not vehicles:
            vehicles.append('Otomobil')

        event_date = extract_dates(title)

        accidents.append({
            "accident_id": f"TAK-{idx+1:05d}",
            "title": title.strip(),
            "event_date": event_date,
            "district": district,
            "location_normalized": district,
            "road_normalized": road,
            "fatal": fatal,
            "death_count": deaths,
            "injury_count": injuries,
            "vehicle_types": vehicles,
            "reported_cause": reported_cause,
            "cause_category": cause_cat,
            "verification_status": "VERIFIED" if fatal else "REPORTED",
            "confidence_score": 0.95 if fatal else 0.85,
            "source_type": "Established Media",
            "source_name": "TAK (Türk Ajansı Kıbrıs)",
            "source_url": url,
            "raw_text": title.strip()
        })

    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed"), exist_ok=True)
    out_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "detailed_accidents_tak.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(accidents, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(accidents)} detailed accident records into {out_path}")

if __name__ == "__main__":
    parse_tak()
