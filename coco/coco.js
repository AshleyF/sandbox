// coco.js — TRS-80 Color Computer II system integration
// Wires CPU, memory, PIAs, SAM, VDG, keyboard together

import { MC6809 } from './cpu.js';
import { Memory } from './memory.js';
import { PIA } from './pia.js';
import { SAM } from './sam.js';
import { VDG } from './vdg.js';
import { Keyboard } from './keyboard.js';
import { Debugger } from './debug.js';

const CYCLES_PER_FRAME = 14914; // ~894,886 Hz / 60 fps

export class CoCo {
    constructor() {
        this.mem = new Memory();
        this.pia0 = new PIA();
        this.pia1 = new PIA();
        this.sam = new SAM();
        this.keyboard = new Keyboard();
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

        // Signal VSYNC via PIA0 CA1
        this.pia0.setCA1(true);
        if (this.pia0.irqActive) {
            this.cpu.irqLine = true;
        }
    }

    stepFrame() {
        this.cpu.checkInterrupts();
        this.cpu.run(CYCLES_PER_FRAME);
        this.renderFrame();
        this.cpu.irqLine = false;
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
    status.textContent = `Reset. PC=${coco.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`;
});

document.getElementById('run')?.addEventListener('click', () => {
    coco.start();
    status.textContent = 'Running...';
});

document.getElementById('stop')?.addEventListener('click', () => {
    coco.stop();
    status.textContent = `Stopped. ${coco.dbg.dumpRegisters().split('\n')[0]}`;
});
