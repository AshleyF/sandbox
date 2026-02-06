open System
open Keyboard

type Mode = Normal | Insert

type Motion =
    | Left | Right | Up | Down
    | ForwardWord | ForwardBigWord
    | BackWord | BackBigWord
    | ForwardEndWord | BackEndWord
    | FirstColumn | StartOfLine | EndOfLine
    | Find of char | FindReverse of char
    | To of char | ToReverse of char
    | RepeatFind | RepeatFindReverse
    | ForwardParagraph | BackParagraph
    | GoStartOfDocument | GoEndOfDocument

type Operation =
    | Beep | NotImplemented
    | InsertBefore | InsertBeforeLine
    | InsertAfter | InsertAfterLine
    | ReplaceWith of char
    | DeleteForward | DeleteBack
    | ResetState
    | NormalMode | Type of char
    | RepeatAction
    | Motion of Motion
    | Change of Motion | ChangeLine
    | Delete of Motion | DeleteLine
    | Yank of Motion | YankLine
    | PutAfter | PutBefore
    | OpenLineBelow | OpenLineAbove
    | Indent of Motion | IndentLine
    | Unindent of Motion | UnindentLine
    | FindMatch | NextMatch | PreviousMatch
    | Undo | UndoLine | Redo
    | JoinLine
    | ScrollDownHalf | ScrollUpHalf
    | ScrollDownLine | ScrollUpLine

(*
G
gg
> (>G)
;
,
@: (repeat ex command)
& (repeat last substitution)
q{char} q
:%s/foo/bar/g
*
#
aw (and other text objects)
(counts, on mothions + actions)
y{motion}
yy
*)

let expectChar k op = match keyToChar k with Some c -> Some (op c) | None -> None

let parseMotion pending mode key =
    match mode with
    | Normal ->
        match key :: pending with
        | k :: Key.F     :: p -> Find        |> expectChar k    , p
        | k :: Key.CapF  :: p -> FindReverse |> expectChar k    , p
        | k :: Key.T     :: p -> To          |> expectChar k    , p
        | k :: Key.CapT  :: p -> ToReverse   |> expectChar k    , p
        | Key.E :: Key.G :: p -> Some BackEndWord               , p
        | Key.G :: Key.G :: p -> Some GoStartOfDocument         , p
        | Key.CapG       :: p -> Some GoEndOfDocument           , p
        | Key.RCurly     :: p -> Some ForwardParagraph          , p
        | Key.LCurly     :: p -> Some BackParagraph             , p
        | Key.Semicolon  :: p -> Some RepeatFind                , p
        | Key.Comma      :: p -> Some RepeatFindReverse         , p
        | Key.H          :: p
        | Key.Left       :: p
        | Key.Backspace  :: p -> Some Left                      , p
        | Key.L          :: p
        | Key.Right      :: p
        | Key.Space      :: p -> Some Right                     , p
        | Key.K          :: p
        | Key.Up         :: p -> Some Up                        , p
        | Key.J          :: p
        | Key.Down       :: p -> Some Down                      , p
        | Key.W          :: p
        | Key.SRight     :: p -> Some ForwardWord               , p
        | Key.CapW       :: p -> Some ForwardBigWord            , p
        | Key.B          :: p
        | Key.SLeft      :: p -> Some BackWord                  , p
        | Key.CapB       :: p -> Some BackBigWord               , p
        | Key.E          :: p -> Some ForwardEndWord            , p
        | Key.D0         :: p -> Some FirstColumn               , p
        | Key.Carot      :: p -> Some StartOfLine               , p
        | Key.Dollar     :: p -> Some EndOfLine                 , p
        |                   p -> None                           , p
    | Insert -> None, key :: pending
let parse pending mode key =
    let motion, pending = parseMotion pending mode key
    match motion with
    | Some motion ->
        match mode with
        | Normal ->
            match pending with
            | Key.C          :: p -> Some (Change motion)       , p
            | Key.D          :: p -> Some (Delete motion)       , p
            | Key.Y          :: p -> Some (Yank motion)         , p
            | Key.RAngle     :: p -> Some (Indent motion)       , p
            | Key.LAngle     :: p -> Some (Unindent motion)     , p
            |                   p -> Some (Motion motion)       , p // bare motion
        | Insert ->
            match pending with
            |                   p -> Some (Motion motion)       , p // bare motion
    | None ->
        match mode with
        | Normal ->
            match pending with
            | Key.C :: Key.C :: p -> Some ChangeLine            , p
            | Key.D :: Key.D :: p -> Some DeleteLine            , p
            | Key.Y :: Key.Y :: p -> Some YankLine              , p
            | Key.P          :: p -> Some PutAfter              , p
            | Key.CapP       :: p -> Some PutBefore             , p
            | Key.RAngle :: Key.RAngle :: p -> Some IndentLine  , p
            | Key.LAngle :: Key.LAngle :: p -> Some UnindentLine, p
            | k     :: Key.R :: p -> ReplaceWith |> expectChar k, p
            | Key.Esc        :: p
            | Key.CLSquare   :: p -> Some ResetState            , [] // forget pending
            | Key.I          :: p -> Some InsertBefore          , p
            | Key.CapI       :: p -> Some InsertBeforeLine      , p
            | Key.A          :: p -> Some InsertAfter           , p
            | Key.CapA       :: p -> Some InsertAfterLine       , p
            | Key.X          :: p -> Some DeleteForward         , p
            | Key.CapX       :: p -> Some DeleteBack            , p
            | Key.Dot        :: p -> Some RepeatAction          , p
            | Key.O          :: p -> Some OpenLineBelow         , p
            | Key.CapO       :: p -> Some OpenLineAbove         , p
            | Key.Star       :: p -> Some FindMatch             , p
            | Key.N          :: p -> Some NextMatch             , p
            | Key.CapN       :: p -> Some PreviousMatch         , p
            | Key.U          :: p -> Some Undo                  , p
            | Key.CapU       :: p -> Some UndoLine              , p
            | Key.CapJ       :: p -> Some JoinLine              , p
            | Key.C_R        :: p -> Some Redo                  , p
            | Key.C_D        :: p -> Some ScrollDownHalf        , p
            | Key.C_U        :: p -> Some ScrollUpHalf          , p
            | Key.C_Y        :: p -> Some ScrollDownLine        , p
            | Key.C_E        :: p -> Some ScrollUpLine          , p
            |                   p -> None                       , p
        | Insert ->
            match pending with
            | Key.Esc        :: p
            | Key.CLSquare   :: p -> Some NormalMode            , p
            | k              :: p -> Type |> expectChar k       , p
            |                   p -> None                       , p

type Direction = Forward | Backward

type Model = {
    Beep       : bool
    Mode       : Mode
    Pending    : Key list
    Operation  : Operation option // debugging
    Find       : (Direction * char) option
    Before     : char list
    After      : char list }

let init () = {
    Beep = false
    Mode = Normal
    Pending = []
    Operation = None
    Find = None
    Before = [] 
    After = ['N';'o';'w';' ';'t';'h';'e';' ';'t';'i';'m';'e';' ';'f';'o';'r';' ';'a';'l';'l';' ';'g';'o';'o';'d';' ';'m';'e';'n';' ';'t';'o';' ';'c';'o';'m';'e';'.';'.';'.'] }

let view model =
    if model.Beep then Console.Beep()
    Console.Clear()
    model.Before |> Seq.rev |> String.Concat |> Console.Write
    let x, y = Console.CursorLeft, Console.CursorTop
    model.After |> String.Concat |> Console.Write
    Console.WriteLine()
    Console.WriteLine()
    match model.Mode with
    | Normal -> printfn "NORMAL"
    | Insert -> printfn "INSERT"
    Console.WriteLine()
    printfn "Model: %A" model
    Console.CursorLeft <- x
    Console.CursorTop <- y

let rec update model input =
    let op, pending = parse model.Pending model.Mode input
    let model = { model with Pending = pending; Operation = op; Beep = false }
    let rec scan direction predicate model =
        let recurse = scan direction predicate
        if predicate model then Some model
        elif direction = Forward
        then match model.After with | h :: tail -> recurse { model with Before = h :: model.Before; After = tail } | [] -> None
        else match model.Before with | h :: tail -> recurse { model with Before = tail; After = h :: model.After } | [] -> None
    let expectSome = function Some x -> x | None -> failwith "Expected some value"
    let rec left beep model =
        match scan Backward (fun m -> m.Before.Length = model.Before.Length - 1) model with
        | Some model -> model
        | None -> { model with Beep = beep }
    let rec right beep model =
        match scan Forward (fun m -> m.After.Length > 0 (* under cursor *) && m.After.Length = model.After.Length - 1) model with
        | Some model -> model
        | None -> { model with Beep = beep }
    let isWordChar c = c = '_' || Char.IsLetterOrDigit(c)
    let isEsc k = k = Key.Esc || k = Key.CLSquare
    let play inputs model = inputs |> Seq.fold update model
    let normal = { model with Mode = Normal }
    let find direction upto c =
        let pred m =
            match direction, upto with
            | Forward,  false
            | Backward, false -> m.After <> model.After && match m.After with h :: _ -> h = c | [] -> false
            | Forward,  true  -> match m.After with _ :: h :: _ -> h = c | _ -> false
            | Backward, true  -> match m.Before with h :: _ -> h = c | [] -> false
        match scan direction pred normal with
        | Some normal -> normal
        | None -> { normal with Beep = true }
    if isEsc input then normal else
    match model.Mode with
    | Normal ->
        match op with
        | Some op -> 
            match op with
            | ResetState -> model // TODO
            | InsertAfter ->
                match model.After with
                | b :: after -> { model with Before = b :: model.Before; After = after; Mode = Insert }
                | [] -> { model with Mode = Insert }
            | InsertAfterLine -> model |> play [Key.Dollar; Key.A]
            | Motion BackWord ->
                let toNonWordChar = scan Backward (fun m -> m.Before.Length = 0 || not (isWordChar m.Before[0])) >> expectSome
                if model.Before.Length > 0 && isWordChar model.Before[0]
                then model |> toNonWordChar // first non-word char (or start)
                else model |> scan Backward (fun m -> m.Before.Length = 0 || isWordChar m.Before[0]) |> expectSome |> toNonWordChar // first non-word char (or start)
            | InsertBeforeLine -> model |> play [Key.Carot; Key.I]
            | Motion StartOfLine -> scan Backward (fun m -> m.Before.Length = 0) model |> expectSome |> scan Forward (fun m -> m.After.Length = 0 || isWordChar m.After[0]) |> expectSome
            | Motion FirstColumn -> scan Backward (fun m -> m.Before.Length = 0) model |> expectSome
            | Motion EndOfLine -> scan Forward (fun m -> m.After.Length <= 1) model |> expectSome
            | Motion ForwardEndWord ->
                let isEnd = function
                    | w :: n :: _ when isWordChar w && not (isWordChar n) -> true // end of word
                    | n :: [] when not (isWordChar n) -> true // end of line // TODO span lines
                    | [] -> true
                    | _ -> false
                model |> right false |> scan Forward (fun m -> isEnd m.After) |> expectSome
            | Motion (Find c) -> find Forward false c
            | Motion (FindReverse c) -> find Backward false c
            | Motion BackEndWord ->
                normal
                |> scan Backward (fun m -> m.Before.Length = 0 || m.After.Length = 0 || not (isWordChar m.After[0])) |> expectSome
                |> scan Backward (fun m -> m.Before.Length = 0 || m.After.Length = 0 || isWordChar m.After[0]) |> expectSome
            | ReplaceWith c ->
                let insert = if normal.After.Length > 1 then Key.I else Key.A
                let model' = play [Key.X; insert] normal
                { model' with Before = c :: model'.Before; Mode = Normal }
            | Motion (To c) -> find Forward true c
            | Motion (ToReverse c) -> find Backward true c
            | Motion Left -> left true model
            | InsertBefore -> { model with Mode = Insert }
            | Motion Right -> right true model
            | Motion ForwardWord -> // TODO span lines
                model
                |> scan Forward (fun m -> m.After.Length <= 1 || not (isWordChar m.After[0])) |> expectSome // first non-word char (or end)
                |> scan Forward (fun m -> m.After.Length <= 1 || isWordChar m.After[0]) |> expectSome // first word char following (or end)
            | DeleteForward ->
                let model = if model.After.Length > 0 then { model with After = model.After.Tail } else model
                if model.After.Length = 0 then left false model else model // move left if off end
            | DeleteBack -> if model.Before.Length > 0 then { model with Before = model.Before.Tail } else model
            | _ -> { model with Beep = true }
        | None -> model
    | Insert ->
        match op with
        | Some op ->
            match op with
            | NormalMode -> { model with Mode = Normal }
            | (Type c) -> { model with Before = c :: model.Before }
            | _ -> { model with Beep = true }
        | None  -> model

for case in Microsoft.FSharp.Reflection.FSharpType.GetUnionCases typeof<Motion> do
    printfn "%s" case.Name
for case in Microsoft.FSharp.Reflection.FSharpType.GetUnionCases typeof<Operation> do
    printfn "%s" case.Name
Console.ReadLine() |> ignore

keys ()
|> Seq.scan update (init ())
|> Seq.iter view

(*
{quote}{reg}p (or x d y) // can't type single "" in a comment?
i_<C-r>{reg} to put register contents, <C-r><C-p>{reg} without replay
i_<C-r>= to compute eienthings, e.g. <C-r>=(72-32)*5/9 types 22
i_<C-k>DG for ° sign, see :digraphs and :h digraphs
i_<C-k>*{char} Greek, <C-k>={char} Cyrillic
i_<C-o> for normal mode action while in insert
Gr treat tabs as spaces
i_C-h delete char, i_C-w delete word, i_C-u delete to start of line
g~{motion} to change case without selecting, gu lower, gU upper (accepts motion in normal mode)
guu or gUU or g~~ for whole line
C-a increment, C-x decrement, gC-a gC-x plus line ordinals
C-v{Tab} insert tab even when tabs as spaces
C-vu1234 insert Unicode char
ga show character value under cursor
*)