open System
open Elmish

type Model = {
  Value : int
  LastKey : char }

type Message = Increment | Decrement | Key of char

let init () = { Value = 0; LastKey = '?' }, Cmd.ofMsg Increment

let update msg model =
  match msg with
  | Increment when model.Value < 2 -> { model with Value = model.Value + 1 }, Cmd.ofMsg Increment
  | Increment ->                      { model with Value = model.Value + 1 }, Cmd.ofMsg Decrement
  | Decrement when model.Value > 1 -> { model with Value = model.Value - 1 }, Cmd.ofMsg Decrement
  | Decrement ->                      { model with Value = model.Value - 1 }, Cmd.ofMsg Increment
  | Key k ->                          { model with LastKey = k }, Cmd.none

let view model dispatch =
  printfn "%A" model
  if Console.KeyAvailable then
    let k = Console.ReadKey(false)
    dispatch (Key k.KeyChar)

Program.mkProgram init update view
//|> Program.withSubscription subscribe
|> Program.run
