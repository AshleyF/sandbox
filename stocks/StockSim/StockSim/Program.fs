open System
open System.IO

let verbose = true

// data loading/parsing (from https://www.nasdaq.com/market-activity/quotes/historical)

type Stock = {
    Date   : DateTime
    Close  : double
    Volume : int
    Open   : double
    High   : double
    Low    : double }

let data symbol =
    let parse (line: string) =
        let parse' (fields: string array) =
            let date = DateTime.Parse
            let price (field: string) = Double.Parse(if field.StartsWith("$") then field.Substring(1) else field)
            let volume (field: string) = match Int32.TryParse field with true, vol -> vol | _ -> 0
            { Date   = date   fields.[0]
              Close  = price  fields.[1]
              Volume = volume fields.[2]
              Open   = price  fields.[3]
              High   = price  fields.[4]
              Low    = price  fields.[5] }
        line.Split(',') |> parse'
    File.ReadAllLines($"../../../data/{symbol}.csv")
    |> Seq.skip 1 // skip header
    |> Seq.map parse
    |> Seq.sortBy (fun s -> s.Date) // chronological

// sim

type Action =
    | Buy  of Date: DateTime * Shares: double * Price: double
    | Sell of Date: DateTime * Shares: double * Price: double
    | Hold of Price: double

type Portfolio = {
    Cash: double
    Shares: double
    Price: double }

let rec log activity portfolio = 
    match activity with
    | Buy (date, shares, price) :: tail ->
        if verbose then printfn $"Buy  %0.1f{shares} shares at $%0.2f{price} ($%0.2f{shares * price} {date})"
        { Cash   = portfolio.Cash - shares * price
          Shares = portfolio.Shares + shares
          Price  = price }
        |> log tail
    | Sell (date, shares, price) :: tail ->
        if verbose then printfn $"Sell %0.1f{shares} shares at $%0.2f{price} ($%0.2f{shares * price} {date})"
        { Cash   = portfolio.Cash + shares * price
          Shares = portfolio.Shares - shares
          Price  = price }
        |> log tail
    | Hold price :: tail -> { portfolio with Price = price } |> log tail
    | [] ->
        if portfolio.Shares > 0. then
            if verbose then printfn $"Sell %0.1f{portfolio.Shares} shares at $%0.2f{portfolio.Price} ($%0.2f{portfolio.Shares * portfolio.Price}) Convert remaining shares"
            { Cash = portfolio.Cash + portfolio.Shares * portfolio.Price
              Shares = 0.
              Price = portfolio.Price }
        else portfolio
    
let compute portfolio symbol strategy =
    printfn "--------------------------------------------------------------------------------"
    let stock = data symbol
    let activity = strategy stock portfolio
    let final = log activity portfolio
    printfn $"Result: $%0.2f{final.Cash}"
    printfn $"Profit: $%0.2f{final.Cash - portfolio.Cash}"

// strategies

let magicBuyLowestSellHighest span portfolio =
    printfn "Strategy: Magic (buy lowest, sell highest)!"
    let lowest = Seq.minBy (fun s -> s.Low) span
    let highest =
        span
        |> Seq.skipWhile (fun s -> s.Date <= lowest.Date) // *after* hitting lowest
        |> Seq.maxBy (fun s -> s.High)
    let shares = portfolio.Cash / lowest.Low
    [Buy  (lowest.Date,  shares, lowest.Low)
     Sell (highest.Date, shares, highest.High)]

let simpleBuyHoldSell span portfolio =
    printfn "Strategy: Simply buy and hold for span, then sell"
    let buy = Seq.head span
    let sell = Seq.last span
    let shares = portfolio.Cash / buy.Close
    [Buy  (buy.Date,  shares, buy.Close)
     Sell (sell.Date, shares, sell.Close)]

let averageCrossing shortWindow longWindow span portfolio =
    printfn "Strategy: Long/short-term average crossing signals"
    let rec decide (actions, portfolio) ((avgShort, avgLong, _), (avgShort', avgLong', stock)) =
        // printfn $"{avgShort},{avgLong},{stock.Close}"
        if avgShort <= avgLong && avgShort' > avgLong' && portfolio.Cash > 0. then
            // short-term avg became > long-term and we have cash
            let shares = portfolio.Cash / stock.Close
            actions @ [Buy (stock.Date, shares, stock.Close)],
            { Cash = 0.; Shares = shares; Price = stock.Close }
        elif avgShort >= avgLong && avgShort' < avgLong' && portfolio.Shares > 0. then
            // short-term avg became < long-term and we have shares
            actions @ [Sell (stock.Date, portfolio.Shares, stock.Close)],
            { Cash = portfolio.Shares * stock.Close; Shares = 0.; Price = stock.Close }
        else actions @ [Hold stock.Close], { portfolio with Price = stock.Close }
    let avg days = span |> Seq.windowed days |> Seq.map (Seq.averageBy (fun s -> s.Close))
    Seq.zip3 (avg shortWindow |> Seq.skip (longWindow - shortWindow)) // short-term avg (shifted to match long-term)
             (avg longWindow) // long-term avg
             (Seq.skip (longWindow - 1) span) // span (shifted to match long-term)
    |> Seq.pairwise
    |> Seq.fold decide ([], portfolio)
    |> fst

// trials

let trialsAcross portfolio symbols =
    let strategies sym = 
        printfn $"================================================================================"
        printfn $"Symbol: {sym}"
        let trial = compute portfolio
        trial sym magicBuyLowestSellHighest
        trial sym simpleBuyHoldSell
        trial sym (averageCrossing 50 150)
    symbols |> Seq.iter strategies

let portfolio = {
    Cash = 1000.
    Shares = 0.
    Price  = 0. }

printfn $"Start: $%0.2f{portfolio.Cash} (%0.0f{portfolio.Shares} shares)"

["AAPL"; "MSFT"; "TSLA"; "BRK.B"; "INTC"; "CVAC"; "NCLH"; "SP"]
|> trialsAcross portfolio
