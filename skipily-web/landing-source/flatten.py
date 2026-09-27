#!/usr/bin/env python3
"""Flatten Claude-Design x-dc canvas source into deployable static HTML."""
import re, pathlib

LANGS = {"index": "de", "en": "en", "fr": "fr", "it": "it", "es": "es", "nl": "nl"}
web = pathlib.Path("web")
out = pathlib.Path("dist_pages")
out.mkdir(exist_ok=True)

for stem, lang in LANGS.items():
    raw = (web / f"{stem}.html").read_text(encoding="utf-8")

    # helmet inner (goes to <head>)
    helmet = re.search(r"<helmet>(.*?)</helmet>", raw, re.S).group(1)
    # body content = everything between </helmet> and </x-dc>
    body = re.search(r"</helmet>(.*?)</x-dc>", raw, re.S).group(1)

    # clean helmet: drop the bundler thumbnail template and a duplicate viewport meta
    helmet = re.sub(r"<template id=\"__bundler_thumbnail\".*?</template>", "", helmet, flags=re.S)
    helmet = re.sub(r"<meta name=\"viewport\"[^>]*>\s*", "", helmet)  # we add one canonical viewport

    page = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{helmet.strip()}
</head>
<body>
{body.strip()}
</body>
</html>
"""
    (out / f"{stem}.html").write_text(page, encoding="utf-8")
    holes = page.count("{{")
    print(f"{stem}.html -> lang={lang}  x-dc removed={'<x-dc' not in page}  holes={holes}  youtube={'youtube' in page}")
