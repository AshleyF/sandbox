// JSON parser that handles partial (incremental) syntax
// as you might get from GPT in streaming mode.

open System

type Value =
  | Object of Members
  | Array of Elements
  | String of String
  | Number of double
  | Boolean of bool
  | Null
and Member = { Name: string; Value: Value }
and Members = { Members: Member list; IsFinal: bool }
and Elements = { Elements: Value list; IsFinal: bool }
and String = { Value: string; IsFinal: bool }

let Parse json =
  let ws = Char.IsWhiteSpace
  let toStr (cs : char list) = cs |> Seq.rev |> String.Concat
  let rec parseNumber num = // called when '+' | '-' | digit seen
    let isNumberChar = function
      | d when Char.IsDigit d -> true
      | '+' | '-' | '.' | 'e' | 'E' -> true
      | _ -> false
    function
    | c :: t when isNumberChar c -> parseNumber (c :: num) t
    | (_ :: _) as t ->
      match num |> toStr |> Double.TryParse with
      | true, n -> Some (Number n), t
      | false, _ -> failwith $"Malformed JSON (expected number). Remaining JSON: {toStr t}"
    | [] -> None, [] // partial number, ignore
  let rec parseString str = function
    | '"' :: t -> String { Value=toStr str; IsFinal=true } |> Some, t // complete string
    | '\\' :: ('"'  as c) :: t
    | '\\' :: ('/'  as c) :: t
    | '\\' :: ('\\' as c) :: t -> parseString (c :: str) t
    | '\\' :: 'b' :: t -> parseString ('\b' :: str) t
    | '\\' :: 'f' :: t -> parseString ('\f' :: str) t
    | '\\' :: 'n' :: t -> parseString ('\n' :: str) t
    | '\\' :: 'r' :: t -> parseString ('\r' :: str) t
    | '\\' :: 't' :: t -> parseString ('\t' :: str) t
    | '\\' :: 'u' :: h :: i :: j :: k :: t -> parseString ((Convert.ToInt32($"{h}{i}{j}{k}", 16) |> char) :: str) t
    | '\\' :: 'u' :: [] // incomplete \u
    | '\\' :: 'u' :: _ :: [] // incomplete \uA
    | '\\' :: 'u' :: _ :: _ :: [] // incomplete \uAB
    | '\\' :: 'u' :: _ :: _ :: _ :: [] // incomplete \uABC
    | '\\' :: [] -> String { Value=toStr str; IsFinal=false } |> Some, [] // incomplete \ ignore and auto-terminate string
    | h :: t -> parseString (h :: str) t
    | [] -> String { Value=toStr str; IsFinal=false } |> Some, [] // auto-terminate string
  and parseArray values = function
    | ']' :: t -> Array { Elements=List.rev values; IsFinal=true } |> Some, t // complete array
    | ',' :: t -> parseArray values t
    | c :: t when ws c -> parseArray values t
    | e -> 
      match parseElement e with
      | None, _ -> Array { Elements=List.rev values; IsFinal=false } |> Some, [] // not including unparsed value
      | Some v, [] -> Array { Elements=v :: values |> List.rev; IsFinal=false } |> Some, [] // auto-complete array
      | Some v, t -> parseArray (v :: values) t
  and parseValue = function
    | [] -> None, []
    | 't'::[] | 't'::'r'::[] | 't'::'r'::'u'::[] -> Boolean true |> Some, [] // auto-complete 'true'
    | 't'::'r'::'u'::'e':: t -> Boolean true |> Some, t // complete 'true'
    | 'f'::[] | 'f'::'a'::[] | 'f'::'a'::'l'::[] | 'f'::'a'::'l'::'s':: [] -> Boolean false |> Some, [] // auto-complete 'false'
    | 'f'::'a'::'l'::'s'::'e':: t -> Boolean false |> Some, t // complete 'false'
    | 'n'::[] | 'n'::'u'::[] | 'n'::'u'::'l'::[] -> Null |> Some, [] // auto-complete 'null'
    | 'n'::'u'::'l'::'l':: t -> Null |> Some, t // complete 'null'
    | (h :: t) as json ->
      match h with
      | d when Char.IsDigit d -> parseNumber [] json
      | '+' | '-' -> parseNumber [] json
      | '"'       -> parseString [] t
      | '['       -> parseArray [] t
      | '{'       -> parseObject t
      | _ -> failwith $"Malformed JSON (expecting value). Remaining JSON: {toStr t}"
  and parseMembers members = function
    | '}' :: t -> Object { Members=List.rev members; IsFinal=true } |> Some, t // complete object
    | ',' :: t -> parseMembers members t
    | '"' :: t -> // member name
      let rec skipToValue = function
        | ':' :: t -> Some t
        | c :: t when ws c -> skipToValue t
        | [] -> None // incomplete e.g. "foo" (without :)
        | t -> failwith $"Malformed JSON (expected member value preceded by colon). Remaining JSON: {toStr t}" // e.g. { "foo" 123
      match parseString [] t with // name e.g. "foo"
      | Some (String { IsFinal=false }), t' -> Object { Members=List.rev members; IsFinal=false } |> Some, t' // incomplete name, drop member e.g. "fo
      | Some (String { Value=name; IsFinal=true }), t' -> // complete name
        match skipToValue t' with
        | Some t'' ->
          match parseElement t'' with
          | None, t''' -> Object { Members=List.rev members; IsFinal=false } |> Some, t''' // not including members with empty value
          | Some value, t''' -> parseMembers ({ Name=name; Value=value } :: members) t''' // complete member
        | None -> Object { Members=List.rev members; IsFinal=false } |> Some, t' // missing value, drop member
    | c :: t when ws c -> parseMembers members t
    | [] -> Object { Members=List.rev members; IsFinal=false } |> Some, [] // auto-complete object
    | t -> failwith $"Malformed JSON (expected member name). Remaining JSON: {toStr t}" // e.g. { 123
  and parseObject = function
    | '}' :: t -> Object { Members=[]; IsFinal=true } |> Some, t // empty object e.g. {}
    | ('"' :: _) as t -> parseMembers [] t
    | c :: t when ws c -> parseObject t // skip whitespace
    | [] -> Object { Members=[]; IsFinal=false } |> Some, [] // incomplete empty object e.g. {
    | t -> failwith $"Malformed JSON (expected object members). Remaining JSON: {toStr t}" // non-whitespace e.g. { 123
  and parseElement = function
    | c :: t when ws c -> parseElement t // skip white space
    | h -> parseValue h
  match json |> Seq.toList |> parseElement with
  | Some value, _ -> value
  | None, _ -> failwith $"Malformed JSON (no value). JSON: {json}"

let rec Print value =
  let escape = function
    | '"'  -> ['\\'; '"']
    | '/'  -> ['\\'; '/']
    | '\\' -> ['\\'; '\\']
    | '\b' -> ['\\'; 'b']
    | '\f' -> ['\\'; 'f']
    | '\n' -> ['\\'; 'n']
    | '\r' -> ['\\'; 'r']
    | '\t' -> ['\\'; 't']
    | c -> [c] // not escaped
  match value with
  | Object { Members=members } -> "{" + String.Join(",", Seq.map (fun { Name=n; Value=v } -> $"\"{n}\":{Print v}") members) + "}"
  | Array { Elements=elements } -> "[" + String.Join(",", Seq.map Print elements) + "]"
  | String { Value=str } -> $"\"{str |> Seq.map escape |> Seq.concat |> String.Concat}\""
  | Number n -> n.ToString() // parsing a number and printing it may change the representation (e.g. "2E10" -> "20000000000")
  | Boolean true -> "true"
  | Boolean false -> "false"
  | Null -> "null"
