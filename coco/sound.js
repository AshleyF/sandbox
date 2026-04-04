// sound.js — CoCo sound emulation
// Detects DAC oscillation frequency and plays a matching tone.
// Much simpler than sample-accurate emulation and avoids buffer issues.

export class Sound {
    constructor() {
        this.audioCtx = null;
        this.enabled = false;
        this.dacValue = 0;
        this.soundEnabled = false;

        // Edge detection for frequency measurement
        this._lastValue = 32; // midpoint
        this._lastEdgeCycle = 0;
        this._totalCycles = 0;
        this._halfPeriods = [];

        // Active oscillator
        this._osc = null;
        this._gain = null;
        this._currentFreq = 0;
        this._lastSoundCycle = 0;
    }

    init() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this._gain = this.audioCtx.createGain();
            this._gain.gain.value = 0;
            this._gain.connect(this.audioCtx.destination);
            this.enabled = true;
        } catch (e) {
            console.warn('Web Audio not available:', e);
        }
    }

    setDAC(value) {
        const newVal = (value >> 2) & 0x3F;
        if (newVal === this.dacValue) return;

        const oldVal = this.dacValue;
        this.dacValue = newVal;

        if (!this.soundEnabled) return;

        // Detect oscillation: any direction change counts as an edge
        const goingUp = newVal > oldVal;
        if (this._lastDirection !== undefined && goingUp !== this._lastDirection) {
            // Direction changed — this is a half-cycle edge
            const now = this._totalCycles;
            if (this._lastEdgeCycle > 0) {
                const halfPeriod = now - this._lastEdgeCycle;
                if (halfPeriod > 100 && halfPeriod < 5000) {
                    this._halfPeriods.push(halfPeriod);
                    if (this._halfPeriods.length > 8) this._halfPeriods.shift();
                    this._lastSoundCycle = now;
                }
            }
            this._lastEdgeCycle = now;
        }
        this._lastDirection = goingUp;
    }

    setSoundEnable(enabled) {
        this.soundEnabled = enabled;
        if (!enabled) this._stopTone();
    }

    addCycles(cycles) {
        if (!this.enabled) return;
        this._totalCycles += cycles;

        // If no valid sound edges for ~10ms, stop the tone
        if (this._totalCycles - this._lastSoundCycle > 9000) {
            if (this._currentFreq > 0) this._stopTone();
            this._halfPeriods = [];
            return;
        }

        // Update frequency from recent half-periods
        if (this._halfPeriods.length >= 4) {
            const avg = this._halfPeriods.reduce((a, b) => a + b, 0) / this._halfPeriods.length;
            const freq = 894886 / (avg * 2);
            if (Math.abs(freq - this._currentFreq) > 5) {
                this._playTone(freq);
            }
        }
    }

    _playTone(freq) {
        if (!this.audioCtx || !this._gain) return;
        if (freq < 20 || freq > 15000) return;

        if (!this._osc) {
            this._osc = this.audioCtx.createOscillator();
            this._osc.type = 'square';
            this._osc.connect(this._gain);
            this._osc.start();
        }

        this._osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        this._gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        this._currentFreq = freq;
    }

    _stopTone() {
        if (this._gain) {
            this._gain.gain.setValueAtTime(0, this.audioCtx?.currentTime || 0);
        }
        this._currentFreq = 0;
    }

    flush() {}
}
