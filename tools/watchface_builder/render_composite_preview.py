#!/usr/bin/env python3
"""
Renders a simulated composite preview of the AURA-OS Health Watchface
as it will appear running on the Amazfit Bip U screen (302 x 320 px)
with live telemetry: HR 76 BPM, Steps 10482, 342 kcal, 4.8 km, 68 PAI, 85% Batt, 18:24:32.
"""

import os
import shutil
from PIL import Image, ImageDraw, ImageFont

SRC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "build"))
PUBLIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../public"))
BRAIN_DIR = "/Users/ahmed/.gemini/antigravity/brain/17126c41-fdbe-4d96-b1c6-924f5c5ed216"

WIDTH = 302
HEIGHT = 320

def get_asset(index):
    path = os.path.join(SRC_DIR, f"{index:04d}.png")
    return Image.open(path).convert("RGBA")

def render_preview():
    # Base background (0000.png)
    canvas = get_asset(0).copy()

    # 1. Bluetooth Icon (Connected = 48) at (16, 12)
    canvas.alpha_composite(get_asset(48), (16, 12))

    # 2. Weekday (THU = 27) at (44, 12)
    canvas.alpha_composite(get_asset(27), (44, 12))

    # 3. Date (11 / 05)
    # Month '11'
    canvas.alpha_composite(get_asset(12 + 1), (96, 10))
    canvas.alpha_composite(get_asset(12 + 1), (110, 10))
    # Delimiter '/'
    canvas.alpha_composite(get_asset(50), (126, 10))
    # Day '05'
    canvas.alpha_composite(get_asset(12 + 0), (138, 10))
    canvas.alpha_composite(get_asset(12 + 5), (152, 10))

    # 4. Battery Text '85%' + Battery Icon
    canvas.alpha_composite(get_asset(12 + 8), (224, 10))
    canvas.alpha_composite(get_asset(12 + 5), (238, 10))
    canvas.alpha_composite(get_asset(31), (252, 10))
    canvas.alpha_composite(get_asset(36), (268, 14)) # 100% full icon

    # 5. Digital Clock: 18 : 24 : 32
    # Hours '18'
    canvas.alpha_composite(get_asset(1 + 1), (26, 50))
    canvas.alpha_composite(get_asset(1 + 8), (62, 50))
    # Colon ':'
    canvas.alpha_composite(get_asset(11), (100, 50))
    # Minutes '24'
    canvas.alpha_composite(get_asset(1 + 2), (120, 50))
    canvas.alpha_composite(get_asset(1 + 4), (156, 50))
    # Seconds '32'
    canvas.alpha_composite(get_asset(51 + 3), (224, 60))
    canvas.alpha_composite(get_asset(51 + 2), (248, 60))

    # 6. Pulse: '76' BPM + Pulse Zone Gauge (Zone 3/6)
    canvas.alpha_composite(get_asset(12 + 7), (56, 144))
    canvas.alpha_composite(get_asset(12 + 6), (72, 144))
    canvas.alpha_composite(get_asset(37 + 2), (172, 146))

    # 7. Steps: '10482' + Steps Progress Bar (75% = index 46)
    step_digits = [1, 0, 4, 8, 2]
    for i, d in enumerate(step_digits):
        canvas.alpha_composite(get_asset(12 + d), (14 + i * 14, 204))
    canvas.alpha_composite(get_asset(46), (16, 230))

    # 8. Calories: '342' + Calories Progress Bar (index 63)
    cal_digits = [3, 4, 2]
    for i, d in enumerate(cal_digits):
        canvas.alpha_composite(get_asset(12 + d), (162 + i * 14, 204))
    canvas.alpha_composite(get_asset(63), (166, 230))

    # 9. Distance: '4.82' + 'km'
    dist_digits = [4]
    canvas.alpha_composite(get_asset(12 + 4), (14, 268))
    canvas.alpha_composite(get_asset(22), (28, 268)) # decimal
    canvas.alpha_composite(get_asset(12 + 8), (36, 268))
    canvas.alpha_composite(get_asset(12 + 2), (50, 268))
    canvas.alpha_composite(get_asset(23), (68, 268)) # 'km'

    # 10. PAI: '68'
    canvas.alpha_composite(get_asset(12 + 6), (162, 268))
    canvas.alpha_composite(get_asset(12 + 8), (176, 268))

    # Save 1x preview
    out_1x = os.path.join(PUBLIC_DIR, "aura_os_health_preview.png")
    canvas.save(out_1x, "PNG")
    print(f"Saved 1x preview to {out_1x}")

    # Create 2x framed watch preview with bezel and curved chassis
    scale = 2
    bezel_w = (WIDTH + 36) * scale
    bezel_h = (HEIGHT + 44) * scale
    framed = Image.new("RGBA", (bezel_w, bezel_h), (0, 0, 0, 0))
    f_draw = ImageDraw.Draw(framed)

    # Watch casing (matte black / gunmetal rounded chassis)
    f_draw.rounded_rectangle([0, 0, bezel_w - 1, bezel_h - 1], radius=28 * scale, fill=(18, 22, 30, 255), outline=(45, 55, 72, 255), width=2 * scale)
    # Inner bezel screen glass
    screen_x = 18 * scale
    screen_y = 22 * scale
    f_draw.rounded_rectangle([screen_x - 2, screen_y - 2, screen_x + WIDTH * scale + 1, screen_y + HEIGHT * scale + 1], radius=10 * scale, fill=(0, 0, 0, 255))
    
    # Scale canvas
    screen_scaled = canvas.resize((WIDTH * scale, HEIGHT * scale), Image.Resampling.NEAREST)
    framed.alpha_composite(screen_scaled, (screen_x, screen_y))

    # Right side hardware button
    btn_y = (HEIGHT // 2 + 10) * scale
    f_draw.rounded_rectangle([bezel_w - 6, btn_y, bezel_w - 1, btn_y + 36 * scale], radius=3 * scale, fill=(74, 85, 104, 255))

    out_framed = os.path.join(PUBLIC_DIR, "aura_watch_framed.png")
    framed.save(out_framed, "PNG")
    print(f"Saved framed watch preview to {out_framed}")

    # Copy to brain dir
    brain_framed = os.path.join(BRAIN_DIR, "aura_watch_framed.png")
    shutil.copy(out_framed, brain_framed)
    print(f"Copied to brain: {brain_framed}")

if __name__ == "__main__":
    render_preview()
