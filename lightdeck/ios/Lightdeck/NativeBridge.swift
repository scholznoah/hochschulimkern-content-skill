import WebKit

/// JS <-> Swift: window.lightdeckNative.call(method, params) returns a Promise, native events arrive via on(name, fn).
final class NativeBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private let ble = BleController()

    override init() {
        super.init()
        ble.emit = { [weak self] name, data in self?.emit(name, data) }
    }

    static let shim = """
    window.lightdeckNative = {
      _id: 0, _p: {}, _l: {},
      call(method, params) { return new Promise((resolve, reject) => { const id = ++this._id; this._p[id] = { resolve, reject };
        window.webkit.messageHandlers.native.postMessage({ id, method, params: params || {} }); }); },
      on(name, fn) { (this._l[name] = this._l[name] || []).push(fn); },
      _reply(id, ok, value) { const p = this._p[id]; delete this._p[id]; if (p) (ok ? p.resolve(value) : p.reject(new Error(value))); },
      _emit(name, data) { (this._l[name] || []).forEach((f) => f(data)); }
    };
    """

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let id = body["id"] as? Int, let method = body["method"] as? String else { return }
        let params = body["params"] as? [String: Any] ?? [:]
        Task { @MainActor in
            do { reply(id, ok: true, value: try await ble.handle(method, params)) }
            catch { reply(id, ok: false, value: error.localizedDescription) }
        }
    }

    @MainActor private func reply(_ id: Int, ok: Bool, value: Any) { js("window.lightdeckNative._reply(\(id), \(ok), \(Self.json(value)))") }
    private func emit(_ name: String, _ data: [String: Any]) { DispatchQueue.main.async { self.js("window.lightdeckNative._emit(\(Self.json(name)), \(Self.json(data)))") } }
    private func js(_ s: String) { webView?.evaluateJavaScript(s, completionHandler: nil) }

    static func json(_ v: Any) -> String {
        if v is NSNull { return "null" }
        let wrapped = JSONSerialization.isValidJSONObject(v) ? v : [v]
        guard let d = try? JSONSerialization.data(withJSONObject: wrapped), var s = String(data: d, encoding: .utf8) else { return "null" }
        if !JSONSerialization.isValidJSONObject(v) { s = String(s.dropFirst().dropLast()) }
        return s
    }
}
