// generate words containing only subset of characters (for Morse code practice)

open System.IO

let morse (current : string) (letters : string) =
    let rank word = Seq.sumBy (fun c -> Seq.findIndex ((=) c) letters) word
    "words.txt" // from /usr/share/dict
    |> File.ReadAllLines
    |> Seq.filter (fun w -> w.Length > 1) // 2+ chars
    |> Seq.map (fun w -> w.ToUpper())
    |> Seq.distinct
    |> Seq.filter (Seq.forall (fun c -> letters.Contains(c))) // only letters learned
    |> Seq.filter (Seq.exists (fun c -> current.Contains(c))) // definitely current new letters learned
    |> Seq.sortBy(id) // sort alphabetically
    |> Seq.sortBy(fun w -> w.Length) // then sort by length
    |> Seq.sortBy(rank) // then by rank according to how recently each letter learned
    //|> Seq.take 2000
    |> Seq.iter (printfn "%s")

//morse "QXZ" "QXZ JK80 BV GP79/ FY MW36? UC DHLR25 IOS14 AENT"
morse "FQ" "FQBJWDGURKAN"
