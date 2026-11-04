"""Runner for Candidate2Journey (iOS 26.x). Usage: run_candidate2.py <UDID> <workdir> [TestName ...]. Run with /usr/bin/python3 -I.
Feeds recorded real venue-graph coordinates through `simctl location`, applies marker-driven text size / appearance,
and samples host sockets of the SDKConsumer process to record the real level of network isolation."""
import subprocess, pathlib, time, threading, json, datetime, sys
udid = sys.argv[1]; b = pathlib.Path(sys.argv[2]); names = sys.argv[3:]
points = {'gate01': '24.975054,67.006408', 'r6': '24.974873,67.006427', 'gate02': '24.975056,67.005542', 'r602': '24.972548,67.006467', 'r603': '24.970634,67.006356'}
point = 'gate01'; stop = threading.Event(); netlog = b / 'net-samples.jsonl'
def feed():
    while not stop.is_set():
        if point == 'pause': stop.wait(.5); continue
        subprocess.run(['xcrun', 'simctl', 'location', udid, 'set', points[point]], capture_output=True, timeout=10); stop.wait(1)
def sample_net(tag):
    r = subprocess.run(['lsof', '-nP', '-i', '-a', '-c', 'SDKConsumer'], capture_output=True, text=True, timeout=20)
    rows = [l for l in r.stdout.splitlines()[1:]]
    with netlog.open('a') as f: f.write(json.dumps({'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tag': tag, 'socketRows': rows}) + '\n')
def netloop():
    while not stop.is_set(): sample_net('periodic'); stop.wait(5)
b.mkdir(parents=True, exist_ok=True)
threading.Thread(target=feed).start(); threading.Thread(target=netloop).start()
cmd = ['xcodebuild', '-project', str(b / 'Candidate2.xcodeproj'), '-scheme', 'Candidate2', '-destination', 'id=' + udid, '-parallel-testing-enabled', 'NO', '-derivedDataPath', str(b / 'DerivedData'), '-resultBundlePath', str(b / ('run-' + str(int(time.time())) + '.xcresult')), 'CODE_SIGNING_ALLOWED=NO', '-jobs', '2', 'test']
cmd[1:1] = ['-only-testing:Candidate2/Candidate2Journey/' + n for n in names]
try:
    with (b / ('log-' + str(int(time.time())) + '.log')).open('x') as f:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in p.stdout:
            f.write(line); f.flush()
            if 'NATIVEGPS:' in line:
                n = line.split('NATIVEGPS:')[-1].strip()
                if n in points or n == 'pause':
                    point = n
                    if n == 'pause': subprocess.run(['xcrun', 'simctl', 'location', udid, 'clear'], capture_output=True, timeout=10)
            if 'NATIVESIZE:' in line: subprocess.run(['xcrun', 'simctl', 'ui', udid, 'content_size', line.split('NATIVESIZE:')[-1].strip()], capture_output=True, timeout=10)
            if 'NATIVEAPPEARANCE:' in line: subprocess.run(['xcrun', 'simctl', 'ui', udid, 'appearance', line.split('NATIVEAPPEARANCE:')[-1].strip()], capture_output=True, timeout=10)
            if 'NATIVENET:' in line: sample_net(line.split('NATIVENET:')[-1].strip())
            if any(k in line for k in ('error:', 'Test Case', 'LAYOUT', 'FRAME', 'ARRIVAL_FRAMES', 'DEVICE_GEOMETRY', 'Executed', 'TEST ')): print(line.rstrip(), flush=True)
        print('XCODE_EXIT', p.wait(), flush=True)
finally:
    stop.set()
