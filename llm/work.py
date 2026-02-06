from openai import OpenAI

client = OpenAI()



currentState = {
    'Remote1': ['Rick Gutierrez', 'Andy Wilson', 'Richard Hughes'],
    'Remote2': ['Sean Rintel', 'Ashley Feniello'],
    'Remote3': ['John Tang'],
    'Remote4': [],
    'Fake': ['Sasa Junuzovic', 'Quanquin Qi', 'Kori Inkpen']}

def describeState(state):
    def seat(id): return ', '.join(state[id])
    return f'''
        Curently seated at each screen are:
        Remote1: {seat('Remote1')}
        Remote2: {seat('Remote2')}
        Remote3: {seat('Remote3')}
        Remote4: {seat('Remote4')}
        Fake: {seat('Fake')}
    '''

def find(name):
    for loc in currentState:
        if name in currentState[loc]:
            return loc
    return None

def seat(name, location):
    current = find(name)
    if current is not None and name not in currentState[location]:
        print(f"seat('{name}', '{location}') # move {name} from {current} to {location}")
        currentState[current].remove(name)
        currentState[location].append(name)
    elif name not in currentState[location]:
        print(f"seat('{name}', '{location}') # seat {name} at {location}")
        currentState[location].append(name)

def unseat(name):
    current = find(name)
    if current is not None:
        print(f"unseat('{name}') # unseat {name} from {current}")
        currentState[current].remove(name)

def query(prompt):
    completion = client.chat.completions.create(model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}])
    return completion.choices[0].message.content

def automation(prompt):
    context = f'''
        We are in a conference room having a meeting, but many of the attendees are remote.
        The remote people show up on screens around the table. Multiple people may be on one
        screen; up to four per screen maximum. We call this "seating" an attendee at a screen.
        There is very large screen in in the front, which is not used for seating. Instead it
        is exclusively for presentations. A tall screen to the left of the big screen is mainly
        used for presenters to be "seated" while presenting on the big screen, but this screen
        may also be used to seat regular attendees if there isn't room elsewhere. Three other
        screens are at the back of the room, opposite to the big and the tall screens. Each are
        the same size and are meant as "seats" for remote attendees.

        We call the tall screen at the front, to the left of the big screen, the "presenter screen"
        and it's identifier is "Remote4". The three screens in the back are referred to as
        "left", "middle", and "right" as if facing the the back of the room. The left one's
        identifier is "Remote1". The middle one's identifier is "Remote2" and the right one is
        "Remote3".'''

    instructions = '''
        When people are in the roster who are not "seated", they should be moved to a seat.
        Preferably, to a screen with the least number of people while avoiding the presenter
        screen unless everything else is full. When people are in a "seat" but no longer in
        the roster, then they should be removed from a screen. If people are in the roster
        and also physically in the room, they should not be "seated" at a screen. Instead,
        they should be placed in a fake seat with the identifier "Fake", unless they are already
        there. People may also move around during the meeting, in which case they should be
        removed from whatever screen they're on and placed at a new one. People should never
        be seated in two places at once. If a person is already seated where they should be,
        there is no need to do anything. If everyone from the roster is in a seat and nobody
        is in a seat who is not in the roster, then nothing needs to be done.
        However, DO NOT do any of this unless explicitly asked to.
        '''

    tools = '''
        Pretend that you have access to Python APIs to control the seating.
        You can move people to a seat with a function such as seat('Ashley Feniello',
        'Remote1') or seat('Joe Blow', 'Remote4') or seat('Jane Doe', 'Fake'). You can
        remove people from whatever seat they're in with a function such as
        unseat('Fred Flintstone') or unseat('Joseph Blow').'''

    remote = '''
        The following people are the remote roster:
            Ashley Feniello, Rick Gutierrez, Richard Hughes, Quanquin Qi, Sasa Junuzovic,
            Andy Wilson, Payod Panda, Pat Sweeney, Kori Inkpen, Abigail Sellen, Ann Paradiso,
            John Tang, Sean Rintel, Bala Kumaravel
        '''

    local = '''
        The following people are physically in the room:
            Sasa Junuzovic
            Kori Inkpen
            Quanquin Qi
        '''

    print('-- PROMPT ----------------------------------------------------------')
    print(prompt)
    print()

    response = query(f'''
        {context} {instructions} {remote} {local} {describeState(currentState)} {tools}
        I'm explicitly asking now, please {prompt} by calling functions and describe what you've done.''')
    print('-- RESPONSE ----------------------------------------------------------')
    print(response)

    code = query(f'Please extract just the code from this: {response}')
    #print('-- CODE --------------------------------------------------------------')
    #print(code)

    print('-- EXEC --------------------------------------------------------------')
    for line in code.splitlines():
        try:
            exec(line.strip())
        except Exception as e:
            #print(f'ERROR: {repr(e)}')
            None

    print('-- STATE -------------------------------------------------------------')
    print(describeState(currentState))

    #human = query(f'''
    #    Please extract just the part meant for humans (without including any mention of the
    #    code) from this: {response}''')
    #print('-- HUMAN -------------------------------------------------------------')
    #print(human)

print('-- BEFORE ------------------------------------------------------------')
print(describeState(currentState))

#automation('Put Rick on the presenter screen')
#automation('Rick is done presenting. Please reseat him.')
#automation('Put Ashley on the back left screen')
#automation('Rebalance the number of attendees on each screen')
#automation('Put people in the room in the fake seat')
#automation('Opps, Quanquin needs to move to the fake seat and Panda is going to present now.')
#automation('The meeting is over. Please unseat everyone.')
automation('Put John on the middle screen and Ashley on the back right one')