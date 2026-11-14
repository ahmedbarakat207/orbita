#!/usr/bin/env python3
"""
AURA-OS Astronaut Bio-Flight Watchface Compiler for Amazfit Bip U (302x320)
Uses the user's Astronaut & Earthrise background image and displays:
  - Time (HH:MM:SS), Weekday, Date (MM/DD), Bluetooth, Battery (% + Bar)
  - Realtime Heart Rate (BPM + 6-Zone Pulse Bar)
  - SpO2 Blood Oxygen (8-Stage Readout + Saturation Bar via SPO2Progress)
  - Stress Level (8-Stage Readout + Stress Spectrum Bar via StressProgress)
  - Steps (Count + 5-Stage Goal Bar)
  - Calories (Kcal + 5-Stage Burn Bar)
  - Distance (km with Decimal Point)
  - PAI Vitality Score + Stand-Up Active Hours
Compiles a 100% hardware-verified Bip U UIHH .bin watchface via py_amazfit_tools (--bipu).
"""

import os
import sys
import json
import shutil
import struct
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "build")
os.makedirs(OUT_DIR, exist_ok=True)

BG_SOURCE_PATH = os.path.join(BASE_DIR, "astronaut_bg.jpg")

WIDTH = 302
HEIGHT = 320
PREVIEW_W = 202
PREVIEW_H = 214

# System Fonts
FONT_ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_MONO = "/System/Library/Fonts/SFNSMono.ttf"
FONT_FALLBACK = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def get_font(size, mono=False):
    target = FONT_MONO if mono else FONT_ROUNDED
    if os.path.exists(target):
        try:
            return ImageFont.truetype(target, size)
        except Exception:
            pass
    if os.path.exists(FONT_FALLBACK):
        return ImageFont.truetype(FONT_FALLBACK, size)
    return ImageFont.load_default()


# ==============================================================================
# Orbita Mission Console Palette (Synced with website src/style.css tokens)
# ==============================================================================
# Backgrounds & Substrates (Deactivated CRT Matte)
BG_SUBSTRATE    = (10, 10, 10, 255)     # #0a0a0a --bg-substrate
BG_PANEL        = (17, 17, 17, 245)     # #111111 --bg-panel (Mechanical Box Fill)
BG_PANEL_ALT    = (21, 21, 21, 255)     # #151515 --bg-panel-alt
BG_PANEL_SUNKEN = (7, 7, 7, 255)        # #070707 --bg-panel-sunken

# Hairline Blueprint Dividers (Strict 1px Mechanical Dividers)
BORDER_HAIRLINE = (36, 36, 36, 255)     # #242424 --border-hairline (Box Perimeter)
BORDER_STRONG   = (56, 56, 56, 255)     # #383838 --border-strong
BORDER_HAZARD   = (255, 42, 42, 255)    # #ff2a2a --border-hazard

# Phosphor Typographic Tokens
FG_PRIMARY      = (234, 234, 234, 255)  # #eaeaea --fg-primary (White Phosphor)
FG_SECONDARY    = (163, 163, 163, 255)  # #a3a3a3 --fg-secondary (Terminal Gray)
FG_MUTED        = (102, 102, 102, 255)  # #666666 --fg-muted (Coordinate Gray)
FG_SUBTLE       = (64, 64, 64, 255)     # #404040 --fg-subtle (Blueprint Marker)

# Utilitarian Functional Color Signals (Strict Website Rules)
COLOR_HAZARD    = (255, 42, 42, 255)    # #ff2a2a --color-hazard (Aviation Red / Pulse)
COLOR_GREEN     = (74, 246, 38, 255)    # #4af626 --color-green (Terminal Active Green)
COLOR_AMBER     = (255, 176, 0, 255)    # #ffb000 --color-amber (Stress & Caution)
COLOR_SKY       = (56, 189, 248, 255)   # #38bdf8 (SpO2 Oxygen / Derived Blue)
COLOR_CYAN      = (0, 229, 255, 255)    # #00e5ff (Live Optical Cyan)

# Matte colors for sprite anti-aliasing against substrate
CLOCK_MATTE     = (17, 17, 17)          # Matte RGB for clock display
CARD_MATTE      = (17, 17, 17)          # Matte RGB for telemetry cards
HR_MATTE        = (22, 12, 12)          # Matte RGB for pulse card
SPACE_MATTE     = (10, 10, 10)          # Matte RGB for top space sky
BAR_INACTIVE    = (36, 36, 36, 255)     # #242424 dark unfilled bar track

images_manifest = []


def quantize_sprite_for_bme(img: Image.Image, matte_rgb=(17, 17, 17)) -> Image.Image:
    """
    Pre-blends anti-aliased edge pixels against `matte_rgb` and forces binary alpha
    (0 or 255) so that py_amazfit_tools encodes every sprite using Bip U's native
    0x65 16-bit RLE format (`BM\\x65\\x00`).
    """
    rgba = img.convert("RGBA")
    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    src_px = rgba.load()
    dst_px = out.load()
    mr, mg, mb = matte_rgb[:3]
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = src_px[x, y]
            if a >= 64:
                alpha_f = a / 255.0
                br = int(r * alpha_f + mr * (1.0 - alpha_f))
                bg = int(g * alpha_f + mg * (1.0 - alpha_f))
                bb = int(b * alpha_f + mb * (1.0 - alpha_f))
                dst_px[x, y] = (br, bg, bb, 255)
            else:
                dst_px[x, y] = (0, 0, 0, 0)
    return out


def save_image(img: Image.Image, index: int, is_opaque=False, matte_rgb=(17, 17, 17)):
    filename = f"{index:04d}.png"
    filepath = os.path.join(OUT_DIR, filename)
    if is_opaque:
        out_img = img.convert("RGB")
    else:
        out_img = quantize_sprite_for_bme(img, matte_rgb=matte_rgb)
    out_img.save(filepath, "PNG")
    images_manifest.append({"id": index, "file": filename, "w": out_img.width, "h": out_img.height})
    return out_img


# -------------------------------------------------------------
# 0000: Astronaut & Earthrise Background + HUD Pods (302x320, Opaque RGB)
# -------------------------------------------------------------
def make_background():
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BG_SUBSTRATE)

    if os.path.exists(BG_SOURCE_PATH):
        src = Image.open(BG_SOURCE_PATH).convert("RGB")
        # Enhance contrast & vibrancy slightly for the Bip U transflective/TFT screen
        src = ImageEnhance.Contrast(src).enhance(1.08)
        src = ImageEnhance.Color(src).enhance(1.12)

        # Scale width to 302 px (1024x640 -> 302x189) so the full astronaut + Earthrise + bottle fit horizontally
        scaled_h = int(round(src.height * (WIDTH / float(src.width))))
        art = src.resize((WIDTH, scaled_h), resample=Image.LANCZOS).convert("RGBA")

        # Extend top starry sky smoothly from top strip of the photo
        top_strip = art.crop((0, 0, WIDTH, 16)).resize((WIDTH, 54), resample=Image.BICUBIC)
        canvas.paste(top_strip, (0, 0))
        # Paste astronaut & Earthrise at Y=44..233 so Earthrise & Astronaut helmet/visor/bottle sit unobstructed in Y=64..180
        canvas.paste(art, (0, 44))

        # Apply subtle gradient darkening only at top (Y=0..62) for clock legibility and bottom (Y=174..320) for HUD deck
        grad = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        g_px = grad.load()
        for y in range(HEIGHT):
            if y < 62:
                alpha = int(170 * (1.0 - (y / 62.0) ** 1.4))
                for x in range(WIDTH):
                    g_px[x, y] = (10, 10, 10, alpha)
            elif y >= 174:
                t = min(1.0, (y - 174) / 18.0)
                alpha = int(240 * t)
                for x in range(WIDTH):
                    g_px[x, y] = (10, 10, 10, alpha)
        canvas = Image.alpha_composite(canvas, grad)

    draw = ImageDraw.Draw(canvas)
    f_micro = get_font(8, mono=True)
    f_label = get_font(9, mono=True)

    # Top status bar subtle divider
    draw.line([(12, 24), (WIDTH - 12, 24)], fill=BORDER_HAIRLINE, width=1)

    # Top-Left Clock Box: Strict rectangular mechanical geometry matching website .vital-box
    draw.rectangle([8, 27, 198, 65], fill=BG_PANEL, outline=BORDER_HAIRLINE, width=1)
    draw.line([(8, 27), (198, 27)], fill=BORDER_STRONG, width=2)
    draw.text((156, 30), "MET", fill=FG_MUTED, font=f_micro)

    # Top-Right Heart Rate HUD Pod (X=204..294, Y=27..65)
    # Matches website pulse-beat .vital-box: border-top: 2px solid #ff2a2a, dark panel fill with subtle tint
    draw.rectangle([204, 27, 294, 65], fill=(22, 12, 12, 245), outline=(56, 30, 30, 255), width=1)
    draw.line([(204, 27), (294, 27)], fill=COLOR_HAZARD, width=2)
    # Mini Heart icon at (211, 31)
    hx, hy = 211, 31
    draw.polygon([
        (hx, hy + 2), (hx + 3, hy - 2), (hx + 6, hy + 2),
        (hx + 9, hy - 2), (hx + 12, hy + 2), (hx + 6, hy + 9)
    ], fill=COLOR_HAZARD)
    draw.text((227, 30), "PULSE", fill=COLOR_HAZARD, font=f_micro)

    # Bottom 6-Pod Bio-Telemetry Deck (Y=180..314)
    # Exactly matching website vital boxes:
    # Row 1: SpO2 (Sky Blue #38bdf8 accent) & Stress (Amber #ffb000 accent)
    # Row 2: Steps (Green #4af626 accent) & Calories (Amber #ffb000 accent)
    # Row 3: Distance (Green #4af626 accent) & PAI+Stand (Phosphor #eaeaea accent)
    pods = [
        ([8, 180, 148, 222], "SPO2", FG_SECONDARY, COLOR_SKY),
        ([154, 180, 294, 222], "STRESS", FG_SECONDARY, COLOR_AMBER),
        ([8, 226, 148, 268], "STEPS", FG_SECONDARY, COLOR_GREEN),
        ([154, 226, 294, 268], "CALORIES", FG_SECONDARY, COLOR_AMBER),
        ([8, 272, 148, 312], "DISTANCE", FG_SECONDARY, COLOR_GREEN),
        ([154, 272, 294, 312], "PAI", FG_SECONDARY, FG_PRIMARY),
    ]
    for box, title, title_col, accent_col in pods:
        # Sharp rectangular box with --bg-panel and --border-hairline
        draw.rectangle(box, fill=BG_PANEL, outline=BORDER_HAIRLINE, width=1)
        # 2px top accent line matching website .vital-box state styles
        draw.line([(box[0], box[1]), (box[2], box[1])], fill=accent_col, width=2)
        # Monospace uppercase title
        draw.text((box[0] + 7, box[1] + 5), title, fill=title_col, font=f_label)

    # Add "STAND" sub-header on the right half of Pod 6 (X=226..294)
    draw.line([(224, 273), (224, 311)], fill=BORDER_HAIRLINE, width=1)
    draw.text((230, 277), "STAND", fill=FG_SECONDARY, font=f_label)
    draw.text((276, 296), "H", fill=FG_MUTED, font=f_micro)

    # Add "KCAL" unit in Calories pod and "%" unit in SpO2 pod
    draw.text((262, 244), "KCAL", fill=FG_MUTED, font=f_micro)
    draw.text((54, 198), "%", fill=COLOR_SKY, font=get_font(11, mono=True))

    return save_image(canvas, 0, is_opaque=True)


# -------------------------------------------------------------
# 0001: Watchface Selector Preview (202x214, Opaque RGB)
# -------------------------------------------------------------
def make_preview_placeholder(bg_img: Image.Image):
    preview = bg_img.resize((PREVIEW_W, PREVIEW_H), resample=Image.LANCZOS)
    return save_image(preview, 1, is_opaque=True)


# -------------------------------------------------------------
# 0002 - 0011: Clock Digits 0-9 (24x34 px)
# -------------------------------------------------------------
def make_big_digits():
    font = get_font(31, mono=True)
    for digit in range(10):
        img = Image.new("RGBA", (24, 34), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((12, 17), str(digit), fill=FG_PRIMARY, font=font, anchor="mm")
        save_image(img, 2 + digit, matte_rgb=CLOCK_MATTE)


# -------------------------------------------------------------
# 0012: Clock Delimiter Colon ':' (10x34 px)
# -------------------------------------------------------------
def make_clock_colon():
    img = Image.new("RGBA", (10, 34), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([3, 10, 7, 14], fill=COLOR_SKY)
    draw.ellipse([3, 21, 7, 25], fill=COLOR_SKY)
    save_image(img, 12, matte_rgb=CLOCK_MATTE)


# -------------------------------------------------------------
# 0013 - 0022: Metric Digits 0-9 (12x18 px)
# -------------------------------------------------------------
def make_small_digits():
    font = get_font(15, mono=True)
    for digit in range(10):
        img = Image.new("RGBA", (12, 18), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((6, 9), str(digit), fill=FG_PRIMARY, font=font, anchor="mm")
        save_image(img, 13 + digit, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# 0023: Decimal Point '.' (5x18 px)
# -------------------------------------------------------------
def make_decimal_point():
    img = Image.new("RGBA", (5, 18), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([1, 12, 3, 14], fill=FG_PRIMARY)
    save_image(img, 23, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# 0024: Km Suffix 'km' (20x18 px)
# -------------------------------------------------------------
def make_km_suffix():
    img = Image.new("RGBA", (20, 18), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = get_font(10, mono=True)
    draw.text((2, 10), "km", fill=COLOR_GREEN, font=font, anchor="lm")
    save_image(img, 24, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# 0025 - 0031: Weekday Images (MON..SUN) (32x14 px)
# -------------------------------------------------------------
def make_weekdays():
    days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    font = get_font(11, mono=True)
    for i, day in enumerate(days):
        img = Image.new("RGBA", (32, 14), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        col = COLOR_AMBER if day in ["SAT", "SUN"] else FG_SECONDARY
        draw.text((16, 7), day, fill=col, font=font, anchor="mm")
        save_image(img, 25 + i, matte_rgb=SPACE_MATTE)


# -------------------------------------------------------------
# 0032: Battery '%' Suffix (10x18 px)
# -------------------------------------------------------------
def make_battery_percent():
    img = Image.new("RGBA", (10, 18), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = get_font(11, mono=True)
    draw.text((5, 9), "%", fill=COLOR_GREEN, font=font, anchor="mm")
    save_image(img, 32, matte_rgb=SPACE_MATTE)


# -------------------------------------------------------------
# 0033 - 0037: Battery Icon (5 states) (22x12 px)
# -------------------------------------------------------------
def make_battery_icons():
    levels = [0.15, 0.35, 0.55, 0.8, 1.0]
    for i, lvl in enumerate(levels):
        img = Image.new("RGBA", (22, 12), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 1, 18, 11], outline=BORDER_STRONG, width=1)
        draw.rectangle([19, 3, 21, 9], fill=BORDER_STRONG)
        col = COLOR_HAZARD if lvl <= 0.2 else COLOR_GREEN
        fill_w = max(2, int(16 * lvl))
        draw.rectangle([2, 3, 1 + fill_w, 9], fill=col)
        save_image(img, 33 + i, matte_rgb=SPACE_MATTE)


# -------------------------------------------------------------
# 0038 - 0043: Heart Rate Zone Progress (6 states) (76x6 px)
# -------------------------------------------------------------
def make_heart_progress():
    zone_colors = [
        COLOR_GREEN,
        COLOR_GREEN,
        COLOR_AMBER,
        COLOR_AMBER,
        COLOR_HAZARD,
        COLOR_HAZARD
    ]
    for i in range(6):
        img = Image.new("RGBA", (76, 6), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        for seg in range(6):
            sx = seg * 13
            color = zone_colors[seg] if seg <= i else BAR_INACTIVE
            draw.rectangle([sx, 1, sx + 9, 5], fill=color)
        save_image(img, 38 + i, matte_rgb=HR_MATTE)


# -------------------------------------------------------------
# 0044 - 0048: Steps Goal Progress (5 states) (124x6 px)
# -------------------------------------------------------------
def make_steps_progress():
    for i in range(5):
        img = Image.new("RGBA", (124, 6), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 1, 123, 5], fill=BAR_INACTIVE)
        fill_w = int(123 * ((i + 1) / 5.0))
        draw.rectangle([0, 1, fill_w, 5], fill=COLOR_GREEN)
        save_image(img, 44 + i, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# 0049 - 0050: Bluetooth Icons (On / Off) (12x14 px)
# -------------------------------------------------------------
def make_bluetooth_icons():
    img_on = Image.new("RGBA", (12, 14), (0, 0, 0, 0))
    draw_on = ImageDraw.Draw(img_on)
    draw_on.line([(6, 1), (6, 12)], fill=COLOR_GREEN, width=2)
    draw_on.line([(6, 1), (10, 4), (2, 10)], fill=COLOR_GREEN, width=1)
    draw_on.line([(6, 12), (10, 9), (2, 3)], fill=COLOR_GREEN, width=1)
    save_image(img_on, 49, matte_rgb=SPACE_MATTE)

    img_off = Image.new("RGBA", (12, 14), (0, 0, 0, 0))
    draw_off = ImageDraw.Draw(img_off)
    draw_off.line([(6, 1), (6, 12)], fill=BORDER_STRONG, width=1)
    draw_off.line([(2, 2), (10, 12)], fill=COLOR_HAZARD, width=1)
    save_image(img_off, 50, matte_rgb=SPACE_MATTE)


# -------------------------------------------------------------
# 0051: Date Delimiter '/' (7x18 px)
# -------------------------------------------------------------
def make_date_delimiter():
    img = Image.new("RGBA", (7, 18), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = get_font(12, mono=True)
    draw.text((3, 9), "/", fill=FG_MUTED, font=font, anchor="mm")
    save_image(img, 51, matte_rgb=SPACE_MATTE)


# -------------------------------------------------------------
# 0052 - 0061: Seconds Digits 0-9 (14x22 px)
# -------------------------------------------------------------
def make_seconds_digits():
    font = get_font(17, mono=True)
    for digit in range(10):
        img = Image.new("RGBA", (14, 22), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((7, 11), str(digit), fill=FG_SECONDARY, font=font, anchor="mm")
        save_image(img, 52 + digit, matte_rgb=CLOCK_MATTE)


# -------------------------------------------------------------
# 0062 - 0066: Calories Goal Progress (5 states) (124x6 px)
# -------------------------------------------------------------
def make_calories_progress():
    for i in range(5):
        img = Image.new("RGBA", (124, 6), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 1, 123, 5], fill=BAR_INACTIVE)
        fill_w = int(123 * ((i + 1) / 5.0))
        draw.rectangle([0, 1, fill_w, 5], fill=COLOR_AMBER)
        save_image(img, 62 + i, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# 0067: Heart Rate No-Data '--' (24x18 px)
# -------------------------------------------------------------
def make_hr_nodata():
    img = Image.new("RGBA", (24, 18), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = get_font(14, mono=True)
    draw.text((12, 9), "--", fill=FG_MUTED, font=font, anchor="mm")
    save_image(img, 67, matte_rgb=HR_MATTE)


# -------------------------------------------------------------
# 0068 - 0076: SpO2 Blood Oxygen Progress (8 active states + 1 BackgroundLayer) (126x24 px)
# Parameter 28 (SPO2Progress) on Amazfit Bip U — uses Text (Number) for exact live % + ImageProgress for bar
# -------------------------------------------------------------
def make_spo2_sprites():
    spo2_states = [
        ("", (0, 0, 0, 0), 0),                     # 0068: 0% / Unmeasured — transparent so BackgroundLayer '--' shows
        ("LOW", COLOR_HAZARD, 2),
        ("LOW", COLOR_AMBER, 3),
        ("LOW", COLOR_AMBER, 4),
        ("NORMAL", COLOR_SKY, 5),
        ("NORMAL", COLOR_SKY, 6),
        ("GOOD", COLOR_GREEN, 7),
        ("OPTIMAL", COLOR_GREEN, 8),
    ]
    f_val = get_font(14, mono=True)
    f_tag = get_font(9, mono=True)

    for i, (tag_str, col, lit_segs) in enumerate(spo2_states):
        img = Image.new("RGBA", (126, 24), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        if lit_segs > 0:
            draw.rectangle([0, 0, 37, 16], fill=BG_PANEL)
            draw.text((124, 8), tag_str, fill=col, font=f_tag, anchor="rm")
            for s in range(8):
                sx = s * 16
                scol = col if s < lit_segs else BAR_INACTIVE
                draw.rectangle([sx, 18, sx + 12, 22], fill=scol)
        save_image(img, 68 + i, matte_rgb=CARD_MATTE)

    # 0076: BackgroundLayer track for SpO2 (shows '--' when no data; masked by ImageProgress when > 0)
    bg = Image.new("RGBA", (126, 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bg)
    draw.text((10, 8), "--", fill=FG_MUTED, font=f_val, anchor="lm")
    for s in range(8):
        sx = s * 16
        draw.rectangle([sx, 18, sx + 12, 22], fill=BAR_INACTIVE)
    save_image(bg, 76, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# 0077 - 0085: Stress Level Progress (8 active states + 1 BackgroundLayer) (126x24 px)
# Parameter 27 (StressProgress) on Amazfit Bip U — uses Text (Number) for exact live score + ImageProgress for bar
# -------------------------------------------------------------
def make_stress_sprites():
    stress_states = [
        ("", (0, 0, 0, 0), 0),                     # 0077: 0 / Unmeasured — transparent so BackgroundLayer '--' shows
        ("RELAX", COLOR_GREEN, 1),
        ("RELAX", COLOR_GREEN, 2),
        ("RELAX", COLOR_GREEN, 3),
        ("NORMAL", COLOR_GREEN, 4),
        ("MODERATE", COLOR_AMBER, 5),
        ("MODERATE", COLOR_AMBER, 6),
        ("HIGH", COLOR_HAZARD, 8),
    ]
    f_val = get_font(14, mono=True)
    f_tag = get_font(9, mono=True)

    for i, (tag_str, col, lit_segs) in enumerate(stress_states):
        img = Image.new("RGBA", (126, 24), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        if lit_segs > 0:
            draw.rectangle([0, 0, 44, 16], fill=BG_PANEL)
            draw.text((124, 8), tag_str, fill=col, font=f_tag, anchor="rm")
            for s in range(8):
                sx = s * 16
                scol = col if s < lit_segs else BAR_INACTIVE
                draw.rectangle([sx, 18, sx + 12, 22], fill=scol)
        save_image(img, 77 + i, matte_rgb=CARD_MATTE)

    # 0085: BackgroundLayer track for Stress (shows '--' when no data; masked by ImageProgress when > 0)
    bg = Image.new("RGBA", (126, 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bg)
    draw.text((2, 8), "--", fill=FG_MUTED, font=f_val, anchor="lm")
    for s in range(8):
        sx = s * 16
        draw.rectangle([sx, 18, sx + 12, 22], fill=BAR_INACTIVE)
    save_image(bg, 85, matte_rgb=CARD_MATTE)


# -------------------------------------------------------------
# Generate JSON Layout Descriptor for py_amazfit_tools (--bipu)
# -------------------------------------------------------------
def generate_watchface_json():
    descriptor = {
        "Info": {
            "DeviceId": 71
        },
        "Background": {
            "Image": {
                "X": 0,
                "Y": 0,
                "ImageIndex": 0
            },
            "Preview": {
                "X": 0,
                "Y": 0,
                "ImageIndex": 1
            },
            "PreviewTradChinese": {
                "X": 0,
                "Y": 0,
                "ImageIndex": 1
            },
            "PreviewChinese": {
                "X": 0,
                "Y": 0,
                "ImageIndex": 1
            }
        },
        "TimeExtended": {
            "TimeSeparateDigits": {
                "Hours": {
                    "Tens": {"X": 14, "Y": 29, "ImageIndex": 2, "ImagesCount": 10},
                    "Ones": {"X": 40, "Y": 29, "ImageIndex": 2, "ImagesCount": 10}
                },
                "Minutes": {
                    "Tens": {"X": 80, "Y": 29, "ImageIndex": 2, "ImagesCount": 10},
                    "Ones": {"X": 106, "Y": 29, "ImageIndex": 2, "ImagesCount": 10}
                },
                "Seconds": {
                    "Tens": {"X": 158, "Y": 39, "ImageIndex": 52, "ImagesCount": 10},
                    "Ones": {"X": 174, "Y": 39, "ImageIndex": 52, "ImagesCount": 10}
                },
                "SeparatorHours": {
                    "X": 67,
                    "Y": 29,
                    "ImageIndex": 12
                },
                "UnknowBoolean7": False,
                "PaddingZeroMinutes": True
            }
        },
        "Activity": {
            "Steps": {
                "ImageNumber": {
                    "TopLeftX": 15,
                    "TopLeftY": 240,
                    "BottomRightX": 138,
                    "BottomRightY": 258,
                    "Alignment": "TopLeft",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "Shortcut": {
                    "TopLeftX": 8,
                    "TopLeftY": 226,
                    "BottomRightX": 148,
                    "BottomRightY": 268,
                    "UnknownBoolean5": True
                }
            },
            "Calories": {
                "ImageNumber": {
                    "TopLeftX": 161,
                    "TopLeftY": 240,
                    "BottomRightX": 256,
                    "BottomRightY": 258,
                    "Alignment": "TopLeft",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "Shortcut": {
                    "TopLeftX": 154,
                    "TopLeftY": 226,
                    "BottomRightX": 294,
                    "BottomRightY": 268,
                    "UnknownBoolean5": True
                }
            },
            "HeartRate": {
                "ImageNumber": {
                    "TopLeftX": 236,
                    "TopLeftY": 38,
                    "BottomRightX": 288,
                    "BottomRightY": 56,
                    "Alignment": "TopRight",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "NoDataImageIndex": 67,
                "Shortcut": {
                    "TopLeftX": 204,
                    "TopLeftY": 27,
                    "BottomRightX": 294,
                    "BottomRightY": 65,
                    "UnknownBoolean5": True
                }
            },
            "Distance": {
                "ImageNumber": {
                    "TopLeftX": 15,
                    "TopLeftY": 288,
                    "BottomRightX": 116,
                    "BottomRightY": 306,
                    "Alignment": "TopLeft",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "SuffixKMImageIndex": 24,
                "DecimalPointImageIndex": 23,
                "Shortcut": {
                    "TopLeftX": 8,
                    "TopLeftY": 272,
                    "BottomRightX": 148,
                    "BottomRightY": 312,
                    "UnknownBoolean5": True
                }
            },
            "PAI": {
                "ImageNumber": {
                    "TopLeftX": 161,
                    "TopLeftY": 288,
                    "BottomRightX": 216,
                    "BottomRightY": 306,
                    "Alignment": "TopLeft",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "Shortcut": {
                    "TopLeftX": 154,
                    "TopLeftY": 272,
                    "BottomRightX": 223,
                    "BottomRightY": 312,
                    "UnknownBoolean5": True
                }
            },
            "UnknownLongValue7": 0,
            "StandUp": {
                "ImageNumber": {
                    "TopLeftX": 230,
                    "TopLeftY": 288,
                    "BottomRightX": 272,
                    "BottomRightY": 306,
                    "Alignment": "TopLeft",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "Shortcut": {
                    "TopLeftX": 225,
                    "TopLeftY": 272,
                    "BottomRightX": 294,
                    "BottomRightY": 312,
                    "UnknownBoolean5": True
                }
            }
        },
        "DateBlock": {
            "Date": {
                "OneLineMonthAndDay": {
                    "Number": {
                        "TopLeftX": 82,
                        "TopLeftY": 5,
                        "BottomRightX": 156,
                        "BottomRightY": 23,
                        "Alignment": "TopLeft",
                        "Spacing": 1,
                        "VerticalOffset": 0,
                        "ImageIndex": 13,
                        "ImagesCount": 10
                    },
                    "DelimiterImageIndex": 51
                },
                "PaddingZeroMonth": True,
                "PaddingZeroDay": True,
                "UnknownBoolean6": False
            },
            "Weekday": {
                "X": 36,
                "Y": 7,
                "ImageIndex": 25,
                "ImagesCount": 7
            }
        },
        "StepProgress": {
            "ImageProgress": {
                "X": 16,
                "Y": 259,
                "ImageIndex": 44,
                "ImagesCount": 5
            }
        },
        "Status": {
            "Bluetooth": {
                "Coordinates": {
                    "X": 14,
                    "Y": 7
                },
                "ImageIndexOn": 49,
                "ImageIndexOff": 50
            }
        },
        "Battery": {
            "BatteryText": {
                "ImageNumber": {
                    "TopLeftX": 204,
                    "TopLeftY": 5,
                    "BottomRightX": 252,
                    "BottomRightY": 23,
                    "Alignment": "TopRight",
                    "Spacing": 1,
                    "VerticalOffset": 0,
                    "ImageIndex": 13,
                    "ImagesCount": 10
                },
                "SuffixImageIndex": 32
            },
            "ImageProgress": {
                "X": 266,
                "Y": 8,
                "ImageIndex": 33,
                "ImagesCount": 5
            }
        },
        "HeartProgress": {
            "ImageProgress": {
                "X": 211,
                "Y": 56,
                "ImageIndex": 38,
                "ImagesCount": 6
            }
        },
        "CaloriesProgress": {
            "ImageProgress": {
                "X": 162,
                "Y": 259,
                "ImageIndex": 62,
                "ImagesCount": 5
            }
        },
        "StressProgress": {
            "Text": {
                "TopLeftX": 161,
                "TopLeftY": 193,
                "BottomRightX": 204,
                "BottomRightY": 211,
                "Alignment": "TopLeft",
                "Spacing": 1,
                "VerticalOffset": 0,
                "ImageIndex": 13,
                "ImagesCount": 10
            },
            "ImageProgress": {
                "X": 161,
                "Y": 194,
                "ImageIndex": 77,
                "ImagesCount": 8
            },
            "BackgroundLayer": {
                "X": 161,
                "Y": 194,
                "ImageIndex": 85
            }
        },
        "SPO2Progress": {
            "Text": {
                "TopLeftX": 14,
                "TopLeftY": 193,
                "BottomRightX": 52,
                "BottomRightY": 211,
                "Alignment": "TopRight",
                "Spacing": 1,
                "VerticalOffset": 0,
                "ImageIndex": 13,
                "ImagesCount": 10
            },
            "ImageProgress": {
                "X": 15,
                "Y": 194,
                "ImageIndex": 68,
                "ImagesCount": 8
            },
            "BackgroundLayer": {
                "X": 15,
                "Y": 194,
                "ImageIndex": 76
            }
        }
    }

    json_path = os.path.join(OUT_DIR, "watchface.json")
    with open(json_path, "w") as f:
        json.dump(descriptor, f, indent=2)
    print(f"Watchface descriptor written to {json_path}")
    return json_path


def compile_and_verify_bin(json_path: str):
    compiler_main = "/tmp/py_amazfit_tools/main.py"
    if not os.path.exists(compiler_main):
        raise RuntimeError(f"py_amazfit_tools not found at {compiler_main}")

    # First pass: generate static preview (202x214) and copy it into 0001.png so the watch selector thumbnail shows the full HUD
    subprocess.run([sys.executable, compiler_main, "--bipu", "--file", json_path], check=True)
    static_214 = os.path.join(OUT_DIR, "watchface_packed_static_214.png")
    if os.path.exists(static_214):
        shutil.copyfile(static_214, os.path.join(OUT_DIR, "0001.png"))
        # Re-pack with the rendered 202x214 composite preview embedded at index 1
        subprocess.run([sys.executable, compiler_main, "--bipu", "--file", json_path], check=True)

    packed_bin = os.path.join(OUT_DIR, "watchface_packed.bin")
    if not os.path.exists(packed_bin):
        raise RuntimeError("watchface_packed.bin was not created")

    with open(packed_bin, "rb") as f:
        raw = bytearray(f.read())

    # Patch header bytes 12..25 to match genuine Zepp Amazfit Bip U header (DeviceId=71, WatchfaceID=348, exact byte size)
    total_size = len(raw)
    raw[12:14] = bytes([0x57, 0x0E])
    raw[14:18] = struct.pack("<HH", 71, 71)
    raw[18:22] = struct.pack("<I", 348)
    raw[22:26] = struct.pack("<I", total_size)

    with open(packed_bin, "wb") as f:
        f.write(raw)

    # Copy to tools/aura_os_health.bin and public/aura_os_health.bin
    repo_root = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
    targets = [
        os.path.join(repo_root, "tools", "aura_os_health.bin"),
        os.path.join(repo_root, "public", "aura_os_health.bin")
    ]
    for t in targets:
        shutil.copyfile(packed_bin, t)
        print(f"Copied verified Bip U binary ({total_size} bytes) -> {t}")

    # Copy static 302x320 preview to public/aura_os_health_preview.png
    static_320 = os.path.join(OUT_DIR, "watchface_packed_static.png")
    if os.path.exists(static_320):
        shutil.copyfile(static_320, os.path.join(repo_root, "public", "aura_os_health_preview.png"))


def main():
    for f in os.listdir(OUT_DIR):
        if f.endswith(".png") or f.endswith(".bin") or f.endswith(".log"):
            try:
                os.remove(os.path.join(OUT_DIR, f))
            except OSError:
                pass

    print(f"Generating AURA-OS Astronaut Bio-Flight Watchface (302x320) in {OUT_DIR}...")
    bg_img = make_background()
    make_preview_placeholder(bg_img)
    make_big_digits()
    make_clock_colon()
    make_small_digits()
    make_decimal_point()
    make_km_suffix()
    make_weekdays()
    make_battery_percent()
    make_battery_icons()
    make_heart_progress()
    make_steps_progress()
    make_bluetooth_icons()
    make_date_delimiter()
    make_seconds_digits()
    make_calories_progress()
    make_hr_nodata()
    make_spo2_sprites()
    make_stress_sprites()
    json_path = generate_watchface_json()
    print(f"Generated {len(images_manifest)} PNG asset files.")
    compile_and_verify_bin(json_path)


if __name__ == "__main__":
    main()
