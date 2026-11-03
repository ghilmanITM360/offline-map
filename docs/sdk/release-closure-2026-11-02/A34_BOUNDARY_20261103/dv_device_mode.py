import subprocess,time,sys,re
def inj(lat,lng,acc,t=None):
    t=int(time.time()*1000) if t is None else t
    subprocess.run(["adb","shell","cmd","location","providers","set-test-provider-location","gps","--location",f"{lat:.6f},{lng:.6f}","--accuracy",str(acc),"--time",str(t)])
def snap(name,wait=4):
    time.sleep(wait)
    subprocess.run(["adb","shell","uiautomator","dump","/sdcard/u.xml"],capture_output=True)
    x=subprocess.run(["adb","shell","cat","/sdcard/u.xml"],capture_output=True,text=True).stdout
    t=" | ".join(re.findall(r'text="([^"]+)"',x))[:330]
    subprocess.run(f"adb exec-out screencap -p > g1/dv-{name}.png",shell=True)
    print(f"[{name}] {t}",flush=True)
B=(24.964727,66.999026)
snap("00-start",1)
for i in range(3): inj(B[0]+i*4e-5,B[1]+i*4e-5,5); time.sleep(2)
snap("01-good-5m")
inj(B[0]+2e-4,B[1]+2e-4,150); time.sleep(2); inj(B[0]+2.5e-4,B[1]+2.5e-4,150); snap("02-weak-150m")
inj(B[0]+3e-4,B[1]+3e-4,400); time.sleep(2); inj(B[0]+3.5e-4,B[1]+3.5e-4,400); snap("03-weak-400m")
inj(B[0]+4e-4,B[1]+4e-4,5); time.sleep(2); inj(B[0]+4.5e-4,B[1]+4.5e-4,5); snap("04-recovered")
inj(B[0]+6e-4,B[1]+6e-4,5,int(time.time()*1000)-120000); snap("05-stale-utc-2min")
inj(B[0]+4.5e-4,B[1]+4.5e-4,5); inj(B[0]+4.5e-4,B[1]+4.5e-4,5); snap("06-duplicate")
inj(B[0]+7e-4,B[1]+7e-4,5); time.sleep(1.5); inj(B[0]+5e-4,B[1]+5e-4,5,int(time.time()*1000)-20000); snap("07-out-of-order")
time.sleep(25); snap("08-silence-25s",0)
