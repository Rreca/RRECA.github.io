"""
Genera iconos Android desde resources/icon.png
"""
from PIL import Image
import os

src = r'c:\nudos-ionic\resources\icon.png'
base = r'c:\nudos-ionic\android\app\src\main\res'

img = Image.open(src).convert('RGBA')

SIZES = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
}

for folder, size in SIZES.items():
    resized = img.resize((size, size), Image.LANCZOS)

    # ic_launcher.png — cuadrado
    path = os.path.join(base, folder, 'ic_launcher.png')
    resized.save(path, 'PNG')
    print(f'  ✓ {folder}/ic_launcher.png ({size}x{size})')

    # ic_launcher_foreground.png — igual al cuadrado
    path = os.path.join(base, folder, 'ic_launcher_foreground.png')
    resized.save(path, 'PNG')
    print(f'  ✓ {folder}/ic_launcher_foreground.png ({size}x{size})')

    # ic_launcher_round.png — recortado en círculo
    mask = Image.new('L', (size, size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(resized, mask=mask)
    path = os.path.join(base, folder, 'ic_launcher_round.png')
    result.save(path, 'PNG')
    print(f'  ✓ {folder}/ic_launcher_round.png ({size}x{size})')

print('\nTodos los iconos generados correctamente.')
