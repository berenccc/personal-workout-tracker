import Capacitor
import WidgetKit

/// Мост из веб-приложения: сохраняет сводку тренировок в общее хранилище
/// App Group, откуда её читает виджет, и просит iOS обновить виджеты.
///
/// ВАЖНО: замени "group.com.trainy.app" на свой App Group id
/// (он должен совпадать здесь, в TrainyWidget.swift и в настройках обоих таргетов).
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setWidgetData", returnType: CAPPluginReturnPromise)
    ]

    static let appGroupId = "group.com.trainy.app"

    @objc func setWidgetData(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        let defaults = UserDefaults(suiteName: WidgetBridgePlugin.appGroupId)
        defaults?.set(json, forKey: "widgetData")

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
