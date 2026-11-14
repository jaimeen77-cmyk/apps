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
   for i in [veh,tsd,ccp,adas]:assert i not in desktop['proxies'] and i not in store['proxies']
  return store
# 1.2.50: the hidden speed limit data collection. At install, read-only: the vehicle speed (Vehicle2.statusCarSpeed2)
# and up to six fields whose names look like a speed limit, each only with a valid getter or notifier and a known
# instance (an existing proxy on another instance is left alone); desktop and Store agree; other apps get nothing.
veh='de.bmw.infotainment.vehicle.Vehicle2';tsd='de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl';ccp='de.bmw.infotainment.navigation.externalize.adasng.CCP'
adas='de.bmw.infotainment.navigation.ADAS';sdaf='de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions';sli='de.bmw.x.Other'
opt={cds+'2':'optional aux',kombi:'optional economy'}
def cat():
 d=copy.deepcopy(catalog)
 d['interfaces'][veh]={'fields':{'statusCarSpeed2':{'getter':{'id':7},'notifier':{'id':32775}}}};d['instanceIDs'][veh]={'1':1}
 d['interfaces'][tsd]={'fields':{'displaySpeedLimitAndNoPassingRestriction':{'notifier':{'id':32790}}}};d['instanceIDs'][tsd]={'1':1}
 d['interfaces'][ccp]={'events':{'effectiveSpeedLimit':{'eventId':32801},'speedLimitUnit':{'eventId':32802},'other':{'eventId':32803}}};d['instanceIDs'][ccp]={'Main_Instance':3}
 d['interfaces'][adas]={'fields':{'speedLimitProfileNavGraph2':{'getter':{'id':4}},'trafficSignNavGraph2':{'getter':{'id':5}}}};d['instanceIDs'][adas]={'1':1}
 d['interfaces'][sdaf]={'fields':{'displayStatusSpeedLimitAssist':{'notifier':{'id':32780}},'settingSpeedLimitAssist':{'getter':{'id':2},'notifier':{'id':32781}}}};d['instanceIDs'][sdaf]={'1':1}
 return d
for kind in ['full','none','bad_ids','cap','other_instance','other_app','school']:
 d=cat()
 if kind=='none':
  for i in [veh,tsd,ccp,adas,sdaf]:del d['interfaces'][i]
 if kind=='bad_ids':d['interfaces'][ccp]['events']['effectiveSpeedLimit']={'eventId':5};d['interfaces'][tsd]['fields']['displaySpeedLimitAndNoPassingRestriction']={'notifier':{'id':3}};d['interfaces'][veh]['fields']['statusCarSpeed2']={'getter':{'id':0}}
 if kind=='cap':d['interfaces'][sli]={'fields':{('speedLimit%d'%n):{'getter':{'id':10+n}} for n in range(8)}};d['instanceIDs'][sli]={'1':1}
 if kind=='school':d['interfaces'][sli]={'fields':{'schoolZoneInfo':{'getter':{'id':9}}}};d['instanceIDs'][sli]={'1':1}
 m=copy.deepcopy(manifest);m['proxies'][kombi]={'attributes':{'statusBordcomputerAverage':'rs'},'instances':'1'}
 if kind=='other_instance':d['instanceIDs'][adas]={'1':1,'2':2};d['interfaces'][adas]['fields']['routeX']={'getter':{'id':9}};m['proxies'][adas]={'instances':'2','attributes':{'routeX':'r'}}
 o=dict(opt) if kind!='other_app' else {}
 out=run(d,m,o,kind!='other_app');P=out['proxies']
 if kind=='other_app':continue
 if kind=='full':
  assert P[veh]=={'instances':'1','attributes':{'statusCarSpeed2':'rs'}},P[veh]
  assert P[tsd]=={'instances':'1','attributes':{'displaySpeedLimitAndNoPassingRestriction':'s'}},P[tsd]
  assert P[ccp]=={'instances':'Main_Instance','attributes':{},'broadcasts':['effectiveSpeedLimit','speedLimitUnit']},P[ccp]
  assert P[adas]['attributes']=={'speedLimitProfileNavGraph2':'r','trafficSignNavGraph2':'r'},P[adas]
  assert P[sdaf]['attributes']=={'displayStatusSpeedLimitAssist':'s'},('settings are not values',P[sdaf])
 if kind=='none':assert all(i not in P for i in [veh,tsd,ccp,adas,sdaf])
 if kind=='bad_ids':assert veh not in P and tsd not in P and P[ccp]['broadcasts']==['speedLimitUnit'],P.get(ccp)
 if kind=='cap':n=sum(len(P[i].get('attributes',{}))+len(P[i].get('broadcasts',[])) for i in [tsd,ccp,adas,sdaf,sli] if i in P);assert n==10,(n,P)
 if kind=='school':assert P[sli]['attributes'].get('schoolZoneInfo')=='r',P[sli]
 if kind=='other_instance':assert P[adas]=={'instances':'2','attributes':{'routeX':'r'}},P[adas]
tsr='de.bmw.dass.TrafficSignRecognition';camera='de.bmw.environmentalmodel.SignRecognitionFrontCamera'
d=cat()
for iface,event in [(tsr,'TrafficSignRecognition'),(camera,'TrafficSignRecognitionFrontCamera')]:
 d['interfaces'][iface]={'events':{event:{'eventId':32900}}};d['instanceIDs'][iface]={'1':1}
P=run(d,copy.deepcopy(manifest),dict(opt))['proxies']
assert P[tsr]['broadcasts']==['TrafficSignRecognition']
assert P[camera]['broadcasts']==['TrafficSignRecognitionFrontCamera']
print('PASS: traffic HUD TSR/camera events and speed-probe inputs installed read-only with desktop/Store parity')
