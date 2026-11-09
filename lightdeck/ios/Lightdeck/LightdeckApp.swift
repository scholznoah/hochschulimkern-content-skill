import SwiftUI

@main
struct LightdeckApp: App {
    var body: some Scene {
        WindowGroup {
            WebHost()
                .ignoresSafeArea(edges: .bottom)
                .background(Color(red: 0.055, green: 0.059, blue: 0.071))
        }
    }
}
