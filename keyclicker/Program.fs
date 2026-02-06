open System
open System.Diagnostics
open System.IO
open System.Runtime.InteropServices
open System.Windows.Media
open System.Windows.Forms

[<Literal>]
let WH_KEYBOARD_LL = 13

[<StructLayout(LayoutKind.Sequential)>]
type KBDLLHOOKSTRUCT =
    val vkCode      : uint32
    val scanCode    : uint32
    val flags       : uint32
    val time        : uint32
    val dwExtraInfo : nativeint

type LowLevelKeyboardProc = delegate of int * nativeint * KBDLLHOOKSTRUCT -> nativeint

[<DllImport("kernel32.dll")>]
extern nativeint GetModuleHandle(string lpModuleName)

[<DllImport("user32.dll")>]
extern bool UnhookWindowsHookEx(nativeint hhk)

[<DllImport("user32.dll")>]
extern nativeint SetWindowsHookEx(int idhook, LowLevelKeyboardProc proc, nativeint hMod, uint32 threadId)

[<DllImport("user32.dll")>]
extern nativeint CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, KBDLLHOOKSTRUCT lParam)

let SetHook (proc: LowLevelKeyboardProc) =
    use curProc = Process.GetCurrentProcess ()
    use curMod = curProc.MainModule
    SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curMod.ModuleName), 0u)

type App(handler) as x =
    inherit ApplicationContext()
    let rec callback (code : int) (wparam : nativeint) (lparam : KBDLLHOOKSTRUCT) : nativeint =
        handler code wparam lparam
        CallNextHookEx(hook, code, wparam, lparam)
    and proc = new LowLevelKeyboardProc(callback)
    and hook = SetHook proc
    override x.ExitThreadCore() =
        UnhookWindowsHookEx(hook) |> ignore
        base.ExitThreadCore()

let keySoundMappings = [
    (65, "A"); (66, "B"); (67, "C"); (68, "D"); (69, "E"); (70, "F"); (71, "G")
    (72, "H"); (73, "I"); (74, "J"); (75, "K"); (76, "L"); (77, "M"); (78, "N")
    (78, "O"); (80, "P"); (81, "Q"); (82, "R"); (83, "S"); (84, "T"); (85, "U")
    (86, "V"); (87, "W"); (88, "X"); (89, "Y"); (90, "Z")
    (8, "BACKSPACE")
    (13, "ENTER")
    (20, "CAPS LOCK")
    (32, "SPACE")
    ]

let makePlayer sound =
    let player = new MediaPlayer();
    player.Open(new System.Uri(Path.Combine(Environment.CurrentDirectory, $"../../../sounds/{sound}.mp3")));
    player.MediaFailed.Add(fun (_) -> printfn $"MEDIA FAILURE: {sound}")
    player

let keyPlayerMappings =
    keySoundMappings
    |> Seq.map (fun (k, s) -> uint32 k, makePlayer s)
    |> Map.ofSeq

let defaultPlayer = makePlayer "A"

Console.WriteLine("Leave this running in the background, playing keyboard clicks as you type in any foreground app.")

Application.Run(new App(fun code wparam lparam ->
    let keydown = lparam.flags &&& 0x80u = 0u
    if keydown then
        let player = 
            match Map.tryFind lparam.vkCode keyPlayerMappings with
            | Some p -> p
            | None -> defaultPlayer
        player.Play()
        player.Position <- TimeSpan.Zero
    ))
