# -*- coding: utf-8 -*-
"""条目数据审计：批量改数据（如自动补全回填）前后做快照、对比、统计与补全流水查看。全部只读。

子命令：
    snapshot  把条目字段存成快照 JSON（改库前跑一次）
    diff      对比快照与当前值，打印变化的字段（改库后跑）
    stats     覆盖统计：各字段空值数量 + 随机抽查
    logs      某条目最近 10 次自动补全的快照流水（审计批量回填写了什么）

示例：
    python scripts/item_audit.py snapshot --category movie --out data/snap.json
    python scripts/item_audit.py diff data/snap.json
    python scripts/item_audit.py stats --category movie --sample 3
    python scripts/item_audit.py logs --item-id 123

网络：访问 workers.dev 国内直连不通，加 --proxy http://127.0.0.1:<你的代理端口>。
"""
import argparse
import json
import os
import random
import sys
import time

from common import api, fetch_all_items, install_proxy, load_token

# 快照默认记录的字段（数组/文本/数字混合，均为「自动补全可能触碰」的范围）
DEFAULT_FIELDS = [
    'cover_url', 'year', 'regions', 'tags', 'directors', 'actors', 'authors',
    'episode_count', 'external_rating', 'tmdb_id', 'bgm_id',
]
# stats 子命令报告空值数量的字段（可空列）
EMPTYABLE = ['cover_url', 'regions', 'tags', 'directors', 'actors', 'authors', 'episode_count', 'external_rating', 'tmdb_id', 'bgm_id']


def resolve_token(args):
    token = args.token or load_token()
    if not token:
        print('找不到 API_TOKEN：请加 --token 或确认 .dev.vars 存在', file=sys.stderr)
        sys.exit(1)
    return token


def fetch_items(args, token):
    try:
        return fetch_all_items(args.base, token, category=args.category)
    except RuntimeError as e:
        print(e, file=sys.stderr)
        sys.exit(1)


def cmd_snapshot(args):
    token = resolve_token(args)
    install_proxy(args.proxy)
    fields = [f.strip() for f in args.fields.split(',')] if args.fields else DEFAULT_FIELDS
    items = fetch_items(args, token)
    snap = {
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'base': args.base,
        'category': args.category,
        'fields': fields,
        'items': [
            {'id': i['id'], 'title': i['title'], 'year': i.get('year'), **{f: i.get(f) for f in fields}}
            for i in items
        ],
    }
    out = args.out or f'data/audit_snapshot_{time.strftime("%Y%m%d%H%M%S")}.json'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    json.dump(snap, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'快照 {len(items)} 条 × {len(fields)} 字段 → {out}')
    print(f'改库后运行对比：python scripts/item_audit.py diff {out}')


def cmd_diff(args):
    token = resolve_token(args)
    install_proxy(args.proxy)
    snap = json.load(open(args.snapshot, encoding='utf-8'))
    if args.base != snap.get('base'):
        print(f'提示：快照来自 {snap.get("base")}，当前对比 {args.base}')
    args.category = args.category or snap.get('category')
    items = fetch_items(args, token)
    cur = {i['id']: i for i in items}
    changed = 0
    for s in snap['items']:
        i = cur.get(s['id'])
        if not i:
            print(f'- {s["id"]} {s["title"]}：条目已不存在')
            continue
        diffs = [(f, s.get(f), i.get(f)) for f in snap['fields'] if s.get(f) != i.get(f)]
        if not diffs:
            continue
        changed += 1
        print(f'~ {s["id"]} {s["title"]}')
        for f, old, new in diffs:
            print(f'    {f}: {old}  →  {new}')
    added = len([i for i in items if i['id'] not in {s['id'] for s in snap['items']}])
    print(f'\n共 {changed}/{len(snap["items"])} 条有变化' + (f'，快照后新增 {added} 条' if added else ''))


def cmd_stats(args):
    token = resolve_token(args)
    install_proxy(args.proxy)
    items = fetch_items(args, token)
    scope = f'（类别 {args.category}）' if args.category else ''
    print(f'共 {len(items)} 条{scope}')
    for f in EMPTYABLE:
        n = sum(1 for i in items if not (i.get(f) or []))
        print(f'  缺 {f}: {n}')
    for i in random.sample(items, min(args.sample, len(items))):
        people_key = 'directors' if i.get('directors') else 'authors'
        people = '/'.join((i.get(people_key) or [])[:2]) or '—'
        print(f"  抽查 [{i['id']}] {i['title']}（{i.get('year') or '?'}）｜"
              f"{'导演' if people_key == 'directors' else '作者'} {people}｜"
              f"标签 {'/'.join((i.get('tags') or [])[:4]) or '—'}｜外部评分 {i.get('external_rating')}")


def cmd_logs(args):
    token = resolve_token(args)
    install_proxy(args.proxy)
    st, logs = api(args.base, token, f'/api/autofill/logs?item_id={args.item_id}')
    if st != 200:
        print(f'获取失败: {logs}', file=sys.stderr)
        sys.exit(1)
    if not logs:
        print(f'条目 {args.item_id} 没有自动补全记录')
        return
    for l in logs:
        undone = '（已撤回）' if l.get('undone_at') else ''
        print(f"log {l['id']}｜{l['applied_at']}｜{l['source']}｜external_id={l['external_id']}{undone}")
        for f, v in json.loads(l['fields']).items():
            print(f'    {f}: {v.get("before")}  →  {v.get("after")}')


def main():
    parser = argparse.ArgumentParser(description='条目数据审计（快照/对比/统计/补全流水），全部只读')
    sub = parser.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('snapshot', help='把条目字段存成快照 JSON（改库前跑）')
    p.add_argument('--category', default=None, help='只快照某个类别 id（如 movie）')
    p.add_argument('--fields', default=None, help='逗号分隔的字段清单（默认内置一组）')
    p.add_argument('--out', default=None, help='输出文件（默认 data/audit_snapshot_时间戳.json）')
    add_common(p)
    p.set_defaults(func=cmd_snapshot)

    p = sub.add_parser('diff', help='对比快照与当前值，打印变化的字段')
    p.add_argument('snapshot', help='snapshot 子命令生成的 JSON 文件')
    p.add_argument('--category', default=None, help='只对比某个类别（默认用快照里记录的类别）')
    add_common(p)
    p.set_defaults(func=cmd_diff)

    p = sub.add_parser('stats', help='覆盖统计：各字段空值数量 + 随机抽查')
    p.add_argument('--category', default=None, help='只统计某个类别 id（如 movie）')
    p.add_argument('--sample', type=int, default=0, help='随机抽查多少条（0=不抽查）')
    add_common(p)
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser('logs', help='某条目最近 10 次自动补全的快照流水')
    p.add_argument('--item-id', type=int, required=True, help='条目 id')
    add_common(p)
    p.set_defaults(func=cmd_logs)

    args = parser.parse_args()
    args.func(args)


def add_common(p):
    p.add_argument('--base', default='http://localhost:5173', help='书影集地址（默认本地 dev）')
    p.add_argument('--token', default=None, help='API_TOKEN（默认读 .dev.vars）')
    p.add_argument('--proxy', default=None, help='HTTP 代理（如 http://127.0.0.1:<你的代理端口>）')


if __name__ == '__main__':
    main()
