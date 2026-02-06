open System
open System.Diagnostics
open System.Runtime.InteropServices
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
        match handler code wparam lparam with
        | Some keys ->
            if String.length keys > 0 then SendKeys.Send keys
            nativeint 1
        | None -> CallNextHookEx(hook, code, wparam, lparam)
    and proc = new LowLevelKeyboardProc(callback)
    and hook = SetHook proc
    override x.ExitThreadCore() =
        UnhookWindowsHookEx(hook) |> ignore
        base.ExitThreadCore()

let keycast = "KeyCast"

printfn "Welcome to %s!" keycast
Console.SetWindowSize(19, 1)
Console.Title <- keycast

let key = int >> enum

open System.Windows.Media

let keyCast =
    new System.Windows.Controls.Label(
        Content = keycast,
        Background = null,
        Foreground = new SolidColorBrush(Colors.White),
        FontFamily = new FontFamily("Consolas"),
        FontSize = 144.,
        HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
        VerticalAlignment = System.Windows.VerticalAlignment.Center)

[<STAThread>]
do
    let win =
        new System.Windows.Window (
            Topmost = true,
            Opacity = 0.8,
            Background = null,
            AllowsTransparency = true,
            WindowStyle = Windows.WindowStyle.None,
            Width = 2000.,
            Height = 200.)
    let border =
        new System.Windows.Controls.Border(
            CornerRadius = new System.Windows.CornerRadius(10.),
            Background = new SolidColorBrush(Colors.Black),
            Height = 200.,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
            Padding = new System.Windows.Thickness(20., 0., 20., 0.),
            Child = keyCast)
    border.MouseLeftButtonDown.Add(fun _ -> win.DragMove())
    win.Content <- border
    win.Show()

let keys = ref ""
let last = ref DateTime.Now

let showKey k =
    let friendlyName = function
        | "D0" -> "0"
        | "D1" -> "1"
        | "D2" -> "2"
        | "D3" -> "3"
        | "D4" -> "4"
        | "D5" -> "5"
        | "D6" -> "6"
        | "D7" -> "7"
        | "D8" -> "8"
        | "D9" -> "9"
        | "160" -> "" // left shift
        | "161" -> "" // right shift
        | "164" -> "" // left alt
        | "165" -> "" // right alt
        | "OemPlus" | "OemMinus" -> ""
        | "LeftWindows" -> "Win"
        | "RightWindows" -> "Win"
        | "Escape" -> "Esc"
        | "Spacebar" -> " "
        | k -> k
    let now = DateTime.Now
    if (now - !last).TotalMilliseconds > 0. then keys := ""
    last := now
    keys := !keys + friendlyName k
    keyCast.Content <- !keys

Application.Run(new App(fun code wparam lparam ->
    let (k : ConsoleKey) = key lparam.vkCode
    let keydown = lparam.flags &&& 0b10000000u = 0u
    let notInjected = lparam.flags &&& 0b10000u = 0u
    if keydown && notInjected then
        showKey (k.ToString())
        None
    else None))
