/* 单文件版（发布用）：把 index/job/company/companies/favorites 五个页面
   折成 hash 路由。渲染逻辑与 assets/app.js + 各页 <script> 一一对应，
   CSS 与数据由 build_artifact.py 原样内联，不做任何视觉改动。 */
(function () {
  'use strict';

  var JOBS = DATA.jobList, BRANDS = {}, BRANDLIST = DATA.brandList;
  BRANDLIST.forEach(function (b) { BRANDS[b.encryptBrandId] = b; });

  var PAGE_SIZE = 15;

  var FILTERS = [
    { key: 'areaDistrict', label: '工作区域', dynamic: 'city' },
    { key: 'positionCategory', label: '职位类型',
      options: ['不限','互联网/AI','电子/电气/通信','产品','客服/运营','销售','人力/行政/法务',
        '财务/审计/税务','技工/普工','生产制造','零售/生活服务','餐饮','酒店/旅游','教育培训','设计',
        '房地产/建筑','直播','影视/传媒','市场/公关/广告','物流/仓储/司机','采购/贸易','汽车',
        '医疗健康','金融','项目管理','咨询/翻译/法律','能源/环保/农业','高级管理','其他'] },
    { key: 'jobType', label: '求职类型', options: ['不限','全职','兼职'] },
    { key: 'salaryDesc', label: '薪资待遇', options: ['不限','3K以下','3-5K','5-10K','10-20K','20-50K','50K以上'] },
    { key: 'jobExperience', label: '工作经验', options: ['不限','在校生','应届生','经验不限','1年以内','1-3年','3-5年','5-10年','10年以上'] },
    { key: 'jobDegree', label: '学历要求', options: ['不限','初中及以下','中专/中技','高中','大专','本科','硕士','博士'] },
    { key: 'brandIndustry', label: '公司行业',
      options: ['不限','互联网','电子商务','计算机软件','计算机服务','企业服务','医疗健康','游戏',
        '人工智能','云计算','大数据','在线教育','广告营销','信息安全'] },
    { key: 'brandScaleName', label: '公司规模', options: ['不限','0-20人','20-99人','100-499人','500-999人','1000-9999人','10000人以上'] },
    { key: 'brandStageName', label: '融资阶段', options: ['不限','未融资','天使轮','A轮','B轮','C轮','D轮及以上','已上市','不需要融资'] }
  ];
  var SALARY_RANGE = { '3K以下':[0,3], '3-5K':[3,5], '5-10K':[5,10], '10-20K':[10,20],
                       '20-50K':[20,50], '50K以上':[50,1e9] };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function salaryBounds(d) {
    var m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*K/i.exec(d || '');
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    var s = /(\d+(?:\.\d+)?)\s*K/i.exec(d || '');
    return s ? [parseFloat(s[1]), parseFloat(s[1])] : null;
  }
  function jobById(id) { for (var i = 0; i < JOBS.length; i++) if (JOBS[i].encryptJobId === id) return JOBS[i]; }

  /* ---------- 收藏：localStorage，读写都兜住异常 ---------- */
  var FAV_KEY = 'jobskeleton.favorites';
  function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } }
  function isFav(id) { return favs().indexOf(id) >= 0; }
  function toggleFav(id) {
    var f = favs(), i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
    return i < 0;
  }

  /* ---------- 共用片段 ---------- */
  function header(active) {
    var items = [['首页','#/'],['职位','#/'],['公司','#/companies'],['收藏夹','#/favorites']];
    return '<div class="header-v2"><div class="wrap">' +
      '<a class="logo" href="#/">JOB<em>直聘</em></a><nav class="nav-main">' +
      items.map(function (it) {
        return '<a href="' + it[1] + '"' + (it[0] === active ? ' class="on"' : '') + '>' + it[0] + '</a>';
      }).join('') +
      '</nav><div class="nav-right"><span>我要招聘</span><span>我要找工作</span>' +
      '<span class="btn-login">登录/注册</span></div></div></div>';
  }

  function cardHTML(j, active) {
    return '<li class="job-card-box' + (active ? ' active' : '') + '" data-id="' + esc(j.encryptJobId) + '">' +
      '<div class="job-info"><div class="job-title">' +
        '<span class="job-name">' + esc(j.jobName) + '</span>' +
        '<span class="job-salary">' + esc(j.salaryDesc) + '</span></div>' +
        '<ul class="tag-list">' + (j.jobLabels || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '</div><div class="job-card-footer"><span class="boss-info">' +
        '<span class="boss-logo">' + esc((j.brandName || '?').slice(0, 1)) + '</span>' +
        '<span class="boss-name">' + esc(j.brandName) + '</span></span>' +
        '<span class="company-location">' + esc(j.cityName) + '·' + esc(j.areaDistrict) + '·' + esc(j.businessDistrict) + '</span>' +
      '</div></li>';
  }

  function detailBodyHTML(j, brand) {
    var biz = brand ? brand.businessInfo : null;
    return '<div class="job-sec"><h3 class="block-title">职位描述</h3>' +
        '<ul class="tag-list" style="margin-bottom:14px">' +
          (j.skills || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
        '<div class="job-detail-desc">' + esc(j.postDescription) + '</div></div>' +
      '<div class="job-sec"><h3 class="block-title">职位福利</h3><ul class="tag-list">' +
        (j.welfareList || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="job-sec"><div class="job-boss-info"><span class="detail-figure">' +
        esc((j.bossName || '?').slice(0, 1)) + '</span><div><div class="name">' + esc(j.bossName) +
        '<span class="boss-active-time">' + esc(j.bossActiveTime) + '</span></div>' +
        '<div class="boss-info-attr">' + esc(j.brandName) + ' · ' + esc(j.bossTitle) + '</div></div></div></div>' +
      (biz ? '<div class="job-sec"><h3 class="block-title">工商信息</h3><dl class="kv">' +
        Object.keys(biz).map(function (k) {
          return '<div><dt>' + esc(k) + '</dt><dd>' + esc(biz[k]) + '</dd></div>'; }).join('') + '</dl></div>' : '') +
      '<div class="job-sec job-address"><h3 class="block-title job-address-title">工作地址</h3>' +
        '<div class="job-address-desc">' + esc(j.jobAddress) + '</div>' +
        '<div class="map-box-wrapper">地图</div></div>' +
      (brand ? '<a class="more-job-btn" href="#/company/' + esc(brand.encryptBrandId) + '">查看 ' +
        esc(brand.brandName) + ' 的全部职位 &gt;</a>' : '');
  }

  /* ---------- 页面一：两栏搜索 ---------- */
  var S = { query: '', city: '北京', page: 1, sel: {}, active: null };

  function cityOptions() {
    var seen = {}, out = ['不限'];
    JOBS.forEach(function (j) { if (!seen[j.cityName]) { seen[j.cityName] = 1; out.push(j.cityName); } });
    return out;
  }
  function areaOptions() {
    var seen = {}, out = ['不限'];
    JOBS.forEach(function (j) {
      if (j.cityName === S.city && !seen[j.areaDistrict]) { seen[j.areaDistrict] = 1; out.push(j.areaDistrict); }
    });
    return out;
  }
  function match(j) {
    if (j.cityName !== S.city) return false;
    var q = S.query.trim();
    if (q && (j.jobName + ' ' + j.brandName + ' ' + (j.skills || []).join(' ')).indexOf(q) < 0) return false;
    for (var k in S.sel) {
      var v = S.sel[k];
      if (!v || v === '不限') continue;
      if (k === 'salaryDesc') {
        var r = SALARY_RANGE[v], b = salaryBounds(j.salaryDesc);
        if (!b || b[1] < r[0] || b[0] > r[1]) return false;
      } else if (k === 'jobType') {
        if ((j.jobType === 1 ? '兼职' : '全职') !== v) return false;
      } else if (j[k] !== v) return false;
    }
    return true;
  }

  function renderSearch(host) {
    host.innerHTML = header('职位') +
      '<div class="search-band"><div class="wrap">' +
        '<div class="expect"><span>推荐</span><span class="sep">|</span>' +
        '<span class="plus">＋</span><span class="add">添加求职期望</span></div>' +
        '<form class="search-form" id="searchForm" onsubmit="return false">' +
          '<span class="ico">⌕</span><input id="q" placeholder="搜索职位、公司" autocomplete="off">' +
          '<button class="btn-search" id="btnSearch" type="submit">搜索</button></form>' +
      '</div></div>' +
      '<div class="filter-band"><div class="wrap">' +
        '<div class="c-filter-condition" id="filterBar"></div>' +
        '<div class="result-count" id="resultCount"></div></div></div>' +
      '<div class="wrap main"><div class="job-list-wrapper"><ul id="jobList"></ul>' +
        '<div class="page" id="pager"></div></div>' +
        '<div class="job-detail-box" id="detailBox"></div></div>';

    document.getElementById('q').value = S.query;
    document.getElementById('btnSearch').addEventListener('click', function () {
      S.query = document.getElementById('q').value; S.page = 1; S.active = null; paint();
    });
    document.getElementById('q').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnSearch').click(); }
    });
    paint();
  }

  function renderFilters() {
    var bar = document.getElementById('filterBar');
    var html = '<div class="dd" data-key="cityName"><span class="dd-label"><i>📍</i>' + esc(S.city) +
      '<span class="caret"></span></span><ul class="dd-menu">' +
      cityOptions().map(function (o) {
        return '<li class="' + (o === S.city ? 'on' : '') + '" data-v="' + esc(o) + '">' + esc(o) + '</li>'; }).join('') +
      '</ul></div>';
    FILTERS.forEach(function (f) {
      var cur = S.sel[f.key] || '不限';
      var opts = f.dynamic === 'city' ? areaOptions() : f.options;
      html += '<div class="dd' + (cur !== '不限' ? ' sel' : '') + '" data-key="' + f.key + '">' +
        '<span class="dd-label">' + esc(cur !== '不限' ? cur : f.label) + '<span class="caret"></span></span>' +
        '<ul class="dd-menu">' + opts.map(function (o) {
          return '<li class="' + (o === cur ? 'on' : '') + '" data-v="' + esc(o) + '">' + esc(o) + '</li>'; }).join('') +
        '</ul></div>';
    });
    html += '<span class="clear-search-btn" id="btnClear">清空</span>';
    bar.innerHTML = html;

    Array.prototype.forEach.call(bar.querySelectorAll('.dd'), function (dd) {
      dd.querySelector('.dd-label').addEventListener('click', function (e) {
        e.stopPropagation();
        var was = dd.classList.contains('open');
        Array.prototype.forEach.call(bar.querySelectorAll('.dd'), function (o) { o.classList.remove('open'); });
        if (!was) dd.classList.add('open');
      });
      Array.prototype.forEach.call(dd.querySelectorAll('.dd-menu li'), function (li) {
        li.addEventListener('click', function (e) {
          e.stopPropagation();
          var key = dd.getAttribute('data-key'), v = li.getAttribute('data-v');
          if (key === 'cityName') { S.city = v === '不限' ? cityOptions()[1] : v; S.sel.areaDistrict = '不限'; }
          else S.sel[key] = v;
          S.page = 1; dd.classList.remove('open'); paint();
        });
      });
    });
    document.getElementById('btnClear').addEventListener('click', function () { S.sel = {}; S.page = 1; paint(); });
  }

  function renderDetail(j) {
    var box = document.getElementById('detailBox');
    if (!box) return;
    if (!j) { box.innerHTML = '<div class="detail-empty">请从左侧选择一个职位</div>'; return; }
    var brand = BRANDS[j.encryptBrandId];
    box.innerHTML =
      '<div class="job-detail-header"><div class="job-header-info"><div class="job-detail-info">' +
        '<a class="job-name" href="#/job/' + esc(j.encryptJobId) + '">' + esc(j.jobName) + '</a>' +
        '<span class="job-salary">' + esc(j.salaryDesc) + '</span>' +
        '<ul class="tag-list"><li>' + esc(j.cityName) + '</li><li>' + esc(j.jobExperience) +
        '</li><li>' + esc(j.jobDegree) + '</li></ul></div>' +
        '<div class="job-detail-op">' +
          '<button class="op-btn op-btn-like' + (isFav(j.encryptJobId) ? ' on' : '') + '" id="btnLike">☆ ' +
            (isFav(j.encryptJobId) ? '已收藏' : '收藏') + '</button>' +
          '<button class="op-btn op-btn-chat">立即沟通</button></div></div></div>' +
      '<div class="job-detail-body">' + detailBodyHTML(j, brand) + '</div>';
    document.getElementById('btnLike').addEventListener('click', function () {
      var on = toggleFav(j.encryptJobId);
      this.classList.toggle('on', on); this.textContent = on ? '☆ 已收藏' : '☆ 收藏';
    });
  }

  function paint() {
    renderFilters();
    var hits = JOBS.filter(match);
    var total = hits.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (S.page > pages) S.page = pages;
    var slice = hits.slice((S.page - 1) * PAGE_SIZE, S.page * PAGE_SIZE);

    document.getElementById('resultCount').textContent =
      '为你找到 ' + total + ' 个职位' + (total ? '（第 ' + S.page + '/' + pages + ' 页）' : '');

    var list = document.getElementById('jobList');
    if (!total) {
      list.innerHTML = '<li class="no-result" id="noResult">没有找到匹配的职位，试试放宽筛选条件</li>';
    } else {
      if (slice.indexOf(S.active) < 0) S.active = slice[0];
      list.innerHTML = slice.map(function (j) { return cardHTML(j, j === S.active); }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('.job-card-box'), function (li) {
        li.addEventListener('click', function () {
          S.active = jobById(li.getAttribute('data-id'));
          Array.prototype.forEach.call(list.querySelectorAll('.job-card-box'), function (o) { o.classList.remove('active'); });
          li.classList.add('active');
          renderDetail(S.active);
        });
      });
    }
    renderDetail(total ? S.active : null);

    var p = document.getElementById('pager');
    if (pages <= 1) { p.innerHTML = ''; return; }
    var h = '<a class="prev' + (S.page === 1 ? ' disabled' : '') + '" data-p="' + (S.page - 1) + '">&lt;</a>';
    for (var i = 1; i <= pages; i++) h += '<a class="' + (i === S.page ? 'cur' : '') + '" data-p="' + i + '">' + i + '</a>';
    h += '<a class="next' + (S.page === pages ? ' disabled' : '') + '" data-p="' + (S.page + 1) + '">&gt;</a>';
    p.innerHTML = h;
    Array.prototype.forEach.call(p.querySelectorAll('a'), function (a) {
      a.addEventListener('click', function () {
        var n = parseInt(a.getAttribute('data-p'), 10);
        if (a.classList.contains('disabled') || n < 1 || n > pages) return;
        S.page = n; S.active = null; window.scrollTo(0, 0); paint();
      });
    });
  }

  /* ---------- 页面二：独立岗位详情 ---------- */
  function renderJob(host, id) {
    var j = jobById(id);
    if (!j) { host.innerHTML = header('职位') + '<div class="wrap panel">未找到该职位</div>'; return; }
    var b = BRANDS[j.encryptBrandId];
    host.innerHTML = header('职位') +
      '<div class="job-banner"><div class="wrap"><div class="status">招聘中</div>' +
        '<h1>' + esc(j.jobName) + '</h1><span class="salary">' + esc(j.salaryDesc) + '</span>' +
        '<div class="attrs"><span>📍 ' + esc(j.cityName) + '</span><span>💼 ' + esc(j.jobExperience) +
        '</span><span>🎓 ' + esc(j.jobDegree) + '</span></div>' +
        '<div class="ops"><button class="btn-collect' + (isFav(id) ? ' on' : '') + '" id="btnCollect">' +
          (isFav(id) ? '已收藏' : '感兴趣') + '</button>' +
          '<button class="btn-startchat">立即沟通</button></div></div></div>' +
      '<div class="wrap detail-cols"><div class="detail-main">' + detailBodyHTML(j, b) + '</div>' +
        '<div class="job-sider"><h3>公司基本信息</h3><div class="sider-brand">' +
          '<span class="logo-box">' + esc((b ? b.brandName : '?').slice(0, 1)) + '</span>' +
          '<a href="#/company/' + esc(j.encryptBrandId) + '"><b>' + esc(j.brandName) + '</b></a></div>' +
          '<div class="sider-attr"><div><span>' + esc(j.brandStageName) + '</span></div>' +
          '<div><span>' + esc(j.brandScaleName) + '</span></div>' +
          '<div><span>' + esc(j.brandIndustry) + '</span></div></div>' +
          '<a class="more-job-btn" href="#/company/' + esc(j.encryptBrandId) + '">查看全部职位 &gt;</a>' +
        '</div></div>';
    document.getElementById('btnCollect').addEventListener('click', function () {
      var on = toggleFav(id);
      this.classList.toggle('on', on); this.textContent = on ? '已收藏' : '感兴趣';
    });
  }

  /* ---------- 页面三：公司主页 ---------- */
  function renderCompany(host, id) {
    var b = BRANDS[id];
    if (!b) { host.innerHTML = header('公司') + '<div class="wrap panel">未找到该公司</div>'; return; }
    var jobs = JOBS.filter(function (j) { return j.encryptBrandId === id; });
    var seen = {}, bosses = 0;
    jobs.forEach(function (j) { if (!seen[j.bossName]) { seen[j.bossName] = 1; bosses++; } });
    host.innerHTML = header('公司') +
      '<div class="company-banner"><div class="wrap">' +
        '<span class="logo-box">' + esc(b.brandName.slice(0, 1)) + '</span>' +
        '<div><h1>' + esc(b.brandName) + '</h1><div class="meta">' + esc(b.brandStageName) + ' · ' +
          esc(b.brandScaleName) + ' · ' + esc(b.brandIndustry) + '</div></div>' +
        '<div class="stat"><div><b>' + jobs.length + '</b>在招职位</div><div><b>' + bosses + '</b>位BOSS</div></div>' +
      '</div></div>' +
      '<div class="wrap"><div class="tabs"><a class="on">公司简介</a><a>招聘职位(' + jobs.length + ')</a></div>' +
        '<div class="panel"><h3 class="block-title">在招职位</h3><div class="hot-jobs">' +
          jobs.map(function (j) {
            return '<a class="hot-job" href="#/job/' + esc(j.encryptJobId) + '">' +
              '<span class="n job-name">' + esc(j.jobName) + '</span><div class="row">' +
              '<ul class="tag-list" style="margin:0"><li>' + esc(j.jobExperience) + '</li><li>' +
              esc(j.jobDegree) + '</li></ul><span class="city">' + esc(j.cityName) + '</span></div></a>';
          }).join('') + '</div></div>' +
        '<div class="panel"><h3 class="block-title">公司简介</h3><div>' + esc(b.introduction) + '</div></div>' +
        '<div class="panel"><h3 class="block-title">工商信息</h3><dl class="kv">' +
          Object.keys(b.businessInfo).map(function (k) {
            return '<div><dt>' + esc(k) + '</dt><dd>' + esc(b.businessInfo[k]) + '</dd></div>'; }).join('') +
        '</dl></div>' +
        '<div class="panel" style="margin-bottom:40px"><h3 class="block-title">公司地址</h3>' +
          b.addresses.map(function (a) { return '<div class="job-address-desc">' + esc(a) + '</div>'; }).join('') +
          '<div class="map-box-wrapper">地图</div></div></div>';
  }

  /* ---------- 页面四：公司列表 ---------- */
  function renderCompanies(host) {
    host.innerHTML = header('公司') + '<div class="wrap"><div class="panel" style="margin-top:20px">' +
      '<h3 class="block-title">全部公司</h3><div class="hot-jobs">' +
      BRANDLIST.map(function (b) {
        var n = JOBS.filter(function (j) { return j.encryptBrandId === b.encryptBrandId; }).length;
        return '<a class="hot-job" href="#/company/' + esc(b.encryptBrandId) + '">' +
          '<span class="n job-name">' + esc(b.brandName) + '</span><div class="row">' +
          '<ul class="tag-list" style="margin:0"><li>' + esc(b.brandStageName) + '</li><li>' +
          esc(b.brandScaleName) + '</li><li>' + esc(b.brandIndustry) + '</li></ul>' +
          '<span class="city">' + n + ' 个职位</span></div></a>';
      }).join('') + '</div></div></div>';
  }

  /* ---------- 页面五：收藏夹 ---------- */
  function renderFavorites(host) {
    var ids = favs();
    var jobs = JOBS.filter(function (j) { return ids.indexOf(j.encryptJobId) >= 0; });
    var body = jobs.length
      ? '<h3 class="block-title">我的收藏（' + jobs.length + '）</h3>' +
        '<table class="fav-table" id="favTable"><thead><tr><th>职位</th><th>薪资</th><th>经验</th>' +
        '<th>学历</th><th>公司</th><th>城市</th><th></th></tr></thead><tbody>' +
        jobs.map(function (j) {
          return '<tr data-id="' + esc(j.encryptJobId) + '"><td><a class="job-name" href="#/job/' +
            esc(j.encryptJobId) + '">' + esc(j.jobName) + '</a></td><td class="job-salary">' +
            esc(j.salaryDesc) + '</td><td>' + esc(j.jobExperience) + '</td><td>' + esc(j.jobDegree) +
            '</td><td>' + esc(j.brandName) + '</td><td>' + esc(j.cityName) + '·' + esc(j.areaDistrict) +
            '</td><td><a class="rm" style="color:var(--sub);cursor:pointer">移除</a></td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="no-result">还没有收藏任何职位 —— 打开任一职位点「收藏」再回来</div>';
    host.innerHTML = header('收藏夹') +
      '<div class="wrap"><div class="panel" style="margin-top:20px;margin-bottom:40px">' + body + '</div></div>';
    Array.prototype.forEach.call(host.querySelectorAll('.rm'), function (a) {
      a.addEventListener('click', function () {
        var tr = a.parentNode.parentNode;
        toggleFav(tr.getAttribute('data-id'));
        renderFavorites(host);
      });
    });
  }

  /* ---------- 路由 ---------- */
  function route() {
    var host = document.getElementById('app');
    var h = (location.hash || '#/').replace(/^#/, '');
    var m;
    if ((m = /^\/job\/(.+)$/.exec(h))) renderJob(host, decodeURIComponent(m[1]));
    else if ((m = /^\/company\/(.+)$/.exec(h))) renderCompany(host, decodeURIComponent(m[1]));
    else if (h === '/companies') renderCompanies(host);
    else if (h === '/favorites') renderFavorites(host);
    else renderSearch(host);
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.dd.open'), function (d) { d.classList.remove('open'); });
  });
  window.addEventListener('hashchange', route);
  route();
})();
