from PIL import Image
import base64
import os

img = Image.open('logo.png').convert('RGB')
img.save('logo.jpg', format='JPEG')
with open('logo.jpg', 'rb') as f:
    b = base64.b64encode(f.read()).decode('utf-8')

os.makedirs('src/assets', exist_ok=True)
with open('src/assets/logoBase64.js', 'w') as f:
    f.write(f'export const logoBase64 = "data:image/jpeg;base64,{b}";\n')
