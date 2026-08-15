const detail = document.getElementById('bookDetail');
const relatedSection = document.getElementById('relatedSection');
const relatedBooks = document.getElementById('relatedBooks');
const shell = document.getElementById('book-main');

document.getElementById('year').textContent = new Date().getFullYear();

function escapeHtml(value='') {
  return String(value).replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}
function seriesRoot(series='') {
  return series.replace(/,\s*#\d+\s*$/,'').trim();
}
function initials(title='') {
  return title.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
}
function identityMarkup(book) {
  return `<div class="book-identity" aria-label="Cover not yet available for ${escapeHtml(book.title)}"><span class="book-identity-author">RAYFORD AQUIRRE</span><strong>${escapeHtml(book.title)}</strong><span class="book-identity-mark">${escapeHtml(initials(book.title))}</span></div>`;
}
function descriptionFor(book, meta={}, media=null) {
  const mediaDescription = window.RABookMedia?.description(media) || '';
  if(mediaDescription) return mediaDescription;
  if(meta.description) return meta.description;
  return 'A verified full description is not yet available for this catalog record.';
}
function updateMetadata(book, meta={}, media=null) {
  const title = `${book.title} — Rayford Aquirre`;
  const description = descriptionFor(book, meta, media);
  document.title = title;
  let descMeta = document.querySelector('meta[name="description"]');
  if(!descMeta){ descMeta=document.createElement('meta'); descMeta.name='description'; document.head.appendChild(descMeta); }
  descMeta.content = description.replace(/\s+/g,' ').slice(0,300);
  let canonical = document.querySelector('link[rel="canonical"]');
  if(!canonical){ canonical = document.createElement('link'); canonical.rel='canonical'; document.head.appendChild(canonical); }
  canonical.href=`https://thearchitect-max.github.io/book.html?id=${encodeURIComponent(book.id)}`;
  const cover = window.RABookMedia?.artworkUrl(media, 'detail') || '';
  if(cover){
    let ogImage = document.querySelector('meta[property="og:image"]');
    if(!ogImage){ ogImage=document.createElement('meta'); ogImage.setAttribute('property','og:image'); document.head.appendChild(ogImage); }
    ogImage.content=cover;
  }
}
function coverMarkup(book, media=null) {
  const src = window.RABookMedia?.artworkUrl(media, 'detail') || '';
  if(src){
    return `<div class="detail-cover-frame"><img src="${escapeHtml(src)}" alt="Cover of ${escapeHtml(book.title)} by Rayford Aquirre" decoding="async" /></div>`;
  }
  return `<div class="detail-cover-frame">${identityMarkup(book)}</div>`;
}
function renderRelated(book, books) {
  const root = seriesRoot(book.series || '');
  if(!root) return;
  const matches = books.filter(b => b.id !== book.id && seriesRoot(b.series || '') === root);
  if(!matches.length) return;
  relatedSection.hidden = false;
  relatedBooks.innerHTML = matches.map(b => `<a class="related-card" href="book.html?id=${encodeURIComponent(b.id)}"><span>${escapeHtml(b.series || '')}</span><strong>${escapeHtml(b.title)}</strong></a>`).join('');
}
function renderFacts(book, meta={}, media=null) {
  const language = book.language || meta.language || media?.formattedPrice && media?.country ? '' : meta.language;
  const rows = [
    ['Format','Ebook'],
    ['Catalog ID',book.id],
    ['Category',meta.genre || book.category || 'Book'],
    ['Language',language],
    ['ISBN',meta.isbn],
    ['Release date',meta.releaseDate || (media?.releaseDate ? String(media.releaseDate).slice(0,10) : '')],
    ['Pages',meta.pages]
  ].filter(([,value]) => value !== undefined && value !== null && value !== '');
  return rows.map(([label,value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}
function renderSources(meta={}, media=null) {
  const links = [];
  if(media?.trackViewUrl) links.push({label:'Apple Books',url:media.trackViewUrl});
  if(Array.isArray(meta.sources)){
    meta.sources.forEach(src=>{
      if(!src?.url || links.some(link=>link.url===src.url)) return;
      links.push(src);
    });
  }
  if(!links.length) return '';
  return `<div class="detail-sources"><p class="eyebrow">PUBLIC BOOK LINKS</p><div class="source-links">${links.map(src => `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.label)} ↗</a>`).join('')}</div></div>`;
}

const params = new URLSearchParams(location.search);
const id = params.get('id');
Promise.all([
  Promise.all(['data/books-1.json','data/books-2.json','data/books-3.json','data/books-4.json'].map(path=>fetch(path).then(r=>r.json()))),
  fetch('data/series-map.json').then(r=>r.json()),
  fetch('data/language-map.json').then(r=>r.ok?r.json():{}),
  Promise.all([
    fetch('data/verified-metadata.json').then(r=>r.ok?r.json():{}),
    fetch('data/verified-metadata-2.json').then(r=>r.ok?r.json():{})
  ])
]).then(async ([parts, seriesMap, languageMap, metadataParts]) => {
  const verifiedMetadata = Object.assign({}, ...metadataParts);
  const books = parts.flat().map(b => ({...b, series: b.series || seriesMap[b.id] || '', language: languageMap[b.id] || ''}));
  const book = books.find(b => b.id === id);
  if(!book) throw new Error('Book not found');
  const meta = verifiedMetadata[book.id] || {};
  const media = window.RABookMedia ? await window.RABookMedia.find(book, true).catch(()=>null) : null;
  updateMetadata(book, meta, media);
  const retailUrl = media?.trackViewUrl || '';
  const d2dUrl = book.url && book.url.startsWith('http') ? book.url : '';
  const primaryAction = retailUrl
    ? `<a class="button button-primary" href="${escapeHtml(retailUrl)}" target="_blank" rel="noopener noreferrer">View book ↗</a>`
    : (d2dUrl ? `<a class="button button-primary" href="${escapeHtml(d2dUrl)}" target="_blank" rel="noopener noreferrer">View book ↗</a>` : '');
  const fullDescription = Boolean(window.RABookMedia?.description(media));
  detail.innerHTML = `
    <div class="detail-identity-column">${coverMarkup(book, media)}</div>
    <div class="detail-copy">
      <p class="eyebrow">${escapeHtml(book.language === 'Nederlands' ? 'NEDERLANDS' : (meta.genre || book.category || 'BOOK'))}</p>
      <h1>${escapeHtml(meta.retailTitle || book.title)}</h1>
      ${book.series ? `<p class="detail-series">${escapeHtml(book.series)}</p>` : ''}
      <p class="detail-author">by <strong>Rayford Aquirre</strong></p>
      ${meta.verified ? '<p class="verified-badge">Verified metadata</p>' : ''}
      <p class="detail-description ${fullDescription ? 'is-full' : ''}">${escapeHtml(descriptionFor(book, meta, media))}</p>
      <div class="detail-actions">${primaryAction}<a class="button button-ghost" href="index.html#books">Browse all ebooks</a></div>
      <dl class="detail-facts">${renderFacts(book, meta, media)}</dl>
      ${renderSources(meta, media)}
    </div>`;
  renderRelated(book, books);
  shell.setAttribute('aria-busy','false');
}).catch(() => {
  detail.innerHTML = '<div class="empty-state"><h1>Book not found</h1><p>This catalog record could not be loaded.</p><a class="button button-primary" href="index.html#books">Return to the catalog</a></div>';
  shell.setAttribute('aria-busy','false');
});
