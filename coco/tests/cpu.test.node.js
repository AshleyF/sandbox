// Node.js test runner — runs the same tests without a browser
import { MC6809 } from '../cpu.js';
import { Debugger } from '../debug.js';

// Minimal test framework (same API as run.js but for Node)
let _passed = 0, _failed = 0, _errors = [], _currentSuite = '';

function suite(name) {
    _currentSuite = name;
    console.log(`\n=== ${name} ===`);
}

function test(name, fn) {
    try {
        fn();
        _passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        _failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
        _errors.push({ suite: _currentSuite, test: name, error: e.message });
    }
}

function eq(actual, expected, label = '') {
    if (actual !== expected) {
        const prefix = label ? `${label}: ` : '';
        throw new Error(`${prefix}expected ${expected} (0x${expected.toString(16).toUpperCase()}), got ${actual} (0x${actual.toString(16).toUpperCase()})`);
    }
}

function isTrue(val, label = '') {
    if (val !== true) throw new Error(`${label || 'value'}: expected true, got ${val}`);
}

function isFalse(val, label = '') {
    if (val !== false) throw new Error(`${label || 'value'}: expected false, got ${val}`);
}

function summary() {
    const total = _passed + _failed;
    console.log(`\n${_passed}/${total} passed, ${_failed} failed`);
    if (_errors.length > 0) {
        console.log('\nFailures:');
        _errors.forEach(e => console.log(`  [${e.suite}] ${e.test}: ${e.error}`));
    }
    process.exit(_failed > 0 ? 1 : 0);
}

// Make these available to the test file via globalThis
globalThis.suite = suite;
globalThis.test = test;
globalThis.eq = eq;
globalThis.isTrue = isTrue;
globalThis.isFalse = isFalse;
globalThis.summary = summary;
globalThis.setOutput = () => {};

// Helper
function makeCPU(program, startAddr = 0x0000) {
    const mem = new Uint8Array(0x10000);
    for (let i = 0; i < program.length; i++) {
        mem[(startAddr + i) & 0xFFFF] = program[i];
    }
    const cpu = new MC6809(
        addr => mem[addr & 0xFFFF],
        (addr, val) => { mem[addr & 0xFFFF] = val & 0xFF; }
    );
    cpu.pc = startAddr;
    cpu.mem = mem;
    return cpu;
}

globalThis.makeCPU = makeCPU;
globalThis.MC6809 = MC6809;
globalThis.Debugger = Debugger;

// Now re-export to run the actual tests inline
// (We'll import and run the test content below)

// ===================================================================
// Copy of test content (adapted for Node — no DOM, no ES module imports)
// ===================================================================

suite('Load/Store 8-bit');

test('LDA immediate', () => {
    const cpu = makeCPU([0x86, 0x42]);
    cpu.step();
    eq(cpu.a, 0x42, 'A');
    isFalse(cpu.flagN, 'N');
    isFalse(cpu.flagZ, 'Z');
    isFalse(cpu.flagV, 'V');
});

test('LDA immediate zero sets Z', () => {
    const cpu = makeCPU([0x86, 0x00]);
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagZ, 'Z');
});

test('LDA immediate negative sets N', () => {
    const cpu = makeCPU([0x86, 0x80]);
    cpu.step();
    eq(cpu.a, 0x80, 'A');
    isTrue(cpu.flagN, 'N');
});

test('LDB immediate', () => {
    const cpu = makeCPU([0xC6, 0xFF]);
    cpu.step();
    eq(cpu.b, 0xFF, 'B');
    isTrue(cpu.flagN, 'N');
});

test('STA direct', () => {
    const cpu = makeCPU([0x97, 0x50]);
    cpu.a = 0x42;
    cpu.dp = 0x00;
    cpu.step();
    eq(cpu.mem[0x0050], 0x42, 'mem');
});

test('STB extended', () => {
    const cpu = makeCPU([0xF7, 0x12, 0x34]);
    cpu.b = 0xAB;
    cpu.step();
    eq(cpu.mem[0x1234], 0xAB, 'mem');
});

test('LDA direct', () => {
    const cpu = makeCPU([0x96, 0x50]);
    cpu.dp = 0x00;
    cpu.mem[0x0050] = 0x77;
    cpu.step();
    eq(cpu.a, 0x77, 'A');
});

test('LDA extended', () => {
    const cpu = makeCPU([0xB6, 0x20, 0x00]);
    cpu.mem[0x2000] = 0x99;
    cpu.step();
    eq(cpu.a, 0x99, 'A');
});

suite('Load/Store 16-bit');

test('LDD immediate', () => {
    const cpu = makeCPU([0xCC, 0x12, 0x34]);
    cpu.step();
    eq(cpu.a, 0x12, 'A');
    eq(cpu.b, 0x34, 'B');
    eq(cpu.d, 0x1234, 'D');
});

test('LDX immediate', () => {
    const cpu = makeCPU([0x8E, 0xAB, 0xCD]);
    cpu.step();
    eq(cpu.x, 0xABCD, 'X');
    isTrue(cpu.flagN, 'N');
});

test('LDU immediate', () => {
    const cpu = makeCPU([0xCE, 0x00, 0x00]);
    cpu.step();
    eq(cpu.u, 0x0000, 'U');
    isTrue(cpu.flagZ, 'Z');
});

test('STD direct', () => {
    const cpu = makeCPU([0xDD, 0x10]);
    cpu.dp = 0x00;
    cpu.a = 0xAB; cpu.b = 0xCD;
    cpu.step();
    eq(cpu.mem[0x0010], 0xAB, 'high');
    eq(cpu.mem[0x0011], 0xCD, 'low');
});

test('STX extended', () => {
    const cpu = makeCPU([0xBF, 0x30, 0x00]);
    cpu.x = 0x1234;
    cpu.step();
    eq(cpu.mem[0x3000], 0x12, 'high');
    eq(cpu.mem[0x3001], 0x34, 'low');
});

suite('Arithmetic 8-bit');

test('ADDA immediate', () => {
    const cpu = makeCPU([0x8B, 0x10]);
    cpu.a = 0x20;
    cpu.step();
    eq(cpu.a, 0x30, 'A');
    isFalse(cpu.flagC, 'C');
    isFalse(cpu.flagV, 'V');
});

test('ADDA carry', () => {
    const cpu = makeCPU([0x8B, 0x01]);
    cpu.a = 0xFF;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagZ, 'Z');
});

test('ADDA overflow', () => {
    const cpu = makeCPU([0x8B, 0x50]);
    cpu.a = 0x50;
    cpu.step();
    eq(cpu.a, 0xA0, 'A');
    isTrue(cpu.flagV, 'V');
    isTrue(cpu.flagN, 'N');
});

test('ADDA half carry', () => {
    const cpu = makeCPU([0x8B, 0x08]);
    cpu.a = 0x08;
    cpu.step();
    eq(cpu.a, 0x10, 'A');
    isTrue(cpu.flagH, 'H');
});

test('ADDB immediate', () => {
    const cpu = makeCPU([0xCB, 0x05]);
    cpu.b = 0x03;
    cpu.step();
    eq(cpu.b, 0x08, 'B');
});

test('SUBA immediate', () => {
    const cpu = makeCPU([0x80, 0x03]);
    cpu.a = 0x10;
    cpu.step();
    eq(cpu.a, 0x0D, 'A');
    isFalse(cpu.flagC, 'C');
});

test('SUBA borrow', () => {
    const cpu = makeCPU([0x80, 0x05]);
    cpu.a = 0x03;
    cpu.step();
    eq(cpu.a, 0xFE, 'A');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagN, 'N');
});

test('SUBA overflow', () => {
    const cpu2 = makeCPU([0x80, 0xD0]);
    cpu2.a = 0x50;
    cpu2.step();
    eq(cpu2.a, 0x80, 'A');
    isTrue(cpu2.flagV, 'V');
});

test('ADCA with carry', () => {
    const cpu = makeCPU([0x89, 0x01]);
    cpu.a = 0x10;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0x12, 'A');
});

test('SBCA with carry', () => {
    const cpu = makeCPU([0x82, 0x01]);
    cpu.a = 0x10;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0x0E, 'A');
});

test('CMPA immediate equal', () => {
    const cpu = makeCPU([0x81, 0x42]);
    cpu.a = 0x42;
    cpu.step();
    eq(cpu.a, 0x42, 'A unchanged');
    isTrue(cpu.flagZ, 'Z');
    isFalse(cpu.flagC, 'C');
});

test('CMPA immediate less', () => {
    const cpu = makeCPU([0x81, 0x50]);
    cpu.a = 0x20;
    cpu.step();
    isTrue(cpu.flagC, 'C');
    isFalse(cpu.flagZ, 'Z');
});

suite('Arithmetic 16-bit');

test('ADDD immediate', () => {
    const cpu = makeCPU([0xC3, 0x10, 0x00]);
    cpu.a = 0x01; cpu.b = 0x00;
    cpu.step();
    eq(cpu.d, 0x1100, 'D');
});

test('ADDD carry', () => {
    const cpu = makeCPU([0xC3, 0x00, 0x01]);
    cpu.a = 0xFF; cpu.b = 0xFF;
    cpu.step();
    eq(cpu.d, 0x0000, 'D');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagZ, 'Z');
});

test('SUBD immediate', () => {
    const cpu = makeCPU([0x83, 0x00, 0x10]);
    cpu.a = 0x01; cpu.b = 0x00;
    cpu.step();
    eq(cpu.d, 0x00F0, 'D');
});

test('CMPX immediate', () => {
    const cpu = makeCPU([0x8C, 0x10, 0x00]);
    cpu.x = 0x1000;
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
    eq(cpu.x, 0x1000, 'X unchanged');
});

suite('Logic');

test('ANDA immediate', () => {
    const cpu = makeCPU([0x84, 0x0F]);
    cpu.a = 0xAB;
    cpu.step();
    eq(cpu.a, 0x0B, 'A');
    isFalse(cpu.flagV, 'V');
});

test('ORA immediate', () => {
    const cpu = makeCPU([0x8A, 0xF0]);
    cpu.a = 0x0A;
    cpu.step();
    eq(cpu.a, 0xFA, 'A');
    isTrue(cpu.flagN, 'N');
});

test('EORA immediate', () => {
    const cpu = makeCPU([0x88, 0xFF]);
    cpu.a = 0xAA;
    cpu.step();
    eq(cpu.a, 0x55, 'A');
});

test('BITA immediate', () => {
    const cpu = makeCPU([0x85, 0x80]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0x80, 'A unchanged');
    isTrue(cpu.flagN, 'N');
    isFalse(cpu.flagZ, 'Z');
});

test('BITA zero result', () => {
    const cpu = makeCPU([0x85, 0x0F]);
    cpu.a = 0xF0;
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
});

test('ANDB immediate', () => {
    const cpu = makeCPU([0xC4, 0x55]);
    cpu.b = 0xFF;
    cpu.step();
    eq(cpu.b, 0x55, 'B');
});

suite('Shifts & Rotates');

test('ASLA', () => {
    const cpu = makeCPU([0x48]);
    cpu.a = 0x55;
    cpu.step();
    eq(cpu.a, 0xAA, 'A');
    isFalse(cpu.flagC, 'C');
    isTrue(cpu.flagN, 'N');
});

test('ASLA carry out', () => {
    const cpu = makeCPU([0x48]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagZ, 'Z');
});

test('LSRA', () => {
    const cpu = makeCPU([0x44]);
    cpu.a = 0xAA;
    cpu.step();
    eq(cpu.a, 0x55, 'A');
    isFalse(cpu.flagC, 'C');
});

test('LSRA carry out', () => {
    const cpu = makeCPU([0x44]);
    cpu.a = 0x01;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagC, 'C');
});

test('ASRA preserves sign', () => {
    const cpu = makeCPU([0x47]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0xC0, 'A');
    isTrue(cpu.flagN, 'N');
});

test('ROLA through carry', () => {
    const cpu = makeCPU([0x49]);
    cpu.a = 0x55;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0xAB, 'A');
    isFalse(cpu.flagC, 'C');
});

test('RORA through carry', () => {
    const cpu = makeCPU([0x46]);
    cpu.a = 0xAA;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0xD5, 'A');
    isFalse(cpu.flagC, 'C');
});

test('ASL memory direct', () => {
    const cpu = makeCPU([0x08, 0x50]);
    cpu.dp = 0x00;
    cpu.mem[0x0050] = 0x40;
    cpu.step();
    eq(cpu.mem[0x0050], 0x80, 'mem');
});

suite('Inc/Dec/Neg/Com/Clr/Tst');

test('INCA', () => { const cpu = makeCPU([0x4C]); cpu.a = 0x41; cpu.step(); eq(cpu.a, 0x42, 'A'); });
test('INCA overflow', () => { const cpu = makeCPU([0x4C]); cpu.a = 0x7F; cpu.step(); eq(cpu.a, 0x80, 'A'); isTrue(cpu.flagV, 'V'); });
test('INCA wrap', () => { const cpu = makeCPU([0x4C]); cpu.a = 0xFF; cpu.step(); eq(cpu.a, 0x00, 'A'); isTrue(cpu.flagZ, 'Z'); });
test('DECA', () => { const cpu = makeCPU([0x4A]); cpu.a = 0x01; cpu.step(); eq(cpu.a, 0x00, 'A'); isTrue(cpu.flagZ, 'Z'); });
test('DECA overflow', () => { const cpu = makeCPU([0x4A]); cpu.a = 0x80; cpu.step(); eq(cpu.a, 0x7F, 'A'); isTrue(cpu.flagV, 'V'); });
test('NEGA', () => { const cpu = makeCPU([0x40]); cpu.a = 0x05; cpu.step(); eq(cpu.a, 0xFB, 'A'); isTrue(cpu.flagC, 'C'); });
test('NEGA zero', () => { const cpu = makeCPU([0x40]); cpu.a = 0x00; cpu.step(); eq(cpu.a, 0x00, 'A'); isFalse(cpu.flagC, 'C'); });
test('NEGA $80 overflow', () => { const cpu = makeCPU([0x40]); cpu.a = 0x80; cpu.step(); eq(cpu.a, 0x80, 'A'); isTrue(cpu.flagV, 'V'); });
test('COMA', () => { const cpu = makeCPU([0x43]); cpu.a = 0x55; cpu.step(); eq(cpu.a, 0xAA, 'A'); isTrue(cpu.flagC, 'C'); });
test('CLRA', () => { const cpu = makeCPU([0x4F]); cpu.a = 0xFF; cpu.step(); eq(cpu.a, 0x00, 'A'); isTrue(cpu.flagZ, 'Z'); isFalse(cpu.flagC, 'C'); });
test('TSTA positive', () => { const cpu = makeCPU([0x4D]); cpu.a = 0x42; cpu.step(); isFalse(cpu.flagZ, 'Z'); isFalse(cpu.flagN, 'N'); });
test('TSTA zero', () => { const cpu = makeCPU([0x4D]); cpu.a = 0x00; cpu.step(); isTrue(cpu.flagZ, 'Z'); });
test('INCB', () => { const cpu = makeCPU([0x5C]); cpu.b = 0x09; cpu.step(); eq(cpu.b, 0x0A, 'B'); });
test('INC memory direct', () => { const cpu = makeCPU([0x0C, 0x50]); cpu.dp = 0x00; cpu.mem[0x0050] = 0x41; cpu.step(); eq(cpu.mem[0x0050], 0x42, 'mem'); });
test('DEC memory extended', () => { const cpu = makeCPU([0x7A, 0x10, 0x00]); cpu.mem[0x1000] = 0x01; cpu.step(); eq(cpu.mem[0x1000], 0x00, 'mem'); isTrue(cpu.flagZ, 'Z'); });

suite('Branches');

test('BRA forward', () => { const cpu = makeCPU([0x20, 0x05]); cpu.step(); eq(cpu.pc, 0x07, 'PC'); });
test('BRA backward', () => { const cpu = makeCPU([0x12, 0x12, 0x20, 0xFD]); cpu.pc = 0x0002; cpu.step(); eq(cpu.pc, 0x01, 'PC'); });
test('BEQ taken', () => { const cpu = makeCPU([0x27, 0x04]); cpu.flagZ = true; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BEQ not taken', () => { const cpu = makeCPU([0x27, 0x04]); cpu.flagZ = false; cpu.step(); eq(cpu.pc, 0x02, 'PC'); });
test('BNE taken', () => { const cpu = makeCPU([0x26, 0x04]); cpu.flagZ = false; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BCS taken', () => { const cpu = makeCPU([0x25, 0x04]); cpu.flagC = true; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BCC taken', () => { const cpu = makeCPU([0x24, 0x04]); cpu.flagC = false; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BMI taken', () => { const cpu = makeCPU([0x2B, 0x04]); cpu.flagN = true; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BPL taken', () => { const cpu = makeCPU([0x2A, 0x04]); cpu.flagN = false; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BGT taken', () => { const cpu = makeCPU([0x2E, 0x04]); cpu.flagN = false; cpu.flagV = false; cpu.flagZ = false; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BGT not taken Z=1', () => { const cpu = makeCPU([0x2E, 0x04]); cpu.flagN = false; cpu.flagV = false; cpu.flagZ = true; cpu.step(); eq(cpu.pc, 0x02, 'PC'); });
test('BLE taken Z=1', () => { const cpu = makeCPU([0x2F, 0x04]); cpu.flagZ = true; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BHI taken', () => { const cpu = makeCPU([0x22, 0x04]); cpu.flagC = false; cpu.flagZ = false; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('BLS taken', () => { const cpu = makeCPU([0x23, 0x04]); cpu.flagC = true; cpu.flagZ = false; cpu.step(); eq(cpu.pc, 0x06, 'PC'); });
test('LBRA forward', () => { const cpu = makeCPU([0x16, 0x01, 0x00]); cpu.step(); eq(cpu.pc, 0x0103, 'PC'); });
test('LBEQ taken', () => { const cpu = makeCPU([0x10, 0x27, 0x01, 0x00]); cpu.flagZ = true; cpu.step(); eq(cpu.pc, 0x0104, 'PC'); });
test('LBEQ not taken', () => { const cpu = makeCPU([0x10, 0x27, 0x01, 0x00]); cpu.flagZ = false; cpu.step(); eq(cpu.pc, 0x04, 'PC'); });

suite('Subroutine Calls');

test('BSR and RTS', () => {
    const cpu = makeCPU([0x8D, 0x04, 0xC6, 0x99, 0x12, 0x12, 0x86, 0x42, 0x39]);
    cpu.s = 0x1000;
    cpu.step(); eq(cpu.pc, 0x06, 'BSR');
    cpu.step(); eq(cpu.a, 0x42, 'LDA');
    cpu.step(); eq(cpu.pc, 0x02, 'RTS');
    cpu.step(); eq(cpu.b, 0x99, 'LDB');
});

test('JSR extended and RTS', () => {
    const cpu = makeCPU([0xBD, 0x00, 0x10, 0x12]);
    cpu.s = 0x1000;
    cpu.mem[0x0010] = 0x86; cpu.mem[0x0011] = 0x55; cpu.mem[0x0012] = 0x39;
    cpu.step(); eq(cpu.pc, 0x10, 'JSR');
    cpu.step(); cpu.step(); eq(cpu.pc, 0x03, 'RTS');
});

test('LBSR', () => {
    const cpu = makeCPU([0x17, 0x00, 0x10]);
    cpu.s = 0x1000;
    cpu.step();
    eq(cpu.pc, 0x13, 'PC');
    eq(cpu.mem[0x0FFE], 0x00, 'ret hi');
    eq(cpu.mem[0x0FFF], 0x03, 'ret lo');
});

suite('Stack Operations');

test('PSHS/PULS single register', () => {
    const cpu = makeCPU([0x34, 0x02, 0x35, 0x02]);
    cpu.s = 0x1000; cpu.a = 0x42;
    cpu.step(); eq(cpu.s, 0x0FFF, 'S push');
    cpu.a = 0x00; cpu.step(); eq(cpu.a, 0x42, 'A restored');
});

test('PSHS multiple registers', () => {
    const cpu = makeCPU([0x34, 0x16]);
    cpu.s = 0x1000; cpu.a = 0x11; cpu.b = 0x22; cpu.x = 0x3344;
    cpu.step();
    eq(cpu.mem[0x0FFC], 0x11, 'A top'); eq(cpu.mem[0x0FFD], 0x22, 'B');
    eq(cpu.mem[0x0FFE], 0x33, 'X hi'); eq(cpu.mem[0x0FFF], 0x44, 'X lo');
});

test('PULS PC acts as jump', () => {
    const cpu = makeCPU([0x35, 0x80]);
    cpu.s = 0x0FFE; cpu.mem[0x0FFE] = 0x12; cpu.mem[0x0FFF] = 0x34;
    cpu.step(); eq(cpu.pc, 0x1234, 'PC');
});

test('PSHU/PULU', () => {
    const cpu = makeCPU([0x36, 0x04, 0x37, 0x04]);
    cpu.u = 0x2000; cpu.b = 0x77;
    cpu.step(); eq(cpu.u, 0x1FFF, 'U push');
    cpu.b = 0x00; cpu.step(); eq(cpu.b, 0x77, 'B restored');
});

suite('TFR / EXG');

test('TFR A,B', () => { const cpu = makeCPU([0x1F, 0x89]); cpu.a = 0x42; cpu.step(); eq(cpu.b, 0x42, 'B'); });
test('TFR X,Y', () => { const cpu = makeCPU([0x1F, 0x12]); cpu.x = 0x1234; cpu.step(); eq(cpu.y, 0x1234, 'Y'); });
test('EXG A,B', () => { const cpu = makeCPU([0x1E, 0x89]); cpu.a = 0x11; cpu.b = 0x22; cpu.step(); eq(cpu.a, 0x22, 'A'); eq(cpu.b, 0x11, 'B'); });
test('EXG X,Y', () => { const cpu = makeCPU([0x1E, 0x12]); cpu.x = 0x1111; cpu.y = 0x2222; cpu.step(); eq(cpu.x, 0x2222, 'X'); eq(cpu.y, 0x1111, 'Y'); });
test('TFR D,X', () => { const cpu = makeCPU([0x1F, 0x01]); cpu.a = 0xAB; cpu.b = 0xCD; cpu.step(); eq(cpu.x, 0xABCD, 'X'); });

suite('LEA');

test('LEAX offset', () => { const cpu = makeCPU([0x30, 0x88, 0x10]); cpu.x = 0x1000; cpu.step(); eq(cpu.x, 0x1010, 'X'); });
test('LEAX zero sets Z', () => { const cpu = makeCPU([0x30, 0x84]); cpu.x = 0x0000; cpu.step(); isTrue(cpu.flagZ, 'Z'); });
test('LEAY negative offset', () => { const cpu = makeCPU([0x31, 0xA8, 0xFC]); cpu.y = 0x1000; cpu.step(); eq(cpu.y, 0x0FFC, 'Y'); });
test('LEAS 2,S', () => { const cpu = makeCPU([0x32, 0xE8, 0x02]); cpu.s = 0x1000; cpu.step(); eq(cpu.s, 0x1002, 'S'); });

suite('Indexed Addressing');

test('LDA ,X', () => { const cpu = makeCPU([0xA6, 0x84]); cpu.x = 0x2000; cpu.mem[0x2000] = 0x55; cpu.step(); eq(cpu.a, 0x55, 'A'); });
test('LDA 5-bit offset ,X', () => { const cpu = makeCPU([0xA6, 0x05]); cpu.x = 0x1000; cpu.mem[0x1005] = 0x77; cpu.step(); eq(cpu.a, 0x77, 'A'); });
test('LDA negative 5-bit ,X', () => { const cpu = makeCPU([0xA6, 0x1F]); cpu.x = 0x1000; cpu.mem[0x0FFF] = 0x33; cpu.step(); eq(cpu.a, 0x33, 'A'); });
test('LDA ,X+', () => { const cpu = makeCPU([0xA6, 0x80]); cpu.x = 0x2000; cpu.mem[0x2000] = 0xAA; cpu.step(); eq(cpu.a, 0xAA, 'A'); eq(cpu.x, 0x2001, 'X'); });
test('LDA ,X++', () => { const cpu = makeCPU([0xA6, 0x81]); cpu.x = 0x2000; cpu.mem[0x2000] = 0xBB; cpu.step(); eq(cpu.a, 0xBB, 'A'); eq(cpu.x, 0x2002, 'X'); });
test('LDA ,-X', () => { const cpu = makeCPU([0xA6, 0x82]); cpu.x = 0x2001; cpu.mem[0x2000] = 0xCC; cpu.step(); eq(cpu.a, 0xCC, 'A'); eq(cpu.x, 0x2000, 'X'); });
test('LDA ,--X', () => { const cpu = makeCPU([0xA6, 0x83]); cpu.x = 0x2002; cpu.mem[0x2000] = 0xDD; cpu.step(); eq(cpu.a, 0xDD, 'A'); eq(cpu.x, 0x2000, 'X'); });
test('LDA B,X', () => { const cpu = makeCPU([0xA6, 0x85]); cpu.x = 0x1000; cpu.b = 0x05; cpu.mem[0x1005] = 0xEE; cpu.step(); eq(cpu.a, 0xEE, 'A'); });
test('LDA A,X', () => { const cpu = makeCPU([0xA6, 0x86]); cpu.x = 0x1000; cpu.a = 0x03; cpu.mem[0x1003] = 0x44; cpu.step(); eq(cpu.a, 0x44, 'A'); });
test('LDA 8-bit offset,Y', () => { const cpu = makeCPU([0xA6, 0xA8, 0x10]); cpu.y = 0x3000; cpu.mem[0x3010] = 0x55; cpu.step(); eq(cpu.a, 0x55, 'A'); });
test('LDA 16-bit offset,X', () => { const cpu = makeCPU([0xA6, 0x89, 0x10, 0x00]); cpu.x = 0x1000; cpu.mem[0x2000] = 0x66; cpu.step(); eq(cpu.a, 0x66, 'A'); });
test('LDA D,X', () => { const cpu = makeCPU([0xA6, 0x8B]); cpu.x = 0x1000; cpu.a = 0x00; cpu.b = 0x20; cpu.mem[0x1020] = 0x77; cpu.step(); eq(cpu.a, 0x77, 'A'); });
test('LDA n,PCR', () => { const cpu = makeCPU([0xA6, 0x8C, 0x02]); cpu.mem[0x0005] = 0x88; cpu.step(); eq(cpu.a, 0x88, 'A'); });
test('STA ,Y', () => { const cpu = makeCPU([0xA7, 0xA4]); cpu.y = 0x4000; cpu.a = 0x42; cpu.step(); eq(cpu.mem[0x4000], 0x42, 'mem'); });

suite('Indirect Indexed');

test('LDA [,X]', () => {
    const cpu = makeCPU([0xA6, 0x94]);
    cpu.x = 0x2000;
    cpu.mem[0x2000] = 0x30; cpu.mem[0x2001] = 0x00;
    cpu.mem[0x3000] = 0xAA;
    cpu.step(); eq(cpu.a, 0xAA, 'A');
});

test('LDA [n16]', () => {
    const cpu = makeCPU([0xA6, 0x9F, 0x20, 0x00]);
    cpu.mem[0x2000] = 0x40; cpu.mem[0x2001] = 0x00;
    cpu.mem[0x4000] = 0xBB;
    cpu.step(); eq(cpu.a, 0xBB, 'A');
});

suite('Misc Operations');

test('MUL', () => { const cpu = makeCPU([0x3D]); cpu.a = 0x0A; cpu.b = 0x0A; cpu.step(); eq(cpu.d, 100, 'D'); });
test('MUL zero', () => { const cpu = makeCPU([0x3D]); cpu.a = 0x00; cpu.b = 0xFF; cpu.step(); eq(cpu.d, 0, 'D'); isTrue(cpu.flagZ, 'Z'); });
test('MUL carry', () => { const cpu = makeCPU([0x3D]); cpu.a = 0xFF; cpu.b = 0xFF; cpu.step(); eq(cpu.d, 0xFE01, 'D'); isFalse(cpu.flagC, 'C'); });
test('ABX', () => { const cpu = makeCPU([0x3A]); cpu.x = 0x1000; cpu.b = 0x42; cpu.step(); eq(cpu.x, 0x1042, 'X'); });
test('ABX unsigned', () => { const cpu = makeCPU([0x3A]); cpu.x = 0x1000; cpu.b = 0xFF; cpu.step(); eq(cpu.x, 0x10FF, 'X'); });
test('SEX positive', () => { const cpu = makeCPU([0x1D]); cpu.b = 0x42; cpu.step(); eq(cpu.a, 0x00, 'A'); });
test('SEX negative', () => { const cpu = makeCPU([0x1D]); cpu.b = 0x80; cpu.step(); eq(cpu.a, 0xFF, 'A'); isTrue(cpu.flagN, 'N'); });
test('NOP', () => { const cpu = makeCPU([0x12]); const c = cpu.step(); eq(cpu.pc, 0x01, 'PC'); eq(c, 2, 'cycles'); });
test('ORCC', () => { const cpu = makeCPU([0x1A, 0x50]); cpu.cc = 0x00; cpu.step(); isTrue(cpu.flagF, 'F'); isTrue(cpu.flagI, 'I'); });
test('ANDCC', () => { const cpu = makeCPU([0x1C, 0xAF]); cpu.cc = 0xFF; cpu.step(); isFalse(cpu.flagF, 'F'); isFalse(cpu.flagI, 'I'); });

suite('SWI / RTI');

test('SWI pushes and jumps', () => {
    const cpu = makeCPU([0x3F]);
    cpu.s = 0x1000; cpu.a = 0x11; cpu.b = 0x22; cpu.x = 0x3344; cpu.y = 0x5566; cpu.u = 0x7788; cpu.dp = 0x99; cpu.cc = 0x00;
    cpu.mem[0xFFFA] = 0x40; cpu.mem[0xFFFB] = 0x00;
    cpu.step();
    eq(cpu.pc, 0x4000, 'PC');
    isTrue(cpu.flagI, 'I'); isTrue(cpu.flagF, 'F'); isTrue(cpu.flagE, 'E');
});

test('RTI full state E=1', () => {
    const cpu = makeCPU([0x3B]);
    cpu.s = 0x0FF4;
    [0x80, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0x00, 0x50].forEach((v, i) => cpu.mem[0x0FF4 + i] = v);
    cpu.step();
    eq(cpu.a, 0x11, 'A'); eq(cpu.b, 0x22, 'B'); eq(cpu.dp, 0x33, 'DP');
    eq(cpu.x, 0x4455, 'X'); eq(cpu.y, 0x6677, 'Y'); eq(cpu.u, 0x8899, 'U');
    eq(cpu.pc, 0x0050, 'PC');
});

test('RTI fast E=0', () => {
    const cpu = makeCPU([0x3B]);
    cpu.s = 0x0FFD;
    cpu.mem[0x0FFD] = 0x01; cpu.mem[0x0FFE] = 0x12; cpu.mem[0x0FFF] = 0x34;
    cpu.step();
    isFalse(cpu.flagE, 'E'); isTrue(cpu.flagC, 'C'); eq(cpu.pc, 0x1234, 'PC');
});

suite('Page 2 ($10)');

test('CMPD immediate', () => { const cpu = makeCPU([0x10, 0x83, 0x10, 0x00]); cpu.a = 0x10; cpu.b = 0x00; cpu.step(); isTrue(cpu.flagZ, 'Z'); });
test('CMPY immediate', () => { const cpu = makeCPU([0x10, 0x8C, 0x20, 0x00]); cpu.y = 0x1000; cpu.step(); isTrue(cpu.flagC, 'C'); });
test('LDY immediate', () => { const cpu = makeCPU([0x10, 0x8E, 0xAB, 0xCD]); cpu.step(); eq(cpu.y, 0xABCD, 'Y'); });
test('STY direct', () => { const cpu = makeCPU([0x10, 0x9F, 0x50]); cpu.dp = 0x00; cpu.y = 0x1234; cpu.step(); eq(cpu.mem[0x0050], 0x12, 'hi'); eq(cpu.mem[0x0051], 0x34, 'lo'); });
test('LDS immediate', () => { const cpu = makeCPU([0x10, 0xCE, 0x10, 0x00]); cpu.step(); eq(cpu.s, 0x1000, 'S'); });

suite('Page 3 ($11)');

test('CMPU immediate', () => { const cpu = makeCPU([0x11, 0x83, 0x10, 0x00]); cpu.u = 0x1000; cpu.step(); isTrue(cpu.flagZ, 'Z'); });
test('CMPS immediate', () => { const cpu = makeCPU([0x11, 0x8C, 0x20, 0x00]); cpu.s = 0x3000; cpu.step(); isFalse(cpu.flagC, 'C'); });

suite('Cycle Counting');

test('LDA imm=2', () => { eq(makeCPU([0x86, 0x00]).step(), 2, 'cycles'); });
test('LDA dir=4', () => { eq(makeCPU([0x96, 0x00]).step(), 4, 'cycles'); });
test('LDA ext=5', () => { eq(makeCPU([0xB6, 0x00, 0x00]).step(), 5, 'cycles'); });
test('ADDD imm=4', () => { eq(makeCPU([0xC3, 0x00, 0x00]).step(), 4, 'cycles'); });
test('PSHS A=6', () => { const cpu = makeCPU([0x34, 0x02]); cpu.s = 0x1000; eq(cpu.step(), 6, 'cycles'); });
test('PSHS X=7', () => { const cpu = makeCPU([0x34, 0x10]); cpu.s = 0x1000; eq(cpu.step(), 7, 'cycles'); });
test('JSR ext=8', () => { const cpu = makeCPU([0xBD, 0x10, 0x00]); cpu.s = 0x1000; eq(cpu.step(), 8, 'cycles'); });
test('MUL=11', () => { eq(makeCPU([0x3D]).step(), 11, 'cycles'); });
test('Cumulative cycles', () => { const cpu = makeCPU([0x12, 0x12, 0x12]); cpu.step(); cpu.step(); cpu.step(); eq(cpu.cycles, 6, 'total'); });

suite('Multi-instruction Programs');

test('Count down loop', () => {
    const cpu = makeCPU([0xC6, 0x05, 0x5A, 0x26, 0xFD]);
    cpu.step();
    for (let i = 4; i >= 1; i--) { cpu.step(); cpu.step(); }
    cpu.step(); eq(cpu.b, 0, 'B=0');
    cpu.step(); eq(cpu.pc, 0x05, 'past BNE');
});

test('Add array', () => {
    const cpu = makeCPU([0xB6, 0x00, 0x20, 0xBB, 0x00, 0x21, 0xBB, 0x00, 0x22]);
    cpu.mem[0x0020] = 10; cpu.mem[0x0021] = 20; cpu.mem[0x0022] = 30;
    cpu.step(); cpu.step(); cpu.step();
    eq(cpu.a, 60, 'A');
});

test('16-bit counter', () => {
    const cpu = makeCPU([0xCC, 0x00, 0x00, 0xC3, 0x00, 0x01, 0xC3, 0x00, 0x01, 0xC3, 0x00, 0x01]);
    cpu.step(); cpu.step(); cpu.step(); cpu.step();
    eq(cpu.d, 3, 'D');
});

suite('Debugger');

test('Disassemble LDA', () => {
    const cpu = makeCPU([0x86, 0x42]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    eq(dbg.disassembleAt(0).text, 'LDA #$42', 'text');
});

test('Disassemble BRA', () => {
    const cpu = makeCPU([0x20, 0x10]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    eq(dbg.disassembleAt(0).text, 'BRA $0012', 'text');
});

test('Breakpoint and run', () => {
    const cpu = makeCPU([0x12, 0x12, 0x12, 0x12, 0x12]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    dbg.addBreakpoint(0x0003);
    const r = dbg.runUntilBreak();
    eq(r.reason, 'breakpoint', 'reason');
    eq(r.addr, 0x0003, 'addr');
});

test('Trace log', () => {
    const cpu = makeCPU([0x86, 0x42, 0xC6, 0x99]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    dbg.enableTrace();
    dbg.stepDebug(); dbg.stepDebug();
    eq(dbg.traceLog.length, 2, 'entries');
    eq(dbg.traceLog[0].instruction, 'LDA #$42', 'first');
});

summary();
