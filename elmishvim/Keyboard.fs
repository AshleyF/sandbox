module Keyboard

open System

// keyboard input mapped to Key, Modifier pairs

type Key =
    | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z
    | CapA | CapB | CapC | CapD | CapE | CapF | CapG | CapH | CapI | CapJ | CapK | CapL | CapM | CapN | CapO | CapP | CapQ | CapR | CapS | CapT | CapU | CapV | CapW | CapX | CapY | CapZ
    | Esc | Tab | Backspace | Return | Space | Left | Right | Up | Down
    | Tilde | Bang | At | Pound | Dollar | Percent | Carot | Ampersand | Star | LParen | RParen | Underscore | Plus | Backtick
    | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D0
    | Minus | Equals | LCurly | RCurly | Pipe | LSquare | RSquare | Backslash
    | Colon | Quote | Semicolon | Tick | LAngle | RAngle | Question | Comma | Dot | Slash
    | STab | SLeft | SRight | CLSquare
    | C_A | C_B | C_C | C_D | C_E | C_F | C_G | C_H | C_I | C_J | C_K | C_L | C_M | C_N | C_O | C_P | C_Q | C_R | C_S | C_T | C_U | C_V | C_W | C_X | C_Y | C_Z

type Modifier = Shift | Control | Meta

let toKey (k : ConsoleKeyInfo) =
    let m, c = 
        match k.Modifiers with
        | ConsoleModifiers.None -> None, false
        | ConsoleModifiers.Shift -> Some Shift, true
        | ConsoleModifiers.Control -> Some Control, false
        | ConsoleModifiers.Alt -> Some Meta, false
        | _ -> failwith $"Unexpected modifier ({k.Modifiers})"
    match k.Key, k.KeyChar, k.Modifiers with
    | ConsoleKey.A, _, ConsoleModifiers.Control -> C_A
    | ConsoleKey.B, _, ConsoleModifiers.Control -> C_B
    | ConsoleKey.C, _, ConsoleModifiers.Control -> C_C
    | ConsoleKey.D, _, ConsoleModifiers.Control -> C_D
    | ConsoleKey.E, _, ConsoleModifiers.Control -> C_E
    | ConsoleKey.F, _, ConsoleModifiers.Control -> C_F
    | ConsoleKey.G, _, ConsoleModifiers.Control -> C_G
    | ConsoleKey.H, _, ConsoleModifiers.Control -> C_H
    | ConsoleKey.I, _, ConsoleModifiers.Control -> C_I
    | ConsoleKey.J, _, ConsoleModifiers.Control -> C_J
    | ConsoleKey.K, _, ConsoleModifiers.Control -> C_K
    | ConsoleKey.L, _, ConsoleModifiers.Control -> C_L
    | ConsoleKey.M, _, ConsoleModifiers.Control -> C_M
    | ConsoleKey.N, _, ConsoleModifiers.Control -> C_N
    | ConsoleKey.O, _, ConsoleModifiers.Control -> C_O
    | ConsoleKey.P, _, ConsoleModifiers.Control -> C_P
    | ConsoleKey.Q, _, ConsoleModifiers.Control -> C_Q
    | ConsoleKey.R, _, ConsoleModifiers.Control -> C_R
    | ConsoleKey.S, _, ConsoleModifiers.Control -> C_S
    | ConsoleKey.T, _, ConsoleModifiers.Control -> C_T
    | ConsoleKey.U, _, ConsoleModifiers.Control -> C_U
    | ConsoleKey.V, _, ConsoleModifiers.Control -> C_V
    | ConsoleKey.W, _, ConsoleModifiers.Control -> C_W
    | ConsoleKey.X, _, ConsoleModifiers.Control -> C_X
    | ConsoleKey.Y, _, ConsoleModifiers.Control -> C_Y
    | ConsoleKey.Z, _, ConsoleModifiers.Control -> C_Z
    | _, 'a', _ -> A
    | _, 'b', _ -> B
    | _, 'c', _ -> C
    | _, 'd', _ -> D
    | _, 'e', _ -> E
    | _, 'f', _ -> F
    | _, 'g', _ -> G
    | _, 'h', _ -> H
    | _, 'i', _ -> I
    | _, 'j', _ -> J
    | _, 'k', _ -> K
    | _, 'l', _ -> L
    | _, 'm', _ -> M
    | _, 'n', _ -> N
    | _, 'o', _ -> O
    | _, 'p', _ -> P
    | _, 'q', _ -> Q
    | _, 'r', _ -> R
    | _, 's', _ -> S
    | _, 't', _ -> T
    | _, 'u', _ -> U
    | _, 'v', _ -> V
    | _, 'w', _ -> W
    | _, 'x', _ -> X
    | _, 'y', _ -> Y
    | _, 'z', _ -> Z
    | _, 'A', _ -> CapA
    | _, 'B', _ -> CapB
    | _, 'C', _ -> CapC
    | _, 'D', _ -> CapD
    | _, 'E', _ -> CapE
    | _, 'F', _ -> CapF
    | _, 'G', _ -> CapG
    | _, 'H', _ -> CapH
    | _, 'I', _ -> CapI
    | _, 'J', _ -> CapJ
    | _, 'K', _ -> CapK
    | _, 'L', _ -> CapL
    | _, 'M', _ -> CapM
    | _, 'N', _ -> CapN
    | _, 'O', _ -> CapO
    | _, 'P', _ -> CapP
    | _, 'Q', _ -> CapQ
    | _, 'R', _ -> CapR
    | _, 'S', _ -> CapS
    | _, 'T', _ -> CapT
    | _, 'U', _ -> CapU
    | _, 'V', _ -> CapV
    | _, 'W', _ -> CapW
    | _, 'X', _ -> CapX
    | _, 'Y', _ -> CapY
    | _, 'Z', _ -> CapZ
    | ConsoleKey.Escape, _, _ -> Esc
    | ConsoleKey.Tab, _, _ -> Tab
    | ConsoleKey.Backspace, _, _ -> Backspace
    | ConsoleKey.Enter, _, _ -> Return
    | ConsoleKey.Spacebar, _, _ -> Space
    | ConsoleKey.LeftArrow, _, _ -> Left
    | ConsoleKey.RightArrow, _, _ -> Right
    | ConsoleKey.UpArrow, _, _ -> Up
    | ConsoleKey.DownArrow, _, _ -> Down
    | _, '~',  _ -> Tilde
    | _, '!',  _ -> Bang
    | _, '@',  _ -> At
    | _, '#',  _ -> Pound
    | _, '$',  _ -> Dollar
    | _, '%',  _ -> Percent
    | _, '^',  _ -> Carot
    | _, '&',  _ -> Ampersand
    | _, '*',  _ -> Star
    | _, '(',  _ -> LParen
    | _, ')',  _ -> RParen
    | _, '_',  _ -> Underscore
    | _, '+',  _ -> Plus
    | _, '`',  _ -> Backtick
    | _, '1',  _ -> D1
    | _, '2',  _ -> D2
    | _, '3',  _ -> D3
    | _, '4',  _ -> D4
    | _, '5',  _ -> D5
    | _, '6',  _ -> D6
    | _, '7',  _ -> D7
    | _, '8',  _ -> D8
    | _, '9',  _ -> D9
    | _, '0',  _ -> D0
    | _, '-',  _ -> Minus
    | _, '=',  _ -> Equals
    | _, '{',  _ -> LCurly
    | _, '}',  _ -> RCurly
    | _, '|',  _ -> Pipe
    | _, '[', ConsoleModifiers.None -> LSquare
    | _, '[', ConsoleModifiers.Control -> CLSquare
    | _, ']',  _ -> RSquare
    | _, '\\', _ -> Backslash
    | _, ':',  _ -> Colon
    | _, '"',  _ -> Quote
    | _, ';',  _ -> Semicolon
    | _, '\'', _ -> Tick
    | _, '<',  _ -> LAngle
    | _, '>',  _ -> RAngle
    | _, '?',  _ -> Question
    | _, ',',  _ -> Comma
    | _, '.',  _ -> Dot
    | _, '/',  _ -> Slash
    | _ -> failwith $"Unexpected console key ({k.Key} {k.KeyChar})"

let keyToString = function
    | A -> "a"
    | B -> "b"
    | C -> "c"
    | D -> "d"
    | E -> "e"
    | F -> "f"
    | G -> "g"
    | H -> "h"
    | I -> "i"
    | J -> "j"
    | K -> "k"
    | L -> "l"
    | M -> "m"
    | N -> "n"
    | O -> "o"
    | P -> "p"
    | Q -> "q"
    | R -> "r"
    | S -> "s"
    | T -> "t"
    | U -> "u"
    | V -> "v"
    | W -> "w"
    | X -> "x"
    | Y -> "y"
    | Z -> "z"
    | CapA -> "A"
    | CapB -> "B"
    | CapC -> "C"
    | CapD -> "D"
    | CapE -> "E"
    | CapF -> "F"
    | CapG -> "G"
    | CapH -> "H"
    | CapI -> "I"
    | CapJ -> "J"
    | CapK -> "K"
    | CapL -> "L"
    | CapM -> "M"
    | CapN -> "N"
    | CapO -> "O"
    | CapP -> "P"
    | CapQ -> "Q"
    | CapR -> "R"
    | CapS -> "S"
    | CapT -> "T"
    | CapU -> "U"
    | CapV -> "V"
    | CapW -> "W"
    | CapX -> "X"
    | CapY -> "Y"
    | CapZ -> "Z"
    | Esc -> "<Esc>"
    | Tab -> "<Tab>"
    | STab -> "<S-Tab>"
    | SLeft -> "<S-Left>"
    | SRight -> "<S-Right>"
    | Backspace -> "<BS>"
    | Return -> "<CR>"
    | Space -> " " // <space>
    | Left -> "<Left>"
    | Right -> "<Right>"
    | Up -> "<Up>"
    | Down -> "<Down>"
    | Tilde -> "~"
    | Bang -> "!"
    | At -> "@"
    | Pound -> "#"
    | Dollar -> "$"
    | Percent -> "%"
    | Carot -> "^"
    | Ampersand -> "&"
    | Star -> "*"
    | LParen -> "("
    | RParen -> ")"
    | Underscore -> "_"
    | Plus -> "+"
    | Backtick -> "`"
    | D1 -> "1"
    | D2 -> "2"
    | D3 -> "3"
    | D4 -> "4"
    | D5 -> "5"
    | D6 -> "6"
    | D7 -> "7"
    | D8 -> "8"
    | D9 -> "9"
    | D0 -> "0"
    | Minus -> "-"
    | Equals -> "="
    | LCurly -> "{"
    | RCurly -> "}"
    | Pipe -> "|"
    | LSquare -> "["
    | RSquare -> "]"
    | Backslash -> "\\"
    | Colon -> ":"
    | Quote -> "\""
    | Semicolon -> ";"
    | Tick -> "'"
    | LAngle -> "<"
    | RAngle -> ">"
    | Question -> "?"
    | Comma -> ","
    | Dot -> "."
    | Slash -> "/"
    | k -> failwith $"Unexpected console key ({k})"

let keyToChar key =
    match keyToString key with
    | str when str.Length = 1 -> Some str[0]
    | "<CR>" -> Some '\n'
    | "<Tab>" -> Some '\t'
    | _ -> None

let rec keys () = seq {
    yield Console.ReadKey(true) |> toKey
    yield! keys () }

//while true do
//    let k = Console.ReadKey()
//    Console.WriteLine($"KEY: {k.Key} {k.KeyChar} {k.Modifiers}")