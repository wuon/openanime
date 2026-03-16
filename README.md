<img src="./assets/openanime-logo.png" width="128"/>

# Openanime

![GitHub Downloads (all assets, latest release)](https://img.shields.io/github/downloads/wuon/openanime/latest/total)
![GitHub Release](https://img.shields.io/github/v/release/wuon/openanime)

https://github.com/user-attachments/assets/77b137a0-8359-4970-94d8-20127b410c40

Experience [pystardust/ani-cli](https://github.com/pystardust/ani-cli) as a easy to use desktop application. OpenAnime bridges the gap between the command line and a modern UI, offering a streamlined, traditional viewing experience for every anime fan.

[Features](#features) |
[Installation](#installation) |
[License](#license)

## Features

- Stay up to date with the most recently uploaded anime
- Browse and search for a specific anime series
- More coming soon! Have a suggestion? [Create an issue](https://github.com/wuon/openanime/issues)

## Installation

### OSX

[![OSX - Download](https://img.shields.io/badge/OSX-download-blue)](https://github.com/wuon/openanime/releases/download/v0.0.1-alpha/Openanime-darwin-arm64-0.0.1-alpha.zip)

Since the application is not signed or notarized, you will have to perform this command via terminal

```bash
xattr -cr /Applications/Openanime.app
```

**Why do I need to do this?**

When you download an app from outside the App Store, macOS attaches a com.apple.quarantine attribute to it. If the app isn't digitally signed correctly, Gatekeeper may block it. Running xattr -cr on the application folder wipes those security flags, essentially "tricking" macOS into thinking the file was created locally rather than downloaded, allowing it to run.

## License

[GPL-3.0](https://github.com/wuon/openanime?tab=GPL-3.0-1-ov-file)
