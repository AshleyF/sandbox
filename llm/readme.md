pip install openai
pip install pyaudio

brew install portaudio
https://stackoverflow.com/questions/68251169/unable-to-install-pyaudio-on-m1-mac-portaudio-already-installed

pip install pyttsx3

pip install -U openai-whisper

## Example 1

-- BEFORE ------------------------------------------------------------

        Curently seated at each screen are:
        Remote1: Rick Gutierrez, Andy Wilson, Richard Hughes
        Remote2: Sean Rintel, Ashley Feniello
        Remote3: John Tang
        Remote4: 
        Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen
    
-- PROMPT ----------------------------------------------------------
Put Rick on the presenter screen

-- RESPONSE ----------------------------------------------------------

Sure, to put Rick Gutierrez on the presenter screen, I would call the `unseat()` function to remove him from wherever he is seated currently. If he is not seated, then nothing will happen. Then, I would call the `seat()` function to seat him at the presenter screen with the identifier "Remote4" using the following code:

```
unseat('Rick Gutierrez')
seat('Rick Gutierrez', 'Remote4')
```

After running this code, Rick Gutierrez would be moved from his current seat to the presenter screen.

-- EXEC --------------------------------------------------------------
unseat('Rick Gutierrez') # unseat Rick Gutierrez from Remote1
seat('Rick Gutierrez', 'Remote4') # seat Rick Gutierrez at Remote4
-- STATE -------------------------------------------------------------

        Curently seated at each screen are:
        Remote1: Andy Wilson, Richard Hughes
        Remote2: Sean Rintel, Ashley Feniello
        Remote3: John Tang
        Remote4: Rick Gutierrez
        Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen
    
-- PROMPT ----------------------------------------------------------
Rick is done presenting. Please reseat him.
-- RESPONSE ----------------------------------------------------------

Sure, to reseat Rick Gutierrez, I will first check which screen has the least number of people and is not the presenter screen (Remote4). From the current seating arrangement, it looks like Remote1 has two people seated and Remote3 has one person seated. So, I will call the function seat('Rick Gutierrez', 'Remote3') to move him from the presenter screen to Remote3 screen.

After making the seating changes, the new seating arrangement will be:
        Remote1: Andy Wilson, Richard Hughes
        Remote2: Sean Rintel, Ashley Feniello
        Remote3: John Tang, Rick Gutierrez
        Remote4: (empty)
        Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen

Note that Sasa Junuzovic, Quanquin Qi, and Kori Inkpen are still in the fake seat as they are physically present in the room. Also, no one was removed from any screen as everyone from the roster is still in a seat.

-- EXEC --------------------------------------------------------------
seat('Rick Gutierrez', 'Remote3') # move Rick Gutierrez from Remote4 to Remote3
-- STATE -------------------------------------------------------------

        Curently seated at each screen are:
        Remote1: Andy Wilson, Richard Hughes
        Remote2: Sean Rintel, Ashley Feniello
        Remote3: John Tang, Rick Gutierrez
        Remote4: 
        Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen

## Example 2

-- BEFORE ------------------------------------------------------------

        Curently seated at each screen are:
        Remote1: Rick Gutierrez, Andy Wilson, Richard Hughes
        Remote2: Sean Rintel, Ashley Feniello
        Remote3: John Tang
        Remote4: 
        Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen
    
-- PROMPT ----------------------------------------------------------
Opps, Quanquin needs to move to the fake seat and Panda is going to present now.

-- RESPONSE ----------------------------------------------------------


Okay, here is what I have done:

1. Call the `unseat()` function to remove Sasa Junuzovic, Quanquin Qi, and Kori Inkpen from the fake seat:
```
unseat('Sasa Junuzovic')
unseat('Quanquin Qi')
unseat('Kori Inkpen')
```

2. Seat Quanquin Qi to the fake seat:
```
seat('Quanquin Qi', 'Fake')
```

3. As Panda is going to present now, I will move everyone from the presenter screen (Remote4) to other screens:
```
unseat('Ashley Feniello')
unseat('Rick Gutierrez')
unseat('Richard Hughes')
```

4. Move Ashley Feniello, Rick Gutierrez, and Richard Hughes to Remote1:
```
seat('Ashley Feniello', 'Remote1')
seat('Rick Gutierrez', 'Remote1')
seat('Richard Hughes', 'Remote1')
```

5. Finally, seat Payod Panda to the presenter screen (Remote4):
```
seat('Payod Panda', 'Remote4')
```

Now, the seating arrangement should be as follows:

```
Remote1: Ashley Feniello, Rick Gutierrez, Richard Hughes
Remote2: Sean Rintel, Andy Wilson, 
Remote3: John Tang
Remote4: Payod Panda
Fake: Quanquin Qi, Kori Inkpen
```
-- EXEC --------------------------------------------------------------
unseat('Sasa Junuzovic') # unseat Sasa Junuzovic from Fake
unseat('Quanquin Qi') # unseat Quanquin Qi from Fake
unseat('Kori Inkpen') # unseat Kori Inkpen from Fake
seat('Quanquin Qi', 'Fake') # seat Quanquin Qi at Fake
unseat('Ashley Feniello') # unseat Ashley Feniello from Remote2
unseat('Rick Gutierrez') # unseat Rick Gutierrez from Remote1
unseat('Richard Hughes') # unseat Richard Hughes from Remote1
seat('Ashley Feniello', 'Remote1') # seat Ashley Feniello at Remote1
seat('Rick Gutierrez', 'Remote1') # seat Rick Gutierrez at Remote1
seat('Richard Hughes', 'Remote1') # seat Richard Hughes at Remote1
seat('Payod Panda', 'Remote4') # seat Payod Panda at Remote4
-- STATE -------------------------------------------------------------

        Curently seated at each screen are:
        Remote1: Andy Wilson, Ashley Feniello, Rick Gutierrez, Richard Hughes
        Remote2: Sean Rintel
        Remote3: John Tang
        Remote4: Payod Panda
        Fake: Quanquin Qi

## Example 3

-- PROMPT ----------------------------------------------------------
Put John on the middle screen and Ashley on the back right one

-- RESPONSE ----------------------------------------------------------


To seat John Tang on the middle screen, we can call the function seat('John Tang', 'Remote2') which will remove him from his current screen (Remote3) and move him to the middle screen (Remote2).

To seat Ashley Feniello on the back right screen, we can call the function seat('Ashley Feniello', 'Remote3') which will remove her from her current screen (Remote1) and move her to the back right screen (Remote3).

After executing these commands, the seating will be as follows:

Remote1: Rick Gutierrez, Andy Wilson, Richard Hughes
Remote2: Sean Rintel
Remote3: Ashley Feniello, John Tang
Remote4: 
Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen
-- EXEC --------------------------------------------------------------
seat('John Tang', 'Remote2') # move John Tang from Remote3 to Remote2
seat('Ashley Feniello', 'Remote3') # move Ashley Feniello from Remote2 to Remote3
-- STATE -------------------------------------------------------------

        Curently seated at each screen are:
        Remote1: Rick Gutierrez, Andy Wilson, Richard Hughes
        Remote2: Sean Rintel, John Tang
        Remote3: Ashley Feniello
        Remote4: 
        Fake: Sasa Junuzovic, Quanquin Qi, Kori Inkpen

## CW

    K6SWR DE K7ZCW, HI ASH HERE IN DEER PARK, WA. PSE QSO INFO
    RIG IS IC-705 OR IC-7300 OR MTR4B. NAME HERE IS TOM. NW QRU
    TNX OM. MY RIG IS IC-705 AND QTH IS DEER PARK, WA. OP NAME IS ASH. UR RST IS 599. HW CPY?
    FB TNX ASH UR RST ALSO 599. QTH NEAR TACOMA, WA. WX SUNNY AND WARM. HW CPY?
    WX HR CLOUDY & COOL. ES QSB. HW FB CPY?
    SRI OM QSB HR ALSO. GL ES 73
    73 OM ES TNX FER QSO. UR RST 599 NW QRT?
    FB OM TNX FER QSO. UR RST 599 ALSO. QTH DEER PARK, WA. WX COOL BUT CLEAR. HW CPY?
    WX HR NICE & WARM. HI TEMP 75F. HW CPY?
    QRZ DE K7ZCW
    WX HR COOL BUT NO RAIN. HW CPY?
    COPY FB OM QRZ?
    WX HERE ALSO COOL BUT NO RAIN. TNX FER QSO OM. 73
    OK TNX FER FB QSO. ESPE FB WX RPT. 73 DE K7ZCW SK
    TNX FER QSO K6SWR. GL ES 73
    K6SWR DE K7ZCW
    R R UR 599 599 IN DEER PARK WA
    HW CPY?
    K6SWR PSE QRS
    K6SWR QRS PSE

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