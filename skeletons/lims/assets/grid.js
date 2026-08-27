/* DataRegion —— 照 LabKey 的网格复刻：列头菜单、筛选对话框、筛选芯片、
   排序、行选择、翻页、导出面板。结构与类名见 reference/capture.md。 */
(function (g) {
  'use strict';

  var OPS = [
    { v: 'eq',        t: 'Equals',              val: true  },
    { v: 'neq',       t: 'Does Not Equal',      val: true  },
    { v: 'isblank',   t: 'Is Blank',            val: false },
    { v: 'isnonblank',t: 'Is Not Blank',        val: false },
    { v: 'gt',        t: 'Is Greater Than',     val: true  },
    { v: 'gte',       t: 'Is Greater Than or Equal To', val: true },
    { v: 'lt',        t: 'Is Less Than',        val: true  },
    { v: 'lte',       t: 'Is Less Than or Equal To', val: true },
    { v: 'contains',  t: 'Contains',            val: true  },
    { v: 'doesnotcontain', t: 'Does Not Contain', val: true },
    { v: 'startswith', t: 'Starts With',        val: true  }
  ];
  var OPLABEL = {}; OPS.forEach(function (o) { OPLABEL[o.v] = o.t; });
  var OPSYMBOL = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
                   contains: 'CONTAINS', doesnotcontain: 'DOES NOT CONTAIN',
                   startswith: 'STARTS WITH', isblank: 'IS BLANK', isnonblank: 'IS NOT BLANK' };

  var SVG = function (d, extra) {
    return '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.3">' + d + '</svg>';
  };
  var ICON = {
    grid:  SVG('<rect x="1.5" y="2.5" width="13" height="11"/><path d="M1.5 6h13M1.5 9.5h13M6 2.5v11"/>'),
    chart: SVG('<path d="M2 13.5V2.5M2 13.5h12"/><path d="M4.5 11l3-4 2.5 2.5 3.5-5"/>'),
    down:  SVG('<path d="M8 2v8M4.5 7l3.5 3.5L11.5 7M2.5 13.5h11"/>'),
    print: SVG('<path d="M4.5 6V2.5h7V6"/><rect x="2.5" y="6" width="11" height="5"/><rect x="4.5" y="9.5" width="7" height="4"/>')
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function cmp(a, b) {
    if (a == null) a = ''; if (b == null) b = '';
    var na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na - nb;
    return String(a).localeCompare(String(b));
  }

  function test(val, op, want) {
    var s = val == null ? '' : String(val);
    var n = parseFloat(val), w = parseFloat(want);
    switch (op) {
      case 'isblank': return s === '';
      case 'isnonblank': return s !== '';
      case 'eq': return (!isNaN(n) && !isNaN(w)) ? n === w : s === want;
      case 'neq': return (!isNaN(n) && !isNaN(w)) ? n !== w : s !== want;
      case 'gt': return !isNaN(n) && !isNaN(w) ? n > w : s > want;
      case 'gte': return !isNaN(n) && !isNaN(w) ? n >= w : s >= want;
      case 'lt': return !isNaN(n) && !isNaN(w) ? n < w : s < want;
      case 'lte': return !isNaN(n) && !isNaN(w) ? n <= w : s <= want;
      case 'contains': return s.indexOf(want) >= 0;
      case 'doesnotcontain': return s.indexOf(want) < 0;
      case 'startswith': return s.lastIndexOf(want, 0) === 0;
    }
    return true;
  }

  /* opts: {el, name, columns:[{name,caption,align,render,cls}], rows,
            pageSize, viewName, lockedFilters:[{col,op,value}],
            rowClass(row), onExport} */
  function DataRegion(opts) {
    this.o = opts;
    this.el = typeof opts.el === 'string' ? document.querySelector(opts.el) : opts.el;
    this.sort = null;                       // {col, dir:'asc'|'desc'}
    this.filters = (opts.lockedFilters || []).map(function (f) {
      return { col: f.col, op: f.op, value: f.value, locked: true };
    }).concat((opts.initialFilters || []).map(function (f) {
      return { col: f.col, op: f.op, value: f.value };
    }));
    this.page = 1;
    this.pageSize = opts.pageSize || 100;
    this.sel = {};
    this.exportOpen = false;
    this.exportTab = 'Excel';
    this.render();
  }

  DataRegion.prototype.colByName = function (n) {
    for (var i = 0; i < this.o.columns.length; i++) if (this.o.columns[i].name === n) return this.o.columns[i];
    return { name: n, caption: n };
  };

  DataRegion.prototype.view = function () {
    var self = this;
    var rows = this.o.rows.filter(function (r) {
      return self.filters.every(function (f) { return test(r[f.col], f.op, f.value); });
    });
    if (this.sort) {
      var c = this.sort.col, d = this.sort.dir === 'desc' ? -1 : 1;
      rows = rows.slice().sort(function (a, b) { return cmp(a[c], b[c]) * d; });
    }
    return rows;
  };

  DataRegion.prototype.render = function () {
    var self = this, cols = this.o.columns;
    var all = this.view();
    var total = all.length;
    var pages = Math.max(1, Math.ceil(total / this.pageSize));
    if (this.page > pages) this.page = pages;
    var from = (this.page - 1) * this.pageSize;
    var rows = all.slice(from, from + this.pageSize);

    var h = '<div class="lk-region" data-region="' + esc(this.o.name) + '">';

    /* 工具条 */
    h += '<div class="labkey-button-bar">' +
      '<button class="labkey-button icon" title="Grid Views">' + ICON.grid + '<span class="labkey-down-arrow"></span></button>' +
      '<button class="labkey-button icon" title="Charts / Reports">' + ICON.chart + '<span class="labkey-down-arrow"></span></button>' +
      '<button class="labkey-button icon js-export" title="Export">' + ICON.down + '<span class="labkey-down-arrow"></span></button>' +
      (this.o.viewName ? '<span class="lk-viewchip">' + esc(this.o.viewName) + '</span>' : '') +
      '<button class="labkey-button icon" title="Print">' + ICON.print + '</button>' +
      '<span class="labkey-pagination">' +
        '<span class="labkey-paginationText">' +
          (total ? (from + 1) + ' - ' + Math.min(from + this.pageSize, total) : 0) + ' of ' + total +
        '</span>' +
        '<button class="pg js-prev"' + (this.page === 1 ? ' disabled' : '') + '>&lsaquo;</button>' +
        '<button class="pg js-next"' + (this.page >= pages ? ' disabled' : '') + '>&rsaquo;</button>' +
      '</span></div>';

    /* 导出面板 */
    if (this.exportOpen) h += this.exportHTML();

    /* 筛选芯片 */
    if (this.filters.length) {
      h += '<div class="lk-filter-row">';
      this.filters.forEach(function (f, i) {
        var c = self.colByName(f.col);
        var txt = c.caption + ' ' + (OPSYMBOL[f.op] || f.op) + (f.value !== undefined && f.value !== '' ? ' ' + f.value : '');
        h += '<span class="lk-chip">' +
          (f.locked ? '' : '<span class="x js-unfilter" data-i="' + i + '">✕</span>') +
          '<span class="f">▼</span>' + esc(txt) + '</span>';
      });
      h += '</div>';
    }

    /* 表格 */
    h += '<table class="table-bordered table-condensed labkey-data-region"><thead>' +
      '<tr class="labkey-col-header-row">' +
      '<td class="labkey-column-header labkey-selectors"><input type="checkbox" class="js-selall"></td>';
    cols.forEach(function (c) {
      var f = self.filters.some(function (x) { return x.col === c.name; });
      var s = self.sort && self.sort.col === c.name ? (self.sort.dir === 'asc' ? '▲' : '▼') : '';
      h += '<td class="labkey-column-header" data-col="' + esc(c.name) + '"><div class="hdr">' +
        '<span>' + esc(c.caption) + '</span>' +
        (s ? '<span class="sortmark">' + s + '</span>' : '') +
        '<span class="labkey-col-header-filter js-colmenu' + (f ? ' on' : '') + '" data-col="' +
        esc(c.name) + '">▾</span></div></td>';
    });
    h += '</tr></thead><tbody>';

    if (!rows.length) {
      h += '<tr><td class="lk-empty" colspan="' + (cols.length + 1) + '">No data to show.</td></tr>';
    }
    rows.forEach(function (r, i) {
      var cls = 'labkey-' + (i % 2 ? 'alternate-row' : 'row');
      if (self.o.rowClass) { var extra = self.o.rowClass(r); if (extra) cls += ' ' + extra; }
      var key = self.o.rowKey ? r[self.o.rowKey] : (from + i);
      h += '<tr class="' + cls + '" data-key="' + esc(key) + '">' +
        '<td class="labkey-selectors"><input type="checkbox" class="js-sel" data-key="' + esc(key) + '"' +
        (self.sel[key] ? ' checked' : '') + '></td>';
      cols.forEach(function (c) {
        var v = c.render ? c.render(r) : esc(r[c.name]);
        h += '<td class="' + (c.align === 'right' ? 'num' : '') + (c.cls ? ' ' + c.cls : '') + '">' + v + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';

    this.el.innerHTML = h;
    this.wire();
  };

  DataRegion.prototype.exportHTML = function () {
    var nSel = Object.keys(this.sel).filter(function (k) { return this.sel[k]; }, this).length;
    var t = this.exportTab;
    var body;
    if (t === 'Excel') {
      body =
        '<div class="opt"><input type="radio" name="xl" id="xl1" checked><label for="xl1">Excel Workbook (.xlsx)</label>' +
          '<small>Maximum 1,048,576 rows and 16,384 columns.</small></div>' +
        '<div class="opt"><input type="radio" name="xl" id="xl2"><label for="xl2">Excel Old Binary Workbook (.xls)</label>' +
          '<small>Maximum 65,536 rows and 256 columns.</small></div>' +
        '<div class="opt"><input type="radio" name="xl" id="xl3"><label for="xl3">Refreshable Web Query (.iqy)</label></div>';
    } else if (t === 'Text') {
      body =
        '<div class="hdrsel">Separator: <select class="js-sep">' +
          '<option value="\t">Tab</option><option value=",">Comma</option>' +
          '<option value=":">Colon</option><option value=";">Semicolon</option></select>' +
        ' Quote: <select class="js-quote"><option value="&quot;">Double (&quot;)</option>' +
          '<option value="\'">Single (\')</option></select></div>';
    } else {
      body = '<div class="opt"><small>生成调用查询 API 的代码片段。</small></div>';
    }
    return '<div class="lk-export">' +
      '<div class="tabs">' + ['Excel', 'Text', 'Script'].map(function (n) {
        return '<button class="js-xtab' + (n === t ? ' on' : '') + '" data-t="' + n + '">' + n + '</button>';
      }).join('') + '</div>' + body +
      '<div class="hdrsel">Column headers: <select class="js-hdr">' +
        '<option value="none">None</option><option value="caption" selected>Caption</option>' +
        '<option value="fieldkey">Field Key</option></select></div>' +
      '<div class="sel-row' + (nSel ? '' : ' disabled') + '">' +
        '<input type="checkbox" class="js-xsel"' + (nSel ? '' : ' disabled') + '>' +
        '<span>Export selected rows' + (nSel ? ' (' + nSel + ')' : '') + '</span></div>' +
      '<button class="btn-export js-dox">Export</button></div>';
  };

  DataRegion.prototype.wire = function () {
    var self = this, el = this.el;
    var q = function (s) { return el.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(el.querySelectorAll(s)); };

    q('.js-export').addEventListener('click', function (e) {
      e.stopPropagation(); self.exportOpen = !self.exportOpen; self.render();
    });
    var prev = q('.js-prev'), next = q('.js-next');
    if (prev) prev.addEventListener('click', function () { if (self.page > 1) { self.page--; self.render(); } });
    if (next) next.addEventListener('click', function () { self.page++; self.render(); });

    qa('.js-unfilter').forEach(function (x) {
      x.addEventListener('click', function () {
        self.filters.splice(parseInt(x.getAttribute('data-i'), 10), 1); self.page = 1; self.render();
      });
    });
    qa('.js-colmenu').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); self.openMenu(b, b.getAttribute('data-col')); });
    });
    var selall = q('.js-selall');
    if (selall) selall.addEventListener('change', function () {
      qa('.js-sel').forEach(function (cb) { cb.checked = selall.checked; self.sel[cb.getAttribute('data-key')] = selall.checked; });
      if (self.exportOpen) self.render();
    });
    qa('.js-sel').forEach(function (cb) {
      cb.addEventListener('change', function () {
        self.sel[cb.getAttribute('data-key')] = cb.checked;
        if (self.exportOpen) self.render();
      });
    });
    qa('.js-xtab').forEach(function (b) {
      b.addEventListener('click', function () { self.exportTab = b.getAttribute('data-t'); self.render(); });
    });
    var dox = q('.js-dox');
    if (dox) dox.addEventListener('click', function () { self.doExport(); });
  };

  DataRegion.prototype.openMenu = function (anchor, col) {
    var self = this;
    closeMenus();
    var hasSort = this.sort && this.sort.col === col;
    var hasFilter = this.filters.some(function (f) { return f.col === col && !f.locked; });
    var m = document.createElement('div');
    m.className = 'lk-menu';
    m.innerHTML =
      '<div class="item" data-a="asc"><span class="ic">↑</span>Sort Ascending</div>' +
      '<div class="item" data-a="desc"><span class="ic">↓</span>Sort Descending</div>' +
      '<div class="item' + (hasSort ? '' : ' disabled') + '" data-a="clearsort"><span class="ic"></span>Clear Sort</div>' +
      '<div class="sep"></div>' +
      '<div class="item" data-a="filter"><span class="ic">▼</span>Filter...</div>' +
      '<div class="item' + (hasFilter ? '' : ' disabled') + '" data-a="clearfilter"><span class="ic"></span>Clear Filter</div>' +
      '<div class="sep"></div>' +
      '<div class="item" data-a="remove"><span class="ic"></span>Remove Column</div>' +
      '<div class="item disabled"><span class="ic">▤</span>Summary Statistics...</div>' +
      '<div class="item disabled"><span class="ic">▮</span>Bar Chart</div>' +
      '<div class="item disabled"><span class="ic">◕</span>Pie Chart</div>' +
      '<div class="item disabled"><span class="ic">◪</span>Quick Chart</div>';
    var r = anchor.getBoundingClientRect();
    m.style.left = (r.left + window.scrollX) + 'px';
    m.style.top = (r.bottom + window.scrollY + 3) + 'px';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      var it = e.target.closest('.item');
      if (!it || it.classList.contains('disabled')) return;
      var a = it.getAttribute('data-a');
      closeMenus();
      if (a === 'asc') self.sort = { col: col, dir: 'asc' };
      else if (a === 'desc') self.sort = { col: col, dir: 'desc' };
      else if (a === 'clearsort') self.sort = null;
      else if (a === 'clearfilter') self.filters = self.filters.filter(function (f) { return f.col !== col || f.locked; });
      else if (a === 'remove') self.o.columns = self.o.columns.filter(function (c) { return c.name !== col; });
      else if (a === 'filter') { self.openFilter(col); return; }
      self.page = 1; self.render();
    });
  };

  DataRegion.prototype.openFilter = function (col) {
    var self = this, c = this.colByName(col);
    var mask = document.createElement('div');
    mask.className = 'lk-mask';
    mask.innerHTML =
      '<div class="lk-dialog"><h3>Filter Column<span class="x js-x">✕</span></h3>' +
      '<div class="body"><label>Filter Type for <b>' + esc(c.caption) + '</b></label>' +
      '<select class="js-op">' + OPS.map(function (o) {
        return '<option value="' + o.v + '">' + o.t + '</option>'; }).join('') + '</select>' +
      '<label>Value</label><input type="text" class="js-val"></div>' +
      '<div class="foot"><button class="lk-btn js-x">CANCEL</button>' +
      '<button class="lk-btn primary js-ok">OK</button></div></div>';
    document.body.appendChild(mask);
    var op = mask.querySelector('.js-op'), val = mask.querySelector('.js-val');
    var sync = function () {
      var need = OPS.filter(function (o) { return o.v === op.value; })[0];
      val.disabled = !(need && need.val);
    };
    op.addEventListener('change', sync); sync();
    val.focus();
    var close = function () { mask.remove(); };
    Array.prototype.forEach.call(mask.querySelectorAll('.js-x'), function (b) { b.addEventListener('click', close); });
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    mask.querySelector('.js-ok').addEventListener('click', function () {
      self.filters = self.filters.filter(function (f) { return f.col !== col || f.locked; });
      self.filters.push({ col: col, op: op.value, value: val.value });
      self.page = 1; close(); self.render();
    });
    val.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') mask.querySelector('.js-ok').click();
    });
  };

  DataRegion.prototype.doExport = function () {
    var self = this;
    var el = this.el;
    var hdrMode = (el.querySelector('.js-hdr') || {}).value || 'caption';
    var onlySel = !!(el.querySelector('.js-xsel') || {}).checked;
    var sep = (el.querySelector('.js-sep') || {}).value;
    var quote = (el.querySelector('.js-quote') || {}).value || '"';
    var isText = this.exportTab === 'Text';
    if (!isText) { sep = ','; quote = '"'; }              /* Excel 页导出为 .csv，见 skeleton.json 的偏离说明 */
    if (sep === undefined) sep = '\t';

    var cols = this.o.columns;
    var rows = this.view();
    if (onlySel) rows = rows.filter(function (r) {
      return self.sel[self.o.rowKey ? r[self.o.rowKey] : ''];
    });
    var enc = function (v) {
      var s = v == null ? '' : String(v);
      return (s.indexOf(sep) >= 0 || s.indexOf(quote) >= 0 || /[\r\n]/.test(s))
        ? quote + s.split(quote).join(quote + quote) + quote : s;
    };
    var out = [];
    if (hdrMode !== 'none') {
      out.push(cols.map(function (c) {
        return enc(hdrMode === 'caption' ? c.caption : c.name); }).join(sep));
    }
    rows.forEach(function (r) { out.push(cols.map(function (c) { return enc(r[c.name]); }).join(sep)); });
    var ext = isText ? (sep === ',' ? 'csv' : 'tsv') : 'csv';
    DataRegion.saveFile((this.o.name || 'export') + '.' + ext, '﻿' + out.join('\r\n'), this);
  };

  /* 文件交付的接缝：本地/env 里就是浏览器下载；
     发布到 artifact 的观看副本会覆盖它走平台的下载能力（viewer 不给页面下载权限）。 */
  DataRegion.saveFile = function (filename, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };

  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.lk-menu'), function (m) { m.remove(); });
  }
  document.addEventListener('click', closeMenus);

  g.DataRegion = DataRegion;
  g.DataRegion.esc = esc;
})(window);
