/* 共用外壳：顶栏、页签、面包屑、动作条、数据加载。结构照 reference/capture.md。 */
(function (g) {
  'use strict';
  var esc = window.DataRegion.esc;

  function qs(n) {
    var m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  var TABS = [['Overview', 'index.html'], ['Data Dashboard', 'runs.html'],
              ['QC', 'qc.html'], ['Reports', 'batches.html']];

  function chrome(activeTab) {
    return '<div class="labkey-main-header"><div class="wrap">' +
        '<a class="lk-logo" href="index.html"><span class="mark">L</span>Explore Lab</a>' +
        '<div class="lk-header-right"><span>🔍</span><a href="#">Sign In</a></div>' +
      '</div></div>' +
      '<div class="labkey-page-nav"><div class="wrap">' +
        TABS.map(function (t) {
          return '<a href="' + t[1] + '"' + (t[0] === activeTab ? ' class="active"' : '') + '>' + t[0] + '</a>';
        }).join('') +
      '</div></div>';
  }

  function head(opts) {
    /* opts: {crumb:[[text,href]...], title, folder, desc, links:[[text,href]...]} */
    var h = '';
    if (opts.crumb && opts.crumb.length) {
      h += '<div class="lk-crumb">' + opts.crumb.map(function (c, i) {
        return (i ? '<span class="sep">/</span>' : '') +
          (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : esc(c[0]));
      }).join('') + '</div>';
    }
    h += '<h1 class="lk-title">' + esc(opts.title) +
      (opts.folder ? '<span class="folder"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" style="vertical-align:-1px"><path d="M1.5 12.5v-9h4l1.5 2h7.5v7z"/></svg> ' + esc(opts.folder) + '</span>' : '') + '</h1>';
    if (opts.desc) h += '<div class="lk-desc">' + esc(opts.desc) + '</div>';
    if (opts.links) {
      h += '<div class="lk-textlinks">' + opts.links.map(function (l) {
        return '<a class="labkey-text-link" href="' + (l[1] || '#') + '">' + esc(l[0]) + '</a>';
      }).join('') + '</div>';
    }
    return h;
  }

  var ACTION_LINKS = [
    ['Manage Assay Design', null], ['View Batches', 'batches.html'],
    ['View Runs', 'runs.html'], ['View Results', 'results.html'],
    ['View Link to Study History', null], ['View Excluded Data', 'results.html?excluded=1']
  ];

  function load() {
    return Promise.all(['assay', 'batches', 'runs', 'results'].map(function (n) {
      return fetch('data/' + n + '.json').then(function (r) { return r.json(); });
    })).then(function (a) {
      return { assay: a[0], batches: a[1].rows, runs: a[2].rows, results: a[3].rows };
    });
  }

  function qcCell(v) {
    var cls = v === 'Reviewed - Passed' ? 'qc-pass'
            : v === 'Reviewed - Rejected' ? 'qc-reject' : 'qc-pending';
    return '<span class="qc ' + cls + '">' + esc(v) + '</span>';
  }

  function runName(D, rowId) {
    for (var i = 0; i < D.runs.length; i++) if (D.runs[i].RowId === rowId) return D.runs[i].Name;
    return rowId;
  }

  g.App = { qs: qs, chrome: chrome, head: head, load: load, esc: esc,
            qcCell: qcCell, runName: runName, ACTION_LINKS: ACTION_LINKS };
})(window);
