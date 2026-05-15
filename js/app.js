(() => {
  'use strict';

  // ============================================================
  // 設定
  // ============================================================
  // mode 可為 'meal'（依時段標籤）或 'category'（依類別字串包含關鍵字）
  const MEAL_LABEL = {
    'early-brunch': { tag: '早餐',   mode: 'meal',     filter: ['早餐'] },
    'lunch':        { tag: '午餐',   mode: 'meal',     filter: ['午餐'] },
    'afternoon':    { tag: '下午茶', mode: 'meal',     filter: ['下午茶'] },
    'dinner':       { tag: '晚餐',   mode: 'meal',     filter: ['晚餐'] },
    'midnight':     { tag: '宵夜',   mode: 'meal',     filter: ['宵夜'] },
    'drinks':       { tag: '手搖飲', mode: 'category', filter: ['手搖飲', '飲料'] },
    'any':          { tag: '隨便',   mode: 'meal',     filter: null }
  };

  const ROLLING_EMOJIS = ['🍜','🍱','🍕','🍔','🍣','🥟','🍲','🍰','🧋','🍢','🍙','🥗'];

  const STORAGE = {
    OSM_CACHE: 'wte_osm_cache_v2', // bump to invalidate old caches lacking 手搖飲 tags
    CUSTOM:    'wte_custom_v1',
    BLACKLIST: 'wte_blacklist_v1',
    FAVORITES: 'wte_favorites_v1'
  };

  // OSM 資料 7 天時效
  const OSM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // 豐原區大致範圍 (lat min, lon min, lat max, lon max)，外擴一點以涵蓋邊界店家
  const FENGYUAN_BBOX = [24.210, 120.690, 24.290, 120.775];

  // OSM amenity → 顯示類型
  const CUISINE_MAP = {
    'chinese': '中式', 'taiwanese': '台式', 'japanese': '日式', 'sushi': '日式',
    'korean': '韓式', 'thai': '泰式', 'vietnamese': '越式', 'italian': '義式',
    'pizza': '披薩', 'american': '美式', 'burger': '美式',
    'noodle': '麵食', 'ramen': '日式', 'dumpling': '小吃',
    'breakfast': '早餐', 'cafe': '咖啡', 'coffee_shop': '咖啡',
    'bubble_tea': '飲料', 'tea': '飲料', 'ice_cream': '甜品',
    'bbq': '燒烤', 'hot_pot': '火鍋', 'steak_house': '排餐',
    'vegetarian': '素食', 'vegan': '素食', 'sandwich': '輕食',
    'bakery': '烘焙', 'dessert': '甜品'
  };

  // cuisine / shop tag 中視為手搖飲的關鍵字
  const DRINK_KEYWORDS = ['bubble_tea', 'tea', 'beverage', 'juice', 'smoothie', '手搖', '飲料', '茶飲'];

  const AMENITY_DEFAULT_TYPE = {
    'restaurant': '餐廳',
    'cafe': '咖啡',
    'fast_food': '速食',
    'food_court': '美食街',
    'bar': '酒吧',
    'pub': '酒館',
    'bakery': '烘焙',
    'ice_cream': '甜品'
  };

  const SHOP_DEFAULT_TYPE = {
    'bakery': '烘焙',
    'pastry': '甜點',
    'confectionery': '甜品',
    'bubble_tea': '手搖飲',
    'coffee': '咖啡',
    'tea': '手搖飲',
    'deli': '熟食',
    'butcher': '肉舖',
    'seafood': '海鮮',
    'cheese': '起司',
    'chocolate': '巧克力',
    'dairy': '乳製品',
    'frozen_food': '冷凍食品',
    'greengrocer': '蔬果',
    'health_food': '健康食品'
  };

  function isDrink(item) {
    const cuisine = (item.cuisine || '').toLowerCase();
    const name = (item.name || '');
    const type = (item.type || '');
    return DRINK_KEYWORDS.some(k =>
      cuisine.includes(k) || name.includes(k) || type.includes(k)
    );
  }

  // 依類型/amenity/shop 推測適合的時段
  function inferTags(item) {
    const tags = new Set();
    const amen = item.amenity || '';
    const shop = item.shop || '';
    const type = (item.type || '').toLowerCase();
    const cuisine = (item.cuisine || '').toLowerCase();

    if (isDrink(item) || shop === 'bubble_tea' || shop === 'tea') {
      tags.add('手搖飲'); tags.add('下午茶');
      return Array.from(tags);
    }

    if (amen === 'cafe' || amen === 'bakery' || shop === 'bakery' || shop === 'coffee' || cuisine.includes('coffee')) {
      tags.add('早餐'); tags.add('下午茶');
    }
    if (shop === 'pastry' || shop === 'confectionery' || shop === 'chocolate') {
      tags.add('下午茶');
    }
    if (cuisine.includes('breakfast') || type.includes('早餐')) {
      tags.add('早餐');
    }
    if (amen === 'bar' || amen === 'pub') {
      tags.add('晚餐'); tags.add('宵夜');
    }
    if (amen === 'fast_food') {
      tags.add('午餐'); tags.add('晚餐'); tags.add('宵夜');
    }
    if (amen === 'ice_cream' || cuisine.includes('dessert') || cuisine.includes('ice_cream')) {
      tags.add('下午茶');
    }

    // 沒有特殊推斷則給「午餐 + 晚餐」（多數餐廳）
    if (tags.size === 0) {
      tags.add('午餐'); tags.add('晚餐');
    }
    return Array.from(tags);
  }

  // ============================================================
  // 工具
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function haptic(ms = 15) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
  }

  function uid() {
    return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // 建立 Google Maps 搜尋 URL：以「店名 + 地址」為主，地圖會自動跳到該商家頁
  // （顯示評論、照片、營業時間、電話）。座標僅在沒店名時做 fallback。
  function buildMapUrl(item) {
    const base = 'https://www.google.com/maps/search/?api=1&query=';
    if (item.name) {
      // 店名 + 地址，盡量讓 Google 命中商家
      const addr = item.address || '台中豐原';
      return base + encodeURIComponent(item.name + ' ' + addr);
    }
    // 沒店名才退回座標
    if (item.lat && item.lon) return base + item.lat + ',' + item.lon;
    return base + encodeURIComponent('台中豐原');
  }

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  // ============================================================
  // OSM 資料層
  // ============================================================
  function buildOverpassQuery(bbox) {
    const [s, w, n, e] = bbox;
    const amenityRe = '^(restaurant|cafe|fast_food|food_court|bar|pub|bakery|ice_cream)$';
    const shopRe = '^(bakery|pastry|confectionery|bubble_tea|coffee|tea|deli|butcher|seafood|cheese|chocolate|dairy|farm|frozen_food|greengrocer|health_food)$';
    return `
[out:json][timeout:30];
(
  node["amenity"~"${amenityRe}"](${s},${w},${n},${e});
  way["amenity"~"${amenityRe}"](${s},${w},${n},${e});
  node["shop"~"${shopRe}"](${s},${w},${n},${e});
  way["shop"~"${shopRe}"](${s},${w},${n},${e});
);
out center tags;
`.trim();
  }

  function normalizeOsm(elements) {
    const seen = new Set();
    const list = [];
    for (const el of elements) {
      const t = el.tags || {};
      const name = t.name || t['name:zh'] || t['name:zh-TW'];
      if (!name) continue;
      const key = name + '|' + (t['addr:full'] || t['addr:street'] || '');
      if (seen.has(key)) continue;
      seen.add(key);

      const cuisine = (t.cuisine || '').split(';')[0].trim();
      const amenity = t.amenity || '';
      const shop = t.shop || '';
      let typeLabel =
        CUISINE_MAP[cuisine] ||
        AMENITY_DEFAULT_TYPE[amenity] ||
        SHOP_DEFAULT_TYPE[shop] ||
        '餐廳';
      if (isDrink({ cuisine, name, type: typeLabel })) typeLabel = '手搖飲';

      const addrParts = [];
      if (t['addr:city']) addrParts.push(t['addr:city']);
      if (t['addr:district']) addrParts.push(t['addr:district']);
      if (t['addr:street'] || t['addr:road']) {
        addrParts.push((t['addr:street'] || t['addr:road']) + (t['addr:housenumber'] ? t['addr:housenumber'] + '號' : ''));
      }
      const address = addrParts.join('') || (t['addr:full'] || '');

      const lat = el.lat || (el.center && el.center.lat);
      const lon = el.lon || (el.center && el.center.lon);

      list.push({
        id: 'osm_' + el.type + '_' + el.id,
        source: 'osm',
        name,
        type: typeLabel,
        amenity,
        shop,
        cuisine,
        tags: inferTags({ amenity, shop, cuisine, name, type: typeLabel }),
        highlight: t.description || t['description:zh'] || '',
        price: '',
        address,
        lat, lon
      });
    }
    return list;
  }

  async function fetchOsm() {
    const query = buildOverpassQuery(FENGYUAN_BBOX);
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];
    let lastErr;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return normalizeOsm(data.elements || []);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('OSM 抓取失敗');
  }

  function getCachedOsm() {
    const cache = lsGet(STORAGE.OSM_CACHE);
    if (!cache || !cache.fetchedAt || !Array.isArray(cache.data)) return null;
    const expired = (Date.now() - cache.fetchedAt) > OSM_TTL_MS;
    return { data: cache.data, fetchedAt: cache.fetchedAt, expired };
  }

  function saveOsmCache(data) {
    lsSet(STORAGE.OSM_CACHE, { fetchedAt: Date.now(), data });
  }

  // ============================================================
  // State
  // ============================================================
  const state = {
    osmList: [],
    seedList: [],
    customList: lsGet(STORAGE.CUSTOM, []),
    blacklist: new Set(lsGet(STORAGE.BLACKLIST, [])),
    favorites: new Set(lsGet(STORAGE.FAVORITES, [])),
    pool: [],
    lastIndex: -1,
    rollCount: 0,
    currentMeal: null,
    currentResult: null,
    osmStatus: 'idle' // idle | loading | ok | error
  };

  function persistCustom() { lsSet(STORAGE.CUSTOM, state.customList); }
  function persistBlacklist() { lsSet(STORAGE.BLACKLIST, Array.from(state.blacklist)); }
  function persistFavorites() { lsSet(STORAGE.FAVORITES, Array.from(state.favorites)); }

  function allRestaurants() {
    // 用 name+address 作為去重 key（OSM 與 seed 同名不重複）
    const map = new Map();
    const add = (r) => {
      const key = (r.name || '') + '|' + (r.address || '');
      if (!map.has(key)) map.set(key, r);
    };
    state.osmList.forEach(add);
    state.seedList.forEach(add);
    state.customList.forEach(add);
    return Array.from(map.values());
  }

  // ============================================================
  // 抽選
  // ============================================================
  function buildPool(mealKey) {
    const meal = MEAL_LABEL[mealKey];
    const all = allRestaurants().filter(r => !state.blacklist.has(r.id));
    if (!meal || !meal.filter) return all;
    if (meal.mode === 'category') {
      // 用類型/標籤同時比對，較鬆
      return all.filter(r =>
        meal.filter.includes(r.type) ||
        (r.tags || []).some(t => meal.filter.includes(t))
      );
    }
    // meal mode: 比對 tags
    return all.filter(r => (r.tags || []).some(t => meal.filter.includes(t)));
  }

  function pickOne(pool) {
    if (pool.length === 0) return null;
    if (pool.length === 1) return 0;
    let idx, attempts = 0;
    do {
      idx = Math.floor(Math.random() * pool.length);
      attempts++;
    } while (idx === state.lastIndex && attempts < 5);
    return idx;
  }

  // ============================================================
  // 流程
  // ============================================================
  async function start(mealKey) {
    state.currentMeal = mealKey;
    state.pool = buildPool(mealKey);
    state.lastIndex = -1;
    state.rollCount = 0;

    if (state.pool.length === 0) {
      toast('找不到符合的店家，試試其他時段');
      return;
    }
    await rollAndShow();
  }

  async function rollAndShow() {
    showStage('rolling');
    haptic();

    const rollingEmoji = $('#rolling-emoji');
    let i = 0;
    const rollTimer = setInterval(() => {
      rollingEmoji.textContent = ROLLING_EMOJIS[i % ROLLING_EMOJIS.length];
      i++;
    }, 100);

    await sleep(1000);
    clearInterval(rollTimer);

    const idx = pickOne(state.pool);
    if (idx === null) {
      toast('找不到符合的店家');
      showStage('hero');
      return;
    }
    state.lastIndex = idx;
    state.rollCount++;
    state.currentResult = state.pool[idx];

    renderResult(state.currentResult);
    showStage('result');
    haptic();
  }

  function renderResult(r) {
    const meal = MEAL_LABEL[state.currentMeal];
    $('#result-meal-tag').textContent = meal.tag;
    $('#result-counter').textContent = `第 ${state.rollCount} 次`;
    $('#result-name').textContent = r.name;
    $('#result-type').textContent = r.type + (r.source === 'custom' ? ' · 我的私藏' : '');
    $('#result-highlight').textContent = r.highlight || (r.address ? '位於 ' + r.address : '');
    $('#result-price').textContent = r.price || '';
    $('#result-address').textContent = r.address || '';
    if (!r.price && !r.address) {
      $('#result-price').textContent = '';
      $('#result-address').textContent = '';
    }

    // 地圖連結（用店名搜尋讓 Google 命中商家頁）
    $('#btn-map').href = buildMapUrl(r);

    // 收藏狀態
    const favBtn = $('#btn-fav');
    if (state.favorites.has(r.id)) {
      favBtn.classList.add('on');
      favBtn.textContent = '★ 已收藏';
    } else {
      favBtn.classList.remove('on');
      favBtn.textContent = '☆ 收藏';
    }
  }

  // ============================================================
  // 黑名單 / 收藏
  // ============================================================
  function blacklistCurrent() {
    const r = state.currentResult;
    if (!r) return;
    state.blacklist.add(r.id);
    persistBlacklist();
    toast('已封鎖：' + r.name + '，不會再推薦');
    // 移出當前 pool
    state.pool = state.pool.filter(p => p.id !== r.id);
    state.lastIndex = -1;
    if (state.pool.length === 0) {
      toast('該時段已沒有可推薦的店家');
      showStage('hero');
      return;
    }
    rollAndShow();
  }

  function toggleFavorite() {
    const r = state.currentResult;
    if (!r) return;
    if (state.favorites.has(r.id)) {
      state.favorites.delete(r.id);
      toast('已取消收藏');
    } else {
      state.favorites.add(r.id);
      toast('已加入收藏 ★');
    }
    persistFavorites();
    renderResult(r);
  }

  // ============================================================
  // 自訂店家
  // ============================================================
  function openAddPanel(prefill = {}) {
    const panel = $('#add-panel');
    $('#add-name').value = prefill.name || '';
    $('#add-type').value = prefill.type || '';
    $('#add-address').value = prefill.address || '';
    $('#add-highlight').value = prefill.highlight || '';
    document.querySelectorAll('#add-tags .chip').forEach(c => c.classList.remove('on'));
    if (prefill.tags) {
      document.querySelectorAll('#add-tags .chip').forEach(c => {
        if (prefill.tags.includes(c.dataset.tag)) c.classList.add('on');
      });
    }
    panel.dataset.editing = prefill.id || '';
    $('#add-title').textContent = prefill.id ? '編輯店家' : '新增店家';
    $('#add-delete').hidden = !prefill.id;
    panel.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#add-name').focus(), 100);
  }

  function closeAddPanel() {
    $('#add-panel').setAttribute('aria-hidden', 'true');
  }

  function saveCustom() {
    const name = $('#add-name').value.trim();
    if (!name) { toast('請輸入店名'); return; }
    const type = $('#add-type').value.trim() || '私藏';
    const address = $('#add-address').value.trim();
    const highlight = $('#add-highlight').value.trim();
    const tags = Array.from(document.querySelectorAll('#add-tags .chip.on')).map(c => c.dataset.tag);
    if (tags.length === 0) tags.push('午餐', '晚餐');

    const editingId = $('#add-panel').dataset.editing;
    if (editingId) {
      const idx = state.customList.findIndex(r => r.id === editingId);
      if (idx >= 0) {
        state.customList[idx] = { ...state.customList[idx], name, type, address, highlight, tags };
        toast('已更新：' + name);
      }
    } else {
      state.customList.push({
        id: uid(),
        source: 'custom',
        name, type, tags, highlight, price: '', address,
        createdAt: Date.now()
      });
      toast('已新增：' + name);
    }
    persistCustom();
    closeAddPanel();
    if ($('#list-panel').getAttribute('aria-hidden') === 'false') renderList($('#search-input').value);
  }

  function deleteCustom() {
    const id = $('#add-panel').dataset.editing;
    if (!id) return;
    if (!confirm('確定刪除這家店嗎？')) return;
    state.customList = state.customList.filter(r => r.id !== id);
    persistCustom();
    closeAddPanel();
    if ($('#list-panel').getAttribute('aria-hidden') === 'false') renderList($('#search-input').value);
    toast('已刪除');
  }

  // ============================================================
  // 清單頁
  // ============================================================
  function toggleListPanel(open) {
    const panel = $('#list-panel');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) renderList();
  }

  function renderList(query = '') {
    const ul = $('#list-items');
    const empty = $('#list-empty');
    const filterMode = $('#list-panel').dataset.filter || 'all';
    const q = query.trim().toLowerCase();

    let pool;
    if (filterMode === 'fav') {
      pool = allRestaurants().filter(r => state.favorites.has(r.id));
    } else if (filterMode === 'custom') {
      pool = state.customList.slice();
    } else if (filterMode === 'blocked') {
      pool = allRestaurants().filter(r => state.blacklist.has(r.id));
    } else {
      pool = allRestaurants().filter(r => !state.blacklist.has(r.id));
    }

    const matched = pool.filter(r => {
      if (!q) return true;
      return [r.name, r.type, r.address, r.highlight, ...(r.tags || [])]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(q));
    });

    // Counts
    $('#list-count').textContent = matched.length + ' 家';

    ul.innerHTML = matched.map(r => {
      const isFav = state.favorites.has(r.id);
      const isCustom = r.source === 'custom';
      const isBlocked = state.blacklist.has(r.id);
      return `
        <li class="list-item" data-id="${escapeHtml(r.id)}">
          <div class="list-item-row">
            <span class="list-item-name">
              ${isFav ? '<span class="list-fav">★</span> ' : ''}${escapeHtml(r.name)}
            </span>
            <span class="list-item-type">${escapeHtml(r.type)}${isCustom ? ' · 私藏' : ''}</span>
          </div>
          <div class="list-item-meta">
            ${(r.tags || []).map(t => '#' + escapeHtml(t)).join(' ')}
            ${r.highlight ? ' · ' + escapeHtml(r.highlight) : ''}
            ${r.address ? ' · ' + escapeHtml(r.address) : ''}
            ${isBlocked ? ' · <span class="list-blocked-tag">已封鎖</span>' : ''}
          </div>
          <div class="list-item-actions">
            ${isCustom
              ? '<button class="link-btn" data-action="edit">編輯</button>'
              : ''}
            <button class="link-btn" data-action="map">🗺 地圖</button>
            <button class="link-btn" data-action="${isFav ? 'unfav' : 'fav'}">${isFav ? '取消收藏' : '☆ 收藏'}</button>
            <button class="link-btn ${isBlocked ? 'ok' : 'danger'}" data-action="${isBlocked ? 'unblock' : 'block'}">${isBlocked ? '解除封鎖' : '🚫 封鎖'}</button>
          </div>
        </li>
      `;
    }).join('');

    empty.hidden = matched.length > 0;
  }

  function setListFilter(mode) {
    $('#list-panel').dataset.filter = mode;
    document.querySelectorAll('.list-tab').forEach(t => {
      t.classList.toggle('on', t.dataset.tab === mode);
    });
    renderList($('#search-input').value);
  }

  function handleListAction(li, action) {
    const id = li.dataset.id;
    const item = allRestaurants().find(r => r.id === id);
    if (!item) return;

    if (action === 'map') {
      window.open(buildMapUrl(item), '_blank', 'noopener');
    } else if (action === 'fav') {
      state.favorites.add(id); persistFavorites(); toast('已收藏 ★'); renderList($('#search-input').value);
    } else if (action === 'unfav') {
      state.favorites.delete(id); persistFavorites(); toast('已取消收藏'); renderList($('#search-input').value);
    } else if (action === 'block') {
      state.blacklist.add(id); persistBlacklist(); toast('已封鎖'); renderList($('#search-input').value);
    } else if (action === 'unblock') {
      state.blacklist.delete(id); persistBlacklist(); toast('已解除封鎖'); renderList($('#search-input').value);
    } else if (action === 'edit') {
      openAddPanel(item);
    }
  }

  // ============================================================
  // Seed（內建保底店家）
  // ============================================================
  async function loadSeed() {
    try {
      const res = await fetch('./data/seed.json?v=1');
      if (!res.ok) return;
      const data = await res.json();
      const items = data.items || [];
      state.seedList = items.map((r, i) => ({
        id: 'seed_' + i,
        source: 'seed',
        name: r.name,
        type: r.type || '餐廳',
        tags: r.tags || ['午餐', '晚餐'],
        highlight: r.highlight || '',
        price: r.price || '',
        address: r.address || ''
      }));
    } catch (e) {
      console.warn('Seed 載入失敗:', e);
    }
  }

  // ============================================================
  // OSM 載入流程
  // ============================================================
  async function loadOsmData() {
    const cached = getCachedOsm();
    if (cached) {
      state.osmList = cached.data;
      state.osmStatus = 'ok';
      updateDataStatus();
      // 過期則背景重抓
      if (cached.expired) backgroundRefresh();
      return;
    }
    // 沒快取：前景抓
    await refreshOsm({ silent: false });
  }

  async function backgroundRefresh() {
    refreshOsm({ silent: true }).catch(() => {});
  }

  async function refreshOsm({ silent = false } = {}) {
    state.osmStatus = 'loading';
    updateDataStatus();
    if (!silent) toast('正在更新店家資料…');
    try {
      const data = await fetchOsm();
      state.osmList = data;
      saveOsmCache(data);
      state.osmStatus = 'ok';
      if (!silent) toast(`已更新：找到 ${data.length} 家店`);
      updateDataStatus();
    } catch (e) {
      console.error(e);
      state.osmStatus = 'error';
      updateDataStatus();
      if (!silent) toast('資料更新失敗，仍可用既有資料');
    }
  }

  function updateDataStatus() {
    const el = $('#data-status');
    const cached = getCachedOsm();
    if (state.osmStatus === 'loading') {
      el.textContent = '更新中…';
      el.className = 'data-status loading';
    } else if (state.osmStatus === 'error' && state.osmList.length === 0) {
      el.textContent = '無法連線，先用本地資料';
      el.className = 'data-status warn';
    } else {
      const total = allRestaurants().length;
      const fresh = cached ? formatAge(cached.fetchedAt) : '剛剛';
      el.textContent = `${total} 家 · ${fresh}更新`;
      el.className = 'data-status';
    }
  }

  function formatAge(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return '剛剛';
    if (min < 60) return min + ' 分鐘前';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' 小時前';
    const day = Math.floor(hr / 24);
    return day + ' 天前';
  }

  // ============================================================
  // UI 切換
  // ============================================================
  function showStage(name) {
    ['hero', 'result', 'rolling'].forEach(n => {
      const el = $('#' + n);
      el.setAttribute('aria-hidden', n === name ? 'false' : 'true');
    });
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ============================================================
  // 事件綁定
  // ============================================================
  function bindEvents() {
    // 時段選擇
    document.querySelectorAll('.meal').forEach(btn => {
      btn.addEventListener('click', () => start(btn.dataset.meal));
    });

    // 結果卡按鈕
    $('#btn-redo').addEventListener('click', rollAndShow);
    $('#btn-back').addEventListener('click', () => showStage('hero'));
    $('#btn-fav').addEventListener('click', toggleFavorite);
    $('#btn-block').addEventListener('click', blacklistCurrent);

    // 清單面板
    $('#btn-list').addEventListener('click', () => toggleListPanel(true));
    $('#btn-close-list').addEventListener('click', () => toggleListPanel(false));
    $('#search-input').addEventListener('input', (e) => renderList(e.target.value));
    document.querySelectorAll('.list-tab').forEach(t => {
      t.addEventListener('click', () => setListFilter(t.dataset.tab));
    });
    $('#list-items').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      const li = e.target.closest('.list-item');
      if (!li) return;
      if (btn) {
        handleListAction(li, btn.dataset.action);
      }
    });

    // 重新抓資料
    $('#btn-refresh').addEventListener('click', () => refreshOsm({ silent: false }));

    // 自訂店家
    $('#btn-add').addEventListener('click', () => openAddPanel());
    $('#btn-close-add').addEventListener('click', closeAddPanel);
    $('#add-save').addEventListener('click', saveCustom);
    $('#add-delete').addEventListener('click', deleteCustom);
    $('#add-tags').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) chip.classList.toggle('on');
    });
  }

  // ============================================================
  // 啟動
  // ============================================================
  async function init() {
    bindEvents();
    await loadSeed();
    updateDataStatus();
    await loadOsmData();
    updateDataStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
