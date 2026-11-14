"""Run actual Store and desktop field filters against partial vehicle catalogs."""
import copy,importlib.util,json,re,subprocess,tempfile,sys
from pathlib import Path
R=Path(__file__).resolve().parent.parent
I=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else R
spec=importlib.util.spec_from_file_location('integration',R/'tools/upstream-integration.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
source=mod.installer_source((I/'deploy/mgu-app-install.sh').read_text());assert mod.installer_source(source)==source
start=re.search(r'^optional_missing\(\) \{',source,re.M).start();end=source.index('\n}\n\n',start)+3;function=source[start:end]
cds='de.bmw.infotainment.vehicle.CDS';fes='de.bmw.infotainment.drivingexcitement.FES';env='de.bmw.infrastructure.EnvironmentalInformation'
fields={cds:['statusEngineSpeed2','statusEngineTemperature','statusBattery2'],fes:['statusActualValueTorque2','statusSwitchDriveDynamicSport2'],cds+'2':['statusInjectionVolume','statusLateralAccelerationMassCenter','statusLongitudinalAccelerationMassCenter'],env:['UnitBN2020','ExteriorTemperature'],'de.bmw.infotainment.KombiIF':['statusBordcomputerAverage']}
extras=[(i,k) for i,keys in fields.items() for k in keys if k not in ['statusEngineSpeed2','statusActualValueTorque2','UnitBN2020']]
catalog={'interfaces':{i:{'fields':{k:{'getter':{'id':n+1},'notifier':{'id':32770+n}} for n,k in enumerate(keys)}} for i,keys in fields.items()},'instanceIDs':{i:{'1':1} for i in fields}}
manifest={'proxies':{i:{'attributes':{k:'rs' for k in keys},'instances':'1'} for i,keys in fields.items()}}
kombi='de.bmw.infotainment.KombiIF';tpms='de.bmw.infotainment.vehicle.TPMS'
def run(d,m,opt,parity=True):
 with tempfile.TemporaryDirectory(prefix='trip-tyres-') as tmp:
  p=Path(tmp);stage=p/'app';(stage/'source/javascript/kit').mkdir(parents=True)
  script=p/'test.sh';script.write_text('NODE="$(command -v node)"\nCATALOG="$1"\n'+function+'\noptional_missing "$2"\n')
  (p/'catalog.json').write_text(json.dumps(d));(stage/'meta.json').write_text(json.dumps({'id':'cluster_redline','optional':opt}));(stage/'source/manifest.json').write_text(json.dumps(m))
  subprocess.run(['sh',str(script),str(p/'catalog.json'),str(stage)],check=True,capture_output=True)
  desktop=json.loads((stage/'source/manifest.json').read_text())
  (p/'input.json').write_text(json.dumps({'manifest':m,'catalog':d,'optional':opt}))
  js="const fs=require('fs'),m=require(process.argv[1]),d=JSON.parse(fs.readFileSync(process.argv[2]));console.log(JSON.stringify(m.filterOptionalProxies(d.manifest,d.catalog,d.optional)));"
  store=json.loads(subprocess.check_output(['node','-e',js,str(R/'tools/store-build.js'),str(p/'input.json')],text=True))
  if parity:assert desktop==store,(desktop,store)
  else:
   for i in [veh,sli]:assert i not in desktop['proxies'] and i not in store['proxies']
  return store
# 1.2.50: the hidden speed limit data collection. At install, read-only: the vehicle speed (Vehicle2.statusCarSpeed2)
# and up to six fields whose names look like a speed limit, each only with a valid getter or notifier and a known
# instance (an existing proxy on another instance is left alone); desktop and Store agree; other apps get nothing.
veh='de.bmw.infotainment.vehicle.Vehicle2';sli='de.bmw.infotainment.drivingassistance.SpeedLimitInfo'
opt={cds+'2':'optional aux',kombi:'optional economy'}
for kind in ['full','none','bad_ids','cap','other_instance','other_app','school']:
 d=copy.deepcopy(catalog);d['interfaces'][kombi]={'fields':{'statusBordcomputerAverage':{'getter':{'id':3},'notifier':{'id':32771}},'statusSpeedLimitDisplay':{'notifier':{'id':32790}}}};d['instanceIDs'][kombi]={'1':1}
 d['interfaces'][veh]={'fields':{'statusCarSpeed2':{'getter':{'id':7},'notifier':{'id':32775}}}};d['instanceIDs'][veh]={'1':1}
 d['interfaces'][sli]={'fields':{'trafficSignInfo':{'getter':{'id':2}},'currentSpeedLimit':{'getter':{'id':1},'notifier':{'id':32769}},'speedLimiterState':{'getter':{'id':3}}}};d['instanceIDs'][sli]={'Main_Instance':5}
 if kind=='none':del d['interfaces'][sli];del d['interfaces'][veh];del d['interfaces'][kombi]['fields']['statusSpeedLimitDisplay']
 if kind=='bad_ids':d['interfaces'][sli]['fields']['currentSpeedLimit']={'getter':{'id':40000},'notifier':{'id':5}};d['interfaces'][veh]['fields']['statusCarSpeed2']={'getter':{'id':0}}
 if kind=='school':d['interfaces'][sli]['fields']={'schoolZoneInfo':{'getter':{'id':9}}}
 if kind=='cap':d['interfaces'][sli]['fields'].update({('speedLimit%d'%n):{'getter':{'id':10+n}} for n in range(8)})
 m=copy.deepcopy(manifest);m['proxies'][kombi]={'attributes':{'statusBordcomputerAverage':'rs'},'instances':'1'}
 if kind=='other_instance':d['instanceIDs'][kombi]={'1':1,'2':2};m['proxies'][kombi]['instances']='2'
 o=dict(opt) if kind!='other_app' else {}
 out=run(d,m,o,kind!='other_app');P=out['proxies']
 if kind=='other_app':assert veh not in P and sli not in P and 'statusSpeedLimitDisplay' not in P[kombi]['attributes'],P;continue
 if kind=='school':assert P[sli]['attributes'].get('schoolZoneInfo')=='r',P[sli]
 if kind=='full':
  assert P[veh]=={'instances':'1','attributes':{'statusCarSpeed2':'rs'}},P[veh]
  assert P[sli]=={'instances':'Main_Instance','attributes':{'currentSpeedLimit':'rs','speedLimiterState':'r','trafficSignInfo':'r'}},P[sli]
  assert P[kombi]['attributes']=={'statusBordcomputerAverage':'rs','statusSpeedLimitDisplay':'s'},P[kombi]
 if kind=='none':assert veh not in P and sli not in P
 if kind=='bad_ids':assert veh not in P and 'currentSpeedLimit' not in P[sli]['attributes']
 if kind=='cap':n=sum(1 for i in P for k in P[i].get('attributes',{}) if re.search(r'speed.?limit|trafficsign',k,re.I));assert n==6,(n,P)
 if kind=='other_instance':assert 'statusSpeedLimitDisplay' not in P.get(kombi,{}).get('attributes',{}),P.get(kombi)
print('PASS: speed limit data collection inputs (vehicle speed, up to six speed-limit fields) added read-only only with valid getters / notifiers and instances, Cluster Redline only; desktop and Store agree')
