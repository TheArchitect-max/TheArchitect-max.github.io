const grid = document.getElementById('bookGrid');
const searchInput = document.getElementById('searchInput');
const filters = document.getElementById('filters');
const resultCount = document.getElementById('resultCount');
const clearSearch = document.getElementById('clearSearch');
let books = [];
let activeCategory = 'All';

function normalize(v=''){ return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function render(){
  const q = normalize(searchInput.value.trim());
  const visible = books.filter(book => {
    const categoryMatch = activeCategory === 'All' || book.category === activeCategory;
    const haystack = normalize(`${book.title} ${book.series || ''} ${book.category || ''}`);
    return categoryMatch && (!q || haystack.includes(q));
  });
  resultCount.textContent = `${visible.length} ${visible.length === 1 ? 'book' : 'books'}`;
  if(!visible.length){ grid.innerHTML = '<div class="empty-state">No books match this search.</div>'; return; }
  grid.innerHTML = visible.map((book) => {
    const index = books.indexOf(book) + 1;
    const isMassa = book.title === 'MASSA';
    return `<article class="book-card ${isMassa ? 'massa' : ''}" data-title="${book.title.replace(/"/g,'&quot;')}">
      <div>
        <div class="card-number">${String(index).padStart(3,'0')}</div>
        <h3 class="card-title">${book.title}</h3>
        <div class="card-series">${book.series || ''}</div>
      </div>
      <div class="card-bottom">
        <span class="card-category">${book.category}</span>
        ${book.url && book.url.startsWith('http') ? `<a class="card-link" href="${book.url}" target="_blank" rel="noopener">D2D ↗</a>` : '<span class="card-link">New release</span>'}
      </div>
    </article>`;
  }).join('');
}
function buildFilters(){
  const categories = ['All', ...new Set(books.map(b => b.category))];
  filters.innerHTML = categories.map(cat => `<button type="button" class="filter-button ${cat==='All'?'active':''}" data-category="${cat}">${cat}</button>`).join('');
  filters.addEventListener('click', e => {
    const btn = e.target.closest('[data-category]'); if(!btn) return;
    activeCategory = btn.dataset.category;
    [...filters.children].forEach(el => el.classList.toggle('active', el===btn));
    render();
  });
}

Promise.all([
  'data/books-1.json',
  'data/books-2.json',
  'data/books-3.json',
  'data/books-4.json'
].map(path => fetch(path).then(r => {
  if(!r.ok) throw new Error(`Catalog load failed: ${path}`);
  return r.json();
})))
  .then(parts => {
    books = parts.flat();
    buildFilters();
    render();
  })
  .catch(err => { grid.innerHTML = `<div class="empty-state">Catalog could not load. ${err.message}</div>`; });

searchInput.addEventListener('input', render);
clearSearch.addEventListener('click', () => { searchInput.value=''; activeCategory='All'; [...filters.children].forEach(el => el.classList.toggle('active', el.dataset.category==='All')); render(); });
document.querySelector('[data-focus-massa]').addEventListener('click', () => { setTimeout(()=>{ searchInput.value='MASSA'; activeCategory='All'; render(); searchInput.focus(); },350); });
document.getElementById('year').textContent = new Date().getFullYear();
