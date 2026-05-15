(() => {
  'use strict';

  const MEAL_LABEL = {
    'early-brunch': { tag: '早餐', filter: ['早餐'] },
    'lunch':        { tag: '午餐', filter: ['午餐'] },
    'afternoon':    { tag: '下午茶', filter: ['下午茶'] },
    'dinner':       { tag: '晚餐', filter: ['晚餐'] },
    'midnight':     { tag: '宵夜', filter: ['宵夜'] },
    'any':          { tag: '隨便', filter: null }
  };

  const ROLLING_EMOJIS = ['🍜','🍱','🍕','🍔','🍣','🥟','🍲','🍰','🧋','🍢','🍙','🥗'];

  const $ = (sel) => document.querySelector(sel);
  const state = {
    restaurants: [],
    pool: [],
    lastIndex: -1,
    rollCount: 0,
    currentMeal: null
  };

  // ---------- 載入資料 ----------
  async function loadData() {
    try {
      const res = await fetch('./data/restaurants.json?v=1');
      const data = await res.json();
      state.restaurants = data.restaurants || [];
    } catch (err) {
      console.error('載入失敗:', err);
      toast('資料載入失敗，請重新整理');
    }
  }

  // ---------- 抽選邏輯 ----------
  function buildPool(mealKey) {
    const meal = MEAL_LABEL[mealKey];
    if (!meal || !meal.filter) return state.restaurants.slice();
    return state.restaurants.filter(r =>
      (r.tags || []).some(t => meal.filter.includes(t))
    );
  }

  function pickOne(pool) {
    if (pool.length === 0) return null;
    if (pool.length === 1) return 0;
    let idx;
    let attempts = 0;
    do {
      idx = Math.floor(Math.random() * pool.length);
      attempts++;
    } while (idx === state.lastIndex && attempts < 5);
    return idx;
  }

  // ---------- 流程 ----------
  async function start(mealKey) {
    state.currentMeal = mealKey;
    state.pool = buildPool(mealKey);
    state.lastIndex = -1;
    state.rollCount = 0;

    if (state.pool.length === 0) {
      toast('找不到符合的店家');
      return;
    }

    await rollAndShow();
  }

  async function rollAndShow() {
    showStage('rolling');
    haptic();

    // 動畫 emoji 變化
    const rollingEmoji = $('#rolling-emoji');
    let i = 0;
    const rollTimer = setInterval(() => {
      rollingEmoji.textContent = ROLLING_EMOJIS[i % ROLLING_EMOJIS.length];
      i++;
    }, 100);

    // 等候動畫
    await sleep(1200);
    clearInterval(rollTimer);

    const idx = pickOne(state.pool);
    if (idx === null) {
      toast('找不到符合的店家');
      showStage('hero');
      return;
    }
    state.lastIndex = idx;
    state.rollCount++;

    const r = state.pool[idx];
    renderResult(r);
    showStage('result');
    haptic();
  }

  function renderResult(r) {
    const meal = MEAL_LABEL[state.currentMeal];
    $('#result-meal-tag').textContent = meal.tag;
    $('#result-counter').textContent = `第 ${state.rollCount} 次`;
    $('#result-name').textContent = r.name;
    $('#result-type').textContent = r.type;
    $('#result-highlight').textContent = r.highlight || '';
    $('#result-price').textContent = r.price || '';
    $('#result-address').textContent = r.address || '';

    const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(r.name + ' ' + (r.address || '台中豐原'));
    $('#btn-map').href = mapUrl;
  }

  // ---------- UI 切換 ----------
  function showStage(name) {
    ['hero', 'result', 'rolling'].forEach(n => {
      const el = $('#' + n);
      el.setAttribute('aria-hidden', n === name ? 'false' : 'true');
    });
  }

  function toggleListPanel(open) {
    const panel = $('#list-panel');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) renderList();
  }

  function renderList(query = '') {
    const ul = $('#list-items');
    const empty = $('#list-empty');
    const q = query.trim().toLowerCase();
    const matched = state.restaurants.filter(r => {
      if (!q) return true;
      return [r.name, r.type, r.address, r.highlight, ...(r.tags || [])]
        .filter(Boolean)
        .some(s => String(s).toLowerCase().includes(q));
    });

    ul.innerHTML = matched.map(r => `
      <li class="list-item" data-name="${escapeAttr(r.name)}" data-address="${escapeAttr(r.address || '')}">
        <div class="list-item-row">
          <span class="list-item-name">${escapeHtml(r.name)}</span>
          <span class="list-item-type">${escapeHtml(r.type)}</span>
        </div>
        <div class="list-item-meta">
          ${(r.tags || []).map(t => '#' + escapeHtml(t)).join(' ')} · ${escapeHtml(r.highlight || '')}
        </div>
      </li>
    `).join('');

    empty.hidden = matched.length > 0;
  }

  // ---------- 工具 ----------
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function haptic() {
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------- 事件綁定 ----------
  function bindEvents() {
    document.querySelectorAll('.meal').forEach(btn => {
      btn.addEventListener('click', () => start(btn.dataset.meal));
    });

    $('#btn-redo').addEventListener('click', rollAndShow);
    $('#btn-back').addEventListener('click', () => showStage('hero'));

    $('#btn-list').addEventListener('click', () => toggleListPanel(true));
    $('#btn-close-list').addEventListener('click', () => toggleListPanel(false));

    $('#search-input').addEventListener('input', (e) => renderList(e.target.value));

    $('#list-items').addEventListener('click', (e) => {
      const li = e.target.closest('.list-item');
      if (!li) return;
      const name = li.dataset.name;
      const address = li.dataset.address;
      const url = 'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(name + ' ' + (address || '台中豐原'));
      window.open(url, '_blank', 'noopener');
    });
  }

  // ---------- 啟動 ----------
  async function init() {
    bindEvents();
    await loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
