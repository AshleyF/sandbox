open System
open System.IO
open System.Threading
open System.Timers
open NAudio.Midi
open NAudio.Wave
open System.IO.Ports

let loadSample (file: string) =
    use reader = new WaveFileReader(file)
    let memoryStream = new MemoryStream()
    let buffer = Array.zeroCreate<byte> 6000
    let mutable bytesRead = reader.Read(buffer, 0, buffer.Length)
    while bytesRead > 0 do
        memoryStream.Write(buffer, 0, bytesRead)
        bytesRead <- reader.Read(buffer, 0, buffer.Length)
    memoryStream.Position <- 0L
    new RawSourceWaveStream(memoryStream, reader.WaveFormat)

let playSample (reader: RawSourceWaveStream) volume =
    let waveOut = new WaveOutEvent()
    reader.Position <- 0
    waveOut.Init(reader)
    waveOut.Play()
    waveOut.Volume <- volume
    async {
        while waveOut.PlaybackState = PlaybackState.Playing do
            do! Async.Sleep(100)
        waveOut.Dispose()
    } |> Async.Start

let snare = loadSample @"..\..\..\samples\rapsnaresX_01-short.wav"
let tom = loadSample @"..\..\..\samples\SnickR_08-regular.wav"
let hat = loadSample @"..\..\..\samples\ClosedHatsX_130-regular.wav"
let cymbal = loadSample @"..\..\..\samples\CymbalX_01-regular.wav"
let kick = loadSample @"..\..\..\samples\vkick_07-regular.wav"

let midiMessageReceived (args: MidiInMessageEventArgs) =
    printfn "%A" args.MidiEvent
    match args.MidiEvent with
    | :? NoteOnEvent as noteOn ->
        let position, color, sample = 
            match noteOn.NoteNumber with
            | 49 -> 10, ConsoleColor.Red,    hat
            | 48 -> 15, ConsoleColor.Green,  snare
            | 45 -> 20, ConsoleColor.Blue,   tom
            | 51 -> 25, ConsoleColor.Yellow, cymbal
            | _  ->  0, ConsoleColor.Gray,   snare
        let volume = (single noteOn.Velocity) / 127f
        //playSample sample volume
        //Console.SetCursorPosition(position, Console.WindowHeight - 2)
        let originalColor = Console.ForegroundColor
        //Console.ForegroundColor <- color
        //Console.Write('■')
        Console.ForegroundColor <- originalColor
    | _ -> ()

let onTimerElapsed (_: obj) (args: ElapsedEventArgs) =
    Console.SetCursorPosition(0, Console.WindowHeight - 1)
    Console.WriteLine(String.replicate Console.WindowWidth " ")

let startMetronome intervalMilliseconds =
    let timer = new Timer(float intervalMilliseconds)
    timer.Elapsed.AddHandler(onTimerElapsed)
    timer.AutoReset <- true // Fires repeatedly
    timer.Enabled <- true
    timer.Start()

let listMidiDevices () =
    if MidiIn.NumberOfDevices = 0 then
        printfn "No MIDI input devices found."
    else
        printfn "Available MIDI input devices:"
        for i in 0 .. MidiIn.NumberOfDevices - 1 do
            let info = MidiIn.DeviceInfo(i)
            printfn "%d: %s %s" i (info.Manufacturer.ToString()) (info.ProductName)
    if MidiIn.NumberOfDevices = 1 then 0 else -1

let getInputDevice () =
    let autoChosen = listMidiDevices()
    if autoChosen >= 0 then autoChosen else
        printf "Select a MIDI device index: "
        match Int32.TryParse(Console.ReadLine()) with
        | true, i when i >= 0 && i < MidiIn.NumberOfDevices -> i
        | _ -> failwith "Invalid device index."

let readMidiInput () =
    let deviceIndex = getInputDevice ()
    use midiIn = new MidiIn(deviceIndex)
    midiIn.MessageReceived.Add midiMessageReceived
    midiIn.Start()
    printfn "Listening for MIDI messages. Press Enter to exit..."

    while true do
        Console.ReadLine() |> ignore
        printfn "--------------------------------------------------"

let writeMidiOutput () =
    for i in 0 .. MidiOut.NumberOfDevices - 1 do
        let info = MidiOut.DeviceInfo(i)
        printfn "Device %d: %s" i info.ProductName
    let deviceIndex = 1
    use midiOut = new MidiOut(deviceIndex)
    midiOut.Reset()

    let note = 38        // Snare (D1)
    let velocity = 100   // Hit strength (1–127)
    let channel = 9      // MIDI channel 10 (zero-based index)

    //let noteOn = MidiMessage.StartNote(note, velocity, channel)
    //let noteOn = new NoteOnEvent(0, channel, note, velocity, 10)
    let noteOff = MidiMessage.StopNote(note, 0, channel)

    use port = new SerialPort("COM6", 115200, Parity.None, 8, StopBits.One)
    port.DtrEnable <- true
    port.RtsEnable <- true
    //port.DataReceived.Add(fun _ ->
            //)
    port.Open()
    while true do
        let velocity = port.ReadByte()
        let noteOn = MidiMessage.StartNote(note, velocity, channel)
        midiOut.Send(noteOn.RawData)
        Thread.Sleep(100) // Hold briefly
        midiOut.Send(noteOff.RawData)
        printfn "Velocity: %i" velocity

    Console.ReadLine() |> ignore

    (*
    for _ in 0 .. 100000 do
        for p in 0 .. 10 .. 127 do
            let cc = MidiMessage(0xB0 + channel, 16, p)
            midiOut.Send(cc.RawData)
            midiOut.Send(noteOn.RawData)
            Thread.Sleep(100) // Hold briefly
            midiOut.Send(noteOff.RawData)
            printfn "Snare %i" p
            Thread.Sleep(400)
    *)



//startMetronome 100
//readMidiInput ()
writeMidiOutput ()
