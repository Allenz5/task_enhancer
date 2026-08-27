# 参照实测记录 — BOSS直聘（www.zhipin.com）

抓取时间 2026-08-25，未登录状态，claude-in-chrome 实地抓取。
截图 3 张：列表两栏页 / 独立岗位详情页 / 公司页（见本目录同级会话记录）。

## 1. 真实 API 字段名（最重要）

接口：`GET /wapi/zpgeek/search/joblist.json?scene=1&query=<kw>&city=<cityCode>&page=<n>&pageSize=30`
返回 `code:0, zpData:{ resCount, totalCount, hasMore, filterString, lid, jobList[], brandCard }`

`jobList[i]` 的完整键（实测 union）：

```
securityId bossAvatar bossCert encryptBossId bossName bossTitle goldHunter bossOnline
encryptJobId expectId jobName lid salaryDesc jobLabels jobValidStatus iconWord skills
jobExperience daysPerWeekDesc leastMonthDesc jobDegree cityName areaDistrict businessDistrict
jobType proxyJob proxyType anonymous outland optimal iconFlagList itemId city isShield
atsDirectPost gps afterNameIcons beforeNameIcons encryptBrandId brandName brandLogo
brandStageName brandIndustry brandScaleName welfareList industry contact showTopPosition
```

实测一条（已去掉加密 id）：

```json
{"bossName":"王女士","bossTitle":"人事","bossCert":3,"bossOnline":true,
 "jobName":"游戏测试","salaryDesc":"","jobLabels":["3-5年","本科"],
 "jobExperience":"3-5年","jobDegree":"本科",
 "cityName":"北京","areaDistrict":"海淀区","businessDistrict":"二里庄",
 "skills":["软件测试经验","丰富的游戏经验","手游测试经验","Python"],
 "jobType":0,"city":101010100,
 "brandName":"磐隆致远","brandStageName":"天使轮","brandIndustry":"游戏","brandScaleName":"20-99人",
 "welfareList":["交通补助","年终奖","节日福利","员工旅游","零食下午茶","带薪年假","定期体检","五险一金"],
 "industry":100002}
```

注：`salaryDesc` 未登录时返回空串，页面渲染成 `**-**元`。登录后为 `"15-25K"` / `"20-30K·13薪"` 这类。
骨架**不复刻这个打码**（用户决定：不做登录墙）。

## 2. 未登录的真实限制（我们不复刻）

- 两栏搜索页只放出 **15 条**，之后卡片被虚化 + 「立即登录」墙，没有翻页控件。
- 岗位描述截断在第 4 条，后面是「登录查看完整内容」。
- 薪资全部打码。

## 3. 筛选维度与真实选项（10 个下拉，DOM 实取）

| 下拉 | 对应字段 | 选项 |
|---|---|---|
| 城市 | `cityName` | 弹窗选择（北京为默认） |
| 工作区域 | `areaDistrict` | 不限/东城区/西城区/朝阳区/石景山区/丰台区/门头沟区/海淀区/房山区/顺义区/通州区/大兴区/昌平区/平谷区/怀柔区/延庆区/密云区（另有「地铁」页签） |
| 职位类型 | 职类树 | 不限/互联网·AI/电子·电气·通信/产品/客服·运营/销售/人力·行政·法务/财务·审计·税务/技工·普工/生产制造/零售·生活服务/餐饮/酒店·旅游/教育培训/设计/房地产·建筑/直播/影视·传媒/市场·公关·广告/物流·仓储·司机/采购·贸易/汽车/医疗健康/金融/项目管理/咨询·翻译·法律/能源·环保·农业/高级管理/其他 |
| 求职类型 | `jobType` | 不限/全职/兼职 |
| 薪资待遇 | `salaryDesc` | 不限/3K以下/3-5K/5-10K/10-20K/20-50K/50K以上 |
| 工作经验 | `jobExperience` | 不限/在校生/应届生/经验不限/1年以内/1-3年/3-5年/5-10年/10年以上 |
| 学历要求 | `jobDegree` | 不限/初中及以下/中专·中技/高中/大专/本科/硕士/博士 |
| 公司行业 | `brandIndustry` | 两级（互联网/AI → 互联网·电子商务·计算机软件·生活服务(O2O)·企业服务·医疗健康·游戏·社交网络与媒体·人工智能·云计算·在线教育·计算机服务·大数据·广告营销·物联网·新零售·信息安全；电子/通信/半导体；服务业；…） |
| 公司规模 | `brandScaleName` | 不限/0-20人/20-99人/100-499人/500-999人/1000-9999人/10000人以上 |
| 融资阶段 | `brandStageName` | 不限/未融资/天使轮/A轮/B轮/C轮/D轮及以上/已上市/不需要融资 |

右侧另有「清空」。

## 4. 计算后 CSS（实测值，不是肉眼取色）

```
body          font-family: arial, verdana, helvetica, "PingFang SC", "HanHei SC",
                           STHeitiSC-Light, "Microsoft Yahei", sans-serif
              font-size 14px  color rgb(65,74,96)  background rgb(246,246,248)
顶栏 .header-v2    height 49px  背景是位图，兜底色 rgb(32,35,41)（暗青→暗石板渐变）
搜索按钮      bg rgb(0,190,189)  白字  radius 30px  96x40  16px
筛选条        height 32px  14px  color rgb(65,74,96)
岗位卡 li.job-card-box   bg #fff  radius 12px  width 368px  选中态 border 2px solid rgb(0,190,189)
  .job-info        padding 14px 22px 16px
  .job-name        16px / 500 / rgb(0,166,167) / line-height 22px
  .tag-list li     12px  color rgb(102,102,102)  bg rgb(248,248,248)  radius 4px  padding 2px 8px  mr 4px
  .job-card-footer padding 8px 22px 6px  height 38px
  .boss-logo img   24x24  radius 4px
  .boss-name       14px rgb(102,102,102)
  .company-location 12px rgb(102,102,102)
详情 .job-detail-box   bg #fff  radius 16px  width 752px
独立详情页 banner  linear-gradient(90deg, rgb(59,82,106), rgb(52,90,109))  padding 18px 0 30px  白字
  岗位名 28px/600/#fff     薪资 34px/400/rgb(242,109,73)
  立即沟通 bg rgb(0,190,189) 白字 radius 12px 150x45 18px
翻页 div.page（在 /c<city>/ 版式上）
  a.prev / a.cur / a / span"..." / a.next
  每个 28x24  line-height 24  margin 0 10px  radius 0
  当前页 bg rgb(98,213,200) 白字 border 1px solid rgb(98,213,200)
  其它页 bg #fff  color rgb(65,74,96)  border 1px solid #fff
```

## 5. 页面结构

### 两栏搜索页 `/web/geek/jobs`
顶栏 → 搜索行（推荐 | ＋添加求职期望 | 搜索框 | 地图 | 搜索按钮）→ 筛选条（10 下拉 + 清空）
→ 左列岗位卡（368px）+ 右列详情面板（752px）。**点左卡右面板换内容，不跳页。**

详情面板 DOM 实测类名链：
```
.job-detail-box
  .job-detail-header > .job-header-info > .job-detail-info
      .job-name  .job-salary  .tag-list
      .job-detail-op > .op-btn-like  .op-btn-chat
  .job-detail-body
      .job-detail-operate (.link-report-new  .wechat-share)
      职位描述正文
      .job-boss-info (.detail-figure  .name  .icon-vip  .boss-active-time  .boss-info-attr)
      .job-address (.job-address-title  .job-address-desc  .map-box-wrapper)
      .more-job-btn
```

### 独立岗位详情页 `/job_detail/<id>.html`
深色 banner（招聘中 / 岗位名 + 薪资 / 城市·经验·学历 / 感兴趣·立即沟通）
→ 左栏：职位描述、招聘者卡、竞争力分析、BOSS 安全提示、公司介绍、工商信息、工作地址、更多职位
→ 右栏 `.job-sider`：公司基本信息（公司名 / 融资 / 规模 / 行业 / 查看全部职位）

工商信息实测字段：公司名称、法定代表人、成立日期、企业类型、经营状态、注册资金

### 公司页 `/gongsi/<id>.html`
深色头（logo / 公司名 / 认证标 / 收藏 / 「未融资 · 20-99人 · 游戏」 / 右侧 在招职位数 · BOSS 数）
→ 页签「公司简介 | 招聘职位(n)」
→ 热招职位卡片行（岗位名 / 经验·学历 / 城市）
→ 公司简介、工商信息（企业名称、法定代表人、成立时间、企业类型、经营状态、注册资本、注册地址、
   营业期限、所属地区、统一社会信用代码、核准日期、曾用名、登记机关、所属行业、经营范围）
→ 公司地址（可多个）

## 6. 两个真实行为，骨架里要注意

1. **没有真正的空结果页**：搜「zzqqxxvv无此岗位」不会出「无结果」，而是静默降级成不相关推荐。
   骨架仍实现「无匹配结果」态（agent 需要能读到零结果这个事实），这是**有意偏离**，已在 skeleton.json 记录。
2. **没有导出功能**。真站只有 `收藏`。骨架因此**不加导出按钮**，改用真实存在的收藏 + 收藏夹页。
