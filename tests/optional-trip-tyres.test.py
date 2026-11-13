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
# 1.2.46: driving time (KombiIF) and TPMS tyre data are added at install, read-only, only when the car's
# catalog defines them with a getter (TPMS also needs instance "1"); desktop and Store agree.
kombi='de.bmw.infotainment.KombiIF';tpms='de.bmw.infotainment.vehicle.TPMS'
def run(d,m,opt):
 with tempfile.TemporaryDirectory(prefix='trip-tyres-') as tmp:
  p=Path(tmp);stage=p/'app';(stage/'source/javascript/kit').mkdir(parents=True)
  script=p/'test.sh';script.write_text('NODE="$(command -v node)"\nCATALOG="$1"\n'+function+'\noptional_missing "$2"\n')
  (p/'catalog.json').write_text(json.dumps(d));(stage/'meta.json').write_text(json.dumps({'id':'cluster_redline','optional':opt}));(stage/'source/manifest.json').write_text(json.dumps(m))
  subprocess.run(['sh',str(script),str(p/'catalog.json'),str(stage)],check=True,capture_output=True)
  desktop=json.loads((stage/'source/manifest.json').read_text())
  (p/'input.json').write_text(json.dumps({'manifest':m,'catalog':d,'optional':opt}))
  js="const fs=require('fs'),m=require(process.argv[1]),d=JSON.parse(fs.readFileSync(process.argv[2]));console.log(JSON.stringify(m.filterOptionalProxies(d.manifest,d.catalog,d.optional)));"
  store=json.loads(subprocess.check_output(['node','-e',js,str(R/'tools/store-build.js'),str(p/'input.json')],text=True))
  assert desktop==store,(desktop,store);return store
opt={cds+'2':'optional aux',kombi:'optional economy'}
for kind in ['full','no_tpms','no_instance','notifier_only','no_travel']:
 d=copy.deepcopy(catalog);d['interfaces'][kombi]={'fields':{'statusBordcomputerAverage':{'getter':{'id':3},'notifier':{'id':32771}},'statusBordcomputerTravelData':{'getter':{'id':4},'notifier':{'id':32772}}}};d['instanceIDs'][kombi]={'1':1}
 d['interfaces'][tpms]={'fields':{'statusTyreTemperature':{'getter':{'id':5}},'statusTyrePressure':{'getter':{'id':6}}}};d['instanceIDs'][tpms]={'1':1}
 if kind=='no_tpms':del d['interfaces'][tpms]
 if kind=='no_instance':d['instanceIDs'][tpms]={'Other':2}
 if kind=='notifier_only':d['interfaces'][tpms]['fields']={'statusTyreTemperature':{'notifier':{'id':32773}},'statusTyrePressure':{'notifier':{'id':32774}}}
 if kind=='no_travel':del d['interfaces'][kombi]['fields']['statusBordcomputerTravelData']
 m=copy.deepcopy(manifest);m['proxies'][kombi]={'attributes':{'statusBordcomputerAverage':'rs'},'instances':'1'}
 out=run(d,m,opt);k=out['proxies'][kombi]['attributes'];t=out['proxies'].get(tpms)
 assert k['statusBordcomputerAverage']=='rs',kind
 if kind=='no_travel':assert 'statusBordcomputerTravelData' not in k
 else:assert k['statusBordcomputerTravelData']=='rs',(kind,k)
 if kind=='full':assert t=={'instances':'1','attributes':{'statusTyreTemperature':'r','statusTyrePressure':'r'}},t
 else:
  if kind!='no_travel':assert t is None,(kind,t)
print('PASS: driving time and TPMS tyre data added read-only only when the catalog has getters (TPMS on instance 1); desktop and Store agree')
