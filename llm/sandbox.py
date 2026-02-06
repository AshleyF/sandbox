from openai import OpenAI

client = OpenAI()
import json

model = 'gpt-3.5-turbo-1106'
#model = 'gpt-4-1106-preview'

def query(prompt):
    completion = client.chat.completions.create(model=model,
    temperature=0,
    messages=[{'role': 'user', 'content': prompt}],
    response_format={ 'type': 'json_object' })
    return completion.choices[0].message.content

def stanley(transcript, instructions):
    result = query('''
    You are a home assistant named Stanley. You will be asked to do things, such as control the light and blinds, or to answer questions and should return results as JSON.

    Generalize from these examples:

    When asked to open the curtains, relay to Alexa: { alexa: 'Open the curtains' }
    Or to close them: { alexa: 'Close the curtains' }
    Note that the blinds are in front of sliding door downstairs in the living room where the TV is, going out to the patio and hot tub.
    So requests such as, 'Hey Stanley, I'm heading out to the hot tub': { alexa: 'Open the curtains' }
    When asked unneccessarily to close the curtains: {say: 'The curtains are already closed'}
    When asked unneccessarily to open the curtains: {say: 'The curtains are already opened'}

    When asked to play music, relay to Siri (e.g. 'Hey Stanley, play that submarine song from the 60s'), first try to think of the specific song and artist and: { siri: 'Play Yellow Submarine by The Beatles' }
    If the music request is not a specifc song, such as 'Hey Stanley, play some classical music': { siri: 'Play classical music' }
    If the request is for something specific, but you can't determine the song and artist, ask for clarity and explain what you understand. For example when asked 'Hey Stanley, play the love song': { say: 'I'm not sure which song you mean. There are lots of songs about love. Can you describe more?' }
    If asked to turn off the music: {siri: 'Stop'}
    if asked to raise or lower the volume: {siri: 'Volume down'}

    Answer any questions about the following are the family birthdays:
    - Ashley: November 3, 1971
    - Tracey: October 12, 1972
    - Vi: December 3, 1943

    When asked general knowledge questions such as, 'Hey Stanly, who shot Lincoln?' then answer: {say: 'John Wilkes Booth'}

    When asked to do multiple things, the object may contain multiple results, such as 'Hey Stanley, can you stop the music and close the curtains':
    {
        siri: 'Stop',
        alexa: 'Close the curtains',
    }

    If what is said or asked seems highly irrelevant to what you, as Stanley, can help with, return: { irrelevant: true }
    But, if you are addressed directly (e.g. 'Hey Stanley, ...') then explain why you can't help. For example, { irrelevant: true, say: 'Sorry, ...' }

    The current state of the house is:
    - The curtains are closed
    - The date is November 21, 2023
    ''' +
    f'\nThe following is a trancript of the recent conversation between the human and you (Stanley):\n\n{transcript}' +
    f'\nRespond to the following instructions:\n\n{instructions}')
    return result

from playsound import playsound

def say(text):
    response = client.audio.speech.create(
        model="tts-1",
        voice="echo",
        input=text,
    )

    response.stream_to_file("output.mp3")
    playsound('output.mp3')

#import pyttsx3
#import time
#
#speech = pyttsx3.init()
#
#def say(message):
#    global transcript
#    transcript = f'{transcript}\nStanley: {message}'
#    print(f'SAY: {message}')
#    speech.say(message)
#    speech.runAndWait()
#    print('DONE')
#    time.sleep(7)
#    if speech._inLoop:
#        print('END LOOP')
#        speech.endLoop()

# Whisper required Python 3.8+ and FFMPEG
# Linux: sudo apt update && sudo apt install ffmpeg
# Mac: brew install ffmpeg

# sudo apt update && sudo apt upgrade -y
# sudo pip install torch torchvision torchaudio

import whisper # pip install git+https://github.com/openai/whisper.git 
import speech_recognition as sr # pip install SpeechRecognition
import numpy as np

engaged = False
transcript = ''

def listen():
    model = whisper.load_model("base")

    def callback(recognizer, audio):
        global engaged, transcript
        try:
            print('CALLBACK')
            audio_data = audio.get_wav_data()
            data_s16 = np.frombuffer(audio_data, dtype=np.int16, count=len(audio_data)//2, offset=0)
            float_data = data_s16.astype(np.float32, order='C') / 32768.0
            said = model.transcribe(float_data)
            heard = said["text"]
            print(f'HEARD (engaged={engaged}): {heard}')
            if 'Stan' in heard: engaged = True
            if engaged:
                print(f'TRANSCRIPT: {transcript}')
                obj = stanley(transcript, heard)
                result = json.loads(obj)
                print(f'RESULT: {result}')
                for attribute, value in result.items():
                    if attribute == 'say': say(value)
                    elif attribute == 'alexa': say(f'Alexa, {value}')
                    elif attribute == 'siri': say(f'Hey Siri, {value}')
                    elif attribute == 'irrelevant':
                        print('\a') # beep
                        engaged = False
                        transcript = ''
                    else: print(f'UNKNOWN: {attribute}={value}')
            transcript = f'{transcript}\nHuman: {heard}'
        except Exception as e:
            print(f'ERROR: {e}')
            print('I didn\'t catch that')

    r = sr.Recognizer()
    m = sr.Microphone(sample_rate=16000)
    with m as source: r.adjust_for_ambient_noise(source)
    stop_listening = r.listen_in_background(m, callback)
    input('Listening... Press enter to exit...\a')
    stop_listening(wait_for_stop=False)

listen()