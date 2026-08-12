# KKTC Traffic MCP Tools Specification

The MCP Server exposes the following read-focused tools to LobeHub agents over HTTP (`POST /mcp/call`):

| Tool Name | Parameters | Purpose |
|---|---|---|
| `get_latest_accidents` | `{ hours, limit, include_unverified }` | Fetches latest verified structured accident records |
| `search_accidents` | `{ query, district, from, to, limit }` | Searches detailed accidents with filtering |
| `get_accident` | `{ accident_id }` | Fetches single accident record with source provenance |
| `get_historical_statistics` | `{ from_year, to_year }` | Fetches 50-year official historical dataset (1975-2026) |
| `get_year_statistics` | `{ year, from_month, to_month }` | Fetches year statistics with partial-year comparison support |
| `compare_periods` | `{ period_a, period_b }` | Performs partial-year comparison (e.g. Jan-Jul 2026 vs Jan-Jul 2025) |
| `get_district_statistics` | `{ district }` | Fetches accident & death stats by district |
| `get_cause_statistics` | `{ include_unknown }` | Fetches accident causes breakdown |
| `get_anomalies` | `{ minimum_confidence }` | Fetches statistically detected risk spikes & anomalies |
| `get_sources` | `{ accident_id }` | Fetches source provenance list and verification tiers |
| `get_latest_bulletin` | `{ date }` | Generates daily Turkish bulletin (KKTC TRAFİK GÜNLÜK BÜLTENİ) |
| `generate_report_data` | `{ report_type, date_range }` | Generates structured JSON payload for research reports |
