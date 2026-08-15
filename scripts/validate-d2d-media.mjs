import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const catalog = [1,2,3,4].flatMap(n => readJson(`data/books-${n}.json`));
const catalogIds = new Set(catalog.map(book => String(book.id)));
const manifest = readJson('data/d2d-media.json');
const queue = fs.existsSync(path.join(root, 'data/d2d-sync-queue.json'))
  ? readJson('data/d2d-sync-queue.json')
  : { queued: [] };

const errors = [];
const seenCovers = new Map();

for (const [id, entry] of Object.entries(manifest)) {
  if (!catalogIds.has(id)) errors.push(`${id}: not present in catalog`);
  if (!entry || typeof entry !== 'object') {
    errors.push(`${id}: manifest entry must be an object`);
    continue;
  }
  if (!entry.cover || typeof entry.cover !== 'string') {
    errors.push(`${id}: missing cover path`);
    continue;
  }
  if (/^https?:\/\//i.test(entry.cover)) {
    errors.push(`${id}: external cover URLs are forbidden; D2D cover must be local`);
    continue;
  }
  const coverPath = path.normalize(path.join(root, entry.cover));
  if (!coverPath.startsWith(root)) errors.push(`${id}: cover path escapes repository root`);
  if (!fs.existsSync(coverPath)) errors.push(`${id}: cover file does not exist: ${entry.cover}`);
  if (!String(entry.source || '').toLowerCase().includes('draft2digital')) {
    errors.push(`${id}: source must explicitly identify Draft2Digital`);
  }
  if (seenCovers.has(entry.cover) && seenCovers.get(entry.cover) !== id) {
    errors.push(`${id}: cover path is also mapped to ${seenCovers.get(entry.cover)}: ${entry.cover}`);
  } else {
    seenCovers.set(entry.cover, id);
  }
}

const queueIds = new Set();
for (const item of Array.isArray(queue.queued) ? queue.queued : []) {
  const id = String(item?.id || '');
  if (!id) {
    errors.push('queue: item missing id');
    continue;
  }
  if (queueIds.has(id)) errors.push(`${id}: duplicate queue entry`);
  queueIds.add(id);
  if (!catalogIds.has(id)) errors.push(`${id}: queue id not present in catalog`);
  if (!['source-verified', 'synced'].includes(item.status)) {
    errors.push(`${id}: invalid queue status ${item.status}`);
  }
  if (!item.asset || typeof item.asset !== 'string') {
    errors.push(`${id}: queue item missing asset path`);
    continue;
  }
  if (item.status === 'synced') {
    const manifestEntry = manifest[id];
    if (!manifestEntry) {
      errors.push(`${id}: marked synced but missing from d2d-media.json`);
      continue;
    }
    if (manifestEntry.cover !== item.asset) {
      errors.push(`${id}: synced asset mismatch (${item.asset} != ${manifestEntry.cover})`);
    }
    const assetPath = path.normalize(path.join(root, item.asset));
    if (!assetPath.startsWith(root) || !fs.existsSync(assetPath)) {
      errors.push(`${id}: marked synced but local asset does not exist: ${item.asset}`);
    }
  }
}

if (errors.length) {
  console.error('D2D media integrity FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const syncedCount = (queue.queued || []).filter(item => item.status === 'synced').length;
console.log(`D2D media integrity PASS: ${Object.keys(manifest).length} canonical cover mappings checked; ${syncedCount} queue entries synced.`);
