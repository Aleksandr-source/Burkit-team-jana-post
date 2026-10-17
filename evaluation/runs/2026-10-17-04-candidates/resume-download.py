from pathlib import Path
import json,subprocess,hashlib,os,signal,time
root=Path('/home/suprimee/Documents/GitHub/Burkit-team-jana-post');out=root/'evaluation/runs/2026-10-17-04-candidates';pin=next(x for x in json.loads((out/'model-pins.json').read_text()) if x['id']=='Qwen3-1.7B');partial=Path(pin['path']+'.part')
pid=72970
try:
 cmd=Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
 assert b'curl' in cmd and str(partial).encode() in cmd
 os.kill(pid,signal.SIGTERM)
 for _ in range(100):
  if not Path(f'/proc/{pid}').exists():break
  time.sleep(.1)
 assert not Path(f'/proc/{pid}').exists()
except FileNotFoundError:pass
start_size=partial.stat().st_size
for attempt in range(1,11):
 print('resume attempt',attempt,'bytes',partial.stat().st_size,flush=True)
 with (out/'Qwen3-1.7B-resume.log').open('a') as log:
  code=subprocess.run(['curl','--fail','--location','--connect-timeout','20','--speed-limit','1024','--speed-time','30','--max-time','1800','--continue-at','-','--output',str(partial),pin['url']],stdout=log,stderr=subprocess.STDOUT).returncode
 if code==0:break
 time.sleep(2)
else:raise RuntimeError('Resume failed after bounded retries')
h=hashlib.sha256()
with partial.open('rb') as f:
 for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
assert h.hexdigest()==pin['sha256'],'Checksum mismatch'
partial.rename(pin['path']);(out/'Qwen3-1.7B-installed.json').write_text(json.dumps({'verified':True,**pin},indent=2));(out/'installation-complete.json').write_text(json.dumps({'complete':True,'resumed':True,'resumed_from_bytes':start_size}));print('VERIFIED Qwen3-1.7B',flush=True)
