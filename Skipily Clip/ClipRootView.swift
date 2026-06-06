//
//  ClipRootView.swift
//  Skipily Clip
//
//  Haupt-Screen des App Clips: Karte oben, Provider-Liste unten,
//  CTA-Footer mit "Volle App laden" (von iOS automatisch via
//  appClipCodeURL-Banner). Hier nur der UI-Inhalt.
//

import SwiftUI
import MapKit
import StoreKit

struct ClipRootView: View {
    let invocationURL: URL?

    @StateObject private var locationManager = ClipLocationManager()
    @State private var providers: [ClipProvider] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var selectedProvider: ClipProvider?

    var body: some View {
        VStack(spacing: 0) {
            header

            ZStack {
                Map(position: $cameraPosition, selection: Binding(
                    get: { selectedProvider?.id },
                    set: { id in selectedProvider = providers.first { $0.id == id } }
                )) {
                    ForEach(providers) { provider in
                        Marker(provider.name, coordinate: provider.coordinate)
                            .tint(.orange)
                            .tag(provider.id)
                    }
                    UserAnnotation()
                }
                .mapControls {
                    MapUserLocationButton()
                    MapCompass()
                }

                if isLoading {
                    ProgressView("Anbieter in der Nähe …")
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .frame(maxHeight: .infinity)

            providerSheet
        }
        .task { locationManager.requestLocation() }
        .onChange(of: locationManager.location) { _, newLocation in
            guard let loc = newLocation else { return }
            cameraPosition = .region(MKCoordinateRegion(
                center: loc.coordinate,
                latitudinalMeters: 30_000, longitudinalMeters: 30_000
            ))
            Task { await loadProviders(near: loc) }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                Image("SkipilyLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text("SKIPILY")
                        .font(.title3.weight(.heavy))
                        .tracking(2)
                    Text("Service-Anbieter in der Nähe")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)

            Divider()
        }
        .background(Color(.systemBackground))
    }

    // MARK: - Provider Sheet

    private var providerSheet: some View {
        VStack(spacing: 0) {
            Divider()

            if let errorMessage {
                HStack {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                    Text(errorMessage)
                        .font(.caption)
                }
                .padding(12)
            }

            if let permissionMsg = locationManager.failureMessage {
                HStack {
                    Image(systemName: "location.slash")
                        .foregroundStyle(.orange)
                    Text(permissionMsg)
                        .font(.caption)
                    Spacer()
                    Button("Einstellungen") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .font(.caption)
                }
                .padding(12)
            }

            if let selected = selectedProvider {
                ProviderDetailRow(provider: selected,
                                  userLocation: locationManager.location,
                                  onClose: { selectedProvider = nil })
            } else if !providers.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(providers.prefix(10)) { provider in
                            ProviderChip(provider: provider,
                                         userLocation: locationManager.location)
                                .onTapGesture {
                                    withAnimation { selectedProvider = provider }
                                    cameraPosition = .region(MKCoordinateRegion(
                                        center: provider.coordinate,
                                        latitudinalMeters: 4_000, longitudinalMeters: 4_000
                                    ))
                                }
                        }
                    }
                    .padding(12)
                }
            }

            // App-Store-Overlay-Banner — iOS bietet ein „Get App"-Banner
            // automatisch unten an, sobald die App Clip Experience korrekt
            // hinterlegt ist (configured: appClipCodeURL + DefaultLink in
            // App Store Connect). Hier kein zusätzlicher CTA nötig.
        }
        .background(.regularMaterial)
    }

    // MARK: - Data

    private func loadProviders(near location: CLLocation) async {
        isLoading = true
        defer { isLoading = false }
        do {
            providers = try await ClipSupabase.loadProviders(near: location, radiusKm: 50)
            if providers.isEmpty {
                errorMessage = "Keine Skipily-Anbieter im 50-km-Umkreis gefunden."
            } else {
                errorMessage = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Row Components

private struct ProviderChip: View {
    let provider: ClipProvider
    let userLocation: CLLocation?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(provider.name)
                .font(.subheadline.bold())
                .lineLimit(1)
            if let city = provider.city {
                Text(city)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let dist = distanceText {
                Label(dist, systemImage: "location")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
        .frame(width: 160, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.08), radius: 4, y: 1)
        )
    }

    private var distanceText: String? {
        guard let userLocation else { return nil }
        let meters = provider.distance(from: userLocation)
        if meters < 1000 {
            return "\(Int(meters)) m"
        }
        return String(format: "%.1f km", meters / 1000)
    }
}

private struct ProviderDetailRow: View {
    let provider: ClipProvider
    let userLocation: CLLocation?
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(provider.name).font(.headline)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
            if let street = provider.street, let city = provider.city {
                Text("\(street), \(city)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                if let userLocation {
                    let m = provider.distance(from: userLocation)
                    Label(m < 1000 ? "\(Int(m)) m" : String(format: "%.1f km", m/1000),
                          systemImage: "location")
                        .font(.caption)
                }
                Button {
                    openInMaps()
                } label: {
                    Label("Route", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.caption.bold())
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
            }
        }
        .padding(14)
    }

    private func openInMaps() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: provider.coordinate))
        item.name = provider.name
        item.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ])
    }
}
