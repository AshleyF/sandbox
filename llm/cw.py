from openai import OpenAI

client = OpenAI()

def query(prompt):
    completion = client.chat.completions.create(model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}])
    return completion.choices[0].message.content

def automation(prompt):
    context = f'''
        You are sending and receiving CW Morse Code over an HF ham radio transciever.
        The Morse Code is converted to text and provided.
        Text messages can be sent back and will be keyed as Morse Code.
        Please help with formulating messages using standard or common
        CW operator abbreviations and slang.

        Your callsign is K7ZCW. You live in Deer Park, Washington. You have a rig that is
        an Icom 705 or an Icom 7300 or a Mountain Topper Mtr4b and go by the name Ash on
        the air.

        Pretend that you have access to Python APIs to send a CW message over the radio.
        For example, you can call sent('K7ZCW') to send the callsign. Call send('RR UR 55N 55N <BK>')
        to respond with a signal report, etc. You can also call stop() to end the conversation,
        when appropriate; perhaps after sending a final send('EE') as a "dit dit" salutation.
        '''

    print('-- PROMPT ----------------------------------------------------------')
    print(prompt)
    print()

    response = query(f'''
        {context}
        The conversation so far has gone: {prompt}.
        Each line is a reply to the previous line.
        What should you send next?
        Generate a function call to send the single next line response or
        to stop the conversation.
        ''')
    print('-- RESPONSE ----------------------------------------------------------')
    print(response)

#automation('''
#    CQ CQ POTA DE K6SWR K6SWR K
#    R R UR 599 599 IN DEER PARK WA
#    R R FB OM TKS FER CALL UR RST HERE IS 579 579 IN CA
#    TU K6SWR, UR RST IS 579 ALSO. QTH IS DEER PARK WA. NAME IS ASH. HW CPY?
#    FB ASH, CPY UR 559 559 IN CA. PWR IS 100W INTO VERTICAL HERE. NAME IS BOB. HW?
#    QSL BOB, UR 559 IN CA. MY PWR IS 5W TO AN END FED WIRE. TNX FER QSO. 73 DE K7ZCW SK
#    NAME IS ASH, OP IN DEER PARK WA. HW?
#    MY RIG IS ICOM 7300. HW ABT U?
#    ''')
automation('''
    CQ CQ POTA DE KK7HXU
    K7ZCW DE KK7HXU, HI OM, UR 599 599 IN DEER PARK, WA. NAME ASH. HW CPY?
    KK7HXU DE K7ZCW, UR ALSO 599 599 INTO STATIONARY MOBILE IN NAVAL AIR STATION WHIDBEY ISLAND, WA. MY PWR 5W, ANT INV VEE UP 7M. TNX FER QSO. 73 ES GL OM.
    ''')