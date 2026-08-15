const grid = document.getElementById('bookGrid');
const searchInput = document.getElementById('searchInput');
const filters = document.getElementById('filters');
const resultCount = document.getElementById('resultCount');
const clearSearch = document.getElementById('clearSearch');
const sortSelect = document.getElementById('sortSelect');
const seriesOnly = document.getElementById('seriesOnly');
let books = [];
let activeCategory = 'All';
let renderGeneration = 0;
const mediaCache = new Map();

function normalize(v=''){ return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function escapeHtml(value='') {
  return String(value).replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}
function sortedBooks(list){
  const mode = sortSelect.value;
  if(mode === 'title') return [...list].sort((a,b)=>a.title.localeCompare(b.title));
  if(mode === 'series') return [...list].sort((a,b)=>{
    const as = a.series || 'zzzzzz';
    const bs = b.series || 'zzzzzz';
    return as.localeCompare(bs) || a.title.localeCompare(b.title);
  });
  return list;
}
function coverPlaceholder(book){
  const title = escapeHtml(book.title || 'Book');
  return `<div class="card-cover-frame" data-cover-id="${escapeHtml(book.id)}" aria-label="Book cover for ${title}">
    <div class="cover-loading" aria-hidden="true"><span>RA</span></div>
  </div>`;
}
function descriptionForCard(book, media=null){
  const mediaDescription = window.RABookMedia?.description(media) || '';
  return book.description || mediaDescription || 'Book description is being synchronized with the public catalog.';
}
function applyMedia(book, media, generation){
  if(generation !== renderGeneration || !media) return;
  const frame = grid.querySelector(`[data-cover-id="${CSS.escape(String(book.id))}"]`);
  if(frame){
    const src = window.RABookMedia?.artworkUrl(media, 'thumb');
    if(src){
      frame.innerHTML = `<img src="${escapeHtml(src)}" alt="Cover of ${escapeHtml(book.title)} by Rayford Aquirre" loading="lazy" decoding="async" />`;
      frame.classList.add('has-cover');
    }
  }
  if(!book.description){
    const description = window.RABookMedia?.description(media) || '';
    const node = grid.querySelector(`[data-description-id="${CSS.escape(String(book.id))}"]`);
    if(node && description) node.textContent = description;
  }
}
async function enrichCovers(visible, generation){
  if(!window.RABookMedia) return;
  await window.RABookMedia.loadD2DManifest().catch(()=>({}));
  if(generation !== renderGeneration) return;
  const queue=[...visible];
  async function worker(){
    while(queue.length && generation===renderGeneration){
      const book=queue.shift();
      let media=mediaCache.get(book.id);
      if(media===undefined){
        media=await window.RABookMedia.find(book,false).catch(()=>null);
        mediaCache.set(book.id,media);
      }
      applyMedia(book,media,generation);
    }
  }
  await Promise.all(Array.from({length:4},()=>worker()));
}
function render(){
  const generation = ++renderGeneration;
  const rawQuery = searchInput.value.trim();
  const q = normalize(rawQuery);
  let visible = books.filter(book => {
    const categoryMatch = activeCategory === 'All' ||
      (activeCategory === 'Nederlands' ? book.language === 'Nederlands' : book.category === activeCategory);
    const seriesMatch = !seriesOnly.checked || Boolean(book.series);
    const haystack = normalize(`${book.title} ${book.series || ''} ${book.category || ''} ${book.language || ''} ${book.description || ''}`);
    return categoryMatch && seriesMatch && (!q || haystack.includes(q));
  });
  visible = sortedBooks(visible);
  const isDefaultView = !rawQuery && activeCategory === 'All' && !seriesOnly.checked;
  resultCount.textContent = isDefaultView ? 'Full catalog' : `${visible.length} ${visible.length === 1 ? 'book' : 'books'}`;
  grid.setAttribute('aria-busy','false');
  if(!visible.length){ grid.innerHTML = '<div class="empty-state">No books match the current filters.</div>'; return; }
  grid.innerHTML = visible.map((book) => {
    const title = escapeHtml(book.title || 'Untitled');
    const series = escapeHtml(book.series || '');
    const category = escapeHtml(book.category || 'Book');
    const description = escapeHtml(descriptionForCard(book));
    const language = book.language === 'Nederlands' ? '<span class="card-language">Nederlands</span>' : '';
    const detailUrl = `book.html?id=${encodeURIComponent(book.id)}`;
    return `<article class="book-card" data-title="${title}">
      <a class="card-main-link" href="${detailUrl}" aria-label="Open ${title}">
        ${coverPlaceholder(book)}
        <div class="card-copy">
          <h3 class="card-title">${title}</h3>
          <div class="card-series">${series}</div>
          <p class="card-description" data-description-id="${escapeHtml(book.id)}">${description}</p>
        </div>
      </a>
      <div class="card-bottom">
        <span class="card-category">${category}${language}</span>
        <div class="card-actions"><a class="card-link" href="${detailUrl}">Details</a></div>
      </div>
    </article>`;
  }).join('');
  enrichCovers(visible, generation);
}
function buildFilters(){
  const categories = ['All'];
  if(books.some(b => b.language === 'Nederlands')) categories.push('Nederlands');
  categories.push(...new Set(books.map(b => b.category).filter(Boolean)));
  filters.innerHTML = categories.map(cat => `<button type="button" class="filter-button ${cat==='All'?'active':''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('');
  filters.addEventListener('click', e => {
    const btn = e.target.closest('[data-category]'); if(!btn) return;
    activeCategory = btn.dataset.category;
    [...filters.children].forEach(el => el.classList.toggle('active', el===btn));
    render();
  });
}

Promise.all([
  Promise.all(['data/books-1.json','data/books-2.json','data/books-3.json','data/books-4.json'].map(path => fetch(path).then(r => {
    if(!r.ok) throw new Error(`Catalog load failed: ${path}`);
    return r.json();
  }))),
  fetch('data/series-map.json').then(r => r.ok ? r.json() : {}),
  fetch('data/language-map.json').then(r => r.ok ? r.json() : {}),
  Promise.all(['data/verified-metadata.json','data/verified-metadata-2.json','data/verified-metadata-3.json'].map(path => fetch(path).then(r => r.ok ? r.json() : {})))
])
  .then(([parts, seriesMap, languageMap, metadataParts]) => {
    const metadata = Object.assign({}, ...metadataParts);
    books = parts.flat().map(book => {
      const meta = metadata[book.id] || {};
      return {...book, series: book.series || seriesMap[book.id] || '', language: languageMap[book.id] || meta.language || '', description: meta.description || ''};
    });
    sortSelect.value='title';
    buildFilters();
    render();
  })
  .catch(err => {
    grid.setAttribute('aria-busy','false');
    grid.innerHTML = `<div class="empty-state">Catalog could not load. ${escapeHtml(err.message)}</div>`;
  });

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);
seriesOnly.addEventListener('change', render);
clearSearch.addEventListener('click', () => {
  searchInput.value=''; activeCategory='All'; sortSelect.value='title'; seriesOnly.checked=false;
  [...filters.children].forEach(el => el.classList.toggle('active', el.dataset.category==='All'));
  render();
});
document.getElementById('year').textContent = new Date().getFullYear();
