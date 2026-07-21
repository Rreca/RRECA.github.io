"""
Genera iconos y splash screen para Android desde resources/icon.png
"""
from PIL import Image, ImageDraw
import os

SRC = r'c:\nudos-ionic\resources\icon.png'
RES = r'c:\nudos-ionic\android\app\src\main\res'

src = Image.open(SRC).convert('RGBA')

# ─── ICONOS ──────────────────────────────────────────────────────────────────

ICON_SIZES = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
}

print('Generando iconos...')
for folder, size in ICON_SIZES.items():
    resized = src.resize((size, size), Image.LANCZOS)

    for name in ['ic_launcher.png', 'ic_launcher_foreground.png']:
        path = os.path.join(RES, folder, name)
        resized.save(path, 'PNG')
        print(f'  ✓ {folder}/{name} ({size}x{size})')

    # Round — recortado en círculo
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(resized, mask=mask)
    path = os.path.join(RES, folder, 'ic_launcher_round.png')
    result.save(path, 'PNG')
    print(f'  ✓ {folder}/ic_launcher_round.png ({size}x{size})')

# ─── SPLASH ───────────────────────────────────────────────────────────────────
# El splash es fondo blanco con el ícono centrado y padding generoso.
# Tamaños estándar para portrait y landscape.

SPLASH_PORTRAIT = {
    'drawable-port-mdpi':    (320,  480),
    'drawable-port-hdpi':    (480,  800),
    'drawable-port-xhdpi':   (720,  1280),
    'drawable-port-xxhdpi':  (960,  1600),
    'drawable-port-xxxhdpi': (1280, 1920),
    'drawable':              (720,  1280),  # default
}

SPLASH_LANDSCAPE = {
    'drawable-land-mdpi':    (480,  320),
    'drawable-land-hdpi':    (800,  480),
    'drawable-land-xhdpi':   (1280, 720),
    'drawable-land-xxhdpi':  (1600, 960),
    'drawable-land-xxxhdpi': (1920, 1280),
}

BG_COLOR = (255, 255, 255, 255)  # fondo blanco

def make_splash(w, h):
    splash = Image.new('RGBA', (w, h), BG_COLOR)
    # Tamaño del ícono = 30% del lado más corto
    icon_size = int(min(w, h) * 0.30)
    icon = src.resize((icon_size, icon_size), Image.LANCZOS)
    # Centrar
    x = (w - icon_size) // 2
    y = (h - icon_size) // 2
    splash.paste(icon, (x, y), icon)
    return splash.convert('RGB')

print('\nGenerando splash screens...')
for folder, (w, h) in {**SPLASH_PORTRAIT, **SPLASH_LANDSCAPE}.items():
    img = make_splash(w, h)
    path = os.path.join(RES, folder, 'splash.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    print(f'  ✓ {folder}/splash.png ({w}x{h})')

print('\n✅ Todos los assets generados correctamente.')
