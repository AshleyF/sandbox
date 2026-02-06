import os, keyboard, string
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = 'hide'
import pygame

pygame.init()
pygame.mixer.init()

def sound(key):
    s = pygame.mixer.Sound(f'sounds/{key}.mp3')
    s.set_volume(0.1)
    return s

keys = list(string.ascii_uppercase) + ['BACKSPACE', 'CAPS LOCK', 'ENTER', 'SPACE']
keySounds = dict(map(lambda k: (k, sound(k)), keys))

print("Leave this running in the background, playing keyboard clicks as you type in any foreground app.")
down = {}
while True:
    event = keyboard.read_event()
    key = event.name.upper()
    if event.event_type == keyboard.KEY_DOWN:
        if not key in down: # ignore repeating
            if key in keySounds: keySounds[key].play()
            else: keySounds['SPACE'].play()
        down[key] = True
    elif key in down: del down[key]