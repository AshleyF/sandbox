let failure _ = None

let literal v input = Some (v, input)

let (|||) p q input =
    match p input with
    | Some x -> Some x
    | None -> q input

let (&&&) p q input =
    match p input with
    | Some (x, input') ->
        match q input' with
        | Some (y, input'') -> Some (x @ y, input'') // TODO
        | None -> None
    | None -> None

let sat pred input =
    if Seq.isEmpty input then failure input else
        let h = Seq.head input
        if pred h then literal [h] (Seq.tail input) else failure input

let zeroOrOne p = p ||| literal [] // TODO

let rec zeroOrMore p = oneOrMore p ||| literal [] // TODO

and oneOrMore p input =
    if Seq.isEmpty input then failure input else
        match p input with
        | Some (h, input') ->
            match zeroOrMore p input' with
            | Some (t, input'') -> Some (h @ t, input'')
            | None -> failure input
        | None -> failure input

let expect c = sat ((=) c)

// JSON

type Json = // TODO
    | Bool of bool
    | Null
    | Number of char list
    | Whitespace of char list

let wsChar = expect ' ' ||| expect '\n' ||| expect '\r' ||| expect '\t'

let ws = zeroOrMore wsChar

let oneToNine = expect '1' ||| expect '2' ||| expect '3' ||| expect '4' ||| expect '5' ||| expect '6' ||| expect '7' ||| expect '8' ||| expect '9'
let digit = expect '0' ||| oneToNine
let digits = oneOrMore digit
let integer = (zeroOrOne (expect '-')) &&& digits
let fraction = zeroOrOne (expect '.' &&& digits)
let sign = zeroOrOne (expect '+' ||| expect '-')
let exponent = zeroOrOne ((expect 'E' ||| expect 'e') &&& sign &&& digits)
let number = integer &&& fraction &&& exponent

let hex = digit ||| expect 'a' ||| expect 'b' ||| expect 'c' ||| expect 'd' ||| expect 'e' ||| expect 'f' ||| expect 'A' ||| expect 'B' ||| expect 'C' ||| expect 'D' ||| expect 'E' ||| expect 'F'
let escape = expect '"' ||| expect '\\' ||| expect '/' ||| expect 'b' ||| expect 'f' ||| expect 'n' ||| expect 'r' ||| expect 't' ||| (expect 'u' &&& hex &&& hex &&& hex &&& hex)
let character = sat (fun c -> c >= '\u0020' && c <= '\uFFFF' && c <> '"' && c <> '\\') ||| (expect '\\' &&& escape) // TODO \u10FFFF TODO escaped as single char
let characters = zeroOrMore character
let stringVal = expect '"' &&& characters &&& expect '"'

let booleanTrue = (expect 't' &&& expect 'r' &&& expect 'u' &&& expect 'e')
let booleanFalse = (expect 'f' &&& expect 'a' &&& expect 'l' &&& expect 's' &&& expect 'e')

let nullVal = (expect 'n' &&& expect 'u' &&& expect 'l' &&& expect 'l')

let rec jsonVal input = (objectVal ||| arrayVal ||| stringVal ||| number ||| booleanTrue ||| booleanFalse ||| nullVal) input // TODO

and element = ws &&& jsonVal &&& ws
and elements = element &&& (zeroOrMore (expect ',' &&& element))

and arrayVal = (expect '[' &&& ws &&& expect ']') ||| (expect '[' &&& elements &&& expect ']')

and memberVal = ws &&& stringVal &&& ws &&& expect ':' &&& element
and members = memberVal &&& (zeroOrMore (expect ',' &&& memberVal))
and objectVal = (expect '{' &&& ws &&& expect '}') ||| (expect '{' &&& members &&& expect '}')

let test name p input =
    input |> Seq.toList |> Seq.ofList |> p |> printfn "%s: %A" name

"test" |> test "Failure" failure
"test" |> test "Literal" (literal "abc")
"test" |> test "Or -> you" (failure ||| literal "you")
"test" |> test "Or -> me" (literal "me" ||| literal "you")
"test" |> test "Sat t" (sat ((=) 't'))
"test" |> test "Sat x" (sat ((=) 'x'))
"test" |> test "Expect t" (expect 't')
"test" |> test "Expect x" (expect 'x')
"test" |> test "OneOrMore t" (oneOrMore (expect 't'))
"test" |> test "OneOrMore x" (oneOrMore (expect 'x'))
"ttest" |> test "OneOrMore tt" (oneOrMore (expect 't'))
"test" |> test "ZeroOrMore t" (zeroOrMore (expect 't'))
"test" |> test "ZeroOrMore x" (zeroOrMore (expect 'x'))
"ttest" |> test "ZeroOrMore tt" (zeroOrMore (expect 'x'))
"test" |> test "t and e and s" (expect 't' &&& expect 'e' &&& expect 's')
"nope" |> test "t and e and s" (expect 't' &&& expect 'e' &&& expect 's')
" space" |> test "WsChar space" wsChar
"\tspace" |> test "WsChar tab" wsChar
"\nspace" |> test "WsChar LF" wsChar
"\rspace" |> test "WsChar CR" wsChar
"space" |> test "WsChar S" wsChar
" space" |> test "ws space" ws
"\tspace" |> test "ws tab" ws
"\nspace" |> test "ws LF" ws
"\rspace" |> test "ws CR" ws
"space" |> test "ws S" ws
"123" |> test "1-9" oneToNine
"abc" |> test "1-9" oneToNine
"0123" |> test "digit" digit
"abc" |> test "digit" digit
"0123" |> test "digits" digits
"42abc" |> test "digit" digits
"abc" |> test "digit" digits
"42abc" |> test "integer" integer
"-42abc" |> test "integer" integer
"abc" |> test "integer" integer
".42abc" |> test "fraction" fraction
".abc" |> test "fraction" fraction
"abc" |> test "fraction" fraction
"-42abc" |> test "sign" sign
"+42abc" |> test "sign" sign
"42abc" |> test "sign" sign
"E88x" |> test "exponent" exponent
"E+88x" |> test "exponent" exponent
"E-88x" |> test "exponent" exponent
"e88x" |> test "exponent" exponent
"e+88x" |> test "exponent" exponent
"e-88x" |> test "exponent" exponent
"a-88x" |> test "exponent" exponent
"e-x" |> test "exponent" exponent
"123xyz" |> test "number" number
"-123xyz" |> test "number" number
"+123xyz" |> test "number" number // not allowed by the spec
"0123xyz" |> test "number" number
"0123.456xyz" |> test "number" number
"0123.456e10xyz" |> test "number" number
"0123.456e+10xyz" |> test "number" number
"0123.456e-10xyz" |> test "number" number
"0123.456exyz" |> test "number" number
"trueabc" |> test "true" booleanTrue
"falseabc" |> test "true" booleanTrue
"trueabc" |> test "false" booleanFalse
"falseabc" |> test "false" booleanFalse
"nullabc" |> test "null" nullVal
"abc" |> test "null" nullVal
"0123.456exyz" |> test "val" jsonVal
"trueabc" |> test "val" jsonVal
"falseabc" |> test "val" jsonVal
"trueabc" |> test "val" jsonVal
"falseabc" |> test "val" jsonVal
"nullabc" |> test "val" jsonVal
"abc" |> test "val" jsonVal
"\"abc\"" |> test "val" jsonVal
"[\"abc\"]" |> test "val" jsonVal
"abcxyz" |> test "hex" hex
"0123abcxyz" |> test "hex" hex
"\\/bfnrtuabcdxyz" |> test "escape" escape
"bfnrtuabcdxyz" |> test "escape" escape
"fnrtuabcdxyz" |> test "escape" escape
"nrtuabcdxyz" |> test "escape" escape
"rtuabcdxyz" |> test "escape" escape
"tuabcdxyz" |> test "escape" escape
"uabcdxyz" |> test "escape" escape
"uabcxyz" |> test "escape" escape
"abc" |> test "character" character
"\\abc" |> test "character" character
"\"abc" |> test "character" character
"\\\"abc" |> test "character" character
"\\\\abc" |> test "character" character
"\\tabc" |> test "character" character
"\\abc" |> test "character" character
"abc\"" |> test "characters" characters
"\"abc\"end" |> test "string" stringVal
" true \t abc" |> test "element" element
" true \t , 123, falseabc" |> test "elements" elements
"[ ]abc" |> test "array" arrayVal
"[ 123 ]abc" |> test "array" arrayVal
"[ 123, true ]abc" |> test "array" arrayVal
"[ 123, true abc" |> test "array" arrayVal
"\"foo\" : 123" |> test "member" memberVal
"\"foo\" : 123 , \"bar\": truexyz" |> test "member" memberVal
"{  \t\n }xyz" |> test "object" objectVal
"{ \"foo\" : 123 }xyz" |> test "object" objectVal
"{ \"foo\" : 123 , \"bar\": true }xyz" |> test "object" objectVal
"""
{
    "glossary": {
        "title": "example glossary",
		"GlossDiv": {
            "title": "S",
			"GlossList": {
                "GlossEntry": {
                    "ID": "SGML",
					"SortAs": "SGML",
					"GlossTerm": "Standard Generalized Markup Language",
					"Acronym": "SGML",
					"Abbrev": "ISO 8879:1986",
					"GlossDef": {
                        "para": "A meta-markup language, used to create markup languages such as DocBook.",
						"GlossSeeAlso": ["GML", "XML"]
                    },
					"GlossSee": "markup"
                }
            }
        }
    }
}
""" |> test "json" element