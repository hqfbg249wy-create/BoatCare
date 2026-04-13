//
//  AppLogger.swift
//  Skipily
//
//  Zentrale Logging-Infrastruktur. Nutzt os.Logger fuer strukturiertes
//  Logging das in Release-Builds automatisch gefiltert wird.
//  print() → AppLog.debug() — erscheint nur im Debug-Build.
//

import os

/// Zentrale Logger-Instanz fuer die gesamte App.
/// Verwendung:
///   AppLog.debug("Provider geladen: \(count)")   // nur Debug
///   AppLog.info("User eingeloggt")               // immer
///   AppLog.error("Netzwerk-Fehler: \(error)")    // immer
enum AppLog {
    private static let logger = Logger(subsystem: "app.skipily", category: "general")
    private static let auth   = Logger(subsystem: "app.skipily", category: "auth")
    private static let data   = Logger(subsystem: "app.skipily", category: "data")
    private static let net    = Logger(subsystem: "app.skipily", category: "network")

    /// Debug-Meldungen — nur in Debug-Builds sichtbar, in Release komplett entfernt.
    static func debug(_ message: String) {
        #if DEBUG
        logger.debug("\(message, privacy: .public)")
        #endif
    }

    /// Info-Meldungen — erscheinen in Console.app, aber nicht im Geraete-Log.
    static func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
    }

    /// Warnungen
    static func warning(_ message: String) {
        logger.warning("\(message, privacy: .public)")
    }

    /// Fehler — immer sichtbar, auch in Release.
    static func error(_ message: String) {
        logger.error("\(message, privacy: .public)")
    }
}
