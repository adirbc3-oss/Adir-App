import base64
import os

with open('logo.png', 'rb') as f:
    b = base64.b64encode(f.read()).decode('utf-8')

os.makedirs('src/assets', exist_ok=True)
with open('src/assets/logoBase64.js', 'w') as f:
    f.write(f'export const logoBase64 = "data:image/png;base64,{b}";\n')
