"""
Genera ic_stat_nudos.png para el tray de notificaciones Android.
Android requiere ícono blanco sobre fondo transparente.
"""
from PIL import Image, ImageDraw
import os, math

RES = r'c:\nudos-ionic\android\app\src\main\res'

SIZES = {
    'drawable-mdpi':    24,
    'drawable-hdpi':    36,
    'drawable-xhdpi':   48,
    'drawable-xxhdpi':  72,
    'drawable-xxxhdpi': 96,
}

def draw_notif_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 24.0
    w = max(1, int(1.8 * s))
    white = (255, 255, 255, 255)

    def bezier(p0, p1, p2, p3, steps=30):
        pts = []
        for i in range(steps + 1):
            t = i / steps
            x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
            y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]
            pts.append((x*s, y*s))
        return pts

    def curve(pts):
        if len(pts) >= 2:
            draw.line(pts, fill=white, width=w, joint='curve')

    # Loop izquierdo
    curve(bezier((8,5),(4,5),(3,10),(6,12)))
    curve(bezier((6,12),(9,14),(11,10),(9,8)))
    curve(bezier((9,8),(7,6),(4,7),(4.5,10)))
    curve(bezier((4.5,10),(5,13),(8,14.5),(11,13)))

    # Loop derecho
    curve(bezier((16,5),(20,5),(21,10),(18,12)))
    curve(bezier((18,12),(15,14),(13,10),(15,8)))
    curve(bezier((15,8),(17,6),(20,7),(19.5,10)))
    curve(bezier((19.5,10),(19,13),(16,14.5),(13,13)))

    # Cola
    curve(bezier((12,13),(12,15),(12,17),(12,19)))

    # Colitas superiores
    curve(bezier((8,5),(9,3.5),(11,3),(12,4)))
    curve(bezier((16,5),(15,3.5),(13,3),(12,4)))

    # Punto de unión
    cr = max(2, int(1.5*s))
    cx, cy = int(12*s), int(4*s)
    draw.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill=white)

    return img

os.makedirs(r'c:\nudos-ionic\android\app\src\main\res\drawable-mdpi', exist_ok=True)
os.makedirs(r'c:\nudos-ionic\android\app\src\main\res\drawable-hdpi', exist_ok=True)
os.makedirs(r'c:\nudos-ionic\android\app\src\main\res\drawable-xhdpi', exist_ok=True)
os.makedirs(r'c:\nudos-ionic\android\app\src\main\res\drawable-xxhdpi', exist_ok=True)
os.makedirs(r'c:\nudos-ionic\android\app\src\main\res\drawable-xxxhdpi', exist_ok=True)

for folder, size in SIZES.items():
    img = draw_notif_icon(size)
    path = os.path.join(RES, folder, 'ic_stat_nudos.png')
    img.save(path, 'PNG')
    print(f'  ✓ {folder}/ic_stat_nudos.png ({size}x{size})')

print('Ícono de notificación generado.')
