import subprocess,pathlib,json,time,re,xml.etree.ElementTree as ET,sys,os
E=pathlib.Path(os.environ.get('SDK_NATIVE_EVIDENCE', pathlib.Path.home()/'Documents/offline-map-audits/offline-sdk-virtual-device-2026-11-01')).resolve()
ADB=[str(pathlib.Path.home()/'Library/Android/sdk/platform-tools/adb'),'-s','emulator-5554']
def run(*args):
 p=subprocess.run(ADB+list(args),capture_output=True,timeout=15)
 with (E/'android-commands.jsonl').open('a') as f:f.write(json.dumps({'utc':time.time(),'args':args,'exit':p.returncode,'stdout':p.stdout.decode(errors='replace')[:16000],'stderr':p.stderr.decode(errors='replace')[:4000]})+'\n')
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace'))
 return p.stdout

def tree():
 run('shell','uiautomator','dump','--compressed','/sdcard/sdk-acceptance-window.xml')
 return run('exec-out','cat','/sdcard/sdk-acceptance-window.xml')
def snapshot(name):
 raw=tree();(E/(name+'.xml')).write_bytes(raw);(E/(name+'.png')).write_bytes(run('exec-out','screencap','-p'))
 root=ET.fromstring(raw)
 rows=[{'text':n.get('text'),'label':n.get('content-desc'),'bounds':n.get('bounds'),'clickable':n.get('clickable'),'enabled':n.get('enabled')} for n in root.iter('node') if n.get('text') or n.get('content-desc')]
 print(json.dumps([{'label':x['label'] or x['text'],'bounds':x['bounds'],'enabled':x['enabled']} for x in rows if x['label'] or x['clickable']=='true'],ensure_ascii=False)); print('TEXT:', ' | '.join(dict.fromkeys(x['text'] for x in rows if x['text'])));return rows

def tap(label):
 root=ET.fromstring(tree());nodes=[n for n in root.iter('node') if n.get('text')==label or n.get('content-desc')==label]
 if not nodes:raise ValueError('No exact visible label: '+label)
 n=next((n for n in nodes if n.get('clickable')=='true'),nodes[0]);a=list(map(int,re.findall(r'\d+',n.get('bounds',''))));
 if len(a)!=4 or a[2]<=a[0] or a[3]<=a[1]:raise ValueError('Invalid bounds')
 run('shell','input','tap',str((a[0]+a[2])//2),str((a[1]+a[3])//2))
if __name__=='__main__':
 if sys.argv[1]=='snapshot':snapshot(sys.argv[2])
 elif sys.argv[1]=='tap':tap(sys.argv[2]);snapshot(sys.argv[3])
