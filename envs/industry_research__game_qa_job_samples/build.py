# -*- coding: utf-8 -*-
"""把「游戏测试工程师公开岗位样本」这条任务的 24 条样本灌进 job-search 骨架。
   注意：任务原始 zip 不在本地，这 24 条是照任务书里写死的结构（A01-A12 企业官方岗位页 /
   B01-B12 公开招聘平台）与 15 项能力清单构造的占位样本，字段名与骨架契约完全对齐。"""
import json, random
random.seed(396)

ABIL = ["需求分析","测试设计","缺陷闭环与定位","功能数值与玩法","性能与稳定性",
        "自动化与工具平台","编程与脚本","代码引擎与白盒","服务端协议与接口","多端兼容与弱网",
        "安全与风控","数据指标与质量度量","项目推进与风险","流程与质量体系","游戏品类与业务理解"]

# 每项能力一条唯一的「证据短语」——任务要求结论必须能回查证据短语，所以它必须
# 逐字出现在岗位描述里，且只出现在带该能力的样本里。
EVID = {
 "需求分析":"参与需求评审并输出测试点拆分",
 "测试设计":"设计等价类与边界值测试用例",
 "缺陷闭环与定位":"跟踪缺陷从提单到回归验证闭环",
 "功能数值与玩法":"校验战斗数值与玩法规则一致性",
 "性能与稳定性":"负责帧率内存与崩溃率专项排查",
 "自动化与工具平台":"搭建并维护自动化测试平台",
 "编程与脚本":"使用 Python 编写测试脚本",
 "代码引擎与白盒":"阅读引擎源码进行白盒测试",
 "服务端协议与接口":"对服务端协议与接口做联调验证",
 "多端兼容与弱网":"覆盖多机型适配与弱网场景验证",
 "安全与风控":"参与反外挂与账号风控测试",
 "数据指标与质量度量":"建立质量度量指标与看板",
 "项目推进与风险":"推动版本节奏并识别上线风险",
 "流程与质量体系":"制定测试流程规范与质量体系",
 "游戏品类与业务理解":"熟悉 SLG 与卡牌品类业务特点",
}

ARCHE = ["功能/版本质量保障","测试开发/效能工具","性能与稳定性专项","多端/引擎/内容专项","质量负责人/体系建设"]
# 每种原型的核心能力（编码为 1 的基础集）
CORE = {
 "功能/版本质量保障":["需求分析","测试设计","缺陷闭环与定位","功能数值与玩法","游戏品类与业务理解"],
 "测试开发/效能工具":["自动化与工具平台","编程与脚本","测试设计","服务端协议与接口"],
 "性能与稳定性专项":["性能与稳定性","代码引擎与白盒","数据指标与质量度量","编程与脚本"],
 "多端/引擎/内容专项":["多端兼容与弱网","代码引擎与白盒","功能数值与玩法","测试设计"],
 "质量负责人/体系建设":["流程与质量体系","项目推进与风险","数据指标与质量度量","需求分析","安全与风控"],
}
LEVEL = ["初级","中级","高级","负责人"]
LEVEL_EXP = {"初级":"1年以内","中级":"1-3年","高级":"3-5年","负责人":"5-10年"}

# A 级来源 = 企业官方岗位页（12 家公司各 1 条）
A_FIRMS = [("砚川数娱","游戏","未融资","20-99人"),("岚屿互娱","游戏","天使轮","20-99人"),
 ("拾光工坊","游戏","不需要融资","100-499人"),("白鹭引擎","游戏","已上市","1000-9999人"),
 ("青柚游戏","游戏","A轮","20-99人"),("长风互动","人工智能","B轮","100-499人"),
 ("云栖数娱","游戏","已上市","500-999人"),("甘棠软件","计算机软件","已上市","10000人以上"),
 ("鹿野测试","计算机服务","未融资","0-20人"),("木鸢科技","企业服务","未融资","20-99人"),
 ("重霄互娱","游戏","不需要融资","500-999人"),("沅澈网络","游戏","C轮","100-499人")]
# B 级来源 = 公开招聘平台/职业内容页（同样 12 条，公司名照旧但来源等级不同）
B_FIRMS = [("栖梧工坊","游戏","未融资","20-99人"),("南屿互娱","游戏","天使轮","20-99人"),
 ("漱石网络","游戏","A轮","100-499人"),("KITE STUDIO","游戏","未融资","0-20人"),
 ("川陌网络","游戏","B轮","500-999人"),("砺岩时代","游戏","未融资","20-99人"),
 ("鹿野互娱","游戏","未融资","0-20人"),("穹岭数娱","游戏","A轮","100-499人"),
 ("云杉工坊","游戏","未融资","0-20人"),("砺锋数科","计算机软件","B轮","100-499人"),
 ("拾贰互动","游戏","天使轮","20-99人"),("北屿引擎","人工智能","C轮","500-999人")]

TITLE = {
 "功能/版本质量保障":["游戏测试工程师","版本质量保障工程师","功能测试工程师(游戏)"],
 "测试开发/效能工具":["测试开发工程师","自动化测试工程师","测试平台研发工程师"],
 "性能与稳定性专项":["性能测试工程师","稳定性专项测试工程师","客户端性能优化测试"],
 "多端/引擎/内容专项":["多端兼容测试工程师","引擎内容测试工程师","跨端测试工程师"],
 "质量负责人/体系建设":["测试组长","质量负责人(QA Lead)","测试主管"],
}
CITY = [("北京","朝阳区","望京"),("北京","海淀区","中关村"),("上海","浦东新区","张江"),
        ("深圳","南山区","科技园"),("成都","高新区","天府三街"),("杭州","滨江区","江南大道"),
        ("北京","海淀区","西二旗"),("广州","天河区","珠江新城")]
DEG = ["大专","本科","硕士","学历不限"]
SAL = ["8-12K","10-15K","12-18K","15-25K","18-30K","20-35K","25-40K","30-50K"]
WELF = ["五险一金","带薪年假","年终奖","餐补","定期体检","股票期权","弹性工作","节日福利"]

def build_desc(title, arche, level, abils, firm):
    lines = ["岗位：%s（%s · %s）" % (title, arche, level), "", "岗位职责："]
    for i, a in enumerate(abils, 1):
        lines.append("%d. %s；" % (i, EVID[a]))
    lines += ["", "任职要求：",
              "1. %s工作经验，具备完整版本从研发到上线的测试经历；" % LEVEL_EXP[level],
              "2. 具备 %s 相关的项目证据；" % "、".join(abils[:3]),
              "3. 沟通顺畅，能承担版本节奏压力。", "",
              "本岗位由 %s 发布。" % firm]
    return "\n".join(lines)

samples, jobs = [], []
brands = {}

def emit(sid, grade, firm_tuple, i):
    name, ind, stage, scale = firm_tuple
    arche = ARCHE[i % 5]
    level = LEVEL[(i + (0 if grade == 'A' else 2)) % 4]
    abils = list(CORE[arche])
    # 每条再随机补 0-2 项，制造真实的频次分布
    extra = [a for a in ABIL if a not in abils]
    random.shuffle(extra)
    abils += extra[:random.randint(0, 2)]
    abils = [a for a in ABIL if a in abils]          # 固定顺序
    title = random.choice(TITLE[arche])
    city, area, biz = CITY[i % len(CITY)]
    deg = DEG[i % len(DEG)]
    bid = ("BA%02d" if grade == 'A' else "BB%02d") % (i + 1)
    brands.setdefault(bid, {
        "encryptBrandId": bid, "brandName": name, "brandIndustry": ind,
        "brandStageName": stage, "brandScaleName": scale,
        "introduction": "%s，%s行业，%s，%s。" % (name, ind, stage, scale),
        "businessInfo": {"公司名称": name + "（%s）有限公司" % city, "法定代表人": "—",
                         "成立日期": "—", "企业类型": "有限责任公司", "经营状态": "存续",
                         "注册资金": "—"},
        "addresses": ["%s%s%s" % (city, area, biz)],
        "sourceGrade": grade,
    })
    jobs.append({
        "encryptJobId": sid,
        "jobName": title,
        "salaryDesc": SAL[i % len(SAL)],
        "jobLabels": [LEVEL_EXP[level], deg],
        "jobExperience": LEVEL_EXP[level],
        "jobDegree": deg,
        "cityName": city, "areaDistrict": area, "businessDistrict": biz,
        "jobType": 0,
        "positionCategory": "互联网/AI",
        "skills": abils[:4],
        "welfareList": random.sample(WELF, 5),
        "postDescription": build_desc(title, arche, level, abils, name),
        "jobAddress": "%s%s%s%d号" % (city, area, biz, 10 + i),
        "bossName": random.choice(["聂女士","仵先生","殳女士","赵先生","孙女士"]),
        "bossTitle": "招聘负责人", "bossOnline": True, "bossActiveTime": "今日活跃",
        "encryptBrandId": bid,
        "brandName": name, "brandIndustry": ind,
        "brandStageName": stage, "brandScaleName": scale,
    })
    samples.append({
        "样本ID": sid, "来源等级": grade,
        "来源类型": "企业官方岗位页" if grade == 'A' else "公开招聘平台或职业内容页",
        "权重": 1.0 if grade == 'A' else 0.6,
        "岗位名": title, "公司": name, "城市": city,
        "经验年限": LEVEL_EXP[level], "学历": deg,
        "岗位原型": arche, "责任层级": level,
        "能力编码": {a: (1 if a in abils else 0) for a in ABIL},
        "证据短语": {a: EVID[a] for a in abils},
        "来源定位": ("company.html?brandId=%s" % bid) if grade == 'A'
                    else ("job.html?jobId=%s" % sid),
    })

for i, f in enumerate(A_FIRMS): emit("A%02d" % (i + 1), 'A', f, i)
for i, f in enumerate(B_FIRMS): emit("B%02d" % (i + 1), 'B', f, i)

json.dump({"jobList": jobs}, open("data/jobs.json", "w"), ensure_ascii=False, indent=1)
json.dump({"brandList": list(brands.values())}, open("data/companies.json", "w"), ensure_ascii=False, indent=1)
json.dump({"abilities": ABIL, "evidencePhrases": EVID, "archetypes": ARCHE,
           "levels": LEVEL, "samples": samples},
          open("input/samples.json", "w"), ensure_ascii=False, indent=1)
print("jobs", len(jobs), "brands", len(brands), "samples", len(samples))
