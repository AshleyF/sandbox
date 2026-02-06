open System

//type Position = int list
//type Move = int
//type MoveGenerator = Position -> Move seq
//type MoveExecutor = Position -> Move -> Position
//type CompletePositionDetector = Position -> bool
//type PositionScorer = Position -> float
//type PositionPrinter = Position -> unit

// Monte Carlo Engine -------------------------------------------------------------

let explore moveGen moveExec position = 
  moveGen position |> Seq.map (moveExec position)

let random = new Random()
let pickRandom moves =
  let arr = Array.ofSeq moves
  arr[random.Next(arr.Length)]

let rec monteCarloPlayout moveGen moveExec isComplete position =
  if isComplete position then position else
    moveGen position
    |> pickRandom
    |> moveExec position
    |> monteCarloPlayout moveGen moveExec isComplete

let monteCarloScore trials moveGen moveExec isComplete scorer position =
  Seq.init trials (fun _ -> monteCarloPlayout moveGen moveExec isComplete position |> scorer)
  |> Seq.average

let monteCarloEval moveGen moveExec isComplete scorer position =
  let trials = 50000
  let candidates : int seq = moveGen position
  let scores = candidates |> Seq.map (moveExec position) |> Seq.map (monteCarloScore trials moveGen moveExec isComplete scorer)
  Seq.zip candidates scores

// Mancala ------------------------------------------------------------------------

type Player = Human | Computer
type Position = {
  ToPlay: Player
  Pits: int list } // H0 H1 H2 H3 H4 H5 HH C0 C1 C2 C3 C4 C5 CH

let moveGen position =
  let pitsToPlay = if position.ToPlay = Human then [0..5] else [7..12]
  let occupied p = List.item p position.Pits > 0
  Seq.filter occupied pitsToPlay

let moveExec position move =
  let play = position.ToPlay
  if (play = Human && (move < 0 || move > 5)) ||
     (play = Computer && (move < 7 || move > 12)) then
     failwith "Invalid move"
  let place pit count position = { position with Pits = List.updateAt pit ((List.item pit position.Pits) + count) position.Pits }
  let alternateToPlay position = { position with ToPlay = if position.ToPlay = Human then Computer else Human } // alternate turn
  let pickup pit position = List.item pit position.Pits, { position with Pits = List.updateAt pit 0 position.Pits } // remove
  let rec distribute numStones pit position =
    if numStones = 0 then
      let final = pit - 1
      let count pit = List.item pit position.Pits
      let opposite pit = 12 - pit
      if final = 6 && position.ToPlay = Human then position // human's turn again
      elif final = 13 && position.ToPlay = Computer then position // computer's turn again
      elif count final = 1 && count (opposite final) > 0 && ((final < 6 && position.ToPlay = Human) || (final > 6 && position.ToPlay = Computer)) then // capture
        let num0, position' = pickup final position
        let num1, position'' = pickup (opposite final) position'
        let position''' = place (if position''.ToPlay = Human then 6 else 13) (num0 + num1) position''
        position''' |> alternateToPlay
      else alternateToPlay position
    else
      let next = pit + 1
      if pit > 13 then distribute numStones 0 position // wrap
      elif pit = 6 && play = Computer then distribute numStones next position // skip human's home
      elif pit = 13 && play = Human then distribute numStones next position // skip computer's home
      else place pit 1 position |> distribute (numStones - 1) next // distribute one
  let numStones, position' = pickup move position
  distribute numStones (move + 1) position'

let isComplete position =
  match position.Pits with
    | 0 :: 0 :: 0 :: 0 :: 0 :: 0 :: _ -> true // human's side empty
    | _ :: _ :: _ :: _ :: _ :: _ :: _ :: 0 :: 0 :: 0 :: 0 :: 0 :: 0 :: _ -> true // computer's side empty
    | _ -> false

let score position =
  match position.Pits with
  | h0 :: h1 :: h2 :: h3 :: h4 :: h5 :: hh :: c0 :: c1 :: c2 :: c3 :: c4 :: c5 :: ch :: [] -> ((h0 + h1 + h2 + h3 + h4 + h5 + hh) - (c0 + c1 + c2 + c3 + c4 + c5 + ch) |> float)
  | _ -> failwith "Invalid position"

let init = {
  ToPlay = Human
  Pits = [4; 4; 4; 4; 4; 4; 0; 4; 4; 4; 4; 4; 4; 0] }

// User Interface -----------------------------------------------------------------

let print position =
  let s i = List.item i position.Pits
  printfn ""
  printfn ""
  printfn "   %i  %i  %i  %i  %i  %i" (s 12) (s 11) (s 10) (s 9) (s 8) (s 7)
  printfn "%i                    %i  %A" (s 13) (s 6) position.ToPlay
  printfn "   %i  %i  %i  %i  %i  %i" (s 0) (s 1) (s 2) (s 3) (s 4) (s 5)

printfn "Monte Carlo Mancala"

let rec promptForMove position =
  try
    let move = Int32.Parse(Console.ReadLine())
    if moveGen position |> Seq.contains move then move else failwith "Illegal"
  with ex ->
    printfn "Invalid move: %s" ex.Message
    promptForMove position

let moveGenBest position =
  let eval = monteCarloEval moveGen moveExec isComplete score position |> List.ofSeq
  printfn "EVAL %A" eval
  eval |> (if position.ToPlay = Human then Seq.maxBy else Seq.minBy) snd |> fst

let rec play position =
  print position
  let move =
    if position.ToPlay = Human
    then promptForMove position
    else
      //let comp = moveGen position |> pickRandom
      let comp = moveGenBest position
      printfn "MOVE: %i" comp
      comp
  let position' = moveExec position move
  if isComplete position' then
    print position'
    printfn "GAME OVER (score %i)" (score position' |> int)
  else play position'

play init