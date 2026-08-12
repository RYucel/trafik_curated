# Daily Automation Workflow (Asia/Nicosia Timezone)

- **06:00**: Research Agent searches official and news feeds for newly reported accidents.
- **06:15**: Extraction Agent converts raw articles to canonical JSON.
- **06:30**: Deduplication Agent matches candidate records.
- **06:40**: Verification Agent checks source conflicts and populates Review Queue if needed.
- **07:00**: Database updates & statistical totals calculated deterministically.
- **07:10**: Anomaly Detector scans for statistical deviations.
- **07:20**: Bulletin Agent generates draft Turkish bulletin.
- **07:35**: Human review approval if conflicts exist.
- **08:00**: Telegram publication & dashboard update.
