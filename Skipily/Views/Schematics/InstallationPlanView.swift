//
//  InstallationPlanView.swift
//  Skipily
//
//  Schritt-für-Schritt-Anzeige eines Montage-/Einbauplans.
//

import SwiftUI

struct InstallationPlanView: View {
    let plan: InstallationPlan
    @State private var doneSteps: Set<String> = []

    var body: some View {
        List {
            // Disclaimer (immer ganz oben)
            Section {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.shield.fill")
                        .foregroundColor(.orange)
                    Text("Dieser Montageplan ist ein KI-Vorschlag für eine mögliche Variante. Die Ausführung sollte einem qualifizierten Fachbetrieb übertragen werden — er trägt die Verantwortung für die korrekte Installation und Abnahme.")
                        .font(.caption)
                }
                .listRowBackground(Color.orange.opacity(0.12))
            }

            // Übersicht
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    if !plan.summary.isEmpty {
                        Text(plan.summary).font(.body)
                    }
                    HStack(spacing: 16) {
                        Label(plan.difficulty.displayName, systemImage: plan.difficulty.systemImage)
                            .font(.caption)
                        if plan.totalDurationMinutes > 0 {
                            Label("\(plan.totalDurationMinutes) min", systemImage: "clock")
                                .font(.caption)
                        }
                    }
                    .foregroundColor(.secondary)
                }
            }

            if !plan.safetyNotes.isEmpty {
                Section("Sicherheitshinweise") {
                    ForEach(plan.safetyNotes, id: \.self) { note in
                        Label(note, systemImage: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                    }
                }
            }

            if !plan.tools.isEmpty {
                Section("Werkzeug") {
                    ForEach(plan.tools) { tool in
                        HStack {
                            Image(systemName: "wrench.adjustable")
                                .foregroundColor(.secondary)
                            Text(tool.name)
                            if tool.optional {
                                Text("(optional)").font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }

            if !plan.materials.isEmpty {
                Section("Material") {
                    ForEach(plan.materials) { mat in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(mat.name)
                                if let q = mat.quantity {
                                    Spacer()
                                    Text(q).foregroundColor(.secondary).font(.caption)
                                }
                            }
                            if let n = mat.note {
                                Text(n).font(.caption2).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Montageschritte") {
                ForEach(plan.steps.sorted(by: { $0.order < $1.order })) { step in
                    stepRow(step)
                }
            }
        }
        .navigationTitle(plan.title)
    }

    @ViewBuilder
    private func stepRow(_ step: InstallationStep) -> some View {
        let isDone = doneSteps.contains(step.id)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                Button {
                    if isDone { doneSteps.remove(step.id) } else { doneSteps.insert(step.id) }
                } label: {
                    Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(isDone ? .green : .secondary)
                        .font(.title3)
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(step.order). \(step.title)")
                        .font(.headline)
                        .strikethrough(isDone)
                    Text(step.detail)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    HStack(spacing: 10) {
                        if let loc = step.location {
                            Label(loc, systemImage: "mappin").font(.caption2)
                        }
                        if let dur = step.durationMinutes {
                            Label("\(dur) min", systemImage: "clock").font(.caption2)
                        }
                    }
                    .foregroundColor(.secondary)

                    if let warn = step.warning {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text(warn).font(.caption)
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color.orange.opacity(0.12)))
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
