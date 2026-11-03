"""Controlled Live-navigation memory profile with heapprofd + java_hprof against the profileable diagnostic APK.

Protocol: device location source selected explicitly, emulator console `geo fix` at 1 Hz (walker at Gate 01, destination Gate 02),
5 warm-ups, idle baseline, block1 (10 sessions), idle snapshot, block2 (10 sessions), final idle snapshot.
Each session: Live start -> HOME -> foreground -> normal "End navigation" -> 10 s idle -> meminfo/location sample.
Run with /usr/bin/python3 -I.
"""
import json, pathlib, re, subprocess, sys, threading, time, xml.etree.ElementTree as ET

PKG = 'com.example.sdkconsumer'
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
CFG = pathlib.Path(__file__).parent
PT = {'gate01': ('67.006408', '24.975054')}


def adb(*a, text=True, check=False):
    r = subprocess.run(['adb', *a], capture_output=True, text=text, timeout=90)
    return r.stdout if text else r.stdout


def sh(cmd): return adb('shell', cmd)


def log(name, obj):
    with (OUT / name).open('a') as f: f.write(json.dumps(obj) + '\n')


def uptime(): return float(sh('cat /proc/uptime').split()[0])


def tree():
    for _ in range(4):
        adb('shell', 'uiautomator', 'dump', '/sdcard/u.xml')
        x = adb('shell', 'cat', '/sdcard/u.xml')
        try: return ET.fromstring(x)
        except Exception: time.sleep(1)
    raise RuntimeError('uiautomator unavailable')


def labels(): return [(n.get('content-desc') or n.get('text'), n) for n in tree().iter('node') if n.get('content-desc') or n.get('text')]


def has(part): return any(part in (l or '') for l, _ in labels())


def tap(*names, scroll=False):
    for _ in range(8 if scroll else 3):
        ns = [n for l, n in labels() if l in names]
        if ns:
            n = next((n for n in ns if n.get('clickable') == 'true'), ns[0]); a = list(map(int, re.findall(r'\d+', n.get('bounds'))))
            adb('shell', 'input', 'tap', str((a[0] + a[2]) // 2), str((a[1] + a[3]) // 2)); return
        if scroll: adb('shell', 'input', 'swipe', '600', '2020', '600', '1100', '500')
        else: time.sleep(1)
    raise RuntimeError('Missing labels %s' % (names,))


def start(): adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity'); time.sleep(2)


stop = threading.Event()


def feed():
    while not stop.is_set():
        try: adb('emu', 'geo', 'fix', *PT['gate01'])
        except Exception as e: log('gps-errors.jsonl', {'e': str(e)})
        stop.wait(1)


def live():
    tap('Gate 02. Gate'); tap('Navigate with my location', 'Navigate with my location. Follows your progress with GPS.')
    for _ in range(15):
        if has('Start live navigation'): break
        time.sleep(1)
    tap('Start live navigation')
    for _ in range(15):
        if has('End navigation'): break
        time.sleep(1)
    assert has('End navigation')


def sample(name):
    pid = sh('pidof ' + PKG).strip()
    (OUT / (name + '-meminfo.txt')).write_text(sh('dumpsys meminfo -d ' + PKG))
    (OUT / (name + '-location.txt')).write_text(sh('dumpsys location'))
    (OUT / (name + '-status.txt')).write_text(sh('cat /proc/%s/status' % pid))
    log('checkpoints.jsonl', {'name': name, 'uptime': uptime(), 'utc': time.time(), 'pid': pid}); print('CP', name, pid, flush=True)


def hprof(name):
    r = subprocess.run(['adb', 'shell', 'perfetto -c - --txt -o /data/misc/perfetto-traces/%s.pftrace' % name], input=(CFG / 'javahprof.cfg').read_text(), capture_output=True, text=True)
    adb('pull', '/data/misc/perfetto-traces/%s.pftrace' % name, str(OUT / 'traces' / (name + '.pftrace')))
    sh('rm /data/misc/perfetto-traces/%s.pftrace' % name); log('checkpoints.jsonl', {'name': 'hprof-' + name, 'uptime': uptime(), 'rc': r.returncode})


def session(tag):
    live(); adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); time.sleep(1); start(); assert has('End navigation')
    tap('End navigation'); assert has('Where to?'); time.sleep(10); sample(tag)


def main():
    (OUT / 'traces').mkdir(exist_ok=True)
    adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_FINE_LOCATION'); adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_COARSE_LOCATION')
    threading.Thread(target=feed, daemon=True).start()
    adb('shell', 'am', 'force-stop', PKG); start()
    for _ in range(40):
        if has('Show demo tools'): break
        time.sleep(2)
    tap('Show demo tools')
    time.sleep(2)
    tap('Location source: simulated. Switch.', scroll=True)
    assert any('device' in (l or '').lower() and 'ocation source' in (l or '') for l, _ in labels()), 'location source did not switch to device'
    log('checkpoints.jsonl', {'name': 'source-device-confirmed', 'utc': time.time()})
    if has('Hide demo tools'): tap('Hide demo tools')
    time.sleep(5)
    # heapprofd continuous session attaches to the already running process
    r = subprocess.run(['adb', 'shell', 'perfetto --background -c - --txt -o /data/misc/perfetto-traces/heap.pftrace'], input=(CFG / 'heapprofd-run.cfg').read_text(), capture_output=True, text=True, timeout=90)
    perf_pid = r.stdout.strip().split()[-1] if r.stdout.strip() else ''
    log('checkpoints.jsonl', {'name': 'heapprofd-started', 'uptime': uptime(), 'perfetto_pid': perf_pid, 'out': r.stdout, 'err': r.stderr[-300:]})
    time.sleep(8); sample('pre-warm')
    for i in range(5):
        live(); adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); time.sleep(1); start(); assert has('End navigation'); tap('End navigation'); assert has('Where to?'); time.sleep(2)
    time.sleep(20)
    for i in range(3): sample('warm-%d' % i); time.sleep(10)
    time.sleep(25); sample('baseline'); time.sleep(70)
    for block in (1, 2):
        for i in range(1, 11): session('block%d-s%02d' % (block, i))
        time.sleep(30); sample('block%d-quiet' % block)
        (OUT / ('block%d-gfxinfo.txt' % block)).write_text(sh('dumpsys gfxinfo ' + PKG)); time.sleep(25)
        time.sleep(45)
    time.sleep(40); sample('final'); time.sleep(25)
    sh('kill -TERM ' + perf_pid); time.sleep(6)
    log('checkpoints.jsonl', {'name': 'heapprofd-stopped', 'uptime': uptime()})
    adb('pull', '/data/misc/perfetto-traces/heap.pftrace', str(OUT / 'traces' / 'heap.pftrace'))
    stop.set()


if __name__ == '__main__': main()
