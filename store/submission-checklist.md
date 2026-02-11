# Edge Add-ons Submission Checklist

## Package
- [ ] `manifest.json` is valid JSON and uses `manifest_version: 3`
- [ ] Version is set correctly for this submission
- [ ] All manifest file references resolve (`background`, `popup`, `offscreen`, icons)
- [ ] Extension can be loaded unpacked in Edge without runtime errors

## Listing Metadata
- [ ] Name: `VolumePilot for Edge`
- [ ] Category: `Tools`
- [ ] Visibility: `Public`
- [ ] Markets: `All markets`
- [ ] Short description entered (`store/short-description.txt`)
- [ ] Full description entered (`store/full-description.txt`)
- [ ] Release notes entered (`store/release-notes-v1.0.0.txt`)

## Privacy and Support
- [ ] Privacy declaration set to no personal data collection/transmission
- [ ] Support contact set to GitHub issues URL
- [ ] Permissions rationale ready (`store/permissions-rationale.txt`)

## Assets
- [ ] App icons uploaded (16/32/48/128 in repo; 128 used for listing icon)
- [ ] At least 3 store screenshots prepared and uploaded

## Final Verification
- [ ] Core functionality verified (volume, mute/unmute, half, reset)
- [ ] Works across multiple tabs in current window
- [ ] Restricted pages fail gracefully
- [ ] Submission package created and uploaded
