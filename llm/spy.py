from openai import OpenAI

client = OpenAI()



def query(prompt):
    completion = client.chat.completions.create(model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}])
    return completion.choices[0].message.content

description = '''
    We are in a room with a bed, with gray striped covers, a black electric blanket, pink
    pillows, and a gray fuzzy pillow. To the left of the bed (when facing it) is a dresser
    used as a nightstand with all kinds of junk on it: rubik's cubes, a black reading lamp,
    a white reading lamp, a lego calendar, a kleenex box, a gun safe, lots of books, a
    passport, a pile of clothes, glasse, AirPods, a pill despenser, eyedrops. There is another
    night stand on the other side of the bed with a zebra lamp, glasses, another pill despenser,
    a pile of books, a medicine bottle. There are two book short bookcases with books: the
    Feynman physics lectures, Tuva or bust, Surely You're joking Mr. Feynman, and other
    Feynman books. There are autobiographies like Elton John. There is a plant on top of one
    of them, some chocolates, a clock, a Alexa Echo Dot. On the other one is another zebra
    lamp, a Siri Apple Homepod. There are photos of Greece on the wall: one of Mykonos and one
    of the acropolis in Athens. There are bamboo sticks standing in the corner. There are
    lots of selfie photos of Tracey and Ashley o the wall. There is a chaise lounge reading
    chair with blankets and pillows and clothes piled on it. There is an entertainment
    center that is closed, with a stuffed zebra and a stuffed bear on top, and a plastic
    3D printed gear-heart, and a photo of Tracey and Ashley at the Venitian in Las Vebas and
    at the Willis Tower in Chicago. There is a dresser with a battery charger, a book end, some
    manilla folders and a Nest temperature sensor on top. There is a tall white floor lamp (which
    you can offer to turn on, by the way). There is a second smaller dresser with a red
    Leica camera, some black speakers, and a book on top. On the floor by the left night stand
    is a backpack with radio equipment in it (an antenna sticking out). A laptop, a camera
    bag.
    '''

conversation = 'Me: Pick an object and give me my first hint.'

def play():
    global conversation
    game = '''
        Let's play a game of "I spy". You pick an object from the room and give me clues
        to help me guess what it is. Let me know when I've guessed correctly. For example,
        you could say, "I spy with my little eye, something colorful." and I might respond
        with, "Is is plastic" and you might say "Yes, it's plastic" and I might guess, "Is
        it a Rubik's cube" and you'd say, "Yep!". That's how the game goes.

        I want you to make it as hard as possible! Each time I make a guess, you try may
        pick a new object that makes sense given the whole conversation so far but even if
        I guess correctly, try to find a different object that still makes sense.
        '''
    clue = query(f'''
        {description}
        {game}
        Here is our conversation so far:
        {conversation}
        What do you say next?
        ''')
    conversation += f'\nYou: {clue}'
    print(f'{clue}')

while True:
    play()
    guess = input('Make a guess:')
    conversation += f'\nMe: {guess}'