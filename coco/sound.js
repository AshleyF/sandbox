// sound.js — CoCo sound emulation
// The CoCo uses a 6-bit DAC on PIA1 port A bits 2-7 for audio output.
// PIA1 CB2 enables/disables the DAC output to the speaker.
// Software writes waveform samples directly — no sound chip.

const SAMPLE_RATE = 44100;
const CPU_CLOCK = 894886;
const BUFFER_SIZE = 1024;

export class Sound {
    constructor() {
        this.audioCtx = null;
        this.enabled = false;
        this.dacValue = 0;        // current 6-bit DAC value (0-63)
        this.soundEnabled = false; // PIA1 CB2 state

        // Ring buffer for audio samples
        this._buffer = new Float32Array(BUFFER_SIZE * 4);
        this._writePos = 0;
        this._readPos = 0;

        // CPU cycle tracking for sample generation
        this._cycleAccum = 0;
        this._cyclesPerSample = CPU_CLOCK / SAMPLE_RATE; // ~20.3
    }

    // Call once on user interaction to start audio (browser requires gesture)
    init() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });
            this._startPlayback();
            this.enabled = true;
        } catch (e) {
            console.warn('Web Audio not available:', e);
        }
    }

    _startPlayback() {
        const ctx = this.audioCtx;
        const bufferSize = BUFFER_SIZE;
        const self = this;

        // Use ScriptProcessorNode for simplicity (AudioWorklet is better but complex)
        const node = ctx.createScriptProcessor(bufferSize, 0, 1);
        node.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                if (self._readPos !== self._writePos) {
                    output[i] = self._buffer[self._readPos];
                    self._readPos = (self._readPos + 1) % self._buffer.length;
                } else {
                    output[i] = 0; // silence when buffer empty
                }
            }
        };
        node.connect(ctx.destination);
    }

    // Called when PIA1 port A is written (DAC value update)
    // dacBits = bits 2-7 of the written value
    setDAC(value) {
        this.dacValue = (value >> 2) & 0x3F;
    }

    // Called when PIA1 CB2 changes (sound enable/disable)
    setSoundEnable(enabled) {
        this.soundEnabled = enabled;
    }

    // Call each CPU instruction with cycle count to generate audio samples
    addCycles(cycles) {
        if (!this.enabled) return;

        this._cycleAccum += cycles;
        while (this._cycleAccum >= this._cyclesPerSample) {
            this._cycleAccum -= this._cyclesPerSample;

            // Convert 6-bit DAC (0-63) to float (-1 to 1)
            const sample = this.soundEnabled
                ? ((this.dacValue / 31.5) - 1.0) * 0.5  // scale and center, reduce volume
                : 0;

            // Write to ring buffer
            const nextWrite = (this._writePos + 1) % this._buffer.length;
            if (nextWrite !== this._readPos) { // don't overflow
                this._buffer[this._writePos] = sample;
                this._writePos = nextWrite;
            }
        }
    }
}
