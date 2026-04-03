// memory.js — Simple 64K memory bus for the CoCo II
// Routes reads/writes to RAM, ROM, and I/O devices

export class Memory {
    constructor() {
        this.ram = new Uint8Array(0x10000); // 64K
        this.rom = null;     // Color BASIC ROM (8K at $A000-$BFFF)
        this.extrom = null;  // Extended BASIC ROM (8K at $8000-$9FFF)
        this.pia0 = null;    // PIA 0 ($FF00-$FF03)
        this.pia1 = null;    // PIA 1 ($FF20-$FF23)
        this.sam = null;     // SAM ($FFC0-$FFDF)
    }

    read(addr) {
        addr &= 0xFFFF;
        // PIA 0
        if (addr >= 0xFF00 && addr <= 0xFF03 && this.pia0) {
            return this.pia0.read(addr - 0xFF00);
        }
        // PIA 1
        if (addr >= 0xFF20 && addr <= 0xFF23 && this.pia1) {
            return this.pia1.read(addr - 0xFF20);
        }
        // SAM (write-only in hardware, reads return $FF)
        if (addr >= 0xFFC0 && addr <= 0xFFDF) {
            return 0xFF;
        }
        // Extended BASIC ROM
        if (addr >= 0x8000 && addr <= 0x9FFF && this.extrom) {
            return this.extrom[addr - 0x8000];
        }
        // Color BASIC ROM
        if (addr >= 0xA000 && addr <= 0xBFFF && this.rom) {
            return this.rom[addr - 0xA000];
        }
        // Interrupt vectors come from ROM (mirrored — top of 8K BASIC ROM)
        if (addr >= 0xFFF0 && addr <= 0xFFFF && this.rom) {
            // Vectors are at the end of the 8K ROM: offset = addr & 0x1FFF
            return this.rom[addr & 0x1FFF];
        }
        return this.ram[addr];
    }

    write(addr, val) {
        addr &= 0xFFFF;
        val &= 0xFF;
        // PIA 0
        if (addr >= 0xFF00 && addr <= 0xFF03 && this.pia0) {
            this.pia0.write(addr - 0xFF00, val);
            return;
        }
        // PIA 1
        if (addr >= 0xFF20 && addr <= 0xFF23 && this.pia1) {
            this.pia1.write(addr - 0xFF20, val);
            return;
        }
        // SAM registers
        if (addr >= 0xFFC0 && addr <= 0xFFDF && this.sam) {
            this.sam.write(addr, val);
            return;
        }
        // ROM areas are read-only
        if (addr >= 0x8000 && addr <= 0xBFFF) return;
        if (addr >= 0xFFF0) return;
        this.ram[addr] = val;
    }

    loadROM(data, base) {
        if (base === 0xA000) this.rom = new Uint8Array(data);
        else if (base === 0x8000) this.extrom = new Uint8Array(data);
    }

    // Load raw bytes into RAM (for testing)
    loadBytes(addr, bytes) {
        for (let i = 0; i < bytes.length; i++) {
            this.ram[(addr + i) & 0xFFFF] = bytes[i];
        }
    }
}
