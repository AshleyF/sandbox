import subprocess

proc = subprocess.Popen(['./whisper/stream', '-m', './whisper/models/ggml-tiny.en.bin', '--step', '3000', '--length', '5000', '-c', '1', '-t', '4', '-ac', '512'], stdout=subprocess.PIPE)
while True:
    for line in iter(proc.stdout.readline, b''):
        decoded = line.decode('utf-8')
        print('got line: {0}'.format(decoded), end='')