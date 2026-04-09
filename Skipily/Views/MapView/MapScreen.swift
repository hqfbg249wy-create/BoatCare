//
//  MapScreen.swift
//  Skipily
//
//  Created by Ekkehart Padberg on 20.01.26.
//

import SwiftUI
import MapKit
import CoreLocation
import Combine
import UIKit
import Supabase
import PostgREST

// MARK: - Map Cluster Model

/// Repräsentiert eine Gruppe von nahe beieinanderliegenden Providern
struct MapCluster: Identifiable {
    let providers: [BoatServiceProvider]

    /// Stabile ID: basiert auf den sortierten Provider-IDs im Cluster.
    /// Verhindert Flackern, da SwiftUI die Annotation wiedererkennt.
    var id: String {
        providers.map { $0.id.uuidString }.sorted().joined(separator: "-")
    }

    var coordinate: CLLocationCoordinate2D {
        let avgLat = providers.map(\.latitude).reduce(0, +) / Double(providers.count)
        let avgLon = providers.map(\.longitude).reduce(0, +) / Double(providers.count)
        return CLLocationCoordinate2D(latitude: avgLat, longitude: avgLon)
    }

    var count: Int { providers.count }

    /// Bis 20 Provider → Einzelpins anzeigen, ab 21 → Cluster-Badge
    var showIndividualPins: Bool { providers.count <= 20 }

    var firstProvider: BoatServiceProvider { providers[0] }
}

// MARK: - Clustering Engine

/// Berechnet Cluster basierend auf dem aktuellen Zoom-Level
struct ClusterEngine {

    /// Ab diesem Zoom-Level (latitudeDelta) wird nicht mehr geclustert.
    /// ~0.009° ≈ 1 km Radius → alle Pins einzeln anzeigen.
    static let noClusterThreshold: Double = 0.009

    /// Minimaler Abstand in Grad, ab dem Pins als einzeln dargestellt werden
    /// Wird dynamisch aus dem Zoom-Level (latitudeDelta) berechnet
    static func cluster(providers: [BoatServiceProvider], zoomLevel: Double) -> [MapCluster] {
        guard !providers.isEmpty else { return [] }

        // Ab ≤1 km Radius: kein Clustering – alle Pins einzeln
        if zoomLevel <= noClusterThreshold {
            return providers.map { MapCluster(providers: [$0]) }
        }

        // Cluster-Radius proportional zum Zoom-Level
        // Bei hohem Zoom (kleines delta): kleiner Radius → mehr einzelne Pins
        // Bei niedrigem Zoom (großes delta): großer Radius → mehr Cluster
        let clusterRadius = zoomLevel * 0.06 // ~6% der sichtbaren Fläche

        var assigned = Set<UUID>()
        var clusters: [MapCluster] = []

        for provider in providers {
            guard !assigned.contains(provider.id) else { continue }

            // Finde alle Provider in der Nähe
            var group: [BoatServiceProvider] = [provider]
            assigned.insert(provider.id)

            for other in providers {
                guard !assigned.contains(other.id) else { continue }

                let dLat = abs(provider.latitude - other.latitude)
                let dLon = abs(provider.longitude - other.longitude)

                if dLat < clusterRadius && dLon < clusterRadius {
                    group.append(other)
                    assigned.insert(other.id)
                }
            }

            clusters.append(MapCluster(providers: group))
        }

        return clusters
    }
}

// MARK: - Cluster Badge View

struct ClusterBadge: View {
    let count: Int

    private var badgeSize: CGFloat {
        if count < 10 { return 36 }
        if count < 100 { return 42 }
        return 48
    }

    var body: some View {
        ZStack {
            // Äußerer Ring
            Circle()
                .fill(Color.blue.opacity(0.2))
                .frame(width: badgeSize + 8, height: badgeSize + 8)

            // Hauptkreis
            Circle()
                .fill(Color.blue.gradient)
                .frame(width: badgeSize, height: badgeSize)

            // Weißer Rand
            Circle()
                .stroke(.white, lineWidth: 2.5)
                .frame(width: badgeSize, height: badgeSize)

            // Zahl
            Text("\(count)")
                .font(.system(size: count < 100 ? 15 : 12, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

// MARK: - Tab Selection Enum
enum MainTab: String, CaseIterable {
    case map         = "tab.map"
    case boats       = "tab.boats"
    case maintenance = "tab.maintenance"
    case marketplace = "tab.marketplace"
    case favorites   = "tab.favorites"
    case chat        = "tab.chat"

    var displayName: String {
        return LanguageManager.shared.localized(self.rawValue)
    }

    var icon: String {
        switch self {
        case .map:         return "map.fill"
        case .boats:       return "sailboat.fill"
        case .maintenance: return "wrench.and.screwdriver.fill"
        case .marketplace: return "tag.fill"
        case .favorites:   return "heart.fill"
        case .chat:        return "message.fill"
        }
    }
}

// MARK: - Service Category Enum
enum ServiceCategory: String, CaseIterable {
    case all         = "category.all"
    case repair      = "category.motor_service"
    case supplies    = "category.supplies"
    case fuel        = "category.fuel"
    case sailmaker   = "category.sailmaker"
    case rigging     = "category.rigging"
    case instruments = "category.instruments"
    case marina      = "category.marina"

    var displayName: String {
        return LanguageManager.shared.localized(self.rawValue)
    }

    /// Alle DB-Werte die zu dieser Kategorie passen (sprachunabhängig)
    var matchTerms: [String] {
        switch self {
        case .all:
            return []
        case .repair:
            return ["motor service", "werkstatt", "repair", "werft", "atelier", "cantiere", "taller", "werkplaats"]
        case .supplies:
            return ["marine supplies", "zubehör", "supplies", "accastillage", "accessori", "accesorios", "benodigdheden", "shop", "chandl"]
        case .fuel:
            return ["fuel", "tankstelle", "carburant", "combustible", "carburante", "brandstof"]
        case .sailmaker:
            return ["sailmaker", "segelmacher", "voilerie", "veleria", "velería", "zeilmakerij", "sail"]
        case .rigging:
            return ["rigging", "rigg", "gréement", "attrezzatura", "aparejo", "tuigage", "tauwerk"]
        case .instruments:
            return ["instruments", "instrumente", "electronics", "électronique", "elettronica", "electrónica", "elektronica", "navigation"]
        case .marina:
            return ["marina", "hafen", "port", "porto", "puerto", "jachthaven", "haven", "harbour", "harbor"]
        }
    }

    /// Prüft ob ein Kategorie-String zu diesem Filter passt
    func matches(_ category: String) -> Bool {
        let lower = category.lowercased()
        return matchTerms.contains { lower.contains($0) }
    }
}


// MARK: - Main Container with Bottom Navigation
struct MainContainerView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @State private var selectedTab: MainTab = .map
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // Content
            Group {
                switch selectedTab {
                case .map:
                    MapScreen()
                        .environmentObject(authService)
                        .environmentObject(favoritesManager)
                case .boats:
                    BoatDataScreen()
                        .environmentObject(authService)
                        .environmentObject(favoritesManager)
                case .maintenance:
                    MaintenanceScreen()
                        .environmentObject(authService)
                        .environmentObject(favoritesManager)
                case .marketplace:
                    MarketplaceScreen()
                        .environmentObject(authService)
                        .environmentObject(favoritesManager)
                case .favorites:
                    POIScreen()
                        .environmentObject(authService)
                        .environmentObject(favoritesManager)
                case .chat:
                    ChatScreen()
                        .environmentObject(authService)
                        .environmentObject(favoritesManager)
                }
            }
            
            // Bottom Navigation Bar
            HStack(spacing: 0) {
                ForEach(MainTab.allCases, id: \.self) { tab in
                    Button {
                        selectedTab = tab
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: tab.icon)
                                .font(.system(size: 20))
                            Text(tab.displayName)
                                .font(.caption2)
                        }
                        .foregroundStyle(selectedTab == tab ? .blue : .gray)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                }
            }
            .background(.ultraThinMaterial)
            .shadow(color: .black.opacity(0.1), radius: 10, y: -5)
        }
        .ignoresSafeArea(.all, edges: .bottom)
    }
}

// MARK: - Map Screen
struct MapScreen: View {
    @EnvironmentObject private var authService: AuthService
    @EnvironmentObject private var favoritesManager: FavoritesManager
    @StateObject private var locationManager = LocationManager()
    @StateObject private var providerManager = ServiceProviderManager()
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var currentRegion: MKCoordinateRegion?
    @State private var currentZoomLevel: Double = 0.05 // Latitudedelta - kleinerer Wert = mehr Zoom
    @State private var searchText = ""
    @State private var searchResults: [MKMapItem] = []
    @State private var selectedResult: MKMapItem?
    @State private var selectedProvider: BoatServiceProvider?
    @State private var route: MKRoute?
    @State private var showingRoute = false
    @State private var userLocation: CLLocationCoordinate2D?
    @State private var showingLocationError = false
    @State private var locationErrorMessage = ""
    @State private var searchRadius: Double = 10.0
    @State private var showingRadiusPicker = false
    @State private var selectedCategory: ServiceCategory = .all
    @State private var showingAddBusiness = false
    @State private var showingLoginRequired = false
    @State private var showingLogin = false
    @State private var showingAssistant = false
    @State private var showingProfile = false

    /// Debounce-Task: verzögert den Region-Reload um 0.5 s nach dem letzten Kamera-Stop
    @State private var regionLoadTask: Task<Void, Never>?
    /// Zuletzt geladene Region – verhindert doppelte Fetches bei minimaler Bewegung
    @State private var lastLoadedRegion: MKCoordinateRegion?

    // Swipeable Cards: Index des aktuell angezeigten Providers in der Nearby-Liste
    @State private var selectedProviderIndex: Int = 0
    // Provider aus einem getappten Cluster (nil = Entfernungsberechnung nutzen)
    @State private var clusterProviders: [BoatServiceProvider]?
    // Fixierter Zoom-Level solange eine Kachel offen ist – verhindert Raus-Zoomen beim Swipen
    @State private var cardZoomLevel: Double?

    let radiusOptions: [Double] = [5, 10, 25, 50, 100, 200, 500, 1000]

    // UserDefaults Keys für Kamera-Position Speicherung
    private let cameraLatKey = "MapScreen.Camera.Latitude"
    private let cameraLonKey = "MapScreen.Camera.Longitude"
    private let cameraZoomKey = "MapScreen.Camera.Zoom"

    // MARK: - Gefilterte Provider für die Map (Kategorie + Suchtext, lokal)
    private var visibleProviders: [BoatServiceProvider] {
        var filtered = providerManager.providers

        if selectedCategory != .all {
            filtered = filtered.filter { provider in
                provider.allCategories.contains { selectedCategory.matches($0) }
            }
        }

        if !searchText.isEmpty {
            let words = searchText.lowercased().split(separator: " ").map { String($0) }
            filtered = filtered.filter { provider in
                let haystack = [
                    provider.name,
                    provider.category,
                    provider.description ?? "",
                    provider.address,
                    provider.brands?.joined(separator: " ") ?? "",
                    provider.services?.joined(separator: " ") ?? ""
                ].joined(separator: " ").lowercased()
                return words.allSatisfy { haystack.contains($0) }
            }
        }

        return filtered
    }

    // MARK: - Highlighted Provider (aktuell angezeigte Kachel)

    /// Die ID des Providers, der gerade in der unteren Kachel angezeigt wird
    private var highlightedProviderID: UUID? {
        guard selectedProvider != nil else { return nil }
        let nearby = nearbyProviders
        guard selectedProviderIndex >= 0 && selectedProviderIndex < nearby.count else {
            return selectedProvider?.id
        }
        return nearby[selectedProviderIndex].id
    }

    // MARK: - Clustering

    /// Cluster-Darstellung basierend auf aktuellem Zoom-Level
    private var clusteredProviders: [MapCluster] {
        ClusterEngine.cluster(providers: visibleProviders, zoomLevel: currentZoomLevel)
    }

    // MARK: - Nearby Providers (bidirektional links/rechts vom gewählten Provider)

    /// Bildet eine geografische Kette mit dem angeklickten Provider in der Mitte:
    ///   [... westliche Nachbarn ...] ← SELECTED → [... östliche Nachbarn ...]
    /// Swipe links  → nächster westlicher Nachbar
    /// Swipe rechts → nächster östlicher Nachbar
    /// Innerhalb jeder Seite: Nearest-Neighbor-Kette für natürliche Reihenfolge.
    private var nearbyProviders: [BoatServiceProvider] {
        guard let selected = selectedProvider else { return [] }

        let candidates: [BoatServiceProvider]
        if let cluster = clusterProviders, !cluster.isEmpty {
            candidates = cluster
        } else {
            candidates = visibleProviders
        }

        // Nur Provider im sichtbaren Kartenausschnitt berücksichtigen
        let zoom = cardZoomLevel ?? currentZoomLevel
        let inView = candidates.filter { provider in
            let dLat = abs(provider.latitude - selected.latitude)
            let dLon = abs(provider.longitude - selected.longitude)
            // Provider muss innerhalb des sichtbaren Bereichs liegen
            return dLat <= zoom && dLon <= zoom
        }

        // Die 19 nächsten Provider zum gewählten (+ selected = max 20)
        let selectedCoord = CLLocation(latitude: selected.latitude, longitude: selected.longitude)
        let nearest = Array(
            inView
                .filter { $0.id != selected.id }
                .sorted {
                    CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: selectedCoord) <
                    CLLocation(latitude: $1.latitude, longitude: $1.longitude).distance(from: selectedCoord)
                }
                .prefix(19)
        )

        // Aufteilen: westlich (links) und östlich (rechts) des gewählten Providers
        let westCandidates = nearest.filter { $0.longitude <= selected.longitude }
        let eastCandidates = nearest.filter { $0.longitude > selected.longitude }

        // Nearest-Neighbor-Kette für jede Seite (vom Selected ausgehend)
        let westChain = Self.buildDirectionalChain(from: selected, candidates: westCandidates)
        let eastChain = Self.buildDirectionalChain(from: selected, candidates: eastCandidates)

        // [fern-west, ..., nah-west, SELECTED, nah-ost, ..., fern-ost]
        return westChain.reversed() + [selected] + eastChain
    }

    /// Index des gewählten Providers in der nearbyProviders-Liste
    private var selectedProviderStartIndex: Int {
        guard let selected = selectedProvider else { return 0 }
        return nearbyProviders.firstIndex(where: { $0.id == selected.id }) ?? 0
    }

    /// Nearest-Neighbor-Kette von einem Startpunkt aus durch eine Kandidatenliste.
    private static func buildDirectionalChain(
        from start: BoatServiceProvider,
        candidates: [BoatServiceProvider]
    ) -> [BoatServiceProvider] {
        guard !candidates.isEmpty else { return [] }

        var remaining = candidates
        var chain: [BoatServiceProvider] = []
        var current = start

        while !remaining.isEmpty {
            var bestIndex = 0
            var bestDist = Double.greatestFiniteMagnitude

            for (i, candidate) in remaining.enumerated() {
                let dLat = current.latitude - candidate.latitude
                let dLon = current.longitude - candidate.longitude
                let dist = dLat * dLat + dLon * dLon
                if dist < bestDist {
                    bestDist = dist
                    bestIndex = i
                }
            }

            current = remaining.remove(at: bestIndex)
            chain.append(current)
        }

        return chain
    }

    var body: some View {
        bodyContent
    }
    
    private var bodyContent: some View {
        ZStack(alignment: .topLeading) {
            mapView
            topOverlays
            bottomRightButtons
            providerCards
            searchCards
        }
        .onTapGesture {
            // Tastatur schließen wenn irgendwo außerhalb getippt wird
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
        .sheet(isPresented: $showingAddBusiness) {
            AddBusinessView(onBusinessAdded: {
                // Lade Region neu, um den neu eingetragenen Betrieb sofort zu sehen
                if let region = currentRegion {
                    Task { await providerManager.loadProviders(in: region) }
                }
            })
            .environmentObject(authService)
        }
        .sheet(isPresented: $showingAssistant) {
            NavigationStack {
                ChatScreen()
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Schliessen") { showingAssistant = false }
                        }
                    }
            }
        }
        .sheet(isPresented: $showingLogin) {
            LoginView()
                .environmentObject(authService)
        }
        .sheet(isPresented: $showingProfile) {
            NavigationStack {
                ProfileView()
                    .environmentObject(authService)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("general.close".loc) { showingProfile = false }
                        }
                    }
            }
        }
        .alert("map.location_error".loc, isPresented: $showingLocationError) {
            Button("general.ok".loc, role: .cancel) {}
        } message: {
            Text(locationErrorMessage)
        }
        .alert("map.login_required".loc, isPresented: $showingLoginRequired) {
            Button("general.cancel".loc, role: .cancel) {}
            Button("auth.login".loc) {
                showingLogin = true
            }
        } message: {
            Text("map.login_required_hint".loc)
        }
        .onAppear {
            providerManager.setSupabase(authService.supabase)
            restoreCameraPosition()
            setupLocation()
            loadSupabaseProviders()
        }
        .onChange(of: locationManager.location) { oldValue, newValue in
            if let location = newValue {
                userLocation = location.coordinate
                // visibleProviders filtert reaktiv – kein extra Aufruf nötig
            }
        }
        .onChange(of: locationManager.authorizationStatus) { oldValue, newValue in
            handleAuthorizationChange(newValue)
        }
        .onChange(of: searchRadius) { _, _ in
            // visibleProviders filtert reaktiv – kein DB-Aufruf nötig
        }
        .onChange(of: selectedCategory) { _, _ in
            // visibleProviders filtert reaktiv – kein DB-Aufruf nötig
        }
    }
    
    @ViewBuilder
    private var providerCards: some View {
        if selectedProvider != nil {
            let nearby = nearbyProviders
            VStack {
                Spacer()

                if nearby.count > 1 {
                    // Swipeable Cards für mehrere nahegelegene Provider
                    VStack(spacing: 4) {
                        // Seiten-Indikator
                        HStack(spacing: 4) {
                            Text("\(selectedProviderIndex + 1)/\(nearby.count)")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundStyle(.secondary)

                            Image(systemName: "hand.draw.fill")
                                .font(.caption2)
                                .foregroundStyle(.secondary)

                            Text("provider.swipe_hint".loc)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())

                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(Array(nearby.enumerated()), id: \.element.id) { index, provider in
                                    ProviderDetailCard(
                                        provider: provider,
                                        userLocation: userLocation,
                                        favoritesManager: favoritesManager,
                                        onDismiss: {
                                            self.selectedProvider = nil
                                            self.clusterProviders = nil
                                            self.cardZoomLevel = nil
                                            self.route = nil
                                            self.showingRoute = false
                                        },
                                        onRoute: {
                                            calculateRouteToProvider(provider)
                                        }
                                    )
                                    .containerRelativeFrame(.horizontal, count: 1, spacing: 12)
                                    .id(index)
                                }
                            }
                            .scrollTargetLayout()
                        }
                        .scrollTargetBehavior(.viewAligned)
                        .contentMargins(.horizontal, 32, for: .scrollContent)
                        .frame(height: 380)
                        .scrollPosition(id: Binding(
                            get: { selectedProviderIndex as Int? },
                            set: { if let v = $0 { selectedProviderIndex = v } }
                        ))
                        .onChange(of: selectedProviderIndex) { _, newIndex in
                            if newIndex >= 0 && newIndex < nearby.count {
                                centerOnProvider(nearby[newIndex])
                            }
                        }
                    }
                    .padding(.bottom, 80)
                } else {
                    // Einzelne Card ohne Swipe
                    ProviderDetailCard(
                        provider: nearby.first ?? selectedProvider!,
                        userLocation: userLocation,
                        favoritesManager: favoritesManager,
                        onDismiss: {
                            self.selectedProvider = nil
                            self.clusterProviders = nil
                            self.cardZoomLevel = nil
                            self.route = nil
                            self.showingRoute = false
                        },
                        onRoute: {
                            calculateRouteToProvider(nearby.first ?? selectedProvider!)
                        }
                    )
                    .padding()
                    .padding(Edge.Set.bottom, 80)
                }
            }
        }
    }
    
    @ViewBuilder
    private var searchCards: some View {
        if let selectedResult = selectedResult {
            let result = selectedResult
            VStack {
                Spacer()
                LocationDetailCard(
                    item: result,
                    userLocation: userLocation,
                    onDismiss: {
                        self.selectedResult = nil
                        self.route = nil
                        self.showingRoute = false
                    },
                    onRoute: {
                        self.calculateRoute(to: result)
                    }
                )
                .padding()
                .padding(.bottom, 80)
            }
        }
    }
    
    private var mapView: some View {
        Map(position: $cameraPosition) {
            // Benutzerstandort
            if let userLocation = userLocation {
                Annotation("map.my_location".loc, coordinate: userLocation) {
                    ZStack {
                        Circle()
                            .fill(.blue)
                            .frame(width: 20, height: 20)
                        Circle()
                            .stroke(.white, lineWidth: 3)
                            .frame(width: 20, height: 20)
                    }
                }
            }
            
            // Suchradius-Kreis
            if let userLocation = userLocation, !searchText.isEmpty {
                MapCircle(
                    center: userLocation,
                    radius: searchRadius * 1000
                )
                .foregroundStyle(.blue.opacity(0.1))
                .stroke(.blue, lineWidth: 2)
            }
            
            // Supabase Service Providers: Cluster oder einzelne Pins (je nach Zoom)
            ForEach(clusteredProviders) { cluster in
                if cluster.showIndividualPins {
                    // ≤20 Provider → alle als einzelne Pins darstellen
                    ForEach(cluster.providers, id: \.id) { provider in
                        let isActive = provider.id == highlightedProviderID
                        Annotation(
                            provider.name,
                            coordinate: CLLocationCoordinate2D(latitude: provider.latitude, longitude: provider.longitude)
                        ) {
                            Button {
                                clusterProviders = nil
                                // Zoom-Level einfrieren: beim Swipen bleibt dieser Wert stabil
                                cardZoomLevel = currentZoomLevel
                                selectedProvider = provider
                                selectedResult = nil
                                // Index des Providers in der bidirektionalen Liste finden
                                selectedProviderIndex = selectedProviderStartIndex
                                centerOnProvider(provider)
                            } label: {
                                ServiceProviderPin(
                                    provider: provider,
                                    showLabel: shouldShowLabels,
                                    isFavorite: favoritesManager.isFavorite(provider.id),
                                    isHighlighted: isActive
                                )
                            }
                            .zIndex(isActive ? 100 : 0)
                        }
                    }
                } else {
                    // >20 Provider → Cluster-Badge mit Zahl
                    Annotation(
                        "\(cluster.count) Betriebe",
                        coordinate: cluster.coordinate
                    ) {
                        Button {
                            // Beim Tappen auf Cluster: Reinzoomen
                            zoomIntoCluster(cluster)
                        } label: {
                            ClusterBadge(count: cluster.count)
                        }
                    }
                }
            }
            
            // Apple Maps Suchergebnisse
            ForEach(searchResults, id: \.self) { item in
                if let location = getItemLocation(item) {
                    Marker(item.name ?? "Unbekannt", coordinate: location)
                        .tint(.red)
                }
            }
            
            // Route
            if let route = route {
                MapPolyline(route.polyline)
                    .stroke(.blue, lineWidth: 5)
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .onMapCameraChange { context in
            // Tracke die aktuelle Region und Zoom-Level
            currentRegion = context.region
            currentZoomLevel = context.region.span.latitudeDelta

            // Speichere Kamera-Position für nächsten Start
            UserDefaults.standard.set(context.region.center.latitude, forKey: cameraLatKey)
            UserDefaults.standard.set(context.region.center.longitude, forKey: cameraLonKey)
            UserDefaults.standard.set(context.region.span.latitudeDelta, forKey: cameraZoomKey)

            // Debounce: Warte 0.5 s nach letzter Bewegung, dann lade neue Region
            scheduleRegionLoad(for: context.region)
        }
        .ignoresSafeArea()
    }
    
    // Berechne ob Labels angezeigt werden sollen basierend auf Zoom-Level
    private var shouldShowLabels: Bool {
        // Labels erst bei sehr starkem Zoom (latitudeDelta < 0.02 ≈ Straßenebene)
        // Verhindert überlappende Beschriftungen bei weiter Ansicht
        currentZoomLevel < 0.02
    }
    
    private var topOverlays: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                appIcon
                compactSearchBar
                Spacer()
                loginIcon
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            
            if !searchResults.isEmpty && selectedResult == nil {
                searchResultsList
                    .padding(.top, 8)
            }
        }
    }
    
    private var bottomRightButtons: some View {
        VStack(spacing: 12) {
            Spacer()
            
            HStack {
                Spacer()
                
                VStack(spacing: 12) {
                    // Boots-Assistent Button
                    Button {
                        showingAssistant = true
                    } label: {
                        Image(systemName: "bubble.left.and.text.bubble.right.fill")
                            .font(.title3)
                            .foregroundStyle(.orange)
                            .frame(width: 50, height: 50)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                            .shadow(radius: 3)
                    }

                    // Geolokalisierung Button
                    Button {
                        centerOnUserLocation()
                    } label: {
                        Image(systemName: "location.fill")
                            .font(.title3)
                            .foregroundStyle(.blue)
                            .frame(width: 50, height: 50)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                            .shadow(radius: 3)
                    }

                    // + Button für neue Servicebetriebe
                    Button {
                        if authService.isAuthenticated {
                            showingAddBusiness = true
                        } else {
                            showingLoginRequired = true
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(.blue.gradient)
                            .clipShape(Circle())
                            .shadow(radius: 5)
                    }
                }
                .padding(.trailing, 16)
                .padding(.bottom, 100)
            }
        }
    }
    
    private var appIcon: some View {
        SkipilyLogoIcon(size: 44)
    }
    
    private var loginIcon: some View {
        Button {
            if authService.isAuthenticated {
                showingProfile = true
            } else {
                showingLogin = true
            }
        } label: {
            Image(systemName: authService.isAuthenticated ? "person.fill.checkmark" : "person.circle")
                .font(.title2)
                .foregroundStyle(authService.isAuthenticated ? .green : .blue)
                .frame(width: 44, height: 44)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
                .shadow(radius: 3)
        }
    }
    
    private var compactSearchBar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)

                TextField("map.search_placeholder".loc, text: $searchText, onCommit: {
                    performSearch()
                })
                .textFieldStyle(.plain)
                .onSubmit {
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                }
                
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        searchResults = []
                        selectedResult = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                }
                
                // Kategorie-Auswahl direkt in Suchfeld
                Menu {
                    ForEach(ServiceCategory.allCases, id: \.self) { category in
                        Button {
                            selectedCategory = category
                            // Filter werden automatisch durch onChange angewendet
                        } label: {
                            HStack {
                                Image(systemName: iconForCategory(category))
                                Text(category.displayName)
                                if selectedCategory == category {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: iconForCategory(selectedCategory))
                            .font(.caption)
                        Text(selectedCategory.displayName)
                            .font(.caption)
                            .fontWeight(.medium)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.caption2)
                    }
                    .foregroundColor(.blue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.blue.opacity(0.1))
                    .cornerRadius(6)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
            .cornerRadius(12)
            .shadow(radius: 3)
        }
    }
    
    private var searchResultsList: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(searchResults, id: \.self) { item in
                    SearchResultRow(item: item) {
                        selectedResult = item
                        selectedProvider = nil
                        if let location = getItemLocation(item) {
                            cameraPosition = .region(MKCoordinateRegion(
                                center: location,
                                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                            ))
                        }
                    }
                    
                    if item != searchResults.last {
                        Divider()
                    }
                }
            }
            .background(.ultraThinMaterial)
            .cornerRadius(12)
            .shadow(radius: 5)
            .padding(.horizontal)
        }
        .frame(maxHeight: 300)
    }
    
    // MARK: - Helper Functions
    
    private func restoreCameraPosition() {
        // Versuche gespeicherte Kamera-Position wiederherzustellen
        let savedLat = UserDefaults.standard.double(forKey: cameraLatKey)
        let savedLon = UserDefaults.standard.double(forKey: cameraLonKey)
        let savedZoom = UserDefaults.standard.double(forKey: cameraZoomKey)
        
        if savedLat != 0 && savedLon != 0 && savedZoom != 0 {
            // Gespeicherte Position gefunden
            let center = CLLocationCoordinate2D(latitude: savedLat, longitude: savedLon)
            let span = MKCoordinateSpan(latitudeDelta: savedZoom, longitudeDelta: savedZoom)
            let region = MKCoordinateRegion(center: center, span: span)
            
            cameraPosition = .region(region)
            currentRegion = region
            currentZoomLevel = savedZoom
            
            print("📍 Restored camera position: \(savedLat), \(savedLon) with zoom: \(savedZoom)")
        } else {
            print("📍 No saved camera position found, using default")
        }
    }
    
    private func setupLocation() {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestPermission()
        case .authorizedWhenInUse, .authorizedAlways:
            if let location = locationManager.location {
                userLocation = location.coordinate
                // KEINE automatische Kamera-Bewegung - nur wenn keine Position gespeichert ist
                let hasSavedPosition = UserDefaults.standard.double(forKey: cameraLatKey) != 0
                if !hasSavedPosition {
                    centerOnUserLocation()
                }
            }
        case .denied, .restricted:
            showingLocationError = true
            locationErrorMessage = "map.location_denied".loc
        @unknown default:
            break
        }
    }

    /// Initiales Laden: Startet die Kamera und lädt Provider der Startregion.
    private func loadSupabaseProviders() {
        print("🔍 MapScreen: Initializing region-based provider loading...")

        Task {
            await MainActor.run {
                let hasSavedPosition = UserDefaults.standard.double(forKey: cameraLatKey) != 0

                if hasSavedPosition {
                    print("   📍 Using restored camera position")
                    // Region wird über onMapCameraChange->scheduleRegionLoad getriggert
                } else if userLocation != nil {
                    centerOnUserLocation()
                } else {
                    // Fallback: Zentriere auf Deutschland
                    cameraPosition = .region(MKCoordinateRegion(
                        center: CLLocationCoordinate2D(latitude: 51.1657, longitude: 10.4515),
                        span: MKCoordinateSpan(latitudeDelta: 8.0, longitudeDelta: 8.0)
                    ))
                    print("   📍 Camera centered on Germany (fallback)")
                }

                // Starte sofortigen Load für die aktuelle Region (ohne Debounce)
                if let region = currentRegion {
                    Task { await providerManager.loadProviders(in: region) }
                }
            }
        }
    }

    /// Debounced Region-Reload: bricht vorherigen Task ab, wartet kurz, lädt dann.
    /// Verhindert unnötige DB-Aufrufe während das Scrollen/Zoomen noch läuft.
    private func scheduleRegionLoad(for region: MKCoordinateRegion) {
        regionLoadTask?.cancel()
        regionLoadTask = Task {
            // 0.2 s Debounce — kurz genug, dass Provider-Logos nicht spürbar
            // verzögert werden, lang genug um doppelte Fetches beim Scrollen
            // zu vermeiden.
            try? await Task.sleep(nanoseconds: 200_000_000)
            guard !Task.isCancelled else { return }

            // Prüfe ob sich die Region wesentlich verändert hat (> 10 % des Spans)
            if let last = lastLoadedRegion {
                let deltaLat = abs(region.center.latitude  - last.center.latitude)
                let deltaLon = abs(region.center.longitude - last.center.longitude)
                let threshold = max(last.span.latitudeDelta, region.span.latitudeDelta) * 0.10
                let zoomChanged = abs(region.span.latitudeDelta - last.span.latitudeDelta) > last.span.latitudeDelta * 0.15

                if deltaLat < threshold && deltaLon < threshold && !zoomChanged {
                    return // Kaum bewegt – kein neuer Fetch nötig
                }
            }

            lastLoadedRegion = region
            await providerManager.loadProviders(in: region)
            print("🗺️ Region reloaded: center=(\(String(format:"%.3f",region.center.latitude)),\(String(format:"%.3f",region.center.longitude))) span=\(String(format:"%.3f",region.span.latitudeDelta))°")
        }
    }
    
    private func handleAuthorizationChange(_ status: CLAuthorizationStatus) {
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            if let location = locationManager.location {
                userLocation = location.coordinate
                // KEINE automatische Kamera-Bewegung - nur wenn keine Position gespeichert ist
                let hasSavedPosition = UserDefaults.standard.double(forKey: cameraLatKey) != 0
                if !hasSavedPosition {
                    centerOnUserLocation()
                }
            }
        case .denied, .restricted:
            showingLocationError = true
            locationErrorMessage = "map.location_denied".loc
        default:
            break
        }
    }
    
    private func centerOnUserLocation() {
        guard let location = userLocation else { return }
        print("🎥 Camera: Centering on user location")
        cameraPosition = .region(MKCoordinateRegion(
            center: location,
            span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
        ))
    }

    /// Zentriert die Kamera so, dass der Provider im oberen Drittel der Karte sichtbar ist
    /// (oberhalb der Kachel). Der Kartenmittelpunkt wird nach unten verschoben,
    /// damit der Provider optisch über der Detailkarte liegt.
    ///
    /// Nutzt `cardZoomLevel` wenn ein Cluster geöffnet wurde, damit der Zoom-Level
    /// beim Swipen stabil bleibt und die einzelnen Pins sichtbar sind.
    private func centerOnProvider(_ provider: BoatServiceProvider, animated: Bool = true) {
        // Cluster-Zoom-Level hat Vorrang – verhindert Raus-Zoomen beim Swipen
        let zoom = cardZoomLevel ?? currentZoomLevel

        // Die Kachel nimmt ca. 45% des Bildschirms ein (400px Kachel + 80px Tab-Bar).
        // Verschiebe den Karten-Mittelpunkt um ~35% des sichtbaren Spans nach unten,
        // damit der Provider im oberen Bereich erscheint.
        let offsetFraction = 0.35
        let adjustedLat = provider.latitude - (zoom * offsetFraction)

        let region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: adjustedLat, longitude: provider.longitude),
            span: MKCoordinateSpan(latitudeDelta: zoom, longitudeDelta: zoom)
        )

        if animated {
            withAnimation(.easeInOut(duration: 0.3)) {
                cameraPosition = .region(region)
            }
        } else {
            cameraPosition = .region(region)
        }
    }

    /// Zoomt in einen Cluster hinein, um die einzelnen Provider sichtbar zu machen
    private func zoomIntoCluster(_ cluster: MapCluster) {
        let lats = cluster.providers.map(\.latitude)
        let lons = cluster.providers.map(\.longitude)

        guard let minLat = lats.min(), let maxLat = lats.max(),
              let minLon = lons.min(), let maxLon = lons.max() else { return }

        let centerLat = (minLat + maxLat) / 2
        let centerLon = (minLon + maxLon) / 2

        // Span so wählen, dass alle Provider sichtbar sind, aber etwas näher
        let spanLat = max((maxLat - minLat) * 1.5, 0.005)
        let spanLon = max((maxLon - minLon) * 1.5, 0.005)

        withAnimation(.easeInOut(duration: 0.5)) {
            cameraPosition = .region(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: centerLat, longitude: centerLon),
                span: MKCoordinateSpan(latitudeDelta: spanLat, longitudeDelta: spanLon)
            ))
        }
    }
    
    private func performSearch() {
        // Filterung passiert rein lokal über visibleProviders – kein extra DB-Aufruf nötig.
        // Bei Suche kann die aktuelle Region neu geladen werden, um Treffer außerhalb des
        // aktuellen Ausschnitts zu finden (optional: Apple Maps Suche bleibt erhalten).
    }
    
    private func calculateRoute(to item: MKMapItem) {
        guard let userLocation = userLocation else { return }
        
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: userLocation))
        request.destination = item
        request.transportType = .automobile
        
        let directions = MKDirections(request: request)
        directions.calculate { response, error in
            if let error = error {
                print("Routenberechnung fehlgeschlagen: \(error.localizedDescription)")
                return
            }
            
            if let route = response?.routes.first {
                self.route = route
                self.showingRoute = true
                
                if let itemLocation = getItemLocation(item) {
                    let padding = UIEdgeInsets(top: 100, left: 50, bottom: 300, right: 50)
                    cameraPosition = .region(calculateRegion(from: userLocation, to: itemLocation, padding: padding))
                }
            }
        }
    }
    
    private func calculateRouteToProvider(_ provider: BoatServiceProvider) {
        guard let userLocation = userLocation else { return }
        
        let destination = CLLocationCoordinate2D(latitude: provider.latitude, longitude: provider.longitude)
        let destinationItem = MKMapItem(placemark: MKPlacemark(coordinate: destination))
        destinationItem.name = provider.name

        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: userLocation))
        request.destination = destinationItem
        request.transportType = .automobile
        
        let directions = MKDirections(request: request)
        directions.calculate { response, error in
            if let error = error {
                print("Routenberechnung fehlgeschlagen: \(error.localizedDescription)")
                return
            }
            
            if let route = response?.routes.first {
                self.route = route
                self.showingRoute = true
                
                let padding = UIEdgeInsets(top: 100, left: 50, bottom: 300, right: 50)
                cameraPosition = .region(calculateRegion(from: userLocation, to: destination, padding: padding))
            }
        }
    }
    
    private func calculateRegion(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D, padding: UIEdgeInsets) -> MKCoordinateRegion {
        let minLat = min(from.latitude, to.latitude)
        let maxLat = max(from.latitude, to.latitude)
        let minLon = min(from.longitude, to.longitude)
        let maxLon = max(from.longitude, to.longitude)
        
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        
        let span = MKCoordinateSpan(
            latitudeDelta: (maxLat - minLat) * 1.5,
            longitudeDelta: (maxLon - minLon) * 1.5
        )
        
        return MKCoordinateRegion(center: center, span: span)
    }
    
    private func getItemLocation(_ item: MKMapItem) -> CLLocationCoordinate2D? {
        if #available(iOS 26.0, *) {
            return item.location.coordinate
        } else {
            return item.placemark.coordinate
        }
    }
    
    private func iconForCategory(_ category: ServiceCategory) -> String {
        switch category {
        case .all: return "list.bullet"
        case .repair: return "wrench.and.screwdriver.fill"
        case .supplies: return "cart.fill"
        case .fuel: return "fuelpump.fill"
        case .sailmaker: return "wind"
        case .rigging: return "arrow.up.and.down"
        case .instruments: return "antenna.radiowaves.left.and.right"
        case .marina: return "water.waves"
        }
    }
    
    private func iconForProviderCategory(_ category: String) -> String {
        switch category.lowercased() {
        case "repair", "werkstatt": return "wrench.and.screwdriver.fill"
        case "supplies", "versorgung": return "cart.fill"
        case "fuel", "tankstelle": return "fuelpump.fill"
        case "sailmaker", "segelmacher": return "scissors"
        case "rigging", "tauwerk": return "link.circle.fill"
        case "electronics", "elektronik": return "bolt.fill"
        default: return "mappin.circle.fill"
        }
    }
    
    private func colorForProviderCategory(_ category: String) -> Color {
        switch category.lowercased() {
        case "repair", "werkstatt": return .orange
        case "supplies", "versorgung": return .green
        case "fuel", "tankstelle": return .red
        case "sailmaker", "segelmacher": return .purple
        case "rigging", "tauwerk": return .brown
        case "electronics", "elektronik": return .blue
        default: return .blue
        }
    }
}

// MARK: - Placeholder Screens


// MARK: - Search Result Row

struct SearchResultRow: View {
    let item: MKMapItem
    let action: () -> Void
    
    private var itemAddress: String? {
        if #available(iOS 26.0, *) {
            return item.name
        } else {
            return item.placemark.title
        }
    }
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: iconForCategory(item.pointOfInterestCategory))
                    .foregroundColor(.blue)
                    .frame(width: 30)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name ?? "Unbekannt")
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    if let address = itemAddress {
                        Text(address)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .foregroundColor(.secondary)
                    .font(.caption)
            }
            .padding()
        }
    }
    
    private func iconForCategory(_ category: MKPointOfInterestCategory?) -> String {
        guard let category = category else { return "wrench.and.screwdriver.fill" }
        
        switch category {
        case .gasStation: return "fuelpump.fill"
        case .store: return "cart.fill"
        default: return "wrench.and.screwdriver.fill"
        }
    }
}

// MARK: - Location Detail Card

struct LocationDetailCard: View {
    let item: MKMapItem
    let userLocation: CLLocationCoordinate2D?
    let onDismiss: () -> Void
    let onRoute: () -> Void
    
    private var itemLocation: CLLocationCoordinate2D? {
        if #available(iOS 26.0, *) {
            return item.location.coordinate
        } else {
            return item.placemark.coordinate
        }
    }
    
    private var itemAddress: String? {
        if #available(iOS 26.0, *) {
            return item.name
        } else {
            return item.placemark.title
        }
    }
    
    var body: some View {
        VStack(spacing: 15) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.name ?? "Unbekannt")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    if let address = itemAddress {
                        Text(address)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                        .font(.title2)
                }
            }
            
            Divider()
            
            if let location = itemLocation, let userLocation = userLocation {
                HStack {
                    Label(
                        formatDistance(from: userLocation, to: location),
                        systemImage: "location.fill"
                    )
                    .font(.subheadline)
                    
                    Spacer()
                    
                    if let phone = item.phoneNumber {
                        Link(destination: URL(string: "tel:\(phone)")!) {
                            Label("map.call".loc, systemImage: "phone.fill")
                                .font(.subheadline)
                        }
                    }
                }
            }
            
            HStack(spacing: 12) {
                Button(action: onRoute) {
                    HStack {
                        Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                        Text("provider.route".loc)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }

                if let url = item.url {
                    Link(destination: url) {
                        HStack {
                            Image(systemName: "map.fill")
                            Text("map.open_in_maps".loc)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.green)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .cornerRadius(20)
        .shadow(radius: 10)
    }
    
    private func formatDistance(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> String {
        let fromLocation = CLLocation(latitude: from.latitude, longitude: from.longitude)
        let toLocation = CLLocation(latitude: to.latitude, longitude: to.longitude)
        let distance = fromLocation.distance(from: toLocation)
        
        if distance < 1000 {
            return String(format: "%.0f m", distance)
        } else {
            return String(format: "%.1f km", distance / 1000)
        }
    }
}

// MARK: - Service Provider Pin (Tropfenform mit Farben)

struct ServiceProviderPin: View {
    let provider: BoatServiceProvider
    let showLabel: Bool
    let isFavorite: Bool
    var isHighlighted: Bool = false

    // Größe: hervorgehoben = größer
    private var pinSize: CGFloat { isHighlighted ? 40 : 28 }
    private var iconSize: CGFloat { isHighlighted ? 18 : 13 }
    private var borderWidth: CGFloat { isHighlighted ? 3 : 2 }
    private var triangleWidth: CGFloat { isHighlighted ? 16 : 12 }
    private var triangleHeight: CGFloat { isHighlighted ? 12 : 9 }

    var pinColor: Color {
        guard let rating = provider.rating else { return .blue } // Keine Bewertung
        if rating == 0 { return .blue }      // Keine Bewertung
        if rating >= 4.0 { return .green }   // Sehr gut (≥ 4 Sterne)
        if rating <= 2.0 { return .red }     // Schlecht (≤ 2 Sterne)
        return .yellow                        // Mittel (2-4 Sterne)
    }

    var iconName: String {
        // Verwende primäre Kategorie (erste aus categories oder category)
        let cat = provider.primaryCategory.lowercased()
        if cat.contains("werkstatt") || cat.contains("repair") || cat.contains("werft") {
            return "wrench.and.screwdriver.fill"
        } else if cat.contains("versorgung") || cat.contains("supplies") || cat.contains("shop") || cat.contains("tauwerk") {
            return "cart.fill"
        } else if cat.contains("tankstelle") || cat.contains("fuel") {
            return "fuelpump.fill"
        } else if cat.contains("segelmacher") || cat.contains("sailmaker") || cat.contains("segel") {
            return "wind"
        } else if cat.contains("rigg") || cat.contains("rigging") {
            return "arrow.up.and.down"
        } else if cat.contains("elektronik") || cat.contains("instruments") {
            return "antenna.radiowaves.left.and.right"
        } else if cat.contains("marina") {
            return "water.waves"
        } else {
            return "sailboat.fill"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Tropfen-Kopf mit Icon
            ZStack {
                // Orange Highlight-Ring (nur bei aktiviertem Pin)
                if isHighlighted {
                    Circle()
                        .fill(Color.orange.opacity(0.2))
                        .frame(width: pinSize + 14, height: pinSize + 14)

                    Circle()
                        .stroke(Color.orange, lineWidth: 2.5)
                        .frame(width: pinSize + 14, height: pinSize + 14)
                }

                // Hintergrund-Kreis – immer in Bewertungsfarbe
                Circle()
                    .fill(pinColor.gradient)
                    .frame(width: pinSize, height: pinSize)

                // Rand: bei Highlight dicker und in Bewertungsfarbe abgesetzt
                Circle()
                    .stroke(.white, lineWidth: borderWidth)
                    .frame(width: pinSize, height: pinSize)

                // Icon
                Image(systemName: iconName)
                    .font(.system(size: iconSize, weight: .bold))
                    .foregroundStyle(.white)

                // Favoriten-Herz (klein, oben rechts)
                if isFavorite {
                    Image(systemName: "heart.fill")
                        .font(.system(size: isHighlighted ? 10 : 8, weight: .bold))
                        .foregroundStyle(.red)
                        .background(
                            Circle()
                                .fill(.white)
                                .frame(width: isHighlighted ? 16 : 12, height: isHighlighted ? 16 : 12)
                        )
                        .offset(x: isHighlighted ? 14 : 10, y: isHighlighted ? -14 : -10)
                }
            }

            // Tropfen-Spitze – immer in Bewertungsfarbe
            Triangle()
                .fill(pinColor.gradient)
                .frame(width: triangleWidth, height: triangleHeight)
                .offset(y: -1)

            // Label mit Name (bei Highlight immer sichtbar, sonst nur bei starkem Zoom)
            if showLabel || isHighlighted {
                Text(provider.name)
                    .font(.system(size: isHighlighted ? 10 : 8, weight: isHighlighted ? .bold : .medium))
                    .foregroundStyle(isHighlighted ? pinColor : .primary)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, isHighlighted ? 6 : 4)
                    .padding(.vertical, isHighlighted ? 3 : 2)
                    .background {
                        if isHighlighted {
                            Color.white
                        } else {
                            Rectangle().fill(.ultraThinMaterial)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .shadow(color: isHighlighted ? pinColor.opacity(0.4) : .clear, radius: 4)
                    .offset(y: 2)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: isHighlighted)
    }
}

// Hilfs-Shape für Tropfenspitze
struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Location Manager

class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    
    @Published var location: CLLocation?
    @Published var authorizationStatus: CLAuthorizationStatus
    
    override init() {
        self.authorizationStatus = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }
    
    func requestPermission() {
        manager.requestWhenInUseAuthorization()
    }
    
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        
        switch authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        case .denied, .restricted:
            manager.stopUpdatingLocation()
        default:
            break
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.last
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Standortfehler: \(error.localizedDescription)")
    }
}

// MARK: - Add Business View

//
//  AddBusinessView.swift
//  Skipily
//
//  Service Provider mit Geocoding hinzufügen
//

import SwiftUI
import MapKit
import CoreLocation

struct AddBusinessView: View {
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss
    
    let onBusinessAdded: () -> Void
    
    @State private var name = ""
    @State private var category = "repair"
    @State private var address = ""
    @State private var city = ""
    @State private var postalCode = ""
    @State private var country = "Deutschland"
    @State private var phone = ""
    @State private var email = ""
    @State private var website = ""
    @State private var description = ""
    @State private var brands = ""
    @State private var promotion = ""
    @State private var shopUrl = ""

    @State private var coordinates: CLLocationCoordinate2D?
    @State private var isGeocoding = false
    @State private var geocodingError: String?
    
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""
    @State private var showSuccessAlert = false
    
    let categories: [(String, String)] = [
        ("Motor Service", "Motor Service"),
        ("Segelmacher", "Segel & Persenning"),
        ("instruments", "Yacht & Bootsinstrumente"),
        ("boat supplies", "Yacht & Bootszubehör"),
        ("surveyor", "Gutachter"),
        ("krane", "Kran")
    ]
    
    var fullAddress: String {
        "\(address), \(postalCode) \(city), \(country)"
    }
    
    var body: some View {
        NavigationView {
            Form {
                basicInfoSection
                addressSection
                contactSection
                descriptionSection
                promotionSection
                footerSection
            }
            .navigationTitle("map.add_business".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("general.cancel".loc) {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("general.save".loc) {
                        saveBusiness()
                    }
                    .disabled(!isFormValid || isSaving)
                }
            }
            .alert("general.error".loc, isPresented: $showError) {
                Button("general.ok".loc, role: .cancel) { }
            } message: {
                Text(errorMessage)
            }
            .alert("map.submitted".loc, isPresented: $showSuccessAlert) {
                Button("general.ok".loc) {
                    dismiss()
                    onBusinessAdded()
                }
            } message: {
                Text("map.submitted_hint".loc)
            }
        }
    }
    
    // MARK: - Form Sections
    
    private var basicInfoSection: some View {
        Section("map.section_basic".loc) {
            TextField("map.company_name".loc, text: $name)

            Picker("map.category".loc, selection: $category) {
                ForEach(0..<categories.count, id: \.self) { index in
                    Text(categories[index].1).tag(categories[index].0)
                }
            }

            TextField("map.brands_hint".loc, text: $brands)
        }
    }

    private var addressSection: some View {
        Section("map.section_address".loc) {
            TextField("map.street".loc, text: $address)
            TextField("map.postal_code".loc, text: $postalCode)
                .keyboardType(.numberPad)
            TextField("boats.home_port".loc, text: $city)
            TextField("profile.country".loc, text: $country)

            geocodeButton

            if let coords = coordinates {
                coordinatesDisplay(coords)
            }

            if let error = geocodingError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    private var geocodeButton: some View {
        Button {
            geocodeAddress()
        } label: {
            HStack {
                if isGeocoding {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "location.circle.fill")
                }
                Text("map.get_coordinates".loc)
            }
        }
        .disabled(address.isEmpty || city.isEmpty || isGeocoding)
    }

    private func coordinatesDisplay(_ coords: CLLocationCoordinate2D) -> some View {
        HStack {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
            VStack(alignment: .leading, spacing: 2) {
                Text("map.coordinates_found".loc)
                    .font(.caption)
                Text("Lat: \(coords.latitude, specifier: "%.6f"), Lon: \(coords.longitude, specifier: "%.6f")")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }

    private var contactSection: some View {
        Section("provider.contact".loc) {
            TextField("provider.phone".loc, text: $phone)
                .keyboardType(.phonePad)
            TextField("provider.email".loc, text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
            TextField("provider.website".loc, text: $website)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
        }
    }

    private var descriptionSection: some View {
        Section("provider.description".loc) {
            TextField("map.services_description".loc, text: $description, axis: .vertical)
                .lineLimit(3...6)
        }
    }

    private var promotionSection: some View {
        Section("marketplace.offer".loc) {
            TextField("marketplace.promotion_placeholder".loc, text: $promotion, axis: .vertical)
                .lineLimit(2...4)
            TextField("marketplace.shop_url_placeholder".loc, text: $shopUrl)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
        }
    }

    private var footerSection: some View {
        Section {
            Text("map.required_fields".loc)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
    
    private var isFormValid: Bool {
        !name.isEmpty && !address.isEmpty && !city.isEmpty && !postalCode.isEmpty && coordinates != nil
    }
    
    private func geocodeAddress() {
        isGeocoding = true
        geocodingError = nil
        
        let geocoder = CLGeocoder()
        geocoder.geocodeAddressString(fullAddress) { placemarks, error in
            isGeocoding = false
            
            if let error = error {
                geocodingError = "Adresse konnte nicht gefunden werden"
                print("Geocoding Error: \(error)")
                return
            }
            
            if let location = placemarks?.first?.location {
                coordinates = location.coordinate
                geocodingError = nil
            } else {
                geocodingError = "Keine Koordinaten gefunden"
            }
        }
    }
    
    private func saveBusiness() {
        guard let userId = authService.currentUser?.id,
              let coords = coordinates else {
            return
        }

        isSaving = true

        Task {
            do {
                struct BusinessInsert: Encodable {
                    let user_id: String
                    let name: String
                    let category: String
                    let street: String?
                    let latitude: Double
                    let longitude: Double
                    let phone: String?
                    let email: String?
                    let website: String?
                    let description: String?
                    let brands: [String]?
                    let current_promotion: String?
                    let shop_url: String?
                }

                // Adresse als ein Feld zusammenbauen (wie in der Supabase-Tabelle)
                let fullAddr = [address, "\(postalCode) \(city)", country]
                    .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                    .joined(separator: ", ")

                // Marken aus kommagetrentem String in Array umwandeln
                let brandsArray = brands
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }

                let businessInsert = BusinessInsert(
                    user_id: userId.uuidString,
                    name: name,
                    category: category,
                    street: fullAddr.isEmpty ? nil : fullAddr,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    phone: phone.isEmpty ? nil : phone,
                    email: email.isEmpty ? nil : email,
                    website: website.isEmpty ? nil : website,
                    description: description.isEmpty ? nil : description,
                    brands: brandsArray.isEmpty ? nil : brandsArray,
                    current_promotion: promotion.isEmpty ? nil : promotion,
                    shop_url: shopUrl.isEmpty ? nil : shopUrl
                )

                try await authService.supabase
                    .from("service_providers")
                    .insert(businessInsert)
                    .execute()

                showSuccessAlert = true
            } catch {
                errorMessage = "Betrieb konnte nicht gespeichert werden: \(error.localizedDescription)"
                showError = true
            }
            
            isSaving = false
        }
    }
} // <-- Inserted closing brace here to close AddBusinessView


// MARK: - Provider Detail Card
// Diese Struct DIREKT VOR "// MARK: - Login View" einfügen

// MARK: - Provider Detail Card (Kurzübersicht auf Karte)
// VERBESSERTE VERSION - Ersetze die alte ProviderDetailCard

struct ProviderDetailCard: View {
    let provider: BoatServiceProvider
    let userLocation: CLLocationCoordinate2D?
    @ObservedObject var favoritesManager: FavoritesManager
    @EnvironmentObject var authService: AuthService
    let onDismiss: () -> Void
    let onRoute: () -> Void

    @State private var showingDetailView = false
    @State private var showingLoginRequired = false
    @State private var showingLogin = false
    @State private var serviceNames: [String] = []
    
    private var isFavorite: Bool {
        favoritesManager.isFavorite(provider.id)
    }
    
    private var serviceProvider: ServiceProvider {
        ServiceProvider(
            id: provider.id,
            user_id: nil,
            name: provider.name,
            category: provider.category,
            category2: provider.category2,
            category3: provider.category3,
            street: provider.street,
            city: provider.city,
            postalCode: provider.postal_code,
            country: provider.country,
            latitude: provider.latitude,
            longitude: provider.longitude,
            phone: provider.phone,
            email: provider.email,
            website: provider.website,
            description: provider.description,
            logoUrl: provider.logo_url,
            coverImageUrl: provider.cover_image_url,
            galleryUrls: nil,
            slogan: nil,
            rating: provider.rating,
            reviewCount: provider.review_count,
            services: provider.services,
            products: provider.products,
            brands: provider.brands,
            openingHours: provider.opening_hours,
            createdAt: nil,
            updatedAt: nil,
            currentPromotion: provider.current_promotion,
            shopUrl: provider.shop_url
        )
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Header mit Logo, Name, Rating und Buttons
                HStack {
                    // Logo (skip expired Google Places URLs)
                    if let url = provider.logo_url.usableImageURL {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFit()
                            case .failure:
                                Image(systemName: "building.2.fill")
                                    .foregroundStyle(.gray)
                            default:
                                ProgressView()
                            }
                        }
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .shadow(color: .black.opacity(0.1), radius: 2)
                    } else {
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.blue.opacity(0.6))
                            .frame(width: 48, height: 48)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(provider.name)
                            .font(.title3)
                            .fontWeight(.bold)

                        // Rating direkt unter Name
                        HStack(spacing: 4) {
                            ForEach(0..<5) { index in
                                Image(systemName: index < Int((provider.rating ?? 0.0).rounded()) ? "star.fill" : "star")
                                    .font(.caption2)
                                    .foregroundStyle(.yellow)
                            }
                            Text(String(format: "%.1f", provider.rating ?? 0.0))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Spacer()
                    
                    VStack(spacing: 8) {
                        Button {
                            favoritesManager.toggleFavorite(card: favoriteCard(from: provider))
                        } label: {
                            Image(systemName: isFavorite ? "heart.fill" : "heart")
                                .foregroundColor(isFavorite ? .red : .secondary)
                                .font(.title3)
                        }
                        
                        Button(action: onDismiss) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                                .font(.title3)
                        }
                    }
                }
                
                // Adresse
                HStack(spacing: 4) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.caption)
                        .foregroundColor(.blue)
                    Text(provider.address)
                        .font(.caption)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                // Mehr Details Button (Login erforderlich)
                Button {
                    if authService.isAuthenticated {
                        showingDetailView = true
                    } else {
                        showingLoginRequired = true
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "info.circle.fill")
                            .font(.caption)
                        Text("provider.more_details".loc)
                            .font(.caption)
                            .fontWeight(.medium)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.cyan)
                    .cornerRadius(8)
                }
                
                // Kontakt-Buttons - KOMPAKT
                HStack(spacing: 6) {
                    if let phone = provider.phone, !phone.isEmpty {
                        Link(destination: URL(string: "tel:\(phone)")!) {
                            compactActionButton(icon: "phone.fill", text: "Tel")
                        }
                    }
                    
                    if let email = provider.email, !email.isEmpty {
                        Link(destination: URL(string: "mailto:\(email)")!) {
                            compactActionButton(icon: "envelope.fill", text: "Mail")
                        }
                    }
                    
                    if let website = provider.website, !website.isEmpty, let url = URL(string: website) {
                        Link(destination: url) {
                            compactActionButton(icon: "globe", text: "Web")
                        }
                    }
                    
                    Button {
                        onRoute()
                        onDismiss()
                    } label: {
                        VStack(spacing: 2) {
                            Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                                .font(.callout)
                            Text("Route")
                                .font(.caption2)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(.blue.gradient)
                        .cornerRadius(6)
                    }
                }
                
                // Produktkategorien/Services
                if !serviceNames.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("provider.services".loc)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.secondary)

                        FlowLayout(spacing: 6) {
                            ForEach(serviceNames.prefix(5), id: \.self) { name in
                                Text(name)
                                    .font(.caption2)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.blue.opacity(0.1))
                                    .foregroundColor(.blue)
                                    .cornerRadius(4)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(12)
        }
        .frame(maxHeight: 380) // ✅ Kleiner: 380 statt 500
        .background(.ultraThinMaterial)
        .cornerRadius(16)
        .shadow(radius: 8)
        .sheet(isPresented: $showingDetailView) {
            NavigationStack {
                ServiceProviderDetailView(provider: serviceProvider)
                    .environmentObject(favoritesManager)
                    .environmentObject(authService)
            }
        }
        .sheet(isPresented: $showingLogin) {
            LoginView()
                .environmentObject(authService)
        }
        .alert("map.login_required".loc, isPresented: $showingLoginRequired) {
            Button("general.cancel".loc, role: .cancel) {}
            Button("auth.login".loc) { showingLogin = true }
        } message: {
            Text("map.login_required_hint".loc)
        }
        .task {
            await loadServices()
        }
    }
    
    private func compactActionButton(icon: String, text: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .font(.callout)
            Text(text)
                .font(.caption2)
        }
        .foregroundColor(.blue)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .cornerRadius(6)
    }
    
    private func loadServices() async {
        do {
            struct ServicesResponse: Codable {
                let services: [String]?
            }
            let response: [ServicesResponse] = try await authService.supabase
                .from("service_providers")
                .select("services")
                .eq("id", value: provider.id.uuidString)
                .limit(1)
                .execute()
                .value
            if let fetched = response.first?.services {
                serviceNames = fetched
            }
        } catch {
            print("❌ Error loading services: \(error)")
        }
    }
    
    private func favoriteCard(from provider: BoatServiceProvider) -> FavoriteProviderCard {
        FavoriteProviderCard(
            id: provider.id,
            name: provider.name,
            addressLine: provider.address,
            phone: provider.phone,
            email: provider.email,
            website: provider.website,
            category: provider.category,
            logoUrl: provider.logo_url,
            updatedAt: Date()
        )
    }
}



