#!/usr/bin/env python3
"""Download the public speed camera list (공공데이터포털, 전국무인교통단속카메라표준데이터, publicDataPk 15028200)
the way the portal's own CSV button does (/download/columList.json, then /download/standard.json page by page).

    python3 tools/speed-cams/fetch.py cams-all.json
Then: python3 tools/speed-cams/build.py cams-all.json   (writes apps/cluster_redline/speed-cams-data.js)
"""
import json, math, subprocess, sys, time, urllib.parse
PK = '15028200'
BASE = 'https://www.data.go.kr'
def get(url):
    for attempt in range(5):
        out = subprocess.run(['curl', '-sS', '-m', '180', url], capture_output=True).stdout
        try:
            return json.loads(out)
        except ValueError:
            time.sleep(3 * (attempt + 1))
    raise SystemExit('failed: ' + url[:120])
def main():
    h = get(BASE + '/download/columList.json?pk=%s&ext=JSON' % PK)
    cols, total, per = h['tableVO']['colNmList'], h['totalCount'], 10000
    rows = []
    for page in range(1, math.ceil(total / per) + 1):
        q = [('publicDataPk', PK), ('svcTableNm', h['tableVO']['svcTableNm']), ('totalCount', str(total)), ('perPage', str(per)), ('page', str(page))] + [('colNmList', c) for c in cols]
        d = get(BASE + '/download/standard.json?' + urllib.parse.urlencode(q))
        print('page', page, len(d)); rows += d
    json.dump(rows, open(sys.argv[1], 'w'), ensure_ascii=False)
    print('records', len(rows))
if __name__ == '__main__':
    main()
