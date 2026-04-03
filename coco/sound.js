// sound.js — CoCo sound emulation
// 6-bit DAC on PIA1 port A bits 2-7. PIA1 CB2 enables speaker.

export class Sound {
    constructor() {
        this.audioCtx = null;
        this.enabled = false;
        this.dacValue = 0;
        this.soundEnabled = false;

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
        this.dacValue = (value >> 2) & 0x3F;
    }

    setSoundEnable(enabled) {
        this.soundEnabled = enabled;
    }

    addCycles(cycles) {
        if (!this.enabled) return;

        this._cycleAccum += cycles;
        while (this._cycleAccum >= this._cyclesPerSample) {
            this._cycleAccum -= this._cyclesPerSample;
            if (this._sampleCount < this._sampleBuffer.length) {
                const sample = this.soundEnabled
                    ? ((this.dacValue / 31.5) - 1.0) * 0.3
                    : 0;
                this._sampleBuffer[this._sampleCount++] = sample;
            }
        }
    }

    // Call once per frame to flush accumulated samples to Web Audio
    flush() {
        if (!this.enabled || !this.audioCtx || this._sampleCount === 0) return;

        const ctx = this.audioCtx;
        const buf = ctx.createBuffer(1, this._sampleCount, 44100);
        const data = buf.getChannelData(0);
        for (let i = 0; i < this._sampleCount; i++) {
            data[i] = this._sampleBuffer[i];
        }

        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);

        // Schedule playback at the right time to avoid gaps
        const now = ctx.currentTime;
        if (!this._nextPlayTime || this._nextPlayTime < now) {
            this._nextPlayTime = now;
        }
        source.start(this._nextPlayTime);
        this._nextPlayTime += buf.duration;

        this._sampleCount = 0;
    }
}
