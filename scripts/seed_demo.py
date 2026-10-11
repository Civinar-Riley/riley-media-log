# -*- coding: utf-8 -*-
"""灌入演示数据（全部为虚构片名与人名），用于截图或本地体验。

用法：先 npm run dev，再 python scripts/seed_demo.py
提示：做演示截图时建议用独立数据库——把 wrangler.jsonc 的 database_id 临时改成
      "demo-screenshots"，重启 dev 并 npm run db:migrate:local 后再运行本脚本，
      这样不会污染真实数据（真实库的本地文件按原 database_id 保存，改回即恢复）。
"""
import json
import sys
import urllib.error
import urllib.request

BASE = 'http://localhost:5173'
TOKEN = open('.dev.vars', encoding='utf-8').read().split('API_TOKEN=')[1].splitlines()[0].strip()


def api(path, method='GET', body=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN},
    )
    try:
        r = urllib.request.urlopen(req)
        data = r.read()
        return r.status, (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


# title, category, year, regions, tags, directors, actors, authors, status, rating, channel, progress, finish, notes, review
ITEMS = [
    ('星际信使', 'movie', 2021, ['美国'], ['科幻', '冒险'], ['林远舟'], ['沈明川', '赵屿'], [], 'done', 5, '影院', '', None, '', '视效和配乐都在线，结尾二十分钟封神。'),
    ('雾港疑云', 'movie', 2019, ['英国'], ['悬疑', '犯罪'], ['Ewan Blackwood'], ['沈明川'], [], 'done', 4, '网盘', '', None, '', ''),
    ('夏日协奏曲', 'movie', 2023, ['日本'], ['剧情', '音乐'], ['宫岛凉'], ['藤井澪'], [], 'done', 5, '影院', '', None, '', '夏天该有的样子。'),
    ('钢铁黎明', 'movie', 2016, ['美国'], ['动作', '科幻'], ['Marcus Hale'], ['赵屿', '沈明川'], [], 'done', 3, 'Netflix', '', None, '', ''),
    ('山雀', 'movie', 2020, ['中国大陆'], ['剧情', '家庭'], ['顾长川'], ['李知遥'], [], 'done', 5, '影院', '', None, '', '小而美，看完想给家里打电话。'),
    ('迷失布拉格', 'movie', 2018, ['捷克'], ['悬疑'], ['Petr Novák'], ['沈明川'], [], 'done', 4, '网盘', '', None, '', ''),
    ('环形旅馆', 'movie', 2024, ['中国大陆'], ['悬疑', '科幻'], ['顾长川'], ['李知遥', '沈明川'], [], 'watching', None, '影院', '看到一半', None, '', ''),
    ('咖啡与烟草', 'movie', 2015, ['法国'], ['剧情'], ['Amélie Rousseau'], ['赵屿'], [], 'done', 4, '网盘', '', None, '', ''),
    ('深空回声', 'movie', 2022, ['美国'], ['科幻'], ['Marcus Hale'], ['赵屿'], [], 'want', None, '', '', None, '预告片很带感', ''),
    ('海上钢琴课', 'movie', 2008, ['意大利'], ['剧情', '音乐'], ['Giulia Conti'], ['沈明川'], [], 'done', 5, '网盘', '', None, '', '每年重看一遍。'),
    ('午夜列车', 'movie', 2017, ['韩国'], ['惊悚'], ['金宰勋'], ['藤井澪'], [], 'done', 3, '腾讯视频', '', None, '', ''),
    ('风筝与线', 'movie', 2019, ['中国大陆'], ['动画', '家庭'], ['顾长川'], ['李知遥'], [], 'done', 5, '影院', '', None, '', ''),
    ('无声告白', 'movie', 2021, ['加拿大'], ['剧情'], ['Ewan Blackwood'], ['赵屿'], [], 'dropped', 2, '网盘', '', None, '', '节奏太慢，弃了。'),
    ('银河补给站', 'movie', 2025, ['美国'], ['科幻', '喜剧'], ['Marcus Hale'], ['沈明川'], [], 'want', None, '', '', None, '', ''),
    ('群山回响 第（01）季', 'series', 2019, ['中国大陆'], ['剧情', '悬疑'], ['顾长川'], ['李知遥', '沈明川'], [], 'done', 5, '腾讯视频', '', None, '', '国产剧天花板之一。'),
    ('群山回响 第（02）季', 'series', 2021, ['中国大陆'], ['剧情', '悬疑'], ['顾长川'], ['李知遥'], [], 'done', 4, '腾讯视频', '', None, '', ''),
    ('北纬四十七', 'series', 2020, ['美国'], ['科幻', '惊悚'], ['Marcus Hale'], ['赵屿'], [], 'done', 4, 'Netflix', '', None, '', ''),
    ('深夜食堂物语', 'series', 2016, ['日本'], ['剧情', '美食'], ['宫岛凉'], ['藤井澪'], [], 'done', 5, '哔哩哔哩', '', None, '', '下饭神剧。'),
    ('代码之城', 'series', 2023, ['中国大陆'], ['职场', '剧情'], ['顾长川'], ['沈明川'], [], 'watching', None, '腾讯视频', '看到第 6 集', None, '', ''),
    ('老宅谜案', 'series', 2018, ['英国'], ['悬疑', '犯罪'], ['Ewan Blackwood'], ['赵屿'], [], 'done', 4, '网盘', '', None, '', ''),
    ('星尘航线 第（01）季', 'series', 2022, ['美国'], ['科幻', '冒险'], ['Marcus Hale'], ['赵屿', '沈明川'], [], 'done', 5, 'Netflix', '', None, '', ''),
    ('纸牌屋与猫', 'series', 2024, ['中国大陆'], ['喜剧'], ['顾长川'], ['李知遥'], [], 'want', None, '', '', None, '', ''),
    ('铁轨尽头', 'series', 2014, ['德国'], ['剧情', '历史'], ['Klaus Berger'], ['藤井澪'], [], 'done', 5, '网盘', '', None, '', ''),
    ('城市漫游者', 'series', 2025, ['日本'], ['日常', '治愈'], ['宫岛凉'], ['藤井澪'], [], 'watching', None, '哔哩哔哩', '第 3 集', None, '', ''),
    ('风之邮差', 'anime', 2018, ['日本'], ['动画', '治愈'], ['新海野'], ['藤井澪'], [], 'done', 5, '哔哩哔哩', '', None, '', '每一帧都能当壁纸。'),
    ('机械之心', 'anime', 2019, ['日本'], ['动画', '科幻'], ['新海野'], ['藤井澪'], [], 'done', 4, '哔哩哔哩', '', None, '', ''),
    ('小镇食堂', 'anime', 2021, ['日本'], ['动画', '日常'], ['宫岛凉'], ['藤井澪'], [], 'done', 5, '哔哩哔哩', '', None, '', ''),
    ('剑与灯塔', 'anime', 2017, ['中国大陆'], ['动画', '热血'], ['顾长川'], ['沈明川'], [], 'done', 4, '腾讯视频', '', None, '', ''),
    ('云上图书馆', 'anime', 2023, ['日本'], ['动画', '奇幻'], ['新海野'], ['藤井澪'], [], 'watching', None, '哔哩哔哩', '第 8 集', None, '', ''),
    ('荒野信标', 'anime', 2015, ['美国'], ['动画', '冒险'], ['Marcus Hale'], ['赵屿'], [], 'done', 4, 'Netflix', '', None, '', ''),
    ('猫咪侦探社', 'anime', 2024, ['日本'], ['动画', '喜剧'], ['宫岛凉'], ['藤井澪'], [], 'want', None, '', '', None, '', ''),
    ('雨巷奇谭', 'anime', 2016, ['中国大陆'], ['动画', '奇幻'], ['顾长川'], ['李知遥'], [], 'done', 5, '哔哩哔哩', '', None, '', ''),
    ('周末慢生活', 'variety', 2023, ['中国大陆'], ['真人秀', '治愈'], [], ['李知遥'], [], 'done', 5, '芒果TV', '', None, '', ''),
    ('谁是代码王', 'variety', 2022, ['中国大陆'], ['真人秀', '竞技'], [], ['沈明川'], [], 'done', 4, '腾讯视频', '', None, '', ''),
    ('深夜厨房', 'variety', 2024, ['中国大陆'], ['真人秀', '美食'], [], ['李知遥'], [], 'watching', None, '腾讯视频', '第 5 期', None, '', ''),
    ('环岛骑行记', 'variety', 2021, ['中国台湾'], ['真人秀', '旅行'], [], ['赵屿'], [], 'done', 5, '哔哩哔哩', '', None, '', ''),
    ('笑声研究所', 'variety', 2025, ['中国大陆'], ['喜剧', '真人秀'], [], ['沈明川'], [], 'want', None, '', '', None, '', ''),
    ('长夜灯塔', 'novel', None, [], [], [], [], ['林晚照'], 'done', 5, '', '', 'finished', '', '结尾两章后劲太大。'),
    ('星尘之下', 'novel', None, [], [], [], [], ['林晚照'], 'done', 4, '', '', 'finished', '', ''),
    ('山海食记', 'novel', None, [], [], [], [], ['顾拾'], 'done', 5, '', '', 'finished', '', '美食与冒险都写得好。'),
    ('雾都来信', 'novel', None, [], [], [], [], ['周不疑'], 'done', 4, '', '', 'ongoing', '', '追更中。'),
    ('第九个春天', 'novel', None, [], [], [], [], ['顾拾'], 'done', 5, '', '', 'finished', '', ''),
    ('银河旧货铺', 'novel', None, [], [], [], [], ['陈默'], 'done', 3, '', '', 'ruined', '', '可惜了设定。'),
    ('苔原猎人', 'novel', None, [], [], [], [], ['周不疑'], 'watching', None, '', '读到第 120 章', 'ongoing', '', ''),
    ('小镇怪谈', 'manga', None, [], [], [], [], ['周不疑'], 'done', 5, '', '', 'ongoing', '', '画风很特别。'),
    ('猫先生的一天', 'manga', None, [], [], [], [], ['阿禾'], 'done', 5, '', '', 'finished', '', ''),
    ('雨夜便利店', 'manga', None, [], [], [], [], ['阿禾'], 'done', 4, '', '', 'ongoing', '', ''),
    ('剑客与茶', 'manga', None, [], [], [], [], ['林晚照'], 'done', 4, '', '', 'finished', '', ''),
    ('星港快递', 'manga', None, [], [], [], [], ['陈默'], 'want', None, '', '', 'ongoing', '', ''),
]

COMMENTS = {
    '星际信使': '重看了一遍，依然满分。',
    '山雀': '看完给家里打了个电话。',
    '深夜食堂物语': '配饭看的，治愈。',
    '风之邮差': '美术太顶了。',
}

# 观看日期分布：2022–2026 每年若干条，让年度观看量图表有内容
VIEW_YEARS = [2022] * 5 + [2023] * 8 + [2024] * 11 + [2025] * 13 + [2026] * 6


def main():
    st, base = api('/api/items?page_size=1')
    if st != 200:
        print('无法连接本地服务，请先 npm run dev')
        sys.exit(1)
    before = base['total']

    created = []
    for it in ITEMS:
        title, category, year, regions, tags, directors, actors, authors, status, rating, channel, progress, finish, notes, review = it
        body = {
            'title': title, 'category': category, 'year': year, 'regions': regions, 'tags': tags,
            'directors': directors, 'actors': actors, 'authors': authors, 'status': status,
            'rating': rating, 'channel': channel, 'progress': progress, 'finish_status': finish,
            'notes': notes, 'review': review,
        }
        st, d = api('/api/items', 'POST', body)
        if st == 201:
            created.append((d['id'], title, status))

    # 给看过的条目铺观看流水
    done = [c for c in created if c[2] == 'done']
    view_count = 0
    for i, (iid, title, _) in enumerate(done):
        year = VIEW_YEARS[i % len(VIEW_YEARS)]
        month = (i * 5 + 3) % 12 + 1
        day = (i * 7 + 5) % 27 + 1
        st, _ = api(f'/api/items/{iid}/viewings', 'POST', {
            'watched_on': f'{year}-{month:02d}-{day:02d}',
            'comment': COMMENTS.get(title, ''),
        })
        if st == 201:
            view_count += 1

    st, after = api('/api/items?page_size=1')
    print(f'演示数据灌入完成：新增条目 {len(created)} 条、观看流水 {view_count} 条（原 {before} → 现 {after["total"]}）')


if __name__ == '__main__':
    main()
