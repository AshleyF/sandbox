# KeyClicker

A simple app (in both [.NET F#](Program.fs) and [Python](KeyClicker.py)) to play keyboard sound effects as keys are pressed. Hooks events system-wide (leave running in the background while typing in any foreground app).

- TODO: Distinction between key down/up sounds

## Sound Files

Sound files were recorded by Glarses (included here with his permission).
Check out his video: https://youtu.be/P_9vXJZVT54

## Troubleshooting

- Doesn't work on M1 Mac due to [this issue with the keyboard module](https://github.com/boppreh/keyboard/issues/521)
