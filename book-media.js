(() => {
  const AUTHOR = 'Rayford Aquirre';
  const CACHE_KEY = 'ra-book-media-v5';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const countries = ['us', 'nl', 'gb'];
  const LOCAL_COVERS = {
    'massa-2026': 'assets/massa-cover.jpg'
  };
  let catalogPromise = null;
  let retailManifestPromise = null;
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
    const artist = normalize(item?.artistName || '');
    return artist.includes(normalize(AUTHOR));
  }

  async function loadRetailManifest() {
    if (retailManifestPromise) return retailManifestPromise;
    retailManifestPromise = fetch('data/retail-media.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}));
    return retailManifestPromise;
  }

  function manifestItem(book, manifest) {
    const entry = manifest?.[String(book?.id || '')];
    if (!entry) return null;
    const cover = entry.cover || (entry.bnId ? `https://prodimage.images-bn.com/pimages/${entry.bnId}_p0_v1_s1200x1800.jpg` : '');
    return {
      _provider: 'retail-manifest',
      _retailProvider: entry.coverProvider || entry.retailLabel || 'Verified retailer',
      _verifiedStores: entry.verifiedStores || [],
      trackId: String(book?.id || ''),
      trackName: book?.title || '',
      artistName: AUTHOR,
      artworkUrl100: cover,
      trackViewUrl: entry.retailUrl || '',
      description: entry.description || '',
      isbn: entry.isbn || '',
      checkedAt: entry.checkedAt || ''
    };
  }

  function withLocalCover(book, item) {
    const local = LOCAL_COVERS[String(book?.id || '')];
    if(!local) return item;
    return {
      ...(item || {}),
      _localArtwork: local,
      _provider: item?._provider || 'local',
      trackName: item?.trackName || book?.title || '',
      artistName: item?.artistName || AUTHOR
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
    return Array.isArray(data?.results) ? data.results.filter(authorMatches).map(item=>({...item,_provider:'apple'})) : [];
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

  async function titleSearchGoogle(book) {
    const params = new URLSearchParams({
      q: `intitle:${book.title} inauthor:${AUTHOR}`,
      maxResults: '10',
      printType: 'books',
      projection: 'full'
    });
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
    if(!response.ok) return null;
    const data = await response.json();
    const results = Array.isArray(data?.items) ? data.items.map(item => {
      const v = item?.volumeInfo || {};
      const images = v.imageLinks || {};
      return {
        _provider: 'google',
        trackId: item?.id || '',
        trackName: v.title || '',
        artistName: Array.isArray(v.authors) ? v.authors.join(', ') : '',
        description: v.description || '',
        releaseDate: v.publishedDate || '',
        trackViewUrl: v.infoLink || '',
        artworkUrl100: images.extraLarge || images.large || images.medium || images.small || images.thumbnail || images.smallThumbnail || ''
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
    const results = Array.isArray(data?.results) ? data.results.map(item=>({...item,_provider:'apple'})) : [];
    return bestMatch(book, results);
  }

  async function find(book, allowFocusedSearch = true) {
    const manifest = await loadRetailManifest();
    const curated = manifestItem(book, manifest);
    if (curated?.artworkUrl100 || curated?.trackViewUrl || LOCAL_COVERS[String(book?.id || '')]) {
      return withLocalCover(book, curated);
    }

    if (!allowFocusedSearch) {
      return withLocalCover(book, null);
    }

    const key = normalize(book?.title || '');
    if (!key) return withLocalCover(book, null);
    if (!titlePromises.has(key)) {
      titlePromises.set(key, (async () => {
        const google = await titleSearchGoogle(book).catch(() => null);
        if (google) return google;
        const results = await loadCatalog().catch(() => []);
        const fromAppleCatalog = bestMatch(book, results);
        if (fromAppleCatalog) return fromAppleCatalog;
        for (const country of countries) {
          const match = await titleSearchApple(book, country).catch(() => null);
          if (match) return match;
        }
        return null;
      })());
    }
    const focused = await titlePromises.get(key);
    return withLocalCover(book, focused);
  }

  function artworkUrl(item, variant = 'thumb') {
    if(item?._localArtwork) return item._localArtwork;
    let source = item?.artworkUrl100 || item?.artworkUrl60 || '';
    if (!source) return '';
    source = source.replace(/^http:/i,'https:');
    if(item?._provider === 'google'){
      try {
        const url = new URL(source);
        url.searchParams.set('zoom', variant === 'detail' ? '3' : '2');
        return url.toString();
      } catch (_) { return source; }
    }
    if(item?._provider === 'retail-manifest') return source;
    const box = variant === 'detail' ? '1400x2100bb' : '600x900bb';
    return source
      .replace(/\d+x\d+bb(?=\.(?:jpg|png|webp))/i, box)
      .replace(/\d+x\d+bb(?=\/)/i, box);
  }

  function description(item) {
    return String(item?.description || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g,'')
      .trim();
  }

  function sourceLabel(item) {
    if(item?._localArtwork) return 'Local original cover';
    if(item?._provider === 'retail-manifest') return item._retailProvider || 'Verified retailer';
    if(item?._provider === 'google') return 'Google Books';
    if(item?._provider === 'apple') return 'Apple Books';
    return '';
  }

  window.RABookMedia = {
    loadCatalog,
    loadRetailManifest,
    find,
    bestMatch,
    artworkUrl,
    description,
    sourceLabel,
    normalize
  };
})();
