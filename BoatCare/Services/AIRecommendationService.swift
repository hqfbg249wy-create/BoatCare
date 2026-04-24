//
//  AIRecommendationService.swift
//  BoatCare
//

import Foundation
import SwiftUI
import Combine
import Supabase

// MARK: - AI Recommendation Model

struct AIRecommendation: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let text: String
    let priority: Priority

    enum Priority: Int, Comparable {
        case urgent = 0
        case important = 1
        case suggestion = 2

        static func < (lhs: Priority, rhs: Priority) -> Bool {
            lhs.rawValue < rhs.rawValue
        }

        var label: String {
            switch self {
            case .urgent: return "tips.priority_urgent".loc
            case .important: return "tips.priority_important".loc
            case .suggestion: return "tips.priority_suggestion".loc
            }
        }

        var color: String {
            switch self {
            case .urgent: return "red"
            case .important: return "orange"
            case .suggestion: return "blue"
            }
        }
    }
}

// MARK: - AI Recommendation Service

@MainActor
class AIRecommendationService: ObservableObject {
    @Published var recommendations: [AIRecommendation] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var lastUpdated: Date?

    private let supabase = SupabaseManager.shared.client

    /// Generates maintenance recommendations based on boat and equipment data
    func generateRecommendations(for userId: UUID) async {
        isLoading = true
        errorMessage = nil

        do {
            // 1. Load boats for this user
            let boats: [Boat] = try await supabase
                .from("boats")
                .select()
                .eq("owner_id", value: userId.uuidString)
                .execute()
                .value

            guard !boats.isEmpty else {
                recommendations = [AIRecommendation(
                    icon: "sailboat",
                    title: "tips.no_boats_title".loc,
                    text: "tips.no_boats_hint".loc,
                    priority: .suggestion
                )]
                isLoading = false
                return
            }

            // 2. Load equipment for all boats
            let boatIds = boats.map { $0.id.uuidString }
            let equipment: [EquipmentItem] = try await supabase
                .from("equipment")
                .select()
                .in("boat_id", values: boatIds)
                .execute()
                .value

            // 3. Build context and generate recommendations locally
            let tips = analyzeAndRecommend(boats: boats, equipment: equipment)

            recommendations = tips.sorted { $0.priority < $1.priority }
            lastUpdated = Date()
            isLoading = false

        } catch {
            errorMessage = "tips.error_loading".loc
            isLoading = false
        }
    }

    // MARK: - Local Analysis Engine

    /// Analyzes boat and equipment data to generate smart, empathetic recommendations
    private func analyzeAndRecommend(boats: [Boat], equipment: [EquipmentItem]) -> [AIRecommendation] {
        var tips: [AIRecommendation] = []
        let today = Date()
        let calendar = Calendar.current
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        for boat in boats {
            let boatEquipment = equipment.filter { $0.boatId == boat.id }

            // --- Overdue maintenance checks ---
            let overdueItems = boatEquipment.filter { item in
                guard let nextStr = item.nextMaintenanceDate,
                      let nextDate = dateFormatter.date(from: nextStr) else { return false }
                return nextDate < today
            }

            for item in overdueItems {
                if let nextStr = item.nextMaintenanceDate,
                   let nextDate = dateFormatter.date(from: nextStr) {
                    let daysOverdue = abs(calendar.dateComponents([.day], from: nextDate, to: today).day ?? 0)
                    tips.append(AIRecommendation(
                        icon: "exclamationmark.triangle.fill",
                        title: String(format: "tips.overdue_title".loc, item.name),
                        text: String(format: "tips.overdue_text".loc, item.name, boat.name, daysOverdue),
                        priority: .urgent
                    ))
                }
            }

            // --- Due soon (within 60 days) ---
            let dueSoonItems = boatEquipment.filter { item in
                guard let nextStr = item.nextMaintenanceDate,
                      let nextDate = dateFormatter.date(from: nextStr) else { return false }
                let days = calendar.dateComponents([.day], from: today, to: nextDate).day ?? 0
                return days >= 0 && days <= 60
            }

            for item in dueSoonItems {
                if let nextStr = item.nextMaintenanceDate,
                   let nextDate = dateFormatter.date(from: nextStr) {
                    let daysLeft = calendar.dateComponents([.day], from: today, to: nextDate).day ?? 0
                    tips.append(AIRecommendation(
                        icon: "clock.badge.exclamationmark",
                        title: String(format: "tips.due_soon_title".loc, item.name),
                        text: String(format: "tips.due_soon_text".loc, item.name, boat.name, daysLeft),
                        priority: .important
                    ))
                }
            }

            // --- Warranty expiring soon (within 90 days) ---
            let warrantyExpiring = boatEquipment.filter { item in
                guard let warrantyStr = item.warrantyExpiry,
                      let warrantyDate = dateFormatter.date(from: warrantyStr) else { return false }
                let days = calendar.dateComponents([.day], from: today, to: warrantyDate).day ?? 0
                return days >= 0 && days <= 90
            }

            for item in warrantyExpiring {
                if let warrantyStr = item.warrantyExpiry,
                   let warrantyDate = dateFormatter.date(from: warrantyStr) {
                    let daysLeft = calendar.dateComponents([.day], from: today, to: warrantyDate).day ?? 0
                    tips.append(AIRecommendation(
                        icon: "shield.lefthalf.filled.badge.checkmark",
                        title: String(format: "tips.warranty_title".loc, item.name),
                        text: String(format: "tips.warranty_text".loc, item.name, daysLeft),
                        priority: .important
                    ))
                }
            }

            // --- No maintenance date set for equipment with cycle ---
            let missingMaintenance = boatEquipment.filter { item in
                item.maintenanceCycleYears != nil && item.nextMaintenanceDate == nil
            }

            for item in missingMaintenance {
                tips.append(AIRecommendation(
                    icon: "calendar.badge.plus",
                    title: String(format: "tips.missing_date_title".loc, item.name),
                    text: String(format: "tips.missing_date_text".loc, item.name, boat.name),
                    priority: .suggestion
                ))
            }

            // --- Old boat / annual service reminder ---
            if let yearBuilt = boat.yearBuilt {
                let age = calendar.component(.year, from: today) - yearBuilt
                if age >= 10 {
                    tips.append(AIRecommendation(
                        icon: "wrench.and.screwdriver",
                        title: String(format: "tips.old_boat_title".loc, boat.name),
                        text: String(format: "tips.old_boat_text".loc, boat.name, age),
                        priority: .suggestion
                    ))
                }
            }

            // --- Engine hours / seasonal check ---
            if !boat.engine.isEmpty {
                tips.append(AIRecommendation(
                    icon: "engine.combustion",
                    title: String(format: "tips.engine_title".loc, boat.name),
                    text: String(format: "tips.engine_text".loc, boat.engine, boat.name),
                    priority: .suggestion
                ))
            }

            // --- Safety equipment reminder ---
            let safetyItems = boatEquipment.filter {
                $0.category.lowercased().contains("safety") || $0.category.lowercased().contains("sicherheit")
            }
            if safetyItems.isEmpty {
                tips.append(AIRecommendation(
                    icon: "lifepreserver",
                    title: String(format: "tips.safety_title".loc, boat.name),
                    text: String(format: "tips.safety_text".loc, boat.name),
                    priority: .suggestion
                ))
            }

            // --- Seasonal tip based on current month ---
            let month = calendar.component(.month, from: today)
            if month >= 3 && month <= 5 {
                tips.append(AIRecommendation(
                    icon: "sun.max.fill",
                    title: "tips.spring_title".loc,
                    text: String(format: "tips.spring_text".loc, boat.name),
                    priority: .suggestion
                ))
            } else if month >= 9 && month <= 11 {
                tips.append(AIRecommendation(
                    icon: "snowflake",
                    title: "tips.winter_title".loc,
                    text: String(format: "tips.winter_text".loc, boat.name),
                    priority: .suggestion
                ))
            }
        }

        // Deduplicate seasonal tips (show once, not per boat)
        var seen = Set<String>()
        tips = tips.filter { tip in
            let key = tip.title
            if seen.contains(key) { return false }
            seen.insert(key)
            return true
        }

        // If no specific tips, show a positive "all good" message
        if tips.isEmpty {
            tips.append(AIRecommendation(
                icon: "checkmark.seal.fill",
                title: "tips.all_good_title".loc,
                text: "tips.all_good_text".loc,
                priority: .suggestion
            ))
        }

        return tips
    }
}
