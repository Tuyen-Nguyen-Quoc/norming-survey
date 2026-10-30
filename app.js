/*
 * Norming survey: front end.
 * Settings are in config.js and every rater-facing text is in texts.js; you should not need to edit this file.
 * Data is sent to the Google Apps Script in Code.gs (see README.txt).
 */
(function () {
  'use strict';

  const C = CONFIG;
  const T = TEXTS;

  // Field order expected by Code.gs. Every payload uses exactly these keys.
  const ROW_KEYS = ['row_id', 'rater_id', 'session', 'task', 'block', 'trial_index', 'item_id',
    'item_type', 'language', 'stimulus', 'response', 'response_type', 'rt_ms',
    'first_key_ms', 'presented_at', 'seed', 'survey_version', 'test_mode', 'extra'];
  const EVENT_KEYS = ['rater_id', 'session', 'event', 'detail', 'user_agent', 'survey_version', 'test_mode'];
  const PARTICIPANT_KEYS = ['rater_id', 'full_name', 'student_id', 'email', 'phone', 'consented_at',
    'survey_version', 'test_mode'];

  // Familiarity block orders; a rater gets order (number in ID) mod 6.
  const BLOCK_ORDERS = [
    ['zh', 'vi', 'en'], ['zh', 'en', 'vi'], ['vi', 'zh', 'en'],
    ['vi', 'en', 'zh'], ['en', 'zh', 'vi'], ['en', 'vi', 'zh'],
  ];
  const TASK_DONE_DETAIL = {
    familiarity: 'familiarity',
    similarity: 'similarity_sound+similarity_meaning',
    meaning_en: 'similarity_meaning_en',
  };
  const LOCK_MS = 300;       // responses ignored this long after a stimulus appears
  const ADVANCE_MS = 180;    // pause that shows the chosen button before the next item
  const BATCH_EVERY = 20;    // send queued rows every 20 trials
  const BATCH_SIZE = 60;     // rows per request
  const ID_RE = /^[A-Z0-9_-]{1,40}$/;
  const LANG_TAG = { zh: 'zh-Hans', vi: 'vi', en: 'en' };

  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const LOCAL = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname) || location.hostname.endsWith('.localhost');
  const MOCK = !C.SCRIPT_URL && LOCAL;             // testing on your own computer: nothing is sent
  const NOT_CONFIGURED = !C.SCRIPT_URL && !LOCAL;  // online without SCRIPT_URL: answers could not be saved
  const MOCK_FAIL = MOCK && params.get('mockfail') === '1'; // mock mode only: simulate a failing connection

  const app = document.getElementById('app');
  const topbar = document.getElementById('topbar');
  const notice = document.getElementById('notice');

  let items = null;
  let raterId = normId(params.get('id'));
  let state = null;
  let flow = null;
  let view = '';
  let keyHandler = null;
  let cleanups = [];
  let failures = 0;
  let retryTimer = null;
  let chain = Promise.resolve(true);
  const mockLog = [];

  // ---------- small helpers ----------

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  function fmt(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  function normId(v) {
    return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    cleanups.push(() => clearTimeout(id));
  }

  // 32-bit FNV-1a hash of a string.
  function hash32(str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // Seeded random generator (mulberry32): the same seed always gives the same sequence.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(obj, keys) {
    const out = {};
    keys.forEach((k) => { out[k] = obj[k]; });
    return out;
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- local storage (one key per survey, mode and rater) ----------

  function storageKey(id) {
    return `${C.SURVEY_ID}:${TEST ? 'test' : 'live'}:${id}`;
  }

  function loadState(id) {
    try {
      const raw = localStorage.getItem(storageKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // Answers and the position in the survey are written together in one key,
  // so a reload can never skip or repeat a trial.
  function save() {
    if (!state) return;
    try {
      localStorage.setItem(storageKey(state.rater_id), JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save progress in this browser.', e);
    }
  }

  function newState(id) {
    return {
      v: 1,
      rater_id: id,
      test_mode: TEST,
      survey_version: C.SURVEY_VERSION,
      created_at: new Date().toISOString(),
      pos: 0,
      rows: [],             // { r: row, s: 1 once the Sheet confirmed it }
      events: [],           // { e: event, s: 1 once confirmed }
      participant: null,    // personal information, kept only until the Sheet confirms it
      participantSent: false,
      sinceSend: 0,
      finished: false,
      done: false,
    };
  }

  function setUrlId(id) {
    const p = new URLSearchParams(location.search);
    p.set('id', id);
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  // ---------- the survey plan (deterministic for a rater ID) ----------

  function blockOrder(id) {
    const m = id.match(/\d+/);
    const n = m ? parseInt(m[0], 10) : hash32(id);
    return BLOCK_ORDERS[n % 6];
  }

  // Inserts k instructed checks at random positions after the 5th trial.
  function withChecks(list, k, rand, prefix) {
    const n = list.length;
    const lo = Math.min(5, n);
    let points;
    do {
      points = [];
      for (let i = 0; i < k; i++) points.push(lo + Math.floor(rand() * (n - lo + 1)));
      points.sort((a, b) => a - b);
    } while (k > 1 && new Set(points).size < k);
    let values;
    do {
      values = [];
      for (let i = 0; i < k; i++) values.push(2 + Math.floor(rand() * 5)); // expected answer 2-6
    } while (k > 1 && new Set(values).size < k);
    const out = list.slice();
    for (let i = k - 1; i >= 0; i--) {
      out.splice(points[i], 0, {
        item_id: `${prefix}_${i + 1}`,
        item_type: 'attention_instructed',
        expected: values[i],
      });
    }
    return out;
  }

  function pushTrials(f, o) {
    let idx = 0;
    o.practice.forEach((it, i) => {
      f.push(Object.assign({
        kind: 'trial', task: o.task, block: o.block, seed: o.seed, extraBase: o.extraBase || {},
        trial_index: ++idx, phase: 'practice', n: i + 1, total: o.practice.length,
      }, it));
    });
    f.push({ kind: 'practiceDone', task: o.task });
    o.main.forEach((it, i) => {
      const last = i === o.main.length - 1;
      f.push(Object.assign({
        kind: 'trial', task: o.task, block: o.block, seed: o.seed, extraBase: o.extraBase || {},
        trial_index: ++idx, phase: 'main', n: i + 1, total: o.main.length,
        last, lastOfTask: !!o.lastOfTask && last,
      }, it));
    });
  }

  function buildFlow(id) {
    const f = [{ kind: 'welcome' }];
    const order = blockOrder(id);

    // Part 1: familiarity, three blocks
    f.push({ kind: 'intro', task: 'familiarity' });
    order.forEach((lang, b) => {
      const seed = hash32(`${id}|familiarity|${lang}`);
      const rand = rng(seed);
      const words = items.targets.filter((t) => t[lang])
        .map((t) => ({ item_id: t.item_id, item_type: 'target', text: t[lang] }))
        .concat(items.pseudowords[lang].map((p) => ({ item_id: p.item_id, item_type: 'attention_pseudoword', text: p.text })));
      const main = withChecks(shuffle(words, rand), 1, rand, `CHECK_FAM_${lang.toUpperCase()}`);
      const practice = items.practice.familiarity[lang]
        .map((p) => ({ item_id: p.item_id, item_type: 'practice', text: p.text }));
      f.push({ kind: 'blockIntro', lang, pos: b + 1 });
      pushTrials(f, { task: 'familiarity', block: lang, seed, practice, main, extraBase: { block_pos: b + 1 }, lastOfTask: b === 2 });
      if (b < 2) f.push({ kind: 'break', blockPos: b + 1 });
    });
    f.push({ kind: 'midBreak' });

    // Part 2: Vietnamese-Chinese similarity
    {
      const seed = hash32(`${id}|similarity|`);
      const rand = rng(seed);
      const pairs = items.targets.filter((t) => t.vi && t.zh)
        .map((t) => ({ item_id: t.item_id, item_type: 'target', vi: t.vi, zh: t.zh }));
      const main = withChecks(shuffle(pairs, rand), 2, rand, 'CHECK_SIM');
      const practice = items.practice.similarity
        .map((p) => ({ item_id: p.item_id, item_type: 'practice', vi: p.vi, zh: p.zh }));
      f.push({ kind: 'intro', task: 'similarity' });
      pushTrials(f, { task: 'similarity', block: '', seed, practice, main, lastOfTask: true });
      f.push({ kind: 'break', afterTask: 'similarity' });
    }

    // Part 3: English-Chinese meaning
    {
      const seed = hash32(`${id}|meaning_en|`);
      const rand = rng(seed);
      const pairs = items.targets.filter((t) => t.en && t.zh)
        .map((t) => ({ item_id: t.item_id, item_type: 'target', en: t.en, zh: t.zh }));
      const main = withChecks(shuffle(pairs, rand), 2, rand, 'CHECK_MEN');
      const practice = items.practice.meaning_en
        .map((p) => ({ item_id: p.item_id, item_type: 'practice', en: p.en, zh: p.zh }));
      f.push({ kind: 'intro', task: 'meaning_en' });
      pushTrials(f, { task: 'meaning_en', block: '', seed, practice, main, lastOfTask: true });
    }

    f.push({ kind: 'end' });
    return f;
  }

  // ---------- data rows ----------

  function rowId(task, block, idx) {
    const survey = C.SURVEY_ID + (TEST ? '_test' : '');
    return `${survey}_${state.rater_id}_${task}${block ? '_' + block : ''}_${String(idx).padStart(3, '0')}`;
  }

  function makeRow(step, task, o) {
    const extra = o.extra && Object.keys(o.extra).length ? JSON.stringify(o.extra) : '';
    return {
      row_id: rowId(task, step.block, step.trial_index),
      rater_id: state.rater_id,
      session: 1,
      task,
      block: step.block || '',
      trial_index: step.trial_index,
      item_id: step.item_id,
      item_type: step.item_type,
      language: o.language,
      stimulus: o.stimulus,
      response: o.response,
      response_type: o.response_type,
      rt_ms: o.rt_ms,
      first_key_ms: '',
      presented_at: o.presented_at,
      seed: step.seed,
      survey_version: C.SURVEY_VERSION,
      test_mode: TEST,
      extra,
    };
  }

  function queueEvent(event, detail) {
    state.events.push({
      e: {
        rater_id: state.rater_id,
        session: 1,
        event,
        detail: detail || '',
        user_agent: navigator.userAgent,
        survey_version: C.SURVEY_VERSION,
        test_mode: TEST,
      },
      s: 0,
    });
  }

  // Saves a finished trial's rows and moves on, in one write.
  function commit(step, rows) {
    rows.forEach((r) => state.rows.push({ r, s: 0 }));
    state.sinceSend += 1;
    const sendNow = state.sinceSend >= BATCH_EVERY || step.last;
    if (step.lastOfTask) queueEvent('task_complete', TASK_DONE_DETAIL[step.task]);
    if (sendNow) state.sinceSend = 0;
    state.pos += 1;
    save();
    if (sendNow) flush();
    render();
  }

  function next() {
    state.pos += 1;
    save();
    render();
  }

  // ---------- sending ----------

  async function post(payload) {
    if (MOCK) {
      const copy = JSON.parse(JSON.stringify(payload));
      mockLog.push(copy);
      console.log('[mock] ' + payload.kind, copy);
      updateMockBadge();
      await sleep(60);
      if (MOCK_FAIL) throw new Error('mock failure (mockfail=1)');
      return { status: 'ok', received: payload.kind === 'responses' ? payload.rows.length : 1 };
    }
    const res = await fetch(C.SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error((data && data.message) || 'unexpected reply');
    return data;
  }

  // Sends everything not yet confirmed: personal information, then session events, then rows.
  async function doFlush() {
    if (!state) return true;
    try {
      if (state.participant && !state.participantSent) {
        await post({ token: C.TOKEN, kind: 'participant', participant: pick(state.participant, PARTICIPANT_KEYS) });
        state.participant = null;       // delete the personal information once the Sheet has it
        state.participantSent = true;
        save();
      }
      for (const ev of state.events) {
        if (ev.s) continue;
        await post({ token: C.TOKEN, kind: 'session', event: pick(ev.e, EVENT_KEYS) });
        ev.s = 1;
        save();
      }
      for (;;) {
        const batch = state.rows.filter((x) => !x.s).slice(0, BATCH_SIZE);
        if (!batch.length) break;
        const res = await post({ token: C.TOKEN, kind: 'responses', rows: batch.map((x) => pick(x.r, ROW_KEYS)) });
        if (Number(res.received) !== batch.length) throw new Error('row count mismatch');
        batch.forEach((x) => { x.s = 1; });
        save();
      }
      failures = 0;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      setNotice(false);
      if (state.finished && view === 'fail' && allSent()) {
        state.done = true;
        save();
        renderDone();
      }
      return true;
    } catch (err) {
      failures += 1;
      console.warn('Saving failed; will retry.', err);
      scheduleRetry();
      if (failures >= 2 && !state.finished) setNotice(true);
      return false;
    }
  }

  function flush() {
    chain = chain.then(doFlush, doFlush);
    return chain;
  }

  function scheduleRetry() {
    if (retryTimer) return;
    const delay = Math.min(60000, 2000 * Math.pow(2, Math.min(failures - 1, 5)));
    retryTimer = setTimeout(() => { retryTimer = null; flush(); }, delay);
  }

  function allSent() {
    return !!state && state.participantSent && !state.participant
      && state.events.every((x) => x.s) && state.rows.every((x) => x.s);
  }

  function setNotice(on) {
    notice.hidden = !on;
    notice.textContent = on ? T.offlineNotice : '';
  }

  // ---------- screens ----------

  function screen(name, ...kids) {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    keyHandler = null;
    view = name;
    const s = el('section', { class: 'screen ' + name, tabindex: '-1' }, ...kids);
    app.replaceChildren(s);
    s.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return s;
  }

  function hideTopbar() { topbar.hidden = true; }

  function updateTopbar(step) {
    if (step.kind !== 'trial') return hideTopbar();
    topbar.hidden = false;
    let label = T.partName[step.task];
    if (step.task === 'familiarity') label += fmt(T.blockSuffix, { pos: step.extraBase.block_pos, lang: T.langName[step.block] });
    document.getElementById('progress-label').textContent = label;
    document.getElementById('progress-count').textContent = step.phase === 'practice'
      ? fmt(T.practiceCount, { n: step.n, total: step.total })
      : `${step.n}/${step.total}`;
    const pct = step.phase === 'practice' ? 0 : Math.round(((step.n - 1) / step.total) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
    topbar.querySelector('.bar').setAttribute('aria-valuenow', String(pct));
  }

  function render() {
    const step = flow[state.pos];
    if (!step) return renderFinish();
    updateTopbar(step);
    switch (step.kind) {
      case 'welcome': return renderWelcome();
      case 'intro': return renderIntro(step);
      case 'blockIntro': return renderBlockIntro(step);
      case 'practiceDone':
        return infoScreen(T.practiceDoneTitle, `<p>${T.practiceDoneText}</p>`, T.startMainButton);
      case 'break':
        return infoScreen(T.breakTitle,
          `<p>${step.afterTask ? T.breakTaskText : fmt(T.breakBlockText, { pos: step.blockPos })}</p>`, T.continueButton);
      case 'midBreak': return renderMidBreak();
      case 'trial': return renderTrial(step);
      case 'end': return renderEnd();
      default: return renderFinish();
    }
  }

  function infoScreen(title, html, buttonText) {
    screen('info',
      el('h1', { text: title }),
      el('div', { class: 'prose', html }),
      el('div', { class: 'actions' }, el('button', { type: 'button', class: 'primary', onclick: next }, buttonText)));
  }

  // ----- welcome page and personal information -----

  function renderWelcome() {
    hideTopbar();
    const needId = !raterId;
    const refs = {};
    const form = el('form', { novalidate: true, onsubmit: onSubmit });

    function field(key, attrs) {
      const f = T.fields[key];
      const errId = 'e-' + key;
      const hintId = f.hint ? 'h-' + key : null;
      const input = el('input', Object.assign({
        id: 'f-' + key, name: key, 'aria-describedby': [hintId, errId].filter(Boolean).join(' '),
      }, attrs));
      const err = el('p', { class: 'field-error', id: errId, hidden: true });
      form.append(el('div', { class: 'field' },
        el('label', { for: 'f-' + key, text: f.label }),
        f.hint ? el('p', { class: 'hint', id: hintId, text: f.hint }) : null,
        input, err));
      refs[key] = { input, err };
    }

    if (needId) {
      field('rater_id', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
      // A returning rater who opened a link without ?id= goes straight back to where they stopped.
      refs.rater_id.input.addEventListener('change', () => {
        const id = normId(refs.rater_id.input.value);
        if (!ID_RE.test(id)) return;
        const saved = loadState(id);
        if (saved && saved.pos > 0) {
          raterId = id;
          setUrlId(id);
          state = saved;
          flow = buildFlow(id);
          flush();
          if (state.finished) renderFinish(); else renderResume();
        }
      });
    }
    field('full_name', { type: 'text', autocomplete: 'name' });
    field('student_id', { type: 'text', autocomplete: 'off', spellcheck: 'false' });
    field('email', { type: 'email', autocomplete: 'email', spellcheck: 'false', autocapitalize: 'off' });
    field('phone', { type: 'tel', autocomplete: 'tel', inputmode: 'tel' });

    const box = el('input', { type: 'checkbox', id: 'f-consent', 'aria-describedby': 'e-consent' });
    const boxErr = el('p', { class: 'field-error', id: 'e-consent', hidden: true });
    form.append(
      el('label', { class: 'consent', for: 'f-consent' }, box, el('span', { text: T.consentCheckbox })),
      boxErr,
      el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'primary' }, T.startButton)));

    function setErr(key, msg) {
      const r = refs[key];
      r.err.textContent = msg || '';
      r.err.hidden = !msg;
      r.input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    function onSubmit(e) {
      e.preventDefault();
      const clickedAt = new Date().toISOString();
      const v = {};
      Object.keys(refs).forEach((k) => { v[k] = refs[k].input.value.trim(); });
      let first = null;
      const fail = (key, msg) => { setErr(key, msg); if (!first) first = refs[key].input; };
      Object.keys(refs).forEach((k) => setErr(k, ''));

      if (needId) {
        v.rater_id = normId(v.rater_id);
        if (!ID_RE.test(v.rater_id)) fail('rater_id', T.fields.rater_id.error);
      }
      if (!v.full_name) fail('full_name', T.fields.full_name.error);
      if (!v.student_id) fail('student_id', T.fields.student_id.error);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v.email)) fail('email', T.fields.email.error);
      const digits = v.phone.replace(/[\s.\-]/g, '');
      let phone = null;
      if (/^0\d{9}$/.test(digits)) phone = digits;
      else if (/^\+84\d{9}$/.test(digits)) phone = '0' + digits.slice(3);
      if (!phone) fail('phone', T.fields.phone.error);
      boxErr.textContent = box.checked ? '' : T.consentError;
      boxErr.hidden = box.checked;
      if (!box.checked && !first) first = box;
      if (first) { first.focus(); return; }

      if (needId) {
        raterId = v.rater_id;
        setUrlId(raterId);
        const saved = loadState(raterId);
        if (saved && saved.pos > 0) {        // this ID already has answers: continue them
          state = saved;
          flow = buildFlow(raterId);
          flush();
          return state.finished ? renderFinish() : render();
        }
      }
      state = newState(raterId);
      flow = buildFlow(raterId);
      state.flow_length = flow.length;
      state.participant = {
        rater_id: raterId,
        full_name: v.full_name,
        student_id: v.student_id,
        email: v.email,
        phone,
        consented_at: clickedAt,
        survey_version: C.SURVEY_VERSION,
        test_mode: TEST,
      };
      queueEvent('start', JSON.stringify({ block_order: blockOrder(raterId).join(',') }));
      state.pos = 1;
      save();
      flush();          // sent in the background; the rater does not wait
      render();
    }

    screen('welcome',
      el('h1', { text: T.welcomeTitle }),
      el('div', { class: 'prose', html: T.studyInfoHtml }),
      el('div', { class: 'lead-facts' },
        el('p', { text: T.durationText }),
        el('p', { class: 'muted', text: T.deviceAdviceText })),
      el('h2', { text: T.participantHeading }),
      el('div', { class: 'prose', html: T.confidentialityHtml }),
      raterId ? el('p', { class: 'muted', text: fmt(T.raterIdShown, { id: raterId }) }) : null,
      form);
  }

  function renderResume() {
    hideTopbar();
    if (state.pos === 0) return renderWelcome();
    screen('info',
      el('h1', { text: T.resumeTitle }),
      el('p', { text: T.resumeText }),
      el('p', { class: 'muted', text: fmt(T.raterIdShown, { id: state.rater_id }) }),
      el('div', { class: 'actions' }, el('button', { type: 'button', class: 'primary', onclick: render }, T.continueButton)));
  }

  // ----- instructions and breaks -----

  function renderIntro(step) {
    const suggestNote = fmt(T.suggestNote, { max: C.LOW_RATING_MAX });
    if (step.task === 'familiarity') return infoScreen(T.famIntroTitle, T.famIntroHtml, T.continueButton);
    if (step.task === 'similarity') return infoScreen(T.simIntroTitle, fmt(T.simIntroHtml, { suggestNote }), T.continueButton);
    return infoScreen(T.menIntroTitle, fmt(T.menIntroHtml, { suggestNote }), T.continueButton);
  }

  function renderBlockIntro(step) {
    const lang = T.langName[step.lang];
    const note = T.famBlockNote[step.lang];
    infoScreen(fmt(T.famBlockTitle, { pos: step.pos, lang }),
      `<p>${fmt(T.famBlockText, { lang })}</p>` + (note ? `<p>${note}</p>` : ''), T.continueButton);
  }

  function renderMidBreak() {
    let left = Math.max(0, Math.round(Number(C.MID_BREAK_SECONDS) || 0));
    const wait = el('p', { class: 'muted', text: left ? fmt(T.midBreakWait, { s: left }) : '' });
    const btn = el('button', { type: 'button', class: 'primary', disabled: left > 0, onclick: next }, T.continueButton);
    screen('info', el('h1', { text: T.midBreakTitle }), el('div', { class: 'prose', html: T.midBreakHtml }), wait,
      el('div', { class: 'actions' }, btn));
    if (left > 0) {
      const id = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearInterval(id);
          btn.disabled = false;
          wait.textContent = '';
        } else {
          wait.textContent = fmt(T.midBreakWait, { s: left });
        }
      }, 1000);
      cleanups.push(() => clearInterval(id));
    }
  }

  // ----- trials -----

  function clock() {
    let onset = Infinity;
    const c = {
      presentedAt: '',
      start() { onset = performance.now(); c.presentedAt = new Date().toISOString(); },
      ready() { return performance.now() - onset >= LOCK_MS; },
      rt() { return Math.round(performance.now() - onset); },
    };
    return c;
  }

  function digit(e) {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return 0;
    return /^[1-7]$/.test(e.key) ? Number(e.key) : 0;
  }

  function scale(lowLabel, highLabel, labelledBy, onPick) {
    const buttons = [];
    const row = el('div', { class: 'scale', role: 'radiogroup', 'aria-labelledby': labelledBy });
    for (let v = 1; v <= 7; v++) {
      const b = el('button', {
        type: 'button', class: 'opt', role: 'radio', 'aria-checked': 'false', dataset: { v: String(v) },
        onclick: () => onPick(v),
      }, String(v));
      buttons.push(b);
      row.append(b);
    }
    return {
      node: el('div', { class: 'scale-wrap' }, row,
        el('div', { class: 'anchors' }, el('span', { text: lowLabel }), el('span', { text: highLabel }))),
      set(v) {
        buttons.forEach((b) => {
          const on = String(v) === b.dataset.v;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      },
    };
  }

  function renderTrial(step) {
    if (step.task === 'familiarity') return familiarityTrial(step);
    return pairTrial(step);
  }

  function familiarityTrial(step) {
    const isCheck = step.item_type === 'attention_instructed';
    const lang = step.block;
    const text = isCheck ? fmt(T.checkSingle, { n: step.expected }) : step.text;
    const t = clock();
    let done = false;

    const sc = scale(T.famLow, T.famHigh, 'q-fam', choose);
    function choose(v) {
      if (done || !t.ready()) return;
      done = true;
      sc.set(v);
      const extra = Object.assign({}, step.extraBase);
      if (isCheck) extra.expected = step.expected;
      const row = makeRow(step, 'familiarity', {
        language: lang, stimulus: text, response: String(v), response_type: 'rating',
        rt_ms: t.rt(), presented_at: t.presentedAt, extra,
      });
      later(() => commit(step, [row]), ADVANCE_MS);
    }

    screen('trial',
      isCheck ? el('p', { class: 'check-msg', text }) : el('div', { class: 'stim', lang: LANG_TAG[lang], text }),
      el('div', { class: 'question' }, el('p', { class: 'q-text', id: 'q-fam', text: T.famQuestion }), sc.node));
    requestAnimationFrame(() => t.start());
    keyHandler = (e) => {
      const v = digit(e);
      if (v) { e.preventDefault(); choose(v); }
    };
  }

  function pairTrial(step) {
    const sim = step.task === 'similarity';           // Vietnamese-Chinese (two questions) or English-Chinese
    const isCheck = step.item_type === 'attention_instructed';
    const left = sim ? step.vi : step.en;
    const leftLang = sim ? 'vi' : 'en';
    const t = clock();
    const ans = {};            // s: sound rating, m: meaning rating or 'DKN'
    const rts = {};
    let changes = 0;
    let done = false;
    const checkText = isCheck ? fmt(sim ? T.checkPair : T.checkSingle, { n: step.expected }) : '';
    const stimulus = isCheck ? checkText : `${left}|${step.zh}`;

    // stimulus: the left word and the Chinese word (characters only)
    const stimNode = isCheck
      ? el('p', { class: 'check-msg', text: checkText })
      : el('div', { class: 'pair' },
        el('div', { class: 'word' }, el('span', { class: 'w', lang: LANG_TAG[leftLang], text: left })),
        el('div', { class: 'rule', 'aria-hidden': 'true' }),
        el('div', { class: 'word' }, el('span', { class: 'w', lang: 'zh-Hans', text: step.zh })));

    // questions
    const qS = sim ? el('div', { class: 'question' }) : null;
    const qM = el('div', { class: 'question' });
    let scS = null;
    if (sim) {
      scS = scale(T.soundLow, T.soundHigh, 'q-sound', (v) => choose('s', v));
      qS.append(el('p', { class: 'q-text', id: 'q-sound', text: T.soundQuestion }), scS.node);
    }
    const scM = scale(T.meaningLow, T.meaningHigh, 'q-meaning', (v) => choose('m', v));
    // "I don't know": on Vietnamese-Chinese screens it skips both questions; on English-Chinese it answers the one question.
    const dkn = el('button', {
      type: 'button', class: 'dkn', 'aria-pressed': 'false',
      onclick: () => (sim ? skipBoth() : choose('m', 'DKN')),
    }, sim ? T.simDkn : T.menDkn);
    const dknRow = el('div', { class: 'dkn-row' }, dkn);
    qM.append(el('p', { class: 'q-text', id: 'q-meaning', text: T.meaningQuestion }), scM.node);

    // suggestion box
    const input = el('input', {
      id: 'suggest-input', type: 'text', maxlength: '60', autocomplete: 'off', spellcheck: 'false',
      lang: leftLang, placeholder: T.suggestPlaceholder,
    });
    const box = el('div', { class: 'suggest', hidden: true },
      el('label', { for: 'suggest-input', text: sim ? T.simSuggest : T.menSuggest }),
      el('div', { class: 'row' }, input,
        el('button', { type: 'button', class: 'primary', onclick: () => boxContinue() }, T.continueButton)));

    const errLine = el('p', { class: 'trial-error', role: 'alert', hidden: true });

    function showError(msg) { errLine.textContent = msg; errLine.hidden = !msg; }

    // With two questions on screen, a dot marks the one the 1-7 keys answer.
    function markActive() {
      if (!sim) return;
      const target = ans.s === undefined ? qS : qM;
      [qS, qM].forEach((q) => { if (q) q.classList.toggle('active', q === target); });
    }

    function lowMeaning() {
      return !isCheck && typeof ans.m === 'number' && ans.m <= C.LOW_RATING_MAX;
    }

    function choose(q, v) {
      if (done || !t.ready()) return;
      if (ans[q] !== undefined && ans[q] !== v) changes += 1;
      ans[q] = v;
      rts[q] = t.rt();
      if (q === 's') {
        scS.set(v);
      } else {
        scM.set(v === 'DKN' ? null : v);
        dkn.classList.toggle('on', v === 'DKN');
        dkn.setAttribute('aria-pressed', v === 'DKN' ? 'true' : 'false');
      }
      showError('');
      markActive();
      update();
    }

    function skipBoth() {
      if (done || !t.ready()) return;
      const rt = t.rt();
      ans.s = 'DKN';
      ans.m = 'DKN';
      rts.s = rt;
      rts.m = rt;
      scS.set(null);
      scM.set(null);
      dkn.classList.add('on');
      dkn.setAttribute('aria-pressed', 'true');
      box.hidden = true;
      showError('');
      finish('');
    }

    function update() {
      if (lowMeaning()) {
        if (box.hidden) {
          box.hidden = false;
          if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) input.focus();
        }
        return;
      }
      box.hidden = true;
      if ((!sim || ans.s !== undefined) && ans.m !== undefined) finish('');
    }

    function boxContinue() {
      if (done) return;
      if (sim && ans.s === undefined) { showError(T.answerBoth); return; }
      finish(input.value.trim());
    }

    function finish(suggestion) {
      if (done) return;
      done = true;
      const base = { language: sim ? 'vi-zh' : 'en-zh', stimulus, presented_at: t.presentedAt };
      const extra = {};
      if (changes) extra.changes = changes;
      if (isCheck) extra.expected = step.expected;
      const rows = [];
      if (sim) {
        const sdk = ans.s === 'DKN';
        rows.push(makeRow(step, 'similarity_sound', Object.assign({}, base, {
          response: sdk ? '' : String(ans.s), response_type: sdk ? 'DKN' : 'rating', rt_ms: rts.s, extra,
        })));
      }
      const dk = ans.m === 'DKN';
      rows.push(makeRow(step, sim ? 'similarity_meaning' : 'similarity_meaning_en', Object.assign({}, base, {
        response: dk ? '' : String(ans.m), response_type: dk ? 'DKN' : 'rating', rt_ms: rts.m, extra,
      })));
      if (suggestion && lowMeaning()) {
        rows.push(makeRow(step, sim ? 'suggestion_vi' : 'suggestion_en', Object.assign({}, base, {
          response: suggestion, response_type: 'text', rt_ms: t.rt(), extra: { rating: ans.m },
        })));
      }
      later(() => commit(step, rows), ADVANCE_MS);
    }

    screen('trial', stimNode, qS, qM, box, dknRow, errLine);
    markActive();
    requestAnimationFrame(() => t.start());

    keyHandler = (e) => {
      const target = e.target;
      if (target === input) {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); boxContinue(); }
        return;                                     // digits type into the box
      }
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter' && !box.hidden) { e.preventDefault(); boxContinue(); return; }
      const v = digit(e);
      if (!v) return;
      e.preventDefault();
      choose(sim && ans.s === undefined ? 's' : 'm', v);
    };
  }

  // ----- end -----

  function renderEnd() {
    hideTopbar();
    const ta = el('textarea', { id: 'comment', placeholder: T.commentPlaceholder, maxlength: '2000' });
    const btn = el('button', {
      type: 'button', class: 'primary',
      onclick: () => {
        btn.disabled = true;
        const comment = ta.value.trim();
        if (comment) queueEvent('comment', comment);
        queueEvent('session_complete', '');
        state.finished = true;
        state.pos += 1;
        save();
        renderFinish();
      },
    }, T.finishButton);
    screen('end',
      el('h1', { text: T.endTitle }),
      el('p', { text: T.endText }),
      el('div', { class: 'field' }, el('label', { for: 'comment', text: T.commentLabel }), ta),
      el('div', { class: 'actions' }, btn));
  }

  // The "done" page appears only after the Sheet has confirmed every row, event and the personal information.
  async function renderFinish() {
    hideTopbar();
    setNotice(false);
    if (state.done && allSent()) return renderDone();
    screen('saving', el('h1', { text: T.savingTitle }), el('p', { class: 'muted', text: T.savingText }));
    for (let i = 0; i < 4; i++) {
      if (await flush() && allSent()) {
        state.done = true;
        save();
        return renderDone();
      }
      if (view !== 'saving') return;
      await sleep(1500 * Math.pow(2, i));
    }
    renderFail();
  }

  function renderDone() {
    hideTopbar();
    setNotice(false);
    screen('done', el('h1', { text: T.doneTitle }), el('p', { text: T.doneText }));
  }

  function renderFail() {
    screen('fail',
      el('h1', { text: T.failTitle }),
      el('div', { class: 'prose', html: T.failHtml }),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'primary', onclick: renderFinish }, T.retryButton),
        el('button', { type: 'button', class: 'secondary', onclick: downloadAnswers }, T.downloadButton)));
  }

  // Answers only: no personal information.
  function downloadAnswers() {
    downloadJson({
      survey_id: C.SURVEY_ID,
      survey_version: C.SURVEY_VERSION,
      rater_id: state.rater_id,
      test_mode: TEST,
      exported_at: new Date().toISOString(),
      rows: state.rows.map((x) => pick(x.r, ROW_KEYS)),
      session_events: state.events.map((x) => pick(x.e, EVENT_KEYS)),
    }, `${C.SURVEY_ID}_${state.rater_id}${TEST ? '_test' : ''}_answers.json`);
  }

  // ---------- pilot and mock-mode badges ----------

  let mockCount = null;
  function showBadges() {
    const wrap = document.getElementById('badges');
    if (TEST) wrap.append(el('span', { class: 'badge', text: T.testBadge }));
    if (MOCK) {
      mockCount = el('span');
      wrap.append(el('span', { class: 'badge' },
        'Mock mode: nothing is sent', mockFailNote(), ' (', mockCount, ' payloads)',
        el('button', {
          type: 'button',
          onclick: () => downloadJson(mockLog, `${C.SURVEY_ID}_mock_payloads.json`),
        }, 'Download')));
      updateMockBadge();
    }
  }
  function mockFailNote() { return MOCK_FAIL ? ', simulating failures' : ''; }
  function updateMockBadge() { if (mockCount) mockCount.textContent = String(mockLog.length); }

  // ---------- start ----------

  document.addEventListener('keydown', (e) => { if (keyHandler) keyHandler(e); });
  window.addEventListener('online', () => { if (state) flush(); });

  async function boot() {
    document.title = T.pageTitle;
    if (NOT_CONFIGURED) {
      console.error('SCRIPT_URL is empty in config.js, so answers could not be saved. The survey will not start.');
      screen('error', el('h1', { text: T.notReadyTitle }), el('p', { text: T.notReadyText }));
      return;
    }
    showBadges();
    screen('loading', el('p', { class: 'muted', text: T.loading }));
    try {
      const res = await fetch('stimuli/items.json?v=' + encodeURIComponent(C.SURVEY_VERSION), { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      items = await res.json();
    } catch (e) {
      console.error('Could not load stimuli/items.json', e);
      screen('error', el('p', { text: T.loadError }));
      return;
    }
    if (!ID_RE.test(raterId)) raterId = '';

    // Pilot links only: &reset=1 clears this browser's saved progress for the ID.
    if (params.get('reset') === '1') {
      if (TEST && raterId) {
        try { localStorage.removeItem(storageKey(raterId)); } catch (e) { /* ignore */ }
      }
      const p = new URLSearchParams(location.search);
      p.delete('reset');
      history.replaceState(null, '', location.pathname + '?' + p.toString());
    }

    if (raterId) state = loadState(raterId);
    if (state) {
      flow = buildFlow(raterId);
      if (state.flow_length && state.flow_length !== flow.length) {
        console.warn('The stimuli changed since this rater started; positions may not match.');
      }
      flush();
      if (state.finished) return renderFinish();
      return renderResume();
    }
    renderWelcome();
  }

  // For testing in the browser console.
  window.__survey = {
    get state() { return state; },
    get flow() { return flow; },
    get view() { return view; },
    mockLog,
    keys: { ROW_KEYS, EVENT_KEYS, PARTICIPANT_KEYS },
  };

  boot();
})();
