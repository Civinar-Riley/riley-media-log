# -*- coding: utf-8 -*-
"""把自己的资料导入书影集（JSON 格式，除标题外所有字段都可以不填）。

用法：
    python scripts/import_json.py --input 我的资料.json                # 导入本地 dev
    python scripts/import_json.py --input 我的资料.json \
        --base https://你的站点 --token xxx --allow-remote [--proxy http://127.0.0.1:<端口>]

JSON 格式见 docs/import-template.json：顶层可以是数组，也可以是 {"items": [...]}。
每项只有 title 必填；以下字段支持中文写法（也接受英文 id）：
    类别 category：电影/剧集/动漫/综艺/小说/漫画（不填默认按电影处理）
    状态 status：想看（默认）/在看/看过/弃了
    完结 finish_status：完结/连载/烂尾（小说漫画用）
缺的字段以后可以在网页上对条目点「自动补全」补齐。

默认按「标题+年份+类别」查重：目标库里已存在的条目会跳过（--allow-duplicates 可强制全部导入）。
"""
import argparse
import json
import sys

from common import api, fetch_all_items, install_proxy, is_local, load_token

CATEGORY_ZH = {'电影': 'movie', '剧集': 'series', '动漫': 'anime', '综艺': 'variety', '小说': 'novel', '漫画': 'manga'}
STATUS_ZH = {'想看': 'want', '在看': 'watching', '看过': 'done', '弃了': 'dropped'}
FINISH_ZH = {'完结': 'finished', '连载': 'ongoing', '烂尾': 'ruined'}
# 透传给 API 的字段（title/category/status 单独处理）
PASS_FIELDS = [
    'year', 'season', 'regions', 'tags', 'authors', 'directors', 'actors',
    'progress', 'episode_count', 'rating', 'cover_url', 'channel', 'finish_status', 'notes', 'review',
]
NUM_FIELDS = ('year', 'season', 'episode_count', 'rating')


def main():
    parser = argparse.ArgumentParser(description='把 JSON 资料导入书影集')
    parser.add_argument('--input', required=True, help='JSON 文件路径（模板见 docs/import-template.json）')
    parser.add_argument('--base', default='http://localhost:5173', help='目标地址（默认本地 dev）')
    parser.add_argument('--token', default=None, help='API_TOKEN（默认读 .dev.vars）')
    parser.add_argument('--allow-remote', action='store_true', help='允许对非本地地址执行（会真实写数据！）')
    parser.add_argument('--proxy', default=None, help='HTTP 代理（如 http://127.0.0.1:<你的代理端口>）')
    parser.add_argument('--allow-duplicates', action='store_true', help='不查重，全部导入')
    args = parser.parse_args()

    base = args.base.rstrip('/')
    if not is_local(base) and not args.allow_remote:
        print(f'拒绝执行：目标 {base} 不是本地环境。导入会真实写入，确认请显式加 --allow-remote')
        sys.exit(2)
    print(f'目标环境：{base}' + ('' if is_local(base) else '（远程，真实写入！）'))
    install_proxy(args.proxy)

    token = args.token or load_token()
    if not token:
        print('找不到 API_TOKEN：请加 --token 或确认 .dev.vars 存在', file=sys.stderr)
        sys.exit(1)

    try:
        data = json.load(open(args.input, encoding='utf-8'))
    except Exception as e:
        print(f'读不了 JSON 文件：{e}', file=sys.stderr)
        sys.exit(1)
    rows = data.get('items') if isinstance(data, dict) else data
    if not isinstance(rows, list) or not rows:
        print('JSON 里没找到条目：顶层应为数组，或 {"items": [...]}', file=sys.stderr)
        sys.exit(1)

    existing = set()
    if not args.allow_duplicates:
        try:
            for i in fetch_all_items(base, token):
                existing.add((i['title'], i.get('year'), i.get('category')))
        except RuntimeError as e:
            print(e, file=sys.stderr)
            sys.exit(1)

    created, skipped, failed = 0, 0, []
    for n, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            failed.append((n, '不是对象'))
            continue
        title = str(row.get('title') or '').strip()
        if not title:
            failed.append((n, '缺少标题'))
            continue
        category = str(row.get('category') or 'movie').strip()
        category = CATEGORY_ZH.get(category, category)
        status = str(row.get('status') or 'want').strip()
        status = STATUS_ZH.get(status, status)

        body = {'title': title, 'category': category, 'status': status}
        for f in PASS_FIELDS:
            if f not in row or row[f] in (None, ''):
                continue
            v = row[f]
            if f == 'finish_status':
                v = FINISH_ZH.get(str(v).strip(), v)
            if f in NUM_FIELDS and isinstance(v, str) and v.strip().isdigit():
                v = int(v.strip())
            body[f] = v

        key = (title, body.get('year'), category)
        if not args.allow_duplicates and key in existing:
            skipped += 1
            continue
        st, d = api(base, token, '/api/items', 'POST', body)
        if st == 201:
            created += 1
            existing.add(key)
        else:
            err = d.get('error') if isinstance(d, dict) else d
            failed.append((n, f'{title}: {err}'))
        if n % 100 == 0:
            print(f'  …已处理 {n}/{len(rows)}')

    print(f'\n完成：导入 {created} 条，跳过（已存在）{skipped} 条，失败 {len(failed)} 条')
    for n, why in failed[:10]:
        print(f'  失败 #{n}: {why}')


if __name__ == '__main__':
    main()
