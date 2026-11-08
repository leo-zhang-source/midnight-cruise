#!/usr/bin/env python3
"""Fetch the CC0 Freesound samples used by the engine (high-quality previews), convert to 48 kHz WAV.
Usage: python3 tools/fetch_samples.py   (needs ffmpeg). Output: assets/src/<name>.<ext> and assets/samples/<name>.wav"""
import re, os, sys, json, urllib.request, subprocess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CANDIDATES = {
  'gated_snare': '/people/HenryRichard/sounds/451654/',
  'crash_f': '/people/minorr/sounds/104217/',
  'dx_snare3': '/people/oceansonmars/sounds/709715/',
  'sim_tom1': '/people/yaplasut1843/sounds/517933/',
  'hat909_c2': '/people/GRD-music-/sounds/414966/',
  'hat909_o4': '/people/GRD-music-/sounds/414964/',
  'kick909': '/people/GRD-music-/sounds/414970/',
  'clap808': '/people/Uberproduktion/sounds/455632/',
  'revcrash': '/people/rhythmpeople/sounds/165154/',
}
def get(u, binary=False):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    return r if binary else r.decode('utf-8', 'replace')
names = sys.argv[1:] or list(CANDIDATES)
meta = {}
for n in names:
    path = CANDIDATES[n]; page = get('https://freesound.org' + path)
    lic = 'CC0' if 'Creative Commons 0' in page or 'creativecommons.org/publicdomain/zero' in page else 'UNKNOWN'
    title = (re.search(r'<meta property="og:title" content="([^"]+)"', page) or re.search(r'<title>([^<]+)</title>', page)).group(1)
    prev = sorted(set(re.findall(r'https://cdn\.freesound\.org/previews/[^"]+', page)))
    hq = [p for p in prev if p.endswith('-hq.mp3')][0]
    for cand in (hq.replace('-hq.mp3', '-hq.ogg'), hq):
        try: data = get(cand, True); src = cand; break
        except Exception: continue
    ext = src.rsplit('.', 1)[1]; f = os.path.join(ROOT, 'assets/src', f'{n}.{ext}')
    open(f, 'wb').write(data)
    meta[n] = {'page': 'https://freesound.org' + path, 'title': title, 'license': lic, 'preview': src}
    print(f'{n:12s} {lic:7s} {ext} {len(data)//1024:5d} KB  {title}')
json.dump(meta, open(os.path.join(ROOT, 'assets/src/sources.json'), 'w'), indent=1)
