import os
import asyncio

# pip install python-kasa

async def kasaBulb(bulb, on):
    if on: os.system('kasa --host 192.168.4.193 --type plug on')
    else: os.system('kasa --host 192.168.4.193 --type plug off')

def main():
    asyncio.run(kasaBulb('living', True))
    asyncio.run(kasaBulb('living', False))

main()
