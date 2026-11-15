"""脚本回归：仅 mock / tempfile / 内存 SQLite，不连接服务或读取本地密钥。

运行：python -I -B -X utf8 scripts/test_scripts.py
"""
import contextlib
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

sys.dont_write_bytecode = True
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import common
import backfill
import import_json
import item_audit


@contextlib.contextmanager
def temporary_cwd():
    previous = Path.cwd()
    with tempfile.TemporaryDirectory() as directory:
        os.chdir(directory)
        try:
            yield Path(directory)
        finally:
            os.chdir(previous)


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    with patch.object(sys, 'argv', [name, '--token', 'test-token']):
        spec.loader.exec_module(module)
    return module


class ScriptTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch('urllib.request.urlopen', side_effect=AssertionError('network disabled')))
        self.stack.enter_context(patch.object(common, 'load_token', side_effect=AssertionError('secrets disabled')))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.stack.enter_context(contextlib.redirect_stderr(io.StringIO()))

    def run_import(self, rows, existing=()):
        posted = []
        def api(base, token, path, method, body):
            self.assertEqual((method, path), ('POST', '/api/items'))
            posted.append(body)
            return 201, {'id': len(posted), **body}
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'items.json'
            source.write_text(json.dumps(rows), encoding='utf-8')
            with patch.object(sys, 'argv', ['import_json', '--input', str(source), '--token', 'test-token']), \
                 patch.object(import_json, 'fetch_all_items', return_value=existing), \
                 patch.object(import_json, 'api', side_effect=api):
                import_json.main()
        return posted

    def test_import_keeps_distinct_seasons_and_skips_same_season(self):
        base = {'title': 'Same show', 'category': 'series', 'year': 2024}
        posted = self.run_import([{**base, 'season': 1}, {**base, 'season': '2'}, {**base, 'season': 1}])
        self.assertEqual([row['season'] for row in posted], [1, 2])
        posted = self.run_import([{**base, 'season': 2}], existing=[{**base, 'season': 1}])
        self.assertEqual([row['season'] for row in posted], [2])

    def test_audit_logs_accepts_fields_object(self):
        args = type('Args', (), dict(base='http://localhost', token='test-token', proxy=None, item_id=1))()
        logs = [{'id': 1, 'source': 'tmdb', 'external_id': '2', 'applied_at': '2026-01-01',
                 'fields': {'year': {'before': None, 'after': 2024}}, 'undone_at': None}]
        output = io.StringIO()
        with patch.object(item_audit, 'api', return_value=(200, logs)), contextlib.redirect_stdout(output):
            item_audit.cmd_logs(args)
        self.assertIn('None  →  2024', output.getvalue())

    def test_fetch_all_items_gets_401_rows_with_server_page_limit(self):
        rows = [{'id': n} for n in range(1, 402)]
        requests = []
        def api(base, token, path):
            query = parse_qs(urlparse(path).query)
            size = min(200, int(query['page_size'][0]))
            page = int(query['page'][0])
            requests.append((page, query['category'][0]))
            return 200, {'total': len(rows), 'items': rows[(page - 1) * size:page * size]}
        with patch.object(common, 'api', side_effect=api):
            actual = common.fetch_all_items('http://localhost', 'test-token', category='custom category', page_size=999)
        self.assertEqual(actual, rows)
        self.assertEqual(requests, [(1, 'custom category'), (2, 'custom category'), (3, 'custom category')])

    def test_common_turns_timeout_and_non_json_into_runtime_error(self):
        with patch('urllib.request.urlopen', side_effect=TimeoutError('timed out')):
            with self.assertRaises(RuntimeError):
                common.api('http://localhost', 'test-token', '/api/items')
        response = type('Reply', (), {'status': 200, 'read': lambda self: b'<html>gateway</html>'})()
        with patch('urllib.request.urlopen', return_value=response):
            with self.assertRaises(RuntimeError):
                common.api('http://localhost', 'test-token', '/api/items')

    def test_excel_preserves_duplicate_rows_and_is_repeatable(self):
        import openpyxl
        import import_excel
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, report = root / 'input.xlsx', root / 'import.sql', root / 'report.txt'
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.title = '电影'
            sheet.append(['电影', '时间', '备注', '观后感'])
            sheet.append(['Same title', 2024, 'first note', 'first review'])
            sheet.append(['Same title', 2024, 'second note', 'second review'])
            workbook.save(source)
            with patch.multiple(import_excel, XLSX=source, OUT_SQL=output, OUT_REPORT=report):
                import_excel.main()
            with sqlite3.connect(':memory:') as db:
                for path in sorted((SCRIPTS.parent / 'migrations').glob('000[1-5]*.sql')):
                    db.executescript(path.read_text(encoding='utf-8'))
                sql = output.read_text(encoding='utf-8')
                db.executescript(sql)
                self.assertEqual(db.execute('SELECT review FROM items ORDER BY id').fetchall(),
                                 [('first review',), ('second review',)])
                db.executescript(sql)
                self.assertEqual(db.execute('SELECT count(*) FROM items').fetchone()[0], 2)

    def run_backfill(self, root, items, api, *extra):
        with patch.object(sys, 'argv', ['backfill', '--token', 'test-token', '--auto', '--delay', '0', *extra]), \
             patch.object(backfill, 'fetch_all_items', return_value=items), \
             patch.object(backfill, 'api', side_effect=api), patch.object(backfill.time, 'sleep'):
            backfill.main()

    def test_backfill_persists_completed_apply_before_interrupt(self):
        items = [{'id': n, 'title': f'Title {n}', 'year': 2024} for n in (1, 2)]
        def api(base, token, path, method, body):
            if path.endswith('/preview'):
                if body['item_id'] == 2:
                    raise KeyboardInterrupt()
                return 200, {'source': 'tmdb', 'candidates': [
                    {'title': 'Title 1', 'year': 2024, 'externalId': '10'}]}
            return 200, {'applied': {'cover_url': {}}, 'logId': 17}
        with temporary_cwd() as root:
            with self.assertRaises(KeyboardInterrupt):
                self.run_backfill(root, items, api)
            reports = list((root / 'data').glob('backfill_report_*.json'))
            self.assertEqual(len(reports), 1)
            self.assertEqual(json.loads(reports[0].read_text(encoding='utf-8'))['applied'][0]['log_id'], 17)

    def test_backfill_preview_failure_is_recorded_and_fails_exit(self):
        with temporary_cwd() as root:
            with self.assertRaises(SystemExit) as exited:
                self.run_backfill(root, [{'id': 1, 'title': 'Title'}], lambda *a: (502, {'error': 'source failed'}))
            self.assertEqual(exited.exception.code, 1)
            report = json.loads(next((root / 'data').glob('*.json')).read_text(encoding='utf-8'))
            self.assertEqual(report['errors'][0]['item_id'], 1)

    def test_backfill_undo_failure_is_not_success(self):
        with temporary_cwd() as root:
            report = root / 'report.json'
            report.write_text(json.dumps({'base': 'http://localhost:5173', 'applied': [
                {'title': 'Title', 'item_id': 1, 'log_id': 17}]}), encoding='utf-8')
            with self.assertRaises(SystemExit) as exited:
                self.run_backfill(root, [], lambda *a: (500, {'error': 'failed'}), '--undo', str(report))
            self.assertEqual(exited.exception.code, 1)

    def test_backfill_propagates_source_and_selected_season(self):
        posted = []
        def api(base, token, path, method, body):
            if path.endswith('/preview'):
                return 200, {'source': 'tmdb', 'candidates': [
                    {'title': 'Show', 'year': 2019, 'seasonYear': 2024, 'seasonNumber': 2, 'externalId': '10'}]}
            posted.append(body)
            return 200, {'applied': {'episode_count': {}}, 'logId': 1}
        with temporary_cwd() as root:
            self.run_backfill(root, [{'id': 1, 'title': 'Show Season 2', 'year': 2024}], api)
            self.assertEqual((posted[0]['source'], posted[0]['season']), ('tmdb', 2))
            self.assertEqual(len(list((root / 'data').glob('*.json'))), 1)

    def test_backfill_remote_requires_confirmation_for_apply_and_undo(self):
        with temporary_cwd() as root:
            report = root / 'report.json'
            report.write_text(json.dumps({'base': 'https://demo.example', 'applied': []}), encoding='utf-8')
            for extra in [('--base', 'https://demo.example'), ('--undo', str(report))]:
                with self.subTest(extra=extra), self.assertRaises(SystemExit) as exited:
                    self.run_backfill(root, [], lambda *a: self.fail('remote request'), *extra)
                self.assertEqual(exited.exception.code, 2)

    def test_qa_mock_preserves_real_items_and_cleans_after_failure(self):
        for interrupt in (False, True):
            with self.subTest(interrupt=interrupt):
                self.run_qa_mock(interrupt)

    def test_qa_mock_selects_configured_category(self):
        for categories, expected in [(('custom_media',), 'custom_media'), (('custom_media', 'movie'), 'movie')]:
            with self.subTest(categories=categories):
                self.run_qa_mock(False, categories, expected)

    def run_qa_mock(self, interrupt, categories=('movie',), expected_category='movie'):
        original = {'id': 7, 'title': 'QA测试真实条目', 'category': expected_category, 'rating': 4, 'year': 2024,
                    'status': 'done', 'actors': ['演员甲'], 'directors': ['Old alias'], 'tags': [], 'activity': []}
        items = {7: dict(original)}
        aliases = {'Old alias': 'Canonical'}
        lists = {}
        calls = []
        next_id = 100
        def response(status, body):
            raw = body if isinstance(body, bytes) else json.dumps(body).encode()
            return type('Reply', (), {'status': status, 'read': lambda self: raw})()
        def urlopen(request, **kwargs):
            nonlocal aliases, next_id
            parsed = urlparse(request.full_url)
            path, query, method = parsed.path, parse_qs(parsed.query), request.get_method()
            body = json.loads(request.data) if request.data else None
            calls.append((method, path, body))
            if path == '/api/auth/login':
                return response(401, {})
            if path == '/api/auth/status':
                return response(200, {'authenticated': False})
            if not request.has_header('Authorization'):
                return response(401, {})
            if path == '/api/fields/facets':
                return response(200, {'categories': [[expected_category, 1]], 'tags': [], 'year_min': 2024, 'year_max': 2024, 'year_count': 1})
            if path == '/api/items/status-counts':
                return response(200, {'done': 1, 'watching': 0})
            if path == '/api/stats':
                return response(200, {'kpi': {'total': len(items)}, 'unrated': 0,
                                      'by_author': [], 'by_director': [], 'by_actor': []})
            if path == '/api/settings':
                return response(200, {'aliases': aliases, 'categories': [{'id': category, 'label': category} for category in categories]})
            if path == '/api/settings/aliases':
                value = body['aliases']
                if '环A' in value or '自指' in value:
                    return response(400, {})
                aliases = value
                return response(200, {})
            if path == '/api/settings/categories':
                return response(400, {})
            if path == '/api/items' and method == 'POST':
                if body.get('category') not in categories:
                    return response(400, {'error': '类别不存在'})
                self.assertEqual(body['category'], expected_category)
                next_id += 1
                item = {'id': next_id, 'activity': [], **body}
                item['directors'] = [aliases.get(n, n) for n in body.get('directors', [])]
                items[next_id] = item
                return response(201, item)
            if path == '/api/items/random':
                tag = query['tags'][0]
                matches = [i for i in items.values() if tag in i.get('tags', [])]
                return response(200, matches[0]) if matches else response(404, {})
            if path == '/api/items':
                found = list(items.values())
                if query.get('status') == ['watching'] or 'finish_status' in query or 'authors' in query:
                    found = []
                if 'q' in query:
                    found = [i for i in found if query['q'][0] in i['title']]
                if 'actors' in query:
                    required = query['actors'][0].split(',')
                    found = [i for i in found if all(n in i.get('actors', []) for n in required)]
                if 'tags' in query:
                    found = [i for i in found if query['tags'][0] in i.get('tags', [])]
                if 'list_id' in query:
                    found = [items[n] for n in lists[int(query['list_id'][0])]]
                total = len(found)
                if query.get('page') == ['9999']:
                    found = []
                return response(200, {'total': total, 'items': found, 'page_size': min(200, int(query.get('page_size', ['50'])[0]))})
            if path.startswith('/api/items/'):
                parts = path.split('/')
                iid = int(parts[3])
                if len(parts) > 4:
                    return response(201 if method == 'POST' else 200, {'id': 1})
                if method == 'DELETE':
                    items.pop(iid)
                    return response(200, {})
                if interrupt and method == 'GET':
                    raise RuntimeError('injected QA interruption')
                if method == 'PUT':
                    items[iid].update(body)
                    if 'rating' in body:
                        items[iid]['activity'] = [{'action': 'status_changed'}, {'action': 'rating_changed'}]
                return response(200, items[iid])
            if path == '/api/lists':
                lists[1] = []
                return response(201, {'id': 1})
            if path.startswith('/api/lists/'):
                parts = path.split('/')
                lid = int(parts[3])
                if len(parts) > 4:
                    if method == 'POST':
                        lists[lid] = body['item_ids']
                    else:
                        lists[lid] = []
                    return response(200, {})
                if method == 'DELETE':
                    del lists[lid]
                    return response(200, {})
                return response(200, {'items': [items[n] for n in lists[lid]]})
            if path == '/api/fields/values':
                if query['field'] != ['actors']:
                    return response(400, {})
                return response(200, [[v, 1] for i in items.values() for v in i.get('actors', [])])
            if path == '/api/fields/rename':
                for i in items.values():
                    i['actors'] = list(dict.fromkeys(body['to'] if v == body['from'] else v for v in i.get('actors', [])))
                return response(200, {'updated': 1})
            if path == '/api/export.csv':
                stream = io.StringIO(newline='')
                writer = csv.writer(stream)
                writer.writerow([f'h{n}' for n in range(22)])
                if 'category' in query:
                    self.assertEqual(query['category'], [expected_category])
                for i in items.values():
                    if 'category' in query and i['category'] not in query['category']:
                        continue
                    writer.writerow([i['title'], 'two\r\nlines', *([''] * 20)])
                return response(200, stream.getvalue().encode('utf-8-sig'))
            if path == '/api/export.json':
                return response(200, {'count': len(items)})
            if path == '/api/autofill/status':
                return response(200, {'tmdb': False, 'bangumi': True})
            if path == '/api/autofill/undo':
                self.assertEqual(body['log_id'], 0)
                return response(400, {})
            if path == '/api/autofill/preview':
                return response(503, {})
            self.fail(f'unexpected request {method} {path}')
        with patch('urllib.request.urlopen', side_effect=urlopen), \
             patch.object(sys, 'argv', ['qa_sweep', '--token', 'test-token']), \
             patch('builtins.open', side_effect=AssertionError('no secret reads')):
            if interrupt:
                with self.assertRaisesRegex(RuntimeError, 'injected QA interruption'):
                    runpy.run_path(str(SCRIPTS / 'qa_sweep.py'), run_name='__main__')
            else:
                with self.assertRaises(SystemExit) as exited:
                    runpy.run_path(str(SCRIPTS / 'qa_sweep.py'), run_name='__main__')
                self.assertEqual(exited.exception.code, 0)
        self.assertEqual(items, {7: original})
        self.assertEqual(aliases, {'Old alias': 'Canonical'})
        self.assertEqual(lists, {})
        self.assertFalse(any(path in ('/api/auth/change-password', '/api/settings/aliases/normalize') for _, path, _ in calls))

    def test_seed_viewing_failure_stops_success(self):
        seed = load_script('seed_demo')
        def api(path, method='GET', body=None):
            if method == 'GET':
                return 200, {'total': 1}
            if path.endswith('/viewings'):
                return 500, {'error': 'failed viewing'}
            return 201, {'id': 1}
        with patch.object(seed, 'ITEMS', [seed.ITEMS[0]]), patch.object(seed, 'api', side_effect=api):
            with self.assertRaises(SystemExit) as exited:
                seed.main()
            self.assertEqual(exited.exception.code, 1)


if __name__ == '__main__':
    unittest.main()
