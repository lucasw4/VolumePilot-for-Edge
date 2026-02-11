# VolumePilot for Edge

Control audio across tabs in your current Microsoft Edge window with a clean, fast popup. Adjust volume from `0%` to `200%`, mute instantly, halve volume in one click, or reset to `100%`. New tabs inherit your current settings automatically, and your last-used preferences are saved between sessions.

## Features
- Volume slider (`0%` to `200%`)
- One-click mute/unmute behavior
- Quick `1/2` volume action
- Quick reset to `100%`
- Per-window tab audio control
- Auto-apply to newly opened tabs in controlled windows
- Persistence of last-used settings between sessions

## Permissions
- `tabs`: enumerate tabs in the current window and apply audio controls.
- `storage`: persist last-used volume and mute state.
- `scripting`: apply media element volume/mute control in pages.
- `tabCapture`: fallback audio control path for capturable tabs.
- `offscreen`: run Web Audio processing in an offscreen document.
- `<all_urls>` host permission: required to control audio on regular websites across tabs.

## Install in Microsoft Edge (Unpacked)
1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Usage
1. Click the extension icon in the Edge toolbar.
2. Adjust the slider to control volume for tabs in the current window.
3. Use mute, half, or reset buttons for quick actions.

## Limitations
- This extension does **not** control Windows system mixer volume for the Edge process.
- Restricted pages (for example `edge://` and extension pages) cannot be controlled.

## License
No license file is currently included. All rights reserved by default.
