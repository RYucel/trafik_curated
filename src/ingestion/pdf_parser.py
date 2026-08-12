import sys
import os
import json
import re

def parse_pdf():
    import pypdf

    pdf_path = os.path.join(os.path.dirname(__file__), "..", "..", "1975-2025 YILLARI ARASI TRAFİK KAZA SAYISI.pdf")
    if not os.path.exists(pdf_path):
        pdf_path = "1975-2025 YILLARI ARASI TRAFİK KAZA SAYISI.pdf"

    reader = pypdf.PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"

    records = []
    # Lines match: YEAR FATAL_ACCIDENTS DEATHS INJURY_ACCIDENTS INJURED DAMAGE_ACCIDENTS TOTAL_ACCIDENTS
    pattern = re.compile(r"^(\d{4})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)", re.MULTILINE)
    
    for match in pattern.finditer(text):
        year = int(match.group(1))
        fatal_accidents = int(match.group(2))
        deaths = int(match.group(3))
        injury_accidents = int(match.group(4))
        injured = int(match.group(5))
        damage_accidents = int(match.group(6))
        total_accidents = int(match.group(7))

        records.append({
            "year": year,
            "fatal_accidents": fatal_accidents,
            "deaths": deaths,
            "injury_accidents": injury_accidents,
            "injured": injured,
            "damage_accidents": damage_accidents,
            "total_accidents": total_accidents,
            "deaths_per_fatal_accident": round(deaths / fatal_accidents, 2) if fatal_accidents > 0 else 0,
            "injured_per_injury_accident": round(injured / injury_accidents, 2) if injury_accidents > 0 else 0,
            "data_period": f"{year}-01 to {year}-12" if year < 2025 else "2025-01 to 2025-02-27"
        })

    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed"), exist_ok=True)
    output_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "historical_1975_2025.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(records)} yearly historical records into {output_path}")

if __name__ == "__main__":
    parse_pdf()
