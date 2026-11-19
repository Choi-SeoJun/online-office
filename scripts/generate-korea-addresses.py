"""Join current MOIS legal/admin codes to published KMA representative points.
Usage: python scripts/generate-korea-addresses.py path/to/mois-20261111.zip
The source ZIP is not shipped. See docs/korea-weather-regions.md.
"""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
data = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(data).hexdigest() == '5b4493acbb3d2a130ffc5a9d8fc2b2e860d1386156a7faef918b065fef91dcde', 'Unexpected MOIS source version'
archive = zipfile.ZipFile(io.BytesIO(data))
def rows(name):
    return [b for b in archive.read(name + '.20261111').splitlines()[1:] if b[:10].isdigit()]
def field(b, start, length=30):
    return b[start:start + length].decode('cp949').strip()
admin = {field(b, 0, 10): [field(b, i) for i in (11, 42, 73)] for b in rows('KIKcd_H') if field(b, 73)}
legal = {field(b, 0, 10): field(b, 73) for b in rows('KIKcd_B') if field(b, 73) and not field(b, 104)}
mapping = {code: set() for code in legal}
for b in rows('KIKmix'):
    aid, lid = field(b, 0, 10), field(b, 104, 10)
    if aid in admin and lid in mapping:
        mapping[lid].add(aid)
assert len(admin) == 3631 and len(legal) == 5067
assert all(mapping.values()), 'A legal neighborhood has no current administrative mapping'
points = json.loads((root / 'game/korea-local-points.ts').read_text(encoding='utf8').split(' = ', 1)[1].strip().removesuffix(';'))
by_id = {p[0]: p for p in points}
# Explicit representative fallbacks where a label prefix cannot identify a parent.
# These are not newly surveyed coordinates; the UI labels every fallback.
fallback_labels = {
    '4122067000': '고덕동', '4122068000': '고덕동',
    '4418032900': '오천면', '4824089000': '사천시', '4827025100': '삼랑진읍',
}
additions, renames = [], []
normalize = lambda s: re.sub(r'제(?=\d)', '', s)
for code, (_, _, label) in admin.items():
    if code in by_id:
        if normalize(by_id[code][4]) != normalize(label):
            renames.append([code, label])
        continue
    if code in fallback_labels:
        candidates = [p for p in points if p[0][:5] == code[:5] and p[4] == fallback_labels[code]]
    else:
        candidates = [p for p in points if p[3] == 'neighborhood' and p[0][:5] == code[:5] and label.startswith(p[4])]
    assert len(candidates) == 1, (code, label, 'Needs reviewed representative fallback', candidates)
    point = candidates[0]
    parent = point[2] if point[3] == 'neighborhood' else point[0]
    additions.append([code, parent, label, point[0]])
retired = [p[0] for p in points if p[3] == 'neighborhood' and p[0] not in admin and p[0] != '4794033000']
assert retired == ['4122066000'] and len(additions) == 68
assert set(admin) <= set(by_id) | {a[0] for a in additions}
def legal_parent(code):
    # Legal parent must not be inferred from administrative jurisdiction: these
    # can cross district boundaries (e.g. Anyang-dong / Bisan 1-dong).
    parent = code[:5] + '00000'
    if parent == '3611000000':
        parent = '3600000000'
    assert parent in by_id, (code, parent, 'Unknown legal address parent')
    return parent
out = '// Generated from MOIS 2026-11-11 codes. See docs/korea-weather-regions.md.\n'
def export(name, annotation, values):
    return f'export const {name}: {annotation} = [\n' + ',\n'.join('  ' + json.dumps(v, ensure_ascii=False, separators=(',', ':')) for v in values) + '\n];\n'
out += export('KOREA_ADMIN_ADDITIONS', 'readonly (readonly [string, string, string, string])[]', additions)
out += export('KOREA_ADMIN_RENAMES', 'readonly (readonly [string, string])[]', renames)
out += export('KOREA_RETIRED_ADMIN_IDS', 'readonly string[]', retired)
out += export('KOREA_ADDRESS_LINKS', 'readonly (readonly [string, string, readonly string[], string])[]', [[lid, name, sorted(mapping[lid]), legal_parent(lid)] for lid, name in legal.items()])
(root / 'game/korea-address-data.ts').write_text(out, encoding='utf8', newline='\n')
print(f'Generated {len(legal)} legal neighborhoods, {len(additions)} administrative additions, {len(renames)} spelling updates; unmapped: 0')
