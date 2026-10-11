// Thai address autofill. The dataset (/thai-address.json, ~60 KB gzipped) loads on first use.
(function () {
  var search = document.getElementById('addrSearch');
  var list = document.getElementById('addrResults');
  var selP = document.getElementById('addrProvince');
  var selD = document.getElementById('addrDistrict');
  var selS = document.getElementById('addrSub');
  var selZ = document.getElementById('addrZip');
  if (!search || !selP) return;

  var db = null, loading = null;
  function load() {
    if (db) return Promise.resolve(db);
    if (!loading) {
      loading = fetch('/thai-address.json').then(function (r) { return r.json(); }).then(function (j) {
        db = j; fillProvinces(); return db;
      }).catch(function () { loading = null; });
    }
    return loading;
  }

  function opts(sel, placeholder, items, value) {
    sel.innerHTML = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = placeholder; sel.appendChild(o);
    items.forEach(function (it) { var e = document.createElement('option'); e.value = it[0]; e.textContent = it[1]; sel.appendChild(e); });
    if (value !== undefined) sel.value = value;
  }
  function fillProvinces() {
    opts(selP, 'เลือกจังหวัด', db.p.map(function (n, i) { return [String(i), n]; }));
  }
  function fillDistricts(pi, di) {
    var items = [];
    db.a.forEach(function (a, i) { if (String(a[0]) === String(pi)) items.push([String(i), a[1]]); });
    opts(selD, 'เลือกอำเภอ / เขต', items, di);
  }
  // The dataset has one row per (sub-district, zip); list each sub-district name once.
  function firstRow(ai, name) {
    for (var i = 0; i < db.d.length; i++) if (db.d[i][1] === ai && db.d[i][0] === name) return i;
    return -1;
  }
  function fillSubs(ai, si) {
    var items = [], seen = {};
    db.d.forEach(function (d, i) {
      if (String(d[1]) === String(ai) && !seen[d[0]]) { seen[d[0]] = 1; items.push([String(i), d[0]]); }
    });
    opts(selS, 'เลือกตำบล / แขวง', items, si);
  }
  // all zips of the sub-district at row index `i`; pick one if `zip` is given, or the only one
  function fillZip(i, zip) {
    var zips = [];
    if (i !== null && i !== undefined && i !== '' && db.d[i]) {
      var d = db.d[i];
      db.d.forEach(function (r) { if (r[1] === d[1] && r[0] === d[0] && zips.indexOf(r[2]) === -1) zips.push(r[2]); });
    }
    opts(selZ, 'เลือกรหัสไปรษณีย์', zips.map(function (z) { return [z, z]; }), zip || (zips.length === 1 ? zips[0] : ''));
  }

  function label(i) {
    var d = db.d[i], a = db.a[d[1]];
    return d[0] + ' · ' + a[1] + ' · ' + db.p[a[0]] + ' · ' + d[2];
  }
  function pick(i) {
    var d = db.d[i], a = db.a[d[1]];
    selP.value = String(a[0]);
    var first = firstRow(d[1], d[0]);
    fillDistricts(a[0], String(d[1]));
    fillSubs(d[1], String(first));
    fillZip(first, d[2]);
    search.value = d[0] + ' ' + a[1] + ' ' + db.p[a[0]] + ' ' + d[2];
    hide();
  }
  function hide() { list.classList.add('hidden'); list.innerHTML = ''; }
  function show(ids) {
    list.innerHTML = '';
    if (!ids.length) {
      var n = document.createElement('li'); n.className = 'px-4 py-3 text-gray-500'; n.textContent = 'ไม่พบข้อมูล ลองพิมพ์ใหม่หรือเลือกจังหวัดเอง';
      list.appendChild(n);
    }
    ids.forEach(function (i) {
      var li = document.createElement('li');
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'w-full text-left px-4 py-3 hover:bg-amber-50 border-b border-gray-100 last:border-0';
      b.textContent = label(i);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); pick(i); });
      li.appendChild(b); list.appendChild(li);
    });
    list.classList.remove('hidden');
  }

  function query() {
    var q = search.value.trim();
    if (!db || q.length < 1) return hide();
    var ids = [], i, d;
    if (/^\d+$/.test(q)) {
      for (i = 0; i < db.d.length && ids.length < 40; i++) if (db.d[i][2].indexOf(q) === 0) ids.push(i);
      if (q.length === 5 && ids.length === 1) return pick(ids[0]);   // one sub-district only: fill directly
    } else {
      for (i = 0; i < db.d.length && ids.length < 40; i++) {
        d = db.d[i];
        if (d[0].indexOf(q) !== -1 || db.a[d[1]][1].indexOf(q) !== -1) ids.push(i);
      }
    }
    show(ids);
  }

  search.addEventListener('focus', function () { load().then(query); });
  search.addEventListener('input', function () { load().then(query); });
  search.addEventListener('blur', function () { setTimeout(hide, 150); });
  search.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });

  // manual selection path (inside "เลือกจังหวัดและอำเภอเอง")
  [selP, selD, selS].forEach(function (s) { s.addEventListener('focus', load); });
  selP.addEventListener('change', function () { fillDistricts(selP.value); fillSubs(-1); fillZip(null); });
  selD.addEventListener('change', function () { fillSubs(selD.value); fillZip(null); });
  selS.addEventListener('change', function () { fillZip(selS.value); });
})();
