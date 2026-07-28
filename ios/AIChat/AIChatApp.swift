// Colourbox AI — iPhone-skal omkring web-appen.
// Al funktionalitet (login, router-Auto, vidensbase, MCP, voice) deles 1:1
// med https://ai-chat-nine-silk.vercel.app — hver web-deploy opdaterer appen.
import SwiftUI
import WebKit

@main
struct AIChatApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        ChatWebView(url: URL(string: "https://ai-chat-nine-silk.vercel.app")!)
            .background(Color(red: 254 / 255, green: 253 / 255, blue: 253 / 255))
    }
}

struct ChatWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()  // login-cookie overlever genstart

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 254 / 255, green: 253 / 255, blue: 253 / 255, alpha: 1)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        // Mikrofon til voice chat: OS'ets egen tilladelses-dialog vises første
        // gang (NSMicrophoneUsageDescription); derefter giver vi web-appen lov.
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(type == .microphone ? .grant : .deny)
        }

        // target=_blank-links (kilder, licenssider) åbnes i Safari.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }

        // Netværksfejl: vis en enkel dansk fejlside med genindlæs-knap.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let html = """
            <!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width, initial-scale=1'>
            <body style='font-family:-apple-system;display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center;color:#23282E'>
            <div><h2>Ingen forbindelse</h2><p style='color:#7C8085'>Tjek din internetforbindelse.</p>
            <button style='padding:12px 24px;border:none;border-radius:8px;background:#0D68E8;color:#fff;font-size:16px'
            onclick="location.href='\(url.absoluteString)'">Prøv igen</button></div></body>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }

        private var url: URL { URL(string: "https://ai-chat-nine-silk.vercel.app")! }
    }
}
