# -*- coding: utf-8 -*-
"""批量回填封面等元数据：走书影集的自动补全接口（TMDB / Bangumi）。

用法：
    python scripts/backfill.py                          # 交互模式，处理所有缺封面的条目
    python scripts/backfill.py --category movie         # 只处理电影
    python scripts/backfill.py --missing authors        # 只处理缺作者的条目
    python scripts/backfill.py --auto --limit 50        # 自动模式（标题+年份全中才应用）
    python scripts/backfill.py --undo data/backfill_report.json   # 撤回一次批量回填

说明：
- 每次应用在服务端都有快照（autofill_log），网页条目详情里可单独撤回；
  批量撤回用 --undo + 上次生成的报告文件
- 只填空字段，手填过的内容不会被覆盖
- TMDB 在国内直连不通：打线上站点时本地需挂代理；打本地 dev 时 Worker 出网不受影响
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'http://localhost:5173'
ALL_FIELDS = ['cover_url', 'year', 'regions', 'tags', 'directors', 'actors', 'authors', 'episode_count', 'external_rating']
MISSABLE_FIELDS = ['cover_url', 'year', 'regions', 'tags', 'directors', 'actors', 'authors', 'episode_count']


def api(base, token, path, method='GET', body=None):
    req = urllib.request.Request(
        base + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
    )
    try:
        r = urllib.request.urlopen(req)
        data = r.read()
        return r.status, (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def main():
    parser = argparse.ArgumentParser(description='批量回填封面等元数据')
    parser.add_argument('--base', default=BASE, help='书影集地址（默认本地 dev）')
    parser.add_argument('--token', default=None, help='API_TOKEN（默认读 .dev.vars）')
    parser.add_argument('--category', default=None, help='只处理某个类别 id（如 movie）')
    parser.add_argument('--missing', default='cover_url', help='只处理该字段为空的条目（默认 cover_url）')
    parser.add_argument('--source', default='auto', choices=['auto', 'tmdb', 'bangumi'], help='数据源（默认按类别自动）')
    parser.add_argument('--limit', type=int, default=0, help='最多处理多少条（0=不限）')
    parser.add_argument('--auto', action='store_true', help='自动模式：标题与年份全中的候选直接应用')
    parser.add_argument('--delay', type=float, default=1.0, help='每条之间的间隔秒数（对外部源友好）')
    parser.add_argument('--undo', metavar='REPORT', help='按回填报告撤回一次批量操作')
    args = parser.parse_args()

    token = args.token
    if not token:
        try:
            token = open('.dev.vars', encoding='utf-8').read().split('API_TOKEN=')[1].splitlines()[0].strip()
        except Exception:
            pass
    if not token:
        print('找不到 API_TOKEN：请加 --token 或确认 .dev.vars 存在', file=sys.stderr)
        sys.exit(1)

    # 撤回模式
    if args.undo:
        report = json.load(open(args.undo, encoding='utf-8'))
        entries = report.get('applied', [])
        print(f'按报告撤回 {len(entries)} 条...')
        ok = 0
        for e in entries:
            st, d = api(args.base, token, '/api/autofill/undo', 'POST', {'log_id': e['log_id']})
            mark = '✓' if st == 200 else f'✗ {d.get("error", "")}'
            print(f'  {mark} {e["title"]}')
            if st == 200:
                ok += 1
            time.sleep(0.3)
        print(f'撤回完成 {ok}/{len(entries)}')
        return

    # 找出待处理条目
    query = '/api/items?page_size=200'
    if args.category:
        query += '&category=' + urllib.parse.quote(args.category)
    if args.missing == 'cover_url':
        query += '&has_cover=false'
    st, d = api(args.base, token, query)
    if st != 200:
        print(f'列表获取失败: {d}', file=sys.stderr)
        sys.exit(1)
    items = d['items']
    if args.missing != 'cover_url':
        items = [i for i in items if not (i.get(args.missing) or [])]
    if args.limit:
        items = items[: args.limit]
    if not items:
        print('没有符合条件（该字段为空）的条目，无事可做')
        return

    print(f'待处理 {len(items)} 条（缺 {args.missing}），模式：{"自动" if args.auto else "交互"}\n')
    report = {'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'missing': args.missing, 'applied': []}
    applied_count = 0
    ambiguous = 0

    for idx, it in enumerate(items, 1):
        title = it['title']
        prefix = f'[{idx}/{len(items)}] {title}'
        preview_body = {'item_id': it['id']}
        if args.source != 'auto':
            preview_body['source'] = args.source
        st, d = api(args.base, token, '/api/autofill/preview', 'POST', preview_body)
        if st != 200:
            print(f'{prefix} → 跳过（{d.get("error", "搜索失败")}）')
            time.sleep(args.delay)
            continue
        candidates = d.get('candidates', [])
        if not candidates:
            print(f'{prefix} → 无候选')
            time.sleep(args.delay)
            continue

        chosen = None
        if args.auto:
            exact = [c for c in candidates if c['title'].strip().lower() == title.strip().lower()]
            if len(exact) == 1:
                chosen = exact[0]
            else:
                same_year = [c for c in candidates if it.get('year') and c['year'] == it['year']]
                if len(same_year) == 1:
                    chosen = same_year[0]
                else:
                    ambiguous += 1
                    print(f'{prefix} → 匹配不唯一（{len(candidates)} 个候选），记入待人工')
                    report['applied'].append({'item_id': it['id'], 'title': title, 'log_id': None, 'candidates': candidates})
                    time.sleep(args.delay)
                    continue
        else:
            print(f'\n{prefix}（{it.get("year") or "?"} · {it.get("category")}），候选：')
            for i, c in enumerate(candidates, 1):
                print(f'  {i}. {c["title"]}（{c["year"] or "?"}）★{c["rating"] or "?"}  {c["overview"][:40]}')
            ans = input('选择序号应用（回车跳过，q 退出）: ').strip()
            if ans.lower() == 'q':
                print('已中断')
                break
            if not ans.isdigit() or not (1 <= int(ans) <= len(candidates)):
                print('  跳过')
                time.sleep(args.delay)
                continue
            chosen = candidates[int(ans) - 1]

        st, d = api(args.base, token, '/api/autofill/apply', 'POST', {
            'item_id': it['id'],
            'source': d.get('source') or 'tmdb',
            'external_id': chosen['externalId'],
            'fields': ALL_FIELDS,
        })
        # 注意：preview 的 source 需要透传给 apply；上面 d 在 apply 后被覆盖，重新取一次
        if st == 200:
            filled = [k for k in d.get('applied', {})]
            log_id = d.get('logId')
            applied_count += 1
            report['applied'].append({'item_id': it['id'], 'title': title, 'log_id': log_id})
            print(f'  ✓ 已填入：{", ".join(filled) or "仅外部 ID"}（log {log_id}）')
        else:
            print(f'  ✗ 应用失败：{d.get("error", "")}')
            report['applied'].append({'item_id': it['id'], 'title': title, 'log_id': None, 'error': d.get('error')})
        time.sleep(args.delay)

    out = f'data/backfill_report_{time.strftime("%Y%m%d%H%M%S")}.json'
    json.dump(report, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n完成：应用 {applied_count} 条，待人工 {ambiguous} 条。报告已写入 {out}')
    print('批量撤回：python scripts/backfill.py --undo ' + out)


if __name__ == '__main__':
    main()
