---
url: https://nodejs.org/docs/v24.21.0/api/intl.html
retrieved: 2026-10-04
command: http-keyless scrape https://nodejs.org/docs/v24.21.0/api/intl.html
statusCode: 200
transport: http-keyless
completeness: partial
omitted: only 411 characters of main content were extracted (below the 1500-character bar); 8 sibling section(s) totalling ~1322 words were outside the densest block and are not in this capture
title: Internationalization support | Node.js v24.21.0 Documentation
---
#### Embed the entire ICU (`full-icu`) [#](#embed-the-entire-icu-full-icu)

 This option makes the resulting binary link against ICU statically and include
a full set of ICU data. A binary created this way has no further external
dependencies and supports all locales, but might be rather large. This is
the default behavior if no `--with-intl` flag is passed. The official binaries
are also built in this mode.
