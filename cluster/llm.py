"""批量调用 claude -p。所有要跑模型的步骤都走这里，不要各自再写一份驱动。

断点续跑：prompt 和响应按批次号落在 runs/<步骤>/<轮次>/ 下，重跑时已有的直接读回，
不会重复付费。想重跑某一轮，删掉那个目录即可。
"""
import json, os, re, subprocess, time
import concurrent.futures as cf

RUNS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs')


def _parse(text):
    m = re.search(r'\[.*\]', text or '', re.S)
    if not m:
        return None
    try:
        v = json.loads(m.group(0))
    except Exception:
        return None
    return v if isinstance(v, list) else None


def ask(step, tag, prompts, only=None, workers=4, tries=3, model='sonnet'):
    """prompts: list[str]，下标即批次号。返回等长的 list，每项是解析出的数组或 None。

    only: 只跑这些批次号（其余仍从磁盘读回），用于定向补跑。
    """
    d = f'{RUNS}/{step}/{tag}'
    os.makedirs(d, exist_ok=True)
    todo = []
    for i, p in enumerate(prompts):
        src, dst = f'{d}/b{i:03d}.txt', f'{d}/b{i:03d}.json'
        open(src, 'w').write(p)
        if os.path.exists(dst) and _parse(open(dst).read()) is not None:
            continue
        if only is None or i in only:
            todo.append(i)

    def one(i):
        for _ in range(tries):
            try:
                r = subprocess.run(['claude', '-p', '--model', model],
                                   stdin=open(f'{d}/b{i:03d}.txt'),
                                   capture_output=True, text=True, timeout=900)
            except subprocess.TimeoutExpired:
                continue
            if _parse(r.stdout) is not None:
                open(f'{d}/b{i:03d}.json', 'w').write(r.stdout)
                return i, 'ok'
            time.sleep(20)
        return i, 'FAIL'

    if todo:
        print(f'{step}/{tag}: {len(todo)} 批要跑（共 {len(prompts)}）', flush=True)
        t0 = time.time()
        done = 0
        with cf.ThreadPoolExecutor(max_workers=workers) as ex:
            for i, st in ex.map(one, todo):
                done += 1
                if st == 'FAIL' or done % 10 == 0:
                    print(f'  {done}/{len(todo)}  b{i:03d} {st}  {time.time()-t0:.0f}s', flush=True)
        print(f'{step}/{tag} 用时 {time.time()-t0:.0f}s', flush=True)
    else:
        print(f'{step}/{tag}: 全部命中缓存（{len(prompts)} 批）', flush=True)

    out = []
    for i in range(len(prompts)):
        f = f'{d}/b{i:03d}.json'
        out.append(_parse(open(f).read()) if os.path.exists(f) else None)
    return out


def by_id(arrays):
    """把各批次的数组按对象里的 id 字段摊平成 {全局编号: 对象}。"""
    o = {}
    for arr in arrays:
        for r in (arr or []):
            if isinstance(r, dict) and 'id' in r:
                try:
                    o[int(r['id'])] = r
                except (TypeError, ValueError):
                    pass
    return o


def batched(items, size):
    return [items[i:i+size] for i in range(0, len(items), size)]
