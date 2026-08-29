"""把 G2 的完整品类树折成一份两级菜单。

一级是 38 个顶层分组，二级是分组内的品类。2238 个叶子品类里有大量是同一形态的细分
（3D Design 下面的 modeling / painting / rendering，界面骨架同一套），这些折进父类；
但 G2 在垂直行业那一支的"父类"是**行业**不是软件形态 —— Health Care 底下挂着 85 个
从门诊排班到捆绑支付管理的品类，界面毫无共同之处，折了就废了。

所以按子孙数设闸：≤ FOLD 的父类折掉，> FOLD 的展开子品类，再对子品类递归同样的判断。

不管折不折，`ROLLUP` 都保留每个叶子品类到菜单项的完整映射 —— 折叠只决定菜单里摆什么，
不影响事后还能不能拆回细粒度。
"""
import json, collections

FOLD = 5

_cats = json.load(open('g2_categories.json'))
_tree = json.load(open('g2_tree.json'))
_name2slug = {v: k for k, v in _cats.items()}

# slug -> 父类 slug（None 表示直接挂在分组下）；slug -> 所属分组
_parent, _section = {}, {}
for _sec, _pp in _tree.items():
    for _par, _slugs in _pp.items():
        _p = None if _par == _sec else _name2slug.get(_par)
        for _s in _slugs:
            _parent[_s], _section[_s] = _p, _sec

_children = collections.defaultdict(list)
_roots = collections.defaultdict(list)
for _s, _p in _parent.items():
    (_children[_p] if _p else _roots[_section[_s]]).append(_s)


def _descendants(s):
    out = []
    stack = list(_children.get(s, []))
    while stack:
        x = stack.pop()
        if x == s:
            continue
        out.append(x)
        stack += _children.get(x, [])
    return out


SECTIONS = list(_tree)
LEVEL2 = {}          # 分组 -> 菜单里摆的品类 slug
ROLLUP = {}          # 任意品类 slug -> 它在菜单里对应的那一项

for sec in SECTIONS:
    menu, stack = [], list(_roots[sec])
    while stack:
        s = stack.pop(0)
        menu.append(s)
        kids = _descendants(s)
        if len(kids) <= FOLD:
            ROLLUP[s] = s
            for k in kids:
                ROLLUP[k] = s
        else:
            ROLLUP[s] = s
            stack += [k for k in _children.get(s, []) if k != s]
    LEVEL2[sec] = menu

NAME = _cats


def menu_text(sec):
    return '\n'.join(f'{s} | {NAME[s]}' for s in LEVEL2[sec])


def sections_text(n=7):
    """一级菜单：分组名 + 几个组内品类当提示，光给分组名模型猜不出里面装什么。"""
    out = []
    for sec in SECTIONS:
        v = LEVEL2[sec]
        step = max(1, len(v) // n)          # 均匀取样，不然大分组只看得到 A 开头的
        eg = ', '.join(NAME[s].replace(' Software', '').replace(' Providers', '')
                       for s in v[::step][:n])
        out.append(f'{sec} —— {eg}…')
    return '\n'.join(out)


if __name__ == '__main__':
    n = sum(len(v) for v in LEVEL2.values())
    print(f'一级 {len(SECTIONS)} 个分组，二级共 {n} 项（原 {len(_cats)} 个品类）')
    print(f'ROLLUP 覆盖 {len(ROLLUP)}/{len(_cats)}')
    print('\n每分组的二级项数与菜单字符数:')
    for sec in sorted(SECTIONS, key=lambda s: -len(LEVEL2[s])):
        t = menu_text(sec)
        print(f'  {len(LEVEL2[sec]):4d} 项  {len(t):6,} 字符  {sec}')
