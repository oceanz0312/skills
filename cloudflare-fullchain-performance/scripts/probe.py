#!/usr/bin/env python3
"""有界串行 GET 测量及可选正文校验；只输出受限指标/摘要，不持久保存URL、凭据或正文。"""

import argparse
import hashlib
import ipaddress
import json
import math
import os
import re
import shutil
import stat
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


def bounded_int(low, high):
    def parse(value):
        number = int(value)
        if not low <= number <= high:
            raise argparse.ArgumentTypeError(f"必须在 {low} 到 {high} 之间")
        return number
    return parse


def read_protected_file(path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
        raise ValueError('输入必须是最多 64 KiB 的普通文件')
    if os.name == 'posix' and (info.st_mode & 0o077 or info.st_uid != os.getuid()):
        raise ValueError('输入文件须由当前用户持有，且不允许组/其他用户访问')
    return path.read_text()


def quoted(value):
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("输入包含不允许的控制字符")
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def safe_number(metrics, key):
    value = metrics.get(key)
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None


def milliseconds(metrics, end, start=None):
    finish = safe_number(metrics, end)
    begin = safe_number(metrics, start) if start else 0
    if finish is None or begin is None:
        return None
    # HTTP 明文没有 TLS 阶段；非单调计时不伪造为正常零耗时。
    if finish < begin:
        return None
    return round((finish - begin) * 1000, 3)


def response_headers(text):
    headers = {}
    for line in text.splitlines():
        if line.startswith('HTTP/'):
            headers = {}
        elif ':' in line:
            name, value = line.split(':', 1)
            headers[name.lower().strip()] = value.strip()
    return headers


def header_summary(headers):
    def cache_status(name):
        value = headers.get(name, '').upper()
        return value if value in {'HIT', 'MISS', 'STALE', 'BYPASS', 'DYNAMIC',
                                  'EXPIRED', 'UPDATING', 'REVALIDATED', 'NONE'} else None
    ray = headers.get('cf-ray', '')
    colo = re.search(r'-([A-Za-z]{3})$', ray)
    placement = headers.get('cf-placement', '')
    cache = headers.get('cache-control', '')
    # 不保留未识别指令/字段值，防止自定义响应头泄露业务数据。
    directives = re.findall(
        r'(?:^|,)\s*(public|private|no-store|no-cache|must-revalidate|immutable|'
        r'max-age=\d+|s-maxage=\d+|stale-while-revalidate=\d+)(?=\s*(?:,|$))',
        cache.lower())
    content_range = headers.get('content-range', '')
    if not re.fullmatch(r'bytes (?:\d+-\d+|\*)/\d+', content_range):
        content_range = None
    return {
        'colo': colo.group(1).upper() if colo else None,
        'placement': placement if re.fullmatch(r'(?:local|remote)-[A-Za-z]{3}', placement) else None,
        'cf_cache_status': cache_status('cf-cache-status'),
        'edge_cache_status': cache_status('x-edge-cache'),
        'cache_control': ', '.join(directives) or None,
        'content_range': content_range,
        'etag_present': 'etag' in headers,
        'bookmark_present': 'x-d1-bookmark' in headers,
        'set_cookie_present': 'set-cookie' in headers,
    }


def parse_range(value):
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', value)
    if not match or not any(match.groups()):
        raise ValueError('range 必须是单段 bytes 范围')
    start, end = (int(part) if part else None for part in match.groups())
    if any(number is not None and number > 2**53 - 1 for number in (start, end)):
        raise ValueError('range 超出安全整数范围')
    if start is None and end == 0 or start is not None and end is not None and end < start:
        raise ValueError('range 必须是可满足的正向范围')
    return start, end


def verify_body(path, headers, status, requested_range):
    if headers.get('content-encoding', 'identity').lower() != 'identity':
        return {'body_error': 'unexpected_encoding'}
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as body:
        for chunk in iter(lambda: body.read(65536), b''):
            size += len(chunk)
            digest.update(chunk)
    result = {'body_bytes': size, 'body_sha256': digest.hexdigest(), 'body_error': None}
    length = headers.get('content-length')
    if length is not None and (not length.isdigit() or int(length) != size):
        result['body_error'] = 'content_length_mismatch'
        return result
    if status == 206:
        match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', headers.get('content-range', ''))
        if not match or not requested_range:
            result['body_error'] = 'invalid_content_range'
            return result
        actual_start, actual_end, total = map(int, match.groups())
        start, end = parse_range(requested_range)
        expected_start = max(0, total - end) if start is None else start
        expected_end = total - 1 if start is None or end is None else min(end, total - 1)
        if not (0 < total <= 2**53 - 1 and 0 <= expected_start <= expected_end
                and actual_start == expected_start and actual_end == expected_end
                and size == actual_end - actual_start + 1):
            result['body_error'] = 'content_range_mismatch'
    elif 'content-range' in headers:
        result['body_error'] = 'unexpected_content_range'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--url', help='无查询参数的 URL；带查询链接请用 --url-file')
    source.add_argument('--url-file', type=Path, help='仅含一个 URL 的受保护文件')
    parser.add_argument('--headers-file', type=Path, help='受保护的逐行请求头文件，不记录内容')
    parser.add_argument('--label', required=True, help='不含用户/文件标识的样本标签')
    parser.add_argument('--count', type=bounded_int(1, 10), default=5)
    parser.add_argument('--timeout', type=bounded_int(1, 30), default=15)
    parser.add_argument('--max-bytes', type=bounded_int(1, 8 * 1024 * 1024), default=2 * 1024 * 1024)
    parser.add_argument('--interval', type=bounded_int(1, 30), default=1)
    parser.add_argument('--range', help='单段范围，例如 bytes=0-65535')
    parser.add_argument('--expect-status', type=bounded_int(100, 599), default=200)
    parser.add_argument('--verify-body', action='store_true', help='暂存有界正文并校验长度、Range和SHA-256；采样后删除')
    parser.add_argument('--expect-sha256', help='可选可信正文摘要，须与 --verify-body 一起使用')
    parser.add_argument('--output', type=Path, required=True, help='新 JSON 文件；存在则拒绝覆盖')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', args.label):
        parser.error('label 仅使用 1–64 个 ASCII 字母、数字、点、下划线或横线')
    if args.range:
        try:
            parse_range(args.range)
        except ValueError:
            parser.error('range 必须是安全整数范围内可满足的单段 bytes 范围')
    if args.verify_body and (args.expect_status not in {200, 206} or args.expect_status == 206 and not args.range):
        parser.error('正文校验仅用于完整200或带range的206')
    if args.expect_sha256 and (not args.verify_body or not re.fullmatch(r'[a-fA-F0-9]{64}', args.expect_sha256)):
        parser.error('expect-sha256 必须是64位十六进制摘要且启用正文校验')
    if args.output.exists() or not args.output.parent.is_dir():
        parser.error('output 必须是已有目录中的新文件，拒绝覆盖')
    curl = shutil.which('curl')
    if not curl:
        parser.error('需要已安装的 curl，未自动安装')
    version_result = subprocess.run([curl, '-q', '--version'], capture_output=True, text=True, timeout=5)
    match = re.search(r'curl (\d+)\.(\d+)\.(\d+)', version_result.stdout)
    if not match or tuple(map(int, match.groups())) < (8, 4, 0):
        parser.error('需要 curl 8.4.0+，以限制未知大小的下载；未自动升级')
    try:
        url = args.url if args.url is not None else read_protected_file(args.url_file).strip()
        parsed = urlsplit(url)
        if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
            raise ValueError('只允许 HTTP(S) 且无 userinfo/fragment 的单个 URL')
        if args.url is not None and parsed.query:
            parser.error('带查询参数的 URL 须使用受保护的 --url-file；不打印 URL')
        try:
            loopback = ipaddress.ip_address(parsed.hostname).is_loopback
        except ValueError:
            loopback = False
        if parsed.scheme == 'http' and not loopback:
            parser.error('仅允许 HTTPS 或用于隔离验收的回环 IP HTTP')
        headers = read_protected_file(args.headers_file).splitlines() if args.headers_file else []
        for header in headers:
            if ':' not in header or not re.fullmatch(r'[A-Za-z0-9-]+', header.split(':', 1)[0]):
                raise ValueError('请求头文件必须逐行 name: value')
            if header.split(':', 1)[0].lower() in {'accept-encoding', 'range', 'content-length', 'transfer-encoding'}:
                raise ValueError('编码与范围使用脚本选项，不添加请求正文头')
        config = 'url = ' + quoted(url) + '\n'
        for header in headers:
            config += 'header = ' + quoted(header) + '\n'
    except (ValueError, OSError):
        parser.error('URL 或请求头输入无效/不可读；为保护凭据不打印其内容')
    samples = []
    first_digest = None
    digests = set()
    for index in range(args.count):
        with tempfile.TemporaryDirectory(prefix='cf-perf-') as directory:
            header_file = Path(directory) / 'headers'
            descriptor = os.open(header_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
            body_file = Path(directory) / 'body'
            if args.verify_body:
                descriptor = os.open(body_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                os.close(descriptor)
            command = [curl, '-q', '--config', '-', '--silent', '--show-error',
                       '--globoff', '--request', 'GET', '--proto', '=http,https',
                       '--connect-timeout', str(min(5, args.timeout)), '--max-time', str(args.timeout),
                       '--max-filesize', str(args.max_bytes), '--output', str(body_file) if args.verify_body else os.devnull,
                       '--dump-header', str(header_file), '--write-out', '%{json}',
                       '--header', 'Accept-Encoding: identity']
            if args.range:
                command.extend(['--header', 'Range: ' + args.range])
            started = time.monotonic()
            timed_out = False
            try:
                result = subprocess.run(command, input=config, text=True, capture_output=True, timeout=args.timeout + 3)
                try:
                    metrics = json.loads(result.stdout)
                except json.JSONDecodeError:
                    metrics = {}
                exit_code = result.returncode
            except subprocess.TimeoutExpired:
                metrics, exit_code, timed_out = {}, None, True
            headers_result = response_headers(header_file.read_text(errors='replace')) if header_file.exists() else {}
            status = metrics.get('http_code', metrics.get('response_code'))
            success = exit_code == 0 and status == args.expect_status
            body_result = {}
            if args.verify_body and success:
                body_result = verify_body(body_file, headers_result, status, args.range)
                digest = body_result.get('body_sha256')
                if not body_result['body_error']:
                    digests.add(digest)
                    if args.expect_sha256 and digest != args.expect_sha256.lower():
                        body_result['body_error'] = 'unexpected_body_digest'
                    elif first_digest is not None and digest != first_digest:
                        body_result['body_error'] = 'body_digest_changed'
                    if first_digest is None:
                        first_digest = digest
                success = not body_result['body_error']
            samples.append({
                'sample': index + 1,
                'timestamp_utc': datetime.now(timezone.utc).isoformat(),
                'ok': success,
                'curl_exit': exit_code,
                'error_kind': ('process_timeout' if timed_out else 'transfer_error' if exit_code != 0
                               else 'unexpected_status' if status != args.expect_status else body_result.get('body_error')),
                'status': status if isinstance(status, int) else None,
                'http_version': {'1': '1.0', '1.0': '1.0', '1.1': '1.1', '2': '2', '3': '3'}.get(str(metrics.get('http_version'))),
                'dns_ms': milliseconds(metrics, 'time_namelookup'),
                'tcp_ms': milliseconds(metrics, 'time_connect', 'time_namelookup'),
                'tls_ms': milliseconds(metrics, 'time_appconnect', 'time_connect') if parsed.scheme == 'https' else None,
                'first_response_ms': milliseconds(metrics, 'time_starttransfer'),
                'after_handshake_ms': milliseconds(metrics, 'time_starttransfer', 'time_appconnect' if parsed.scheme == 'https' else 'time_connect'),
                'download_ms': milliseconds(metrics, 'time_total', 'time_starttransfer'),
                'total_ms': milliseconds(metrics, 'time_total'),
                'wall_ms': round((time.monotonic() - started) * 1000, 3),
                'downloaded_bytes': safe_number(metrics, 'size_download'),
                **header_summary(headers_result),
                **body_result,
            })
        if index + 1 < args.count:
            time.sleep(args.interval)
    # 成功样本仍按 colo/缓存状态分组，不把冷、热或跨地区混成一个收益数字。
    grouped = {}
    for sample in samples:
        key = (sample['colo'], sample['cf_cache_status'], sample['edge_cache_status'], sample['http_version'])
        grouped.setdefault(key, []).append(sample)
    groups = []
    for key, values in grouped.items():
        success = [row for row in values if row['ok']]
        timings = [row['first_response_ms'] for row in success if row['first_response_ms'] is not None]
        groups.append({'colo': key[0], 'cf_cache_status': key[1], 'edge_cache_status': key[2],
                       'http_version': key[3], 'samples': len(values), 'success': len(success), 'failed': len(values) - len(success),
                       'median_first_response_ms': statistics.median(timings) if timings else None})
    report = {'schema_version': 2, 'label': args.label, 'curl_version': '.'.join(match.groups()),
              'method': 'GET', 'range': args.range, 'expected_status': args.expect_status,
              'max_bytes': args.max_bytes, 'timeout_seconds': args.timeout,
              'redirects_followed': False, 'fresh_curl_process_per_sample': True,
              'body_verification': args.verify_body, 'expected_digest_present': bool(args.expect_sha256),
              'body_consistent': len(digests) == 1 if any(row['ok'] and 'body_sha256' in row for row in samples) else None,
              'credential_input_present': bool(args.headers_file or args.url_file),
              'note': '未强制清缓存；首响应计时不是首个视频payload或D1路由。小样本只报告中位数。',
              'samples': samples, 'groups': groups}
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({'label': args.label, 'success': sum(row['ok'] for row in samples),
                      'failed': sum(not row['ok'] for row in samples), 'groups': groups}, ensure_ascii=False))
    return 0 if all(row['ok'] for row in samples) else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('测量被取消，未报告为成功', file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        # 错误文本可能含敏感URL/路径；仅报告类型。
        print('测量失败：' + type(error).__name__ + '，未报告为成功', file=sys.stderr)
        sys.exit(2)
