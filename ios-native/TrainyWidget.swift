import WidgetKit
import SwiftUI

// Виджет Trainy: серия недель, тренировки на этой неделе и следующая тренировка.
// Данные пишет приложение через WidgetBridgePlugin в App Group UserDefaults.
//
// ВАЖНО: appGroupId должен совпадать с WidgetBridgePlugin.swift
// и с App Group, включённым у обоих таргетов в Signing & Capabilities.

private let appGroupId = "group.com.trainy.app"

struct TrainyEntry: TimelineEntry {
    let date: Date
    let streakWeeks: Int
    let weekWorkouts: Int
    let nextDate: String
    let nextFocus: String
}

struct TrainyProvider: TimelineProvider {
    func placeholder(in context: Context) -> TrainyEntry {
        TrainyEntry(date: Date(), streakWeeks: 5, weekWorkouts: 2, nextDate: "пт, 30.08", nextFocus: "Push + лёгкие ноги")
    }

    func getSnapshot(in context: Context, completion: @escaping (TrainyEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TrainyEntry>) -> Void) {
        let refresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [loadEntry()], policy: .after(refresh)))
    }

    private func loadEntry() -> TrainyEntry {
        let defaults = UserDefaults(suiteName: appGroupId)
        let json = defaults?.string(forKey: "widgetData") ?? "{}"
        let data = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]

        return TrainyEntry(
            date: Date(),
            streakWeeks: data["streakWeeks"] as? Int ?? 0,
            weekWorkouts: data["weekWorkouts"] as? Int ?? 0,
            nextDate: data["nextDate"] as? String ?? "",
            nextFocus: data["nextFocus"] as? String ?? "Открой приложение"
        )
    }
}

private let accent = Color(red: 0.78, green: 0.95, blue: 0.20) // лаймовый акцент Trainy
private let cardBackground = Color(red: 0.05, green: 0.05, blue: 0.06)

struct TrainyWidgetView: View {
    var entry: TrainyEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemMedium: medium
        default: small
        }
    }

    var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "flame.fill").foregroundColor(accent).font(.system(size: 13))
                Text("TRAINY").font(.system(size: 11, weight: .heavy)).foregroundColor(.gray)
            }
            Spacer()
            Text("\(entry.streakWeeks)")
                .font(.system(size: 40, weight: .heavy, design: .rounded))
                .foregroundColor(accent)
            Text(weeksLabel(entry.streakWeeks) + " подряд")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white)
            if !entry.nextDate.isEmpty {
                Text("след: \(entry.nextDate)")
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetBackground(cardBackground)
    }

    var medium: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill").foregroundColor(accent).font(.system(size: 13))
                    Text("TRAINY").font(.system(size: 11, weight: .heavy)).foregroundColor(.gray)
                }
                Spacer()
                Text("\(entry.streakWeeks)")
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .foregroundColor(accent)
                Text(weeksLabel(entry.streakWeeks) + " подряд")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
            }

            Divider().background(Color.gray.opacity(0.4))

            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("НА ЭТОЙ НЕДЕЛЕ").font(.system(size: 10, weight: .heavy)).foregroundColor(.gray)
                    Text("\(entry.weekWorkouts) трен.")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("СЛЕДУЮЩАЯ").font(.system(size: 10, weight: .heavy)).foregroundColor(.gray)
                    Text(entry.nextDate.isEmpty ? "не запланирована" : entry.nextDate)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(accent)
                    Text(entry.nextFocus)
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetBackground(cardBackground)
    }

    private func weeksLabel(_ n: Int) -> String {
        let mod10 = n % 10, mod100 = n % 100
        if mod10 == 1 && mod100 != 11 { return "неделя" }
        if (2...4).contains(mod10) && !(12...14).contains(mod100) { return "недели" }
        return "недель"
    }
}

// containerBackground обязателен с iOS 17, для iOS 14-16 — фолбэк.
extension View {
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { color }
        } else {
            padding(2).background(color)
        }
    }
}

struct TrainyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TrainyWidget", provider: TrainyProvider()) { entry in
            TrainyWidgetView(entry: entry)
        }
        .configurationDisplayName("Trainy")
        .description("Серия недель и следующая тренировка.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct TrainyWidgetBundle: WidgetBundle {
    var body: some Widget {
        TrainyWidget()
    }
}
