'use strict';
const $ = (s) => document.querySelector(s);
let content = null, defaults = null, dirty = false, saving = false;
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

function markDirty() { dirty = true; $('#save').disabled = false; setStatus('มีการแก้ไขที่ยังไม่ได้บันทึก'); }
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

function mediaField(path, label, kind) {
  const holder = h('div', { class: 'media' });
  const bar = h('div', { class: 'bar', hidden: '' }, h('i'));
  const msg = h('div', { class: 'err' });
  const draw = () => {
    holder.replaceChildren();
    const raw = getPath(path);
    const src = raw.startsWith('/media/') ? `/admin/preview/${raw.slice(7)}` : raw;   // new uploads exist only in public/media until published
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
      setPath(path, data.path); markDirty(); draw();
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

function render() {
  const open = [...document.querySelectorAll('details')].map((d) => d.open);
  const root = $('#sections'); root.replaceChildren();
  root.append(
    section('ภาพหลัก (Hero)', 'hero', [
      mediaField(['hero', 'image'], 'รูปหลัก', 'image'),
      mediaField(['hero', 'poster'], 'รูปปกวิดีโอ', 'image'),
      mediaField(['hero', 'video'], 'วิดีโอตัวอย่าง', 'video'),
    ]),
    section('ฟีเจอร์ (10)', 'features', content.features.map((_, i) => h('div', { class: 'item' },
      h('strong', {}, `ฟีเจอร์ที่ ${i + 1}`),
      textField(['features', i, 'title'], 'หัวข้อ'),
      textField(['features', i, 'desc'], 'คำอธิบาย', { multiline: true }),
      mediaField(['features', i, 'video'], 'วิดีโอ (ป๊อปอัป)', 'video')))),
    section('ผลงาน (6)', 'clips', content.clips.map((_, i) => h('div', { class: 'item' },
      h('strong', {}, `คลิปที่ ${i + 1}`),
      textField(['clips', i, 'title'], 'ชื่อคลิป'),
      textField(['clips', i, 'subtitle'], 'คำบรรยายใต้ชื่อ'),
      textField(['clips', i, 'views'], 'ยอดวิว (เช่น 840,000)'),
      mediaField(['clips', i, 'cover'], 'รูปปก', 'image')))),
    section('รีวิว (3)', 'reviews', content.reviews.map((_, i) => h('div', { class: 'item' },
      h('strong', {}, `รีวิวที่ ${i + 1}`),
      textField(['reviews', i, 'headline'], 'หัวข้อ (ขึ้นบรรทัดใหม่ได้)', { multiline: true }),
      textField(['reviews', i, 'name'], 'ชื่อผู้รีวิว'),
      textField(['reviews', i, 'body'], 'ข้อความ', { multiline: true }),
      textField(['reviews', i, 'rating'], 'ดาว (1-5)', { number: true }),
      mediaField(['reviews', i, 'image'], 'ภาพแชท', 'image')))),
  );
  document.querySelectorAll('details').forEach((d, i) => { d.open = open[i] ?? i === 0; });
}

async function load() {
  const data = await api('GET', '/api/admin/content');
  content = data.content; defaults = data.defaults; dirty = false;
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
  try {
    await api('PUT', '/api/admin/content', content);
    dirty = false; await pollBuild();
  } catch (err) {
    setStatus(err.message, 'bad'); $('#save').disabled = false;
    for (const e of err.errors || []) {
      const el = document.querySelector(`[data-field="${CSS.escape(e.field)}"]`);
      if (el) { el.classList.add('invalid'); el.title = e.message; }
    }
    if (err.errors?.length) setStatus(`${err.message}: ${err.errors[0].field} ${err.errors[0].message}`, 'bad');
  } finally { saving = false; }
});

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

load().catch((e) => setStatus(e.message, 'bad'));
