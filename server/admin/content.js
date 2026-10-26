'use strict';
const $ = (s) => document.querySelector(s);
let content = null, defaults = null, saving = false;
let pages = null, pv = {};                       // static pages: slots from the API, and the current value of every slot
let tab = 'kcut';
const dirty = { kcut: false, home: false, books: false };
const VIEW = { kcut: '/kcut/', home: '/', books: '/books/' };
// Auth is the browser's HTTP Basic prompt (same admin password as /admin); a 401 just reloads to re-prompt.

// Tiny DOM helper; everything user-provided goes through textContent/value (no innerHTML).
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== undefined) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'X-Requested-With': 'kcut-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('กรุณาเข้าสู่ระบบ'); }
  if (!res.ok) { const e = new Error(data.error || 'เกิดข้อผิดพลาด'); e.errors = data.errors; throw e; }
  return data;
}

function markDirty() { dirty[tab] = true; $('#save').disabled = false; setStatus('มีการแก้ไขที่ยังไม่ได้บันทึก'); }
function setStatus(text, cls) { const s = $('#status'); s.textContent = text; s.className = cls || ''; }

function getPath(path) { return path.reduce((o, k) => o[k], content); }
function setPath(path, v) { getPath(path.slice(0, -1))[path[path.length - 1]] = v; }

function textField(path, label, { multiline = false, number = false } = {}) {
  const val = getPath(path);
  const input = multiline ? h('textarea') : h('input', { type: number ? 'number' : 'text', ...(number ? { min: 1, max: 5 } : {}) });
  input.value = val;
  input.dataset.field = path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '');
  input.addEventListener('input', () => { setPath(path, number ? Number(input.value) : input.value); input.classList.remove('invalid'); markDirty(); });
  return h('label', {}, label, input);
}

// acc = { get, set, src }: where the value lives and how to preview it
function pathAcc(path) {
  return { get: () => getPath(path), set: (v) => setPath(path, v), src: (raw) => (raw.startsWith('/media/') ? `/admin/preview/${raw.slice(7)}` : `/kcut${raw}`) };   // defaults live under /kcut
}
function mediaField(acc, label, kind) {
  const holder = h('div', { class: 'media' });
  const bar = h('div', { class: 'bar', hidden: '' }, h('i'));
  const msg = h('div', { class: 'err' });
  const draw = () => {
    holder.replaceChildren();
    const src = acc.src(acc.get());   // new uploads exist only in public/media until published
    holder.append(kind === 'image' ? h('img', { src, alt: '' }) : h('video', { src, muted: '', preload: 'metadata', controls: '' }));
    const file = h('input', { type: 'file', accept: kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/quicktime', hidden: '' });
    const btn = h('button', { type: 'button', onclick: () => file.click() }, kind === 'image' ? 'เปลี่ยนรูป' : 'เปลี่ยนวิดีโอ');
    file.addEventListener('change', () => file.files[0] && upload(file.files[0]));
    holder.append(btn, file, bar, msg);
  };
  const upload = (f) => {
    msg.textContent = ''; bar.hidden = false; bar.firstChild.style.width = '0';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/upload?kind=${kind}`);
    xhr.setRequestHeader('X-Requested-With', 'kcut-admin');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.firstChild.style.width = `${(e.loaded / e.total) * 100}%`; };
    xhr.onload = () => {
      bar.hidden = true;
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) return location.reload();
      if (xhr.status !== 200) { msg.textContent = data.error || 'อัปโหลดไม่สำเร็จ'; return; }
      acc.set(data.path); markDirty(); draw();
    };
    xhr.onerror = () => { bar.hidden = true; msg.textContent = 'เชื่อมต่อไม่ได้ กรุณาลองใหม่'; };
    xhr.send(f);
  };
  draw();
  return h('div', {}, h('div', { style: 'font-size:.85rem;color:#6b7280;margin-bottom:4px' }, label), holder);
}

function section(title, key, items) {
  const reset = h('button', { type: 'button', onclick: (e) => {
    e.preventDefault();
    if (!confirm(`คืนค่าเดิมของส่วน "${title}" ทั้งหมด?`)) return;
    content[key] = structuredClone(defaults[key]); markDirty(); render();
  } }, 'คืนค่าเดิม');
  return h('details', {}, h('summary', {}, h('h2', {}, title), reset), h('div', { class: 'body' }, items));
}


// ---- static pages (home, books): one field per slot, grouped like the page ----
function slotField(page, slot) {
  if (slot.kind === 'image') {
    return mediaField({
      get: () => pv[page][slot.key],
      set: (v) => { pv[page][slot.key] = v; },
      src: (raw) => (raw.startsWith('/media/') ? `/admin/preview/${raw.slice(7)}` : raw),
    }, slot.label, 'image');
  }
  const input = slot.default.length > 60 || slot.default.includes('\n') ? h('textarea') : h('input', { type: 'text' });
  input.value = pv[page][slot.key];
  input.dataset.field = slot.key;
  input.addEventListener('input', () => { pv[page][slot.key] = input.value; input.classList.remove('invalid'); markDirty(); });
  return h('label', {}, slot.kind === 'text' && slot.default.includes('\n') ? 'ข้อความ (ขึ้นบรรทัดใหม่ได้)' : 'ข้อความ', input);
}

function pageSections(page) {
  const { slots } = pages[page];
  const groups = [];
  for (const s of slots) {
    let g = groups.find((x) => x.id === s.group);
    if (!g) groups.push(g = { id: s.group, title: s.groupTitle, slots: [] });
    g.slots.push(s);
  }
  return groups.map((g) => {
    const reset = h('button', { type: 'button', onclick: (e) => {
      e.preventDefault();
      if (!confirm(`คืนค่าเดิมของส่วน "${g.title}" ทั้งหมด?`)) return;
      for (const s of g.slots) pv[page][s.key] = s.default;
      markDirty(); render();
    } }, 'คืนค่าเดิม');
    return h('details', {}, h('summary', {}, h('h2', {}, g.title), reset),
      h('div', { class: 'body' }, g.slots.map((s) => h('div', { class: 'item' }, slotField(page, s)))));
  });
}

function render() {
  const open = [...document.querySelectorAll('details')].map((d) => d.open);
  const root = $('#sections'); root.replaceChildren();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#view').href = VIEW[tab];
  if (tab !== 'kcut') {
    root.append(h('p', { class: 'hint' }, 'ใช้ *ข้อความ* เพื่อทำคำสำคัญเป็นสีเด่นในหัวข้อ ราคา/แพ็กเกจแก้ไม่ได้จากหน้านี้ (ใช้ราคาจากระบบ) บันทึกแล้วขึ้นหน้าเว็บทันที'), ...pageSections(tab));
    return void document.querySelectorAll('details').forEach((d, i) => { d.open = open[i] ?? i === 0; });
  }
  root.append(
    section('ภาพหลัก (Hero)', 'hero', [
      mediaField(pathAcc(['hero', 'image']), 'รูปหลัก', 'image'),
      mediaField(pathAcc(['hero', 'poster']), 'รูปปกวิดีโอ', 'image'),
      mediaField(pathAcc(['hero', 'video']), 'วิดีโอตัวอย่าง', 'video'),
    ]),
    section('ฟีเจอร์ (10)', 'features', content.features.map((_, i) => h('div', { class: 'item' },
      h('strong', {}, `ฟีเจอร์ที่ ${i + 1}`),
      textField(['features', i, 'title'], 'หัวข้อ'),
      textField(['features', i, 'desc'], 'คำอธิบาย', { multiline: true }),
      mediaField(pathAcc(['features', i, 'video']), 'วิดีโอ (ป๊อปอัป)', 'video')))),
    section('ผลงาน (6)', 'clips', content.clips.map((_, i) => h('div', { class: 'item' },
      h('strong', {}, `คลิปที่ ${i + 1}`),
      textField(['clips', i, 'title'], 'ชื่อคลิป'),
      textField(['clips', i, 'subtitle'], 'คำบรรยายใต้ชื่อ'),
      textField(['clips', i, 'views'], 'ยอดวิว (เช่น 840,000)'),
      mediaField(pathAcc(['clips', i, 'cover']), 'รูปปก', 'image')))),
    section('รีวิว (3)', 'reviews', content.reviews.map((_, i) => h('div', { class: 'item' },
      h('strong', {}, `รีวิวที่ ${i + 1}`),
      textField(['reviews', i, 'headline'], 'หัวข้อ (ขึ้นบรรทัดใหม่ได้)', { multiline: true }),
      textField(['reviews', i, 'name'], 'ชื่อผู้รีวิว'),
      textField(['reviews', i, 'body'], 'ข้อความ', { multiline: true }),
      textField(['reviews', i, 'rating'], 'ดาว (1-5)', { number: true }),
      mediaField(pathAcc(['reviews', i, 'image']), 'ภาพแชท', 'image')))),
  );
  document.querySelectorAll('details').forEach((d, i) => { d.open = open[i] ?? i === 0; });
}

async function load() {
  const data = await api('GET', '/api/admin/content');
  content = data.content; defaults = data.defaults;
  pages = (await api('GET', '/api/admin/pages')).pages;
  for (const [name, p] of Object.entries(pages)) pv[name] = Object.fromEntries(p.slots.map((s) => [s.key, p.values[s.key] ?? s.default]));
  Object.keys(dirty).forEach((k) => { dirty[k] = false; });
  $('#app').hidden = false; $('#bar').hidden = false;
  $('#save').disabled = true; setStatus('');
  render();
}

async function pollBuild() {
  setStatus('กำลังเผยแพร่…');
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const b = await api('GET', '/api/admin/build');
    if (b.state === 'ok') return setStatus('เผยแพร่แล้ว', 'ok');
    if (b.state === 'failed') return setStatus(`เผยแพร่ไม่สำเร็จ: ${b.message}`, 'bad');
  }
}

$('#save').addEventListener('click', async () => {
  if (saving) return; saving = true; $('#save').disabled = true;
  document.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  const saved = tab;
  try {
    if (saved === 'kcut') { await api('PUT', '/api/admin/content', content); dirty.kcut = false; await pollBuild(); }
    else {                                           // static pages are rendered on the server at once, no build
      await api('PUT', `/api/admin/pages/${saved}`, { values: pv[saved] });
      dirty[saved] = false; setStatus('เผยแพร่แล้ว', 'ok');
    }
  } catch (err) {
    setStatus(err.message, 'bad'); $('#save').disabled = false;
    for (const e of err.errors || []) {
      const el = document.querySelector(`[data-field="${CSS.escape(e.field)}"]`);
      if (el) { el.classList.add('invalid'); el.title = e.message; }
    }
    if (err.errors?.length) setStatus(`${err.message}: ${err.errors[0].field} ${err.errors[0].message}`, 'bad');
  } finally { saving = false; }
});

$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.tab;
  if (!t || t === tab || saving) return;
  tab = t; $('#save').disabled = !dirty[tab];
  setStatus(dirty[tab] ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : '');
  render();
});

window.addEventListener('beforeunload', (e) => { if (Object.values(dirty).some(Boolean)) { e.preventDefault(); e.returnValue = ''; } });

load().catch((e) => setStatus(e.message, 'bad'));
