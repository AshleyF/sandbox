// disk.js — WD1793 Floppy Disk Controller emulation for the CoCo II
// Maps to $FF40-$FF4F: command/status, track, sector, data registers
// $FF48: drive control latch (active drive, motor, density, side, halt)

const TRACKS = 35;
const SECTORS_PER_TRACK = 18;
const SECTOR_SIZE = 256;
const TRACK_SIZE = SECTORS_PER_TRACK * SECTOR_SIZE;
const DISK_SIZE = TRACKS * TRACK_SIZE; // 161,280 bytes

// Status register bits
const STATUS_BUSY       = 0x01;
const STATUS_DRQ        = 0x02;
const STATUS_LOSTDATA   = 0x04;
const STATUS_TRACK0     = 0x04; // Type I only (shared with LOSTDATA)
const STATUS_CRCERR     = 0x08;
const STATUS_SEEKERR    = 0x10;
const STATUS_RNF        = 0x10; // Type II/III (shared with SEEKERR)
const STATUS_HEADLOADED = 0x20; // Type I
const STATUS_RECTYPE    = 0x20; // Type II (shared with HEADLOADED)
const STATUS_WRPROT     = 0x40;
const STATUS_NOTREADY   = 0x80;

export class DiskController {
    constructor() {
        this.drives = [null, null, null, null]; // Uint8Array disk images
        this.driveModified = [false, false, false, false];

        // WD1793 registers
        this.statusReg = 0;
        this.trackReg = 0;
        this.sectorReg = 1;
        this.dataReg = 0;

        // Internal state
        this.currentDrive = 0;
        this.currentTrack = 0; // physical head position
        this.side = 0;
        this.motorOn = false;
        this.density = false; // false = single, true = double
        this.haltEnabled = false;

        // Data transfer buffer
        this.dataBuffer = null;
        this.dataPos = 0;
        this.dataLen = 0;
        this.reading = false;
        this.writing = false;

        // NMI callback — set by system integrator
        this.onNMI = null;
        // HALT callback
        this.onHalt = null;

        // Step direction for step commands (+1 = in, -1 = out)
        this.stepDirection = 1;

        // Command type tracking for status interpretation
        this.lastCommandType = 0;
    }

    // Load a DSK/JVC image into a drive (0-3)
    loadDisk(driveNum, data) {
        if (driveNum < 0 || driveNum > 3) return;
        // Accept any size; pad or truncate to standard if needed
        const disk = new Uint8Array(Math.max(DISK_SIZE, data.length));
        disk.set(data.subarray(0, disk.length));
        this.drives[driveNum] = disk;
        this.driveModified[driveNum] = false;
    }

    // Remove disk from drive
    ejectDisk(driveNum) {
        if (driveNum < 0 || driveNum > 3) return;
        this.drives[driveNum] = null;
        this.driveModified[driveNum] = false;
    }

    // Get current disk image data (for saving)
    getDiskData(driveNum) {
        if (driveNum < 0 || driveNum > 3) return null;
        return this.drives[driveNum];
    }

    // Calculate byte offset into disk image for current track/sector
    _sectorOffset(track, sector) {
        // Sectors numbered 1-18
        return (track * SECTORS_PER_TRACK + (sector - 1)) * SECTOR_SIZE;
    }

    _isDiskInserted() {
        return this.drives[this.currentDrive] !== null;
    }

    _assertNMI() {
        if (this.onNMI) this.onNMI(true);
    }

    _deassertNMI() {
        if (this.onNMI) this.onNMI(false);
    }

    // Read register at offset 0-F
    read(addr) {
        const reg = addr & 0x0F;

        if (reg === 8) {
            // $FF48: drive control latch — write-only, reads return 0
            return 0;
        }

        switch (reg) {
            case 0: { // Status register
                const st = this.statusReg;
                // Reading status clears NMI
                this._deassertNMI();
                return st;
            }
            case 1: // Track register
                return this.trackReg & 0xFF;
            case 2: // Sector register
                return this.sectorReg & 0xFF;
            case 3: { // Data register
                if (this.reading && this.dataBuffer) {
                    this.dataReg = this.dataBuffer[this.dataPos++];
                    if (this.dataPos >= this.dataLen) {
                        // Transfer complete
                        this.reading = false;
                        this.statusReg &= ~(STATUS_BUSY | STATUS_DRQ);
                        this.dataBuffer = null;
                        this._assertNMI();
                    } else {
                        // More data available
                        this.statusReg |= STATUS_DRQ;
                        this._assertNMI();
                    }
                }
                return this.dataReg & 0xFF;
            }
            default:
                return 0;
        }
    }

    // Write register at offset 0-F
    write(addr, val) {
        const reg = addr & 0x0F;
        val &= 0xFF;

        if (reg === 8) {
            // $FF48: Drive control latch
            this.currentDrive = val & 0x03;         // bits 0-1: drive select (but CoCo typically uses bits 0-2)
            this.motorOn = !!(val & 0x08);           // bit 3: motor on
            this.density = !!(val & 0x20);           // bit 5: density (0=single, 1=double)
            this.side = (val >> 6) & 0x01;           // bit 6: side select
            this.haltEnabled = !!(val & 0x80);       // bit 7: halt enable
            return;
        }

        switch (reg) {
            case 0: // Command register
                this._executeCommand(val);
                break;
            case 1: // Track register
                this.trackReg = val;
                break;
            case 2: // Sector register
                this.sectorReg = val;
                break;
            case 3: // Data register
                this.dataReg = val;
                if (this.writing && this.dataBuffer) {
                    this.dataBuffer[this.dataPos++] = val;
                    if (this.dataPos >= this.dataLen) {
                        // Write complete — flush to disk
                        this._flushWriteBuffer();
                        this.writing = false;
                        this.statusReg &= ~(STATUS_BUSY | STATUS_DRQ);
                        this.dataBuffer = null;
                        this._assertNMI();
                    } else {
                        this.statusReg |= STATUS_DRQ;
                        this._assertNMI();
                    }
                }
                break;
        }
    }

    _executeCommand(cmd) {
        // Clear previous transfer state
        this._deassertNMI();

        if ((cmd & 0xF0) === 0xD0) {
            // Type IV: Force Interrupt — special case
            this._cmdForceInterrupt(cmd);
            return;
        }

        if (cmd < 0x80) {
            // Type I commands
            this.lastCommandType = 1;
            this.statusReg = STATUS_BUSY;

            if (cmd < 0x10) {
                this._cmdRestore(cmd);
            } else if (cmd < 0x20) {
                this._cmdSeek(cmd);
            } else if (cmd < 0x40) {
                this._cmdStep(cmd, 0);
            } else if (cmd < 0x60) {
                this._cmdStepIn(cmd);
            } else {
                this._cmdStepOut(cmd);
            }
        } else if (cmd < 0xC0) {
            // Type II commands
            this.lastCommandType = 2;
            this.statusReg = STATUS_BUSY;

            if (cmd < 0xA0) {
                this._cmdReadSector(cmd);
            } else {
                this._cmdWriteSector(cmd);
            }
        } else {
            // Type III commands
            this.lastCommandType = 3;
            this.statusReg = STATUS_BUSY;

            if (cmd < 0xE0) {
                // $C0-$DF but $D0-$DF is Force Interrupt (handled above)
                this._cmdReadAddress(cmd);
            } else if (cmd < 0xF0) {
                this._cmdReadTrack(cmd);
            } else {
                this._cmdWriteTrack(cmd);
            }
        }
    }

    // Type I: Restore — move head to track 0
    _cmdRestore(cmd) {
        this.currentTrack = 0;
        this.trackReg = 0;
        this.statusReg = STATUS_TRACK0;
        if (cmd & 0x04) this.statusReg |= STATUS_HEADLOADED;
        if (!this._isDiskInserted()) this.statusReg |= STATUS_NOTREADY;
    }

    // Type I: Seek — move to track specified in data register
    _cmdSeek(cmd) {
        const target = this.dataReg;
        if (target < TRACKS) {
            this.stepDirection = target > this.currentTrack ? 1 : -1;
            this.currentTrack = target;
            this.trackReg = target;
            this.statusReg = 0;
            if (this.currentTrack === 0) this.statusReg |= STATUS_TRACK0;
            if (cmd & 0x04) this.statusReg |= STATUS_HEADLOADED;
        } else {
            this.statusReg = STATUS_SEEKERR;
        }
        if (!this._isDiskInserted()) this.statusReg |= STATUS_NOTREADY;
    }

    // Type I: Step (use last direction)
    _cmdStep(cmd, dirOverride) {
        const dir = dirOverride || this.stepDirection;
        const newTrack = this.currentTrack + dir;
        if (newTrack >= 0 && newTrack < TRACKS) {
            this.currentTrack = newTrack;
            if (cmd & 0x10) this.trackReg = newTrack; // update track register if T flag set
        }
        this.statusReg = 0;
        if (this.currentTrack === 0) this.statusReg |= STATUS_TRACK0;
        if (cmd & 0x04) this.statusReg |= STATUS_HEADLOADED;
        if (!this._isDiskInserted()) this.statusReg |= STATUS_NOTREADY;
    }

    // Type I: Step In (toward higher tracks)
    _cmdStepIn(cmd) {
        this.stepDirection = 1;
        this._cmdStep(cmd, 1);
    }

    // Type I: Step Out (toward track 0)
    _cmdStepOut(cmd) {
        this.stepDirection = -1;
        this._cmdStep(cmd, -1);
    }

    // Type II: Read Sector
    _cmdReadSector(cmd) {
        if (!this._isDiskInserted()) {
            this.statusReg = STATUS_NOTREADY;
            this._assertNMI();
            return;
        }

        const track = this.trackReg;
        const sector = this.sectorReg;

        if (sector < 1 || sector > SECTORS_PER_TRACK || track >= TRACKS) {
            this.statusReg = STATUS_RNF;
            this._assertNMI();
            return;
        }

        const offset = this._sectorOffset(track, sector);
        const disk = this.drives[this.currentDrive];

        this.dataBuffer = new Uint8Array(SECTOR_SIZE);
        this.dataBuffer.set(disk.subarray(offset, offset + SECTOR_SIZE));
        this.dataPos = 0;
        this.dataLen = SECTOR_SIZE;
        this.reading = true;
        this.writing = false;

        this.statusReg = STATUS_BUSY | STATUS_DRQ;
        this._assertNMI();
    }

    // Type II: Write Sector
    _cmdWriteSector(cmd) {
        if (!this._isDiskInserted()) {
            this.statusReg = STATUS_NOTREADY;
            this._assertNMI();
            return;
        }

        const track = this.trackReg;
        const sector = this.sectorReg;

        if (sector < 1 || sector > SECTORS_PER_TRACK || track >= TRACKS) {
            this.statusReg = STATUS_RNF;
            this._assertNMI();
            return;
        }

        this.dataBuffer = new Uint8Array(SECTOR_SIZE);
        this.dataPos = 0;
        this.dataLen = SECTOR_SIZE;
        this.reading = false;
        this.writing = true;
        this._writeTrack = track;
        this._writeSector = sector;

        this.statusReg = STATUS_BUSY | STATUS_DRQ;
        this._assertNMI();
    }

    // Flush write buffer to disk image
    _flushWriteBuffer() {
        const offset = this._sectorOffset(this._writeTrack, this._writeSector);
        const disk = this.drives[this.currentDrive];
        if (disk && this.dataBuffer) {
            disk.set(this.dataBuffer, offset);
            this.driveModified[this.currentDrive] = true;
        }
    }

    // Type III: Read Address — returns 6 bytes: track, side, sector, sector length, CRC1, CRC2
    _cmdReadAddress(cmd) {
        if (!this._isDiskInserted()) {
            this.statusReg = STATUS_NOTREADY;
            this._assertNMI();
            return;
        }

        this.dataBuffer = new Uint8Array(6);
        this.dataBuffer[0] = this.currentTrack;
        this.dataBuffer[1] = this.side;
        this.dataBuffer[2] = this.sectorReg || 1;
        this.dataBuffer[3] = 0x01; // sector length code: 256 bytes
        this.dataBuffer[4] = 0x00; // CRC byte 1
        this.dataBuffer[5] = 0x00; // CRC byte 2
        this.dataPos = 0;
        this.dataLen = 6;
        this.reading = true;
        this.writing = false;

        // Read Address also sets the sector register to the track
        this.sectorReg = this.currentTrack;

        this.statusReg = STATUS_BUSY | STATUS_DRQ;
        this._assertNMI();
    }

    // Type III: Read Track — read raw track data
    _cmdReadTrack(cmd) {
        if (!this._isDiskInserted()) {
            this.statusReg = STATUS_NOTREADY;
            this._assertNMI();
            return;
        }

        const track = this.currentTrack;
        if (track >= TRACKS) {
            this.statusReg = STATUS_RNF;
            this._assertNMI();
            return;
        }

        const offset = track * TRACK_SIZE;
        const disk = this.drives[this.currentDrive];

        this.dataBuffer = new Uint8Array(TRACK_SIZE);
        this.dataBuffer.set(disk.subarray(offset, offset + TRACK_SIZE));
        this.dataPos = 0;
        this.dataLen = TRACK_SIZE;
        this.reading = true;
        this.writing = false;

        this.statusReg = STATUS_BUSY | STATUS_DRQ;
        this._assertNMI();
    }

    // Type III: Write Track (format track)
    _cmdWriteTrack(cmd) {
        if (!this._isDiskInserted()) {
            this.statusReg = STATUS_NOTREADY;
            this._assertNMI();
            return;
        }

        const track = this.currentTrack;
        if (track >= TRACKS) {
            this.statusReg = STATUS_RNF;
            this._assertNMI();
            return;
        }

        // For formatting, accept TRACK_SIZE bytes
        this.dataBuffer = new Uint8Array(TRACK_SIZE);
        this.dataPos = 0;
        this.dataLen = TRACK_SIZE;
        this.reading = false;
        this.writing = true;
        this._writeTrack = track;
        this._writeSector = 0; // signal: full track write

        this.statusReg = STATUS_BUSY | STATUS_DRQ;
        this._assertNMI();
    }

    // Override _flushWriteBuffer for track writes
    _flushWriteBuffer() {
        const disk = this.drives[this.currentDrive];
        if (!disk || !this.dataBuffer) return;

        if (this._writeSector === 0) {
            // Full track write (format) — write raw data to track offset
            const offset = this._writeTrack * TRACK_SIZE;
            // Only copy actual sector data, ignore format bytes
            // For simplicity, write the buffer directly
            const len = Math.min(this.dataBuffer.length, TRACK_SIZE);
            disk.set(this.dataBuffer.subarray(0, len), offset);
        } else {
            // Single sector write
            const offset = this._sectorOffset(this._writeTrack, this._writeSector);
            disk.set(this.dataBuffer, offset);
        }
        this.driveModified[this.currentDrive] = true;
    }

    // Type IV: Force Interrupt
    _cmdForceInterrupt(cmd) {
        this.reading = false;
        this.writing = false;
        this.dataBuffer = null;
        this.lastCommandType = 4;

        // Build Type I status
        this.statusReg = 0;
        if (this.currentTrack === 0) this.statusReg |= STATUS_TRACK0;
        if (!this._isDiskInserted()) this.statusReg |= STATUS_NOTREADY;

        // If any interrupt condition bits are set, assert NMI
        if (cmd & 0x0F) {
            this._assertNMI();
        }
    }
}
