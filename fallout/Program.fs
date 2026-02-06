// known words that have been tried and their corresponting correct character counts
let known = [
    "PILE", 0
    "MOST", 1
    "FACT", 1]

// unknown words available but not tried yet
let unknown = [
    "PUSH"
    "TASK"
    "TIES"
    "TIDY"
    "EVEN"
    "MAZE"
    "LAST"
    "TELL"]

let uncurry f (x, y) = f x y
let similarity a b = Seq.zip a b |> Seq.filter (uncurry (=)) |> Seq.length
let matches (word, count) = unknown |> Seq.filter ((similarity word) >> ((=) count))
known |> Seq.map matches |> Seq.map Set.ofSeq |> Seq.reduce Set.intersect |> printfn "Solution(s): %A"
