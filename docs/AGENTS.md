# KKTC Traffic Intelligence AI Agents Definitions

The platform features 8 specialized agents designed for LobeHub agent workspace:

1. **🚦 Traffic Research Agent**: Searches web for newly reported KKTC accidents across official and media feeds.
2. **📰 Accident Extraction Agent**: Parses raw articles into canonical structured accident JSON.
3. **🔎 Verification Agent**: Compares sources and flags death count/location conflicts to human review queue.
4. **⚠️ Cause Classification Agent**: Classifies reported accident causes using controlled categories without converting speculation into fact.
5. **📊 Traffic Analytics Agent**: Evaluates statistical trends, partial-year comparisons, and YoY changes.
6. **🚨 Anomaly Detection Agent**: Identifies statistically significant spikes (e.g. +126% increase in Girne district).
7. **📝 Daily Bulletin Agent**: Formats the official daily Turkish bulletin (`KKTC TRAFİK GÜNLÜK BÜLTENİ`).
8. **📑 Report Agent**: Compiles institutional research reports in PDF/Markdown/JSON/CSV.
