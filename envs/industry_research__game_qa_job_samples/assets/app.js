/* 招聘站骨架 — 纯前端，无后端。数据来自 data/*.json（第二层按任务替换） */
(function (g) {
  'use strict';

  var PAGE_SIZE = 5;   /* 本任务样本量小，按 layer2_contract 允许的范围调小 */

  /* ---------- 真实筛选维度（选项照 BOSS直聘 DOM 实取，见 reference/capture.md） ---------- */
  var FILTERS = [
    { key: 'areaDistrict',    label: '工作区域', dynamic: 'city' },
    { key: 'positionCategory', label: '职位类型',
      options: ['不限','互联网/AI','电子/电气/通信','产品','客服/运营','销售','人力/行政/法务',
        '财务/审计/税务','技工/普工','生产制造','零售/生活服务','餐饮','酒店/旅游','教育培训','设计',
        '房地产/建筑','直播','影视/传媒','市场/公关/广告','物流/仓储/司机','采购/贸易','汽车',
        '医疗健康','金融','项目管理','咨询/翻译/法律','能源/环保/农业','高级管理','其他'] },
    { key: 'jobType',         label: '求职类型', options: ['不限','全职','兼职'] },
    { key: 'salaryDesc',      label: '薪资待遇', options: ['不限','3K以下','3-5K','5-10K','10-20K','20-50K','50K以上'] },
    { key: 'jobExperience',   label: '工作经验', options: ['不限','在校生','应届生','经验不限','1年以内','1-3年','3-5年','5-10年','10年以上'] },
    { key: 'jobDegree',       label: '学历要求', options: ['不限','初中及以下','中专/中技','高中','大专','本科','硕士','博士'] },
    { key: 'brandIndustry',   label: '公司行业',
      options: ['不限','互联网','电子商务','计算机软件','计算机服务','企业服务','医疗健康','游戏',
        '人工智能','云计算','大数据','在线教育','广告营销','信息安全'] },
    { key: 'brandScaleName',  label: '公司规模', options: ['不限','0-20人','20-99人','100-499人','500-999人','1000-9999人','10000人以上'] },
    { key: 'brandStageName',  label: '融资阶段', options: ['不限','未融资','天使轮','A轮','B轮','C轮','D轮及以上','已上市','不需要融资'] }
  ];

  var SALARY_RANGE = { '3K以下':[0,3], '3-5K':[3,5], '5-10K':[5,10], '10-20K':[10,20],
                       '20-50K':[20,50], '50K以上':[50,1e9] };

  /* ---------- 工具 ---------- */
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function salaryBounds(desc) {
    var m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*K/i.exec(desc || '');
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    var s = /(\d+(?:\.\d+)?)\s*K/i.exec(desc || '');
    return s ? [parseFloat(s[1]), parseFloat(s[1])] : null;
  }

  function loadData() {
    return Promise.all([
      fetch('data/jobs.json').then(function (r) { return r.json(); }),
      fetch('data/companies.json').then(function (r) { return r.json(); })
    ]).then(function (a) {
      var brands = {};
      a[1].brandList.forEach(function (b) { brands[b.encryptBrandId] = b; });
      return { jobs: a[0].jobList, brands: brands, brandList: a[1].brandList };
    });
  }

  /* ---------- 收藏（真站有；骨架不加导出按钮，真站也没有） ---------- */
  var FAV_KEY = 'jobskeleton.favorites';
  function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } }
  function isFav(id) { return favs().indexOf(id) >= 0; }
  function toggleFav(id) {
    var f = favs(), i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
    return i < 0;
  }

  /* ---------- 顶栏（三个页面共用） ---------- */
  function header(active) {
    var items = [['首页','index.html'],['职位','index.html'],['公司','companies.html'],
                 ['收藏夹','favorites.html']];
    return '<div class="header-v2"><div class="wrap">' +
      '<a class="logo" href="index.html">JOB<em>直聘</em></a>' +
      '<nav class="nav-main">' + items.map(function (it) {
        return '<a href="' + it[1] + '"' + (it[0] === active ? ' class="on"' : '') + '>' + it[0] + '</a>';
      }).join('') + '</nav>' +
      '<div class="nav-right"><span>我要招聘</span><span>我要找工作</span>' +
      '<span class="btn-login">登录/注册</span></div></div></div>';
  }

  /* ---------- 岗位卡 ---------- */
  function cardHTML(j, active) {
    return '<li class="job-card-box' + (active ? ' active' : '') + '" data-id="' + esc(j.encryptJobId) + '">' +
      '<div class="job-info"><div class="job-title">' +
        '<span class="job-name">' + esc(j.jobName) + '</span>' +
        '<span class="job-salary">' + esc(j.salaryDesc) + '</span></div>' +
        '<ul class="tag-list">' + (j.jobLabels || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '<div class="job-card-footer"><span class="boss-info">' +
        '<span class="boss-logo">' + esc((j.brandName || '?').slice(0, 1)) + '</span>' +
        '<span class="boss-name">' + esc(j.brandName) + '</span></span>' +
        '<span class="company-location">' + esc(j.cityName) + '·' + esc(j.areaDistrict) + '·' + esc(j.businessDistrict) + '</span>' +
      '</div></li>';
  }

  /* ---------- 详情正文区块（右面板与独立页共用） ---------- */
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
          return '<div><dt>' + esc(k) + '</dt><dd>' + esc(biz[k]) + '</dd></div>'; }).join('') +
        '</dl></div>' : '') +
      '<div class="job-sec job-address"><h3 class="block-title job-address-title">工作地址</h3>' +
        '<div class="job-address-desc">' + esc(j.jobAddress) + '</div>' +
        '<div class="map-box-wrapper">地图</div></div>' +
      (brand ? '<a class="more-job-btn" href="company.html?brandId=' + esc(brand.encryptBrandId) +
        '">查看 ' + esc(brand.brandName) + ' 的全部职位 &gt;</a>' : '');
  }

  g.Skeleton = {
    PAGE_SIZE: PAGE_SIZE, FILTERS: FILTERS, SALARY_RANGE: SALARY_RANGE,
    qs: qs, el: el, esc: esc, salaryBounds: salaryBounds, loadData: loadData,
    favs: favs, isFav: isFav, toggleFav: toggleFav,
    header: header, cardHTML: cardHTML, detailBodyHTML: detailBodyHTML
  };
})(window);
