const KEY = 'gym';
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const $ = id => document.getElementById(id);
const view = $('view'), timerEl = $('timer');
const LB = 2.20462; // lbs per kg
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const D = s => new Date(s + 'T12:00');
const fmt = s => D(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const num = v => v === '' ? null : +v.replace(',', '.');
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const repText = r => r[1]; // the rep target you set (older ranges show their top number, which is what the editor saves)
const setText = x => `${+x.w || 0}×${+x.r}`;
const label = m => m.replace(/back$/, ' back');
const daysText = ds => ds.length ? WEEK.filter(d => ds.includes(d)).map(d => DAY[d].slice(0, 3)).join(', ') : 'No days';
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Data: { workouts: [{ id, name, days, inc, exercises }], logs: { 'YYYY-MM-DD': { exerciseId: [{ w, r }] } }, weights: [{ date, kg }] }
let data;
try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { data = {}; }
data.logs ||= {};
data.weights ||= [];
data.workouts ||= structuredClone(DEFAULT_WORKOUTS);
data.done ||= {}; // { 'YYYY-MM-DD': [exerciseId] } ticked off with the circles on Today
data.rows ||= {}; // { 'YYYY-MM-DD': { exerciseId: n } } set rows shown that day, after Add set / Remove set
// Exercise library: the presets plus your own, used by + Add exercise and edited in Plan › View exercises.
// [{ id, name, cat, sets, reps, rest, muscles, src }]. cat is set for presets; your own exercises (no cat) show under
// every category their muscles belong to. src (older custom exercises only): the workout exercise it was created as, used to link them up.
// Workout exercises carry lib: the library id they came from, so library name/muscle edits reach them.
const presetLibrary = () => Object.entries(PRESETS).flatMap(([cat, l]) => l.map(([name, type, m, reps]) =>
  ({ id: uid(), name, cat, sets: 3, reps: reps || (type === 'c' ? [6, 10] : [10, 15]), rest: [...(type === 'c' ? BIG : SMALL)], muscles: m.split(' ') })));
const customLibrary = custom => Object.entries(custom || {}).filter(([, c]) => c.name).map(([src, c]) => ({ rest: [...BIG], ...c, id: uid(), src })); // pre-library backups
// First run with a library: build it, then link workout exercises to it by name.
function makeLibrary(d) {
  if (d.library) return;
  d.library = [...customLibrary(d.custom), ...presetLibrary()];
  delete d.custom;
  const byName = Object.fromEntries(d.library.map(it => [it.name.toLowerCase(), it]));
  for (const w of d.workouts) for (const e of w.exercises) {
    const it = d.library.find(it => it.src === e.id) || byName[e.name.toLowerCase()];
    if (it) e.lib = it.id;
  }
}
makeLibrary(data);
delete data.restFor; // per-exercise rest times from older versions; every rest now starts at the default
data.bmi ||= {}; // { h: cm, kg } for the BMI calculator on Body, separate from the weigh-ins
data.names ||= {}; // { exerciseId: name } for every exercise with logged sets, so History still shows it after it's removed from a workout
// Settings: data.restDefault (seconds, default 90), data.beep (false = silent), data.haptics (false = off), data.lastBackup (date of the last export).
const save = () => localStorage.setItem(KEY, JSON.stringify(data));
save(); // keeps the library (and its ids) from the first run
// A custom exercise keeps its library entry up to date while you edit the exercise it was created as.
const inCat = (it, c) => it.cat ? it.cat === c : !it.muscles.length || it.muscles.some(m => CATEGORY[m] === c); // no muscles yet: shown everywhere so it isn't lost
const libList = extra => data.library.filter(it => it.id === extra || inCat(it, cat)).sort((a, b) => !!a.cat - !!b.cat); // your own first
navigator.storage?.persist?.();

let EX;
const rebuild = () => { EX = {}; for (const w of data.workouts) for (const e of w.exercises) EX[e.id] = { ...e, inc: w.inc }; };
rebuild();
for (const l of Object.values(data.logs)) for (const id in l) if (EX[id]) data.names[id] = EX[id].name;
const W = id => data.workouts.find(w => w.id === id);
const scheduled = d => data.workouts.find(w => w.days.includes(d));

// open: exercise expanded for logging. hl: exercise whose muscles are highlighted on the model.
let histIds = []; // ids whose sets the History page is showing, for Delete history
let tab = 'today', sel = scheduled(new Date().getDay())?.id ?? null, open = null, hl = null, hist = null; // hist: exercise name picked on History
let showWeek = false, editW = null, editEx = null, removing = false;
let picking = null, creating = false, cat = Object.keys(PRESETS)[0]; // picking: id of the workout the exercise picker is adding to; creating: + Custom exercise form open
let libView = false, libEdit = null, libQ = ''; // Plan › View exercises, the library exercise open for editing, and the search text

function lastTime(id) {
  const t = today();
  const d = Object.keys(data.logs).filter(k => k < t && data.logs[k][id]?.some(x => x?.r)).sort().pop();
  return d && { date: d, sets: data.logs[d][id].filter(x => x?.r) };
}

// Progressive overload: every set at the top of the range last time -> add inc.
function suggest(e, last) {
  if (!last) return null;
  const sets = last.sets.slice(0, e.sets); // extra sets added on the day don't count
  const w = Math.min(...sets.map(x => +x.w || 0));
  const up = w > 0 && sets.length >= e.sets && sets.every(x => x.r >= e.reps[1]);
  return { w: up ? w + e.inc : w, up };
}

function render() {
  view.classList.remove('slidein', 'slideout');
  document.documentElement.style.setProperty('--accent', data.theme || THEMES.Orange);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  view.innerHTML = picking ? pickHTML() : { today: todayHTML, plan: planHTML, history: historyHTML, body: bodyHTML, settings: settingsHTML }[tab]();
  timerEl.hidden = !(tab === 'today' && W(sel) && !picking);
  paintTimer();
  const cs = view.querySelector('.chartscroll');
  if (cs) cs.scrollLeft = cs.scrollWidth; // open on the latest entries
  show3d();
}

// 3D body model on Body (figure3d.js). Loaded the first time it's needed, then re-attached after each redraw.
// The 3D model is hidden for now (paused): put <div id="fig3d"></div> back under the BMI result in bodyHTML,
// and its three files back in sw.js FILES, to show it again.
let fig3d;
function show3d() {
  const el = $('fig3d');
  if (el) (fig3d ||= import('./figure3d.js')).then(m => m.show(el, data.bmi.h, data.bmi.kg));
}

const CAL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

function todayHTML() {
  const w = W(sel);
  let h = `<div class="top"><div><h1>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
    <p class="muted">${w ? esc(w.name) : 'Rest day'}</p></div><button id="weekbtn"${showWeek ? ' class="on"' : ''}>${CAL} Week</button></div>`;
  if (showWeek) h += weekHTML();
  const add = '<button class="big" id="addtoday">+ Add exercise</button>';
  if (!w) return h + `<div class="bust">${figure(FRONT, new Set(), new Set(), '0 -8 200 140').repeat(2)}</div>` + '<p class="restday">Rest day. Eat, sleep, grow.<br><span class="muted small">Training anyway? Add an exercise, or tap Week and pick a workout.</span></p>' + add;
  if (!w.exercises.length) return h + '<p class="restday muted">No exercises yet.</p>' + add;
  const did = data.done[today()] || [], on = new Set(w.exercises.flatMap(e => e.muscles));
  return h + `<div class="hero"><div class="model">${bodyMap(on, new Set(EX[hl]?.muscles))}</div>
    <div class="names"><div class="scroll"><div class="in">${w.exercises.map(e => `<button class="${e.id === hl ? 'on' : ''}${did.includes(e.id) ? ' did' : ''}" data-hl="${e.id}">${esc(e.name)}</button>`).join('')}</div></div></div></div>` +
    w.exercises.map((e, i) => withTrash(exHTML(EX[e.id], did.includes(e.id), i), removing && `data-rmex="${i}"`, e.name)).join('') +
    `<div class="pair"><button class="big" id="addtoday">+ Add</button><button class="big danger" id="rmmode">${removing ? 'Done' : TRASH + ' Remove'}</button></div>`;
}

function weekHTML() {
  const now = new Date(), t = now.getDay(); // this week runs Monday to Sunday
  const row = (d, w) => `<button class="day${d === t ? ' today' : ''}${w && w.id === sel ? ' on' : ''}" data-pick="${w ? w.id : ''}">
    <span>${DAY[d].slice(0, 3)}<small>${new Date(now.getFullYear(), now.getMonth(), now.getDate() + (d + 6) % 7 - (t + 6) % 7).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></span><b>${w ? esc(w.name) : 'Rest'}</b><span class="muted small">${w ? w.exercises.length + ' exercises' : ''}</span></button>`;
  return `<div class="week">${WEEK.map(d => row(d, scheduled(d))).join('')}</div>`;
}

// Remove mode: a big trash box beside the card that pushes it aside (slides in, see #view.slidein).
const withTrash = (card, attr, name) => attr ? `<div class="wrow">${card}<button class="mini danger" ${attr} aria-label="Remove ${esc(name)}">${TRASH}</button></div>` : card;
const TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const setCount = id => data.rows[today()]?.[id] ?? Math.max(EX[id].sets, data.logs[today()]?.[id]?.length || 0);
const GRIP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
const TICK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

function exHTML(e, did, i) {
  const logged = data.logs[today()]?.[e.id] || [];
  let h = `<section class="ex${did ? ' did' : ''}"><div class="ex-row">
    <button class="circle" data-done="${e.id}" aria-label="${did ? 'Mark not done' : 'Mark done'}">${TICK}</button>
    <button class="ex-head" data-open="${e.id}"><span>${esc(e.name)}</span><span class="muted small">${e.sets} × ${repText(e.reps)}</span></button></div>`;
  if (editW === sel && editEx === i) return h + exEditHTML(e, i) + '</section>';
  if (open !== e.id) return h + '</section>';
  const last = lastTime(e.id), sug = suggest(e, last);
  h += '<div class="ex-body">';
  h += last ? `<p class="muted">Last time (${fmt(last.date)}): ${last.sets.map(setText).join(', ')}</p>`
    : '<p class="muted">First time. Pick a weight you could do 1–2 more reps with.</p>';
  if (sug?.up) h += `<p class="up">All sets hit ${e.reps[1]}. Go up to ${sug.w} kg.</p>`;
  const n = setCount(e.id);
  for (let i = 0; i < n; i++) {
    const x = logged[i] || {};
    h += `<div class="set" data-ex="${e.id}" data-i="${i}"><span class="muted">${i + 1}</span>
      <input inputmode="decimal" placeholder="kg" value="${x.w ?? sug?.w ?? ''}">
      <input inputmode="numeric" placeholder="reps" value="${x.r ?? ''}"></div>`;
  }
  return h + `<div class="pair"><button class="addset danger" data-rmset="${e.id}"${n < 2 ? ' disabled' : ''}>${TRASH} Remove set</button>
    <button class="addset" data-addset="${e.id}">+ Add set</button></div></div></section>`;
}

// Muscle map: the left half of the body is drawn once and mirrored for the right half.
const OUTLINE = `M100,6 C90,6 85,13 85,26 C85,38 88,47 91,51 L91,63 C82,68 70,71 60,75 C47,77 37,86 36,100 C35,106 36,110 37,114
  C31,128 25,148 23,166 C17,182 11,206 8,232 C3,244 1,258 4,270 C7,277 14,277 16,269 C18,259 19,247 19,238
  C24,214 34,192 42,172 C49,152 56,130 60,111 C60.5,109 60.8,109.5 61,111 C58.5,130 66,166 74,198 C72,212 69,224 68,236
  C64,262 65,292 70,320 C72,332 71,340 69.5,348 C67.5,362 68.5,378 72,392 C75,400 78,406 79,412 C79.5,418 77,424 76,428 C75,433 80,435 86,435 L96,435
  C97.5,430 94,424 91.5,416 C90.5,406 91,398 92.5,388 C94.5,374 96,362 95.5,352 C95,342 96,334 96,324 C98,296 99,266 100,244`;
const P = d => `<path d="${d}"/>`;
const DELT = P('M66,75 C54,76 40,84 37.5,99 C37,106 37.5,112 38.5,118 C46,115 52,108 56,99 C60,90 65,84 72,81 C70,78 68,76 66,75Z');
const FOREARM = P('M30,171 C25,172 21.5,176 20,181 C17.5,190 15,202 13.5,212 C13,219 13,224 13.5,228 C16.5,227 19,225 21,222 C23.5,214 26,206 28.5,199 C31,191 34,183 36.5,177 C35,173 33,171 30,171Z');
const FRONT = [
  ['shoulders', DELT],
  ['chest', P('M72,81 C64,87 59,95 60,104 C66,116 74,130 86,131 C92,131 96,130 99,129 L99,84 C92,80 82,79 72,81Z')],
  ['biceps', P('M55,119 C47,119 39,121 35,126 C31,134 28,146 26.5,156 C26,162 27,166 29,169 C35,169 41,166 44,160 C47,152 50,142 51.5,134 C53,128 54.5,123 55,119Z')],
  ['forearms', FOREARM],
  ['abs', P('M63.5,129 C66,150 70.5,172 75.5,196 C76,206 74.5,214 73,222 C79,216 84,208 87,201 L86,135 C79,132 72,129 63.5,129Z') +
    P('M99,134 C99,141 99,147 98.5,151 C95,152.5 90,152.5 87,151 C85.5,146 85.5,139 87,135 C90,132.5 95,132.5 99,134Z') +
    P('M99,156 C99,163 99,169 98.5,174 C95,175.5 90,175.5 87,174 C85,168 85,161 86.5,157 C90,154.5 95,154.5 99,156Z') +
    P('M99,179 C99,185 99,191 98.5,196 C95,197.5 90.5,197 88,195 C86.5,190 86.5,184 87.5,180 C91,177.5 95,177.5 99,179Z') +
    P('M99,201 C99,215 99,228 99,236 C96,234 92,226 90,216 C89,210 88.5,205 89,201 C92,199 96,199 99,201Z')],
  ['quads', P('M71,245 C67.5,262 67,282 68.5,300 C70,311 72.5,317 76,320 C80,322 83,321 85,318 C87,321 91,324 94.5,322 C96.5,316 96.8,306 97,294 C97.5,278 97,262 93,249 C86,243 78,241 71,245Z')],
  ['calves', P('M85,348 C90.5,351 92,361 91.8,371 C91.5,379 90.5,385 89,389 C86,385 84,378 83.5,369 C83.2,360 83.6,353 85,348Z')],
];
// Back muscles are tiled: neighbours share the exact same edge so nothing overlaps.
const BACK = [
  ['traps', P('M99,34 C95,40 92.5,47 92.5,54 L92,64 C86,67 80,69.5 74,71.5 C68,73 64,75 62,77 C66,78.5 69,79.7 72,81 C77,86 82,93 85,101 C85.2,104.6 85.5,108.2 85.9,111.9 C86.2,115.5 86.7,119.1 87.2,122.8 C89.5,139.7 93.4,156.6 99,172Z')],
  ['shoulders', P('M62,77 C54,77.5 40,84 37.5,99 C37,106 37.5,112 38.5,118 C46,115 52,108 56,99 C60,90 65,84 72,81 C69,79.7 66,78.5 62,77Z')],
  // upper back = infraspinatus + teres major over the shoulder blade
  ['upperback', P('M72,81 C77,86 82,93 85,101 C85.2,104.6 85.5,108.2 85.9,111.9 L62.5,110 L56,99 C60,90 65,84 72,81Z') +
    P('M62.5,110 L85.9,111.9 C86.2,115.5 86.7,119.1 87.2,122.8 L63.5,116Z')],
  ['lats', P('M63.5,116 L87.2,122.8 C89.5,139.7 93.4,156.6 99,172 C95,182 90,193 87,205 C83,200 78,194 74.5,189 C70,172 65.5,150 63,128 C63,122 63,118 63.5,116Z')],
  // lowerback = erector spinae beside the spine + quadratus lumborum above the hip
  ['lowerback', P('M99,172 C95,182 90,193 87,205 C87.5,212 88.5,219 90,224.5 C93,225.5 96,227.5 99,230Z') +
    P('M74.5,189 C78,194 83,200 87,205 C87.5,212 88.5,219 90,224.5 C84,221.5 77,222 71.5,226 C72,216 75.5,203 74.5,189Z')],
  ['triceps', P('M56,115 C47,116 39,119 35,124 C31,132 28,144 26.5,154 C26,161 27,166 29,170 C35,170 41,167 44,160 C47,152 50,142 51.5,134 C53,127 55,121 56,115Z')],
  ['forearms', FOREARM],
  ['glutes', P('M71.5,226 C70.5,244 69,262 78,270 C87,275 94,271 97,262 C98,254 99,247 99,240 L99,230 C96,227.5 93,225.5 90,224.5 C84,221.5 77,222 71.5,226Z')],
  ['hamstrings', P('M70,276 C69,294 71,312 76,326 C81,330 89,330 93,324 C96,308 97,292 97,276 C88,272 78,272 70,276Z')],
  ['calves', P('M73.5,350 C71.5,358 71.5,368 74,376 C76.5,382 79.5,386 82.5,390 C85.5,386 88.5,381 90.5,375 C92.5,367 92.5,357 91,350 C89,345 85,344 82.5,347 C80,344 75.5,345 73.5,350Z')],
];

// One view of the body (FRONT or BACK); box crops it, which is how the small muscle icons are made.
function figure(parts, on, hot, box = '0 0 200 440') {
  const half = `<path class="sil" d="${OUTLINE}Z"/>` + parts.map(([k, s]) =>
    `<g class="${k ? 'm' + (hot.has(k) ? ' hot' : on.has(k) ? ' on' : '') : 'm'}">${s}</g>`).join('') + `<path class="out" d="${OUTLINE}"/>`;
  return `<svg viewBox="${box}" aria-hidden="true">${half}<g transform="matrix(-1 0 0 1 200 0)">${half}</g></svg>`;
}
const bodyMap = (on, hot) => `<div class="map">${figure(FRONT, on, hot)}${figure(BACK, on, hot)}</div>`;

// Muscle icon: the body zoomed in on one muscle, lit up. [view, centre x, centre y, size]
const ICON = {
  chest: [FRONT, 100, 106, 90], shoulders: [FRONT, 100, 98, 140], biceps: [FRONT, 42, 145, 70], triceps: [BACK, 42, 145, 70],
  forearms: [FRONT, 26, 200, 70], abs: [FRONT, 100, 180, 100], traps: [BACK, 100, 100, 110], lats: [BACK, 100, 150, 110],
  upperback: [BACK, 100, 104, 90], lowerback: [BACK, 100, 202, 80], glutes: [BACK, 100, 248, 80], quads: [FRONT, 100, 285, 90],
  hamstrings: [BACK, 100, 300, 90], calves: [BACK, 100, 372, 80],
};
const muscleIcon = m => { const [parts, x, y, s] = ICON[m]; return figure(parts, new Set(), new Set([m]), `${x - s / 2} ${y - s / 2} ${s} ${s}`); };

// Conveyor belt of muscle icons: the list is repeated so it fills the belt, then doubled so the loop is seamless.
function belt(muscles) {
  if (!muscles.length) return '';
  const one = Array(Math.ceil(5 / muscles.length)).fill(muscles).flat().map(m => `<span title="${label(m)}">${muscleIcon(m)}</span>`).join('');
  // The start point follows the clock, so a redraw (e.g. leaving remove mode) carries on mid-loop instead of jumping back to the start.
  const d = muscles.length * Math.ceil(5 / muscles.length) * 2.5;
  return `<span class="belt" aria-hidden="true"><span class="track" style="animation-duration:${d}s;animation-delay:-${(performance.now() / 1000 % d).toFixed(2)}s">${one}${one}</span></span>`;
}

const catChips = (on = cat) => `<div class="cats">${Object.keys(PRESETS).map(c => `<button class="chip${c === on ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>`;
const libSub = it => (it.cat ? '' : 'Custom · ') + (it.muscles.map(label).join(', ') || 'no muscles yet');

// Exercise picker: your library by category, plus a custom one you name yourself.
function pickHTML() {
  const w = W(picking), have = new Set(w.exercises.map(e => e.name.toLowerCase()));
  if (creating) return `<button class="back" id="pickback">Add exercise</button><p class="muted sub">New custom exercise</p>
    <label class="lbl">Name<input id="cname" placeholder="e.g. Cable curl"></label>
    <div class="lbl">Muscles worked</div><div class="muscles">${MUSCLES.map(m => `<button class="chip" data-muscle="${m}">${label(m)}</button>`).join('')}</div>
    <div class="pair"><button class="big save" id="cadd">Add</button><button class="big" id="pickback">Cancel</button></div>`;
  return `<button class="back" id="pickback">${tab === 'today' ? 'Today' : esc(w.name)}</button><p class="muted sub">Add exercise to ${esc(w.name)}</p>${catChips()}
    <button class="big" id="custom">+ Custom exercise</button>` +
    libList().map(it => {
      const added = have.has(it.name.toLowerCase());
      return `<button class="card" data-lib="${it.id}"${added ? ' disabled' : ''}><b>${esc(it.name)}</b>
        <span class="muted small">${added ? 'Already in this workout' : libSub(it)}</span></button>`;
    }).join('');
}

// Plan › View exercises: browse, add, edit and remove library exercises. Name and muscle changes also update
// that exercise in your workouts; sets and reps are what it starts with when you add it.
function libHTML() {
  return `<button class="back" id="libback">Workouts</button><p class="muted sub">All exercises</p>
    <input id="libq" type="search" placeholder="Search exercises" value="${esc(libQ)}" autocomplete="off" enterkeyhint="search">${catChips(libQ.trim() ? null : cat)}
    <div class="pair"><button class="big" id="libadd">+ Add</button><button class="big danger" id="rmmode">${removing ? 'Done' : TRASH + ' Remove'}</button></div>
    <div id="liblist">${libCards()}</div>`;
}

// While searching, every exercise whose name, muscles or category contains the text, A to Z; otherwise the chosen category.
function libCards() {
  const q = libQ.trim().toLowerCase();
  const list = q ? data.library.filter(it => it.id === libEdit || [it.name, it.cat, ...it.muscles.map(label)].join(' ').toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name))
    : libList(libEdit);
  if (!list.length) return '<p class="empty muted">No exercises match.</p>';
  return list.map(it => withTrash(`<div class="ex"><div class="ex-row"><button class="ex-head" data-libedit="${it.id}"><span>${esc(it.name)}</span>
      <span class="muted small">${it.sets} × ${repText(it.reps)} · ${libSub(it)}</span></button></div>
      ${libEdit === it.id ? `<div class="ex-body">
        <label class="lbl">Name<input data-lf="name" value="${esc(it.name)}"></label>
        <div class="grid2"><label class="lbl">Sets<input data-lf="sets" inputmode="numeric" value="${it.sets}"></label>
          <label class="lbl">Reps<input data-lf="reps" inputmode="numeric" value="${it.reps[1]}"></label></div>
        <div class="lbl">Muscles</div><div class="muscles">${MUSCLES.map(m => `<button class="chip${it.muscles.includes(m) ? ' on' : ''}" data-lmuscle="${m}">${label(m)}</button>`).join('')}</div>
        <button class="big" id="libdone">Done</button></div>` : ''}</div>`, removing && `data-libdel="${it.id}"`, it.name)).join('');
}

function planHTML() {
  if (libView) return libHTML();
  const w = W(editW);
  if (!w) return `<h1>Workouts</h1><div class="pair"><button class="big" id="addw">+ New workout</button>
    <button class="big danger" id="rmmode">${removing ? 'Done' : TRASH + ' Remove'}</button></div>` +
    data.workouts.map(w => withTrash(`<button class="card wk" data-editw="${w.id}"><span class="info"><b>${esc(w.name)}</b>
    <span class="muted small">${daysText(w.days)} · ${w.exercises.length} exercises</span></span>${belt(MUSCLES.filter(m => w.exercises.some(e => e.muscles.includes(m))))}</button>`, removing && `data-rmw="${w.id}"`, w.name)).join('') +
    '<button class="big del" id="libview">View exercises</button>';
  let h = `<button class="back" data-editw="">Workouts</button>
    <label class="lbl">Name<input data-wf="name" value="${esc(w.name)}"></label>
    <div class="lbl">Days</div><div class="days">${WEEK.map(d => `<button class="chip${w.days.includes(d) ? ' on' : ''}" data-day="${d}">${DAY[d].slice(0, 3)}</button>`).join('')}</div>
    <div class="pair top"><button class="big" id="addex">+ Add</button><button class="big danger" id="rmmode">${removing ? 'Done' : TRASH + ' Remove'}</button></div>
    <div class="lbl">Exercises</div><div id="exlist">`;
  w.exercises.forEach((e, i) => {
    h += withTrash(`<div class="ex"><div class="ex-row"><button class="ex-head" data-editex="${i}"><span>${esc(e.name)}</span><span class="muted small">${e.sets} × ${repText(e.reps)}</span></button>
      ${removing ? '' : `<span class="grip" data-grip="${i}" aria-label="Drag to reorder">${GRIP}</span>`}</div>${editEx === i ? exEditHTML(e, i) : ''}</div>`, removing && `data-delex="${i}"`, e.name);
  });
  return h + `</div><button class="big danger del" id="delw">${TRASH} Delete workout</button>`;
}

// Exercise editor, used in Plan and for "+ Add exercise" on Today. Edits exercise editEx of workout editW.
// Exercise editor in a workout: sets and reps only, applied when you tap Save. Names and muscles are edited on the Exercises page.
const exEditHTML = (e, i) => `<div class="ex-body">
  <div class="grid2"><label class="lbl">Sets<input data-ef="sets" inputmode="numeric" value="${e.sets}"></label>
    <label class="lbl">Reps<input data-ef="reps" inputmode="numeric" value="${e.reps[1]}"></label></div>
  <div class="lbl">Muscles worked</div><p class="worked">${e.muscles.map(label).join(', ') || 'None set'}</p>
  <div class="pair"><button class="big save" data-saveex="${i}">Save</button><button class="big danger" data-delex="${i}">${TRASH} Delete</button></div></div>`;

// History lists every exercise once, grouped like the Add exercise list (or by its first muscle if it isn't a preset).
// The same exercise in several workouts (matched by name) shares one history.
function historyHTML() {
  const byName = {}, libCat = Object.fromEntries(data.library.filter(it => it.cat).map(it => [it.name.toLowerCase(), it.cat]));
  for (const e of Object.values(EX)) {
    const k = e.name.toLowerCase();
    (byName[k] ||= { name: e.name, cat: libCat[k] || CATEGORY[e.muscles[0]] || 'Other', ids: [] }).ids.push(e.id);
  }
  // Exercises since removed from every workout, so their history isn't lost.
  for (const id of new Set(Object.values(data.logs).flatMap(Object.keys))) {
    const name = !EX[id] && data.names[id];
    if (name) (byName[name.toLowerCase()] ||= { name, cat: libCat[name.toLowerCase()] || 'Other', ids: [] }).ids.push(id);
  }
  // Every exercise on your list shows too, even ones not in a workout yet.
  for (const it of data.library) byName[it.name.toLowerCase()] ||= { name: it.name, cat: it.cat || CATEGORY[it.muscles[0]] || 'Other', ids: [] };
  const all = Object.values(byName).sort((x, y) => x.name.localeCompare(y.name));
  const cur = all.find(x => x.name === hist) || all[0];
  if (!cur) return '<h1>History</h1><p class="empty muted">No exercises yet. Add some in Plan.</p>';
  hist = cur.name;
  const opts = [...Object.keys(PRESETS), 'Other'].map(c => [c, all.filter(x => x.cat === c)]).filter(([, l]) => l.length).map(([c, l]) =>
    `<optgroup label="${c}">${l.map(x => `<option value="${esc(x.name)}"${x === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  const rows = Object.keys(data.logs).sort().map(d => [d, cur.ids.flatMap(id => data.logs[d][id] || []).filter(x => x?.r)]).filter(([, s]) => s.length);
  const pts = rows.map(([d, s]) => [d, Math.max(...s.map(x => +x.w || 0))]);
  histIds = cur.ids;
  return `<h1>History</h1><select id="hist">${opts}</select>${rangeChips(histRange, 'histrange')}${chart(pts, null, RANGES[histRange])}<p class="muted small">Heaviest set each session (kg)</p>` +
    `<div class="rowlist">${rows.reverse().map(([d, s]) => `<div class="row"><span>${fmt(d)}</span><span>${s.map(setText).join('  ')}<button class="x danger" data-delsess="${d}" aria-label="Delete session on ${fmt(d)}">${TRASH}</button></span></div>`).join('')}</div>` +
    (rows.length ? `<button class="big danger del" id="delhist">${TRASH} Delete history</button>` : '');
}

// BMI = kg / m². NHS adult bands; the bar runs from 15 to 40.
const BANDS = [[18.5, 'Underweight', '#4aa3ff'], [25, 'Healthy', '#3ecf8e'], [30, 'Overweight', '#f5b942'], [40, 'Obese', '#ff6b6b']];
const pct = v => (Math.max(15, Math.min(40, v)) - 15) / 25 * 100;
function bmiOut() {
  const { h, kg } = data.bmi, bmi = kg / (h / 100) ** 2, band = bmi > 0 && isFinite(bmi) && (BANDS.find(b => bmi < b[0]) || BANDS[3]);
  const bar = BANDS.map(([hi, , c], i) => `<i style="width:${pct(hi) - pct(i ? BANDS[i - 1][0] : 15)}%;background:${c}"></i>`).join('');
  return `<div id="bmires"><p>${band ? `BMI <b>${bmi.toFixed(1)}</b> · <b style="color:${band[2]}">${band[1]}</b>` : '<span class="muted">Enter your height and weight</span>'}</p>
    <div class="gauge">${bar}${band ? `<b style="left:${pct(bmi)}%"></b>` : ''}</div>
    <div class="ticks">${BANDS.slice(0, 3).map(([v]) => `<span style="left:${pct(v)}%">${v}</span>`).join('')}</div></div>`;
}

// The BMI boxes show cm or ft'in and kg or lbs (tap the grey unit to switch) but always save cm and kg.
const UNITS = { ft: ['cm', 'ft'], lb: ['kg', 'lbs'] };
function bmiShow(f) {
  const v = data.bmi[f];
  if (!(v > 0)) return '';
  if (f === 'kg') return +(data.bmi.lb ? v * LB : v).toFixed(1);
  const i = Math.round(v / 2.54);
  return data.bmi.ft ? `${Math.floor(i / 12)}'${i % 12}` : +v.toFixed(1);
}
function bmiRead(f, v) {
  if (f === 'kg') { const n = num(v); return data.bmi.lb && n ? n / LB : n; }
  if (!data.bmi.ft) return num(v);
  const [ft, inch = 0] = v.split(/\D+/).filter(Boolean).map(Number); // 6'0, 6 0 or 6.0 (the keypad has no ')
  return ft > 0 ? (ft * 12 + inch) * 2.54 : null;
}
const unitBox = (f, u) => `<div class="unitbox"><input data-bmi="${f}" inputmode="decimal" value="${bmiShow(f)}"><button data-bmiu="${u}" aria-label="Switch units">${UNITS[u][+!!data.bmi[u]]}</button></div>`;

// Chart periods on Body and History, in days (0 = all time). Each page remembers its own.
const RANGES = { All: 0, Week: 7, Month: 30, '6M': 182, '1Y': 365 };
let bwRange = 'All', histRange = 'All';
const rangeChips = (on, attr) => `<div class="ranges">${Object.keys(RANGES).map(r => `<button class="chip${r === on ? ' on' : ''}" data-${attr}="${r}">${r}</button>`).join('')}</div>`;

function bodyHTML() {
  const w = [...data.weights].sort((a, b) => a.date < b.date ? -1 : 1);
  const pts = w.map(x => [x.date, +x.kg]), span = RANGES[bwRange];
  const recent = span ? pts.filter(p => D(p[0]) >= D(today()) - span * 864e5) : pts;
  let h = `<h1>Body</h1><h2>BMI</h2><div class="grid2">
    <label class="lbl">Height${unitBox('h', 'ft')}</label>
    <label class="lbl">Weight${unitBox('kg', 'lb')}</label></div>${bmiOut()}
  <h2>Bodyweight</h2><div class="add"><input type="date" id="bwdate" value="${today()}">
    <div class="unitbox"><input id="bwkg" inputmode="decimal"><button id="bwunit" aria-label="Switch kg / lbs">kg</button></div><button id="logbw">Log</button></div>`;
  h += rangeChips(bwRange, 'bwrange');
  if (recent.length > 1) {
    const rate = fit(recent)[1] * 7;
    h += `<p>Trend: <b>${rate >= 0 ? '+' : ''}${rate.toFixed(2)} kg/week</b> <span class="muted small">(aim +0.25 to +0.5)</span></p>`;
  } else if (pts.length) h += `<p class="muted small">Log two weigh-ins in this period to see a trend.</p>`;
  return h + chart(pts, recent, span) + `<div class="rowlist">${w.reverse().map(x =>
    `<div class="row"><span>${fmt(x.date)}</span><span>${+x.kg} kg<button class="x danger" data-delbw="${x.date}" aria-label="Delete weigh-in for ${fmt(x.date)}">${TRASH}</button></span></div>`).join('')}</div>`;
}

// How long since the last export; red once it's over two weeks (or never).
function backupAge() {
  const days = data.lastBackup && Math.round((D(today()) - D(data.lastBackup)) / 864e5);
  const text = !data.lastBackup ? 'Never backed up' : `Last backup: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`;
  return `<p class="${!data.lastBackup || days > 14 ? 'overdue' : 'muted'}">${text}</p>`;
}

// Theme colours are hues; the slider picks any hue in between.
const hue = h => `hsl(${h} 100% 60%)`;
const THEMES = Object.fromEntries(Object.entries({ Orange: 25, Red: 355, Pink: 330, Purple: 265, Blue: 212, Teal: 180, Green: 95, Yellow: 45 }).map(([n, h]) => [n, hue(h)]));
const settingsHTML = () => `<h1>Settings</h1><button id="tutorial" class="big">▶ Watch tutorial</button><button id="update" class="big">Check for updates</button><span class="lbl">Theme colour</span>
  <div class="swatches">${Object.entries(THEMES).map(([n, c]) => `<button data-theme="${c}" class="${c === (data.theme || THEMES.Orange) ? 'on' : ''}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
  <input type="range" id="hue" class="hue" min="0" max="360" value="${(data.theme || '').match(/hsl\((\d+)/)?.[1] ?? 25}" aria-label="Theme colour">
  <label class="toggle"><span>Haptics</span><input type="checkbox" id="hapticson"${data.haptics === false ? '' : ' checked'}></label>
  <h1>Rest timer</h1><span class="lbl">Default rest</span>
  <div class="restset"><button class="adj" data-restdef="-15" aria-label="15 seconds less">−</button><b class="tc">${mss(restDefault())}</b>
    <button class="adj" data-restdef="15" aria-label="15 seconds more">+</button></div>
  <p class="muted small">Every rest starts at this. − / + on the timer change just the rest you're on.</p>
  <label class="toggle"><span>Beep when rest is over</span><input type="checkbox" id="beepon"${data.beep === false ? '' : ' checked'}></label>
  <h1>Backup</h1>
  <p>Everything is saved on this phone only. Export a backup every week or two and keep it in iCloud Drive or Files.</p>
  ${backupAge()}
  <button id="export" class="big">Export backup</button>
  <label class="btn big">Import backup<input type="file" id="import" accept="application/json,.json" hidden></label>
  <p class="muted small">${Object.keys(data.logs).length} training days and ${data.weights.length} weigh-ins saved.</p>`;

// Least-squares line through [date, y] points (sorted). Returns [y at first date, slope per day].
function fit(pts) {
  const xs = pts.map(p => (D(p[0]) - D(pts[0][0])) / 864e5), ys = pts.map(p => p[1]), n = pts.length;
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = sxx ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  return [my - b * mx, b];
}

// trend: the points to fit the dashed trend line to. span (days): that much time fills the width, ending today, and
// earlier entries scroll in from the left; the kg labels then stay pinned on the left.
function chart(pts, trend, span) {
  const W = 340, H = 180, L = 38, R = 10, T = 10, B = 24;
  // Nothing logged yet: the empty chart frame, so the page looks the same for every exercise.
  if (!pts.length) return `<svg class="chart" viewBox="0 0 ${W} ${H}"><line class="grid" x1="${L}" x2="${W - R}" y1="${T}" y2="${T}"/>
    <line class="grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text x="${(L + W - R) / 2}" y="${(T + H - B) / 2 + 4}" text-anchor="middle">Nothing logged yet</text></svg>`;
  const xs = pts.map(p => D(p[0]).getTime()), ys = pts.map(p => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.15 || 1;
  let x0 = xs[0], x1 = xs.at(-1), w = W, l = L;
  if (span) {
    l = L + 24; // room for the oldest date beside the pinned kg labels
    x1 = Math.max(x1, D(today()).getTime());
    x0 = Math.min(x0, x1 - span * 864e5);
    w = l + R + (W - l - R) * (x1 - x0) / (span * 864e5);
  }
  const sx = x => x1 === x0 ? (l + w - R) / 2 : l + (x - x0) / (x1 - x0) * (w - l - R); // a single entry sits in the middle
  const sy = y => T + (hi + pad - y) / (hi - lo + 2 * pad) * (H - T - B);
  const yl = [...new Set([lo, hi])].map(y => `<text x="${L - 6}" y="${sy(y) + 4}" text-anchor="end">${+y.toFixed(1)}</text>`).join('');
  let s = `<svg class="chart" viewBox="0 0 ${w} ${H}"${span ? ` style="width:${w / W * 100}%"` : ''}>`;
  for (const y of new Set([lo, hi])) s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${sy(y)}" y2="${sy(y)}"/>`;
  if (!span) s += yl;
  if (span) { // a date under every entry with room for it, newest first so the latest is always labelled
    let last = Infinity;
    for (const p of [...pts].reverse()) if (last - sx(D(p[0]).getTime()) >= 56) {
      last = sx(D(p[0]).getTime());
      s += `<text x="${Math.min(last, w - 2)}" y="${H - 6}" text-anchor="${last > w - 30 ? 'end' : 'middle'}">${fmt(p[0])}</text>`; // kept clear of the right edge
    }
    const start = new Date(x1 - span * 864e5); // and where the period starts, when it all fits without scrolling
    if (w - W < 1 && last - L >= 80) s += `<text x="${L}" y="${H - 6}">${start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</text>`;
  } else s += x1 === x0 ? `<text x="${sx(x0)}" y="${H - 6}" text-anchor="middle">${fmt(pts[0][0])}</text>`
    : `<text x="${L}" y="${H - 6}">${fmt(pts[0][0])}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmt(pts.at(-1)[0])}</text>`;
  if (trend?.length > 1) {
    const [a, b] = fit(trend), t0 = D(trend[0][0]).getTime(), t1 = D(trend.at(-1)[0]).getTime();
    s += `<line class="trend" x1="${sx(t0)}" y1="${sy(a)}" x2="${sx(t1)}" y2="${sy(a + b * (t1 - t0) / 864e5)}"/>`;
  }
  s += `<polyline points="${xs.map((x, i) => `${sx(x)},${sy(ys[i])}`).join(' ')}"/>` + xs.map((x, i) => `<circle cx="${sx(x)}" cy="${sy(ys[i])}" r="3"/>`).join('') + '</svg>';
  return span ? `<div class="chartwrap"><div class="chartscroll">${s}</div><svg class="chart yaxis" viewBox="0 0 ${L} ${H}" style="width:${L / W * 100}%">${yl}</svg></div>` : s;
}

// Rest timer: manual start/stop countdown. Stores the end time so it stays right if the screen locks.
// Every rest starts at your default (Settings); − / + change just this rest by 15 s, until you stop it.
let end = 0, beeped, tick, audio, lock, restNow = null;
const wake = () => navigator.wakeLock?.request('screen').then(l => lock = l, () => {});
const restDefault = () => data.restDefault ?? 90;
const restLen = () => restNow ?? restDefault();
const mss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function startStop() {
  if (end) { end = 0; restNow = null; clearInterval(tick); lock?.release(); lock = null; }
  else {
    end = Date.now() + restLen() * 1000; beeped = false;
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    tick = setInterval(paintTimer, 250);
    wake();
  }
  paintTimer();
}

function adjust(d) {
  const len = Math.min(900, Math.max(15, restLen() + d));
  if (end) { end += (len - restLen()) * 1000; if (end > Date.now()) beeped = false; }
  restNow = len;
  paintTimer();
}

function paintTimer() {
  const left = end ? Math.ceil((end - Date.now()) / 1000) : restLen();
  if (end && !beeped && left <= 0) { beeped = true; beep(); if (data.haptics !== false) navigator.vibrate?.([200, 100, 200, 100, 200]); }
  $('clock').textContent = left > 0 ? mss(left) : '+' + mss(-left); // past zero it counts the overtime
  $('go').textContent = end ? 'Stop' : 'Start rest';
  timerEl.classList.toggle('ready', !!end && left <= 0);
}

function beep() {
  if (data.beep === false) return;
  for (let i = 0; i < 3; i++) {
    const t = audio.currentTime + i * 0.35, o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + 0.25);
  }
}

// Haptics (Settings switch; on unless data.haptics is false). Android has navigator.vibrate. iPhone Safari doesn't,
// but tapping a hidden iOS 18+ switch control plays the system tick. iOS only allows that during a tap, so call it from tap handlers.
const hapticSwitch = Object.assign(document.createElement('label'), { ariaHidden: 'true', innerHTML: '<input type="checkbox" switch>' });
hapticSwitch.style.display = 'none';
for (const ev of ['click', 'change']) hapticSwitch.addEventListener(ev, e => e.stopPropagation()); // keep its clicks out of the app's handlers
document.body.append(hapticSwitch);
function haptic() {
  if (data.haptics === false) return;
  if (navigator.vibrate) navigator.vibrate(10); else hapticSwitch.click();
}

// Records the backup date (in the file too) unless you cancel the share sheet.
async function exportData() {
  const name = `gym-backup-${today()}.json`, prev = data.lastBackup;
  data.lastBackup = today();
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => data.lastBackup = prev);
  else Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name }).click();
  save(); render();
}

// In-app "Are you sure?" box. The browser's own confirm() is silently blocked in some places, which made deletes do nothing.
// Resolves true only when the red button is tapped; Cancel, Escape or tapping outside the box resolve false.
$('tut').addEventListener('close', e => e.target.querySelector('video').pause());
const askBox = $('ask');
askBox.addEventListener('click', e => { if (e.target === askBox) askBox.close(); });
const ask = (q, note = '', yes = 'Delete') => new Promise(res => {
  askBox.querySelector('b').textContent = q;
  askBox.querySelector('p').textContent = note;
  askBox.querySelector('[value=y]').textContent = yes;
  askBox.returnValue = '';
  askBox.showModal();
  askBox.addEventListener('close', () => res(askBox.returnValue === 'y'), { once: true });
});

async function importData(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d || typeof d.logs !== 'object' || Array.isArray(d.logs) || !Array.isArray(d.weights)) throw 0;
    if (!await ask('Are you sure you want to replace everything on this phone with this backup?', 'Everything here now is deleted.', 'Replace')) return;
    if (!Array.isArray(d.workouts)) d.workouts = data.workouts;
    d.done ||= {}; delete d.restFor; d.rows ||= {}; d.bmi ||= {}; d.names ||= {};
    makeLibrary(d);
    data = d; save(); rebuild(); render();
  } catch { alert("That file isn't a gym backup."); }
}

// Plan edits: change the data, save, rebuild the exercise lookup, re-render.
function edit(fn) { fn(); save(); rebuild(); render(); }

// Drag to reorder exercises in Plan: hold the ≡ handle and move. Works with touch (iPhone) and mouse.
// The card follows your finger, the others slide out of the way, and the page scrolls near the top/bottom edge.
let drag;
document.addEventListener('pointerdown', e => {
  const grip = e.target.closest('[data-grip]');
  if (!grip) return;
  e.preventDefault();
  const cards = [...$('exlist').children], from = +grip.dataset.grip, el = cards[from];
  drag = { cards, from, to: from, el, y0: e.pageY, y: e.clientY, h: el.offsetHeight + 10,
    mids: cards.map(c => c.offsetTop + c.offsetHeight / 2) };
  el.classList.add('dragging');
  dragStep();
});
function dragUpdate() {
  const { cards, from, el, y0, y, h, mids } = drag, dy = y + scrollY - y0, mid = mids[from] + dy;
  const to = cards.filter((c, k) => k !== from && mids[k] < mid).length;
  if (to !== drag.to) haptic(); // a tick as the card passes each slot
  drag.to = to;
  el.style.transform = `translateY(${dy}px)`;
  cards.forEach((c, k) => { if (k !== from) c.style.transform = from < k && k <= drag.to ? `translateY(${-h}px)` : drag.to <= k && k < from ? `translateY(${h}px)` : ''; });
}
function dragStep() {
  if (!drag) return;
  const edge = 90, bottom = innerHeight - 160; // keep clear of the timer bar and tabs
  if (drag.y < edge) scrollBy(0, -8); else if (drag.y > bottom) scrollBy(0, 8);
  dragUpdate();
  requestAnimationFrame(dragStep);
}
document.addEventListener('pointermove', e => { if (drag) { drag.y = e.clientY; e.preventDefault(); } }, { passive: false });
const dragEnd = () => {
  if (!drag) return;
  const { from, to } = drag, ex = W(editW).exercises;
  drag = null;
  if (from === to) return render();
  edit(() => {
    ex.splice(to, 0, ex.splice(from, 1)[0]);
    if (editEx === from) editEx = to; else if (editEx !== null && (editEx - from) * (editEx - to) <= 0) editEx += from < to ? -1 : 1;
  });
};
document.addEventListener('pointerup', dragEnd);
document.addEventListener('pointercancel', dragEnd);

// Adds an exercise from your list to the workout being picked for, then opens it so you can set its sets and reps.
function addFromList(it) {
  const w = W(picking), id = uid();
  edit(() => {
    editW = w.id; editEx = w.exercises.push({ id, lib: it.id, name: it.name, sets: it.sets, reps: [...it.reps], rest: [...it.rest], muscles: [...it.muscles] }) - 1;
    picking = open = null;
    if (tab === 'today') hl = id;
  });
  document.querySelector('[data-saveex]').closest('.ex').scrollIntoView({ block: 'center' });
}

// Ends remove mode: the trash boxes slide out to the right, then the page redraws without them.
async function leaveRemove() {
  view.classList.replace('slidein', 'slideout') || view.classList.add('slideout');
  await new Promise(r => setTimeout(r, 270)); // a touch longer than the 0.25s slide, so it has fully finished
  removing = false; render();
}

function goTab(t) { tab = t; removing = creating = false; picking = libEdit = null; libView = false; render(); scrollTo(0, 0); }

// Swipe the page left or right to move between tabs. Not while dragging, picking, removing, in a pop-up, or on the
// sideways-scrolling chart and the colour slider.
const TABS = ['today', 'plan', 'history', 'body', 'settings'];
let swipe; // this touch listener also lets iPhone Safari show the pressed (:active) style
document.addEventListener('touchstart', e => {
  const t = e.touches[0];
  swipe = e.touches.length === 1 && !drag && !picking && !removing && !e.target.closest('.chartscroll, input[type=range], dialog, nav') ? [t.clientX, t.clientY] : null;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe[0], dy = t.clientY - swipe[1], i = TABS.indexOf(tab) + (dx < 0 ? 1 : -1);
  swipe = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || !TABS[i]) return;
  haptic(); goTab(TABS[i]);
  view.animate([{ transform: `translateX(${Math.sign(dx) * -40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], 180);
}, { passive: true });

// Settings › Check for updates: re-download every cached file, skipping the browser cache. If any changed, reload.
async function checkUpdate(b) {
  b.textContent = 'Checking…';
  try {
    const c = await caches.open('gym');
    const changed = await Promise.all((await c.keys()).map(async req => {
      const r = await fetch(req.url, { cache: 'no-store' });
      if (!r.ok) throw r;
      const old = await (await c.match(req)).text(), now = await r.clone().text();
      await c.put(req, r);
      return now !== old;
    }));
    (await navigator.serviceWorker.getRegistration())?.update();
    if (changed.includes(true)) { b.textContent = 'Updating…'; return location.reload(); }
    b.textContent = "You're up to date";
  } catch { b.textContent = "Couldn't check. Are you online?"; }
  setTimeout(() => b.isConnected && (b.textContent = 'Check for updates'), 3000);
}

document.addEventListener('click', async e => {
  // In remove mode, tapping anywhere except a trash box, Done, the pop-up, the tab bar or the timer just ends remove mode.
  if (removing && !e.target.closest('.wrow > .mini, #rmmode, dialog, nav, #timer')) return leaveRemove();
  const b = e.target.closest('button');
  if (b) haptic();
  if (!b || b.closest('dialog')) return;
  const ds = b.dataset, w = W(editW), ex = w?.exercises;
  if (ds.tab) goTab(ds.tab);
  else if (b.id === 'update') checkUpdate(b);
  else if (b.id === 'weekbtn') { showWeek = !showWeek; render(); }
  else if ('pick' in ds) { sel = ds.pick || null; showWeek = removing = false; open = hl = null; render(); }
  else if (ds.hl) { hl = hl === ds.hl ? null : ds.hl; render(); }
  else if (ds.open) {
    open = open === ds.open ? null : ds.open;
    if (open) hl = open;
    render();
    document.querySelector(`[data-open="${ds.open}"]`).closest('.ex').scrollIntoView({ block: 'nearest' });
  }
  else if (ds.done) edit(() => {
    const d = today(), did = data.done[d] || [];
    data.done[d] = did.includes(ds.done) ? did.filter(x => x !== ds.done) : [...did, ds.done];
  });
  else if (ds.addset) edit(() => (data.rows[today()] ||= {})[ds.addset] = setCount(ds.addset) + 1);
  else if (ds.rmset) {
    const n = setCount(ds.rmset) - 1, l = data.logs[today()]?.[ds.rmset];
    if (!await ask(`Are you sure you want to remove set ${n + 1}?`, l?.[n]?.r ? 'Its weight and reps are deleted.' : '', 'Remove')) return;
    edit(() => { (data.rows[today()] ||= {})[ds.rmset] = n; if (l) l.length = Math.min(l.length, n); });
  }
  else if (b.id === 'rmmode') {
    if (removing) return leaveRemove();
    removing = true; open = null; render();
    view.classList.add('slidein');
  }
  else if (ds.rmex) {
    const w = W(sel), x = w.exercises[+ds.rmex];
    if (await ask(`Are you sure you want to remove ${x.name} from ${w.name}?`, 'Its history is kept.', 'Remove')) edit(() => {
      w.exercises.splice(+ds.rmex, 1);
      if (hl === x.id) hl = null;
      if (!w.exercises.length) removing = false;
      if (editW === sel) editEx = null;
    });
  }
  else if (ds.delsess) {
    // Deletes this exercise's sets (and done tick) from one day only.
    const d = ds.delsess;
    if (await ask(`Are you sure you want to delete ${hist} on ${fmt(d)}?`, 'Only that session is deleted. The rest of its history stays.')) edit(() => {
      for (const id of histIds) delete data.logs[d][id];
      if (!Object.keys(data.logs[d]).length) delete data.logs[d];
      if (data.done[d]) data.done[d] = data.done[d].filter(id => !histIds.includes(id));
    });
  }
  else if (b.id === 'delhist') {
    // Deletes every logged set (and done tick) for this exercise. It stays in your workouts and exercise list.
    if (await ask(`Are you sure you want to delete the history for ${hist}?`, 'All its logged sets are deleted. The exercise stays in your workouts and exercise list.')) edit(() => {
      for (const d of Object.keys(data.logs)) {
        for (const id of histIds) delete data.logs[d][id];
        if (!Object.keys(data.logs[d]).length) delete data.logs[d];
      }
      for (const d in data.done) data.done[d] = data.done[d].filter(id => !histIds.includes(id));
      for (const id of histIds) delete data.names[id];
    });
  }
  else if (ds.theme) edit(() => data.theme = ds.theme);
  else if (b.id === 'go') startStop();
  else if (b.id === 'minus') adjust(-15);
  else if (b.id === 'plus') adjust(15);
  else if (b.id === 'export') exportData();
  else if (b.id === 'tutorial') { $('tut').showModal(); $('tut').querySelector('video').play().catch(() => {}); }
  else if (b.id === 'bwunit') {
    // Tapping the unit switches kg ⇄ lbs and converts whatever is typed. Weigh-ins are always saved in kg.
    const i = $('bwkg'), v = num(i.value), toLb = b.textContent === 'kg';
    if (v > 0) i.value = +(toLb ? v * LB : v / LB).toFixed(1);
    b.textContent = toLb ? 'lbs' : 'kg';
  }
  else if (ds.bmiu) {
    const u = ds.bmiu, f = u === 'ft' ? 'h' : 'kg';
    data.bmi[u] = !data.bmi[u];
    save();
    document.querySelector(`[data-bmi=${f}]`).value = bmiShow(f);
    b.textContent = UNITS[u][+data.bmi[u]];
  }
  else if (b.id === 'logbw') {
    const date = $('bwdate').value, typed = num($('bwkg').value), kg = $('bwunit').textContent === 'lbs' ? +(typed / LB).toFixed(1) : typed;
    if (!date || !(kg > 0)) return;
    edit(() => data.weights = data.weights.filter(x => x.date !== date).concat({ date, kg }));
  }
  else if (ds.delbw) { if (await ask(`Are you sure you want to delete the weigh-in for ${fmt(ds.delbw)}?`)) edit(() => data.weights = data.weights.filter(x => x.date !== ds.delbw)); }
  else if ('editw' in ds) { editW = ds.editw || null; editEx = null; removing = false; render(); scrollTo(0, 0); }
  else if (b.id === 'addw') edit(() => { editW = uid(); editEx = null; data.workouts.push({ id: editW, name: 'New workout', days: [], inc: 2.5, exercises: [] }); });
  else if (b.id === 'delw' || ds.rmw) { if (await ask(`Are you sure you want to delete ${(w || W(ds.rmw)).name}?`, 'Your logged sets are kept.')) edit(() => {
    const id = ds.rmw || w.id;
    data.workouts = data.workouts.filter(x => x.id !== id);
    if (sel === id) sel = null;
    editW = null;
    if (!data.workouts.length) removing = false;
  }); }
  else if (ds.day) edit(() => {
    // One workout per day: giving this workout a day takes it off any other workout.
    const d = +ds.day;
    if (w.days.includes(d)) w.days = w.days.filter(x => x !== d);
    else { data.workouts.forEach(o => o.days = o.days.filter(x => x !== d)); w.days.push(d); }
  });
  else if (ds.editex) { editEx = editEx === +ds.editex ? null : +ds.editex; render(); }
  else if (ds.muscle) b.classList.toggle('on'); // saved with the rest when you tap Save
  else if (ds.saveex) edit(() => {
    const x = ex[+ds.saveex], body = b.closest('.ex-body'), f = k => body.querySelector(`[data-ef="${k}"]`);
    const n = k => Math.max(1, Math.min(50, parseInt(f(k).value) || 1));
    x.sets = Math.min(n('sets'), 10);
    x.reps = [n('reps'), n('reps')]; // one target: hit it on every set and the app says go up
    editEx = null;
    if (tab === 'today') editW = null;
  });
  else if (b.id === 'addtoday' || b.id === 'addex') {
    if (b.id === 'addtoday' && !W(sel)) { // rest day: add to an "Extra" workout with no days, made the first time
      let w = data.workouts.find(w => w.name === 'Extra' && !w.days.length);
      if (!w) data.workouts.push(w = { id: uid(), name: 'Extra', days: [], inc: 2.5, exercises: [] });
      sel = w.id; save();
    }
    picking = b.id === 'addtoday' ? sel : editW; removing = false; render(); scrollTo(0, 0); }
  else if (ds.cat) { cat = ds.cat; libQ = ''; render(); }
  else if (ds.bwrange) { bwRange = ds.bwrange; render(); }
  else if (ds.restdef) { data.restDefault = Math.min(900, Math.max(15, restDefault() + +ds.restdef)); save(); render(); }
  else if (ds.histrange) { histRange = ds.histrange; render(); }
  else if (b.id === 'pickback') { if (creating) creating = false; else picking = null; render(); }
  else if (ds.lib) addFromList(data.library.find(x => x.id === ds.lib));
  else if (b.id === 'custom') { creating = true; render(); scrollTo(0, 0); $('cname').focus(); }
  else if (b.id === 'cadd') {
    // A custom exercise goes on your Exercises list (edit its name and muscles there), then into the workout.
    const name = $('cname').value.trim();
    if (!name) return $('cname').focus();
    const it = { id: uid(), name, sets: 3, reps: [10, 10], rest: [...BIG], muscles: [...document.querySelectorAll('[data-muscle].on')].map(c => c.dataset.muscle) };
    data.library.unshift(it);
    creating = false;
    addFromList(it);
  }
  else if (b.id === 'libview') { libView = true; removing = false; libQ = ''; render(); scrollTo(0, 0); }
  else if (b.id === 'libback') { libView = false; libEdit = null; removing = false; render(); scrollTo(0, 0); }
  else if (ds.libedit) { libEdit = libEdit === ds.libedit ? null : ds.libedit; render(); }
  else if (b.id === 'libdone') { libEdit = null; render(); }
  else if (b.id === 'libadd') {
    edit(() => { const it = { id: uid(), name: 'New exercise', sets: 3, reps: [10, 10], rest: [...BIG], muscles: [] }; data.library.unshift(it); libEdit = it.id; removing = false; libQ = ''; });
    const name = document.querySelector('[data-lf="name"]');
    name.focus(); name.select();
  }
  else if (ds.lmuscle) edit(() => {
    const it = data.library.find(x => x.id === libEdit), m = it.muscles;
    it.muscles = m.includes(ds.lmuscle) ? m.filter(x => x !== ds.lmuscle) : [...m, ds.lmuscle];
    for (const w of data.workouts) for (const e of w.exercises) if (e.lib === it.id) e.muscles = [...it.muscles];
  });
  else if (ds.libdel) {
    // Deletes it everywhere: the list, every workout with it (linked, or the same name), and all its logged sets, so it leaves History too.
    const it = data.library.find(x => x.id === ds.libdel), same = e => e.lib === it.id || e.name.toLowerCase() === it.name.toLowerCase();
    const inW = data.workouts.filter(w => w.exercises.some(same)).length;
    const ids = new Set([...data.workouts.flatMap(w => w.exercises.filter(same).map(e => e.id)),
      ...Object.keys(data.names).filter(id => data.names[id].toLowerCase() === it.name.toLowerCase())]);
    const where = inW ? `, ${inW === 1 ? '1 workout' : inW + ' workouts'}` : '';
    if (await ask(`Are you sure you want to delete ${it.name}?`, `It's removed from your exercise list${where} and History, and all its logged sets are deleted.`)) edit(() => {
      data.library = data.library.filter(x => x !== it);
      for (const w of data.workouts) w.exercises = w.exercises.filter(e => !same(e));
      for (const d of Object.keys(data.logs)) {
        for (const id of ids) delete data.logs[d][id];
        if (!Object.keys(data.logs[d]).length) delete data.logs[d];
      }
      for (const d in data.done) data.done[d] = data.done[d].filter(id => !ids.has(id));
      for (const id of ids) delete data.names[id];
      if (libEdit === it.id) libEdit = null;
      if (ids.has(hl)) hl = null;
      if (ids.has(open)) open = null;
    });
  }
  else if (ds.delex) { if (await ask(`Are you sure you want to delete ${ex[+ds.delex].name}?`, 'Its logged sets are kept.')) edit(() => { ex.splice(+ds.delex, 1); editEx = null; if (!ex.length) removing = false; }); }
});

// Sets save on every keypress (not re-rendered) so nothing is lost if the phone locks mid-typing.
document.addEventListener('input', e => {
  if (e.target.id === 'hue') {
    data.theme = hue(e.target.value); save();
    document.documentElement.style.setProperty('--accent', data.theme);
    document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === data.theme));
    return;
  }
  if (e.target.id === 'libq') {
    libQ = e.target.value;
    $('liblist').innerHTML = libCards();
    document.querySelectorAll('[data-cat]').forEach(c => c.classList.toggle('on', !libQ.trim() && c.dataset.cat === cat));
    return;
  }
  const f = e.target.dataset.bmi;
  if (f) { data.bmi[f] = bmiRead(f, e.target.value); save(); $('bmires').outerHTML = bmiOut(); show3d(); return; }
  const row = e.target.closest('.set');
  if (!row) return;
  const { ex, i } = row.dataset, [wt, r] = [...row.querySelectorAll('input')].map(x => num(x.value));
  ((data.logs[today()] ||= {})[ex] ||= [])[+i] = { w: wt, r };
  data.names[ex] = EX[ex].name;
  save();
});

// Shows an edited name / sets × reps on the open card straight away; a full re-render would close the phone keyboard.
function head(t, name, sub, id) {
  const [a, b] = t.closest('.ex').querySelectorAll('.ex-head span');
  a.textContent = name; b.textContent = sub;
  const n = id && document.querySelector(`[data-hl="${id}"]`);
  if (n) n.textContent = name;
}

document.addEventListener('change', e => {
  const t = e.target, w = W(editW);
  if (t.dataset.wf) {
    w[t.dataset.wf] = t.value.trim() || 'Workout';
    save(); rebuild();
  }
  else if (t.dataset.lf) {
    const it = data.library.find(x => x.id === libEdit), f = t.dataset.lf, n = Math.max(1, Math.min(50, parseInt(t.value) || 1));
    if (f === 'name') {
      it.name = t.value.trim() || 'Exercise';
      for (const w of data.workouts) for (const e of w.exercises) if (e.lib === it.id) e.name = it.name;
    }
    if (f === 'sets') it.sets = Math.min(n, 10);
    if (f === 'reps') it.reps = [n, n];
    save(); rebuild(); head(t, it.name, `${it.sets} × ${repText(it.reps)} · ${libSub(it)}`);
  }
  else if (t.id === 'hist') { hist = t.value; render(); }
  else if (t.id === 'import') importData(t.files[0]);
  else if (t.id === 'beepon') { data.beep = t.checked; save(); }
  else if (t.id === 'hapticson') { data.haptics = t.checked; save(); haptic(); }
});

document.addEventListener('mousedown', e => { if (e.target.closest('.unitbox button')) e.preventDefault(); }); // tapping kg/lbs keeps the keyboard up
document.addEventListener('visibilitychange', () => { if (end && document.visibilityState === 'visible') { wake(); paintTimer(); } });
navigator.serviceWorker?.register('sw.js');
render();
