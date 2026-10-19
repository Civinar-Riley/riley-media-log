# -*- coding: utf-8 -*-
"""批量回填封面等元数据：走书影集的自动补全接口（TMDB / Bangumi）。

用法：
    python scripts/backfill.py                          # 交互模式，处理所有缺封面的条目
    python scripts/backfill.py --category movie         # 只处理电影
    python scripts/backfill.py --missing authors        # 只处理缺作者的条目
    python scripts/backfill.py --missing none --category movie --auto --overwrite
                                                        # 全部条目覆盖式回填（overwrite 会替换已有值）
    python scripts/backfill.py --undo data/backfill_report.json   # 撤回一次批量回填

说明：
- 每次应用在服务端都有快照（autofill_log），网页条目详情里可单独撤回；
  批量撤回用 --undo + 上次生成的报告文件
- 默认只填空字段，手填过的内容不会被覆盖；--overwrite 允许覆盖（配合报告可整批撤回）
- 自动模式只应用「标题完全一致」或「年份唯一命中」的候选；标题搜不到时会自动尝试
  变体（去季数序号、去空格、括号内别名、去英文副标题、零零七→007），最后不带年份兜底
- TMDB 在国内直连不通：打线上站点时本地需挂代理；打本地 dev 时 Worker 出网不受影响
"""
import argparse
import json
import os
import re
import sys
import time

from common import api, fetch_all_items, install_proxy, load_token

BASE = 'http://localhost:5173'
ALL_FIELDS = ['cover_url', 'year', 'regions', 'tags', 'directors', 'actors', 'authors', 'episode_count', 'external_rating']


def title_variants(title):
    """标题变体：库内标题常带季数后缀/括号别名，外部源搜不到时逐个尝试。
    例：帕丁顿熊1→帕丁顿熊；零零七：无暇赴死→007：无暇赴死；变种特攻（X战警）3→X战警3。"""
    seen, out = set(), []

    def add(v):
        v = v.strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)

    add(title)
    t = title.replace(' ', '').replace('\u3000', '')
    add(t)
    add(re.sub(r'\d+$', '', t))              # 去尾部序号
    if '零零七' in t:
        add(t.replace('零零七', '007'))
    m = re.search(r'[（(]([^）)]+)[）)]', t)
    if m:
        add(re.sub(r'[（(][^）)]*[）)]', '', t))   # 去括号段（全半角括号都算）
        # 主标题+括号整体替换为括号内别名：变种特攻（X战警）3 → X战警3
        add(re.sub(r'^[^（(]+[（(][^）)]*[）)]', m.group(1), t))
    latin = re.sub(r"\s*[A-Za-z][A-Za-z0-9\s'’：:-]*$", '', t)
    if re.search(r'[\u4e00-\u9fff]', latin):
        add(latin)                           # 去尾部英文副标题：死侍2：我爱我家Deadpool2 → 死侍2：我爱我家
    return out


SEASON_RE = re.compile(
    r'(?:第\s*[（(]?\s*(\d{1,3}|[零〇一二两三四五六七八九十百]+)\s*[）)]?\s*季)'
    r'|(?:\bseason\s*(\d{1,3})\b)',
    re.I,
)
PAREN_RE = re.compile(r'[（(【\[]\s*([^）)】\]]{1,16})\s*[）)】\]]')
QUALIFIER_HINT = re.compile(
    r'(?:版|语|配音|字幕|TV|剧场|电影|电视剧|动画|真人|普通话|粤语|国语|英语|日语|韩语|中配|日配|台配|原声)',
    re.I,
)
REGION_EXACT = re.compile(r'^(?:美|英|日|韩|港|台|中国|美国|英国|日本|韩国|香港|台湾|大陆|内地|中国大陆|中国香港|中国台湾)$')
YEAR_EXACT = re.compile(r'^\d{4}年?$')


def normalize_title(title):
    """和 Worker 端一致：去掉季号与（美版）这类括号说明，用于自动匹配。"""
    t = SEASON_RE.sub(' ', title)
    t = PAREN_RE.sub(
        lambda m: ' '
        if (QUALIFIER_HINT.search(m.group(1)) or REGION_EXACT.match(m.group(1).strip()) or YEAR_EXACT.match(m.group(1).strip()))
        else m.group(0),
        t,
    )
    t = re.sub(r'[（(【\[]\s*[）)】\]]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip().lower()


def api_safe(*args, **kwargs):
    """单条请求失败（网络抖动/网关 HTML）不中断整批。"""
    try:
        return api(*args, **kwargs)
    except RuntimeError as e:
        return 0, {'error': str(e)}


def main():
    parser = argparse.ArgumentParser(description='批量回填封面等元数据')
    parser.add_argument('--base', default=None, help='书影集地址（默认本地 dev；--undo 时默认用报告里的地址）')
    parser.add_argument('--token', default=None, help='API_TOKEN（默认读 .dev.vars）')
    parser.add_argument('--category', default=None, help='只处理某个类别 id（如 movie）')
    parser.add_argument('--missing', default='cover_url', help='只处理该字段为空的条目（默认 cover_url；none=不过滤，处理全部）')
    parser.add_argument('--source', default='auto', choices=['auto', 'tmdb', 'bangumi'], help='数据源（默认按类别自动）')
    parser.add_argument('--limit', type=int, default=0, help='最多处理多少条（0=不限）')
    parser.add_argument('--auto', action='store_true', help='自动模式：标题与年份全中的候选直接应用')
    parser.add_argument('--overwrite', action='store_true', help='允许覆盖已有值（默认只填空位；配合报告 --undo 可整批撤回）')
    parser.add_argument('--delay', type=float, default=1.0, help='每条之间的间隔秒数（对外部源友好）')
    parser.add_argument('--undo', metavar='REPORT', help='按回填报告撤回一次批量操作')
    parser.add_argument('--proxy', default=None, help='HTTP 代理（如 http://127.0.0.1:<你的代理端口>），访问 workers.dev 被墙时使用')
    args = parser.parse_args()

    install_proxy(args.proxy)

    token = args.token or load_token()
    if not token:
        print('找不到 API_TOKEN：请加 --token 或确认 .dev.vars 存在', file=sys.stderr)
        sys.exit(1)

    # 撤回模式
    if args.undo:
        report = json.load(open(args.undo, encoding='utf-8'))
        report_base = (report.get('base') or '').rstrip('/')
        explicit_base = (args.base or '').rstrip('/')
        if report_base:
            if explicit_base and explicit_base != report_base:
                print(f'报告生成于 {report_base}，与 --base {explicit_base} 不一致，拒绝撤回', file=sys.stderr)
                sys.exit(2)
            args.base = report_base
        else:
            args.base = explicit_base or BASE
        print(f'目标环境：{args.base}')

        entries = [e for e in report.get('applied', []) if isinstance(e.get('log_id'), int)]
        skipped = len(report.get('applied', [])) - len(entries)
        suffix = f'（跳过 {skipped} 条无 log_id 的记录）' if skipped else ''
        print(f'按报告撤回 {len(entries)} 条...{suffix}')
        ok = 0
        for e in entries:
            st, d = api_safe(args.base, token, '/api/autofill/undo', 'POST', {'log_id': e['log_id']})
            if st == 200:
                restored = d.get('restored', [])
                if restored:
                    ok += 1
                    print(f'  ✓ {e["title"]}（恢复 {len(restored)} 个字段）')
                else:
                    print(f'  - {e["title"]}：没有可恢复字段（可能已被手动修改）')
            else:
                print(f'  ✗ {e["title"]}：{d.get("error", "")}')
            time.sleep(0.3)
        print(f'撤回完成 {ok}/{len(entries)}')
        return

    args.base = (args.base or BASE).rstrip('/')
    print(f'目标环境：{args.base}')

    # 找出待处理条目（翻页取全；缺字段过滤在本地做）
    try:
        items = fetch_all_items(args.base, token, category=args.category)
    except RuntimeError as e:
        print(e, file=sys.stderr)
        sys.exit(1)
    if args.missing != 'none':
        items = [i for i in items if not (i.get(args.missing) or [])]
    if args.limit:
        items = items[: args.limit]
    if not items:
        print('没有符合条件（该字段为空）的条目，无事可做')
        return

    scope = '全部条目' if args.missing == 'none' else f'缺 {args.missing}'
    print(f'待处理 {len(items)} 条（{scope}），模式：{"自动" if args.auto else "交互"}\n')
    report = {
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'base': args.base,
        'missing': args.missing,
        'applied': [],
        'manual_review': [],
        'errors': [],
    }
    applied_count = 0
    ambiguous = 0

    for idx, it in enumerate(items, 1):
        title = it['title']
        prefix = f'[{idx}/{len(items)}] {title}'
        preview_body = {'item_id': it['id']}
        if args.source != 'auto':
            preview_body['source'] = args.source
        st, d = api_safe(args.base, token, '/api/autofill/preview', 'POST', preview_body)
        if st != 200:
            print(f'{prefix} → 跳过（{d.get("error", "搜索失败")}）')
            time.sleep(args.delay)
            continue
        candidates = d.get('candidates', [])
        used_query = None
        if not candidates:
            variants = title_variants(title)[1:]
            # 先按条目年份搜变体；再不带年份兜底（库内年份有出入时，带年份搜索会被过滤成零结果）
            attempts = [(v, False) for v in variants] + [(v, True) for v in [title] + variants]
            for vq, no_year in attempts:
                body = {**preview_body, 'query': vq}
                if no_year:
                    body['year'] = None
                st, d = api_safe(args.base, token, '/api/autofill/preview', 'POST', body)
                if st == 200 and d.get('candidates'):
                    candidates = d['candidates']
                    used_query = vq
                    break
            if not candidates:
                print(f'{prefix} → 无候选')
                time.sleep(args.delay)
                continue
            print(f'{prefix} → 经变体「{used_query}」{"（忽略年份）" if no_year else ""}命中 {len(candidates)} 个候选')

        chosen = None
        if args.auto:
            item_title = normalize_title(title)
            exact = [c for c in candidates if normalize_title(c['title']) == item_title]
            if it.get('year'):
                exact = [
                    c
                    for c in exact
                    if (c.get('seasonYear') or c.get('year')) == it['year']
                ]
            exact = list({c['externalId']: c for c in exact}.values())
            if len(exact) == 1:
                chosen = exact[0]
            else:
                ambiguous += 1
                print(f'{prefix} → 匹配不唯一（{len(candidates)} 个候选），记入待人工')
                report['manual_review'].append(
                    {'item_id': it['id'], 'title': title, 'candidates': candidates}
                )
                time.sleep(args.delay)
                continue
        else:
            print(f'\n{prefix}（{it.get("year") or "?"} · {it.get("category")}），候选：')
            for i, c in enumerate(candidates, 1):
                season = (
                    f' 第{c.get("seasonNumber")}季·{c["seasonEpisodeCount"]}集'
                    if c.get('seasonEpisodeCount')
                    else ''
                )
                print(f'  {i}. {c["title"]}（{c["year"] or "?"}）{season}★{c["rating"] or "?"}  {c["overview"][:40]}')
            ans = input('选择序号应用（回车跳过，q 退出）: ').strip()
            if ans.lower() == 'q':
                print('已中断')
                break
            if not ans.isdigit() or not (1 <= int(ans) <= len(candidates)):
                print('  跳过')
                time.sleep(args.delay)
                continue
            chosen = candidates[int(ans) - 1]

        st, d = api_safe(args.base, token, '/api/autofill/apply', 'POST', {
            'item_id': it['id'],
            'source': d.get('source') or 'tmdb',
            'external_id': chosen['externalId'],
            'fields': ALL_FIELDS,
            'overwrite': args.overwrite,
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
            report['errors'].append({'item_id': it['id'], 'title': title, 'error': d.get('error')})
        time.sleep(args.delay)

    os.makedirs('data', exist_ok=True)
    out = f'data/backfill_report_{time.strftime("%Y%m%d%H%M%S")}.json'
    json.dump(report, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n完成：应用 {applied_count} 条，待人工 {ambiguous} 条，失败 {len(report["errors"])} 条。报告已写入 {out}')
    print('批量撤回：python scripts/backfill.py --undo ' + out)
    if report['errors']:
        sys.exit(1)


if __name__ == '__main__':
    main()
