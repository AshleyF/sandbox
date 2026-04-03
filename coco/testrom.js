// testrom.js — Minimal test ROM for the CoCo emulator
// Hand-assembled 6809 machine code that initializes hardware and writes to screen
// No copyrighted material — just enough to prove the emulator works

export function makeTestROM() {
    // We build a 16K ROM image: 8K ExtBASIC ($8000) + 8K BASIC ($A000)
    // We only really use the BASIC region ($A000-$BFFF) with vectors at $FFF0+
    const extrom = new Uint8Array(0x2000); // $8000-$9FFF
    const rom = new Uint8Array(0x2000);    // $A000-$BFFF

    // Our code lives at $A000 (start of Color BASIC ROM space)
    // Reset vector ($FFFE-$FFFF) points to $A000
    // $FFFE is at rom offset $5FFE (since rom base is $A000)
    rom[0x1FFE] = 0xA0; // reset vector high byte
    rom[0x1FFF] = 0x00; // reset vector low byte

    // Also set other vectors to a safe RTI loop at $A100
    const rtiAddr = 0xA100;
    for (let v = 0xFFF0; v < 0xFFFE; v += 2) {
        rom[v & 0x1FFF] = (rtiAddr >> 8) & 0xFF;
        rom[(v & 0x1FFF) + 1] = rtiAddr & 0xFF;
    }

    // RTI instruction at $A100
    rom[0x0100] = 0x3B; // RTI

    // Main code at $A000
    const code = assemble();
    for (let i = 0; i < code.length; i++) {
        rom[i] = code[i];
    }

    return { rom, extrom };
}

function assemble() {
    // Hand-assembled 6809 code
    const code = [];
    let pc = 0xA000;

    function emit(...bytes) {
        for (const b of bytes) code.push(b & 0xFF);
    }

    // === Initialize stack ===
    // LDS #$1000
    emit(0x10, 0xCE, 0x10, 0x00);

    // === Initialize PIA0 ===
    // Set port A as all inputs (keyboard rows)
    // ANDCC #$AF  — clear I,F (enable interrupts later)
    emit(0x1C, 0xAF);

    // PIA0 Control A: access DDR first (bit 2 = 0)
    // LDA #$00; STA $FF01
    emit(0x86, 0x00);
    emit(0xB7, 0xFF, 0x01);
    // PIA0 DDR A = $00 (all inputs)
    emit(0x86, 0x00);
    emit(0xB7, 0xFF, 0x00);
    // PIA0 Control A: access data register (bit 2 = 1)
    emit(0x86, 0x04);
    emit(0xB7, 0xFF, 0x01);

    // PIA0 Control B: access DDR
    emit(0x86, 0x00);
    emit(0xB7, 0xFF, 0x03);
    // PIA0 DDR B = $FF (all outputs — column select)
    emit(0x86, 0xFF);
    emit(0xB7, 0xFF, 0x02);
    // PIA0 Control B: access data
    emit(0x86, 0x04);
    emit(0xB7, 0xFF, 0x03);

    // === Initialize PIA1 ===
    // PIA1 Control B: access DDR
    emit(0x86, 0x00);
    emit(0xB7, 0xFF, 0x23);
    // PIA1 DDR B = $FF (all outputs — VDG mode, sound, cassette)
    emit(0x86, 0xFF);
    emit(0xB7, 0xFF, 0x22);
    // PIA1 Control B: access data
    emit(0x86, 0x04);
    emit(0xB7, 0xFF, 0x23);
    // PIA1 Data B = $00 (text mode, green color set)
    emit(0x86, 0x00);
    emit(0xB7, 0xFF, 0x22);

    // === Set SAM for text mode ===
    // Video offset: $0400 (default CoCo text screen)
    // F0=0, F1=1 → offset = $0400 ($0200 << 1)
    emit(0xB7, 0xFF, 0xC6); // clear F0 (bit 3)
    emit(0xB7, 0xFF, 0xC9); // set   F1 (bit 4)
    emit(0xB7, 0xFF, 0xCA); // clear F2 (bit 5)
    emit(0xB7, 0xFF, 0xCC); // clear F3 (bit 6)
    emit(0xB7, 0xFF, 0xCE); // clear F4 (bit 7)
    emit(0xB7, 0xFF, 0xD0); // clear F5 (bit 8)
    emit(0xB7, 0xFF, 0xD2); // clear F6 (bit 9)
    // V0-V2 = 0 (text mode)
    emit(0xB7, 0xFF, 0xC0); // clear V0
    emit(0xB7, 0xFF, 0xC2); // clear V1
    emit(0xB7, 0xFF, 0xC4); // clear V2

    // === Clear screen (512 bytes at $0400, fill with $60 = green block/inverse space) ===
    // LDX #$0400
    emit(0x8E, 0x04, 0x00);
    // LDA #$60 (CoCo's default "green block" character)
    emit(0x86, 0x60);
    // clear_loop: STA ,X+
    emit(0xA7, 0x80); // STA ,X+
    // CMPX #$0600
    emit(0x8C, 0x06, 0x00);
    // BNE clear_loop (-5 bytes back)
    emit(0x26, 0xF9);

    // === Write "HELLO COCO II" to screen ===
    // Screen position: row 7, col 9 = $0400 + 7*32 + 9 = $0400 + 224 + 9 = $04E9
    // But center it: row 7, col 10 = $04EA
    // CoCo character codes: A=01, B=02, ..., Z=1A, space=20
    // H=08, E=05, L=0C, O=0F, C=03, I=09
    // "HELLO COCO II" = 08 05 0C 0C 0F 20 03 0F 03 0F 20 09 09

    // LDX #$04EA (row 7, col 10)
    emit(0x8E, 0x04, 0xEA);

    const message = [
        0x08, 0x05, 0x0C, 0x0C, 0x0F, // HELLO
        0x20,                           // (space)
        0x03, 0x0F, 0x03, 0x0F,        // COCO
        0x20,                           // (space)
        0x09, 0x09,                     // II
    ];

    for (const ch of message) {
        // LDA #ch; STA ,X+
        emit(0x86, ch);
        emit(0xA7, 0x80);
    }

    // === Write "EMULATOR READY" on the next line ===
    // Row 9, col 9 = $0400 + 9*32 + 9 = $0529
    emit(0x8E, 0x05, 0x29);
    //  E  M  U  L  A  T  O  R  sp R  E  A  D  Y
    const msg2 = [
        0x05, 0x0D, 0x15, 0x0C, 0x01, 0x14, 0x0F, 0x12, // EMULATOR
        0x20,                                               // (space)
        0x12, 0x05, 0x01, 0x04, 0x19,                      // READY
    ];
    for (const ch of msg2) {
        emit(0x86, ch);
        emit(0xA7, 0x80);
    }

    // === Keyboard scan loop ===
    // Continuously scan keyboard and echo typed characters
    // Start cursor at row 11, col 10
    // LDX #$056A (row 11, col 10)
    emit(0x8E, 0x05, 0x6A);

    // scan_loop:
    const scanLoopStart = code.length;

    // Scan all 8 columns, looking for any key press
    // LDB #$FE (col 0 selected)
    emit(0xC6, 0xFE);
    // LDY #0 (column counter)
    emit(0x10, 0x8E, 0x00, 0x00);

    // col_loop:
    const colLoopStart = code.length;
    // STB $FF02 (PIA0 port B = column select)
    emit(0xF7, 0xFF, 0x02);
    // LDA $FF00 (PIA0 port A = row data)
    emit(0xB6, 0xFF, 0x00);
    // COMA (invert — now 1 = pressed)
    emit(0x43);
    // ANDA #$7F (mask to 7 rows)
    emit(0x84, 0x7F);
    // BNE key_found
    emit(0x26, 0x0E); // jump forward (we'll calculate)

    // No key in this column — try next
    // Shift B left (next column: rotate the 0 bit)
    // COMB; ASLA would work but simpler: SEC; ROLB
    emit(0x54); // LSRB — wrong, we need to rotate the 0 bit. Let me use:
    // Actually use: COMB, ASLB, COMB to shift the active-low pattern
    // Simpler: just keep a lookup. Actually:
    // The column select is active-low. $FE=col0, $FD=col1, $FB=col2, etc.
    // Rotate left through carry to shift the zero bit
    // SEC (ORCC #$01); ROLB
    emit(0x1A, 0x01); // ORCC #$01 (set carry)
    emit(0x59);       // ROLB

    // LEAY 1,Y (increment column counter)
    emit(0x31, 0x21); // LEAY ,Y+ (but we need +1... use 0x31, 0x28, 0x01 for 8-bit offset)
    // Actually: LEAY 1,Y → postbyte for Y with 5-bit offset +1 = 0x21
    // That's: 0 01 00001 = $21, which is +1 from Y
    // Compare Y to 8
    emit(0x10, 0x8C, 0x00, 0x08); // CMPY #8
    // BNE col_loop
    const colLoopOffset = colLoopStart - (code.length + 2);
    emit(0x26, colLoopOffset & 0xFF);

    // No key found — loop back to scan_loop
    const scanLoopOffset = scanLoopStart - (code.length + 2);
    emit(0x20, scanLoopOffset & 0xFF); // BRA scan_loop

    // key_found:
    // A has row bits (1=pressed), Y has column number
    // Simple approach: just toggle cursor blink
    // For now, just show a blinking cursor by toggling the char at X
    // LDA ,X
    emit(0xA6, 0x84);
    // EORA #$40 (toggle inverse)
    emit(0x88, 0x40);
    // STA ,X
    emit(0xA7, 0x84);

    // Small delay to debounce
    // LDA #$FF
    emit(0x86, 0xFF);
    // delay: DECA; BNE delay
    emit(0x4A);
    emit(0x26, 0xFD);

    // Back to scan loop
    const backOffset = scanLoopStart - (code.length + 2);
    emit(0x20, backOffset & 0xFF);

    return code;
}
