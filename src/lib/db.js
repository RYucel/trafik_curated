// Database Access Layer for KKTC Traffic Intelligence
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pyScript = path.join(__dirname, 'query_db.py');
const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

export function queryDb(sql, params = []) {
  try {
    const output = execFileSync(pythonBin, [pyScript, 'query', sql, JSON.stringify(params)], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024
    });
    const res = JSON.parse(output || '[]');
    if (res && res.error) {
      console.error('DB Query Error:', res.error);
      return [];
    }
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.error('DB Query Exec Error:', err.message);
    return [];
  }
}

export function executeDb(sql, params = []) {
  try {
    const output = execFileSync(pythonBin, [pyScript, 'execute', sql, JSON.stringify(params)], {
      encoding: 'utf-8'
    });
    return JSON.parse(output || '{"success": false}');
  } catch (err) {
    console.error('DB Execute Exec Error:', err.message);
    return { success: false, error: err.message };
  }
}
