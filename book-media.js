(() => {
  const AUTHOR = 'Rayford Aquirre';
  const CACHE_KEY = 'ra-book-metadata-v6';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const countries = ['us', 'nl', 'gb'];
  let appleCatalogPromise = null;
  let retailManifestPromise = null;
  let d2dManifestPromise = null;
  const metadataPromises = new Map();

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
    return normalize(item?.artistName || '').includes(normalize(AUTHOR));
  }

  async function loadD2DManifest() {
    if (d2dManifestPromise) return d2dManifestPromise;
    d2dManifestPromise = fetch('data/d2d-media.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}));
    return d2dManifestPromise;
  }

  async function loadRetailManifest() {
    if (retailManifestPromise) return retailManifestPromise;
    retailManifestPromise = fetch('data/retail-media.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}));
    return retailManifestPromise;
  }

  function canonicalCover(book, d2dManifest) {
    const entry = d2dManifest?.[String(book?.id || '')];
    if (!entry?.cover) return null;
    return {
      _provider: 'd2d-canonical',
      _coverProvider: 'Draft2Digital',
      _coverCheckedAt: entry.checkedAt || '',
      trackId: String(book?.id || ''),
      trackName: book?.title || '',
      artistName: AUTHOR,
      artworkUrl100: entry.cover,
      description: entry.description || '',
      trackViewUrl: entry.retailUrl || '',
      isbn: entry.isbn || ''
    };
  }

  function retailMetadata(book, retailManifest) {
    const entry = retailManifest?.[String(book?.id || '')];
    if (!entry) return null;
    return {
      _provider: 'retail-metadata',
      _retailProvider: entry.retailLabel || entry.coverProvider || 'Retailer',
      _verifiedStores: entry.verifiedStores || [],
      trackId: String(book?.id || ''),
      trackName: book?.title || '',
      artistName: AUTHOR,
      trackViewUrl: entry.retailUrl || '',
      description: entry.description || '',
      isbn: entry.isbn || '',
      checkedAt: entry.checkedAt || ''
    };
  }

  function mergeMetadata(primary, secondary) {
    if (!primary && !secondary) return null;
    return {
      ...(secondary || {}),
      ...(primary || {}),
      artworkUrl100: primary?.artworkUrl100 || '',
      _provider: primary?._provider || secondary?._provider || '',
      _coverProvider: primary?._coverProvider || '',
      trackViewUrl: primary?.trackViewUrl || secondary?.trackViewUrl || '',
      description: primary?.description || secondary?.description || '',
      isbn: primary?.isbn || secondary?.isbn || ''
    };
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
      const callback = `__raMeta_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => cleanup(new Error('Book metadata request timed out')), timeout);
      function cleanup(error, data) {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
        error ? reject(error) : resolve(data);
      }
      window[callback] = data => cleanup(null, data);
      script.onerror = () => cleanup(new Error('Book metadata request failed'));
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
    return Array.isArray(data?.results)
      ? data.results.filter(authorMatches).map(item => ({ ...item, _provider: 'apple-metadata', artworkUrl100: '' }))
      : [];
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
    if (appleCatalogPromise) return appleCatalogPromise;
    appleCatalogPromise = (async () => {
      const cached = readCache();
      if (cached) return cached;
      const batches = await Promise.all(countries.map(country => authorSearch(country).catch(() => [])));
      const results = dedupe(batches.flat());
      if (results.length) writeCache(results);
      return results;
    })();
    return appleCatalogPromise;
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

  async function titleSearchGoogle(book) {
    const params = new URLSearchParams({
      q: `intitle:${book.title} inauthor:${AUTHOR}`,
      maxResults: '10',
      printType: 'books',
      projection: 'full'
    });
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
    if (!response.ok) return null;
    const data = await response.json();
    const results = Array.isArray(data?.items) ? data.items.map(item => {
      const v = item?.volumeInfo || {};
      return {
        _provider: 'google-metadata',
        trackId: item?.id || '',
        trackName: v.title || '',
        artistName: Array.isArray(v.authors) ? v.authors.join(', ') : '',
        description: v.description || '',
        releaseDate: v.publishedDate || '',
        trackViewUrl: v.infoLink || '',
        artworkUrl100: ''
      };
    }) : [];
    return bestMatch(book, results);
  }

  async function titleSearchApple(book, country) {
    const params = new URLSearchParams({
      term: `${book.title} ${AUTHOR}`,
      entity: 'ebook',
      limit: '15',
      country
    });
    const data = await jsonp(`https://itunes.apple.com/search?${params}`);
    const results = Array.isArray(data?.results)
      ? data.results.map(item => ({ ...item, _provider: 'apple-metadata', artworkUrl100: '' }))
      : [];
    return bestMatch(book, results);
  }

  async function externalMetadata(book) {
    const key = normalize(book?.title || '');
    if (!key) return null;
    if (!metadataPromises.has(key)) {
      metadataPromises.set(key, (async () => {
        const google = await titleSearchGoogle(book).catch(() => null);
        if (google) return google;
        const catalog = await loadCatalog().catch(() => []);
        const fromAppleCatalog = bestMatch(book, catalog);
        if (fromAppleCatalog) return fromAppleCatalog;
        for (const country of countries) {
          const match = await titleSearchApple(book, country).catch(() => null);
          if (match) return match;
        }
        return null;
      })());
    }
    return metadataPromises.get(key);
  }

  async function find(book, allowFocusedSearch = true) {
    const [d2dManifest, retailManifest] = await Promise.all([loadD2DManifest(), loadRetailManifest()]);
    const cover = canonicalCover(book, d2dManifest);
    const retail = retailMetadata(book, retailManifest);

    if (!allowFocusedSearch) return mergeMetadata(cover, retail);

    const external = await externalMetadata(book).catch(() => null);
    const metadata = retail || external;
    return mergeMetadata(cover, metadata);
  }

  function artworkUrl(item) {
    return item?.artworkUrl100 || '';
  }

  function description(item) {
    return String(item?.description || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  function sourceLabel(item) {
    if (item?._coverProvider === 'Draft2Digital') return 'Draft2Digital';
    return '';
  }

  function metadataSourceLabel(item) {
    if (item?._retailProvider) return item._retailProvider;
    if (item?._provider === 'google-metadata') return 'Google Books';
    if (item?._provider === 'apple-metadata') return 'Apple Books';
    return '';
  }

  window.RABookMedia = {
    loadCatalog,
    loadD2DManifest,
    loadRetailManifest,
    find,
    bestMatch,
    artworkUrl,
    description,
    sourceLabel,
    metadataSourceLabel,
    normalize
  };
})();
