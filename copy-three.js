{
  "name": "uav-flight-simulator",
  "version": "1.0.0",
  "description": "Полётный симулятор БПЛА (прототип для чемпионата)",
  "main": "main.js",
  "license": "MIT",
  "scripts": {
    "postinstall": "node scripts/copy-three.js",
    "start": "electron .",
    "dist": "electron-builder --win portable"
  },
  "dependencies": { "three": "0.128.0" },
  "devDependencies": { "electron": "^31.0.0", "electron-builder": "^24.13.3" },
  "build": {
    "appId": "ru.example.uavsim",
    "productName": "UAV-Simulator",
    "files": ["main.js", "index.html", "vendor/**"],
    "win": { "target": "portable" }
  }
}
