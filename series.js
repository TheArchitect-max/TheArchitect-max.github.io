const grid = document.getElementById('seriesGrid');
const search = document.getElementById('seriesSearch');
const resultCount = document.getElementById('seriesResultCount');
const seriesCount = document.getElementById('seriesCount');
const seriesBookCount = document.getElementById('seriesBookCount');
document.getElementById('year').textContent = new Date().getFullYear();

function escapeHtml(value='') {
  return String(value).replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}
function normalize(value='') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function seriesRoot(series='') {
  return series.replace(/,\s*#\d+\s*$/,'').trim();
}
function seriesNumber(series='') {
  const match = series.match(/#(\d+)\s*$/);
  return match ? Number(match[1]) : 999;
}
function groupSeries(books) {
  const groups = new Map();
  books.forEach(book => {
    const root = seriesRoot(book.series || '');
    if(!root) return;
    if(!groups.has(root)) groups.set(root, []);
    groups.get(root).push(book);
  });
  return [...groups.entries()]
    .map(([name, items]) => ({name, items: items.sort((a,b)=>seriesNumber(a.series)-seriesNumber(b.series) || a.title.localeCompare(b.title))}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
function render(groups) {
  const q = normalize(search.value.trim());
  const visible = groups.filter(group => {
    if(!q) return true;
    return normalize(`${group.name} ${group.items.map(item=>item.title).join(' ')}`).includes(q);
  });
  resultCount.textContent = `${visible.length} ${visible.length === 1 ? 'series' : 'series'}`;
  grid.setAttribute('aria-busy','false');
  if(!visible.length){ grid.innerHTML = '<div class="empty-state">No series match this search.</div>'; return; }
  grid.innerHTML = visible.map((group, index) => `
    <section class="series-card">
      <div class="series-card-head">
        <span class="series-index">${String(index + 1).padStart(2,'0')}</span>
        <div>
          <p class="series-volume-count">${group.items.length} ${group.items.length === 1 ? 'volume' : 'volumes'}</p>
          <h2>${escapeHtml(group.name)}</h2>
        </div>
      </div>
      <ol class="series-volumes">
        ${group.items.map(book => `
          <li>
            <a href="book.html?id=${encodeURIComponent(book.id)}">
              <span class="volume-number">${seriesNumber(book.series) === 999 ? '•' : String(seriesNumber(book.series)).padStart(2,'0')}</span>
              <span class="volume-title">${escapeHtml(book.title)}</span>
              <span class="volume-arrow">↗</span>
            </a>
          </li>`).join('')}
      </ol>
    </section>`).join('');
}

Promise.all([
  Promise.all(['data/books-1.json','data/books-2.json','data/books-3.json','data/books-4.json'].map(path=>fetch(path).then(r=>r.json()))),
  fetch('data/series-map.json').then(r=>r.json())
]).then(([parts, map]) => {
  const books = parts.flat().map(book => ({...book, series: book.series || map[book.id] || ''}));
  const groups = groupSeries(books);
  const inSeries = groups.reduce((sum, group)=>sum+group.items.length,0);
  seriesCount.textContent = groups.length;
  seriesBookCount.textContent = inSeries;
  render(groups);
  search.addEventListener('input', ()=>render(groups));
}).catch(() => {
  grid.setAttribute('aria-busy','false');
  grid.innerHTML = '<div class="empty-state">The series library could not load.</div>';
});
