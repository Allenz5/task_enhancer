# 来源 → 可接受的 slug 集合（多值＝该来源本身跨品类，命中任一即算对）
TRUTH = {
 'opensim':['x-motion-capture-biomechanics-lab'],
 'pose2sim':['x-motion-capture-biomechanics-lab'],
 'sports2d':['x-motion-capture-biomechanics-lab'],
 'opencap':['x-motion-capture-biomechanics-lab'],
 'uci.edu':['x-research-dataset-repository'],
 'openml':['x-research-dataset-repository'],
 'fashion-mnist':['x-research-dataset-repository'],
 'nasa c-mapss':['x-research-dataset-repository'],
 'skab':['x-research-dataset-repository'],
 'vasp':['x-atomistic-simulation-package'],
 'lammps':['x-atomistic-simulation-package'],
 'mamico':['x-atomistic-simulation-package'],
 'cp2k':['x-atomistic-simulation-package'],
 'm3gnet':['x-atomistic-simulation-package','x-materials-property-database'],
 'mattersim':['x-atomistic-simulation-package','x-materials-property-database'],
 'materials project':['x-materials-property-database'],
 'federal register':['x-regulatory-registry'],
 'fda orange book':['x-regulatory-registry'],
 'ecfr':['x-regulatory-registry','x-government-statistics-portal'],          # 联邦法规汇编，两者都说得通
 'o*net':['x-government-statistics-portal'],
 'open power system data':['x-government-statistics-portal','x-research-dataset-repository'],
 'noaa':['x-government-statistics-portal','weather-data-software','gis'],    # NOAA 三者都是
 'open-meteo':['weather-data-software'],
 'github.com':['version-control-hosting','version-control-software','peer-code-review'],
 'alibaba open code review':['peer-code-review','version-control-hosting','version-control-software'],
 'higress':['ai-gateways','api-management'],
 'utah forge':['x-research-dataset-repository','x-seismic-waveform-data-center','x-seismic-processing-workstation'],
 'sentinel-2':['gis','precision-agriculture'],
 'flywire':['x-genomics-data-repository','x-research-dataset-repository'],
 'apache apisix':['ai-gateways','api-management'],
 'gtfs':['x-government-statistics-portal','public-transportation'],
}
# 明确排除：不是产品/是工具，不能当真值
EXCLUDE = {'scada','ttcrpy'}
