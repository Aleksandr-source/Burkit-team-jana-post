from pathlib import Path
import urllib.request,json,hashlib,subprocess,time
r=Path('/home/suprimee/Documents/GitHub/Burkit-team-jana-post');o=r/'evaluation/runs/2026-10-17-04-candidates';weights=r/'.local-ai/evaluation-models';weights.mkdir(exist_ok=True)
repo='bartowski/Qwen_Qwen3-0.6B-GGUF'
with urllib.request.urlopen('https://huggingface.co/api/models/'+repo+'?blobs=true',timeout=60) as response:d=json.load(response)
(o/'Qwen3-0.6B-Q4_K_M-metadata.json').write_text(json.dumps(d,indent=2))
pins=[]
for model,repo,data in [('Qwen3-0.6B',repo,d),('Qwen3-1.7B','ggml-org/Qwen3-1.7B-GGUF',json.loads((o/'Qwen3-1.7B-metadata.json').read_text()))]:
 f=next(x for x in data['siblings'] if x['rfilename'].endswith('Q4_K_M.gguf'));pin={'id':model,'repo':repo,'revision':data['sha'],'file':f['rfilename'],'sha256':f['lfs']['sha256'],'bytes':f['size'],'path':str(weights/f['rfilename'])};pin['url']='https://huggingface.co/'+repo+'/resolve/'+data['sha']+'/'+f['rfilename'];pins.append(pin)
(o/'model-pins.json').write_text(json.dumps(pins,indent=2));print(json.dumps(pins,indent=2),flush=True)
for pin in pins:
 dest=Path(pin['path']);partial=Path(str(dest)+'.part')
 with (o/(pin['id']+'-download.log')).open('w') as log:
  code=subprocess.run(['curl','--fail','--location','--retry','3','--connect-timeout','30','--continue-at','-','--output',str(partial),pin['url']],stdout=log,stderr=subprocess.STDOUT).returncode
 if code:raise RuntimeError('Download failed '+pin['id'])
 h=hashlib.sha256()
 with partial.open('rb') as f:
  for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
 assert h.hexdigest()==pin['sha256'],'Checksum mismatch'
 partial.rename(dest)
 (o/(pin['id']+'-installed.json')).write_text(json.dumps({'verified':True,**pin},indent=2));print('VERIFIED',pin['id'],flush=True)
(o/'installation-complete.json').write_text(json.dumps({'complete':True}))
