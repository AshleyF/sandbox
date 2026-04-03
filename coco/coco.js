// coco.js — TRS-80 Color Computer II system integration
// Wires CPU, memory, PIAs, SAM, VDG, keyboard together

import { MC6809 } from './cpu.js';
import { Memory } from './memory.js';
import { PIA } from './pia.js';
import { SAM } from './sam.js';
import { VDG } from './vdg.js';
import { Keyboard } from './keyboard.js';
import { Debugger } from './debug.js';
import { makeTestROM } from './testrom.js';
import { Cassette, casToWAV, buildCAS } from './cassette.js';

const CYCLES_PER_FRAME = 14914; // ~894,886 Hz / 60 fps

export class CoCo {
    constructor() {
        this.mem = new Memory();
        this.pia0 = new PIA();
        this.pia1 = new PIA();
        this.sam = new SAM();
        this.keyboard = new Keyboard();
        this.cassette = new Cassette();
        this.vdg = new VDG(addr => this.mem.read(addr));

        // Wire PIAs and SAM into memory bus
        this.mem.pia0 = this.pia0;
        this.mem.pia1 = this.pia1;
        this.mem.sam = this.sam;

        // Wire keyboard to PIA0
        // PIA0 port B selects keyboard columns, port A reads rows
        const origReadPia0 = this.pia0.read.bind(this.pia0);
        this.pia0.read = (offset) => {
            if (offset === 0 && (this.pia0.ctrlA & 0x04)) {
                // Reading port A data — feed keyboard matrix
                const colSelect = this.pia0.dataB;
                this.pia0.inputA = this.keyboard.readRows(colSelect);
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

    reset() {
        this.cpu.reset();
    }

    renderFrame() {
        // Determine video mode from PIA1 and SAM
        const pia1b = this.pia1.dataB;
        const ag = !!(pia1b & 0x80);    // Alphanumeric/Graphics
        const css = !!(pia1b & 0x08);   // Color Set Select
        const videoBase = this.sam.videoOffset;

        if (ag) {
            const mode = this.sam.videoMode;
            this.vdg.renderGraphics(videoBase, mode, css);
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
        this.cpu.checkInterrupts();
        let executed = 0;
        while (executed < CYCLES_PER_FRAME) {
            const pc = this.cpu.pc;

            // ROM intercept: byte-IN at $A749 (CLOAD reads)
            if (this.cassette.interceptEnabled && this.cassette.motorOn &&
                pc === 0xA749 && this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {
                const byte = this.cassette.nextByte();
                if (byte >= 0) {
                    this.cpu.a = byte;
                    this.cpu.pc = 0xA754; // skip to RTS
                    executed += 84;
                    continue;
                }
            }

            // ROM intercept: byte-OUT at $A82A (CSAVE writes)
            if (this.cassette.interceptEnabled && this.cassette.recording && pc === 0xA82A) {
                // A register has the byte to write
                this.cassette.recordBuffer.push(this.cpu.a);
                this.cpu.pc = 0xA85A; // skip to PULS A,PC
                executed += 84;
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

// Keyboard events
document.addEventListener('keydown', (e) => {
    if (coco.keyboard.keyDown(e)) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
    if (coco.keyboard.keyUp(e)) e.preventDefault();
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

document.getElementById('testRom')?.addEventListener('click', () => {
    const { rom, extrom } = makeTestROM();
    coco.mem.loadROM(rom, 0xA000);
    coco.mem.loadROM(extrom, 0x8000);
    coco.reset();
    updateDebug();
    status.textContent = `Test ROM loaded. PC=${coco.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}. Click Run!`;
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
    tapeStatusInterval = setInterval(updateTapeStatus, 100);
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

// === Cassette UI ===
document.getElementById('loadTape')?.addEventListener('click', () => {
    document.getElementById('tapeFile')?.click();
});

document.getElementById('tapeFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const name = file.name.toLowerCase();

    if (name.endsWith('.wav')) {
        coco.cassette.loadWAV(data);
        status.textContent = `WAV tape loaded: ${file.name}`;
    } else {
        coco.cassette.loadCAS(data);
        status.textContent = `CAS tape loaded: ${file.name}`;
    }
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
