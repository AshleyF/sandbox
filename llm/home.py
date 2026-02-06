from openai import OpenAI

client = OpenAI()
import whisper
import os
import asyncio
import speech_recognition as sr
import pyttsx3
from kasa import SmartBulb
import numpy as np
import warnings

warnings.filterwarnings("ignore")



speech = pyttsx3.init()

def say(message):
    speech.say(message)
    speech.runAndWait()

def query(prompt):
    completion = client.chat.completions.create(model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}])
    return completion.choices[0].message.content

async def kasaBulbColor(name, h, s, v):
    name = name.lower()
    if name == 'overhanging' or name == 'reading' or name == 'black':
        os.system(f'kasa --host 192.168.4.204 --type bulb hsv {h} {s} {v}') # Living Room Black Lamp

async def kasaBulb(room, name, on):
    #bulb = SmartBulb('192.168.4.193') # Livingroom Floor Lamp
    #await bulb.update()
    #print(bulb.alias)
    name = name.lower()
    room = room.lower()
    if room == 'living':
        if name == 'tall1' or name == 'sofa' or name == 'couch':
            if on: os.system('kasa --host 192.168.4.175 --type plug on') # Corner Living Room Floor Lamp
            else: os.system('kasa --host 192.168.4.175 --type plug off') # Corner Living Room Floor Lamp
        elif name == 'tall2' or name == 'bookcase':
            if on: os.system('kasa --host 192.168.4.193 --type plug on') # Livingroom Floor Lamp
            else: os.system('kasa --host 192.168.4.193 --type plug off') # Livingroom Floor Lamp
        elif name == 'overhanging' or name == 'reading' or name == 'black':
            if on: os.system('kasa --host 192.168.4.204 --type bulb on') # Living Room Black Lamp
            else: os.system('kasa --host 192.168.4.204 --type bulb off') # Living Room Black Lamp
        elif name == '' or name == 'reading' or name == 'black':
            if on: os.system('kasa --host 192.168.4.204 --type bulb on') # Living Room Black Lamp
            else: os.system('kasa --host 192.168.4.204 --type bulb off') # Living Room Black Lamp
    elif room == 'bedroom':
        if name == 'floor':
            if on: os.system('kasa --host 192.168.4.185 --type plug on') # Bedroom floor lamp
            else: os.system('kasa --host 192.168.4.185 --type plug off') # Bedroom floor lamp

def lamp(room, name, on):
    #print(f'Lamp: {room} {name} {on}')
    asyncio.run(kasaBulb(room, name, on))

def color(room, name, h, s, v):
    asyncio.run(kasaBulbColor(name, h, s, v))

def alexa(phrase):
    say(f'Alexa, {phrase}')

def siri(phrase):
    say(f'Hey Siri, {phrase}')

description = '''
    My home has three lights in the living room: two tall white floor lamps, one by the sofa
    and one by a bookcase, and a tall overhanging black lamp for reading.'''

def automation(prompt, time):
    context = f'''
        Pretend that you have access to Python APIs to control my home.
        {description} You can turn the livingroom lights on and off by calling a function
        lamp('living', 'tall1', True) or lamp('living', 'Tall2', false) for example.
        The bedroom floor lamp can be turned on and off by calling the function
        lamp('bedroom', 'floor', True) or lamp('bedroom', 'floor', False).
        For the reading lamp, you can also change their color by calling a function
        color('living', 'reading', 20, 30, 40) where the hue is 20, the saturation is 30
        and the value is 40 in HSV color format. Setting the color ONLY works on the reading
        lamp. If someone asks to set the other floor lamp colors, the tell them that this
        cannot be done and instead just turn them on. We like all the lights off at night and
        the living room lights on during the day.

        You can also control the curtains downstairs by the sliding glass door that goes out to
        the back patio and the hottub by telling Alexa to do it. For example
        alexa(\'open the curtains\') or alexa(\'close the curtains\').

        You can play songs on the speakers in the house by asking Siri.
        For example by calling siri(\'play Let It Be by the Beatles\') or
        siri(\'play Peaches by Justin Bieber\').

        Respond to the following prompt with a message for the human and function calls to do it'''

    print('----------------------------------------------------------------------')
    print(f'Prompt: {prompt}')
    response = query(f'{context}, given at {time}: {prompt}')
    print('----------------------------------------------------------------------')
    print(f'Response: {response}')

    code = query(f'Please extract just the code from this text: {response}')
    print('----------------------------------------------------------------------')
    print(f'Code: {code}')
    for line in code.splitlines():
        try:
            exec(line.replace('`', '').strip())
        except Exception as e:
            print(f'ERROR: {repr(e)}')

    #human = query(f'Please extract just the part meant for humans (without including any mention of the code) from this, and summarize consisely: {response}')
    #print('----------------------------------------------------------------------')
    #print(f'Human: {human}')
    #say(human)

#automation('its getting to be that time', '9:35pm')
#automation('Im getting tired', '8:45pm')
#automation('Im done reading', '7:20pm')
#automation('hey Im reading over here', '7:20pm')
#automation('its time for diner. we really dont need the livingroom to be so bright right now.', '7pm')
#automation('turn off all the livingroom lights please', '')
#automation('I have a headache', '')
#automation('good morning', '8:10am')
#automation('good night', '8:10pm')
#automation('illuminate', '9:13am')

#lamp('living', 'tall2', False)

# print(query('write python code to recognize speech from the microphone and print text'))
#print(query('write python code to speak some text'))
def main():
    while True:
        r = sr.Recognizer()
        with sr.Microphone(sample_rate=16000) as source:
            r.adjust_for_ambient_noise(source)
            print()
            input('Press enter to continue...')
            print('Say something...')
            audio = r.listen(source)
        try:
            audio_data = audio.get_wav_data()
            data_s16 = np.frombuffer(audio_data, dtype=np.int16, count=len(audio_data)//2, offset=0)
            float_data = data_s16.astype(np.float32, order='C') / 32768.0
            model = whisper.load_model("base")
            result = model.transcribe(float_data)
            prompt = result["text"]
            print(f'HEARD: {prompt}')
            #prompt = r.recognize_google(audio)
            isQuestionForAI = False # 'yes' in query(f'Does the following sound like a question for an AI (please answer "yes" or "no"): {prompt}').lower()
            isAutomation = True # 'yes' in query(f'{description} Does the following have something to do with turning on or off the lights in the house or with it being too dim or to bright in the room (please answer "yes" or "no"): {prompt}').lower()
            if isQuestionForAI or isAutomation:
                if isAutomation:
                    print('AUTOMATION-RELATED')
                    automation(prompt, '2:43pm')
                else:
                    response = query(prompt)
                    print(f'RESPONSE: {response}')
                    say(response)
            else:
                print(f'NOT FOR ME: {prompt}')

        except Exception as e:
            print(f'ERROR: {e}')
            print('I didn\'t catch that')
main()