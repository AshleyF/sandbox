// vdg.js — MC6847 Video Display Generator
// Renders CoCo video modes to a pixel framebuffer

// CoCo color palette (NTSC approximation)
const COLORS = [
    [0x00, 0xFF, 0x00],  // 0: Green
    [0xFF, 0xFF, 0x00],  // 1: Yellow
    [0x00, 0x00, 0xFF],  // 2: Blue
    [0xFF, 0x00, 0x00],  // 3: Red
    [0xFF, 0xFF, 0xFF],  // 4: Buff (white)
    [0x00, 0xFF, 0xFF],  // 5: Cyan
    [0xFF, 0x00, 0xFF],  // 6: Magenta
    [0xFF, 0x80, 0x00],  // 7: Orange
    [0x00, 0x00, 0x00],  // 8: Black
    [0x00, 0x40, 0x00],  // 9: Dark green (text BG)
    [0x20, 0x20, 0x20],  // 10: Dark orange BG
];

// Built-in 6847 character generator (5×7 in 8×12 cell)
// Subset covering printable ASCII $20-$5F (standard CoCo character set)
// Each character is 12 rows of 8-bit patterns (top-justified)
const CHAR_ROM = buildCharRom();

function buildCharRom() {
    // Minimal 5x7 font for characters $00-$3F (which map to ASCII $40-$7F and $20-$3F)
    // Each entry is 12 bytes (rows), using bits 7-3 for the 5 pixels
    const font = new Uint8Array(64 * 12);

    // Character data: 5x7 bitmaps packed into the upper 5 bits of each byte
    // Space ($20 = internal $00)
    const chars = {
        // Internal code → 5x7 bitmap rows (7 rows, top-aligned in 12-row cell with 2 row top margin)
        // @ A B C D E F G H I J K L M N O
        // P Q R S T U V W X Y Z [ \ ] ↑ ←
        // (space) ! " # $ % & ' ( ) * + , - . /
        // 0 1 2 3 4 5 6 7 8 9 : ; < = > ?

        0x00: [0x70,0x88,0xA8,0xB8,0xA0,0x88,0x70], // @  (internal $00 → display @)
        0x01: [0x20,0x50,0x88,0x88,0xF8,0x88,0x88], // A
        0x02: [0xF0,0x88,0x88,0xF0,0x88,0x88,0xF0], // B
        0x03: [0x70,0x88,0x80,0x80,0x80,0x88,0x70], // C
        0x04: [0xF0,0x88,0x88,0x88,0x88,0x88,0xF0], // D
        0x05: [0xF8,0x80,0x80,0xF0,0x80,0x80,0xF8], // E
        0x06: [0xF8,0x80,0x80,0xF0,0x80,0x80,0x80], // F
        0x07: [0x70,0x88,0x80,0x80,0x98,0x88,0x70], // G
        0x08: [0x88,0x88,0x88,0xF8,0x88,0x88,0x88], // H
        0x09: [0x70,0x20,0x20,0x20,0x20,0x20,0x70], // I
        0x0A: [0x38,0x10,0x10,0x10,0x10,0x90,0x60], // J
        0x0B: [0x88,0x90,0xA0,0xC0,0xA0,0x90,0x88], // K
        0x0C: [0x80,0x80,0x80,0x80,0x80,0x80,0xF8], // L
        0x0D: [0x88,0xD8,0xA8,0x88,0x88,0x88,0x88], // M
        0x0E: [0x88,0xC8,0xA8,0x98,0x88,0x88,0x88], // N
        0x0F: [0x70,0x88,0x88,0x88,0x88,0x88,0x70], // O
        0x10: [0xF0,0x88,0x88,0xF0,0x80,0x80,0x80], // P
        0x11: [0x70,0x88,0x88,0x88,0xA8,0x90,0x68], // Q
        0x12: [0xF0,0x88,0x88,0xF0,0xA0,0x90,0x88], // R
        0x13: [0x70,0x88,0x80,0x70,0x08,0x88,0x70], // S
        0x14: [0xF8,0x20,0x20,0x20,0x20,0x20,0x20], // T
        0x15: [0x88,0x88,0x88,0x88,0x88,0x88,0x70], // U
        0x16: [0x88,0x88,0x88,0x88,0x50,0x50,0x20], // V
        0x17: [0x88,0x88,0x88,0x88,0xA8,0xA8,0x50], // W
        0x18: [0x88,0x88,0x50,0x20,0x50,0x88,0x88], // X
        0x19: [0x88,0x88,0x50,0x20,0x20,0x20,0x20], // Y
        0x1A: [0xF8,0x08,0x10,0x20,0x40,0x80,0xF8], // Z
        0x1B: [0x70,0x40,0x40,0x40,0x40,0x40,0x70], // [
        0x1C: [0x00,0x80,0x40,0x20,0x10,0x08,0x00], // backslash
        0x1D: [0x70,0x10,0x10,0x10,0x10,0x10,0x70], // ]
        0x1E: [0x20,0x50,0x88,0x00,0x00,0x00,0x00], // ↑ (up arrow)
        0x1F: [0x00,0x00,0x00,0x00,0x00,0x00,0xF8], // ← (underscore/left)

        0x20: [0x00,0x00,0x00,0x00,0x00,0x00,0x00], // (space)
        0x21: [0x20,0x20,0x20,0x20,0x20,0x00,0x20], // !
        0x22: [0x50,0x50,0x50,0x00,0x00,0x00,0x00], // "
        0x23: [0x50,0x50,0xF8,0x50,0xF8,0x50,0x50], // #
        0x24: [0x20,0x78,0xA0,0x70,0x28,0xF0,0x20], // $
        0x25: [0xC0,0xC8,0x10,0x20,0x40,0x98,0x18], // %
        0x26: [0x40,0xA0,0xA0,0x40,0xA8,0x90,0x68], // &
        0x27: [0x20,0x20,0x40,0x00,0x00,0x00,0x00], // '
        0x28: [0x10,0x20,0x40,0x40,0x40,0x20,0x10], // (
        0x29: [0x40,0x20,0x10,0x10,0x10,0x20,0x40], // )
        0x2A: [0x00,0x20,0xA8,0x70,0xA8,0x20,0x00], // *
        0x2B: [0x00,0x20,0x20,0xF8,0x20,0x20,0x00], // +
        0x2C: [0x00,0x00,0x00,0x00,0x20,0x20,0x40], // ,
        0x2D: [0x00,0x00,0x00,0xF8,0x00,0x00,0x00], // -
        0x2E: [0x00,0x00,0x00,0x00,0x00,0x00,0x20], // .
        0x2F: [0x00,0x08,0x10,0x20,0x40,0x80,0x00], // /
        0x30: [0x70,0x88,0x98,0xA8,0xC8,0x88,0x70], // 0
        0x31: [0x20,0x60,0x20,0x20,0x20,0x20,0x70], // 1
        0x32: [0x70,0x88,0x08,0x10,0x20,0x40,0xF8], // 2
        0x33: [0xF8,0x10,0x20,0x10,0x08,0x88,0x70], // 3
        0x34: [0x10,0x30,0x50,0x90,0xF8,0x10,0x10], // 4
        0x35: [0xF8,0x80,0xF0,0x08,0x08,0x88,0x70], // 5
        0x36: [0x30,0x40,0x80,0xF0,0x88,0x88,0x70], // 6
        0x37: [0xF8,0x08,0x10,0x20,0x40,0x40,0x40], // 7
        0x38: [0x70,0x88,0x88,0x70,0x88,0x88,0x70], // 8
        0x39: [0x70,0x88,0x88,0x78,0x08,0x10,0x60], // 9
        0x3A: [0x00,0x00,0x20,0x00,0x20,0x00,0x00], // :
        0x3B: [0x00,0x00,0x20,0x00,0x20,0x20,0x40], // ;
        0x3C: [0x10,0x20,0x40,0x80,0x40,0x20,0x10], // <
        0x3D: [0x00,0x00,0xF8,0x00,0xF8,0x00,0x00], // =
        0x3E: [0x40,0x20,0x10,0x08,0x10,0x20,0x40], // >
        0x3F: [0x70,0x88,0x08,0x10,0x20,0x00,0x20], // ?
    };

    for (const [code, rows] of Object.entries(chars)) {
        const c = parseInt(code);
        const base = c * 12;
        // Center vertically: 2 rows top margin, 7 rows char, 3 rows bottom
        for (let r = 0; r < 7; r++) {
            font[base + r + 2] = rows[r];
        }
    }
    return font;
}

export class VDG {
    constructor(readMemory) {
        this.readMemory = readMemory;
        this.width = 256;
        this.height = 192;
        this.pixels = new Uint8Array(this.width * this.height * 4); // RGBA
    }

    // Render text mode: 32 columns × 16 rows, 8×12 character cells
    // videoBase: start of screen memory (from SAM)
    // mode bits from PIA1 side B: AG=0 (text), CSS (color set)
    renderText(videoBase, css) {
        const fg = css ? COLORS[7] : COLORS[0];   // Orange or Green
        const bg = css ? COLORS[8] : COLORS[9];    // Black or Dark green

        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 32; col++) {
                const addr = videoBase + row * 32 + col;
                let charCode = this.readMemory(addr);

                // Bit 6 set = inverse video
                const inverse = !!(charCode & 0x40);
                charCode &= 0x3F;

                // If bit 7 set, it's a semigraphics-4 block
                const isSemigraphics = !!(this.readMemory(addr) & 0x80);

                const px = col * 8;
                const py = row * 12;

                if (isSemigraphics) {
                    this._renderSG4(px, py, this.readMemory(addr));
                } else {
                    this._renderChar(px, py, charCode, inverse ? bg : fg, inverse ? fg : bg);
                }
            }
        }
    }

    _renderChar(px, py, charCode, fg, bg) {
        const base = charCode * 12;
        for (let y = 0; y < 12; y++) {
            const row = CHAR_ROM[base + y];
            for (let x = 0; x < 8; x++) {
                const on = !!(row & (0x80 >> x));
                const color = on ? fg : bg;
                const idx = ((py + y) * this.width + (px + x)) * 4;
                this.pixels[idx] = color[0];
                this.pixels[idx + 1] = color[1];
                this.pixels[idx + 2] = color[2];
                this.pixels[idx + 3] = 255;
            }
        }
    }

    // Semigraphics-4: byte = 1CSSLLRR
    // C=color set, SS=color (0-7 from CSS+SS), LL=top blocks, RR=bottom blocks
    _renderSG4(px, py, byte) {
        const colorIdx = ((byte >> 4) & 0x07);
        const color = COLORS[colorIdx] || COLORS[0];
        const bg = COLORS[8]; // black

        // 4 quadrants in a 2×2 grid, each 4×6 pixels
        const tl = !!(byte & 0x08);
        const tr = !!(byte & 0x04);
        const bl = !!(byte & 0x02);
        const br = !!(byte & 0x01);

        const quadrants = [
            { on: tl, x: 0, y: 0 },
            { on: tr, x: 4, y: 0 },
            { on: bl, x: 0, y: 6 },
            { on: br, x: 4, y: 6 },
        ];

        for (const q of quadrants) {
            const c = q.on ? color : bg;
            for (let dy = 0; dy < 6; dy++) {
                for (let dx = 0; dx < 4; dx++) {
                    const idx = ((py + q.y + dy) * this.width + (px + q.x + dx)) * 4;
                    this.pixels[idx] = c[0];
                    this.pixels[idx + 1] = c[1];
                    this.pixels[idx + 2] = c[2];
                    this.pixels[idx + 3] = 255;
                }
            }
        }
    }

    // Graphics modes: CG (color) and RG (resolution)
    // mode: SAM video mode 0-6
    // gm: PIA1 graphics mode bits (GM2,GM1,GM0 from port B)
    renderGraphics(videoBase, mode, css) {
        // For now, implement the most common: 256×192 two-color (PMODE 4)
        // and 128×192 four-color (PMODE 3)
        switch (mode) {
            case 6: // CG6: 256×192, 2 color
                this._renderCG6(videoBase, css);
                break;
            case 4: // CG3: 128×192, 4 color
                this._renderCG3(videoBase, css);
                break;
            case 2: // CG2: 128×96, 4 color
                this._renderCG2(videoBase, css);
                break;
            default:
                this._renderCG6(videoBase, css); // fallback
                break;
        }
    }

    _renderCG6(videoBase, css) {
        // 256×192, 1 bit per pixel, 32 bytes per row
        const fg = css ? COLORS[4] : COLORS[0];
        const bg = css ? COLORS[8] : COLORS[9];
        for (let y = 0; y < 192; y++) {
            for (let xByte = 0; xByte < 32; xByte++) {
                const byte = this.readMemory(videoBase + y * 32 + xByte);
                for (let bit = 0; bit < 8; bit++) {
                    const on = !!(byte & (0x80 >> bit));
                    const color = on ? fg : bg;
                    const idx = (y * this.width + xByte * 8 + bit) * 4;
                    this.pixels[idx] = color[0];
                    this.pixels[idx + 1] = color[1];
                    this.pixels[idx + 2] = color[2];
                    this.pixels[idx + 3] = 255;
                }
            }
        }
    }

    _renderCG3(videoBase, css) {
        // 128×192, 2 bits per pixel, 32 bytes per row
        const palette = css ?
            [COLORS[4], COLORS[2], COLORS[3], COLORS[7]] :  // Buff, Blue, Red, Orange
            [COLORS[0], COLORS[1], COLORS[2], COLORS[3]];   // Green, Yellow, Blue, Red
        for (let y = 0; y < 192; y++) {
            for (let xByte = 0; xByte < 32; xByte++) {
                const byte = this.readMemory(videoBase + y * 32 + xByte);
                for (let pix = 0; pix < 4; pix++) {
                    const colorIdx = (byte >> (6 - pix * 2)) & 0x03;
                    const color = palette[colorIdx];
                    const sx = (xByte * 4 + pix) * 2;
                    const idx = (y * this.width + sx) * 4;
                    // Double horizontal pixels (128→256)
                    for (let dx = 0; dx < 2; dx++) {
                        const i = idx + dx * 4;
                        this.pixels[i] = color[0];
                        this.pixels[i + 1] = color[1];
                        this.pixels[i + 2] = color[2];
                        this.pixels[i + 3] = 255;
                    }
                }
            }
        }
    }

    _renderCG2(videoBase, css) {
        // 128×96, 2 bits per pixel, 16 bytes per row, doubled vertically
        const palette = css ?
            [COLORS[4], COLORS[2], COLORS[3], COLORS[7]] :
            [COLORS[0], COLORS[1], COLORS[2], COLORS[3]];
        for (let y = 0; y < 96; y++) {
            for (let xByte = 0; xByte < 16; xByte++) {
                const byte = this.readMemory(videoBase + y * 16 + xByte);
                for (let pix = 0; pix < 4; pix++) {
                    const colorIdx = (byte >> (6 - pix * 2)) & 0x03;
                    const color = palette[colorIdx];
                    const sx = (xByte * 4 + pix) * 4; // quadruple horizontal
                    for (let dy = 0; dy < 2; dy++) {
                        for (let dx = 0; dx < 4; dx++) {
                            const idx = ((y * 2 + dy) * this.width + sx + dx) * 4;
                            this.pixels[idx] = color[0];
                            this.pixels[idx + 1] = color[1];
                            this.pixels[idx + 2] = color[2];
                            this.pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }
    }

    // Get ImageData-compatible buffer
    getImageData() {
        return this.pixels;
    }
}
