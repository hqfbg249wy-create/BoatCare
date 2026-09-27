#!/usr/bin/env python3
"""Inject a responsive stylesheet into the <style> block of each x-dc source page."""
import pathlib

RESPONSIVE = """
  /* --- Responsive / mobile (added) --- */
  @media (max-width: 820px) {
    /* collapse every multi-column grid to a single column */
    [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
    /* fluid phone mockups & fixed-width media */
    [style*="width:314px"], [style*="width:330px"], [style*="width:258px"] {
      width: 100% !important; max-width: 340px !important;
    }
    /* fluid display type */
    [style*="font-size:58px"] { font-size: clamp(30px, 8.5vw, 58px) !important; }
    [style*="font-size:46px"] { font-size: clamp(28px, 7.5vw, 46px) !important; }
    [style*="font-size:42px"] { font-size: clamp(26px, 6.8vw, 42px) !important; }
    [style*="font-size:32px"] { font-size: clamp(22px, 5.6vw, 32px) !important; }
    /* trim oversized section padding */
    [style*="padding:96px 28px"] { padding: 60px 20px !important; }
    [style*="padding:92px 28px 96px"] { padding: 56px 20px 60px !important; }
    [style*="padding:72px 28px 84px"] { padding: 44px 20px 52px !important; }
    [style*="padding:88px 64px"] { padding: 48px 22px !important; }
    [style*="min-height:560px"] { min-height: 340px !important; }
    /* declutter header: hide in-page anchor nav on phones */
    header nav a[href^="#"] { display: none !important; }
  }
"""

web = pathlib.Path("web")
for f in ["index", "en", "fr", "it", "es", "nl"]:
    p = web / f"{f}.html"
    s = p.read_text(encoding="utf-8")
    if "Responsive / mobile (added)" in s:
        # idempotent: strip previous injection first
        import re
        s = re.sub(r"\n  /\* --- Responsive / mobile \(added\) --- \*/.*?(?=\n</style>)", "", s, flags=re.S)
    assert s.count("</style>") >= 1, f"{f}: no </style>"
    s = s.replace("</style>", RESPONSIVE + "</style>", 1)
    p.write_text(s, encoding="utf-8")
    print(f"{f}.html: media queries now = {s.count('@media')}")
