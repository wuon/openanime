<img src="./assets/openanime-logo.png" width="128"/>

# Openanime

![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/wuon/openanime/total)
![GitHub Release](https://img.shields.io/github/v/release/wuon/openanime)

[Features](#features) |
[Installation](#installation) |
[License](#license)

https://github.com/user-attachments/assets/14a3e2e0-3b84-46bb-9b61-546adb8e23a2

Experience [pystardust/ani-cli](https://github.com/pystardust/ani-cli) as a easy to use desktop application. Openanime bridges the gap between the command line and a modern UI, offering a streamlined, traditional viewing experience for every anime fan.

## Features

- Stay up to date with the most recently uploaded anime
- Browse and search for a specific anime series
- More coming soon! Have a suggestion? [Create an issue](https://github.com/wuon/openanime/issues)

## Installation

### Windows (Experimental)

[![Windows - Download](https://img.shields.io/badge/Windows-download-blue)](https://github.com/wuon/openanime/releases/download/v1.0.0-alpha/Openanime-1.0.0-alpha.Setup.exe)

This should work right out of the box, but if it doesn't feel free to [report an issue](https://github.com/wuon/openanime/issues)!

### OSX

[![OSX - Download](https://img.shields.io/badge/OSX-download-blue)](https://github.com/wuon/openanime/releases/download/v1.0.0-alpha/Openanime-darwin-arm64-1.0.0-alpha.zip)

Since the application is not signed or notarized, you will have to perform this command via terminal

```bash
xattr -cr /Applications/Openanime.app
```

**Why do I need to do this?**

When you download an app from outside the App Store, macOS attaches a com.apple.quarantine attribute to it. If the app isn't digitally signed correctly, Gatekeeper may block it. Running xattr -cr on the application folder wipes those security flags, essentially "tricking" macOS into thinking the file was created locally rather than downloaded, allowing it to run.

### Linux (Experimental)

[![.rpm - Download](https://img.shields.io/badge/.rpm-download-blue)](https://github.com/wuon/openanime/releases/download/v1.0.0-alpha/Openanime-1.0.0-alpha-1.x86_64.rpm)
[![.deb - Download](https://img.shields.io/badge/.deb-download-blue)](https://github.com/wuon/openanime/releases/download/1.0.0-alpha/openanime_1.0.0-alpha_amd64.deb)

Unfortunately I haven't had time to optimize for Linux. Please let me know if anything is broken by [reporting an issue](https://github.com/wuon/openanime/issues)!

## License

[GPL-3.0](https://github.com/wuon/openanime?tab=GPL-3.0-1-ov-file)
