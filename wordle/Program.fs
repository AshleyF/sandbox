// solver for Wordle, Primel and Mathler

open System
open System.IO

// generate ranked possible solutions, given a set of constraints and initial list
let solver len (words : string seq) constraints =
    let solutions constraints words =
        let candidates = // candidate solutions from the dictionary
            let apply w = Seq.forall (fun c -> Seq.toArray w |> c) constraints
            Seq.filter apply words // matching *all* constraints

        let frequency = // count letter occurances across words
            let countLettersInWord =
                let increment = function Some i -> Some (i + 1) | None -> Some 1
                let countLetter tally' c = Map.change c increment tally'
                Seq.fold countLetter // fold over single word
            Seq.fold countLettersInWord Map.empty candidates // fold over all words

        let rank word = // rank first by distinct letters, then vowel count, then letter frequency
            let vowels = Seq.filter (fun (c : char) -> "AEIOU".Contains(c)) word |> Seq.length // number of vowels
            let distinct = Seq.distinct word |> Seq.length // num distinct letters
            let score = word |> Seq.map (fun c -> Map.find c frequency) |> Seq.sum // sum of letter frequencies
            score * (vowels + 1) * distinct * distinct

        // print ranked possible solutions
        let solutions = candidates |> Seq.sortByDescending rank |> Seq.toArray
        printfn "Solutions: %A (%i)" solutions solutions.Length

    words
    |> Seq.map (fun w -> w.ToUpper()) // normalize case
    |> Seq.distinct // remove duplicates
    |> Seq.filter (fun w -> w.Length = len) // n-characters only
    |> solutions constraints

// helper function-generating functions for building the constraints list
let exclude letters = Seq.forall (fun c -> not (Seq.contains c letters)) // not containing given letters
let green letter index word = Array.get word index = letter // contains letter at index 
let yellow letter index word = Seq.contains letter word && Array.get word index <> letter // contains letter but *not* at index

// --------------------------------------------------------------------------------
// Wordle (https://wordlegame.org/)

let wordle =
    // "words.txt" // from /usr/share/dict
    "words-cheat.txt" // from source: https://wordlegame.org/assets/js/wordle/en.js
    |> File.ReadAllLines
    |> Seq.filter (Seq.forall Char.IsLetter) // including only letters
    |> solver 5

let wordleDemo () =
    [ // 1st guess: AROSE (highest ranked of 5883 potential solutions)
        exclude "AOS"
        green 'R' 1
        yellow 'E' 4
        // 2st guess: CREED (of 54 potential solutions)
        exclude "D"
        yellow 'C' 0
        green 'E' 2
    ] |> wordle// -> must be ERECT or WRECK

// --------------------------------------------------------------------------------
// Primel (https://converged.yt/primel/)

let primel =
    Seq.fold (fun p n -> List.filter (fun i -> i % n <> 0) p) [10007..99999] [2..317] // 5-digit primes
    |> Seq.map (fun n -> n.ToString())
    |> solver 5

let primelDemo () =
    [   // 1st guess: 12379
        exclude "127"
        yellow '3' 2
        green '9' 4
        // 2nd guess: 34589
        exclude "4"
        yellow '3' 0
        yellow '5' 2
        yellow '8' 3
        // 3rd guess: 50839
        exclude "0"
        yellow '5' 0
        green '8' 2
        green '3' 3
    ] |> primel // -> must be 65839

// --------------------------------------------------------------------------------
// Mathler (https://www.mathler.com/)

type Expr = // arithematic expression tree
    | Lit of float
    | Add of Expr * Expr
    | Sub of Expr * Expr
    | Mul of Expr * Expr
    | Div of Expr * Expr

let mathler number =
    let rec eval = // evaluate and print expression e.g. (Add (Lit 3., (Sub (Lit 4., Lit 5.)))) -> (2., "3+4-5")
        let apply op name x y div =
            let x', x'' = eval x
            let y', y'' = eval y
            if div && y' = 0. then infinity, "DIV BY ZERO"
            else  op x' y', sprintf "%s%c%s" x'' name y''
        function
        | Lit x -> x, sprintf "%i" (int x)
        | Add (x, y) -> apply (+) '+' x y false
        | Sub (x, y) -> apply (-) '-' x y false
        | Mul (x, y) -> apply (*) '*' x y false
        | Div (x, y) -> apply (/) '/' x y true
    let len op n (_, (_, s)) = op (String.length s) n
    let expressions = // generate expressions
        let nums = [-999..999] |> List.map float |> List.map Lit |> List.map (fun n -> n, eval n)
        let rec expressions' exprs = seq {
            let exprs' = seq {
                for e in exprs do // exprs combined with ops and nums
                    let len = e |> snd |> snd |> String.length
                    for n in nums |> List.filter (fun (_, (_, s)) -> String.length s < 6 - len) do
                        for op in [Add; Sub; Mul; Div] do
                            yield op (fst e, fst n) }
            let candidates = // generate candidates with <= 6 chars
                exprs'
                |> Seq.map (fun e -> e, eval e)
                |> Seq.filter (len (<=) 6)
                |> Seq.toList
            if candidates.Length > 0 then
                yield! candidates |> Seq.filter (len (=) 6) |> Seq.map fst // yield 6-char expressions
                yield! candidates |> List.filter (len (<=) 4) |> expressions' } // continue with 4-char combined with new op/num
        nums |> expressions'
    expressions
    |> Seq.map eval
    |> Seq.filter (fun (x, _) -> x = float number) // must equal number (e.g. 72 in example below)
    |> Seq.map snd
    |> Seq.toList
    |> solver 6

let mathlerDemo () =
    [   // 1st guess: 1-5+76 (of 1700 possible solutions)
        exclude "15+6"
        yellow '-' 1
        yellow '7' 4
        // 2nd guess: 3*27-9 (of 29 possible solutions)
        yellow '3' 0
        yellow '*' 1
        yellow '2' 2
        yellow '7' 3
        green '-' 4
        green '9' 5
    ] |> mathler 72 // must be 27*3-9 = 72

// wordleDemo ()
// primelDemo ()
mathlerDemo ()

