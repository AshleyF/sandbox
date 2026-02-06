import asyncio
from kasa import SmartBulb, SmartPlug

async def control_bulb_example():
    # Connect to a smart bulb
    bulb = SmartBulb('192.168.4.204')
    await bulb.update()  # Fetch current state
    
    print(f"Bulb alias: {bulb.alias}")
    print(f"Is on: {bulb.is_on}")
    print(f"Brightness: {bulb.brightness}")
    
    # Turn on/off
    await bulb.turn_on()
    await bulb.turn_off()
    
    # Set brightness (1-100)
    await bulb.set_brightness(75)
    
    # Set color (if color bulb)
    if bulb.is_color:
        await bulb.set_hsv(120, 50, 75)  # Green with 50% saturation, 75% brightness
        await bulb.set_color_temp(3000)  # Warm white

async def control_plug_example():
    # Connect to a smart plug
    plug = SmartPlug('192.168.4.175')
    await plug.update()
    
    print(f"Plug alias: {plug.alias}")
    print(f"Is on: {plug.is_on}")
    
    # Turn on/off
    await plug.turn_on()
    await plug.turn_off()

# Improved version of your kasaBulb function
async def improved_kasa_bulb(room, name, on):
    devices = {
        ('living', 'tall1'): ('192.168.4.175', 'plug'),
        ('living', 'tall2'): ('192.168.4.193', 'plug'), 
        ('living', 'reading'): ('192.168.4.204', 'bulb'),
        ('bedroom', 'floor'): ('192.168.4.185', 'plug')
    }
    
    key = (room.lower(), name.lower())
    if key in devices:
        ip, device_type = devices[key]
        
        if device_type == 'bulb':
            device = SmartBulb(ip)
        else:
            device = SmartPlug(ip)
            
        await device.update()
        
        if on:
            await device.turn_on()
        else:
            await device.turn_off()
            
        print(f"{'Turned on' if on else 'Turned off'} {device.alias}")

# Improved color control
async def improved_kasa_color(name, h, s, v):
    if name.lower() in ['overhanging', 'reading', 'black']:
        bulb = SmartBulb('192.168.4.204')
        await bulb.update()
        
        if bulb.is_color:
            await bulb.set_hsv(h, s, v)
            print(f"Set {bulb.alias} to HSV({h}, {s}, {v})")
        else:
            print(f"{bulb.alias} is not a color bulb")

if __name__ == "__main__":
    # Example usage
    asyncio.run(control_bulb_example())
    asyncio.run(improved_kasa_bulb('living', 'reading', True))
    asyncio.run(improved_kasa_color('reading', 240, 100, 50))  # Blue