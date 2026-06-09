const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.USERPROFILE, '.engram', 'engram.db');
const db = new Database(dbPath);

// Check for chunk tracking tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check pragmas
const pragmas = db.pragma('user_version');
console.log('User version:', pragmas[0].user_version);

// Check if there's a chunk tracking table
if (tables.some(t => t.name === 'chunks' || t.name === 'sync_meta')) {
  const chunkTable = tables.find(t => t.name === 'chunks' || t.name === 'sync_meta');
  const data = db.prepare(`SELECT * FROM ${chunkTable.name}`).all();
  console.log(`${chunkTable.name} data:`, JSON.stringify(data, null, 2));
} else {
  console.log('No chunk tracking table found');
}

// Count observations by project
const projects = db.prepare(`
  SELECT project, COUNT(*) as count 
  FROM observations 
  WHERE project IS NOT NULL AND project != ''
  GROUP BY project 
  ORDER BY count DESC
`).all();
console.log('Observations by project:', JSON.stringify(projects, null, 2));

db.close();