//
//  CategoryChipView.swift
//  BoatCare
//
//  Category chip / pill for horizontal scrolling
//

import SwiftUI

struct CategoryChipView: View {
    let category: ProductCategory
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: category.sfSymbol)
                    .font(.caption)
                Text(category.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? AppColors.primary : AppColors.gray100)
            .foregroundStyle(isSelected ? .white : AppColors.gray700)
            .clipShape(Capsule())
        }
    }
}

struct StatusBadgeView: View {
    let status: String

    var body: some View {
        Text(AppColors.statusLabel(for: status))
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(AppColors.statusColor(for: status))
            .clipShape(Capsule())
    }
}

struct QuantityStepperView: View {
    @Binding var quantity: Int
    let minimum: Int
    let maximum: Int

    var body: some View {
        HStack(spacing: 12) {
            Button {
                if quantity > minimum {
                    quantity -= 1
                }
            } label: {
                Image(systemName: "minus.circle.fill")
                    .font(.title3)
                    .foregroundStyle(quantity > minimum ? AppColors.primary : AppColors.gray300)
            }
            .disabled(quantity <= minimum)

            Text("\(quantity)")
                .font(.headline)
                .frame(minWidth: 30)

            Button {
                if quantity < maximum {
                    quantity += 1
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title3)
                    .foregroundStyle(quantity < maximum ? AppColors.primary : AppColors.gray300)
            }
            .disabled(quantity >= maximum)
        }
    }
}
