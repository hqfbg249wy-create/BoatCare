//
//  BoatTransferService.swift
//  Skipily
//
//  Boot-Uebergabe beim Verkauf: Der Verkaeufer erzeugt einen Uebergabe-Key
//  (create-boat-transfer), der Kaeufer loest ihn in seinem Konto ein
//  (redeem-boat-transfer) und erhaelt eine vollstaendige KOPIE des Bootes
//  samt Ausruestung, Fotos, Mess-/Tauwerk-Daten und Wartungshistorie. Das
//  Original bleibt beim Verkaeufer.
//

import Foundation
import Supabase

@MainActor
final class BoatTransferService {
    static let shared = BoatTransferService()
    private init() {}

    private var client: SupabaseClient { SupabaseManager.shared.client }

    struct CreateResult: Decodable {
        let key: String
        let expires_at: String?
        let boat_name: String?
    }
    struct RedeemResult: Decodable {
        let boat_id: String
        let boat_name: String?
        let equipment_count: Int?
    }

    private struct CreateBody: Encodable {
        let boat_id: String
        let kept_equipment_ids: [String]
        let kept_target_boat_id: String?
        let kept_new_boat_name: String?
        /// Signalisiert dem Backend, dass dieser Build den Plus-Upsell zeigt;
        /// nur dann erzwingt create-boat-transfer das Plus-Gate (aeltere Builds
        /// bleiben ungegatet, damit sie keine Fehlermeldung sehen).
        let gate_aware = true
        let lang: String
    }

    /// Plus fehlt (402 vom Backend) -> Aufrufer zeigt den Upgrade-Dialog statt eines Fehlers.
    enum TransferError: Error { case requiresPlus }
    private struct RedeemBody: Encodable { let key: String }

    /// Erzeugt einen Uebergabe-Key fuer ein Boot des eingeloggten Nutzers.
    /// `keptEquipmentIds` = Ausruestung, die der Verkaeufer behaelt (wird nicht
    /// an den Kaeufer uebertragen). Ziel-Schiff fuer diese Ausruestung:
    /// `keptTargetBoatId` (vorhandenes Schiff, Vorrang) ODER `keptNewBoatName`
    /// (neues Schiff, wird beim Einloesen angelegt). Beides leer -> Backend legt
    /// automatisch ein "(behalten)"-Schiff an.
    func createTransfer(boatId: UUID, keptEquipmentIds: [UUID] = [],
                        keptTargetBoatId: UUID? = nil, keptNewBoatName: String? = nil) async throws -> CreateResult {
        do {
            return try await invokeCreate(boatId: boatId, keptEquipmentIds: keptEquipmentIds,
                                          keptTargetBoatId: keptTargetBoatId, keptNewBoatName: keptNewBoatName)
        } catch let fnError as FunctionsError {
            if case let .httpError(code, _) = fnError, code == 402 { throw TransferError.requiresPlus }
            throw fnError
        }
    }

    private func invokeCreate(boatId: UUID, keptEquipmentIds: [UUID],
                              keptTargetBoatId: UUID?, keptNewBoatName: String?) async throws -> CreateResult {
        try await client.functions.invoke(
            "create-boat-transfer",
            options: .init(body: CreateBody(
                boat_id: boatId.uuidString,
                kept_equipment_ids: keptEquipmentIds.map { $0.uuidString },
                kept_target_boat_id: keptTargetBoatId?.uuidString,
                kept_new_boat_name: keptNewBoatName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? keptNewBoatName?.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                lang: LanguageManager.shared.currentLanguage.code
            ))
        )
    }

    /// Loest einen Uebergabe-Key ein und liefert das neue (kopierte) Boot.
    func redeem(key: String) async throws -> RedeemResult {
        try await client.functions.invoke(
            "redeem-boat-transfer",
            options: .init(body: RedeemBody(key: key.trimmingCharacters(in: .whitespaces).uppercased()))
        )
    }
}
