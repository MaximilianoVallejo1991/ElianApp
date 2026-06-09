const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const chunkPath = path.join(process.env.USERPROFILE, '.engram', '.engram', 'chunks', 'c5a9ee2d.jsonl.gz');
const input = fs.readFileSync(chunkPath);

zlib.gunzip(input, (err, buffer) => {
  if (err) {
    console.error('Decompression error:', err);
    return;
  }
  const data = JSON.parse(buffer.toString('utf8'));

  // Find all sharedMony content
  const sharedMonyObs = data.observations.filter(o => o.project === 'sharedMony');
  const sharedMonySessions = data.sessions.filter(s => s.project === 'sharedMony');

  console.log('=== sharedMony Sessions ===');
  console.log(JSON.stringify(sharedMonySessions, null, 2));

  console.log('\n=== sharedMony Observations ===');
  sharedMonyObs.forEach(o => {
    console.log('\n--- Observation ---');
    console.log('Title:', o.title);
    console.log('Type:', o.type);
    console.log('Content:', o.content);
  });
});