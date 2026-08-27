/* 单文件版（发布用）：把 5 个页面折成 hash 路由。
   grid.js 原样复用（它本来就与页面无关）；渲染逻辑与各页 <script> 一一对应，
   CSS 与数据由 build_artifact.py 原样内联，不做视觉改动。 */
(function (g) {
  'use strict';
  var esc = window.DataRegion.esc;
  var D = window.DATA;

  var TABS = [['Overview', '#/'], ['Data Dashboard', '#/runs'], ['QC', '#/qc'], ['Reports', '#/batches']];

  function chrome(active) {
    return '<div class="labkey-main-header"><div class="wrap">' +
        '<a class="lk-logo" href="#/"><span class="mark">L</span>Explore Lab</a>' +
        '<div class="lk-header-right"><span>&#128269;</span><a href="#/">Sign In</a></div>' +
      '</div></div>' +
      '<div class="labkey-page-nav"><div class="wrap">' +
        TABS.map(function (t) {
          return '<a href="' + t[1] + '"' + (t[0] === active ? ' class="active"' : '') + '>' + t[0] + '</a>';
        }).join('') + '</div></div>';
  }

  var FOLDER_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="1.3" style="vertical-align:-1px"><path d="M1.5 12.5v-9h4l1.5 2h7.5v7z"/></svg>';

  function head(o) {
    var h = '';
    if (o.crumb && o.crumb.length) {
      h += '<div class="lk-crumb">' + o.crumb.map(function (c, i) {
        return (i ? '<span class="sep">/</span>' : '') +
          (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : esc(c[0]));
      }).join('') + '</div>';
    }
    h += '<h1 class="lk-title">' + esc(o.title) +
      (o.folder ? '<span class="folder">' + FOLDER_SVG + ' ' + esc(o.folder) + '</span>' : '') + '</h1>';
    if (o.desc) h += '<div class="lk-desc">' + esc(o.desc) + '</div>';
    if (o.links) {
      h += '<div class="lk-textlinks">' + o.links.map(function (l) {
        return '<a class="labkey-text-link" href="' + (l[1] || '#/') + '">' + esc(l[0]) + '</a>';
      }).join('') + '</div>';
    }
    return h;
  }

  var ACTION_LINKS = [
    ['Manage Assay Design', null], ['View Batches', '#/batches'],
    ['View Runs', '#/runs'], ['View Results', '#/results'],
    ['View Link to Study History', null], ['View Excluded Data', '#/results/excluded']
  ];

  function qcCell(v) {
    var cls = v === 'Reviewed - Passed' ? 'qc-pass'
            : v === 'Reviewed - Rejected' ? 'qc-reject' : 'qc-pending';
    return '<span class="qc ' + cls + '">' + esc(v) + '</span>';
  }
  function runName(id) {
    for (var i = 0; i < D.runs.length; i++) if (D.runs[i].RowId === id) return D.runs[i].Name;
    return id;
  }
  function batchName(id) {
    for (var i = 0; i < D.batches.length; i++) if (D.batches[i].RowId === id) return D.batches[i].Name;
    return '';
  }
  function flagCell(r) {
    return r.Flag ? '<span title="' + esc(r.Flag) + '" class="qc-reject">&#9873;</span>'
                  : '<span style="color:#c9c9c9">&#9873;</span>';
  }

  var RUN_COLS_SHORT = [
    { name: 'Name', caption: 'Assay ID', render: function (r) {
        return '<a href="#/results/run/' + r.RowId + '">' + esc(r.Name) + '</a>'; } },
    { name: 'Created', caption: 'Created' },
    { name: 'cellCultureUser', caption: 'Lab Technician' },
    { name: 'incubatorName', caption: 'Incubator/Instrument' },
    { name: 'QCFlags', caption: 'QC Flags', render: function (r) { return qcCell(r.QCFlags); } }
  ];

  /* ---------- 页面 ---------- */
  function pageOverview(host) {
    host.innerHTML = chrome('Overview') + '<div class="wrap">' +
      head({ title: 'Assay Data Analysis', folder: D.assay.folder }) +
      '<div class="lk-cols"><div class="left">' +
        '<div class="lk-webpart"><h2>Data Harmonization Workflow</h2><div class="wp-body">' +
          '<p>Data can be dropped into the Files panel, imported using a customized assay design, ' +
          'and surfaced in whatever tabular formats are most useful.</p><ul>' +
          '<li>Submitted data is shown in two tables: <b><a href="#/runs">Cell Culture Runs</a></b> ' +
          'and <b><a href="#/results">Cell Culture Results</a></b>.</li>' +
          '<li>In the <b>Files</b> panel (right), contributors can drop files for analysis.</li>' +
          '<li>Continue to the <b><a href="#/qc">QC</a></b> tab to see quality control rules applied to the data.</li>' +
          '</ul></div></div>' +
        '<div class="lk-webpart"><h2>Cell Culture Runs</h2>' +
          '<div style="padding:0 12px 12px"><div id="grid"></div></div></div>' +
      '</div><div class="right"><div class="lk-webpart"><h2>Files</h2>' +
        '<div class="lk-files">' +
          '<div class="bar"><span>&#8593;</span><span>&#8635;</span><span>&#9636; Manage</span></div>' +
          D.assay.files.map(function (f) {
            var dir = /\/$/.test(f);
            return '<div class="row"><span class="ic">' + (dir ? '&#128193;' : '&#128196;') + '</span>' +
              '<span>' + esc(dir ? f.replace(/\/$/, '') : f) + '</span></div>';
          }).join('') +
        '</div></div></div></div></div>';
    new DataRegion({ el: '#grid', name: 'CellCultureRuns', rowKey: 'RowId', pageSize: 100,
                     rows: D.runs, columns: RUN_COLS_SHORT });
  }

  function pageRuns(host) {
    host.innerHTML = chrome('Data Dashboard') + '<div class="wrap">' +
      head({ crumb: [['Assay List', '#/'], ['Cell Culture Batches', '#/batches'], ['Cell Culture Runs', null]],
             title: 'Cell Culture Runs', folder: D.assay.folder, desc: D.assay.description,
             links: ACTION_LINKS }) + '<div id="grid"></div></div>';
    new DataRegion({
      el: '#grid', name: 'CellCultureRuns', rowKey: 'RowId', pageSize: 100, rows: D.runs,
      columns: [
        { name: 'Flag', caption: 'Flag', render: flagCell },
        RUN_COLS_SHORT[0],
        { name: 'Created', caption: 'Created' },
        { name: 'CreatedBy', caption: 'Created By' },
        { name: 'QCFlags', caption: 'QC Flags', render: function (r) { return qcCell(r.QCFlags); } },
        { name: 'cellCultureUser', caption: 'Lab Technician' },
        { name: 'incubatorName', caption: 'Incubator/Instrument' },
        { name: 'Batch', caption: 'Batch', render: function (r) {
            return '<a href="#/batches">' + esc(batchName(r.Batch)) + '</a>'; } },
        { name: 'ReplacesRun', caption: 'Replaces', render: function (r) {
            return r.ReplacesRun ? '<a href="#/results/run/' + r.ReplacesRun + '">' +
              esc(runName(r.ReplacesRun)) + '</a>' : ''; } },
        { name: 'ReplacedByRun', caption: 'Replaced By', render: function (r) {
            return r.ReplacedByRun ? '<a href="#/results/run/' + r.ReplacedByRun + '">' +
              esc(runName(r.ReplacedByRun)) + '</a>' : ''; } },
        { name: 'Comments', caption: 'Comments' }
      ]
    });
  }

  function pageBatches(host) {
    host.innerHTML = chrome('Reports') + '<div class="wrap">' +
      head({ crumb: [['Assay List', '#/'], ['Cell Culture Batches', null]],
             title: 'Cell Culture Batches', folder: D.assay.folder, desc: D.assay.description,
             links: ACTION_LINKS }) + '<div id="grid"></div></div>';
    new DataRegion({
      el: '#grid', name: 'CellCultureBatches', rowKey: 'RowId', pageSize: 100, rows: D.batches,
      columns: [
        { name: 'Name', caption: 'Name', render: function (r) {
            return '<a href="#/runs">' + esc(r.Name) + '</a>'; } },
        { name: 'Hypothesis', caption: 'Hypothesis' },
        { name: 'Contact', caption: 'Contact' },
        { name: 'Comments', caption: 'Comments' },
        { name: 'Created', caption: 'Created' },
        { name: 'CreatedBy', caption: 'Created By' },
        { name: 'RunCount', caption: 'Run Count', align: 'right' }
      ]
    });
  }

  function pageResults(host, mode, arg) {
    var initial = [], viewName = null;
    if (mode === 'run') initial.push({ col: 'Run', op: 'eq', value: arg });
    if (mode === 'excluded') { initial.push({ col: 'FlaggedAsExcluded', op: 'eq', value: 'true' });
      viewName = 'Excluded Data'; }
    if (mode === 'qc') {
      initial.push({ col: 'QCFlags', op: 'eq', value: arg });
      viewName = arg === 'Reviewed - Passed' ? 'Results - Passed QC Review'
               : arg === 'Reviewed - Rejected' ? 'Results - Did Not Pass QC Review'
               : 'Results - Not Yet Reviewed';
    }
    var byRun = {}; D.runs.forEach(function (r) { byRun[r.RowId] = r; });
    var rows = D.results.map(function (r) {
      var R = byRun[r.Run] || {};
      var o = {}; for (var k in r) o[k] = r[k];
      o.AssayID = R.Name; o.LabTechnician = R.cellCultureUser;
      o.Incubator = R.incubatorName; o.QCFlags = R.QCFlags;
      o.FlaggedAsExcluded = r.FlaggedAsExcluded ? 'true' : 'false';
      return o;
    });
    host.innerHTML = chrome('Data Dashboard') + '<div class="wrap">' +
      head({ crumb: [['Assay List', '#/'], ['Cell Culture Batches', '#/batches'], ['Cell Culture Runs', '#/runs']],
             title: 'Cell Culture Results', folder: D.assay.folder, desc: D.assay.description,
             links: ACTION_LINKS }) + '<div id="grid"></div></div>';
    new DataRegion({
      el: '#grid', name: 'CellCultureResults', rowKey: null, pageSize: 100,
      rows: rows, initialFilters: initial, viewName: viewName,
      rowClass: function (r) { return r.FlaggedAsExcluded === 'true' ? 'excluded' : ''; },
      columns: [
        { name: 'ParticipantID', caption: 'Sample Id' },
        { name: 'Date', caption: 'Date' },
        { name: 'Day', caption: 'Day', align: 'right' },
        { name: 'cellCount', caption: 'Cell Count', align: 'right' },
        { name: 'media', caption: 'Media' },
        { name: 'LabTechnician', caption: 'Lab Technician' },
        { name: 'Incubator', caption: 'Incubator/Instrument' },
        { name: 'AssayID', caption: 'Assay ID', render: function (r) {
            return '<a href="#/results/run/' + r.Run + '">' + esc(r.AssayID) + '</a>'; } },
        { name: 'QCFlags', caption: 'QC Flags', render: function (r) { return qcCell(r.QCFlags); } },
        { name: 'FlaggedAsExcluded', caption: 'Flagged As Excluded' },
        { name: 'ExclusionComment', caption: 'Exclusion Comment' }
      ]
    });
  }

  function pageQC(host) {
    var rejected = D.runs.filter(function (r) { return r.QCFlags === 'Reviewed - Rejected'; });
    host.innerHTML = chrome('QC') + '<div class="wrap">' +
      head({ title: 'Assay Data Analysis', folder: D.assay.folder }) +
      '<div class="lk-webpart"><h2>Quality Control - Cell Culture</h2><div class="wp-body">' +
        '<p>The QC Analyst reviewing the data discovered that the cells died' +
        (rejected.length ? ' in ' + esc(rejected.map(function (r) { return r.Name; }).join(', ')) : '') +
        ', including those in the control media, indicating an issue unrelated to the media being tested. ' +
        'This violated the QC criteria, so the run was marked "Reviewed - Rejected", and is excluded ' +
        'from the final analysis.</p><ul>' +
        '<li><a href="#/results/qc/' + encodeURIComponent('Reviewed - Passed') +
          '">Results - Passed QC Review</a> - Analysis is based on these results.</li>' +
        '<li><a href="#/results/qc/' + encodeURIComponent('Reviewed - Rejected') +
          '">Results - Did Not Pass QC Review</a> - Excluded from analysis.</li>' +
        '<li><a href="#/results/qc/' + encodeURIComponent('Not Yet Reviewed') +
          '">Results - Not Yet Reviewed</a> - These results are not yet included in the analysis.</li>' +
        '</ul><p>Fine-grained permissions are available corresponding to different roles in a Lab ' +
        'organization, such as "QC Analyst", for setting quality control states.</p></div></div>' +
      '<div class="lk-webpart"><h2>Quality Control Assessments</h2>' +
        '<div style="padding:0 12px 12px"><div id="grid"></div></div></div></div>';
    new DataRegion({
      el: '#grid', name: 'QualityControlAssessments', rowKey: 'RowId', pageSize: 100, rows: D.runs,
      columns: [
        { name: 'Flag', caption: 'Flag', render: flagCell },
        RUN_COLS_SHORT[0],
        { name: 'Created', caption: 'Created' },
        { name: 'CreatedBy', caption: 'Created By' },
        { name: 'QCFlags', caption: 'QC Flags', render: function (r) { return qcCell(r.QCFlags); } },
        { name: 'cellCultureUser', caption: 'Lab Technician' },
        { name: 'incubatorName', caption: 'Incubator/Instrument' }
      ]
    });
  }

  function route() {
    var host = document.getElementById('app');
    var h = (location.hash || '#/').replace(/^#/, '');
    var m;
    if ((m = /^\/results\/run\/(.+)$/.exec(h))) pageResults(host, 'run', decodeURIComponent(m[1]));
    else if ((m = /^\/results\/qc\/(.+)$/.exec(h))) pageResults(host, 'qc', decodeURIComponent(m[1]));
    else if (h === '/results/excluded') pageResults(host, 'excluded');
    else if (h === '/results') pageResults(host, null);
    else if (h === '/runs') pageRuns(host);
    else if (h === '/batches') pageBatches(host);
    else if (h === '/qc') pageQC(host);
    else pageOverview(host);
    window.scrollTo(0, 0);
  }

  /* 文件交付：发布副本不声明 downloads 能力（声明了就不能分享），
     所以导出按钮保留但不落文件——骨架本体在本地/env 里运行时是正常下载的。 */
  DataRegion.saveFile = function () {};

  window.addEventListener('hashchange', route);
  route();
})(window);
