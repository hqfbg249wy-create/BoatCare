//
//  ServiceProviderDetailView.swift
//  Skipily
//

import SwiftUI
import CoreLocation
import MapKit

struct ServiceProviderDetailView: View {
    let provider: ServiceProvider
    @EnvironmentObject var favoritesManager: FavoritesManager
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss

    @State private var showingWriteReview = false
    @State private var showingSuggestEdit = false
    @StateObject private var reviewService = ReviewService()
    @StateObject private var suggestionService = EditSuggestionService()
    @StateObject private var locationManager = LocationManager()

    /// Distance text from user to this provider
    private var distanceText: String? {
        guard let userLoc = locationManager.location else { return nil }
        guard provider.latitude != 0 || provider.longitude != 0 else { return nil }
        let provLoc = CLLocation(latitude: provider.latitude, longitude: provider.longitude)
        let distanceMeters = userLoc.distance(from: provLoc)
        let distanceKm = distanceMeters / 1000.0
        if distanceKm < 1 {
            return String(format: "%.0f m", distanceMeters)
        } else if distanceKm < 100 {
            return String(format: "%.1f km", distanceKm)
        } else {
            return String(format: "%.0f km", distanceKm)
        }
    }

    private var isFavorite: Bool {
        favoritesManager.isFavorite(provider.id)
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 0) {

                // 1. Logo
                logoSection

                VStack(alignment: .leading, spacing: 16) {

                    // 2. Kategorien
                    FlowLayout(spacing: 6) {
                        // Primaere Kategorie mit Icon
                        HStack(spacing: 4) {
                            Image(systemName: provider.categoryIcon)
                                .font(.caption)
                            Text(provider.categoryDisplayName)
                        }
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(6)

                        // Weitere Kategorien (ohne Icon)
                        ForEach(provider.allCategories.dropFirst(), id: \.self) { cat in
                            Text(LanguageManager.shared.localizedCategory(cat))
                                .font(.subheadline)
                                .foregroundStyle(.blue)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color.blue.opacity(0.1))
                                .cornerRadius(6)
                        }
                    }

                    // 4. Adresse + Entfernung
                    if !provider.displayAddress.isEmpty || distanceText != nil {
                        HStack(spacing: 8) {
                            Image(systemName: "mappin.circle.fill")
                                .foregroundStyle(.red)
                                .font(.body)
                            VStack(alignment: .leading, spacing: 2) {
                                if let street = provider.street, !street.isEmpty {
                                    Text(street)
                                        .font(.subheadline)
                                }
                                let cityLine = [provider.postalCode, provider.city]
                                    .compactMap { $0 }
                                    .filter { !$0.isEmpty }
                                    .joined(separator: " ")
                                if !cityLine.isEmpty {
                                    Text(cityLine)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                if let country = provider.country, !country.isEmpty {
                                    Text(country)
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            Spacer()
                            // Entfernung zum Anbieter
                            if let dist = distanceText {
                                VStack(spacing: 2) {
                                    Image(systemName: "location.fill")
                                        .font(.caption)
                                        .foregroundStyle(.blue)
                                    Text(dist)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundStyle(.blue)
                                    Text("Entfernung")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    Divider()

                    // 5. Buttons: Route, Website, Telefon, Email
                    contactButtonsSection

                    // 5b. Sonderangebot (prominent, direkt nach Kontakt)
                    promotionBanner

                    // 6. Services → tappable, navigate to provider shop
                    if let services = provider.services, !services.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("provider.services".loc)
                                .font(.headline)
                            FlowLayout(spacing: 8) {
                                ForEach(services, id: \.self) { service in
                                    NavigationLink {
                                        ProviderShopSearchView(providerId: provider.id, providerName: provider.name, searchTerm: service)
                                    } label: {
                                        Label(service, systemImage: "checkmark.circle.fill")
                                            .font(.caption)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(Color.green.opacity(0.1))
                                            .foregroundStyle(.green)
                                            .cornerRadius(6)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    // 7. Brands → tappable, navigate to provider shop filtered by brand
                    if let brands = provider.brands, !brands.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("provider.brands".loc)
                                .font(.headline)
                            FlowLayout(spacing: 8) {
                                ForEach(brands, id: \.self) { brand in
                                    NavigationLink {
                                        ProviderShopSearchView(providerId: provider.id, providerName: provider.name, searchTerm: brand)
                                    } label: {
                                        Label(brand, systemImage: "tag.fill")
                                            .font(.caption)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(Color.orange.opacity(0.1))
                                            .foregroundStyle(.orange)
                                            .cornerRadius(6)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    // Products → tappable, navigate to provider shop
                    if let products = provider.products, !products.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("provider.products".loc)
                                .font(.headline)
                            FlowLayout(spacing: 8) {
                                ForEach(products, id: \.self) { product in
                                    NavigationLink {
                                        ProviderShopSearchView(providerId: provider.id, providerName: provider.name, searchTerm: product)
                                    } label: {
                                        Label(product, systemImage: "shippingbox.fill")
                                            .font(.caption)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(Color.purple.opacity(0.1))
                                            .foregroundStyle(.purple)
                                            .cornerRadius(6)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    // 8. Öffnungszeiten
                    if let hours = provider.openingHours, !hours.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Image(systemName: "clock.fill")
                                    .foregroundStyle(.blue)
                                Text("provider.opening_hours".loc)
                                    .font(.headline)
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(hours.components(separatedBy: "\n"), id: \.self) { line in
                                    if !line.isEmpty {
                                        Text(line)
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    // Beschreibung (falls vorhanden)
                    if let desc = provider.description, !desc.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("provider.description".loc)
                                .font(.headline)
                            Text(desc)
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Bewertungen
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("provider.reviews".loc)
                                .font(.headline)
                            if let avg = provider.rating, avg > 0 {
                                HStack(spacing: 2) {
                                    Image(systemName: "star.fill")
                                        .foregroundStyle(.yellow)
                                        .font(.caption)
                                    Text(String(format: "%.1f", avg))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text("(\(provider.reviewCount ?? 0))")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if authService.isAuthenticated {
                                Button(reviewService.myReview(for: provider.id, userId: authService.currentUser?.id ?? UUID()) != nil
                                       ? "review.edit".loc
                                       : "provider.write_review".loc) {
                                    showingWriteReview = true
                                }
                                .font(.subheadline)
                                .foregroundStyle(.blue)
                            }
                        }

                        if reviewService.isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                        } else if reviewService.reviews.isEmpty {
                            Text("provider.no_reviews".loc)
                                .font(.body)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(reviewService.reviews) { review in
                                ReviewRowView(review: review, isOwn: review.user_id == authService.currentUser?.id)
                            }
                        }
                    }
                    .task {
                        await reviewService.loadReviews(for: provider.id)
                    }
                }
                .padding()
            }
        }
        .navigationTitle(provider.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            locationManager.requestPermission()
        }
        .sheet(isPresented: $showingWriteReview) {
            WriteReviewView(
                providerId: provider.id,
                providerName: provider.name,
                reviewService: reviewService,
                existingReview: reviewService.myReview(
                    for: provider.id,
                    userId: authService.currentUser?.id ?? UUID()
                )
            )
            .environmentObject(authService)
        }
        .sheet(isPresented: $showingSuggestEdit) {
            SuggestEditView(
                provider: provider,
                suggestionService: suggestionService
            )
            .environmentObject(authService)
        }
    }

    // MARK: - Header + Logo Section
    /// Header-Bild: coverImageUrl oder Gradient
    /// Logo: unterhalb des Bildes, zentriert, volle Größe
    /// Rechts oben im Bild: Herz-Favorit + Änderung vorschlagen

    @ViewBuilder
    private var logoSection: some View {
        VStack(spacing: 12) {
            // Header-Foto (volle Breite) mit Overlay-Buttons
            Group {
                if let cover = provider.coverImageUrl, let coverUrl = URL(string: cover) {
                    AsyncImage(url: coverUrl) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            Color(.systemGray5)
                        }
                    }
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .clipped()
                } else {
                    LinearGradient(
                        colors: [Color.blue.opacity(0.3), Color.blue.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .frame(height: 140)
                }
            }
            .overlay(alignment: .topTrailing) {
                // Herz + Änderung vorschlagen (vertikal gestapelt)
                VStack(spacing: 10) {
                    Button {
                        favoritesManager.toggle(provider.id)
                    } label: {
                        Image(systemName: isFavorite ? "heart.fill" : "heart")
                            .font(.title2)
                            .foregroundStyle(isFavorite ? .red : .white)
                            .padding(10)
                            .background(Circle().fill(.black.opacity(0.3)))
                    }

                    if authService.isAuthenticated {
                        Button {
                            showingSuggestEdit = true
                        } label: {
                            Image(systemName: "pencil.line")
                                .font(.title3)
                                .foregroundStyle(.white)
                                .padding(9)
                                .background(Circle().fill(.black.opacity(0.3)))
                        }
                    }
                }
                .padding(12)
            }

            // Logo unterhalb des Bildes – voll sichtbar, zentriert
            Group {
                if let logoUrl = provider.logoUrl, let url = URL(string: logoUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFit()
                                .frame(height: 56)
                                .background(Color(.systemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .shadow(color: .black.opacity(0.12), radius: 6, x: 0, y: 2)
                        default:
                            categoryIconView
                        }
                    }
                } else {
                    categoryIconView
                }
            }
        }
        .padding(.bottom, 4)
    }

    private var categoryIconView: some View {
        Image(systemName: provider.categoryIcon)
            .font(.system(size: 30))
            .foregroundStyle(.blue.opacity(0.6))
            .frame(width: 56, height: 56)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: .black.opacity(0.10), radius: 6, x: 0, y: 2)
    }

    // MARK: - Contact Buttons: Route, Website, Telefon, Email
    @ViewBuilder
    private var contactButtonsSection: some View {
        HStack(spacing: 12) {
            if provider.latitude != 0 || provider.longitude != 0 {
                contactIconButton(
                    icon: "arrow.triangle.turn.up.right.circle.fill",
                    label: "provider.route".loc,
                    color: .blue
                ) { openInMaps() }
            }

            if let website = provider.website {
                contactIconButton(
                    icon: "globe",
                    label: "provider.website".loc,
                    color: .purple
                ) {
                    var urlString = website
                    if !urlString.hasPrefix("http") { urlString = "https://" + urlString }
                    if let url = URL(string: urlString) {
                        UIApplication.shared.open(url)
                    }
                }
            }

            if let phone = provider.phone {
                contactIconButton(
                    icon: "phone.fill",
                    label: "provider.phone".loc,
                    color: .green
                ) {
                    if let url = URL(string: "tel://\(phone.replacingOccurrences(of: " ", with: ""))") {
                        UIApplication.shared.open(url)
                    }
                }
            }

            if let email = provider.email {
                contactIconButton(
                    icon: "envelope.fill",
                    label: "provider.email".loc,
                    color: .blue
                ) {
                    if let url = URL(string: "mailto:\(email)") {
                        UIApplication.shared.open(url)
                    }
                }
            }

            Spacer()
        }
    }

    private func contactIconButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(color)
                    .frame(width: 48, height: 48)
                    .background(color.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Promotion Banner
    @ViewBuilder
    private var promotionBanner: some View {
        if let promo = provider.currentPromotion, !promo.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                // Banner-Header
                HStack(spacing: 8) {
                    Image(systemName: "tag.fill")
                        .font(.title3)
                        .foregroundStyle(.white)
                    Text("provider.special_offer".loc)
                        .font(.headline)
                        .foregroundStyle(.white)
                    Spacer()
                }

                // Promo-Text
                Text(promo)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.95))
                    .fixedSize(horizontal: false, vertical: true)

                // "Zum Shop" Button
                if let shopUrlString = provider.shopUrl,
                   !shopUrlString.isEmpty,
                   let shopUrl = URL(string: shopUrlString.hasPrefix("http") ? shopUrlString : "https://\(shopUrlString)") {
                    Button {
                        UIApplication.shared.open(shopUrl)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "cart.fill")
                                .font(.subheadline)
                            Text("provider.go_to_shop".loc)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                        }
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .background(
                LinearGradient(
                    colors: [Color.orange, Color.orange.opacity(0.85)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    // MARK: - Route in Apple Maps
    private func openInMaps() {
        let coordinate = CLLocationCoordinate2D(latitude: provider.latitude, longitude: provider.longitude)
        let mapItem = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        mapItem.name = provider.name
        mapItem.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
    }
}

// MARK: - Write Review View (funktionsfaehig mit Supabase)
struct WriteReviewView: View {
    let providerId: UUID
    let providerName: String
    @ObservedObject var reviewService: ReviewService
    let existingReview: Review?

    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss

    @State private var rating: Int = 5
    @State private var comment: String = ""
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("review.rating".loc) {
                    HStack {
                        ForEach(1...5, id: \.self) { star in
                            Button {
                                rating = star
                            } label: {
                                Image(systemName: star <= rating ? "star.fill" : "star")
                                    .font(.title2)
                                    .foregroundStyle(.yellow)
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer()
                        Text("\(rating)/5")
                            .foregroundStyle(.secondary)
                    }
                }
                Section("review.comment".loc) {
                    TextEditor(text: $comment)
                        .frame(minHeight: 100)
                }
                if existingReview != nil {
                    Section {
                        Text("review.edit_hint".loc)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(existingReview != nil ? "review.edit".loc : "provider.write_review".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("review.submit".loc) {
                        Task { await submitReview() }
                    }
                    .disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK") { }
            } message: {
                Text(errorText)
            }
            .onAppear {
                if let existing = existingReview {
                    rating = existing.rating
                    comment = existing.comment
                }
            }
        }
    }

    private func submitReview() async {
        guard let userId = authService.currentUser?.id else {
            errorText = "Bitte zuerst anmelden"
            showError = true
            return
        }

        isSaving = true
        let trimmedComment = comment.trimmingCharacters(in: .whitespacesAndNewlines)

        let success = await reviewService.submitReview(
            service_provider_id: providerId,
            userId: userId,
            rating: rating,
            comment: trimmedComment
        )

        isSaving = false

        if success {
            dismiss()
        } else {
            errorText = reviewService.errorMessage ?? "Unbekannter Fehler"
            showError = true
        }
    }
}

// MARK: - Review Row View (einzelne Bewertung in der Liste)
struct ReviewRowView: View {
    let review: Review
    let isOwn: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                // Sterne
                HStack(spacing: 2) {
                    ForEach(1...5, id: \.self) { star in
                        Image(systemName: star <= review.rating ? "star.fill" : "star")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                    }
                }

                Spacer()

                // Datum
                if let date = review.createdAt {
                    Text(date, style: .date)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Kommentar
            Text(review.comment)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            if isOwn {
                Text("review.own".loc)
                    .font(.caption2)
                    .foregroundStyle(.blue)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(4)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(isOwn ? Color.blue.opacity(0.04) : Color(.systemGray6))
        .cornerRadius(8)
    }
}

// MARK: - Favorite Provider Card (used by POIScreen)
struct FavoriteProviderCard: Identifiable {
    let id: UUID
    let name: String
    let addressLine: String?
    let phone: String?
    let email: String?
    let website: String?
    let category: String
    let logoUrl: String?
    let updatedAt: Date
}
