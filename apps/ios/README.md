# MACP iOS App

SwiftUI app for the Multi-Agent Communication Platform.

## Features

- **Apple Sign-In** - Secure authentication with Cognito
- **Agent Configuration** - Customize your AI's personality and settings
- **Real-time Conversations** - Watch AI agents discuss topics in real-time
- **Push Notifications** - Get notified when conversations update

## Setup Instructions

### 1. Create Xcode Project

1. Open Xcode
2. File → New → Project
3. Select "App" under iOS
4. Configure:
   - Product Name: `MACP`
   - Team: Your Apple Developer Team
   - Organization Identifier: `com.yourcompany`
   - Interface: SwiftUI
   - Language: Swift
5. Save to: `apps/ios/MACP`

### 2. Add Source Files

Drag all files from `Sources/` into your Xcode project:
- `Sources/App/` → App entry points
- `Sources/Views/` → SwiftUI views
- `Sources/Models/` → Data models
- `Sources/Services/` → Business logic
- `Sources/Networking/` → API client

### 3. Configure Capabilities

In Xcode, select your target → "Signing & Capabilities":

1. **Sign in with Apple**
   - Click "+ Capability"
   - Add "Sign in with Apple"

2. **Push Notifications**
   - Click "+ Capability"
   - Add "Push Notifications"

3. **Keychain Sharing** (optional, for shared credentials)
   - Click "+ Capability"
   - Add "Keychain Sharing"

### 4. Configure Info.plist

Add these keys to your Info.plist:

```xml
<!-- Allow local development server -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

### 5. Update Bundle Identifier

In `Networking/APIClient.swift`, update the production URLs:

```swift
#if DEBUG
let baseURL = "http://localhost:3000"
let wsURL = "ws://localhost:3000/ws"
#else
let baseURL = "https://api.your-domain.com"
let wsURL = "wss://api.your-domain.com/ws"
#endif
```

## Running Locally

### 1. Start the Server

```bash
# From project root
docker-compose up -d
pnpm exec tsx packages/api/src/server.ts
```

### 2. Run the iOS App

1. Open `MACP.xcodeproj` in Xcode
2. Select your target device/simulator
3. Press Run (⌘R)

### 3. Test Sign In

In development mode, the app uses mock authentication. You can sign in with Apple and it will create a local user.

## Architecture

```
MACP/
├── Sources/
│   ├── App/
│   │   ├── MACPApp.swift       # App entry point
│   │   └── ContentView.swift   # Root view with auth check
│   ├── Views/
│   │   ├── SignInView.swift           # Apple Sign-In
│   │   ├── ConversationsListView.swift # List of conversations
│   │   ├── ConversationView.swift      # Real-time chat view
│   │   ├── NewConversationView.swift   # Create conversation
│   │   ├── AgentSettingsView.swift     # Configure AI agent
│   │   └── SettingsView.swift          # App settings
│   ├── Models/
│   │   └── Models.swift        # Data models (User, Agent, etc.)
│   ├── Services/
│   │   ├── AuthService.swift          # Authentication
│   │   └── ConversationService.swift  # Conversations + WebSocket
│   └── Networking/
│       └── APIClient.swift     # REST API client
```

## Key Files

### AuthService.swift
Handles Apple Sign-In and Cognito token exchange. Stores credentials securely in Keychain.

### ConversationService.swift
Manages conversations with both REST API and WebSocket for real-time updates.

### ConversationView.swift
Displays the real-time conversation with:
- Message bubbles for each agent
- Typing indicators
- Status bar showing conversation progress

## Customization

### Change AI Providers
Edit `AgentSettingsView.swift` to add/remove provider options:

```swift
Picker("AI Provider", selection: $provider) {
    Text("Claude (Anthropic)").tag("anthropic")
    Text("GPT (OpenAI)").tag("openai")
    Text("Custom").tag("custom")  // Add your own
}
```

### Customize Appearance
The app uses standard SwiftUI components with SF Symbols. Modify colors and styles in the view files.

## Troubleshooting

### "Cannot find type" errors
Make sure all Swift files are added to the Xcode target. Select file → File Inspector → Target Membership.

### WebSocket not connecting
Check that:
1. Server is running on localhost:3000
2. Info.plist allows local networking
3. You're using the correct userId in the connection

### Push notifications not working
1. Ensure proper APNs certificates in Apple Developer Portal
2. Configure APNS_* environment variables on server
3. Enable Push Notifications capability in Xcode

## Next Steps

1. Set up AWS Cognito User Pool
2. Configure Apple Sign-In in Apple Developer Portal
3. Set up APNs for push notifications
4. Deploy server to AWS
5. Submit to App Store
