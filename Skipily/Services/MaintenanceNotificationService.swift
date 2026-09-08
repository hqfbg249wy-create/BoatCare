//
//  MaintenanceNotificationService.swift
//  Skipily
//
//  Plan A: Lokale Wartungserinnerungen — reine On-Device-Loesung ohne Backend.
//
//  Plant je faelliger Wartung (manuelle Aufgabe ODER Equipment-Wartungszyklus)
//  zwei lokale Notifications um 09:00 Ortszeit:
//    - eine Vorab-Erinnerung 7 Tage vor Faelligkeit
//    - eine Erinnerung am Faelligkeitstag selbst
//  Bereits erledigte oder in der Vergangenheit liegende Termine werden nicht
//  geplant. Bei jeder Aenderung der Wartungsliste wird komplett neu geplant
//  (nur die eigenen Requests mit Prefix "maint." werden dabei entfernt).
//
//  Remote-Push (Plan B: Provider-Nachrichten + serverseitige Wartungs-Pushes)
//  kommt separat — dieser Service bleibt rein lokal.
//

import Foundation
import UserNotifications

final class MaintenanceNotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = MaintenanceNotificationService()

    private let center = UNUserNotificationCenter.current()
    private let idPrefix = "maint."
    private let preReminderDays = 7
    private let fireHour = 9
    // iOS plant maximal 64 ausstehende Notifications. Wir planen je Wartung 2
    // (Vorab + Faelligkeit), also decken wir die 30 naechsten Faelligkeiten ab.
    private let maxItems = 30

    /// Zuletzt uebergebene Reminder — damit nach dem ersten Erteilen der
    /// Erlaubnis sofort geplant werden kann (beim ersten sync war der Status
    /// noch `notDetermined`).
    private var lastReminders: [Reminder] = []

    private override init() {
        super.init()
        center.delegate = self
    }

    /// Leichtgewichtiges Modell — entkoppelt den Service von den View-Typen.
    struct Reminder {
        let id: UUID
        let title: String       // Equipment- bzw. Aufgabenname
        let boatName: String
        let dueDate: Date
        let isCompleted: Bool
    }

    // MARK: - Berechtigung

    /// Fragt die Push-Erlaubnis an, falls noch nicht entschieden. Idempotent —
    /// kann bei jedem Oeffnen des Wartungs-Screens gefahrlos gerufen werden.
    func requestAuthorizationIfNeeded() {
        center.getNotificationSettings { [weak self] settings in
            guard let self, settings.authorizationStatus == .notDetermined else { return }
            self.center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                if let error { AppLog.warning("Wartungs-Notif Auth-Fehler: \(error)") }
                AppLog.info("Wartungs-Notif Auth erteilt: \(granted)")
                // Nach erstmaliger Erteilung sofort die gecachten Reminder planen.
                if granted {
                    DispatchQueue.main.async { self.sync(reminders: self.lastReminders) }
                }
            }
        }
    }

    // MARK: - Planung

    /// Plant alle Wartungserinnerungen neu. Loest die Lokalisierung auf dem
    /// aufrufenden (Main-)Thread auf und plant danach asynchron.
    func sync(reminders: [Reminder]) {
        lastReminders = reminders

        let titleStr      = "maintenance.notif.title".loc
        let bodyFmt       = "maintenance.notif.body".loc
        let bodyNoBoatFmt = "maintenance.notif.body_noboat".loc

        center.getNotificationSettings { [weak self] settings in
            guard let self else { return }
            switch settings.authorizationStatus {
            case .authorized, .provisional:
                self.scheduleAll(reminders, title: titleStr, bodyFmt: bodyFmt, bodyNoBoatFmt: bodyNoBoatFmt)
            default:
                // Keine Erlaubnis → nichts planen, aber evtl. alte Requests raeumen.
                self.removeOwnPending()
            }
        }
    }

    private func removeOwnPending(then completion: (() -> Void)? = nil) {
        center.getPendingNotificationRequests { [weak self] reqs in
            guard let self else { completion?(); return }
            let ids = reqs.map(\.identifier).filter { $0.hasPrefix(self.idPrefix) }
            if !ids.isEmpty { self.center.removePendingNotificationRequests(withIdentifiers: ids) }
            completion?()
        }
    }

    private func scheduleAll(_ reminders: [Reminder], title: String, bodyFmt: String, bodyNoBoatFmt: String) {
        removeOwnPending { [weak self] in
            guard let self else { return }
            let cal = Calendar.current
            let now = Date()

            let candidates = reminders
                .filter { !$0.isCompleted }
                .sorted { $0.dueDate < $1.dueDate }
                .prefix(self.maxItems)

            for r in candidates {
                let dueDay = cal.startOfDay(for: r.dueDate)
                let dateStr = r.dueDate.formatted(date: .abbreviated, time: .omitted)
                let body = r.boatName.isEmpty
                    ? String(format: bodyNoBoatFmt, r.title, dateStr)
                    : String(format: bodyFmt, r.title, r.boatName, dateStr)

                // Erinnerung am Faelligkeitstag
                self.add(id: "\(self.idPrefix)\(r.id.uuidString).due",
                         fireDate: self.at(hour: self.fireHour, on: dueDay, cal: cal),
                         title: title, body: body, equipmentId: r.id, now: now, cal: cal)

                // Vorab-Erinnerung 7 Tage vorher
                if let preDay = cal.date(byAdding: .day, value: -self.preReminderDays, to: dueDay) {
                    self.add(id: "\(self.idPrefix)\(r.id.uuidString).pre",
                             fireDate: self.at(hour: self.fireHour, on: preDay, cal: cal),
                             title: title, body: body, equipmentId: r.id, now: now, cal: cal)
                }
            }
        }
    }

    private func at(hour: Int, on day: Date, cal: Calendar) -> Date {
        cal.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
    }

    private func add(id: String, fireDate: Date, title: String, body: String,
                     equipmentId: UUID, now: Date, cal: Calendar) {
        guard fireDate > now else { return }   // Vergangenheit nie planen

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["type": "maintenance", "equipmentId": equipmentId.uuidString]

        let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in
            if let error { AppLog.warning("Wartungs-Notif planen fehlgeschlagen (\(id)): \(error)") }
        }
    }

    // MARK: - Foreground-Anzeige

    /// Zeigt Wartungs-Notifications auch als Banner, wenn die App offen ist.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
