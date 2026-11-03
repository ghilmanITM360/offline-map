import subprocess,time,re
def sh(*a): return subprocess.run(a,capture_output=True,text=True).stdout
def inj(lat,lng,acc=5): subprocess.run(["adb","shell","cmd","location","providers","set-test-provider-location","gps","--location",f"{lat:.6f},{lng:.6f}","--accuracy",str(acc),"--time",str(int(time.time()*1000))])
def txt():
    sh("adb","shell","uiautomator","dump","/sdcard/u.xml"); x=sh("adb","shell","cat","/sdcard/u.xml"); return " | ".join(re.findall(r'text="([^"]+)"',x))[:260]
subprocess.run(["adb","logcat","-c"])
B=(24.964727,66.999026)
for i in range(12):
    sh("adb","emu","sensor","set","acceleration",f"{(i%2)*6}:9.8:{(i%3)*4}")
    inj(B[0]+i*1.5e-4,B[1]+i*1.5e-4); time.sleep(1.5)
    if i in (3,7,11): print(i,txt(),flush=True)
sh("adb","emu","sensor","set","acceleration","0:9.8:0")
print(sh("bash","-c","adb logcat -d | grep -c 'too fast'"),sh("bash","-c","adb logcat -d | grep FusedLocation | grep -v 'too fast' | cut -c1-170 | tail -4"))
