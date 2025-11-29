> [!IMPORTANT]
> Made with Claude Sonnet 4.5 and Gemini 3
>
> I plan rewriting it manually later.

# Filter Folder Creator - Package & Install

## Package Extension

### Option A: Load Temporary Add-on (Testing)
1. Open Thunderbird
2. Go to `Tools → Developer Tools → Debug Add-ons` (or `about:debugging`)
3. Click "This Thunderbird"
4. Click "Load Temporary Add-on"
5. Select `manifest.json` from your folder
6. Extension loads immediately

### Option B: Create XPI Package (Distribution)
```bash
cd filter-folder-creator
zip -r ../filter-folder-creator.xpi *
```

Install XPI:
1. Thunderbird → Tools → Add-ons and Themes
2. Click gear icon → "Install Add-on From File"
3. Select `filter-folder-creator.xpi`

## Test Extension

### Find msgFilterRules.dat:
1. Tools → Account Settings
2. Select your IMAP account
3. Click "Server Settings"
4. Note the "Local directory" path
5. Navigate to that folder
6. Find `msgFilterRules.dat`

### Test Workflow:
1. Click extension icon in toolbar
2. Select IMAP account from dropdown
3. Upload `msgFilterRules.dat` or copy/paste content
4. Click "Analyze Missing Folders"
5. Review missing folders list
6. Click "Create X Folders"
7. Wait for completion message

## Troubleshooting

- **No accounts showing**: Extension only works with IMAP accounts
- **Parse errors**: Ensure msgFilterRules.dat is from the selected account
- **Creation fails**: Check folder permissions and IMAP server connectivity
- **View logs**: Tools → Developer Tools → Error Console

## Example msgFilterRules.dat Entry

```
name="Move to Project"
enabled="yes"
type="17"
action="Move to folder"
actionValue="imap://user@server.com/Projects/Client-A"
condition="AND (subject,contains,project)"
```

Extension extracts: `Projects/Client-A`