# MIDI Experiment

Using Roland VQD106 drum kit.

- Channel 10 by default
- `KeyAfterTouch` is used to choke cymbals (sent when squeezing the edge and also just before `NoteOn`).
- `ControlChange` is used for the hi-hat pedal (send on change and just before `NoteOn`).
- Separate notes for:
  - Hi-hat edge (`Drum 26`)
  - Foot splash (`Pedal Hi-hat`)
  - Cross-stick (`Side Stick`)
  - Snare rim (`Electric Snare`)

Rim:

```
0 NoteOn Ch: 10 Electric Snare Vel:120 Len: 0
0 NoteOff Ch: 10 Electric Snare Vel:64

## Hi-hat

With pedal down:

```
0 KeyAfterTouch Ch: 10 Closed Hi-Hat Vel:0
0 ControlChange Ch: 10 Controller FootController Value 90
0 NoteOn Ch: 10 Closed Hi-Hat Vel:127 Len: 0
0 NoteOff Ch: 10 Closed Hi-Hat Vel:64
```

With pedal up:

```
0 KeyAfterTouch Ch: 10 Open Hi-Hat Vel:0
0 ControlChange Ch: 10 Controller FootController Value 0
0 NoteOn Ch: 10 Open Hi-Hat Vel:127 Len: 0
0 NoteOff Ch: 10 Open Hi-Hat Vel:64
```

Edge with pedal up:

```
0 KeyAfterTouch Ch: 10 Open Hi-Hat Vel:0
0 ControlChange Ch: 10 Controller FootController Value 0
0 NoteOn Ch: 10 Open Hi-Hat Vel:127 Len: 0
0 NoteOff Ch: 10 Drum 26 Vel:64
0 NoteOff Ch: 10 Open Hi-Hat Vel:64
```

Choke and release:

```
0 KeyAfterTouch Ch: 10 Open Hi-Hat Vel:127
0 KeyAfterTouch Ch: 10 Drum 26 Vel:127
0 KeyAfterTouch Ch: 10 Open Hi-Hat Vel:0
0 KeyAfterTouch Ch: 10 Drum 26 Vel:0
```

Foot pedal down/up:

```
0 ControlChange Ch: 10 Controller FootController Value 4
0 ControlChange Ch: 10 Controller FootController Value 14
0 ControlChange Ch: 10 Controller FootController Value 25
0 ControlChange Ch: 10 Controller FootController Value 45
0 ControlChange Ch: 10 Controller FootController Value 65
0 ControlChange Ch: 10 Controller FootController Value 56
0 ControlChange Ch: 10 Controller FootController Value 33
0 ControlChange Ch: 10 Controller FootController Value 11
0 ControlChange Ch: 10 Controller FootController Value 3
0 ControlChange Ch: 10 Controller FootController Value 0
```

Foot splash:

```
0 ControlChange Ch: 10 Controller FootController Value 68
0 ControlChange Ch: 10 Controller FootController Value 78
0 NoteOn Ch: 10 Pedal Hi-Hat Vel:127 Len: 0
0 ControlChange Ch: 10 Controller FootController Value 61
0 ControlChange Ch: 10 Controller FootController Value 50
0 ControlChange Ch: 10 Controller FootController Value 61
0 ControlChange Ch: 10 Controller FootController Value 23
0 ControlChange Ch: 10 Controller FootController Value 8
0 ControlChange Ch: 10 Controller FootController Value 0
0 NoteOff Ch: 10 Pedal Hi-Hat Vel:64
```

## Splash/Crash Cymbal

```
0 KeyAfterTouch Ch: 10 Crash Cymbal 1 Vel:0
0 NoteOn Ch: 10 Crash Cymbal 1 Vel:33 Len: 0
0 NoteOff Ch: 10 Crash Cymbal 1 Vel:64
```

Edge:

```
0 KeyAfterTouch Ch: 10 Splash Cymbal Vel:0
0 NoteOn Ch: 10 Splash Cymbal Vel:36 Len: 0
0 KeyAfterTouch Ch: 10 Crash Cymbal 1 Vel:0
0 NoteOn Ch: 10 Crash Cymbal 1 Vel:51 Len: 0
0 NoteOff Ch: 10 Splash Cymbal Vel:64
0 NoteOff Ch: 10 Crash Cymbal 1 Vel:64
```

Choke and release:

```
0 KeyAfterTouch Ch: 10 Crash Cymbal 1 Vel:127
0 KeyAfterTouch Ch: 10 Splash Cymbal Vel:127
0 KeyAfterTouch Ch: 10 Crash Cymbal 1 Vel:0
0 KeyAfterTouch Ch: 10 Splash Cymbal Vel:0
```

## Ride Cymbal

```
0 KeyAfterTouch Ch: 10 Ride Cymbal 1 Vel:0
0 NoteOn Ch: 10 Ride Cymbal 1 Vel:56 Len: 0
0 NoteOff Ch: 10 Ride Cymbal 1 Vel:64
```

Edge:

```
0 KeyAfterTouch Ch: 10 Ride Cymbal 2 Vel:0
0 NoteOn Ch: 10 Ride Cymbal 2 Vel:53 Len: 0
0 NoteOff Ch: 10 Ride Cymbal 2 Vel:64
```

Choke and release:

```
0 KeyAfterTouch Ch: 10 Ride Cymbal 1 Vel:127
0 KeyAfterTouch Ch: 10 Ride Cymbal 2 Vel:127
0 KeyAfterTouch Ch: 10 Ride Bell Vel:127
0 KeyAfterTouch Ch: 10 Ride Cymbal 1 Vel:0
0 KeyAfterTouch Ch: 10 Ride Cymbal 2 Vel:0
0 KeyAfterTouch Ch: 10 Ride Bell Vel:0
```

Note: Don't have a bell trigger

## Hi-Mid Tom

```
0 NoteOn Ch: 10 Hi-Mid Tom Vel:87 Len: 0
0 NoteOff Ch: 10 Hi-Mid Tom Vel:64
```

## Low Tom

```
0 NoteOn Ch: 10 Low Tom Vel:80 Len: 0
0 NoteOff Ch: 10 Low Tom Vel:64
```

## High Floor Tom

```
0 NoteOn Ch: 10 High Floor Tom Vel:110 Len: 0
0 NoteOff Ch: 10 High Floor Tom Vel:64
```

## Snare

```
0 NoteOn Ch: 10 Acoustic Snare Vel:103 Len: 0
0 NoteOff Ch: 10 Acoustic Snare Vel:64
```

Note: Somehow the module distinguishes central vs. side hits, but it's not in the MIDI info.

Cross-stick/Side stick:

```
0 NoteOn Ch: 10 Side Stick Vel:68 Len: 0
0 NoteOff Ch: 10 Side Stick Vel:64
```

Rim:

```
0 NoteOn Ch: 10 Electric Snare Vel:120 Len: 0
0 NoteOff Ch: 10 Electric Snare Vel:64
```

## Kick/Bass

```
0 NoteOn Ch: 10 Bass Drum 1 Vel:106 Len: 0
0 NoteOff Ch: 10 Bass Drum 1 Vel:64
```

## Notes

- Use [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)
