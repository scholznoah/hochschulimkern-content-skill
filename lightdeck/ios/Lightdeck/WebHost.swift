import SwiftUI
import WebKit

/// Hosts the web app (bundled folders `app` and `src`) in a WKWebView under lightdeck://app/ and
/// exposes `window.lightdeckNative` (see NativeBridge).
struct WebHost: UIViewRepresentable {
    func makeCoordinator() -> NativeBridge { NativeBridge() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "lightdeck")
        config.userContentController.add(context.coordinator, name: "native")
        config.userContentController.addUserScript(WKUserScript(source: NativeBridge.shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.055, green: 0.059, blue: 0.071, alpha: 1)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { web.isInspectable = true }
        context.coordinator.webView = web
        web.load(URLRequest(url: URL(string: "lightdeck://app/index.html")!))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Serves lightdeck://app/<file> from the bundle folder `app`, and lightdeck://app/src/<file> from `src`.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private static let mime: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "json": "application/json", "svg": "image/svg+xml",
        "png": "image/png", "webmanifest": "application/manifest+json",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let base = Bundle.main.resourceURL else { return fail(task) }
        var rel = url.path.removingPercentEncoding ?? url.path
        if rel.hasSuffix("/") || rel.isEmpty { rel += "index.html" }
        let relPath = rel.hasPrefix("/src/") ? String(rel.dropFirst(1)) : "app" + rel
        let file = base.appendingPathComponent(relPath).standardizedFileURL
        guard file.path.hasPrefix(base.path), let data = try? Data(contentsOf: file) else { return respond(task, url: url, status: 404, data: Data("not found".utf8), type: "text/plain") }
        respond(task, url: url, status: 200, data: data, type: Self.mime[file.pathExtension] ?? "application/octet-stream")
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, data: Data, type: String) {
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }
    private func fail(_ task: WKURLSchemeTask) { task.didFailWithError(URLError(.badURL)) }
}
