open System

let deck = seq {
    let cards = ['A'; '2'; '3'; '4'; '5'; '6'; '7'; '8'; '9'; 'T'; 'T'; 'T'; 'T']
    let rand = new Random()
    while true do
        yield List.item (rand.Next(13)) cards }

type Value = Hard of int | Soft of int | Bust | Natural

let count =
    Seq.fold (fun v c ->
        match v with
        | Hard h ->
            match c with
            | 'A' -> if h < 11 then Soft (h + 11) elif h < 21 then Hard (h + 1) else Bust
            | '2' -> if h < 20 then Hard (h + 2)  else Bust
            | '3' -> if h < 19 then Hard (h + 3)  else Bust
            | '4' -> if h < 18 then Hard (h + 4)  else Bust
            | '5' -> if h < 17 then Hard (h + 5)  else Bust
            | '6' -> if h < 16 then Hard (h + 6)  else Bust
            | '7' -> if h < 15 then Hard (h + 7)  else Bust
            | '8' -> if h < 14 then Hard (h + 8)  else Bust
            | '9' -> if h < 13 then Hard (h + 9)  else Bust
            | 'T' -> if h < 12 then Hard (h + 10) else Bust
            | _ -> failwith "Unknown card"
        | Soft s ->
            match c with
            | 'A' -> if s < 21 then Soft (s + 1) else Hard (s - 9)
            | '2' -> if s < 20 then Soft (s + 2) else Hard (s - 8)
            | '3' -> if s < 19 then Soft (s + 3) else Hard (s - 7)
            | '4' -> if s < 18 then Soft (s + 4) else Hard (s - 6)
            | '5' -> if s < 17 then Soft (s + 5) else Hard (s - 5)
            | '6' -> if s < 16 then Soft (s + 6) else Hard (s - 4)
            | '7' -> if s < 15 then Soft (s + 7) else Hard (s - 3)
            | '8' -> if s < 14 then Soft (s + 8) else Hard (s - 2)
            | '9' -> if s < 13 then Soft (s + 9) else Hard (s - 1)
            | 'T' -> Hard s
            | _ -> failwith "Unknown card"
        | Bust -> Bust
        | Natural -> Natural) (Hard 0)

let value hand = if hand = ['A'; 'T'] || hand = ['T'; 'A'] then Natural else count hand

let numeric = function
    | Hard h -> h
    | Soft s -> s
    | Natural -> 21
    | Bust -> failwith "Numeric value of Bust"

let draw hand = Seq.head deck :: hand

let rec dealer hand =
    let v = value hand
    match v with
    | Hard h -> if h < 17 then dealer (draw hand) else hand, v
    | Soft s -> if s <= 17 then dealer (draw hand) else hand, v
    | Bust | Natural -> hand, v

let rec basic bet up hand =
    let cont = basic bet up
    let hit () = draw hand |> cont
    let stand () = bet, hand
    let double () = (2. * bet), (draw hand)
    let initial = Seq.length hand = 2
    match up with
    | '2' ->
        match hand with
        | ['A'; '6'] | ['6'; 'A'] -> double ()
        | _ ->
            match value hand with
            | Hard h when h >= 13 -> stand ()
            | Hard 12 -> hit ()
            | Hard 11 | Hard 10 | Hard 9 -> if initial then double () else hit ()
            | Hard h when h <= 8 -> hit ()
            | Soft s when s >= 18 -> stand ()
            | Soft s when s <= 17 -> hit ()
            | Bust | Natural -> stand ()
            | _ -> failwith "Unexpected case"
    | '3' ->
        match hand with
        | ['A'; '7'] | ['7'; 'A']
        | ['A'; '6'] | ['6'; 'A'] -> double ()
        | _ ->
            match value hand with
            | Hard h when h >= 13 -> stand ()
            | Hard 12 -> hit ()
            | Hard 11 | Hard 10 | Hard 9 -> if initial then double () else hit ()
            | Hard h when h <= 8 -> hit ()
            | Soft s when s >= 18 -> stand ()
            | Soft s when s <= 17 -> hit ()
            | Bust | Natural -> stand ()
            | _ -> failwith "Unexpected case"
    | '4' ->
        match hand with
        | ['A'; '7'] | ['7'; 'A']
        | ['A'; '6'] | ['6'; 'A']
        | ['A'; '5'] | ['5'; 'A']
        | ['A'; '4'] | ['4'; 'A']
        | ['A'; '3'] | ['3'; 'A']
        | ['A'; '2'] | ['2'; 'A'] -> double ()
        | _ ->
            match value hand with
            | Hard h when h >= 12 -> stand ()
            | Hard 11 | Hard 10 | Hard 9 -> if initial then double () else hit ()
            | Hard h when h <= 8 -> hit ()
            | Soft s when s >= 18 -> stand ()
            | Soft s when s <= 17 -> hit ()
            | Bust | Natural -> stand ()
            | _ -> failwith "Unexpected case"
    | '5' ->
        match hand with
        | ['A'; '7'] | ['7'; 'A']
        | ['A'; '6'] | ['6'; 'A']
        | ['A'; '5'] | ['5'; 'A']
        | ['A'; '4'] | ['4'; 'A']
        | ['A'; '3'] | ['3'; 'A']
        | ['A'; '2'] | ['2'; 'A']
        | ['A'; 'A'] | ['A'; 'A'] -> double () // only if can't be split
        | _ ->
            match value hand with
            | Hard h when h >= 12 -> stand ()
            | Hard 11 | Hard 10 | Hard 9 | Hard 8 -> if initial then double () else hit ()
            | Hard h when h <= 7 -> hit ()
            | Soft s when s >= 18 -> stand ()
            | Soft s when s <= 17 -> hit ()
            | Bust | Natural -> stand ()
            | _ -> failwith "Unexpected case"
    | '6' ->
        match hand with
        | ['A'; '7'] | ['7'; 'A']
        | ['A'; '6'] | ['6'; 'A']
        | ['A'; '5'] | ['5'; 'A']
        | ['A'; '4'] | ['4'; 'A']
        | ['A'; '3'] | ['3'; 'A']
        | ['A'; '2'] | ['2'; 'A']
        | ['A'; 'A'] | ['A'; 'A'] -> double () // only if can't be split
        | _ ->
            match value hand with
            | Hard h when h >= 12 -> stand ()
            | Hard 11 | Hard 10 | Hard 9 | Hard 8 -> if initial then double () else hit ()
            | Hard h when h <= 7 -> hit ()
            | Soft s when s >= 18 -> stand ()
            | Soft s when s <= 17 -> hit ()
            | Bust | Natural -> stand ()
            | _ -> failwith "Unexpected case"
    | '7' ->
        match value hand with
        | Hard h when h >= 17 -> stand ()
        | Hard 16 | Hard 15 | Hard 14 | Hard 13 | Hard 12 -> hit ()
        | Hard 11 | Hard 10 -> if initial then double () else hit ()
        | Hard h when h <= 9 -> hit ()
        | Soft s when s >= 18 -> stand ()
        | Soft s when s <= 17 -> hit ()
        | Bust | Natural -> stand ()
        | _ -> failwith "Unexpected case"
    | '8' ->
        match value hand with
        | Hard h when h >= 17 -> stand ()
        | Hard 16 | Hard 15 | Hard 14 | Hard 13 | Hard 12 -> hit ()
        | Hard 11 | Hard 10 -> if initial then double () else hit ()
        | Hard h when h <= 9 -> hit ()
        | Soft s when s >= 18 -> stand ()
        | Soft s when s <= 17 -> hit ()
        | Bust | Natural -> stand ()
        | _ -> failwith "Unexpected case"
    | '9' ->
        match value hand with
        | Hard h when h >= 17 -> stand ()
        | Hard 16 | Hard 15 | Hard 14 | Hard 13 | Hard 12 -> hit ()
        | Hard 11 | Hard 10 -> if initial then double () else hit ()
        | Hard h when h <= 9 -> hit ()
        | Soft s when s >= 19 -> stand ()
        | Soft s when s <= 18 -> hit ()
        | Bust | Natural -> stand ()
        | _ -> failwith "Unexpected case"
    | 'T' ->
        match value hand with
        | Hard h when h >= 17 -> stand ()
        | Hard 16 | Hard 15 | Hard 14 | Hard 13 | Hard 12 -> hit ()
        | Hard 11 -> if initial then double () else hit ()
        | Hard h when h <= 10 -> hit ()
        | Soft s when s >= 19 -> stand ()
        | Soft s when s <= 18 -> hit ()
        | Bust | Natural -> stand ()
        | _ -> failwith "Unexpected case"
    | 'A' ->
        match value hand with
        | Hard h when h >= 17 -> stand ()
        | Hard 16 | Hard 15 | Hard 14 | Hard 13 | Hard 12 -> hit ()
        | Hard 11 -> if initial then double () else hit ()
        | Hard h when h <= 10 -> hit ()
        | Soft s when s >= 18 -> stand ()
        | Soft s when s <= 17 -> hit ()
        | Bust | Natural -> stand ()
        | _ -> failwith "Unexpected case"
    | _ -> failwith "Unexpected up card"

let rec casino dhand phand strategy =
    let up = Seq.head dhand
    let normal () =
        match (value dhand), (value phand) with
        | Natural, Natural -> 0. // natural push
        | Natural, _ -> -1. // dealer natural
        | _, Natural -> 1.5 // player natural
        | _, _ -> // normal play
            let bet, phand' = strategy 1. up phand
            let pv = value phand'
            match pv with
            | Bust -> -bet // player busts
            | _ ->
                let dhand', _ = dealer dhand
                let dv = value dhand'
                match dv with
                | Bust -> bet // dealer busts
                | _ ->
                    let np = numeric pv
                    let nd = numeric dv
                    if np = nd then 0.
                    else if np > nd then bet
                    else -bet
    let split () =
        let c = Seq.head phand
        let s () = casino dhand (draw [c]) strategy
        (s ()) + (s ())
    match up with
    | '2' | '3' | '4' | '6' ->
        match phand with
        | ['A'; 'A'] | ['9'; '9'] | ['8'; '8'] | ['7'; '7']
        | ['6'; '6'] | ['3'; '3'] | ['2'; '2'] -> split ()
        | _ -> normal ()
    | '5' ->
        match phand with
        | ['A'; 'A'] | ['9'; '9'] | ['8'; '8'] | ['7'; '7']
        | ['6'; '6'] | ['4'; '4'] | ['3'; '3'] | ['2'; '2'] -> split ()
        | _ -> normal ()
    | '7' ->
        match phand with
        | ['A'; 'A'] | ['8'; '8'] | ['7'; '7']
        | ['6'; '6'] | ['3'; '3'] | ['2'; '2'] -> split ()
        | _ -> normal ()
    | '8' ->
        match phand with
        | ['A'; 'A'] | ['9'; '9'] | ['8'; '8'] | ['7'; '7'] -> split ()
        | _ -> normal ()
    | '9' ->
        match phand with
        | ['A'; 'A'] | ['9'; '9'] | ['8'; '8'] -> split ()
        | _ -> normal ()
    | 'T' | 'A' ->
        match phand with
        | ['A'; 'A'] | ['8'; '8'] -> split ()
        | _ -> normal ()
    | _ -> failwith "Unexpected up card"

let simulate total iter =
    let rec simulate' total iter high low =
        //printfn "Total: %.2f" total
        let result = casino ([] |> draw |> draw) ([] |> draw |> draw) basic
        let total' = total + result
        if iter > 0L
        then simulate' total' (iter - 1L) (max total' high) (min total' low)
        else total, high, low
    simulate' total iter 0. 0.

let iter = 200L
let start = DateTime.Now
let percentage, high, low = simulate 0. iter
printfn "Percentage: %f (high: %i low: %i)" (percentage / (float iter) * 100.) (int high) (int low)
printfn "Elapsed: %A" (DateTime.Now - start)
// Percentage: -0.675426
// Elapsed: 01:13:59.3664570
// Percentage: -0.305162
// Elapsed: 01:13:13.4345920
// Percentage: -0.325108
// Elapsed: 06:12:03.1568800
(*
let rec simulate up map iter =
    if iter > 0 then
        let hand, value = dealer [up]
        match Map.tryFind value map with
        | Some count -> iter - 1 |> simulate up (Map.add value (count + 1) map)
        | None       -> iter - 1 |> simulate up (Map.add value 1 map)
    else map

let display value results iter =
    let count case = match Map.tryFind case results with | Some v -> v | None -> 0
    let c = count (Hard value) + count (Soft value)
    printf "%i: %04.6f  " value ((float c) / (float iter) * 100.)

let report name iter results =
    printfn ""
    printf "%c: " name
    display 17 results iter
    display 18 results iter
    display 19 results iter
    display 20 results iter
    display 21 results iter
    let specific value =
        let c = match Map.tryFind value results with | Some v -> v | None -> 0
        printf "%A: %04.6f  " value ((float c) / (float iter) * 100.)
    specific Bust
    if name = 'A' || name = 'T' then specific Natural

let iterations = 100000000

let start = DateTime.Now
let sim up = simulate up Map.empty iterations |> report up iterations

['2'; '3'; '4'; '5'; '6'; '7'; '8'; '9'; 'T'; 'A'] |> Seq.iter sim
printfn "Elapsed: %A" (DateTime.Now - start)
*)
(*
2: 17: 13.011668  18: 13.654536  19: 13.125535  20: 12.572242  21: 11.964111  Bust: 35.671908  
3: 17: 12.635100  18: 13.193787  19: 12.702226  20: 12.183047  21: 11.613983  Bust: 37.671857  
4: 17: 12.234063  18: 12.732596  19: 12.280910  20: 11.782091  21: 11.258178  Bust: 39.712162  
5: 17: 11.837063  18: 12.292618  19: 11.832570  20: 11.378074  21: 10.892966  Bust: 41.766709  
6: 17: 11.480009  18: 11.486031  19: 11.482072  20: 11.029447  21: 10.574338  Bust: 43.948103  
7: 17: 36.855731  18: 13.778530  19:  7.860092  20:  7.865968  21:  7.404875  Bust: 26.234804  
8: 17: 12.861290  18: 35.930107  19: 12.855103  20:  6.939708  21:  6.941481  Bust: 24.472311  
9: 17: 11.994800  18: 12.003228  19: 35.076282  20: 11.999845  21:  6.082654  Bust: 22.843191  
T: 17: 11.139856  18: 11.140368  19: 11.144722  20: 34.219309  21:  3.450264  Bust: 21.211064  Natural:  7.694417  
A: 17:  5.746757  18: 14.325437  19: 14.317002  20: 14.323734  21:  6.623792  Bust: 13.893151  Natural: 30.770127

13.011668	13.654536	13.125535	12.572242	11.964111	35.671908
12.635100	13.193787	12.702226	12.183047	11.613983	37.671857
12.234063	12.732596	12.280910	11.782091	11.258178	39.712162
11.837063	12.292618	11.832570	11.378074	10.892966	41.766709
11.480009	11.486031	11.482072	11.029447	10.574338	43.948103
36.855731	13.778530	7.860092	7.865968	7.404875	26.234804
12.861290	35.930107	12.855103	6.939708	6.941481	24.472311
11.994800	12.003228	35.076282	11.999845	6.082654	22.843191
11.139856	11.140368	11.144722	34.219309	3.450264	21.211064	7.694417
5.746757	14.325437	14.317002	14.323734	6.623792	13.893151	30.770127

      6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21   Bust 
  4   8   8   8   8   8   8   8   8  31   8                            
  5       8   8   8   8   8   8   8   8  31   8                        
  6           8   8   8   8   8   8   8   8  31   8                    
  7               8   8   8   8   8   8   8   8  31   8                
  8                   8   8   8   8   8   8   8   8  31   8            
  9                       8   8   8   8   8   8   8   8  31   8        
 10                           8   8   8   8   8   8   8   8  31   8    
 11                               8   8   8   8   8   8   8   8  31   8
 .......................................................................
 12                               8   8   8   8   8   8   8   8   8   31
 13                                   8   8   8   8   8   8   8   8   38
 14                                       8   8   8   8   8   8   8   46
 15                                           8   8   8   8   8   8   54
 16                                               8   8   8   8   8   62
*17                                                   8   8   8   8   69
*18                                                       8   8   8   77
*19                                                           8   8   85
*20                                                               8   92
 .......................................................................
 21                                                                  100
*)