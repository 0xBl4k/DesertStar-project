# NASA scene assets

All surface imagery used by the 3D scene is NASA-derived. Lighting, bloom and atmospheric scattering are rendering effects, not NASA observations. Positions use the repository's NASA/JPL NAIF SPICE Moon-centered ephemeris.

## lunar-reference.jpg

NASA/SVS; Ernie Wright; LRO/LROC; polar fill from LOLA

Source: https://svs.gsfc.nasa.gov/4720/
Asset: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg

Original 2048x1024 JPEG, unchanged.

## moon-lola-height.png

NASA/SVS; LRO/LOLA

Source: https://svs.gsfc.nasa.gov/4720/
Asset: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif

1440x720 float-km DEM converted to 8-bit display displacement; -8.878499984741211 to 10.504000663757324 km relative to 1737.4 km. Fallback geometry only; quantization about 76 m.

## sun-nasa-euv.jpg

NASA JPL; SDO/AIA and STEREO/EUVI

Source: https://svs.gsfc.nasa.gov/30362/
Asset: https://svs.gsfc.nasa.gov/vis/a030000/a030300/a030362/euvi_aia304_2012_carrington.tif

Full 360-degree Carrington map, resized from 4104x2304 to 2048x1024 JPEG. Historical false-color EUV illustration, not observations at the selected 2026/2027 date.

## earth-clouds.jpg

NASA GSFC; Reto Stockli; Robert Simmon; MODIS

Source: https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/
Asset: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg

2048x1024 source converted to grayscale JPEG for alpha. Historical composite, not current weather; illustrative slow cloud drift.

The NASA EO file server returned HTTP 503 during retrieval. This NASA image was obtained from Penn State's archival educational mirror: https://phys23p.sl.psu.edu/phys_anim/astro/parallax/cloud_combined_2048.jpg
Source and delivered checksums are recorded in `nasa-sources.json`.

## earth-day.jpg

NASA GSFC/SVS; Reto Stockli; NASA Earth Observatory

Source: https://svs.gsfc.nasa.gov/2915/
Asset: https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png

2048x1024 PNG converted to JPEG. Historical surface mosaic.

## NASA Moon mesh

`../models/nasa-moon-color.glb`: NASA/SVS LRO color/topographic model, Ernie Wright. https://svs.gsfc.nasa.gov/14959/
The original geometry is preserved; the current NASA cylindrical color map is projected in Moon-fixed coordinates onto its atlas geometry.

NASA texture maps are visual products, not operational terrain-visibility data. Local visibility is calculated separately by the DesertStar backend. NASA media guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/
