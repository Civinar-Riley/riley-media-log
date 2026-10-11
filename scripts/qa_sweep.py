# -*- coding: utf-8 -*-
"""书影集 API 全量回归测试（针对本仓库作者的数据集，本地 dev 环境运行）

用法：npm run dev 起着，然后 python scripts/qa_sweep.py
依赖 .dev.vars 里的 API_TOKEN；预期条目数以作者导入的 2013 条为基准。
脚本会创建临时条目/清单/别名并自动清理，不碰真实数据。
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = 'http://localhost:5173'
TOKEN = open('.dev.vars', encoding='utf-8').read().split('API_TOKEN=')[1].splitlines()[0].strip()
PASS, FAIL = 0, []


def check(name, cond, extra=''):
    global PASS
    if cond:
        PASS += 1
        print(f'  ok  {name}')
    else:
        FAIL.append(f'{name} {extra}')
        print(f'  FAIL {name} {extra}')


def api(path, method='GET', body=None, token=TOKEN, raw=False):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})},
    )
    try:
        r = urllib.request.urlopen(req)
        data = r.read()
        if raw:
            return r, data
        return r.status, (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


print('== 认证 ==')
st, _ = api('/api/items', token=None)
check('未带令牌访问被拒 401', st == 401, st)
st, _ = api('/api/auth/login', 'POST', {'password': 'wrong-password-xyz'})
check('错误密码登录被拒 401', st == 401, st)
st, d = api('/api/auth/status', token=None)
check('状态接口未登录返回 false', st == 200 and d['authenticated'] is False, d)

print('== 列表 / 排序 / 分页 ==')
st, d = api('/api/items?page=1&page_size=1')
check('默认列表 2013 条', st == 200 and d['total'] == 2013, d.get('total'))
firsts = {}
for s in ['created_at', 'updated_at', 'title', 'year', 'rating', 'watched']:
    for o in ['asc', 'desc']:
        _, d = api(f'/api/items?sort={s}&order={o}&page_size=1')
        firsts[(s, o)] = d['items'][0]['id']
for s in ['created_at', 'updated_at', 'title', 'year', 'rating']:
    check(f'排序 {s} 升降序结果不同', firsts[(s, 'asc')] != firsts[(s, 'desc')], firsts[(s, 'asc')])
st, _ = api('/api/items?sort=INVALID&order=x')
check('非法排序参数不报错', st == 200)
st, d = api('/api/items?page=9999&page_size=10')
check('超范围页码返回空', st == 200 and d['items'] == [])
st, d = api('/api/items?page_size=9999')
check('page_size 收敛到 200', d['page_size'] == 200, d['page_size'])

print('== 筛选 ==')
_, d = api('/api/items?category=movie&page_size=1'); check('类别筛选 649', d['total'] == 649, d['total'])
_, d = api('/api/items?status=watching&page_size=1'); check('状态筛选 43', d['total'] == 43, d['total'])
_, d = api('/api/items?q=manchang&page_size=5')
check('拼音搜索命中《漫长的季节》', d['total'] >= 1 and any('漫长' in i['title'] for i in d['items']))
st, _ = api('/api/items?q=' + urllib.parse.quote('%_特殊字符'))
check('搜索特殊字符不炸', st == 200, st)
_, d = api('/api/items?tags=' + urllib.parse.quote('剧情片') + '&tag_mode=any&page_size=1')
check('标签任一匹配', d['total'] > 0, d['total'])
_, d = api('/api/items?tags=' + urllib.parse.quote('剧情片,悬疑') + '&tag_mode=all&page_size=1')
check('标签全部匹配 AND', 0 < d['total'] <= 704, d['total'])
_, d = api('/api/items?year_min=2020&year_max=2024&page_size=1')
check('年份区间', st == 200 and d['total'] > 0, d['total'])
_, d = api('/api/items?finish_status=finished&page_size=1')
check('完结状态筛选', d['total'] > 0, d['total'])
_, d = api('/api/items?authors=' + urllib.parse.quote('远瞳') + '&author_mode=any&page_size=1')
check('作者筛选 远瞳 3 条', d['total'] == 3, d['total'])

print('== 临时数据 CRUD（别名/人员/AND）==')
_, settings0 = api('/api/settings')
aliases_before = settings0['aliases']
api('/api/settings/aliases', 'PUT', {'aliases': {**aliases_before, '测试英文名': '测试主名'}})
st, it = api('/api/items', 'POST', {
    'title': 'QA测试条目A', 'category': 'movie', 'status': 'want',
    'authors': [], 'directors': ['测试英文名'], 'actors': ['演员甲', '演员乙'],
    'tags': ['QA标签1', 'QA标签2'],
})
check('新建条目 201', st == 201, st)
iid = it['id']
check('别名保存自动归一', it['directors'] == ['测试主名'], it['directors'])
_, d = api('/api/items?actors=' + urllib.parse.quote('演员甲,演员乙') + '&actor_mode=all&page_size=10')
check('主演 AND 命中', any(i['id'] == iid for i in d['items']), d['total'])
_, d = api('/api/items?actors=' + urllib.parse.quote('演员甲,不存在演员') + '&actor_mode=all')
check('主演 AND 排除', all(i['id'] != iid for i in d['items']))
_, before = api(f'/api/items/{iid}')
n0 = len(before['activity'])
st, _ = api(f'/api/items/{iid}', 'PUT', {'directors': ['测试主名']})
check('同值更新成功(别名表存在时 PUT 不炸)', st == 200, st)
_, after = api(f'/api/items/{iid}')
check('同值更新不记动态', len(after['activity']) == n0, (n0, len(after['activity'])))
st, _ = api(f'/api/items/{iid}', 'PUT', {'status': 'done', 'rating': 5})
check('状态/评分更新成功', st == 200, st)
_, after = api(f'/api/items/{iid}')
kinds = [a['action'] for a in after['activity']]
check('状态/评分变更记动态', 'status_changed' in kinds and 'rating_changed' in kinds, kinds)
st, v = api(f'/api/items/{iid}/viewings', 'POST', {'watched_on': '2026-10-11', 'comment': 'QA观看'})
check('添加观看流水', st == 201, st)
_, d = api('/api/items?watched_from=2026-10-01&watched_to=2026-10-31&page_size=10')
check('观看日期区间命中新流水', any(i['id'] == iid for i in d['items']), d['total'])
st, _ = api(f'/api/items/{iid}/viewings/{v["id"]}', 'DELETE')
check('删除观看流水', st == 200, st)
st, d = api('/api/items/random?tags=' + urllib.parse.quote('QA标签1'))
check('随机命中筛选条件', st == 200 and d['id'] == iid, d)
st, _ = api('/api/items/random?tags=' + urllib.parse.quote('绝对不存在的标签xyz'))
check('随机无结果 404', st == 404, st)

print('== 清单 ==')
_, lst = api('/api/lists', 'POST', {'name': 'QA清单', 'description': '测试'})
lid = lst['id']
api(f'/api/lists/{lid}/items', 'POST', {'item_ids': [iid]})
_, d = api(f'/api/lists/{lid}')
check('清单加入条目', any(i['id'] == iid for i in d['items']), len(d['items']))
_, d = api(f'/api/items?list_id={lid}&page_size=5')
check('按清单筛选', d['total'] == 1, d['total'])
api(f'/api/lists/{lid}/items/{iid}', 'DELETE')
_, d = api(f'/api/lists/{lid}')
check('清单移除条目', d['items'] == [])
st, _ = api(f'/api/lists/{lid}', 'DELETE')
check('删除清单', st == 200, st)

print('== 字段管理 ==')
_, vals = api('/api/fields/values?field=actors')
check('演员字段取值可见', any(v[0] == '演员甲' for v in vals), vals[:3])
st, d = api('/api/fields/rename?field=actors', 'POST', {'from': '演员甲', 'to': '演员乙'})
check('演员改名合并', st == 200 and d['updated'] == 1, d)
_, it2 = api(f'/api/items/{iid}')
check('合并后自动去重', it2['actors'] == ['演员乙'], it2['actors'])
st, _ = api('/api/fields/values?field=' + urllib.parse.quote('不存在'))
check('非法字段名 400', st == 400, st)

print('== 设置 ==')
_, d = api('/api/settings')
check('设置含类别与别名', 'categories' in d and 'aliases' in d)
cats = d['categories']
movie = [c for c in cats if c['id'] == 'movie'][0]
st, _ = api('/api/settings/categories', 'PUT', {'categories': cats + [movie]})
check('重复类别被拒 400', st == 400, st)
st, _ = api('/api/settings/aliases', 'PUT', {'aliases': {'环A': '环B', '环B': '环A'}})
check('别名成环被拒 400', st == 400, st)
st, _ = api('/api/settings/aliases', 'PUT', {'aliases': {'自指': '自指'}})
check('别名自指被拒 400', st == 400, st)
st, d = api('/api/settings/aliases/normalize', 'POST')
check('一键归一可执行', st == 200 and 'updated' in d, d)

print('== 统计 / 导出 ==')
_, s = api('/api/stats')
check('统计三榜齐全', all(k in s for k in ['by_author', 'by_director', 'by_actor']))
check('KPI 总数含临时条目', s['kpi']['total'] == 2014, s['kpi'])
check('未评分统计正确(修复验证)', s['unrated'] >= 2013, s['unrated'])
r, csv = api('/api/export.csv', raw=True)
text = csv.decode('utf-8-sig')
lines = [l for l in text.split('\r\n') if l.strip()]
check('CSV 带 BOM', csv[:3] == b'\xef\xbb\xbf')
check('CSV 表头 21 列', len(lines[0].split(',')) == 21, len(lines[0].split(',')))
check('CSV 行数一致', len(lines) - 1 == 2014, len(lines))
r, js = api('/api/export.json', raw=True)
check('JSON 导出数量一致', json.loads(js)['count'] == 2014)
r, csv2 = api('/api/export.csv?category=movie', raw=True)
lines2 = [l for l in csv2.decode('utf-8-sig').split('\r\n') if l.strip()]
check('导出尊重筛选(电影 650)', len(lines2) - 1 == 650, len(lines2) - 1)

print('== 清理 ==')
api(f'/api/items/{iid}', 'DELETE')
api('/api/settings/aliases', 'PUT', {'aliases': aliases_before})
_, d = api('/api/items?q=' + urllib.parse.quote('QA测试'))
check('临时条目已清理', d['total'] == 0, d['total'])
_, d = api('/api/items?actors=' + urllib.parse.quote('演员乙'))
check('临时演员已清理', d['total'] == 0, d['total'])

print(f'\n通过 {PASS} 项，失败 {len(FAIL)} 项')
for f in FAIL:
    print('  FAIL:', f)
sys.exit(1 if FAIL else 0)
