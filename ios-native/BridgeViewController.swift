import UIKit
import Capacitor

/// Регистрирует кастомный плагин WidgetBridge.
/// В Xcode открой Main.storyboard, выбери Bridge View Controller
/// и в Identity Inspector поставь Custom Class = BridgeViewController.
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
