// sound.js — CoCo sound emulation
// 6-bit DAC on PIA1 port A bits 2-7. PIA1 CB2 enables speaker.

export class Sound {
    constructor() {
        this.audioCtx = null;
        this.enabled = false;
        this.dacValue = 0;
        this.soundEnabled = false;
        this._dacActive = false;

        this._cycleAccum = 0;
        this._cyclesPerSample = 894886 / 44100; // ~20.3
        this._sampleBuffer = new Float32Array(8192);
        this._sampleCount = 0;
    }

    init() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100
            });
            this.enabled = true;
        } catch (e) {
            console.warn('Web Audio not available:', e);
        }
    }

    setDAC(value) {
        const newVal = (value >> 2) & 0x3F;
        if (newVal !== this.dacValue) {
            this.dacValue = newVal;
            this._dacActive = true;
        }
    }

    setSoundEnable(enabled) {
        this.soundEnabled = enabled;
        if (!enabled) this._dacActive = false;
    }

    addCycles(cycles) {
        if (!this.enabled || !this._dacActive) return;
        this._cycleAccum += cycles;
        if (this._cycleAccum < this._cyclesPerSample) return;

        const sample = ((this.dacValue / 31.5) - 1.0) * 0.3;
        while (this._cycleAccum >= this._cyclesPerSample) {
            this._cycleAccum -= this._cyclesPerSample;
            if (this._sampleCount < this._sampleBuffer.length) {
                this._sampleBuffer[this._sampleCount++] = sample;
            }
        }
    }

    // Call once per frame to flush accumulated samples to Web Audio
    flush() {
        if (!this.enabled || !this.audioCtx || this._sampleCount === 0) {
            this._sampleCount = 0;
            return;
        }

        // Limit buffer size to prevent resource exhaustion
        const count = Math.min(this._sampleCount, 4096);
        const ctx = this.audioCtx;
        const buf = ctx.createBuffer(1, count, 44100);
        const data = buf.getChannelData(0);
        for (let i = 0; i < count; i++) {
            data[i] = this._sampleBuffer[i];
        }

        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.start();

        this._sampleCount = 0;
    }
}
