# -*- coding: utf-8 -*-
import json, random
random.seed(20260825)

CITY = {"北京":["朝阳区","海淀区","西城区","东城区","昌平区","大兴区"],
        "上海":["浦东新区","徐汇区","静安区","杨浦区"],
        "深圳":["南山区","福田区","宝安区"],
        "成都":["高新区","武侯区","锦江区"]}
BIZ = {"朝阳区":["望京","来广营","太阳宫","大望路"],"海淀区":["中关村","学院路","西二旗","二里庄"],
       "西城区":["金融街","西直门"],"东城区":["东直门","王府井"],"昌平区":["回龙观","沙河"],
       "大兴区":["亦庄","西红门"],"浦东新区":["张江","陆家嘴","金桥"],"徐汇区":["漕河泾","徐家汇"],
       "静安区":["南京西路"],"杨浦区":["五角场"],"南山区":["科技园","后海","西丽"],
       "福田区":["车公庙","会展中心"],"宝安区":["宝安中心"],"高新区":["天府三街","孵化园"],
       "武侯区":["桐梓林"],"锦江区":["春熙路"]}

COMPANIES = [
 ("砚川数娱","游戏","未融资","20-99人","砚川数娱（北京）有限公司","方启明","2020-03-04","有限责任公司（自然人独资）","存续","100万人民币","游戏公司，致力于研发制作出更多精良的产品"),
 ("岚屿互娱","游戏","天使轮","20-99人","北京岚屿互娱科技有限公司","陆知远","2019-07-15","有限责任公司","存续","500万人民币","专注 SLG 与卡牌手游研发的独立工作室"),
 ("拾光工坊","游戏","不需要融资","100-499人","杭州拾光工坊科技有限公司","沈砚舟","2014-05-20","有限责任公司","存续","1000万人民币","以休闲竞技为核心的老牌游戏发行商"),
 ("白鹭引擎","游戏","已上市","1000-9999人","杭州白鹭引擎技术有限公司","何清越","2003-11-06","股份有限公司","存续","2.6亿人民币","国内领先的棋牌与休闲游戏平台"),
 ("木鸢科技","企业服务","未融资","20-99人","北京木鸢科技信息技术有限公司","柳承安","2021-01-12","有限责任公司","存续","200万人民币","为出海游戏提供本地化与测试外包服务"),
 ("青柚游戏","游戏","A轮","20-99人","上海青柚游戏网络科技有限公司","邵雨亭","2018-09-03","有限责任公司","存续","300万人民币","国风动作游戏研发商"),
 ("长风互动","人工智能","B轮","100-499人","深圳长风互动科技有限公司","苏怀瑾","2017-04-18","有限责任公司","存续","2000万人民币","AI 驱动的游戏内容生成平台"),
 ("鹿野测试","计算机服务","未融资","0-20人","成都蓝蚁软件测试有限公司","江述白","2022-06-30","有限责任公司","存续","50万人民币","第三方软件测试与质量咨询"),
 ("云栖数娱","游戏","已上市","500-999人","北京云栖数娱科技股份有限公司","温砚秋","2011-08-22","股份有限公司","存续","8000万人民币","三消与休闲手游研发发行"),
 ("甘棠软件","计算机软件","已上市","10000人以上","甘棠软件（上海）有限公司","傅安然","2002-03-11","有限责任公司（外商投资）","存续","5亿人民币","企业级软件外包与人才服务"),
]

TITLES = ["游戏测试工程师","游戏测试","高级游戏测试工程师","QA 功能测试","测试开发工程师",
 "自动化测试工程师","SLG 游戏测试","手游测试工程师","测试组长","性能测试工程师",
 "游戏 QA","客户端测试工程师","服务端测试工程师","本地化测试工程师","测试主管"]
EXP = ["经验不限","1年以内","1-3年","3-5年","5-10年"]
DEG = ["大专","本科","硕士","学历不限"]
SKILLS = ["软件测试经验","手游测试经验","Python","自动化测试","性能测试","Unity","Jira","SQL",
 "Linux","Charles 抓包","丰富的游戏经验","TestNG","Appium","埋点验证","压测经验"]
WELF = ["五险一金","带薪年假","年终奖","节日福利","餐补","交通补助","定期体检","零食下午茶",
 "员工旅游","股票期权","补充医疗保险","弹性工作"]
SAL = ["6-9K","8-12K","10-15K","12-18K","15-25K","18-30K","20-35K","25-40K","30-50K","40-60K","2-4K"]

def desc(t, exp, sk):
    return ("岗位职责：\n"
      "1. 负责 %s 相关模块的测试用例设计、执行与缺陷跟踪；\n"
      "2. 参与需求评审，输出测试点拆分文档与测试报告；\n"
      "3. 配合研发定位线上问题，推动回归与验收；\n"
      "4. 持续完善测试流程与自动化覆盖率。\n\n"
      "任职要求：\n"
      "1. %s工作经验，熟悉软件测试方法与流程；\n"
      "2. 掌握 %s；\n"
      "3. 有完整项目从研发到线上运营的测试经验者优先；\n"
      "4. 责任心强，沟通顺畅，能承担一定强度的版本压力。") % (t, exp, "、".join(sk[:3]))

jobs=[]
for i in range(30):
    c = COMPANIES[i % len(COMPANIES)]
    city = random.choice(list(CITY))
    area = random.choice(CITY[city])
    biz = random.choice(BIZ[area])
    exp = random.choice(EXP); deg = random.choice(DEG)
    sk = random.sample(SKILLS, random.randint(2,4))
    jt = 1 if i % 11 == 0 else 0
    sal = "2-4K" if jt==1 else random.choice(SAL[:-1])
    jobs.append({
      "encryptJobId": "J%04d" % (i+1),
      "jobName": TITLES[i % len(TITLES)] + ("（兼职）" if jt else ""),
      "salaryDesc": sal,
      "jobLabels": [exp, deg],
      "jobExperience": exp,
      "jobDegree": deg,
      "cityName": city, "areaDistrict": area, "businessDistrict": biz,
      "jobType": jt,
      "skills": sk,
      "welfareList": random.sample(WELF, random.randint(4,7)),
      "postDescription": desc(TITLES[i % len(TITLES)], exp, sk),
      "jobAddress": "%s%s%s%s号院%s座%s层" % (city, area, biz, random.randint(1,88), random.choice("ABCDEF"), random.randint(3,26)),
      "bossName": random.choice(["聂女士","蒲女士","隋女士","郗先生","殳女士","仵先生","逄女士"]),
      "bossTitle": random.choice(["人事","招聘经理","HR","资源经理","技术负责人"]),
      "bossCert": 3, "bossOnline": random.random() < 0.6,
      "bossActiveTime": random.choice(["刚刚活跃","今日活跃","本周活跃"]),
      "encryptBrandId": "B%02d" % (i % len(COMPANIES) + 1),
      "brandName": c[0], "brandIndustry": c[1], "brandStageName": c[2], "brandScaleName": c[3],
    })

brands=[]
for i,c in enumerate(COMPANIES):
    brands.append({
      "encryptBrandId": "B%02d" % (i+1),
      "brandName": c[0], "brandIndustry": c[1], "brandStageName": c[2], "brandScaleName": c[3],
      "introduction": c[10],
      "businessInfo": {"公司名称": c[4], "法定代表人": c[5], "成立日期": c[6],
                       "企业类型": c[7], "经营状态": c[8], "注册资金": c[9]},
      "addresses": sorted({j["jobAddress"] for j in jobs if j["brandName"]==c[0]}),
    })

json.dump({"jobList": jobs}, open("data/jobs.json","w"), ensure_ascii=False, indent=1)
json.dump({"brandList": brands}, open("data/companies.json","w"), ensure_ascii=False, indent=1)
print(len(jobs), len(brands))
