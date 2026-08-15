(() => {
  const AUTHOR = 'Rayford Aquirre';
  const CACHE_KEY = 'ra-apple-book-media-v2';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const countries = ['us', 'nl', 'gb'];
  let catalogPromise = null;
  const titlePromises = new Map();

  function normalize(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\bvol(?:ume)?\.?\s*/g, ' vol ')
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9\p{L}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(value = '') {
    return new Set(normalize(value).split(' ').filter(Boolean));
  }

  function titleScore(a = '', b = '') {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if ((na.startsWith(nb) || nb.startsWith(na)) && Math.min(na.length, nb.length) >= 12) return 0.93;
    const ta = tokens(na);
    const tb = tokens(nb);
    const intersection = [...ta].filter(token => tb.has(token)).length;
    const union = new Set([...ta, ...tb]).size || 1;
    let score = intersection / union;
    const numsA = [...na.matchAll(/\b\d+\b/g)].map(m => m[0]);
    const numsB = [...nb.matchAll(/\b\d+\b/g)].map(m => m[0]);
    if (numsA.length || numsB.length) {
      if (numsA.join(',') !== numsB.join(',')) score *= 0.55;
    }
    return score;
  }

  function authorMatches(item) {
    const artist = normalize(item?.artistName || item?.artistViewUrl || '');
    return artist.includes(normalize(AUTHOR));
  }

  function dedupe(results = []) {
    const seen = new Set();
    return results.filter(item => {
      const key = `${item.trackId || ''}:${normalize(item.trackName || '')}`;
      if (!item.trackName || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function jsonp(url, timeout = 9000) {
    return new Promise((resolve, reject) => {
      const callback = `__raMedia_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => cleanup(new Error('Book media request timed out')), timeout);
      function cleanup(error, data) {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
        error ? reject(error) : resolve(data);
      }
      window[callback] = data => cleanup(null, data);
      script.onerror = () => cleanup(new Error('Book media request failed'));
      script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${encodeURIComponent(callback)}`;
      document.head.appendChild(script);
    });
  }

  async function authorSearch(country) {
    const params = new URLSearchParams({
      term: AUTHOR,
      entity: 'ebook',
      attribute: 'authorTerm',
      limit: '200',
      country
    });
    const data = await jsonp(`https://itunes.apple.com/search?${params}`);
    return Array.isArray(data?.results) ? data.results.filter(authorMatches) : [];
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (parsed && Array.isArray(parsed.results) && Date.now() - parsed.time < CACHE_TTL) return parsed.results;
    } catch (_) {}
    return null;
  }

  function writeCache(results) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), results })); } catch (_) {}
  }

  async function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
      const cached = readCache();
      if (cached) return cached;
      const batches = await Promise.all(countries.map(country => authorSearch(country).catch(() => [])));
      const results = dedupe(batches.flat());
      if (results.length) writeCache(results);
      return results;
    })();
    return catalogPromise;
  }

  function bestMatch(book, results = []) {
    let best = null;
    let bestScore = 0;
    results.forEach(item => {
      if (!authorMatches(item)) return;
      const score = titleScore(book?.title || '', item.trackName || '');
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });
    return bestScore >= 0.68 ? best : null;
  }

  async function titleSearch(book, country) {
    const params = new URLSearchParams({
      term: `${book.title} ${AUTHOR}`,
      entity: 'ebook',
      limit: '15',
      country
    });
    const data = await jsonp(`https://itunes.apple.com/search?${params}`);
    return bestMatch(book, Array.isArray(data?.results) ? data.results : []);
  }

  async function find(book, allowFocusedSearch = true) {
    const results = await loadCatalog().catch(() => []);
    const fromCatalog = bestMatch(book, results);
    if (fromCatalog || !allowFocusedSearch) return fromCatalog;
    const key = normalize(book?.title || '');
    if (!key) return null;
    if (!titlePromises.has(key)) {
      titlePromises.set(key, (async () => {
        for (const country of countries) {
          const match = await titleSearch(book, country).catch(() => null);
          if (match) return match;
        }
        return null;
      })());
    }
    return titlePromises.get(key);
  }

  function artworkUrl(item, variant = 'thumb') {
    const source = item?.artworkUrl100 || item?.artworkUrl60 || '';
    if (!source) return '';
    const box = variant === 'detail' ? '1400x2100bb' : '600x900bb';
    return source
      .replace(/\d+x\d+bb(?=\.(?:jpg|png|webp))/i, box)
      .replace(/\d+x\d+bb(?=\/)/i, box);
  }

  function description(item) {
    return String(item?.description || '').replace(/<br\s*\/?>/gi, '\n').trim();
  }

  window.RABookMedia = {
    loadCatalog,
    find,
    bestMatch,
    artworkUrl,
    description,
    normalize
  };
})();
