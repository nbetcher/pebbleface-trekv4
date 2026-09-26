# Third-party notices

The project-level MIT license applies to the project source code only. It does
not relicense the third-party code, fonts, artwork, service data, trademarks, or
other materials identified below.

## Clay

The configuration page uses [`@rebble/clay`](https://github.com/pebble-dev/clay),
version 1.0.10, distributed under the MIT License.

Copyright (c) 2016 Pebble Technology

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Clay's compiled JavaScript also retains its upstream notices for its bundled
dependencies, including `deepcopy`, `ieee754`, and `tosource`.

## pebble-effect-layer

The inversion layer in `src/c/effect_layer.*` and `src/c/effects.*` is adapted
from [`pebble-effect-layer`](https://github.com/ygalanter/pebble-effect-layer),
version 1.5.0, by Yuriy Galanter and contributors. Its package metadata declares
the MIT License.

Copyright (c) Yuriy Galanter and pebble-effect-layer contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Antonio

`resources/fonts/Antonio-SemiBold.ttf` is distributed under the SIL Open Font
License 1.1. The complete notice is in `resources/fonts/Antonio-OFL.txt`.

## Open-Meteo

Weather and geocoding data are provided by
[`Open-Meteo`](https://open-meteo.com/) under CC BY 4.0. Attribution appears in
the configuration page and README.

## Unresolved bundled assets

`resources/fonts/LCARS.ttf` identifies itself as `Swiss911 UCm BT`, Copyright
1990-1992 Bitstream Inc., all rights reserved. The repository does not contain
an app-embedding or redistribution license for it. The origin and redistribution
terms of the image artwork are also undocumented. Do not treat the repository's
MIT license as covering those assets; clear or replace them before a public
release.

The project also uses Trek-, LCARS-, and Borg-related names and visual themes.
The repository contains no trademark, fan-work, or other brand-clearance record
for those uses. Treat that clearance as separate from the software and asset
copyright licenses.

## Distribution checklist

Do not distribute the PBW publicly until the unresolved bundled assets above
have been cleared or replaced. When distributing a cleared build, accompany it
with `LICENSE`, this file, and `resources/fonts/Antonio-OFL.txt` so the source,
Clay, pebble-effect-layer, and Antonio license notices travel with the binary.
