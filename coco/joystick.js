// joystick.js — CoCo joystick emulation
// The CoCo reads joystick position using software successive-approximation:
//   1. Write DAC value to PIA1 port A bits 2-7
//   2. Select axis via PIA0 CA2 (bit) and CB2 (select)
//   3. Read comparator result from PIA0 port A bit 7
// Axis values range 0-63 (6-bit DAC)

export class Joystick {
    constructor() {
        // Stick positions (0-63, center = 31)
        this.axes = [31, 31, 31, 31]; // left X, left Y, right X, right Y
        this.buttons = [false, false]; // left, right

        // Arrow key state for gradual movement
        this._keyState = { left: false, right: false, up: false, down: false };
        this._accel = 0;          // acceleration (how fast to move)
        this._accelTimer = 0;     // frames since key held
    }

    // Update from keyboard state — call each frame
    update() {
        const speed = Math.min(1 + Math.floor(this._accelTimer / 8), 8);

        if (this._keyState.left)  this.axes[0] = Math.max(0, this.axes[0] - speed);
        if (this._keyState.right) this.axes[0] = Math.min(63, this.axes[0] + speed);
        if (this._keyState.up)    this.axes[1] = Math.max(0, this.axes[1] - speed);
        if (this._keyState.down)  this.axes[1] = Math.min(63, this.axes[1] + speed);

        const anyHeld = this._keyState.left || this._keyState.right ||
                        this._keyState.up || this._keyState.down;

        if (anyHeld) {
            this._accelTimer++;
        } else {
            this._accelTimer = 0;
            // Spring back to center
            this.axes[0] += Math.sign(31 - this.axes[0]);
            this.axes[1] += Math.sign(31 - this.axes[1]);
        }
    }

    // Handle browser key events (returns true if consumed)
    // Numpad or Shift+Arrow for joystick to avoid conflicting with CoCo keys
    keyDown(event) {
        // Numpad keys (NumLock off)
        switch (event.code) {
            case 'Numpad8': this._keyState.up = true;    return true;
            case 'Numpad2': this._keyState.down = true;  return true;
            case 'Numpad4': this._keyState.left = true;  return true;
            case 'Numpad6': this._keyState.right = true; return true;
            case 'Numpad0':
            case 'Numpad5': this.buttons[0] = true;      return true;
        }
        // Also support Shift+Arrow (Shift+Arrow won't type CoCo arrow keys since
        // CoCo SHIFT+arrow produces different chars, and games don't use that)
        if (event.shiftKey) {
            switch (event.key) {
                case 'ArrowUp':    this._keyState.up = true;    return true;
                case 'ArrowDown':  this._keyState.down = true;  return true;
                case 'ArrowLeft':  this._keyState.left = true;  return true;
                case 'ArrowRight': this._keyState.right = true; return true;
            }
        }
        return false;
    }

    keyUp(event) {
        switch (event.code) {
            case 'Numpad8': this._keyState.up = false;    return true;
            case 'Numpad2': this._keyState.down = false;  return true;
            case 'Numpad4': this._keyState.left = false;  return true;
            case 'Numpad6': this._keyState.right = false; return true;
            case 'Numpad0':
            case 'Numpad5': this.buttons[0] = false;      return true;
        }
        if (event.key === 'ArrowUp')    this._keyState.up = false;
        if (event.key === 'ArrowDown')  this._keyState.down = false;
        if (event.key === 'ArrowLeft')  this._keyState.left = false;
        if (event.key === 'ArrowRight') this._keyState.right = false;
        return false;
    }

    // Compare joystick axis voltage with DAC value
    // Returns true if DAC value >= joystick position (comparator output)
    // axis: 0=leftX, 1=leftY, 2=rightX, 3=rightY
    compare(axis, dacValue) {
        return dacValue <= this.axes[axis & 3];
    }
}
