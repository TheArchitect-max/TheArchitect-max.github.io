const grid = document.getElementById('collectionsGrid');
const search = document.getElementById('collectionSearch');
const resultCount = document.getElementById('collectionResultCount');
const collectionCount = document.getElementById('collectionCount');
const verifiedCount = document.getElementById('verifiedCount');
document.getElementById('year').textContent = new Date().getFullYear();

function escapeHtml(value='') {
  return String(value).replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}
function normalize(value='') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function groupCollections(books, verified) {
  const groups = new Map();
  books.forEach(book => {
    const key = book.language === 'Nederlands' ? 'Nederlands' : (book.category || 'Uncategorized');
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push({...book, verified:Boolean(verified[book.id]?.verified)});
  });
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      items: items.sort((a,b)=>a.title.localeCompare(b.title)),
      verified: items.filter(item=>item.verified).length
    }))
    .sort((a,b) => {
      if(a.name === 'Nederlands') return -1;
      if(b.name === 'Nederlands') return 1;
      return b.items.length-a.items.length || a.name.localeCompare(b.name);
    });
}
function render(groups) {
  const q = normalize(search.value.trim());
  const visible = groups.filter(group => {
    if(!q) return true;
    return normalize(`${group.name} ${group.items.map(item=>item.title).join(' ')}`).includes(q);
  });
  resultCount.textContent = `${visible.length} ${visible.length === 1 ? 'collection' : 'collections'}`;
  grid.setAttribute('aria-busy','false');
  if(!visible.length){ grid.innerHTML = '<div class="empty-state">No collection matches this search.</div>'; return; }
  grid.innerHTML = visible.map((group,index)=>`
    <section class="collection-card ${group.name === 'Nederlands' ? 'language-collection' : ''}">
      <div class="collection-head">
        <span class="collection-index">${String(index+1).padStart(2,'0')}</span>
        <div>
          <p class="collection-meta">${group.items.length} books · ${group.verified} verified</p>
          <h2>${escapeHtml(group.name)}</h2>
        </div>
      </div>
      <div class="collection-books">
        ${group.items.map(book=>`<a class="collection-book" href="book.html?id=${encodeURIComponent(book.id)}"><span>${escapeHtml(book.title)}</span>${book.verified?'<small>verified</small>':''}<b>↗</b></a>`).join('')}
      </div>
    </section>`).join('');
}

Promise.all([
  Promise.all(['data/books-1.json','data/books-2.json','data/books-3.json','data/books-4.json'].map(path=>fetch(path).then(r=>r.json()))),
  fetch('data/verified-metadata.json').then(r=>r.ok?r.json():{}),
  fetch('data/verified-metadata-2.json').then(r=>r.ok?r.json():{}),
  fetch('data/language-map.json').then(r=>r.ok?r.json():{})
]).then(([parts, verifiedA, verifiedB, languageMap])=>{
  const books = parts.flat().map(book => ({...book, language: languageMap[book.id] || ''}));
  const verified = {...verifiedA,...verifiedB};
  const groups = groupCollections(books, verified);
  collectionCount.textContent = groups.length;
  verifiedCount.textContent = Object.values(verified).filter(item=>item?.verified).length;
  render(groups);
  search.addEventListener('input',()=>render(groups));
}).catch(()=>{
  grid.setAttribute('aria-busy','false');
  grid.innerHTML = '<div class="empty-state">The collections library could not load.</div>';
});
