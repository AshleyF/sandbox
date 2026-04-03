// coco.js — TRS-80 Color Computer II system integration
// Wires CPU, memory, PIAs, SAM, VDG together

import { MC6809 } from './cpu.js';
import { Memory } from './memory.js';
import { Debugger } from './debug.js';

const CYCLES_PER_FRAME = 14914; // ~894,886 Hz / 60 fps

export class CoCo {
    constructor() {
        this.mem = new Memory();
        this.cpu = new MC6809(
            addr => this.mem.read(addr),
            (addr, val) => this.mem.write(addr, val)
        );
        this.dbg = new Debugger(this.cpu, addr => this.mem.read(addr));
        this.running = false;
        this.frameId = null;
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

    stepFrame() {
        this.cpu.run(CYCLES_PER_FRAME);
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

document.getElementById('loadRom')?.addEventListener('click', () => {
    document.getElementById('romFile')?.click();
});

document.getElementById('romFile')?.addEventListener('change', async (e) => {
    for (const file of e.target.files) {
        const msg = await coco.loadROMFile(file);
        status.textContent = msg;
    }
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
