const grid = document.getElementById('bookGrid');
const searchInput = document.getElementById('searchInput');
const filters = document.getElementById('filters');
const resultCount = document.getElementById('resultCount');
const clearSearch = document.getElementById('clearSearch');
const sortSelect = document.getElementById('sortSelect');
const seriesOnly = document.getElementById('seriesOnly');
let books = [];
let activeCategory = 'All';

function normalize(v=''){ return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
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
function render(){
  const rawQuery = searchInput.value.trim();
  const q = normalize(rawQuery);
  let visible = books.filter(book => {
    const categoryMatch = activeCategory === 'All' ||
      (activeCategory === 'Nederlands' ? book.language === 'Nederlands' : book.category === activeCategory);
    const seriesMatch = !seriesOnly.checked || Boolean(book.series);
    const haystack = normalize(`${book.title} ${book.series || ''} ${book.category || ''} ${book.language || ''}`);
    return categoryMatch && seriesMatch && (!q || haystack.includes(q));
  });
  visible = sortedBooks(visible);
  const isDefaultView = !rawQuery && activeCategory === 'All' && !seriesOnly.checked;
  resultCount.textContent = isDefaultView ? 'Full catalog' : `${visible.length} ${visible.length === 1 ? 'book' : 'books'}`;
  grid.setAttribute('aria-busy','false');
  if(!visible.length){ grid.innerHTML = '<div class="empty-state">No books match the current filters.</div>'; return; }
  grid.innerHTML = visible.map((book) => {
    const index = books.indexOf(book) + 1;
    const isMassa = book.title === 'MASSA';
    const title = escapeHtml(book.title || 'Untitled');
    const series = escapeHtml(book.series || '');
    const category = escapeHtml(book.category || 'Book');
    const language = book.language === 'Nederlands' ? '<span class="card-language">Nederlands</span>' : '';
    const external = book.url && book.url.startsWith('http') ? book.url : '';
    const detailUrl = `book.html?id=${encodeURIComponent(book.id)}`;
    return `<article class="book-card ${isMassa ? 'massa' : ''}" data-title="${title}">
      <a class="card-main-link" href="${detailUrl}" aria-label="Open ${title}">
        <div class="card-number">${String(index).padStart(3,'0')}</div>
        <h3 class="card-title">${title}</h3>
        <div class="card-series">${series}</div>
      </a>
      <div class="card-bottom">
        <span class="card-category">${category}${language}</span>
        <div class="card-actions"><a class="card-link" href="${detailUrl}">Details</a>${external ? `<a class="card-link secondary" href="${escapeHtml(external)}" target="_blank" rel="noopener noreferrer">D2D ↗</a>` : ''}</div>
      </div>
    </article>`;
  }).join('');
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
  fetch('data/language-map.json').then(r => r.ok ? r.json() : {})
])
  .then(([parts, seriesMap, languageMap]) => {
    books = parts.flat().map(book => ({...book, series: book.series || seriesMap[book.id] || '', language: languageMap[book.id] || ''}));
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
  searchInput.value=''; activeCategory='All'; sortSelect.value='catalog'; seriesOnly.checked=false;
  [...filters.children].forEach(el => el.classList.toggle('active', el.dataset.category==='All'));
  render();
});
document.querySelector('[data-focus-massa]').addEventListener('click', () => {
  setTimeout(()=>{
    searchInput.value='MASSA'; activeCategory='All'; seriesOnly.checked=false; sortSelect.value='catalog';
    [...filters.children].forEach(el => el.classList.toggle('active', el.dataset.category==='All'));
    render(); searchInput.focus();
  },350);
});
document.getElementById('year').textContent = new Date().getFullYear();
