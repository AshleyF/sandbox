#!/usr/bin/env python3
"""
Test runner for the Brief interpreter.
Runs individual Brief expressions and checks results.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from brief import Machine, BriefError, format_value, parse_program

PASS = 0
FAIL = 0
ERRORS = []

def test(name, source, expected, is_program=False):
    """Run a test. Source is Brief prefix code, expected is a list of stack values."""
    global PASS, FAIL
    machine = Machine()
    try:
        if is_program:
            result = machine.run_program(source)
        else:
            machine.eval_line(source)
            result = list(machine.stack)

        result_str = [format_value(v) for v in result]
        expected_str = [str(e) for e in expected]

        if result_str == expected_str:
            PASS += 1
            print(f"  ✓ {name}")
        else:
            FAIL += 1
            msg = f"  ✗ {name}: expected {expected_str}, got {result_str}"
            print(msg)
            ERRORS.append(msg)
    except BriefError as e:
        FAIL += 1
        msg = f"  ✗ {name}: ERROR: {e}"
        print(msg)
        ERRORS.append(msg)
    except Exception as e:
        FAIL += 1
        msg = f"  ✗ {name}: INTERNAL ERROR: {e}"
        print(msg)
        ERRORS.append(msg)


def main():
    global PASS, FAIL

    print("═══ Brief Interpreter Test Suite ═══\n")

    # ── Brief Prefix Semantics ──────────────────────────────────
    # Brief evaluates right-to-left.  OP A B  means:
    #   push B (rightmost), push A, execute OP
    #   Stack before OP: (B  A)  with A on top, B second
    #   OP pops a=second=B, b=top=A  →  B OP A
    #
    # So `- 10 3` computes 3 - 10 = -7  (NOT 10-3).
    # To get 10-3=7, write `- 3 10`.
    #
    # For `if [X] [Y] cond`:
    #   R→L: push cond, push [Y], push [X]
    #   Stack: (cond [Y] [X])  — [X] on top
    #   if pops: else=[X] (top), then=[Y] (second), bool=cond
    #   So: first quotation [X] = ELSE, second [Y] = THEN
    #   `if [ELSE] [THEN] cond`

    # ── Arithmetic ──────────────────────────────────────────────
    print("Arithmetic:")
    test("3 + 4 = 7", "+ 3 4", ["7"])
    test("10 - 3 = 7", "- 3 10", ["7"])              # R→L: push 10, push 3 → 10-3=7
    test("6 * 7 = 42", "* 6 7", ["42"])
    test("10 / 3 = 3", "/ 3 10", ["3"])               # 10//3=3
    test("10 mod 3 = 1", "mod 3 10", ["1"])            # 10%3=1
    test("inc 5 = 6", "inc 5", ["6"])
    test("dec 5 = 4", "dec 5", ["4"])
    test("sq 5 = 25", "sq 5", ["25"])
    test("double 5 = 10", "double 5", ["10"])
    test("negate 5 = -5", "negate 5", ["-5"])
    print()

    # ── Stack ops ───────────────────────────────────────────────
    print("Stack operations:")
    test("dup 5", "dup 5", ["5", "5"])
    test("drop 5", "drop 5", [])
    test("swap 1 2", "swap 1 2", ["1", "2"])           # R→L: push 2, push 1, swap → (2 1)
    test("over 1 2", "over 1 2", ["2", "1", "2"])      # R→L: push 2, push 1, over → (2 1 2)
    test("rot 1 2 3", "rot 1 2 3", ["2", "1", "3"])
    print()

    # ── Comparisons ─────────────────────────────────────────────
    # `< A B` → R→L: push B, push A → second=B, top=A → B < A
    # `< 5 3` → push 3, push 5 → 3 < 5 = true
    print("Comparisons:")
    test("3 = 3 → true", "= 3 3", ["-1"])
    test("3 = 4 → false", "= 3 4", ["0"])
    test("3 < 5 → true", "< 5 3", ["-1"])             # 3<5=true
    test("5 < 3 → false", "< 3 5", ["0"])              # 5<3=false
    test("5 > 3 → true", "> 3 5", ["-1"])              # 5>3=true
    test("3 > 5 → false", "> 5 3", ["0"])              # 3>5=false
    test("even? 4", "even? 4", ["-1"])
    test("even? 3", "even? 3", ["0"])
    print()

    # ── Booleans / Logic ────────────────────────────────────────
    print("Logic:")
    test("true = -1", "true", ["-1"])
    test("false = 0", "false", ["0"])
    test("not true = 0", "not true", ["0"])
    test("not false = -1", "not false", ["-1"])
    test("-1 and -1 = -1", "and true true", ["-1"])
    test("-1 and 0 = 0", "and true false", ["0"])
    test("-1 or 0 = -1", "or true false", ["-1"])
    test("0 or 0 = 0", "or false false", ["0"])
    print()

    # ── Strings ─────────────────────────────────────────────────
    print("Strings:")
    test("concat strings", '+ " world" "hello"', ['"hello world"'])
    test("string length", 'length "hello"', ["5"])
    print()

    # ── Lists ───────────────────────────────────────────────────
    # `nth A B` → R→L: push B, push A → nth pops n=A(top), lst=B(second)
    # So `nth 1 {10 20 30}` → push {10 20 30}, push 1 → nth(lst={10 20 30}, n=1)
    print("Lists:")
    test("first {10 20 30}", "first {10 20 30}", ["10"])
    test("rest {10 20 30}", "rest {10 20 30}", ["{20 30}"])
    test("nth 1 of {10 20 30}", "nth 1 {10 20 30}", ["20"])
    test("put idx 1 val 99 in {10 20 30}", "put 99 1 {10 20 30}", ["{10 99 30}"])
    test("length {1 2 3}", "length {1 2 3}", ["3"])
    test("range 1 to 5", "range 5 1", ["{1 2 3 4 5}"])   # R→L: push 1, push 5 → range(1,5)
    test("append 4 to {1 2 3}", "append 4 {1 2 3}", ["{1 2 3 4}"])
    test("concat {1 2} {3 4}", "concat {3 4} {1 2}", ["{1 2 3 4}"])
    print()

    # ── Combinators ─────────────────────────────────────────────
    # `if [ELSE] [THEN] cond` — first quotation = else, second = then
    print("Combinators:")
    test("apply [+ 1 2]", "apply [+ 1 2]", ["3"])
    test("if [else] [then] true → then", "if [99] [42] true", ["42"])
    test("if [else] [then] false → else", "if [99] [42] false", ["99"])
    test("dip [inc] under 10 on 5", "dip [inc] 10 5", ["6", "10"])
    test("keep [sq] 5", "keep [sq] 5", ["25", "5"])
    print()

    # ── Programs (multi-line) ───────────────────────────────────
    print("Programs:")

    test("area of circle",
         "main area 5\narea * pi sq\n  sq * dup\n  pi 3.14159",
         ["78.53975"], is_program=True)

    test("factorial 5",
         "main fact 5\nfact if [* fact dec dup] [1 drop] = 0 dup\n  dec - 1",
         ["120"], is_program=True)

    test("factorial 0",
         "main fact 0\nfact if [* fact dec dup] [1 drop] = 0 dup\n  dec - 1",
         ["1"], is_program=True)

    test("sum of list",
         "main sum {1 2 3 4 5}\nsum fold [+] 0",
         ["15"], is_program=True)

    test("squares via map",
         "main squares {1 2 3 4 5}\nsquares map [sq]\n  sq * dup",
         ["{1 4 9 16 25}"], is_program=True)

    test("filter evens",
         "main evens {1 2 3 4 5 6}\nevens filter [even?]\n  even? = 0 mod 2",
         ["{2 4 6}"], is_program=True)

    # max: if [ELSE] [THEN] cond
    # Quotation contents are Brief prefix (R→L), so:
    #   "swap then drop" in postfix = [drop swap] in Brief source
    # > over over: a>b? THEN=[drop] keeps a; ELSE=[drop swap] keeps b
    test("max(5,3) = 5",
         "main max 5 3\nmax if [drop swap] [drop] > over over",
         ["5"], is_program=True)

    test("max(3,5) = 5",
         "main max 3 5\nmax if [drop swap] [drop] > over over",
         ["5"], is_program=True)

    # gcd: if b=0 then [drop] else [gcd mod over swap]
    # Brief: gcd if [gcd mod over swap] [drop] = 0 dup
    test("gcd(12,8) = 4",
         "main gcd 8 12\ngcd if [gcd mod over swap] [drop] = 0 dup",
         ["4"], is_program=True)

    test("gcd(48,18) = 6",
         "main gcd 18 48\ngcd if [gcd mod over swap] [drop] = 0 dup",
         ["6"], is_program=True)

    # pow: base^exp
    test("pow(2,3) = 8",
         "main pow 3 2\npow if [* pow dec swap over] [1 drop drop] = 0 dup",
         ["8"], is_program=True)

    test("pow(3,0) = 1",
         "main pow 0 3\npow if [* pow dec swap over] [1 drop drop] = 0 dup",
         ["1"], is_program=True)

    # fibonacci
    test("fib(6) = 8",
         "main fib 6\nfib if [+ fib - 2 swap fib dec dup] [] <= 1 dup",
         ["8"], is_program=True)

    test("fib(0) = 0",
         "main fib 0\nfib if [+ fib - 2 swap fib dec dup] [] <= 1 dup",
         ["0"], is_program=True)

    test("fib(1) = 1",
         "main fib 1\nfib if [+ fib - 2 swap fib dec dup] [] <= 1 dup",
         ["1"], is_program=True)

    # fizzbuzz (small range)
    test("fizzbuzz 1-5",
         "main each [fizzbuzz] range 5 1\n"
         "fizzbuzz if [check5] [\"FizzBuzz\" drop] = 0 mod 15 dup\n"
         "  check5 if [check3] [\"Buzz\" drop] = 0 mod 5 dup\n"
         "    check3 if [] [\"Fizz\" drop] = 0 mod 3 dup",
         ["1", "2", '"Fizz"', "4", '"Buzz"'], is_program=True)

    print()

    # ── Dip and Keep patterns ───────────────────────────────────
    print("Dip/Keep patterns:")

    test("dip preserves top",
         "dip [inc] 99 5", ["6", "99"])

    test("keep: compute and preserve",
         "keep [sq] 5", ["25", "5"])

    print()

    # ── Prelude Secondaries ───────────────────────────────────
    print("Prelude secondaries:")

    test("abs 5 = 5", "abs 5", ["5"])
    test("abs -5 = 5", "abs -5", ["5"])
    test("abs 0 = 0", "abs 0", ["0"])
    test("max 5 3 = 5", "max 3 5", ["5"])
    test("max 3 5 = 5", "max 5 3", ["5"])
    test("min 5 3 = 3", "min 3 5", ["3"])
    test("min 3 5 = 3", "min 5 3", ["3"])
    test("odd? 3", "odd? 3", ["-1"])
    test("odd? 4", "odd? 4", ["0"])

    print()

    # ── Summary ─────────────────────────────────────────────────
    total = PASS + FAIL
    print(f"{'═' * 40}")
    print(f"Results: {PASS}/{total} passed, {FAIL} failed")
    if ERRORS:
        print(f"\nFailures:")
        for e in ERRORS:
            print(e)
    print()

    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
