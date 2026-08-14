const detail = document.getElementById('bookDetail');
const relatedSection = document.getElementById('relatedSection');
const relatedBooks = document.getElementById('relatedBooks');
const shell = document.getElementById('book-main');

document.getElementById('year').textContent = new Date().getFullYear();

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function seriesRoot(series='') {
  return series.replace(/,\s*#\d+\s*$/,'').trim();
}
function initials(title='') {
  return title.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
}
function coverMarkup(book) {
  if(book.title === 'MASSA') {
    return '<img class="detail-cover-image" src="assets/massa-cover.jpg" alt="MASSA by Rayford Aquirre cover" />';
  }
  return `<div class="generated-cover" aria-label="Cover placeholder for ${escapeHtml(book.title)}"><span class="generated-cover-author">RAYFORD AQUIRRE</span><strong>${escapeHtml(book.title)}</strong><span class="generated-cover-mark">${escapeHtml(initials(book.title))}</span></div>`;
}
function descriptionFor(book) {
  if(book.title === 'MASSA') return 'In Ossara, a ceremonial crowd becomes a system no single participant can fully see. Local decisions, authentic signals, physical pressure, and conflicting responsibilities propagate from body to body until movement itself becomes the engine of suspense.';
  if(book.series) return `Part of ${book.series}. This page is the catalog record for the ebook by Rayford Aquirre. A verified retail description will be added when a reliable public source is available.`;
  return 'This page is the catalog record for this ebook by Rayford Aquirre. A verified retail description will be added when a reliable public source is available.';
}
function updateMetadata(book) {
  const title = `${book.title} — Rayford Aquirre`;
  const description = descriptionFor(book);
  document.title = title;
  let meta = document.querySelector('meta[name="description"]');
  if(!meta){ meta=document.createElement('meta'); meta.name='description'; document.head.appendChild(meta); }
  meta.content = description;
  const canonical = document.createElement('link');
  canonical.rel='canonical';
  canonical.href=`https://thearchitect-max.github.io/book.html?id=${encodeURIComponent(book.id)}`;
  document.head.appendChild(canonical);
}
function renderRelated(book, books) {
  const root = seriesRoot(book.series || '');
  if(!root) return;
  const matches = books.filter(b => b.id !== book.id && seriesRoot(b.series || '') === root);
  if(!matches.length) return;
  relatedSection.hidden = false;
  relatedBooks.innerHTML = matches.map(b => `<a class="related-card" href="book.html?id=${encodeURIComponent(b.id)}"><span>${escapeHtml(b.series || '')}</span><strong>${escapeHtml(b.title)}</strong></a>`).join('');
}

const params = new URLSearchParams(location.search);
const id = params.get('id');
Promise.all([
  Promise.all(['data/books-1.json','data/books-2.json','data/books-3.json','data/books-4.json'].map(path=>fetch(path).then(r=>r.json()))),
  fetch('data/series-map.json').then(r=>r.json())
]).then(([parts, seriesMap]) => {
  const books = parts.flat().map(b => ({...b, series: b.series || seriesMap[b.id] || ''}));
  const book = books.find(b => b.id === id);
  if(!book) throw new Error('Book not found');
  updateMetadata(book);
  const external = book.url && book.url.startsWith('http') ? `<a class="button button-primary" href="${escapeHtml(book.url)}" target="_blank" rel="noopener noreferrer">View on Draft2Digital ↗</a>` : '';
  detail.innerHTML = `
    <div class="detail-cover-column">${coverMarkup(book)}</div>
    <div class="detail-copy">
      <p class="eyebrow">${escapeHtml(book.category || 'BOOK')}</p>
      <h1>${escapeHtml(book.title)}</h1>
      ${book.series ? `<p class="detail-series">${escapeHtml(book.series)}</p>` : ''}
      <p class="detail-author">by <strong>Rayford Aquirre</strong></p>
      <p class="detail-description">${escapeHtml(descriptionFor(book))}</p>
      <div class="detail-actions">${external}<a class="button button-ghost" href="index.html#books">Browse all 118 ebooks</a></div>
      <dl class="detail-facts">
        <div><dt>Format</dt><dd>Ebook</dd></div>
        <div><dt>Catalog ID</dt><dd>${escapeHtml(book.id)}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(book.category || 'Book')}</dd></div>
      </dl>
    </div>`;
  renderRelated(book, books);
  shell.setAttribute('aria-busy','false');
}).catch(() => {
  detail.innerHTML = '<div class="empty-state"><h1>Book not found</h1><p>This catalog record could not be loaded.</p><a class="button button-primary" href="index.html#books">Return to the catalog</a></div>';
  shell.setAttribute('aria-busy','false');
});
