// MCP Bulletins Tool
import { BulletinAgent } from '../../agents/bulletin_agent.js';

export async function getLatestBulletin({ date = '2026-08-12' }) {
  return await BulletinAgent.generateDailyBulletin(date);
}
