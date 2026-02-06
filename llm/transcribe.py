# Whisper required Python 3.8+ and FFMPEG
# Linux: sudo apt update && sudo apt install ffmpeg
# Mac: brew install ffmpeg

# sudo apt update && sudo apt upgrade -y
# sudo pip install torch torchvision torchaudio

import whisper # pip install git+https://github.com/openai/whisper.git 
import speech_recognition as sr # pip install SpeechRecognition
import numpy as np

model = whisper.load_model("base")

def callback(recognizer, audio):
    try:
        audio_data = audio.get_wav_data()
        data_s16 = np.frombuffer(audio_data, dtype=np.int16, count=len(audio_data)//2, offset=0)
        float_data = data_s16.astype(np.float32, order='C') / 32768.0
        result = model.transcribe(float_data)
        heard = result["text"]
        print(f'HEARD: {heard}')
    except Exception as e:
        print(f'ERROR: {e}')
        print('I didn\'t catch that')

r = sr.Recognizer()
m = sr.Microphone(sample_rate=16000)
with m as source: r.adjust_for_ambient_noise(source)
print('Ready...')

stop_listening = r.listen_in_background(m, callback)

input('Press enter to exit...')
stop_listening(wait_for_stop=False)