// coco.js — TRS-80 Color Computer II system integration
// Wires CPU, memory, PIAs, SAM, VDG, keyboard together

import { MC6809 } from './cpu.js';
import { Memory } from './memory.js';
import { PIA } from './pia.js';
import { SAM } from './sam.js';
import { VDG } from './vdg.js';
import { Keyboard } from './keyboard.js';
import { Joystick } from './joystick.js';
import { Debugger } from './debug.js';
import { Cassette, casToWAV, buildCAS } from './cassette.js';
import { DiskController } from './disk.js';

const CYCLES_PER_FRAME = 14914; // ~894,886 Hz / 60 fps

export class CoCo {
    constructor() {
        this.mem = new Memory();
        this.pia0 = new PIA();
        this.pia1 = new PIA();
        this.sam = new SAM();
        this.keyboard = new Keyboard();
        this.joystick = new Joystick();
        this.cassette = new Cassette();
        this.disk = new DiskController();
        this.vdg = new VDG(addr => this.mem.read(addr));

        // Wire PIAs and SAM into memory bus
        this.mem.pia0 = this.pia0;
        this.mem.pia1 = this.pia1;
        this.mem.sam = this.sam;
        this.mem.disk = this.disk;

        // Wire keyboard and joystick to PIA0
        // PIA0 port B selects keyboard columns, port A reads rows
        // PIA0 port A bit 7 = joystick comparator output
        // PIA0 port A bit 0 = right joystick button
        // PIA0 port A bit 1 = left joystick button
        const origReadPia0 = this.pia0.read.bind(this.pia0);
        this.pia0.read = (offset) => {
            if (offset === 0 && (this.pia0.ctrlA & 0x04)) {
                // Feed keyboard matrix
                const colSelect = this.pia0.dataB;
                let portA = this.keyboard.readRows(colSelect);

                // Joystick comparator on bit 7
                // DAC value from PIA1 port A bits 2-7
                // Axis MUX: CA2 selects joystick (0=right, 1=left)
                //            CB2 selects axis (0=X, 1=Y)
                const dacValue = (this.pia1.dataA >> 2) & 0x3F;
                const selLeft = !!(this.pia0.ctrlA & 0x08);  // CA2: 0=right, 1=left
                const selY = !!(this.pia0.ctrlB & 0x08);     // CB2: 0=X, 1=Y
                const axis = (selLeft ? 0 : 2) + (selY ? 1 : 0);
                const cmpResult = this.joystick.compare(axis, dacValue);
                if (cmpResult) {
                    portA |= 0x80;  // DAC >= joystick: comparator high
                } else {
                    portA &= 0x7F;  // DAC < joystick: comparator low
                }

                // Joystick buttons (active low)
                if (this.joystick.buttons[1]) portA &= ~0x01; // right button → bit 0
                if (this.joystick.buttons[0]) portA &= ~0x02; // left button → bit 1

                this.pia0.inputA = portA;
            }
            return origReadPia0(offset);
        };

        // Wire cassette to PIA1
        // PIA1 port A bit 0 = cassette data input (CASSDIN)
        // PIA1 CA2 (ctrl A bits 3-5) = cassette motor control
        const origReadPia1 = this.pia1.read.bind(this.pia1);
        this.pia1.read = (offset) => {
            if (offset === 0 && (this.pia1.ctrlA & 0x04) && this.cassette.motorOn) {
                // Reading port A data while motor is on — inject cassette bit
                const cassBit = this.cassette.readBit();
                this.pia1.inputA = (this.pia1.inputA & 0xFE) | cassBit;
            }
            return origReadPia1(offset);
        };
        const origWritePia1 = this.pia1.write.bind(this.pia1);
        this.pia1.write = (offset, val) => {
            origWritePia1(offset, val);
            // CA2 motor control: when ctrl A configures CA2 as output
            // Bits 5,4 = 1,1 → manual output mode, bit 3 = CA2 level
            if (offset === 1) {
                if ((val & 0x30) === 0x30) {
                    // Manual output mode: motor = bit 3
                    this.cassette.setMotor(!!(val & 0x08));
                } else if ((val & 0x20) === 0) {
                    // CA2 is input mode or interrupt mode → motor off
                    this.cassette.setMotor(false);
                }
            }
        };

        this.cpu = new MC6809(
            addr => this.mem.read(addr),
            (addr, val) => this.mem.write(addr, val)
        );

        // Wire disk controller NMI to CPU
        this.disk.onNMI = (active) => {
            this.cpu.nmiLine = active;
        };
        this.dbg = new Debugger(this.cpu, addr => this.mem.read(addr));
        this.running = false;
        this.frameId = null;
        this.canvas = null;
        this.ctx = null;
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    async loadROMFile(file) {
        const data = new Uint8Array(await file.arrayBuffer());
        const name = file.name.toLowerCase();
        if (name.includes('ext') || name.includes('8000')) {
            this.mem.loadROM(data, 0x8000);
            return `Extended BASIC loaded (${data.length} bytes)`;
        } else {
            this.mem.loadROM(data, 0xA000);
            return `Color BASIC loaded (${data.length} bytes)`;
        }
    }

    loadCartridge(data) {
        this.mem.loadCartridge(data);
    }

    removeCartridge() {
        this.mem.removeCartridge();
    }

    loadDisk(driveNum, data) {
        this.disk.loadDisk(driveNum, data);
    }

    ejectDisk(driveNum) {
        this.disk.ejectDisk(driveNum);
    }

    reset() {
        this.cpu.reset();
        // Cartridge autostart: assert FIRQ and set PIA1 CB1 flag
        // BASIC's FIRQ handler checks PIA1 $FF23 bit 7 (CB1 IRQ flag)
        // and jumps to $C000 if set
        if (this.mem.cartrom) {
            this.pia1.irqB1 = true;   // set CART flag in PIA1 ctrl B
            this.cpu.firqLine = true;  // assert FIRQ line
        }
    }

    renderFrame() {
        // Determine video mode from PIA1 port B and SAM
        const pia1b = this.pia1.dataB;
        const ag = !!(pia1b & 0x80);     // bit 7: Alphanumeric/Graphics
        const gm = (pia1b >> 4) & 0x07;  // bits 6,5,4: GM2,GM1,GM0
        const css = !!(pia1b & 0x08);    // bit 3: Color Set Select
        const videoBase = this.sam.videoOffset;

        if (ag) {
            this.vdg.renderGraphics(videoBase, gm, css);
        } else {
            this.vdg.renderText(videoBase, css);
        }

        // Blit to canvas
        if (this.ctx) {
            const img = new ImageData(
                new Uint8ClampedArray(this.vdg.pixels.buffer),
                this.vdg.width,
                this.vdg.height
            );
            this.ctx.putImageData(img, 0, 0);
        }

        // Signal VSYNC via PIA0 CB1 (falling edge — CoCo FS1 is on CB1)
        this.pia0.setCB1(false);  // falling edge sets irqB1 flag
        if (this.pia0.irqActive) {
            this.cpu.irqLine = true;
        }
    }

    stepFrame() {
        this.joystick.update();
        let executed = 0;
        while (executed < CYCLES_PER_FRAME) {
            // Keep CART signal active while cartridge is present
            if (this.mem.cartrom) {
                this.pia1.irqB1 = true;
                this.cpu.firqLine = true;
            }
            this.cpu.checkInterrupts();
            const pc = this.cpu.pc;

            // ROM intercept: CSRDON (cassette sync) at $A77C
            // Skip the FSK leader sync — just turn motor on and return
            if (this.cassette.interceptEnabled && pc === 0xA77C &&
                this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {
                this.cassette.setMotor(true);
                this.mem.write(0x84, 0x00);
                this.mem.write(0x90, 0x12);
                this.mem.write(0x91, 0x08);
                this.cpu.pc = 0xA796;
                executed += 100;
                continue;
            }

            // ROM intercept: full block read at $A701
            // A701: BSR A77C (sync) + BSR A70B (block read) + JSR A7E9 (motor off) + LDB <$81 + RTS
            // We do it all: read block, turn motor off, set B and Z flag, return
            if (this.cassette.interceptEnabled &&
                pc === 0xA701 && this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {

                // Turn motor on
                this.cassette.setMotor(true);

                // Skip leader bytes
                while (this.cassette.playPos < this.cassette.playBuffer.length &&
                       this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                    this.cassette.playPos++;
                }

                let error = 1;
                if (this.cassette.playPos < this.cassette.playBuffer.length &&
                    this.cassette.playBuffer[this.cassette.playPos] === 0x3C) {
                    this.cassette.playPos++; // skip sync

                    const blockType = this.cassette.nextByte();
                    const blockLen = this.cassette.nextByte();

                    this.mem.write(0x7C, blockType);
                    this.mem.write(0x7D, blockLen);

                    let checksum = (blockType + blockLen) & 0xFF;
                    // Write to wherever $7E-$7F points (ROM's BLKIN does LDX <$7E)
                    let x = (this.mem.read(0x7E) << 8) | this.mem.read(0x7F);

                    for (let i = 0; i < blockLen; i++) {
                        const byte = this.cassette.nextByte();
                        if (byte < 0) break;
                        this.mem.write(x, byte);
                        x = (x + 1) & 0xFFFF;
                        checksum = (checksum + byte) & 0xFF;
                    }

                    const expectedChecksum = this.cassette.nextByte();

                    // Skip trailer
                    if (this.cassette.playPos < this.cassette.playBuffer.length &&
                        this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                        this.cassette.playPos++;
                    }

                    const ok = expectedChecksum >= 0 && (checksum === (expectedChecksum & 0xFF));
                    error = ok ? 0 : 1;
                    this.cpu.x = x;
                }

                // Turn motor off (what A7E9 does)
                this.cassette.setMotor(false);

                // Set error flag and B register (what A708: LDB <$81 does)
                this.mem.write(0x81, error);
                this.cpu.b = error;
                this.cpu.flagZ = (error === 0);
                this.cpu.flagN = false;

                this.cpu.pc = 0xA70A; // RTS at end of A701
                executed += 500;
                continue;
            }

            // ROM intercept: BLKIN at $A70B (called directly for subsequent blocks)
            if (this.cassette.interceptEnabled &&
                pc === 0xA70B && this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {

                // Skip leader ($55) bytes
                while (this.cassette.playPos < this.cassette.playBuffer.length &&
                       this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                    this.cassette.playPos++;
                }

                if (this.cassette.playPos < this.cassette.playBuffer.length &&
                    this.cassette.playBuffer[this.cassette.playPos] === 0x3C) {
                    this.cassette.playPos++; // skip sync byte

                    const blockType = this.cassette.nextByte();
                    const blockLen = this.cassette.nextByte();

                    this.mem.write(0x7C, blockType);
                    this.mem.write(0x7D, blockLen);

                    let checksum = (blockType + blockLen) & 0xFF;
                    // Write to wherever $7E-$7F points (same as ROM's BLKIN)
                    let x = (this.mem.read(0x7E) << 8) | this.mem.read(0x7F);

                    for (let i = 0; i < blockLen; i++) {
                        const byte = this.cassette.nextByte();
                        if (byte < 0) break;
                        this.mem.write(x, byte);
                        x = (x + 1) & 0xFFFF;
                        checksum = (checksum + byte) & 0xFF;
                    }

                    const expectedChecksum = this.cassette.nextByte();

                    // Skip trailer
                    if (this.cassette.playPos < this.cassette.playBuffer.length &&
                        this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                        this.cassette.playPos++;
                    }

                    // Error flag: 0=OK
                    const ok = expectedChecksum >= 0 && (checksum === (expectedChecksum & 0xFF));
                    this.mem.write(0x81, ok ? 0 : 1);

                    // Set B and Z flag — callers check Z after BLKIN returns
                    this.cpu.b = ok ? 0 : 1;
                    this.cpu.flagZ = ok;
                    this.cpu.flagN = false;

                    this.cpu.x = x;
                    this.cpu.pc = 0xA748; // RTS
                    executed += 500;
                    continue;
                }
            }

            // ROM intercept: byte-OUT at $A82A (CSAVE writes)
            if (this.cassette.interceptEnabled && this.cassette.recording && pc === 0xA82A) {
                this.cassette.recordBuffer.push(this.cpu.a);
                this.cpu.step(); // PSHS A
                this.cpu.pc = 0xA85A; // PULS A,PC
                executed += 84;
                continue;
            }

            // Speed up motor delay loop at $A7D3: LEAX -1,X; BNE $A7D3
            // Only when motor is actually on (CSAVE/CLOAD activated it)
            if (this.cassette.interceptEnabled && pc === 0xA7D3 && this.cassette.motorOn) {
                this.cpu.x = 0;
                this.cpu.pc = 0xA7D5; // skip past BNE
                executed += 100;
                continue;
            }

            const c = this.cpu.step();
            executed += c;
            this.cassette.advanceCycles(c);
        }
        this.renderFrame();
        this.cpu.irqLine = false;
        this.pia0.setCB1(true);
    }

    start() {
        if (this.running) return;
        this.running = true;
        const tick = () => {
            if (!this.running) return;
            this.stepFrame();
            this.frameId = requestAnimationFrame(tick);
        };
        tick();
    }

    stop() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
}

// === UI wiring ===
const coco = new CoCo();
const status = document.getElementById('status');
const canvas = document.getElementById('screen');
if (canvas) coco.setCanvas(canvas);

// Keyboard and joystick events
// Arrow keys go to joystick, other keys to keyboard
document.addEventListener('keydown', (e) => {
    if (coco.joystick.keyDown(e)) { e.preventDefault(); return; }
    if (coco.keyboard.keyDown(e)) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
    if (coco.joystick.keyUp(e)) { e.preventDefault(); return; }
    if (coco.keyboard.keyUp(e)) e.preventDefault();
});
// Clear all keys when window loses focus (prevents stuck keys)
window.addEventListener('blur', () => {
    coco.keyboard.clearAll();
    coco.joystick._keyState = { left: false, right: false, up: false, down: false };
    coco.joystick.buttons = [false, false];
});

// Auto-load ROMs from roms/ directory on startup
async function autoLoadROMs() {
    const romFiles = [
        { url: 'roms/bas13.rom', base: 0xA000, name: 'Color BASIC 1.3' },
        { url: 'roms/extbas11.rom', base: 0x8000, name: 'Extended BASIC 1.1' },
    ];
    const loaded = [];
    for (const r of romFiles) {
        try {
            const resp = await fetch(r.url);
            if (resp.ok) {
                const data = new Uint8Array(await resp.arrayBuffer());
                coco.mem.loadROM(data, r.base);
                loaded.push(r.name);
            }
        } catch (e) { /* ROM not found, skip */ }
    }
    if (loaded.length > 0) {
        coco.reset();
        coco.start();
        startTapeStatus();
        status.textContent = `Loaded: ${loaded.join(', ')}. Running!`;
    } else {
        status.textContent = 'No ROMs found in roms/. Click Load ROM or Test ROM.';
    }
}
autoLoadROMs();

document.getElementById('loadRom')?.addEventListener('click', () => {
    document.getElementById('romFile')?.click();
});

document.getElementById('romFile')?.addEventListener('change', async (e) => {
    const msgs = [];
    for (const file of e.target.files) {
        const msg = await coco.loadROMFile(file);
        msgs.push(msg);
    }
    status.textContent = msgs.join('; ');
});

document.getElementById('reset')?.addEventListener('click', () => {
    coco.reset();
    updateDebug();
    status.textContent = `Reset. PC=${coco.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`;
});

document.getElementById('run')?.addEventListener('click', () => {
    coco.start();
    startTapeStatus();
    status.textContent = 'Running...';
});

document.getElementById('stop')?.addEventListener('click', () => {
    coco.stop();
    stopTapeStatus();
    updateDebug();
    updateTapeStatus();
    status.textContent = `Stopped. ${coco.dbg.dumpRegisters().split('\n')[0]}`;
});

document.getElementById('step')?.addEventListener('click', () => {
    coco.stop();
    const entry = coco.dbg.stepDebug();
    coco.renderFrame();
    updateDebug();
    status.textContent = `${entry.instruction} [${entry.cycles}c]`;
});

const debugEl = document.getElementById('debug');
function updateDebug() {
    if (!debugEl) return;
    const regs = coco.dbg.dumpRegisters();
    const dis = coco.dbg.disassemble(coco.cpu.pc, 8)
        .map(d => `${d.addr.toString(16).toUpperCase().padStart(4, '0')} ${d.hex.padEnd(14)} ${d.text}`)
        .join('\n');
    debugEl.textContent = regs + '\n\n' + dis;
}

// === Tape status display ===
const tapeLabel = document.getElementById('tape-label');
const tapeMotor = document.getElementById('tape-motor');
const tapeSignal = document.getElementById('tape-signal');
const tapeBar = document.getElementById('tape-bar');
const tapePct = document.getElementById('tape-pct');
const BAR_WIDTH = 40;

let tapeStatusInterval = null;
function startTapeStatus() {
    if (tapeStatusInterval) return;
    tapeStatusInterval = setInterval(() => { updateTapeStatus(); updateJoystickDisplay(); }, 100);
}
function stopTapeStatus() {
    if (tapeStatusInterval) { clearInterval(tapeStatusInterval); tapeStatusInterval = null; }
}

function updateTapeStatus() {
    const c = coco.cassette;
    if (!c) return;

    // Motor
    if (tapeMotor) {
        if (c.recording) {
            tapeMotor.textContent = '⏺ RECORDING';
            tapeMotor.style.color = '#f44';
        } else if (c.motorOn) {
            tapeMotor.textContent = '▶ Motor ON';
            tapeMotor.style.color = '#0f0';
        } else {
            tapeMotor.textContent = '⏹ Motor off';
            tapeMotor.style.color = '#666';
        }
    }

    // Signal
    if (tapeSignal) {
        if (c.recording) {
            tapeSignal.textContent = 'Bytes: ' + c.recordBuffer.length;
            tapeSignal.style.color = '#f44';
        } else {
            tapeSignal.textContent = 'Signal: ' + (c.signalHigh ? '▀' : '▄');
            tapeSignal.style.color = c.motorOn ? '#0f0' : '#555';
        }
    }

    // Progress bar
    if (c.recording) {
        if (tapeBar) tapeBar.textContent = '⏺'.repeat(Math.min(BAR_WIDTH, Math.floor(c.recordBuffer.length / 10)));
        if (tapePct) tapePct.textContent = c.recordBuffer.length + ' bytes';
    } else {
        const progress = c.progress;
        const filled = Math.round(progress * BAR_WIDTH);
        if (tapeBar) tapeBar.textContent = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
        if (tapePct) tapePct.textContent = Math.round(progress * 100) + '%';
    }
}

// === Joystick display ===
const joyCanvas = document.getElementById('joystick-display');
const joyCtx = joyCanvas?.getContext('2d');
const joyPos = document.getElementById('joystick-pos');

function updateJoystickDisplay() {
    if (!joyCtx) return;
    const j = coco.joystick;
    const w = 80, h = 80;

    joyCtx.fillStyle = '#111';
    joyCtx.fillRect(0, 0, w, h);

    // Crosshair
    joyCtx.strokeStyle = '#333';
    joyCtx.beginPath();
    joyCtx.moveTo(w/2, 0); joyCtx.lineTo(w/2, h);
    joyCtx.moveTo(0, h/2); joyCtx.lineTo(w, h/2);
    joyCtx.stroke();

    // Stick position
    const px = (j.axes[0] / 63) * (w - 8) + 4;
    const py = (j.axes[1] / 63) * (h - 8) + 4;
    joyCtx.fillStyle = j.buttons[0] ? '#f44' : '#0f0';
    joyCtx.beginPath();
    joyCtx.arc(px, py, 5, 0, Math.PI * 2);
    joyCtx.fill();

    // Border glow when button pressed
    if (j.buttons[0] || j.buttons[1]) {
        joyCtx.strokeStyle = '#f44';
        joyCtx.lineWidth = 2;
        joyCtx.strokeRect(1, 1, w - 2, h - 2);
        joyCtx.lineWidth = 1;
    }

    if (joyPos) joyPos.textContent = `X:${j.axes[0]} Y:${j.axes[1]}${j.buttons[0] ? ' [BTN]' : ''}`;
}

// === Cassette UI ===
document.getElementById('loadTape')?.addEventListener('click', () => {
    document.getElementById('tapeFile')?.click();
});

document.getElementById('tapeFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const name = file.name.toLowerCase();

    coco.cassette.loadCAS(data);
    status.textContent = `Tape loaded: ${file.name}`;
    if (tapeLabel) tapeLabel.textContent = `🎵 Tape: ${file.name}`;
    updateTapeStatus();
});

document.getElementById('recordTape')?.addEventListener('click', () => {
    if (coco.cassette.recording) {
        // Stop recording
        coco.cassette.recording = false;
        status.textContent = `Recording stopped. ${coco.cassette.recordBuffer.length} bytes. Click Save CAS or Save WAV.`;
    } else {
        // Start recording
        coco.cassette.startRecording();
        if (tapeLabel) tapeLabel.textContent = '🎵 Tape: ⏺ Recording armed';
        status.textContent = 'Recording armed. Type CSAVE"NAME" in BASIC.';
    }
    updateTapeStatus();
});

document.getElementById('saveTapeCAS')?.addEventListener('click', () => {
    const data = coco.cassette.recording
        ? new Uint8Array(coco.cassette.recordBuffer)
        : (coco.cassette.recordBuffer.length > 0
            ? new Uint8Array(coco.cassette.recordBuffer)
            : (coco.cassette.playBuffer || new Uint8Array(0)));
    if (data.length === 0) {
        status.textContent = 'No tape data to save. Click Record, then CSAVE in BASIC.';
        return;
    }
    downloadBlob(new Blob([data]), 'program.cas');
    status.textContent = `Saved CAS (${data.length} bytes)`;
});

document.getElementById('saveTapeWAV')?.addEventListener('click', () => {
    const data = coco.cassette.recording
        ? new Uint8Array(coco.cassette.recordBuffer)
        : (coco.cassette.recordBuffer.length > 0
            ? new Uint8Array(coco.cassette.recordBuffer)
            : (coco.cassette.playBuffer || new Uint8Array(0)));
    if (data.length === 0) {
        status.textContent = 'No tape data to save. Click Record, then CSAVE in BASIC.';
        return;
    }
    const wav = casToWAV(data);
    downloadBlob(new Blob([wav], { type: 'audio/wav' }), 'program.wav');
    status.textContent = `Saved WAV (playable on a real CoCo!)`;
});

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// === Cartridge UI ===
document.getElementById('loadCart')?.addEventListener('click', () => {
    document.getElementById('cartFile')?.click();
});

document.getElementById('cartFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = new Uint8Array(await file.arrayBuffer());
    coco.loadCartridge(data);
    coco.stop();
    coco.reset();
    coco.start();
    startTapeStatus();
    status.textContent = `Cartridge loaded: ${file.name} (${data.length} bytes) — auto-starting`;
});

document.getElementById('ejectCart')?.addEventListener('click', () => {
    coco.removeCartridge();
    coco.stop();
    coco.reset();
    coco.start();
    startTapeStatus();
    status.textContent = 'Cartridge ejected. Rebooted to BASIC.';
});

// === Disk UI ===
document.getElementById('loadDisk')?.addEventListener('click', () => {
    document.getElementById('diskFile')?.click();
});

document.getElementById('diskFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = new Uint8Array(await file.arrayBuffer());
    coco.loadDisk(0, data);
    status.textContent = `Disk loaded: ${file.name} (${data.length} bytes) in drive 0`;
    e.target.value = '';
});

document.getElementById('ejectDisk')?.addEventListener('click', () => {
    coco.ejectDisk(0);
    status.textContent = 'Disk ejected from drive 0.';
});
