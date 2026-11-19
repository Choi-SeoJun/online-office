"""Generate official neighborhood points from the attributed KMA 2610 ZIP.
Usage: python scripts/generate-korea-local-points.py path/to/kma-2610.zip
Requires openpyxl; the original ZIP is not shipped in the game.
"""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

import openpyxl

root = Path(__file__).resolve().parent.parent
data = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(data).hexdigest() == '9dfd7dc2d422318154d3484fb00142afa3c5271fc14d079adf997043a14b86ba', 'Unexpected KMA source version'
archive = zipfile.ZipFile(io.BytesIO(data))
workbook = openpyxl.load_workbook(io.BytesIO(archive.read(next(n for n in archive.namelist() if n.endswith('.xlsx')))), read_only=True, data_only=True)
rows = [r for r in workbook.worksheets[0].iter_rows(values_only=True) if r[0] == 'kor' and r[2] != '이어도']
province_ids = {r[2]: str(r[1]) for r in rows if not r[3]}
area_ids = {(r[2], r[3]): str(r[1]) for r in rows if r[3] and not r[4]}
points = []
for row in rows:
    code, province, area, dong = str(row[1]), row[2], row[3], row[4]
    pid = province_ids[province]
    if code == '3611000000':  # Sejong's repeated city level is not a separate choice.
        continue
    if dong:
        parent, level, label = (pid if pid == '3600000000' else area_ids[province, area]), 'neighborhood', dong
    elif area:
        split = re.fullmatch(r'(.+?시)(.+구)', area)
        parent = code[:4] + '000000' if split else pid
        level, label = ('district', split[2]) if split else ('district' if area.endswith('구') else 'city', area)
    else:
        parent, level, label = None, 'province', province
    points.append([code, pid, parent, level, label, round(float(row[14]), 6), round(float(row[13]), 6), int(row[5]), int(row[6])])
assert len({p[0] for p in points}) == len(points)
out = '// Generated from KMA 2026-09-30 administrative grid data. See docs/korea-weather-regions.md.\n'
out += '// [id, province, parent, level, label, latitude, longitude, nx, ny]\n'
out += "export const KOREA_LOCAL_POINTS: readonly (readonly [string, string, string | null, 'province' | 'city' | 'district' | 'neighborhood', string, number, number, number, number])[] = [\n"
out += ',\n'.join('  ' + json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in points)
out += '\n];\n'
(root / 'game/korea-local-points.ts').write_text(out, encoding='utf-8', newline='\n')
print(f'Generated {len(points)} points ({sum(p[3] == "neighborhood" for p in points)} neighborhoods)')
