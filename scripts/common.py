# -*- coding: utf-8 -*-
"""书影集 API 公共客户端：scripts 下的批量脚本共用（backfill.py / item_audit.py）。

- Token：默认读仓库根目录 .dev.vars 的 API_TOKEN，也可 --token 显式传入
- 网络：访问 workers.dev 国内直连不通，用 --proxy 挂代理；Cloudflare 会按 TLS/UA
  指纹拦 Python 默认请求（1010），统一带浏览器 UA 可过
"""
import json
import urllib.error
import urllib.parse
import urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) riley-media-log-scripts'


def load_token(path='.dev.vars'):
    """从环境文件读 API_TOKEN，读不到返回空串。"""
    try:
        return open(path, encoding='utf-8').read().split('API_TOKEN=')[1].splitlines()[0].strip()
    except Exception:
        return ''


def install_proxy(proxy):
    """proxy 形如 http://127.0.0.1:<你的代理端口>；传空则不设代理。"""
    if proxy:
        handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
        urllib.request.install_opener(urllib.request.build_opener(handler))


def api(base, token, path, method='GET', body=None, timeout=30):
    """调用书影集 API，返回 (status_code, 解析后的 JSON 或 None)。"""
    req = urllib.request.Request(
        base + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'User-Agent': UA,
        },
    )
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        data = r.read()
        return r.status, (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        raw = e.read() or b''
        try:
            return e.code, json.loads(raw)
        except Exception:
            raise RuntimeError(f'HTTP {e.code}: {raw[:150].decode("utf-8", "replace")}')
    except urllib.error.URLError as e:
        raise RuntimeError(f'网络错误（访问 workers.dev 需代理，可用 --proxy 指定）: {e.reason}')


def fetch_all_items(base, token, category=None, page_size=200):
    """翻页拉取全部条目（列表接口单页上限 200）。失败抛 RuntimeError。"""
    items, page = [], 1
    while True:
        query = f'/api/items?page_size={page_size}&page={page}'
        if category:
            query += '&category=' + urllib.parse.quote(category)
        st, d = api(base, token, query)
        if st != 200:
            raise RuntimeError(f'列表获取失败: {d}')
        items.extend(d['items'])
        if not d['items'] or len(items) >= d.get('total', 0):
            return items
        page += 1
