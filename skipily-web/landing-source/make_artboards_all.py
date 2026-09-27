#!/usr/bin/env python3
import re, pathlib, json

# stem in zip -> artboard file name
ARTBOARDS = {
    "index": "Main.dc.html",
    "en": "En.dc.html",
    "fr": "Fr.dc.html",
    "it": "It.dc.html",
    "es": "Es.dc.html",
    "nl": "Nl.dc.html",
}

POSTER = (
    '<div style="width:100%; height:100%; display:flex; flex-direction:column; '
    'align-items:center; justify-content:center; gap:18px; '
    'background:radial-gradient(circle at 50% 38%, #103257, #0B2545 70%)">'
    '<img src="logo.png" alt="Skipily" style="width:88px; height:88px; border-radius:22px; '
    'box-shadow:0 18px 40px -14px rgba(0,0,0,0.6)" />'
    '<div style="width:60px; height:60px; border-radius:50%; background:#F26B21; '
    'display:flex; align-items:center; justify-content:center; box-shadow:0 10px 26px -8px rgba(242,107,33,0.8)">'
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>'
    '</div>'
    '<span style="font-family:\'IBM Plex Mono\'; font-size:11.5px; letter-spacing:0.14em; '
    'text-transform:uppercase; color:rgba(255,255,255,0.6)">Video</span>'
    '</div>'
)

web = pathlib.Path("web")
for stem, name in ARTBOARDS.items():
    src = (web / f"{stem}.html").read_text(encoding="utf-8")
    src = re.sub(r'<template id="__bundler_thumbnail".*?</template>\s*', '', src, flags=re.S)
    src = re.sub(r'<title>.*?</title>\s*', '', src, flags=re.S)
    src = src.replace('src="media/', 'src="').replace("url('media/", "url('")
    src = re.sub(r'<iframe src="https://www\.youtube\.com/embed/.*?</iframe>', POSTER, src, flags=re.S)
    pathlib.Path(name).write_text(src, encoding="utf-8")
    print(f"{name}: youtube_gone={'youtube' not in src} media_left={src.count('media/')}")

# canvas.json: 6 artboards in a row, launch focused on the German master
W, H, GAP = 1240, 6000, 140
files = list(ARTBOARDS.values())
canvas = {
    "artboards": [
        {"file": f, "x": i * (W + GAP), "y": 0, "w": W, "h": H, "expand": "fill",
         "title": "Skipily " + {"Main.dc.html": "DE", "En.dc.html": "EN", "Fr.dc.html": "FR",
                                 "It.dc.html": "IT", "Es.dc.html": "ES", "Nl.dc.html": "NL"}[f]}
        for i, f in enumerate(files)
    ],
    "launch": {"view": "focused", "file": "Main.dc.html"},
}
pathlib.Path("canvas.json").write_text(json.dumps(canvas, indent=2), encoding="utf-8")
print("canvas.json:", [a["title"] for a in canvas["artboards"]])
