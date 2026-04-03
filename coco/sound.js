// sound.js — CoCo sound emulation
// 6-bit DAC on PIA1 port A bits 2-7. PIA1 CB2 enables speaker.

export class Sound {
    constructor() {
        this.audioCtx = null;
        this.enabled = false;
        this.dacValue = 0;
        this.soundEnabled = false;
        this._dacActive = false;
        this._dacIdleCycles = 0;

        this._cycleAccum = 0;
        this._cyclesPerSample = 894886 / 44100;

        // Power-of-2 ring buffer for lock-free producer/consumer
        this._ringSize = 16384;
        this._ring = new Float32Array(this._ringSize);
        this._writePos = 0;
        this._readPos = 0;
    }

    init() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100
            });
            this._startPlayback();
            this.enabled = true;
        } catch (e) {
            console.warn('Web Audio not available:', e);
        }
    }

    _startPlayback() {
        const ctx = this.audioCtx;
        const self = this;
        const node = ctx.createScriptProcessor(2048, 0, 1);
        node.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < output.length; i++) {
                if (self._readPos !== self._writePos) {
                    output[i] = self._ring[self._readPos];
                    self._readPos = (self._readPos + 1) & (self._ringSize - 1);
                } else {
                    output[i] = 0;
                }
            }
        };
        node.connect(ctx.destination);
        this._node = node;
    }

    setDAC(value) {
        const newVal = (value >> 2) & 0x3F;
        if (newVal !== this.dacValue) {
            this.dacValue = newVal;
            this._dacActive = true;
            this._dacIdleCycles = 0;
        }
    }

    setSoundEnable(enabled) {
        this.soundEnabled = enabled;
        if (!enabled) {
            this._dacActive = false;
            this._dacIdleCycles = 0;
        }
    }

    addCycles(cycles) {
        if (!this.enabled || !this._dacActive) return;

        // If DAC hasn't changed for a while, stop generating samples
        this._dacIdleCycles += cycles;
        if (this._dacIdleCycles > 2000) { // ~2ms of no DAC changes = silence
            this._dacActive = false;
            this._cycleAccum = 0;
            return;
        }

        this._cycleAccum += cycles;
        if (this._cycleAccum < this._cyclesPerSample) return;

        const sample = this.soundEnabled
            ? ((this.dacValue / 31.5) - 1.0) * 0.3
            : 0;

        while (this._cycleAccum >= this._cyclesPerSample) {
            this._cycleAccum -= this._cyclesPerSample;
            const nextWrite = (this._writePos + 1) & (this._ringSize - 1);
            if (nextWrite !== this._readPos) {
                this._ring[this._writePos] = sample;
                this._writePos = nextWrite;
            }
        }
    }

    flush() {}
}
